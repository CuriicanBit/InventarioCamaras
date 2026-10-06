import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Wrench, 
  Edit3, 
  Trash2, 
  Archive, 
  Layers, 
  Server, 
  Cpu, 
  Wifi, 
  Network, 
  User, 
  GraduationCap, 
  Briefcase, 
  MapPin, 
  Cable, 
  Calendar, 
  CheckCircle2, 
  Info,
  Clock,
  Plus,
  ArrowRight,
  Shield,
  FileText
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
  PuntoRed, 
  Rack, 
  Equipo, 
  Proveedor, 
  HistorialMantenimiento, 
  Piso, 
  Edificio, 
  Campus, 
  Sede,
  PuertoSwitch
} from '../types/database';
import { DecommissionModal } from './DecommissionModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { MaintenanceHistory } from './MaintenanceHistory';

interface NetworkPointDetailProps {
  point: PuntoRed;
  onBack: () => void;
  onNavigateToEdit: (point: PuntoRed) => void;
  onNavigateToRack: (rackId: string) => void;
  onPointUpdated?: (updated: PuntoRed) => void;
  onPointDeleted?: () => void;
}

export const NetworkPointDetail: React.FC<NetworkPointDetailProps> = ({
  point,
  onBack,
  onNavigateToEdit,
  onNavigateToRack,
  onPointUpdated,
  onPointDeleted,
}) => {
  const [currentPoint, setCurrentPoint] = useState<PuntoRed>(point);
  const [rack, setRack] = useState<Rack | null>(null);
  const [patchPanel, setPatchPanel] = useState<Equipo | null>(null);
  const [switchEq, setSwitchEq] = useState<Equipo | null>(null);
  const [puertoSwitch, setPuertoSwitch] = useState<PuertoSwitch | null>(null);
  const [piso, setPiso] = useState<Piso | null>(null);
  const [edificio, setEdificio] = useState<Edificio | null>(null);
  const [campus, setCampus] = useState<Campus | null>(null);
  const [sede, setSede] = useState<Sede | null>(null);
  const [provCompra, setProvCompra] = useState<Proveedor | null>(null);
  const [provInst, setProvInst] = useState<Proveedor | null>(null);
  const [historial, setHistorial] = useState<HistorialMantenimiento[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [decommissionModalOpen, setDecommissionModalOpen] = useState(false);
  const [deleteConfirmModalOpen, setDeleteConfirmModalOpen] = useState(false);

  const loadPointRelations = async () => {
    try {
      setLoading(true);
      // Refresh current point record
      const { data: refPoint } = await supabase
        .from('puntos_red')
        .select('*, marca_rel:marcas(*), modelo_rel:modelos(*)')
        .eq('id', point.id)
        .single();

      const active = refPoint || point;
      setCurrentPoint(active);

      // Fetch related records
      const [
        { data: rData },
        { data: ppData },
        { data: swData },
        { data: psData },
        { data: pData },
        { data: provData },
        { data: hData },
      ] = await Promise.all([
        active.rack_id ? supabase.from('racks').select('*').eq('id', active.rack_id).single() : Promise.resolve({ data: null }),
        active.patch_panel_id ? supabase.from('equipos').select('*').eq('id', active.patch_panel_id).single() : Promise.resolve({ data: null }),
        active.switch_id ? supabase.from('equipos').select('*').eq('id', active.switch_id).single() : Promise.resolve({ data: null }),
        active.puerto_switch_id ? supabase.from('puertos_switch').select('*').eq('id', active.puerto_switch_id).single() : Promise.resolve({ data: null }),
        active.piso_id ? supabase.from('pisos').select('*').eq('id', active.piso_id).single() : Promise.resolve({ data: null }),
        supabase.from('proveedores').select('*'),
        supabase.from('historial_mantenimiento').select('*').eq('entidad_id', active.id).order('fecha', { ascending: false }),
      ]);

      if (rData) setRack(rData);
      if (ppData) setPatchPanel(ppData);
      if (swData) setSwitchEq(swData);
      if (psData) setPuertoSwitch(psData);
      if (pData) {
        setPiso(pData);
        if (pData.edificio_id) {
          const { data: edData } = await supabase.from('edificios').select('*').eq('id', pData.edificio_id).single();
          if (edData) {
            setEdificio(edData);
            if (edData.campus_id) {
              const { data: cData } = await supabase.from('campus').select('*').eq('id', edData.campus_id).single();
              if (cData) {
                setCampus(cData);
                if (cData.sede_id) {
                  const { data: sData } = await supabase.from('sedes').select('*').eq('id', cData.sede_id).single();
                  if (sData) setSede(sData);
                }
              }
            }
          }
        }
      }

      const provs = provData || [];
      if (active.proveedor_compra_id) {
        setProvCompra(provs.find(pr => pr.id === active.proveedor_compra_id) || null);
      }
      if (active.proveedor_instalacion_id) {
        setProvInst(provs.find(pr => pr.id === active.proveedor_instalacion_id) || null);
      }

      setHistorial(hData || []);
    } catch (err) {
      console.error('Error loading punto_red relations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPointRelations();
  }, [point.id]);

  const isWifiAP = currentPoint.tipo_punto === 'wifi_ap';
  const isFuncionario = currentPoint.tipo_punto === 'datos_funcionario';

  const tipoLabel = isWifiAP 
    ? 'Access Point WiFi' 
    : isFuncionario 
    ? 'Punto Datos Funcionario' 
    : 'Punto Datos Alumno';

  const estadoBadgeClass = 
    currentPoint.estado_ciclo_vida === 'instalado' || !currentPoint.estado_ciclo_vida
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : currentPoint.estado_ciclo_vida === 'retirado_pendiente_bodega'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : currentPoint.estado_ciclo_vida === 'en_bodega'
      ? 'bg-blue-50 text-blue-800 border-blue-200'
      : 'bg-rose-50 text-rose-800 border-rose-200';

  const estadoLabel = 
    currentPoint.estado_ciclo_vida === 'instalado' || !currentPoint.estado_ciclo_vida
      ? 'Instalado / Operativo'
      : currentPoint.estado_ciclo_vida === 'retirado_pendiente_bodega'
      ? 'Retirado - Pendiente de Bodega'
      : currentPoint.estado_ciclo_vida === 'en_bodega'
      ? 'En Bodega'
      : 'Dado de Baja';

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 space-y-6 font-mono text-xs">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Volver al Listado"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[11px] text-slate-500">
              {sede?.nombre || 'Sede'} &gt; {campus?.nombre || 'Campus'} &gt; {edificio?.nombre || 'Edificio'} &gt; <strong className="text-slate-800">{piso?.nombre || 'Piso'}</strong>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`p-1 rounded text-white ${isWifiAP ? 'bg-indigo-600' : isFuncionario ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                {isWifiAP ? <Wifi className="w-3.5 h-3.5" /> : isFuncionario ? <Briefcase className="w-3.5 h-3.5" /> : <GraduationCap className="w-3.5 h-3.5" />}
              </span>
              <span className="font-bold text-slate-900 text-base">{currentPoint.codigo}</span>
              <span className="text-[11px] text-slate-500 font-sans">({tipoLabel})</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5 text-blue-600" />
            <span>Bitácora ({historial.length})</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateToEdit(currentPoint)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Editar Punto</span>
          </button>

          <button
            type="button"
            onClick={() => setDecommissionModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 transition-colors shadow-2xs cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5 text-amber-600" />
            <span>Retirar de Instalación</span>
          </button>

          <button
            type="button"
            onClick={() => setDeleteConfirmModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-300 rounded bg-red-50 hover:bg-red-100 text-red-700 transition-colors shadow-2xs cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            <span>Eliminar</span>
          </button>
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Main Specs and Connectivity */}
        <div className="lg:col-span-8 space-y-6">
          {/* Header Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  FICHA TÉCNICA DE RED
                </span>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {currentPoint.codigo}
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  {currentPoint.ubicacion_especifica || 'Sin ubicación específica registrada'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded text-xs font-semibold border ${estadoBadgeClass}`}>
                  {estadoLabel}
                </span>
                <span className="px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {currentPoint.categoria_cable ? currentPoint.categoria_cable.toUpperCase() : 'CAT6'}
                </span>
              </div>
            </div>

            {/* General Specs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-400 block mb-0.5 uppercase">TIPO DE ENLACE</span>
                <span className="font-bold text-slate-800">{tipoLabel}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-400 block mb-0.5 uppercase">PISO / NIVEL</span>
                <span className="font-bold text-slate-800">{piso?.nombre || 'Piso 1'}</span>
                <span className="text-[10px] text-slate-500 block">{edificio?.nombre}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-400 block mb-0.5 uppercase">CATEGORÍA CABLE</span>
                <span className="font-bold text-slate-800">{currentPoint.categoria_cable ? currentPoint.categoria_cable.toUpperCase() : 'CAT6'}</span>
                <span className="text-[10px] text-slate-500 block">Certificación 250MHz+</span>
              </div>
            </div>
          </div>

          {/* Enlace y Conectividad Física */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Cable className="w-4 h-4 text-blue-600" />
                <span>Ruta de Cableado y Conectividad en Rack</span>
              </h2>
              {rack && (
                <button
                  type="button"
                  onClick={() => onNavigateToRack(rack.id)}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <span>Ver Rack {rack.codigo}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Rack */}
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                    <Server className="w-3.5 h-3.5 text-blue-600" />
                    <span>Gabinete / Rack</span>
                  </span>
                  {rack && (
                    <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded border border-blue-200">
                      {rack.altura_u}U
                    </span>
                  )}
                </div>
                <div className="font-bold text-sm text-slate-900">
                  {rack ? `Rack ${rack.codigo}` : 'Sin Rack asignado'}
                </div>
                <p className="text-[10px] text-slate-500">
                  {rack?.ubicacion_especifica || 'Sala IDF / Telecomunicaciones'}
                </p>
              </div>

              {/* Patch Panel */}
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-blue-600" />
                    <span>Patch Panel & Puerto Patch</span>
                  </span>
                  <span className="text-[10px] font-mono bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded">
                    Puerto {currentPoint.puerto_patch || '-'}
                  </span>
                </div>
                <div className="font-bold text-sm text-slate-900">
                  {patchPanel ? `${patchPanel.codigo} (${patchPanel.marca || 'Patch Panel'})` : 'No asignado'}
                </div>
                <p className="text-[10px] text-slate-500">
                  Posición U: {patchPanel?.posicion_u_inicio ? `U${patchPanel.posicion_u_inicio}` : 'Rack'} · {patchPanel?.puertos_totales || 24} Puertos
                </p>
              </div>

              {/* Switch */}
              <div className="p-3.5 bg-blue-50/50 rounded-lg border border-blue-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-blue-700 uppercase font-semibold flex items-center gap-1">
                    <Server className="w-3.5 h-3.5 text-blue-600" />
                    <span>Switch de Conexión</span>
                  </span>
                  {switchEq && (
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                      {switchEq.marca || 'Switch'}
                    </span>
                  )}
                </div>
                <div className="font-bold text-sm text-slate-900">
                  {switchEq ? switchEq.codigo : 'Sin switch asignado'}
                </div>
                <p className="text-[10px] text-slate-500">
                  {switchEq?.modelo || 'Switch de Distribución'} {switchEq?.ip_gestion ? `· IP ${switchEq.ip_gestion}` : ''}
                </p>
              </div>

              {/* Puerto Switch & VLAN */}
              <div className="p-3.5 bg-blue-50/50 rounded-lg border border-blue-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-blue-700 uppercase font-semibold flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-blue-600" />
                    <span>Puerto de Switch Asignado</span>
                  </span>
                  {puertoSwitch?.vlan ? (
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.2 rounded">
                      VLAN {puertoSwitch.vlan}
                    </span>
                  ) : (
                    <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.2 rounded">
                      Sin VLAN
                    </span>
                  )}
                </div>
                <div className="font-bold text-sm text-slate-900">
                  {puertoSwitch ? `Puerto ${puertoSwitch.numero_puerto}` : 'Puerto sin registrar'}
                </div>
                <p className="text-[10px] text-slate-500">
                  {puertoSwitch?.uso ? `Uso configurado: ${puertoSwitch.uso}` : 'Conexión activa permanente'}
                </p>
              </div>
            </div>
          </div>

          {/* Hardware Activo (Si es AP WiFi) o Especificación de Punto Pasivo */}
          {isWifiAP ? (
            <div className="bg-white border border-indigo-200 rounded-lg p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                <h2 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-indigo-600" />
                  <span>Hardware de Access Point WiFi</span>
                </h2>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-semibold">
                  Dispositivo Activo
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-400 block mb-0.5 uppercase">MARCA Y MODELO</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {currentPoint.marca_rel?.nombre || '-'} {currentPoint.modelo_rel?.nombre || ''}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-400 block mb-0.5 uppercase">NÚMERO DE SERIE</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {currentPoint.numero_serie || 'No registrado'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-400 block mb-0.5 uppercase">DIRECCIÓN MAC</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {currentPoint.direccion_mac || 'No registrada'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-400 block mb-0.5 uppercase">DIRECCIÓN IP GESTIÓN</span>
                  <span className="font-mono font-bold text-blue-700 text-sm">
                    {currentPoint.direccion_ip || 'DHCP / No asignada'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-3">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-600" />
                <span>Naturaleza de Conexión: Punto Pasivo de Usuario</span>
              </h2>
              <div className="bg-slate-50 rounded-lg p-3 text-slate-600 leading-relaxed text-xs">
                Este punto de red (<strong className="text-slate-900">{tipoLabel}</strong>) corresponde a una toma física de pared/suelo RJ-45 para usuarios de la comunidad universitaria. Por estándar, no cuenta con hardware activo propio (marca, modelo, MAC, IP), garantizando conexión plug-and-play hacia el switch de acceso central.
              </div>
            </div>
          )}

          {/* Adquisición y Proveedores */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-3">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>Garantía, Adquisición e Instalación</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-400 block mb-0.5 uppercase">COMPRA Y SUMINISTRO</span>
                <span className="font-semibold text-slate-900 block">
                  Fecha: {currentPoint.fecha_compra ? new Date(currentPoint.fecha_compra).toLocaleDateString() : 'No registrada'}
                </span>
                <span className="text-slate-500 text-[11px] block mt-0.5">
                  Proveedor: {provCompra?.nombre || 'No asignado'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <span className="text-[10px] text-slate-400 block mb-0.5 uppercase">INSTALACIÓN Y CERTIFICACIÓN</span>
                <span className="font-semibold text-slate-900 block">
                  Fecha: {currentPoint.fecha_instalacion ? new Date(currentPoint.fecha_instalacion).toLocaleDateString() : 'No registrada'}
                </span>
                <span className="text-slate-500 text-[11px] block mt-0.5">
                  Contratista: {provInst?.nombre || 'Cuadrilla Interna'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Mini Bitácora and Status Summary */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card Resumen de Bitácora */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-600" />
                <span>Bitácora de Intervenciones</span>
              </h3>
              <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">
                {historial.length} eventos
              </span>
            </div>

            <p className="text-[11px] text-slate-500 leading-snug">
              Historial de certificaciones, recambios de conector jack, reubicaciones y mantenimientos preventivos.
            </p>

            {historial.length === 0 ? (
              <div className="py-6 text-center text-slate-400 bg-slate-50 rounded border border-dashed border-slate-200 p-4">
                <Clock className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                <span>Sin intervenciones registradas</span>
              </div>
            ) : (
              <div className="space-y-3">
                {historial.slice(0, 4).map((item) => (
                  <div key={item.id} className="p-2.5 bg-slate-50 rounded border border-slate-200/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 capitalize text-[11px]">
                        {item.tipo_intervencion.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(item.fecha).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-sans leading-tight line-clamp-2">
                      {item.descripcion || 'Sin descripción técnica.'}
                    </p>
                    <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-200/50 flex justify-between">
                      <span>Téc: {item.tecnico_responsable}</span>
                      {item.ticket_referencia && <span>OT: {item.ticket_referencia}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Ver Historial / + Registrar Intervención</span>
            </button>
          </div>

          {/* Quick Technical Specs Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2.5 text-[11px] text-slate-600">
            <h4 className="font-bold text-slate-900 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              <span>Parámetros de Enlace</span>
            </h4>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">ID Base de Datos:</span>
              <span className="font-mono text-slate-700 text-[10px]">{currentPoint.id.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Categoría:</span>
              <span className="font-bold text-slate-800">{currentPoint.categoria_cable?.toUpperCase() || 'CAT6'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">VLAN de Puerto:</span>
              <span className="font-bold text-indigo-700">{puertoSwitch?.vlan ? `VLAN ${puertoSwitch.vlan}` : 'Sin VLAN'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Fecha de Creación:</span>
              <span>{new Date(currentPoint.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Bitácora / Historial de Mantenimiento Reutilizando MaintenanceHistory */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-slate-50 rounded-xl shadow-2xl border border-slate-300 max-w-5xl w-full max-h-[96vh] overflow-y-auto">
            <MaintenanceHistory
              entityType="punto_red"
              entityId={currentPoint.id}
              puntoRed={currentPoint}
              onBack={() => {
                setShowHistoryModal(false);
                loadPointRelations();
              }}
            />
          </div>
        </div>
      )}

      {/* Modal para Retirar de Instalación */}
      <DecommissionModal
        isOpen={decommissionModalOpen}
        onClose={() => setDecommissionModalOpen(false)}
        itemType="punto_red"
        itemId={currentPoint.id}
        itemCode={currentPoint.codigo}
        onSuccess={(nuevoEstado) => {
          setCurrentPoint(prev => ({ ...prev, estado_ciclo_vida: nuevoEstado }));
          setDecommissionModalOpen(false);
          loadPointRelations();
          onPointUpdated?.({ ...currentPoint, estado_ciclo_vida: nuevoEstado });
        }}
      />

      {/* Modal para Eliminación Definitiva */}
      <DeleteConfirmModal
        isOpen={deleteConfirmModalOpen}
        onClose={() => setDeleteConfirmModalOpen(false)}
        itemType="punto_red"
        itemId={currentPoint.id}
        itemCode={currentPoint.codigo}
        onSuccess={() => {
          setDeleteConfirmModalOpen(false);
          onPointDeleted?.();
          onBack();
        }}
      />
    </div>
  );
};
