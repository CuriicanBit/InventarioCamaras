import React, { useState, useEffect } from 'react';
import { 
  Inbox, 
  Server, 
  Camera, 
  Cpu, 
  MapPin, 
  RefreshCw, 
  Search, 
  Check, 
  AlertCircle, 
  ArrowRight, 
  X, 
  Layers, 
  Building2,
  HardDrive
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Sede, Campus, Edificio, Piso, Rack, Equipo, Camara } from '../types/database';

export interface UnassignedViewItem {
  id: string;
  tipo: 'rack' | 'equipo' | 'camara';
  codigo: string;
}

interface EnrichedUnassignedItem extends UnassignedViewItem {
  details?: {
    marca?: string | null;
    modelo?: string | null;
    ip?: string | null;
    mac?: string | null;
    altura_u?: number | null;
    subtipo?: string | null;
    ubicacion_especifica?: string | null;
    created_at?: string;
  };
}

interface UnassignedItemsProps {
  onNavigateToRack?: (rack: Rack) => void;
  onNavigateToCamera?: (cam: Camara) => void;
  onNavigateToTree?: () => void;
  onReassigned?: () => void;
}

export const UnassignedItems: React.FC<UnassignedItemsProps> = ({
  onNavigateToRack,
  onNavigateToCamera,
  onNavigateToTree,
  onReassigned,
}) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EnrichedUnassignedItem[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'todos' | 'rack' | 'equipo' | 'camara'>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Location lookups for reassignment
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [campusList, setCampusList] = useState<Campus[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);

  // Reassignment Modal state
  const [reassignModalItem, setReassignModalItem] = useState<EnrichedUnassignedItem | null>(null);
  const [targetSedeId, setTargetSedeId] = useState('');
  const [targetCampusId, setTargetCampusId] = useState('');
  const [targetEdificioId, setTargetEdificioId] = useState('');
  const [targetPisoId, setTargetPisoId] = useState('');
  const [targetRackId, setTargetRackId] = useState('');
  const [targetPosicionU, setTargetPosicionU] = useState<number>(1);
  const [savingReassign, setSavingReassign] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const fetchUnassignedData = async () => {
    try {
      setLoading(true);

      // 1. Fetch raw view from Supabase
      const { data: vData, error: vErr } = await supabase.from('v_sin_asignar').select('*');
      if (vErr) throw vErr;

      const rawItems: UnassignedViewItem[] = vData || [];

      // 2. Fetch lookups for reassignment & item enrichment
      const [
        { data: sData },
        { data: cData },
        { data: eData },
        { data: pData },
        { data: rData },
        { data: allRacks },
        { data: allEquipos },
        { data: allCamaras },
      ] = await Promise.all([
        supabase.from('sedes').select('*').order('nombre'),
        supabase.from('campus').select('*').order('nombre'),
        supabase.from('edificios').select('*').order('nombre'),
        supabase.from('pisos').select('*').order('nombre'),
        supabase.from('racks').select('*').order('codigo'),
        supabase.from('racks').select('*'),
        supabase.from('equipos').select('*'),
        supabase.from('camaras').select('*'),
      ]);

      setSedes(sData || []);
      setCampusList(cData || []);
      setEdificios(eData || []);
      setPisos(pData || []);
      setRacks(rData || []);

      // 3. Enrich items with hardware details
      const rackMap = new Map((allRacks || []).map(r => [r.id, r]));
      const eqMap = new Map((allEquipos || []).map(e => [e.id, e]));
      const camMap = new Map((allCamaras || []).map(c => [c.id, c]));

      const enriched: EnrichedUnassignedItem[] = rawItems.map(item => {
        let details: EnrichedUnassignedItem['details'] = {};

        if (item.tipo === 'rack') {
          const r = rackMap.get(item.id);
          if (r) {
            details = {
              altura_u: r.altura_u,
              subtipo: r.formato || 'Rack de Telecomunicaciones',
              ubicacion_especifica: r.ubicacion_especifica,
              created_at: r.created_at,
            };
          }
        } else if (item.tipo === 'equipo') {
          const eq = eqMap.get(item.id);
          if (eq) {
            details = {
              marca: eq.marca,
              modelo: eq.modelo,
              subtipo: eq.tipo,
              ip: eq.ip_gestion,
              created_at: eq.created_at,
            };
          }
        } else if (item.tipo === 'camara') {
          const cam = camMap.get(item.id);
          if (cam) {
            details = {
              marca: cam.marca,
              modelo: cam.modelo,
              subtipo: cam.tipo_dispositivo,
              ip: cam.direccion_ip,
              mac: cam.direccion_mac,
              ubicacion_especifica: cam.ubicacion_especifica,
              created_at: cam.created_at,
            };
          }
        }

        return { ...item, details };
      });

      setItems(enriched);
    } catch (err) {
      console.error('Error fetching unassigned items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnassignedData();
  }, []);

  // Filtered items
  const filteredItems = items.filter(item => {
    if (selectedFilter !== 'todos' && item.tipo !== selectedFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchCode = item.codigo.toLowerCase().includes(q);
      const matchBrand = item.details?.marca?.toLowerCase().includes(q);
      const matchModel = item.details?.modelo?.toLowerCase().includes(q);
      const matchIp = item.details?.ip?.toLowerCase().includes(q);
      return matchCode || matchBrand || matchModel || matchIp;
    }
    return true;
  });

  const countRacks = items.filter(i => i.tipo === 'rack').length;
  const countEquipos = items.filter(i => i.tipo === 'equipo').length;
  const countCamaras = items.filter(i => i.tipo === 'camara').length;

  // Open Reassign Modal
  const openReassignModal = (item: EnrichedUnassignedItem) => {
    setReassignModalItem(item);
    setReassignError(null);

    // Set initial target selections
    if (sedes.length > 0) setTargetSedeId(sedes[0].id);
    const initialCampus = campusList.find(c => c.sede_id === sedes[0]?.id) || campusList[0];
    if (initialCampus) setTargetCampusId(initialCampus.id);
    const initialEdif = edificios.find(e => e.campus_id === initialCampus?.id) || edificios[0];
    if (initialEdif) setTargetEdificioId(initialEdif.id);
    const initialPiso = pisos.find(p => p.edificio_id === initialEdif?.id) || pisos[0];
    if (initialPiso) setTargetPisoId(initialPiso.id);

    // Initial rack
    if (racks.length > 0) setTargetRackId(racks[0].id);
    setTargetPosicionU(1);
  };

  const handleSedeChangeInModal = (sedeId: string) => {
    setTargetSedeId(sedeId);
    const subCampus = campusList.filter(c => c.sede_id === sedeId);
    if (subCampus.length > 0) {
      handleCampusChangeInModal(subCampus[0].id);
    } else {
      setTargetCampusId('');
      setTargetEdificioId('');
      setTargetPisoId('');
    }
  };

  const handleCampusChangeInModal = (campusId: string) => {
    setTargetCampusId(campusId);
    const subEdif = edificios.filter(e => e.campus_id === campusId);
    if (subEdif.length > 0) {
      handleEdificioChangeInModal(subEdif[0].id);
    } else {
      setTargetEdificioId('');
      setTargetPisoId('');
    }
  };

  const handleEdificioChangeInModal = (edifId: string) => {
    setTargetEdificioId(edifId);
    const subPisos = pisos.filter(p => p.edificio_id === edifId);
    if (subPisos.length > 0) {
      setTargetPisoId(subPisos[0].id);
    } else {
      setTargetPisoId('');
    }
  };

  // Submit Reassignment
  const handleSaveReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignModalItem) return;

    setSavingReassign(true);
    setReassignError(null);

    try {
      if (reassignModalItem.tipo === 'rack') {
        if (!targetPisoId) {
          throw new Error('Debe seleccionar un piso de destino para el rack.');
        }
        const { error } = await supabase
          .from('racks')
          .update({ piso_id: targetPisoId })
          .eq('id', reassignModalItem.id);
        if (error) throw error;
      } else if (reassignModalItem.tipo === 'camara') {
        if (!targetPisoId) {
          throw new Error('Debe seleccionar un piso de ubicación física para la cámara.');
        }
        const { error } = await supabase
          .from('camaras')
          .update({ 
            piso_id: targetPisoId,
            rack_id: targetRackId || null 
          })
          .eq('id', reassignModalItem.id);
        if (error) throw error;
      } else if (reassignModalItem.tipo === 'equipo') {
        if (!targetRackId) {
          throw new Error('Debe seleccionar un rack de montaje para el equipo.');
        }
        const { error } = await supabase
          .from('equipos')
          .update({ 
            rack_id: targetRackId,
            posicion_u_inicio: targetPosicionU || null 
          })
          .eq('id', reassignModalItem.id);
        if (error) throw error;
      }

      setSuccessToast(`Elemento "${reassignModalItem.codigo}" reasignado exitosamente.`);
      setTimeout(() => setSuccessToast(null), 4000);
      setReassignModalItem(null);
      await fetchUnassignedData();
      if (onReassigned) onReassigned();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Error reassigning item:', err);
      setReassignError(msg || 'No fue posible guardar la reasignación');
    } finally {
      setSavingReassign(false);
    }
  };

  const modalCampus = campusList.filter(c => c.sede_id === targetSedeId);
  const modalEdificios = edificios.filter(e => e.campus_id === targetCampusId);
  const modalPisos = pisos.filter(p => p.edificio_id === targetEdificioId);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono border-b border-slate-200 pb-2 text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span>Vista de Recuperación y Organización &gt; <strong className="text-slate-800">Elementos Sin Asignar (v_sin_asignar)</strong></span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-amber-700 font-semibold flex items-center gap-1">
            <Inbox className="w-3.5 h-3.5" />
            <span>{items.length} Elementos Huérfanos / Desvinculados</span>
          </span>
          <span>•</span>
          <button 
            onClick={fetchUnassignedData}
            className="hover:text-blue-600 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-mono uppercase text-amber-700 font-bold tracking-wider">
              BANDEJA DE ENTRADA Y REASIGNACIÓN TÉCNICA
            </span>
          </div>
          <h1 className="text-xl font-bold font-mono text-slate-900 tracking-tight flex items-center gap-2">
            <span>Inventario Sin Asignar</span>
            <span className="text-xs font-mono font-medium px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded">
              {items.length} pendientes
            </span>
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl">
            Racks, equipos y cámaras que perdieron su contenedor padre al eliminarse una sede, campus, edificio o piso. Todos sus datos técnicos y códigos están preservados de forma segura para reubicarlos en la infraestructura activa.
          </p>
        </div>

        {onNavigateToTree && (
          <button
            onClick={onNavigateToTree}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium font-mono shrink-0 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>Volver al Explorador Físico</span>
          </button>
        )}
      </div>

      {/* Success Toast */}
      {successToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between font-mono animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
        {/* Type Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedFilter('todos')}
            className={`px-3 py-1.5 rounded transition-all ${
              selectedFilter === 'todos'
                ? 'bg-slate-900 text-white font-semibold shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({items.length})
          </button>
          <button
            onClick={() => setSelectedFilter('rack')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded transition-all ${
              selectedFilter === 'rack'
                ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Racks ({countRacks})</span>
          </button>
          <button
            onClick={() => setSelectedFilter('equipo')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded transition-all ${
              selectedFilter === 'equipo'
                ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Equipos ({countEquipos})</span>
          </button>
          <button
            onClick={() => setSelectedFilter('camara')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded transition-all ${
              selectedFilter === 'camara'
                ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Cámaras ({countCamaras})</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código, marca, modelo, IP..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Items List */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-500 font-mono flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span>Consultando vista v_sin_asignar en Supabase...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center text-slate-500 font-mono space-y-2">
            <Inbox className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No hay elementos sin asignar</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {searchQuery
                ? 'No se encontraron resultados para la búsqueda ingresada.'
                : 'Toda la infraestructura (Racks, Equipos y Cámaras) está actualmente asociada a una ubicación física en el árbol.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Especificación Técnica</th>
                  <th className="py-3 px-4">Red / Gestión</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  return (
                    <tr key={`${item.tipo}-${item.id}`} className="hover:bg-slate-50/80 transition-colors">
                      {/* Tipo */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold ${
                          item.tipo === 'rack'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : item.tipo === 'equipo'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {item.tipo === 'rack' && <Server className="w-3 h-3" />}
                          {item.tipo === 'equipo' && <Cpu className="w-3 h-3" />}
                          {item.tipo === 'camara' && <Camera className="w-3 h-3" />}
                          <span className="capitalize">{item.tipo}</span>
                        </span>
                      </td>

                      {/* Código */}
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {item.codigo}
                      </td>

                      {/* Especificación Técnica */}
                      <td className="py-3 px-4 text-slate-600">
                        {item.tipo === 'rack' && (
                          <span>Gabinete {item.details?.altura_u || 42}U · {item.details?.subtipo || 'EIA-310-D'}</span>
                        )}
                        {item.tipo === 'equipo' && (
                          <span>{item.details?.marca || '-'} {item.details?.modelo || ''} ({item.details?.subtipo?.replace('_', ' ') || 'activo'})</span>
                        )}
                        {item.tipo === 'camara' && (
                          <span>{item.details?.marca || 'CCTV'} {item.details?.modelo || ''} · Tipo: {item.details?.subtipo || 'Domo'}</span>
                        )}
                      </td>

                      {/* Red / Gestión */}
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {item.details?.ip ? (
                          <span className="font-semibold text-slate-700">IP: {item.details.ip}</span>
                        ) : item.details?.mac ? (
                          <span>MAC: {item.details.mac}</span>
                        ) : (
                          <span className="text-slate-400 italic">No aplica</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          <AlertCircle className="w-3 h-3 text-amber-600" />
                          <span>
                            {item.tipo === 'rack' ? 'Sin Piso' : item.tipo === 'equipo' ? 'Sin Rack' : 'Sin Piso / Sala'}
                          </span>
                        </span>
                      </td>

                      {/* Acción */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openReassignModal(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-2xs transition-colors"
                        >
                          <MapPin className="w-3 h-3" />
                          <span>Reasignar Ubicación</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reassignment Modal */}
      {reassignModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between font-mono">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Reasignar {reassignModalItem.tipo.toUpperCase()}: {reassignModalItem.codigo}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setReassignModalItem(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reassignError && (
              <div className="p-3 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-center gap-2 font-mono">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{reassignError}</span>
              </div>
            )}

            <form onSubmit={handleSaveReassign} className="p-5 space-y-4 text-xs font-sans">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-600 font-mono text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Elemento:</span>
                  <span className="font-bold text-slate-800">{reassignModalItem.codigo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tipo:</span>
                  <span className="capitalize text-slate-800">{reassignModalItem.tipo}</span>
                </div>
                {reassignModalItem.details?.marca && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Hardware:</span>
                    <span className="text-slate-800">{reassignModalItem.details.marca} {reassignModalItem.details.modelo || ''}</span>
                  </div>
                )}
              </div>

              {/* REASSIGN RACK OR CAMERA: Physical floor cascade */}
              {(reassignModalItem.tipo === 'rack' || reassignModalItem.tipo === 'camara') && (
                <div className="space-y-3 font-mono">
                  <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wider">
                    Seleccionar Nueva Ubicación Física:
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Sede *</label>
                      <select
                        value={targetSedeId}
                        onChange={(e) => handleSedeChangeInModal(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                      >
                        {sedes.map(s => (
                          <option key={s.id} value={s.id}>{s.nombre}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Campus *</label>
                      <select
                        value={targetCampusId}
                        onChange={(e) => handleCampusChangeInModal(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                      >
                        {modalCampus.map(c => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Edificio *</label>
                      <select
                        value={targetEdificioId}
                        onChange={(e) => handleEdificioChangeInModal(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                      >
                        {modalEdificios.map(ed => (
                          <option key={ed.id} value={ed.id}>{ed.nombre}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Piso / Nivel Destino *</label>
                      <select
                        required
                        value={targetPisoId}
                        onChange={(e) => setTargetPisoId(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-bold text-blue-700 text-xs"
                      >
                        <option value="" disabled>Seleccione un piso...</option>
                        {modalPisos.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {reassignModalItem.tipo === 'camara' && (
                    <div className="pt-2">
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Rack de Cabecera (Opcional - independiente del piso):
                      </label>
                      <select
                        value={targetRackId}
                        onChange={(e) => setTargetRackId(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                      >
                        <option value="">(Sin rack de cabecera)</option>
                        {racks.map(r => {
                          const rp = pisos.find(p => p.id === r.piso_id);
                          const re = edificios.find(e => e.id === rp?.edificio_id);
                          return (
                            <option key={r.id} value={r.id}>
                              {r.codigo} — {re?.nombre || 'Edificio'} / {rp?.nombre || 'Piso'}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* REASSIGN EQUIPO: Target Rack selection */}
              {reassignModalItem.tipo === 'equipo' && (
                <div className="space-y-3 font-mono">
                  <div className="text-[11px] font-semibold text-slate-800 uppercase tracking-wider">
                    Seleccionar Rack de Destino:
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Rack / Gabinete *</label>
                    <select
                      required
                      value={targetRackId}
                      onChange={(e) => setTargetRackId(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-bold text-blue-700"
                    >
                      <option value="" disabled>Seleccione un rack...</option>
                      {racks.map(r => {
                        const rp = pisos.find(p => p.id === r.piso_id);
                        const re = edificios.find(e => e.id === rp?.edificio_id);
                        return (
                          <option key={r.id} value={r.id}>
                            {r.codigo} — {re?.nombre || 'Edificio'} / {rp?.nombre || 'Piso'} ({r.ubicacion_especifica || 'Sala IDF'})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Posición U en Rack (1-42)</label>
                    <input
                      type="number"
                      min="1"
                      max="48"
                      value={targetPosicionU}
                      onChange={(e) => setTargetPosicionU(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2 font-mono">
                <button
                  type="button"
                  onClick={() => setReassignModalItem(null)}
                  disabled={savingReassign}
                  className="px-3.5 py-1.5 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 text-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingReassign}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-2xs"
                >
                  {savingReassign ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Reasignando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirmar Reasignación</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
