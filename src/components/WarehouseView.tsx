import React, { useState, useEffect } from 'react';
import { 
  Archive, 
  Trash2, 
  Search, 
  RefreshCw, 
  Filter, 
  Camera, 
  Server, 
  Cpu, 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle, 
  ArrowRight,
  ExternalLink,
  Wrench,
  Clock,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Camara, Equipo, EstadoCicloVida } from '../types/database';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface WarehouseItem {
  id: string;
  codigo: string;
  itemType: 'camara' | 'equipo';
  tipo: string;
  marca?: string | null;
  modelo?: string | null;
  numero_serie?: string | null;
  estado_ciclo_vida: EstadoCicloVida;
  created_at?: string;
  fecha_instalacion?: string | null;
  rawItem: Camara | Equipo;
}

interface WarehouseViewProps {
  onSelectCamera?: (cam: Camara) => void;
  onNavigateToMaintenance?: (cam: Camara) => void;
}

export const WarehouseView: React.FC<WarehouseViewProps> = ({
  onSelectCamera,
  onNavigateToMaintenance,
}) => {
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEstado, setFilterEstado] = useState<'all' | EstadoCicloVida>('all');
  const [filterTipo, setFilterTipo] = useState<'all' | 'camara' | 'equipo'>('all');

  // Delete modal state
  const [itemToDelete, setItemToDelete] = useState<WarehouseItem | null>(null);

  // Status Change modal state
  const [itemToUpdate, setItemToUpdate] = useState<WarehouseItem | null>(null);
  const [newTargetState, setNewTargetState] = useState<EstadoCicloVida>('en_bodega');
  const [stateChangeNotes, setStateChangeNotes] = useState('');
  const [updatingState, setUpdatingState] = useState(false);

  const loadWarehouseData = async () => {
    try {
      setLoading(true);
      const [camsRes, eqsRes] = await Promise.all([
        supabase
          .from('camaras')
          .select('*, marca_rel:marcas(*), modelo_rel:modelos(*)')
          .neq('estado_ciclo_vida', 'instalado'),
        supabase
          .from('equipos')
          .select('*, marca_rel:marcas(*), modelo_rel:modelos(*)')
          .neq('estado_ciclo_vida', 'instalado'),
      ]);

      const warehouseCams: WarehouseItem[] = (camsRes.data || []).map(cam => ({
        id: cam.id,
        codigo: cam.codigo,
        itemType: 'camara',
        tipo: cam.tipo_camara || cam.tipo_dispositivo || 'Cámara',
        marca: (cam as any).marca_rel?.nombre || cam.marca,
        modelo: (cam as any).modelo_rel?.nombre || cam.modelo,
        numero_serie: cam.numero_serie,
        estado_ciclo_vida: cam.estado_ciclo_vida || 'retirado_pendiente_bodega',
        created_at: cam.created_at,
        fecha_instalacion: cam.fecha_instalacion,
        rawItem: cam,
      }));

      const warehouseEqs: WarehouseItem[] = (eqsRes.data || []).map(eq => ({
        id: eq.id,
        codigo: eq.codigo,
        itemType: 'equipo',
        tipo: eq.tipo,
        marca: (eq as any).marca_rel?.nombre || eq.marca,
        modelo: (eq as any).modelo_rel?.nombre || eq.modelo,
        numero_serie: eq.numero_serie,
        estado_ciclo_vida: eq.estado_ciclo_vida || 'retirado_pendiente_bodega',
        created_at: eq.created_at,
        fecha_instalacion: eq.fecha_instalacion,
        rawItem: eq,
      }));

      setItems([...warehouseCams, ...warehouseEqs]);
    } catch (err) {
      console.error('Error loading warehouse items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWarehouseData();
  }, []);

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToUpdate) return;
    try {
      setUpdatingState(true);
      const table = itemToUpdate.itemType === 'camara' ? 'camaras' : 'equipos';
      const payload: any = {
        estado_ciclo_vida: newTargetState,
      };

      // If moved back to instalado or between warehouse states, update table
      if (newTargetState !== 'instalado') {
        if (itemToUpdate.itemType === 'camara') {
          payload.rack_id = null;
          payload.patch_panel_id = null;
          payload.puerto_patch = null;
          payload.switch_id = null;
          payload.puerto_switch = null;
          payload.nvr_id = null;
          payload.canal_nvr = null;
        } else {
          payload.rack_id = null;
          payload.posicion_u_inicio = null;
          payload.posicion_u_fin = null;
        }
      }

      const { error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', itemToUpdate.id);

      if (error) throw error;

      // Add to maintenance log
      const logDesc = `[GESTIÓN BODEGA/BAJAS] Estado actualizado de '${itemToUpdate.estado_ciclo_vida}' a '${newTargetState}'. ` +
        (stateChangeNotes.trim() ? `Observaciones: ${stateChangeNotes.trim()}` : '');

      await supabase.from('historial_mantenimiento').insert([{
        entidad_tipo: itemToUpdate.itemType,
        entidad_id: itemToUpdate.id,
        tipo_intervencion: 'recambio',
        fecha: new Date().toISOString(),
        tecnico_responsable: 'Bodega / Logística',
        descripcion: logDesc,
      }]);

      setItemToUpdate(null);
      setStateChangeNotes('');
      await loadWarehouseData();
    } catch (err: any) {
      console.error('Error updating status:', err);
      alert('Error al actualizar estado: ' + (err.message || String(err)));
    } finally {
      setUpdatingState(false);
    }
  };

  // Counts
  const countPendiente = items.filter(i => i.estado_ciclo_vida === 'retirado_pendiente_bodega').length;
  const countEnBodega = items.filter(i => i.estado_ciclo_vida === 'en_bodega').length;
  const countBaja = items.filter(i => i.estado_ciclo_vida === 'dado_de_baja').length;

  // Filtered
  const filteredItems = items.filter(item => {
    if (filterEstado !== 'all' && item.estado_ciclo_vida !== filterEstado) return false;
    if (filterTipo !== 'all' && item.itemType !== filterTipo) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCod = item.codigo.toLowerCase().includes(q);
      const matchMarca = item.marca?.toLowerCase().includes(q);
      const matchModelo = item.modelo?.toLowerCase().includes(q);
      const matchSerie = item.numero_serie?.toLowerCase().includes(q);
      const matchTipo = item.tipo.toLowerCase().includes(q);
      if (!matchCod && !matchMarca && !matchModelo && !matchSerie && !matchTipo) return false;
    }
    return true;
  });

  const getStatusBadge = (estado: EstadoCicloVida) => {
    switch (estado) {
      case 'retirado_pendiente_bodega':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
            <Clock className="w-3 h-3 text-amber-700" />
            <span>Retirado · Pendiente Bodega</span>
          </span>
        );
      case 'en_bodega':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-900 border border-blue-300">
            <Archive className="w-3 h-3 text-blue-700" />
            <span>En Bodega / Almacén</span>
          </span>
        );
      case 'dado_de_baja':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-900 border border-rose-300">
            <ShieldAlert className="w-3 h-3 text-rose-700" />
            <span>Dado de Baja Definitiva</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            {estado}
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono border-b border-slate-200 pb-2 text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <Archive className="w-3.5 h-3.5 text-amber-600" />
          <span>Almacén Central &gt; Dispositivos Fuera de Operación Activa &gt; <strong className="text-slate-800">Bodega / Bajas</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span>Total en Gestión: <strong>{items.length}</strong></span>
          <span>•</span>
          <button 
            onClick={loadWarehouseData} 
            className="hover:text-blue-600 flex items-center gap-1 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Main Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono text-amber-700 font-semibold tracking-wider uppercase mb-1">
            CONTROL DE CICLO DE VIDA · DISPOSITIVOS RETIRADOS & BAJAS
          </div>
          <h1 className="text-2xl font-bold font-mono text-slate-900 tracking-tight flex items-center gap-2.5">
            <Archive className="w-6 h-6 text-amber-600" />
            <span>Bodega / Bajas</span>
          </h1>
          <p className="text-xs text-slate-600 mt-1 font-medium">
            Gestión de cámaras y equipos retirados de servicio, resguardados en almacén o dados de baja. Los dispositivos aquí listados no ocupan puertos ni espacio en racks activos.
          </p>
        </div>

        {/* Quick status counters */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setFilterEstado('retirado_pendiente_bodega')}
            className={`px-3 py-2 rounded-lg border text-left transition-all ${
              filterEstado === 'retirado_pendiente_bodega'
                ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold shadow-xs'
                : 'bg-amber-50/70 border-amber-200 text-amber-900 hover:bg-amber-100/70'
            }`}
          >
            <div className="text-[10px] uppercase text-amber-700">Pendiente Bodega</div>
            <div className="text-lg font-bold">{countPendiente}</div>
          </button>

          <button
            onClick={() => setFilterEstado('en_bodega')}
            className={`px-3 py-2 rounded-lg border text-left transition-all ${
              filterEstado === 'en_bodega'
                ? 'bg-blue-100 border-blue-400 text-blue-950 font-bold shadow-xs'
                : 'bg-blue-50/70 border-blue-200 text-blue-900 hover:bg-blue-100/70'
            }`}
          >
            <div className="text-[10px] uppercase text-blue-700">En Bodega</div>
            <div className="text-lg font-bold">{countEnBodega}</div>
          </button>

          <button
            onClick={() => setFilterEstado('dado_de_baja')}
            className={`px-3 py-2 rounded-lg border text-left transition-all ${
              filterEstado === 'dado_de_baja'
                ? 'bg-rose-100 border-rose-400 text-rose-950 font-bold shadow-xs'
                : 'bg-rose-50/70 border-rose-200 text-rose-900 hover:bg-rose-100/70'
            }`}
          >
            <div className="text-[10px] uppercase text-rose-700">Dado de Baja</div>
            <div className="text-lg font-bold">{countBaja}</div>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3 font-mono text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search box */}
          <div className="lg:col-span-2">
            <label className="block text-[10px] uppercase text-slate-500 mb-1">Buscar por Código, Serie o Modelo</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ej. CAM-01, SW-02, Hikvision, etc..."
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded bg-white text-xs focus:ring-1 focus:ring-blue-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Filter by Estado */}
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">Filtrar por Estado de Ciclo</label>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as any)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs focus:ring-1 focus:ring-blue-600"
            >
              <option value="all">Todos los Estados ({items.length})</option>
              <option value="retirado_pendiente_bodega">Retirado · Pendiente Bodega ({countPendiente})</option>
              <option value="en_bodega">En Bodega ({countEnBodega})</option>
              <option value="dado_de_baja">Dado de Baja ({countBaja})</option>
            </select>
          </div>

          {/* Filter by Tipo de Dispositivo */}
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">Filtrar por Tipo</label>
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value as any)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs focus:ring-1 focus:ring-blue-600"
            >
              <option value="all">Cámaras y Equipos</option>
              <option value="camara">Solo Cámaras</option>
              <option value="equipo">Solo Equipos de Rack</option>
            </select>
          </div>
        </div>

        {/* Active filter pills */}
        {(filterEstado !== 'all' || filterTipo !== 'all' || searchQuery.trim()) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-[11px]">
            <span className="text-slate-500">Filtros activos:</span>
            {filterEstado !== 'all' && (
              <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded flex items-center gap-1">
                Estado: {filterEstado.replace(/_/g, ' ')}
                <button onClick={() => setFilterEstado('all')} className="hover:text-amber-950 font-bold ml-1">✕</button>
              </span>
            )}
            {filterTipo !== 'all' && (
              <span className="bg-blue-100 text-blue-900 border border-blue-300 px-2 py-0.5 rounded flex items-center gap-1">
                Tipo: {filterTipo === 'camara' ? 'Cámaras' : 'Equipos de Rack'}
                <button onClick={() => setFilterTipo('all')} className="hover:text-blue-950 font-bold ml-1">✕</button>
              </span>
            )}
            {searchQuery.trim() && (
              <span className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded flex items-center gap-1">
                Búsqueda: "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:text-slate-950 font-bold ml-1">✕</button>
              </span>
            )}
            <button
              onClick={() => {
                setFilterEstado('all');
                setFilterTipo('all');
                setSearchQuery('');
              }}
              className="text-blue-600 hover:underline text-[11px] ml-auto font-medium"
            >
              Limpiar todos los filtros
            </button>
          </div>
        )}
      </div>

      {/* Table of items */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden font-mono text-xs">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Inventario en Bodega / Bajas</span>
            <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
              {filteredItems.length} registros
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            Haga clic en <strong>Eliminar Definitivamente</strong> para purgar registros de prueba o duplicados
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
            <p>Cargando dispositivos en bodega / bajas...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Archive className="w-12 h-12 mx-auto text-slate-300" />
            <div>
              <p className="font-bold text-slate-700 text-sm">No hay elementos en bodega</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Actualmente no existen cámaras ni equipos de rack retirados de operación. Cuando realices un retiro temporal por mantención o baja definitiva, los dispositivos aparecerán registrados en esta bandeja.
              </p>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Archive className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-medium text-slate-600">No se encontraron dispositivos en Bodega / Bajas con los filtros actuales.</p>
            <p className="text-[11px]">Intente cambiar los criterios de búsqueda o limpiar los filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase">
                <tr>
                  <th className="py-3 px-3">Código</th>
                  <th className="py-3 px-3">Clase</th>
                  <th className="py-3 px-3">Tipo / Subtipo</th>
                  <th className="py-3 px-3">Marca / Modelo</th>
                  <th className="py-3 px-3">N° de Serie</th>
                  <th className="py-3 px-3">Estado de Ciclo</th>
                  <th className="py-3 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr key={`${item.itemType}-${item.id}`} className="hover:bg-slate-50 transition-colors">
                    {/* Código */}
                    <td className="py-3 px-3">
                      <div className="font-bold text-blue-700 flex items-center gap-1.5">
                        {item.itemType === 'camara' ? (
                          <Camera className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        ) : (
                          <Server className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        )}
                        <span>{item.codigo}</span>
                      </div>
                    </td>

                    {/* Clase */}
                    <td className="py-3 px-3 text-slate-600">
                      <span className="text-[11px] uppercase font-semibold">
                        {item.itemType === 'camara' ? 'Cámara' : 'Equipo Rack'}
                      </span>
                    </td>

                    {/* Tipo / Subtipo */}
                    <td className="py-3 px-3">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold uppercase">
                        {item.tipo}
                      </span>
                    </td>

                    {/* Marca / Modelo */}
                    <td className="py-3 px-3 text-slate-800">
                      <div>
                        <span className="font-semibold">{item.marca || 'Genérica'}</span>
                        {item.modelo && <span className="text-slate-500 block text-[10px]">{item.modelo}</span>}
                      </div>
                    </td>

                    {/* N° Serie */}
                    <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                      {item.numero_serie || '—'}
                    </td>

                    {/* Estado de Ciclo */}
                    <td className="py-3 px-3">
                      {getStatusBadge(item.estado_ciclo_vida)}
                    </td>

                    {/* Acciones */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Cambiar Estado */}
                        <button
                          type="button"
                          onClick={() => {
                            setItemToUpdate(item);
                            setNewTargetState(item.estado_ciclo_vida);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-[11px] font-medium transition-colors"
                          title="Cambiar estado de ciclo de vida"
                        >
                          Cambiar Estado
                        </button>

                        {/* Si es cámara, opción de ver ficha */}
                        {item.itemType === 'camara' && onSelectCamera && (
                          <button
                            type="button"
                            onClick={() => onSelectCamera(item.rawItem as Camara)}
                            className="p-1 hover:bg-blue-50 text-blue-600 border border-slate-200 rounded transition-colors"
                            title="Ver Ficha Técnica"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Eliminar Definitivamente (Acción B de Req 3) */}
                        <button
                          type="button"
                          onClick={() => setItemToDelete(item)}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs"
                          title="Eliminar permanentemente de la base de datos (para registros de prueba o duplicados)"
                        >
                          <Trash2 className="w-3 h-3 text-red-600" />
                          <span>Eliminar Definitivamente</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Eliminar Definitivamente (con confirmación de código) */}
      {itemToDelete && (
        <DeleteConfirmModal
          isOpen={Boolean(itemToDelete)}
          onClose={() => setItemToDelete(null)}
          itemType={itemToDelete.itemType}
          itemId={itemToDelete.id}
          itemCode={itemToDelete.codigo}
          onSuccess={async () => {
            setItemToDelete(null);
            await loadWarehouseData();
          }}
        />
      )}

      {/* MODAL: Cambiar Estado de Ciclo de Vida */}
      {itemToUpdate && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-mono text-xs"
          >
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <Archive className="w-4 h-4 text-blue-600" />
                <span>Actualizar Estado: {itemToUpdate.codigo}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setItemToUpdate(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateStatus} className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                  Nuevo Estado de Ciclo de Vida *
                </label>
                <select
                  value={newTargetState}
                  onChange={(e) => setNewTargetState(e.target.value as EstadoCicloVida)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-semibold"
                >
                  <option value="retirado_pendiente_bodega">Retirado - Pendiente de traslado a bodega</option>
                  <option value="en_bodega">En Bodega - Almacén central de repuestos</option>
                  <option value="dado_de_baja">Dado de Baja definitiva - Desecho / reciclaje</option>
                  <option value="instalado">Reincorporar a Terreno (Instalado)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  {newTargetState === 'instalado'
                    ? '⚠️ Al reincorporar como instalado, deberá asignarle nueva ubicación y conexión física.'
                    : 'El equipo se mantendrá en custodia en bodega/almacén.'}
                </p>
              </div>

              <div>
                <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                  Observaciones / Motivo del Cambio
                </label>
                <textarea
                  rows={3}
                  value={stateChangeNotes}
                  onChange={(e) => setStateChangeNotes(e.target.value)}
                  placeholder="ej. Traslado completado a estantería B-04 de almacén central..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setItemToUpdate(null)}
                  className="px-4 py-1.5 border border-slate-300 rounded hover:bg-slate-50 text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updatingState}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold shadow-xs disabled:opacity-50"
                >
                  {updatingState ? 'Guardando...' : 'Guardar Estado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
