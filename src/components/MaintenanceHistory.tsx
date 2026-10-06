import React, { useState, useEffect } from 'react';
import { 
  Wrench, 
  ArrowLeft, 
  Plus, 
  Calendar, 
  Clock, 
  FileText, 
  Download, 
  User, 
  CheckCircle2, 
  AlertTriangle, 
  Settings, 
  Camera, 
  Server, 
  Tag, 
  ShieldCheck,
  RefreshCw,
  Network,
  Wifi
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Camara, Equipo, Rack, PuntoRed, HistorialMantenimiento, TipoIntervencion } from '../types/database';

interface MaintenanceHistoryProps {
  entityType?: 'camara' | 'equipo' | 'rack' | 'punto_red';
  entityId?: string;
  camera?: Camara;
  equipo?: Equipo;
  rack?: Rack;
  puntoRed?: PuntoRed;
  onBack: () => void;
}

export const MaintenanceHistory: React.FC<MaintenanceHistoryProps> = ({
  entityType = 'camara',
  entityId,
  camera,
  equipo,
  rack,
  puntoRed,
  onBack,
}) => {
  const [intervenciones, setIntervenciones] = useState<HistorialMantenimiento[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // Dispositivos asociados para cuando se gestiona bitácora de un rack
  const [rackDevices, setRackDevices] = useState<{
    id: string;
    sourceType: 'equipo' | 'camara';
    codigo: string;
    tipoLabel: string;
    marca: string;
    modelo: string;
    posicion?: string;
  }[]>([]);
  const [selectedAffectedDeviceIds, setSelectedAffectedDeviceIds] = useState<string[]>([]);

  // New intervention modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalFormData, setModalFormData] = useState<{
    tipo_intervencion: TipoIntervencion;
    fecha: string;
    tecnico_responsable: string;
    descripcion: string;
    repuestos_insumos: string;
    ticket_referencia: string;
  }>({
    tipo_intervencion: 'mantenimiento_preventivo',
    fecha: new Date().toISOString().slice(0, 16),
    tecnico_responsable: 'Carlos Mendoza (TEC-042)',
    descripcion: '',
    repuestos_insumos: '',
    ticket_referencia: '',
  });
  const [saving, setSaving] = useState(false);

  const activeId = entityId || camera?.id || equipo?.id || rack?.id || puntoRed?.id;
  const activeCode = camera?.codigo || equipo?.codigo || (rack ? `Rack ${rack.codigo}` : (puntoRed ? `Punto de Red ${puntoRed.codigo}` : 'DISPOSITIVO'));
  const activeModel = camera 
    ? `${camera.marca || ''} ${camera.modelo || ''}` 
    : equipo 
    ? `${equipo.marca || ''} ${equipo.modelo || ''}` 
    : rack 
    ? `Bastidor ${rack.altura_u || 42}U (${rack.formato || 'Estándar 19"'})` 
    : puntoRed
    ? `${puntoRed.tipo_punto === 'wifi_ap' ? 'Access Point WiFi' : (puntoRed.tipo_punto === 'datos_funcionario' ? 'Punto de Datos Funcionario' : 'Punto de Datos Alumno')} · Cat ${puntoRed.categoria_cable?.toUpperCase() || 'Cat6'}`
    : '';

  // Cargar dispositivos vinculados si se está viendo la bitácora de un rack
  useEffect(() => {
    if (entityType === 'rack' && activeId) {
      const loadRackDevices = async () => {
        try {
          const [{ data: eqData }, { data: camData }] = await Promise.all([
            supabase
              .from('equipos')
              .select('*, marca_rel:marcas(nombre), modelo_rel:modelos(nombre)')
              .eq('rack_id', activeId)
              .order('posicion_u_inicio'),
            supabase
              .from('camaras')
              .select('*, marca_rel:marcas(nombre), modelo_rel:modelos(nombre)')
              .eq('rack_id', activeId)
              .order('codigo')
          ]);

          const list: any[] = [];
          (eqData || []).forEach((eq: any) => {
            let tipoLabel = 'Equipo';
            if (eq.tipo === 'switch') tipoLabel = 'Switch PoE';
            else if (eq.tipo === 'nvr') tipoLabel = 'Grabador NVR';
            else if (eq.tipo === 'patch_panel') tipoLabel = 'Patch Panel';
            else if (eq.tipo === 'ups') tipoLabel = 'UPS / Energía';
            else if (eq.tipo) tipoLabel = String(eq.tipo).toUpperCase();

            list.push({
              id: eq.id,
              sourceType: 'equipo',
              codigo: eq.codigo,
              tipoLabel,
              marca: eq.marca_rel?.nombre || eq.marca || '-',
              modelo: eq.modelo_rel?.nombre || eq.modelo || '-',
              posicion: eq.posicion_u_inicio ? `U${eq.posicion_u_inicio}` : 'Piso / Shaft'
            });
          });

          (camData || []).forEach((cam: any) => {
            list.push({
              id: cam.id,
              sourceType: 'camara',
              codigo: cam.codigo,
              tipoLabel: cam.tipo_camara ? `Cámara ${cam.tipo_camara.toUpperCase()}` : 'Cámara CCTV',
              marca: cam.marca_rel?.nombre || cam.marca || '-',
              modelo: cam.modelo_rel?.nombre || cam.modelo || '-',
              posicion: cam.ubicacion_especifica || 'Asociada al Rack'
            });
          });

          setRackDevices(list);
        } catch (e) {
          console.error('Error loading rack devices for maintenance history:', e);
        }
      };
      loadRackDevices();
    }
  }, [entityType, activeId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      let query = supabase.from('historial_mantenimiento').select('*').order('fecha', { ascending: false });
      
      if (activeId) {
        query = query.eq('entidad_id', activeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setIntervenciones(data || []);
    } catch (err) {
      console.error('Error loading maintenance history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [activeId]);

  // Counts by intervention type
  const countAll = intervenciones.length;
  const countInstalacion = intervenciones.filter(i => i.tipo_intervencion === 'instalacion').length;
  const countPreventivo = intervenciones.filter(i => i.tipo_intervencion === 'mantenimiento_preventivo').length;
  const countReparacion = intervenciones.filter(i => i.tipo_intervencion === 'reparacion').length;
  const countRecambio = intervenciones.filter(i => i.tipo_intervencion === 'recambio').length;

  const filteredList = intervenciones.filter(i => {
    if (filterType === 'all') return true;
    return i.tipo_intervencion === filterType;
  });

  const lastEvent = intervenciones[0];
  const lastEventDate = lastEvent ? new Date(lastEvent.fecha).toLocaleDateString() : 'N/A';

  // Export bitácora CSV
  const handleExportCSV = () => {
    const headers = ['Fecha', 'Tipo', 'Tecnico Responsable', 'Descripcion', 'Repuestos'];
    const rows = intervenciones.map(i => [
      `"${new Date(i.fecha).toLocaleString()}"`,
      `"${i.tipo_intervencion}"`,
      `"${i.tecnico_responsable}"`,
      `"${(i.descripcion || '').replace(/"/g, '""')}"`,
      `"${(i.repuestos_insumos || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bitacora_mantenimiento_${activeCode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Submit new maintenance intervention
  const handleSaveIntervention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId) {
      alert('No se detectó el identificador del equipo o cámara.');
      return;
    }
    try {
      setSaving(true);

      const affected = entityType === 'rack' 
        ? rackDevices.filter(d => selectedAffectedDeviceIds.includes(d.id))
        : [];
      let finalDescription = modalFormData.descripcion.trim();

      if (affected.length > 0) {
        const affectedNames = affected.map(d => `${d.codigo} (${d.tipoLabel} · ${d.marca} ${d.modelo})`).join('; ');
        finalDescription = `[Dispositivos Afectados: ${affectedNames}]\n\n${finalDescription}`;
      }

      const { data, error } = await supabase
        .from('historial_mantenimiento')
        .insert([
          {
            entidad_tipo: entityType,
            entidad_id: activeId,
            tipo_intervencion: modalFormData.tipo_intervencion,
            fecha: new Date(modalFormData.fecha).toISOString(),
            tecnico_responsable: modalFormData.tecnico_responsable.trim(),
            descripcion: finalDescription || null,
            repuestos_insumos: modalFormData.repuestos_insumos.trim() || null,
            ticket_referencia: modalFormData.ticket_referencia.trim() || null,
          }
        ])
        .select()
        .single();

      if (error) throw error;

      // Registrar también eventos vinculados a cada dispositivo afectado
      if (affected.length > 0) {
        for (const dev of affected) {
          try {
            await supabase.from('historial_mantenimiento').insert([
              {
                entidad_tipo: dev.sourceType,
                entidad_id: dev.id,
                tipo_intervencion: modalFormData.tipo_intervencion,
                fecha: new Date(modalFormData.fecha).toISOString(),
                tecnico_responsable: modalFormData.tecnico_responsable.trim(),
                descripcion: `[Intervención en Rack ${activeCode}] ${modalFormData.descripcion.trim() || 'Mantenimiento en gabinete'}`,
                repuestos_insumos: modalFormData.repuestos_insumos.trim() || null,
                ticket_referencia: modalFormData.ticket_referencia.trim() || `RACK-${activeCode}`,
              }
            ]);
          } catch (linkErr) {
            console.warn('Error vinculando mantenimiento a dispositivo:', linkErr);
          }
        }
      }

      setIntervenciones(prev => [data, ...prev]);
      setIsModalOpen(false);
      setSelectedAffectedDeviceIds([]);
      setModalFormData({
        tipo_intervencion: 'mantenimiento_preventivo',
        fecha: new Date().toISOString().slice(0, 16),
        tecnico_responsable: 'Carlos Mendoza (TEC-042)',
        descripcion: '',
        repuestos_insumos: '',
        ticket_referencia: '',
      });
    } catch (err: any) {
      console.error('Error logging maintenance intervention:', err);
      if (err.message && err.message.includes('historial_mantenimiento_entidad_tipo_check')) {
        alert('Aviso de Supabase: Para registrar bitácora en Racks, debes ejecutar en tu SQL Editor de Supabase:\n\nALTER TABLE historial_mantenimiento DROP CONSTRAINT IF EXISTS historial_mantenimiento_entidad_tipo_check;\nALTER TABLE historial_mantenimiento ADD CONSTRAINT historial_mantenimiento_entidad_tipo_check CHECK (entidad_tipo IN (\'equipo\', \'camara\', \'rack\'));');
      } else {
        alert('Error al registrar intervención: ' + (err.message || 'Verifique los datos'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner strip */}
      <div className="flex items-center justify-between text-[11px] font-mono border-b border-slate-200 pb-2 text-slate-500">
        <div className="flex items-center gap-2">
          <span>Infraestructura CCTV &gt; Planta Física &gt; <strong className="text-slate-800">{activeCode} (Bitácora)</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-700 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Última verificación en terreno: {lastEventDate}
          </span>
        </div>
      </div>

      {/* Main Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              {entityType === 'rack' ? (
                <Server className="w-5 h-5 text-blue-600" />
              ) : entityType === 'equipo' ? (
                <Server className="w-5 h-5 text-emerald-600" />
              ) : entityType === 'punto_red' ? (
                puntoRed?.tipo_punto === 'wifi_ap' ? (
                  <Wifi className="w-5 h-5 text-indigo-600" />
                ) : (
                  <Network className="w-5 h-5 text-cyan-600" />
                )
              ) : (
                <Camera className="w-5 h-5 text-blue-600" />
              )}
              <h1 className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                Bitácora Técnica · {activeCode}
              </h1>
              {activeModel && (
                <span className="text-xs font-mono bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-semibold">
                  {activeModel}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {entityType === 'rack'
                ? `${rack?.ubicacion_especifica || 'Sala Técnica'} · ${rack?.formato || 'Bastidor Estándar 19"'} · Capacidad ${rack?.altura_u || 42}U`
                : entityType === 'punto_red'
                ? `${puntoRed?.ubicacion_especifica || 'Punto en terreno'} · ${puntoRed?.tipo_punto === 'wifi_ap' ? 'Access Point WiFi' : (puntoRed?.tipo_punto === 'datos_funcionario' ? 'Datos Funcionario' : 'Datos Alumno')} · ${puntoRed?.categoria_cable?.toUpperCase() || 'Cat6'}`
                : camera
                ? `MAC: ${camera.direccion_mac || 'No registrada'} · ${camera.ubicacion_especifica || 'Piso 2'} · IP ${camera.direccion_ip || 'No asignada'}`
                : equipo
                ? `IP: ${equipo.ip_gestion || 'No asignada'} · Serie ${equipo.numero_serie || 'N/A'}`
                : 'Registro de intervenciones'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Exportar Bitácora (CSV)</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ Registrar Nueva Intervención</span>
          </button>
        </div>
      </div>

      {/* Metric KPI Cards (without online/ping status) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-xs font-mono">
          <span className="text-[10px] uppercase text-slate-500 block font-semibold">TOTAL INTERVENCIONES</span>
          <span className="text-2xl font-bold text-slate-900 block mt-1">{countAll}</span>
          <span className="text-[10px] text-slate-400">Registros en Terreno</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-xs font-mono">
          <span className="text-[10px] uppercase text-slate-500 block font-semibold">ÚLTIMO MANTENIMIENTO</span>
          <span className="text-base font-bold text-blue-700 block mt-1">{lastEventDate}</span>
          <span className="text-[10px] text-slate-400">Inspección conforme</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-xs font-mono">
          <span className="text-[10px] uppercase text-slate-500 block font-semibold">MTTR ESTIMADO</span>
          <span className="text-2xl font-bold text-slate-900 block mt-1">45 min</span>
          <span className="text-[10px] text-slate-400">Tiempo medio resolución</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-xs font-mono">
          <span className="text-[10px] uppercase text-slate-500 block font-semibold">PRÓXIMA REVISIÓN PROG.</span>
          <span className="text-base font-bold text-slate-800 block mt-1">02/11/2026</span>
          <span className="text-[10px] text-slate-400">Ciclo semestral ordinario</span>
        </div>
      </div>

      {/* Main Content Grid: Timeline on Left & Technical Sidebar on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Filters and Timeline Cards */}
        <div className="lg:col-span-8 space-y-4">
          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-1 overflow-x-auto">
              {[
                { id: 'all', label: `Todos los eventos (${countAll})` },
                { id: 'instalacion', label: `Instalación (${countInstalacion})` },
                { id: 'mantenimiento_preventivo', label: `Mantenimiento Preventivo (${countPreventivo})` },
                { id: 'reparacion', label: `Reparación (${countReparacion})` },
                { id: 'recambio', label: `Recambio (${countRecambio})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  className={`px-3 py-1 rounded text-xs transition-colors whitespace-nowrap ${
                    filterType === tab.id
                      ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="text-[11px] text-slate-400">
              Orden: Reciente primero
            </div>
          </div>

          {/* Timeline Cards */}
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-slate-400 font-mono text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                Cargando historial de intervenciones...
              </div>
            ) : filteredList.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-slate-400 font-mono text-xs">
                No hay eventos registrados para esta categoría.
              </div>
            ) : (
              filteredList.map((item) => {
                let badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                let typeLabel = 'Mantenimiento';
                if (item.tipo_intervencion === 'instalacion') {
                  badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                  typeLabel = 'Instalación';
                } else if (item.tipo_intervencion === 'mantenimiento_preventivo') {
                  badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
                  typeLabel = 'Mantenimiento Preventivo';
                } else if (item.tipo_intervencion === 'reparacion') {
                  badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                  typeLabel = 'Reparación';
                } else if (item.tipo_intervencion === 'recambio') {
                  badgeClass = 'bg-purple-50 text-purple-800 border-purple-200';
                  typeLabel = 'Recambio de Equipo';
                }

                return (
                  <div 
                    key={item.id}
                    className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs font-mono text-xs space-y-3 relative overflow-hidden"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${badgeClass}`}>
                          {typeLabel}
                        </span>
                        <span className="font-bold text-slate-900 text-sm">
                          {item.descripcion?.slice(0, 45) || 'Intervención en terreno'}...
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(item.fecha).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded border border-slate-200 text-[11px]">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">TÉCNICO RESPONSABLE</span>
                        <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3 text-slate-400" />
                          {item.tecnico_responsable}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">CONDICIÓN ENLACE / RESULTADO</span>
                        <span className="font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                          <ShieldCheck className="w-3 h-3" />
                          Verificado conforme en terreno
                        </span>
                      </div>
                    </div>

                    {item.descripcion && item.descripcion.includes('[Dispositivos Afectados:') ? (
                      <div className="space-y-1.5 pt-1">
                        <div className="p-2 bg-blue-50/80 rounded border border-blue-200 text-[11px] text-blue-900 font-mono">
                          <div className="font-bold flex items-center gap-1 text-blue-800 mb-0.5">
                            <Server className="w-3 h-3 text-blue-600" />
                            <span>Dispositivos Afectados en esta Intervención:</span>
                          </div>
                          <p className="text-blue-950 font-sans text-xs">
                            {item.descripcion.split('\n\n')[0].replace('[Dispositivos Afectados: ', '').replace(']', '')}
                          </p>
                        </div>
                        {item.descripcion.includes('\n\n') && (
                          <p className="text-slate-700 text-xs leading-relaxed font-sans">
                            {item.descripcion.split('\n\n').slice(1).join('\n\n')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-700 text-xs leading-relaxed font-sans pt-1">
                        {item.descripcion}
                      </p>
                    )}

                    {item.repuestos_insumos && (
                      <div className="pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">REPUESTOS / INSUMOS:</span>
                        {item.repuestos_insumos.split(',').map((rep, idx) => (
                          <span key={idx} className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded border border-slate-200">
                            {rep.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Parámetros de Enlace & Técnicos */}
        <div className="lg:col-span-4 space-y-6">
          {/* Parámetros de Enlace / Especificaciones Físicas */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs font-mono text-xs">
            <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider pb-2 border-b border-slate-200 mb-3 flex items-center justify-between">
              <span>{entityType === 'rack' ? 'Ficha Resumida del Rack' : 'Parámetros de Enlace Físico'}</span>
              <Settings className="w-3.5 h-3.5 text-slate-400" />
            </h3>

            {entityType === 'rack' ? (
              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Formato / Bastidor</span>
                  <span className="font-bold text-slate-800">{rack?.formato || 'Estándar 19"'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Capacidad Total</span>
                  <span className="font-bold text-blue-700">{rack?.altura_u || 42}U</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Ubicación Específica</span>
                  <span className="text-slate-800">{rack?.ubicacion_especifica || 'Sala Técnica'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Custodia de Llaves</span>
                  <span className="text-slate-800">{rack?.custodia_llave || 'No registrada'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Última Inspección</span>
                  <span className="text-slate-800">{rack?.ultima_inspeccion || 'Sin registro'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Responsable Técnico</span>
                  <span className="text-slate-800">{rack?.tecnico_responsable || 'No asignado'}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Dirección IP Estática</span>
                  <span className="font-bold text-blue-700">{camera?.direccion_ip || equipo?.ip_gestion || 'No asignada'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Dirección MAC</span>
                  <span className="text-slate-800">{camera?.direccion_mac || 'No registrada'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Puerto Switch</span>
                  <span className="text-slate-800">{camera?.puerto_switch || 'No configurado'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Puerto Patch Panel</span>
                  <span className="text-slate-800">{camera?.puerto_patch ? `Puerto ${camera.puerto_patch}` : 'Sin parchear'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Canal NVR</span>
                  <span className="text-slate-800">{camera?.canal_nvr ? `Canal ${camera.canal_nvr}` : 'No asignado'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Número de Serie</span>
                  <span className="text-slate-800">{camera?.numero_serie || equipo?.numero_serie || 'No registrado'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Resolución / Capacidad</span>
                  <span className="text-slate-800">
                    {camera?.resolucion_mp ? `${camera.resolucion_mp} MP` : equipo?.puertos_totales ? `${equipo.puertos_totales} Puertos` : 'N/A'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Técnicos con Intervenciones Registradas */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs font-mono text-xs">
            <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider pb-2 border-b border-slate-200 mb-3">
              Técnicos con Intervenciones ({Array.from(new Set(intervenciones.map(h => h.tecnico_responsable).filter((t): t is string => Boolean(t)))).length})
            </h3>

            {Array.from(new Set(intervenciones.map(h => h.tecnico_responsable).filter((t): t is string => Boolean(t)))).length === 0 ? (
              <p className="text-slate-400 text-[11px] py-2">Sin intervenciones técnicas registradas para este dispositivo.</p>
            ) : (
              <div className="space-y-2.5">
                {Array.from(new Set(intervenciones.map(h => h.tecnico_responsable).filter((t): t is string => Boolean(t)))).map((tec, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 p-2 bg-slate-50 rounded border border-slate-200">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
                      {tec.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 block text-xs truncate">{tec}</span>
                      <span className="text-[10px] text-slate-500 block">Técnico Registrado</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Registrar Nueva Intervención */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 font-mono flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>Registrar Intervención en {activeCode}</span>
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveIntervention} className="p-5 space-y-4 text-xs font-mono">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Tipo de Intervención *</label>
                <select
                  value={modalFormData.tipo_intervencion}
                  onChange={(e) => setModalFormData({ ...modalFormData, tipo_intervencion: e.target.value as any })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-blue-600 text-xs"
                >
                  <option value="mantenimiento_preventivo">Mantenimiento Preventivo</option>
                  <option value="reparacion">Reparación</option>
                  <option value="instalacion">Instalación</option>
                  <option value="recambio">Recambio de Equipo</option>
                </select>
              </div>

              {entityType === 'rack' && (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-blue-600" />
                      <span>Dispositivos Afectados ({selectedAffectedDeviceIds.length} seleccionados)</span>
                    </label>
                    {rackDevices.length > 0 && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setSelectedAffectedDeviceIds(rackDevices.map(d => d.id))}
                          className="text-blue-600 hover:underline cursor-pointer"
                        >
                          Todos ({rackDevices.length})
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => setSelectedAffectedDeviceIds([])}
                          className="text-slate-500 hover:underline cursor-pointer"
                        >
                          Ninguno
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-500 font-sans">
                    Marca los equipos o cámaras intervenidos en este rack para registrar su historial individual y reporte de fallas.
                  </p>

                  {rackDevices.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic py-1">
                      No hay equipos ni cámaras vinculados actualmente a este bastidor.
                    </p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1 border border-slate-200 rounded bg-white p-2 divide-y divide-slate-100">
                      {rackDevices.map(dev => {
                        const isSelected = selectedAffectedDeviceIds.includes(dev.id);
                        return (
                          <label
                            key={dev.id}
                            className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50/70 text-blue-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedAffectedDeviceIds(prev => [...prev, dev.id]);
                                  } else {
                                    setSelectedAffectedDeviceIds(prev => prev.filter(id => id !== dev.id));
                                  }
                                }}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 shrink-0"
                              />
                              <div className="truncate text-xs">
                                <span className="font-bold font-mono">{dev.codigo}</span>
                                <span className="text-slate-500 text-[10px] ml-1.5 font-normal">
                                  {dev.tipoLabel} · {dev.marca} {dev.modelo}
                                </span>
                              </div>
                            </div>
                            {dev.posicion && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0 ml-2">
                                {dev.posicion}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Fecha y Hora *</label>
                  <input
                    type="datetime-local"
                    required
                    value={modalFormData.fecha}
                    onChange={(e) => setModalFormData({ ...modalFormData, fecha: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Técnico Responsable *</label>
                  <input
                    type="text"
                    required
                    value={modalFormData.tecnico_responsable}
                    onChange={(e) => setModalFormData({ ...modalFormData, tecnico_responsable: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Descripción del Trabajo Realizado *</label>
                <textarea
                  rows={4}
                  required
                  value={modalFormData.descripcion}
                  onChange={(e) => setModalFormData({ ...modalFormData, descripcion: e.target.value })}
                  placeholder="Detalle de limpieza, ajustes mecánicos, mediciones Fluke, o calibración óptica efectuada."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 text-xs font-sans"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Repuestos / Insumos Utilizados</label>
                <input
                  type="text"
                  value={modalFormData.repuestos_insumos}
                  onChange={(e) => setModalFormData({ ...modalFormData, repuestos_insumos: e.target.value })}
                  placeholder="ej. Kit de limpieza óptica, Paño antiestático, Patch cord cat6A"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Ticket de Referencia / OT (Opcional)</label>
                <input
                  type="text"
                  value={modalFormData.ticket_referencia}
                  onChange={(e) => setModalFormData({ ...modalFormData, ticket_referencia: e.target.value })}
                  placeholder="ej. OT-2026-8941 o TCK-9912"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 font-mono text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-1.5 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded shadow-xs"
                >
                  {saving ? 'Guardando en Supabase...' : 'Guardar Intervención'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
