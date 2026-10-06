import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  MapPin, 
  Server, 
  ChevronRight, 
  ChevronDown, 
  Search, 
  Layers, 
  FileText, 
  ArrowRight, 
  Edit3, 
  Calendar, 
  User, 
  Key, 
  Plus, 
  Check, 
  RefreshCw,
  Trash2,
  HardDrive,
  Inbox,
  Globe,
  Wrench,
  Clock,
  ShieldCheck,
  Tag
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Sede, Campus, Edificio, Piso, Rack, Equipo, Camara, HistorialMantenimiento, TipoIntervencion } from '../types/database';
import { NodeFormModal, DeleteSafetyModal } from './TreeNodeModals';
import { NodeLevel } from '../utils/treeHierarchy';
import { MaintenanceHistory } from './MaintenanceHistory';

export interface RackDeviceOption {
  id: string;
  sourceType: 'equipo' | 'camara';
  codigo: string;
  tipoLabel: string;
  marca: string;
  modelo: string;
  posicion?: string;
}

interface PhysicalTreeProps {
  onSelectRack: (rack: Rack) => void;
  onSelectCamera?: (cam: Camara) => void;
  onNavigateToElevation: (rack: Rack) => void;
  onNavigateToPorts: (rack: Rack) => void;
  onNavigateToMaintenanceRack?: (rack: Rack) => void;
  selectedRackId?: string;
  onNavigateToUnassigned?: () => void;
}

export const PhysicalTree: React.FC<PhysicalTreeProps> = ({
  onSelectRack,
  onSelectCamera,
  onNavigateToElevation,
  onNavigateToPorts,
  selectedRackId,
  onNavigateToUnassigned,
}) => {
  // Tree state
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [campusList, setCampusList] = useState<Campus[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Expanded tree nodes
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'sede-default': true,
    'campus-default': true,
    'edif-default': true,
    'piso-default': true,
  });

  // Current selected rack
  const [currentRack, setCurrentRack] = useState<Rack | null>(null);

  // CRUD Modals state
  const [formModalState, setFormModalState] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    level: NodeLevel;
    initialData?: any;
    parentId?: string;
  }>({
    isOpen: false,
    mode: 'create',
    level: 'sede',
  });

  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    level: NodeLevel;
    nodeId: string;
    nodeName: string;
  }>({
    isOpen: false,
    level: 'sede',
    nodeId: '',
    nodeName: '',
  });

  const [unassignedCount, setUnassignedCount] = useState<number>(0);

  // Bitácora / Historial de Mantenimiento para Racks
  const [rackHistorial, setRackHistorial] = useState<HistorialMantenimiento[]>([]);
  const [showRackHistoryModal, setShowRackHistoryModal] = useState<boolean>(false);
  const [isNewInterventionModalOpen, setIsNewInterventionModalOpen] = useState<boolean>(false);
  const [savingIntervention, setSavingIntervention] = useState<boolean>(false);
  const [selectedAffectedDeviceIds, setSelectedAffectedDeviceIds] = useState<string[]>([]);
  const [newInterventionData, setNewInterventionData] = useState<{
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

  // Dispositivos disponibles en este rack para vincular a la bitácora
  const availableRackDevices = useMemo<RackDeviceOption[]>(() => {
    if (!currentRack) return [];
    const list: RackDeviceOption[] = [];

    // Equipos montados en este rack
    const rackMountedEquipos = equipos.filter(e => e.rack_id === currentRack.id);
    rackMountedEquipos.forEach(eq => {
      let tipoLabel = 'Equipo';
      if (eq.tipo === 'switch') tipoLabel = 'Switch PoE';
      else if (eq.tipo === 'nvr') tipoLabel = 'Grabador NVR';
      else if (eq.tipo === 'patch_panel') tipoLabel = 'Patch Panel';
      else if (eq.tipo === 'ups') tipoLabel = 'UPS / Energía';
      else if (eq.tipo) tipoLabel = String(eq.tipo).toUpperCase();

      const marca = eq.marca_rel?.nombre || eq.marca || '-';
      const modelo = eq.modelo_rel?.nombre || eq.modelo || '-';
      const pos = eq.posicion_u_inicio ? `U${eq.posicion_u_inicio}` : 'Piso / Shaft';

      list.push({
        id: eq.id,
        sourceType: 'equipo',
        codigo: eq.codigo,
        tipoLabel,
        marca,
        modelo,
        posicion: pos,
      });
    });

    // Cámaras asociadas o conectadas a este rack
    const rackEquiposIds = new Set(rackMountedEquipos.map(e => e.id));
    const associatedCams = camaras.filter(c => 
      c.rack_id === currentRack.id || 
      (c.switch_id && rackEquiposIds.has(c.switch_id)) || 
      (c.nvr_id && rackEquiposIds.has(c.nvr_id)) || 
      (c.patch_panel_id && rackEquiposIds.has(c.patch_panel_id))
    );

    associatedCams.forEach(cam => {
      const marca = cam.marca_rel?.nombre || cam.marca || '-';
      const modelo = cam.modelo_rel?.nombre || cam.modelo || '-';
      list.push({
        id: cam.id,
        sourceType: 'camara',
        codigo: cam.codigo,
        tipoLabel: cam.tipo_camara ? `Cámara ${cam.tipo_camara.toUpperCase()}` : 'Cámara CCTV',
        marca,
        modelo,
        posicion: cam.ubicacion_especifica || 'Asociada al Rack',
      });
    });

    return list;
  }, [currentRack, equipos, camaras]);

  const loadRackHistorial = async (rackId: string) => {
    try {
      const { data, error } = await supabase
        .from('historial_mantenimiento')
        .select('*')
        .eq('entidad_id', rackId)
        .order('fecha', { ascending: false });
      if (!error && data) {
        setRackHistorial(data);
      }
    } catch (err) {
      console.error('Error loading rack maintenance history:', err);
    }
  };

  useEffect(() => {
    if (currentRack?.id) {
      loadRackHistorial(currentRack.id);
    } else {
      setRackHistorial([]);
    }
  }, [currentRack?.id]);

  const handleSaveRackIntervention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRack) return;
    try {
      setSavingIntervention(true);

      const affectedDevices = availableRackDevices.filter((d: RackDeviceOption) => selectedAffectedDeviceIds.includes(d.id));
      let finalDescription = newInterventionData.descripcion.trim();

      if (affectedDevices.length > 0) {
        const affectedNames = affectedDevices.map((d: RackDeviceOption) => `${d.codigo} (${d.tipoLabel} · ${d.marca} ${d.modelo})`).join('; ');
        finalDescription = `[Dispositivos Afectados: ${affectedNames}]\n\n${finalDescription}`;
      }

      const { data, error } = await supabase
        .from('historial_mantenimiento')
        .insert([
          {
            entidad_tipo: 'rack',
            entidad_id: currentRack.id,
            tipo_intervencion: newInterventionData.tipo_intervencion,
            fecha: new Date(newInterventionData.fecha).toISOString(),
            tecnico_responsable: newInterventionData.tecnico_responsable.trim(),
            descripcion: finalDescription || null,
            repuestos_insumos: newInterventionData.repuestos_insumos.trim() || null,
            ticket_referencia: newInterventionData.ticket_referencia.trim() || null,
          }
        ])
        .select()
        .single();

      if (error) throw error;

      // Registrar también eventos vinculados a cada dispositivo afectado para su propio historial y reportes
      if (affectedDevices.length > 0) {
        for (const dev of affectedDevices) {
          try {
            await supabase.from('historial_mantenimiento').insert([
              {
                entidad_tipo: dev.sourceType,
                entidad_id: dev.id,
                tipo_intervencion: newInterventionData.tipo_intervencion,
                fecha: new Date(newInterventionData.fecha).toISOString(),
                tecnico_responsable: newInterventionData.tecnico_responsable.trim(),
                descripcion: `[Intervención en Rack ${currentRack.codigo}] ${newInterventionData.descripcion.trim() || 'Mantenimiento en gabinete'}`,
                repuestos_insumos: newInterventionData.repuestos_insumos.trim() || null,
                ticket_referencia: newInterventionData.ticket_referencia.trim() || `RACK-${currentRack.codigo}`,
              }
            ]);
          } catch (linkErr) {
            console.warn('Error vinculando mantenimiento a dispositivo:', linkErr);
          }
        }
      }

      setRackHistorial(prev => [data, ...prev]);
      setIsNewInterventionModalOpen(false);
      setSelectedAffectedDeviceIds([]);
      setNewInterventionData({
        tipo_intervencion: 'mantenimiento_preventivo',
        fecha: new Date().toISOString().slice(0, 16),
        tecnico_responsable: 'Carlos Mendoza (TEC-042)',
        descripcion: '',
        repuestos_insumos: '',
        ticket_referencia: '',
      });
    } catch (err: any) {
      console.error('Error saving rack maintenance intervention:', err);
      if (err.message && err.message.includes('historial_mantenimiento_entidad_tipo_check')) {
        alert('Aviso de Supabase: Para registrar bitácora en Racks, debes ejecutar en tu SQL Editor de Supabase:\n\nALTER TABLE historial_mantenimiento DROP CONSTRAINT IF EXISTS historial_mantenimiento_entidad_tipo_check;\nALTER TABLE historial_mantenimiento ADD CONSTRAINT historial_mantenimiento_entidad_tipo_check CHECK (entidad_tipo IN (\'equipo\', \'camara\', \'rack\'));');
      } else {
        alert('Error al registrar intervención en rack: ' + (err.message || 'Verifique los datos'));
      }
    } finally {
      setSavingIntervention(false);
    }
  };

  // Fetch full tree from Supabase
  const loadTreeData = async (preferredRackId?: string) => {
    try {
      setLoading(true);
      const [
        { data: sData },
        { data: cData },
        { data: eData },
        { data: pData },
        { data: rData },
        { data: eqData },
        { data: camData },
        { data: unassignedData },
      ] = await Promise.all([
        supabase.from('sedes').select('*').order('nombre'),
        supabase.from('campus').select('*').order('nombre'),
        supabase.from('edificios').select('*').order('nombre'),
        supabase.from('pisos').select('*').order('nombre'),
        supabase.from('racks').select('*').order('codigo'),
        supabase.from('equipos').select('*').order('posicion_u_inicio', { ascending: false }),
        supabase.from('camaras').select('*').order('codigo'),
        supabase.from('v_sin_asignar').select('id'),
      ]);

      setUnassignedCount(unassignedData?.length || 0);

      const loadedSedes = sData || [];
      const loadedCampus = cData || [];
      const loadedEdificios = eData || [];
      const loadedPisos = pData || [];
      const loadedRacks = rData || [];
      const loadedEquipos = (eqData || []).filter(
        e => !e.estado_ciclo_vida || e.estado_ciclo_vida === 'instalado'
      );
      const loadedCamaras = (camData || []).filter(
        c => !c.estado_ciclo_vida || c.estado_ciclo_vida === 'instalado'
      );

      setSedes(loadedSedes);
      setCampusList(loadedCampus);
      setEdificios(loadedEdificios);
      setPisos(loadedPisos);
      setRacks(loadedRacks);
      setEquipos(loadedEquipos);
      setCamaras(loadedCamaras);

      // Handle rack selection
      const targetRackId = preferredRackId || selectedRackId || currentRack?.id;
      let targetRack: Rack | null = null;
      if (loadedRacks.length > 0) {
        targetRack = loadedRacks.find(r => r.id === targetRackId) || loadedRacks[0];
      }

      setCurrentRack(targetRack);
      if (targetRack) {
        onSelectRack(targetRack);

        // Expand tree ancestors for this rack
        const p = loadedPisos.find(pi => pi.id === targetRack?.piso_id);
        const ed = loadedEdificios.find(e => e.id === p?.edificio_id);
        const camp = loadedCampus.find(c => c.id === ed?.campus_id);
        const sed = loadedSedes.find(s => s.id === camp?.sede_id);

        setExpandedNodes(prev => ({
          ...prev,
          [`sede-${sed?.id}`]: true,
          [`campus-${camp?.id}`]: true,
          [`edificio-${ed?.id}`]: true,
          [`piso-${p?.id}`]: true,
        }));
      }
    } catch (err) {
      console.error('Error loading physical tree:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTreeData();
  }, []);

  const toggleNode = (nodeKey: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
  };

  const handleSelectRackItem = (rack: Rack) => {
    setCurrentRack(rack);
    onSelectRack(rack);
  };

  // CRUD Trigger Handlers
  const openCreateModal = (level: NodeLevel, parentId?: string) => {
    // Auto expand parent
    if (parentId) {
      const prefix = 
        level === 'campus' ? 'sede' :
        level === 'edificio' ? 'campus' :
        level === 'piso' ? 'edificio' :
        level === 'rack' ? 'piso' : '';
      if (prefix) {
        setExpandedNodes(prev => ({ ...prev, [`${prefix}-${parentId}`]: true }));
      }
    }

    setFormModalState({
      isOpen: true,
      mode: 'create',
      level,
      parentId,
    });
  };

  const openEditNodeModal = (level: NodeLevel, data: any) => {
    setFormModalState({
      isOpen: true,
      mode: 'edit',
      level,
      initialData: data,
    });
  };

  const openDeleteNodeModal = (level: NodeLevel, id: string, name: string) => {
    setDeleteModalState({
      isOpen: true,
      level,
      nodeId: id,
      nodeName: name,
    });
  };

  // Calculate stats for current selected rack
  const rackEquipos = equipos.filter(e => e.rack_id === currentRack?.id);
  const rackCamaras = camaras.filter(c => c.rack_id === currentRack?.id);
  const currentPiso = pisos.find(p => p.id === currentRack?.piso_id);
  const currentEdificio = edificios.find(e => e.id === currentPiso?.edificio_id);
  const currentCampus = campusList.find(c => c.id === currentEdificio?.campus_id);
  const currentSede = sedes.find(s => s.id === currentCampus?.sede_id);

  // U-space occupied calculation
  const occupiedU = rackEquipos.reduce((acc, eq) => {
    if (eq.posicion_u_inicio && eq.posicion_u_fin) {
      return acc + (Math.abs(eq.posicion_u_fin - eq.posicion_u_inicio) + 1);
    } else if (eq.posicion_u_inicio) {
      return acc + 1;
    }
    return acc;
  }, 0);
  const totalU = currentRack?.altura_u || 42;
  const availableU = Math.max(0, totalU - occupiedU);

  // Tree filter logic
  const matchesSearch = (text: string) => {
    if (!searchFilter.trim()) return true;
    return text.toLowerCase().includes(searchFilter.toLowerCase().trim());
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-3 sm:px-6 py-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Physical Tree Explorer */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Explorador Físico</span>
              </h2>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                {sedes.length} Sedes · {racks.length} Gabinetes
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => openCreateModal('sede')}
                title="Agregar Nueva Sede"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-2xs font-mono"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Sede</span>
              </button>
              <button 
                onClick={() => loadTreeData()}
                title="Recargar árbol"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="p-3 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filtrar por sede, edificio, rack..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
          </div>

          {/* Unassigned Items Indicator Bar */}
          {unassignedCount > 0 && (
            <div className="p-2.5 mx-2 my-2 bg-amber-50 border border-amber-200 rounded flex items-center justify-between text-xs font-mono animate-in fade-in duration-200">
              <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
                <Inbox className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{unassignedCount} {unassignedCount === 1 ? 'item' : 'items'} Sin Asignar</span>
              </div>
              <button
                onClick={() => onNavigateToUnassigned?.()}
                className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold transition-colors shadow-2xs"
              >
                Reasignar
              </button>
            </div>
          )}

          {/* Tree Structure */}
          <div className="p-2 max-h-[720px] overflow-y-auto overflow-x-auto text-xs font-mono">
            {loading && sedes.length === 0 ? (
              <div className="py-8 text-center text-slate-400 font-sans">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                Cargando topología de campus...
              </div>
            ) : sedes.length === 0 ? (
              <div className="py-10 px-4 text-center text-slate-500 font-sans text-xs space-y-3 bg-slate-50/50 rounded-lg border border-dashed border-slate-200 my-2">
                <Building2 className="w-8 h-8 text-slate-300 mx-auto" />
                <div>
                  <p className="font-semibold text-slate-700 text-sm">Aún no hay sedes registradas</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Comienza definiendo la primera sede física de la institución.
                  </p>
                </div>
                <button
                  onClick={() => openCreateModal('sede')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded transition-colors shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear Primera Sede</span>
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {sedes.map((sede) => {
                  const sedeCampus = campusList.filter(c => c.sede_id === sede.id);
                  const isSedeExpanded = expandedNodes[`sede-${sede.id}`] ?? true;

                  if (searchFilter && !matchesSearch(sede.nombre) && 
                      !sedeCampus.some(c => matchesSearch(c.nombre))) {
                    return null;
                  }

                  return (
                    <div key={sede.id} className="select-none">
                      {/* LEVEL 1: Sede Node */}
                      <div 
                        onClick={() => toggleNode(`sede-${sede.id}`)}
                        className="group flex items-center justify-between p-1.5 rounded hover:bg-slate-100 cursor-pointer font-semibold text-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0 pr-1">
                          {isSedeExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                          <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate">{sede.nombre}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Hover action group */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mr-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openCreateModal('campus', sede.id);
                              }}
                              title="Agregar Campus a esta Sede"
                              className="p-1 hover:text-blue-600 hover:bg-blue-50 text-slate-400 rounded transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditNodeModal('sede', sede);
                              }}
                              title="Editar Sede"
                              className="p-1 hover:text-amber-600 hover:bg-amber-50 text-slate-400 rounded transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteNodeModal('sede', sede.id, sede.nombre);
                              }}
                              title="Eliminar Sede"
                              className="p-1 hover:text-red-600 hover:bg-red-50 text-slate-400 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {sedeCampus.length} Campus
                          </span>
                        </div>
                      </div>

                      {/* LEVEL 2: Campus Nodes */}
                      {isSedeExpanded && (
                        <div className="ml-4 pl-2 border-l border-slate-200 space-y-1 mt-1">
                          {sedeCampus.length === 0 ? (
                            <div className="py-1.5 px-2 text-[11px] text-slate-400 flex items-center justify-between bg-slate-50 rounded border border-dashed border-slate-200">
                              <span>Sin campus registrados</span>
                              <button
                                onClick={() => openCreateModal('campus', sede.id)}
                                className="text-blue-600 hover:text-blue-800 font-semibold text-[10px] flex items-center gap-0.5"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Crear Campus</span>
                              </button>
                            </div>
                          ) : (
                            sedeCampus.map((campus) => {
                            const campEdificios = edificios.filter(e => e.campus_id === campus.id);
                            const isCampExpanded = expandedNodes[`campus-${campus.id}`] ?? true;

                            return (
                              <div key={campus.id}>
                                <div 
                                  onClick={() => toggleNode(`campus-${campus.id}`)}
                                  className="group flex items-center justify-between p-1.5 rounded hover:bg-slate-100 cursor-pointer text-slate-700 transition-colors"
                                >
                                  <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0 pr-1">
                                    {isCampExpanded ? <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}
                                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    <span className="truncate font-semibold text-slate-800" title={campus.nombre}>{campus.nombre}</span>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    {/* Hover action group */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mr-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openCreateModal('edificio', campus.id);
                                        }}
                                        title="Agregar Edificio a este Campus"
                                        className="p-1 hover:text-blue-600 hover:bg-blue-50 text-slate-400 rounded transition-colors"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openEditNodeModal('campus', campus);
                                        }}
                                        title="Editar Campus"
                                        className="p-1 hover:text-amber-600 hover:bg-amber-50 text-slate-400 rounded transition-colors"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openDeleteNodeModal('campus', campus.id, campus.nombre);
                                        }}
                                        title="Eliminar Campus"
                                        className="p-1 hover:text-red-600 hover:bg-red-50 text-slate-400 rounded transition-colors"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <span className="text-[10px] text-slate-400">
                                      {campEdificios.length} Edificios
                                    </span>
                                  </div>
                                </div>

                                {/* LEVEL 3: Edificios Nodes */}
                                {isCampExpanded && (
                                  <div className="ml-3 pl-2 border-l border-slate-200 space-y-1 mt-0.5">
                                    {campEdificios.length === 0 ? (
                                      <div className="py-1 px-2 text-[10px] text-slate-400 flex items-center justify-between bg-slate-50 rounded border border-dashed border-slate-200">
                                        <span>Sin edificios registrados</span>
                                        <button
                                          onClick={() => openCreateModal('edificio', campus.id)}
                                          className="text-blue-600 hover:text-blue-800 font-semibold text-[10px] flex items-center gap-0.5"
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>Crear Edificio</span>
                                        </button>
                                      </div>
                                    ) : (
                                      campEdificios.map((edif) => {
                                      const edifPisos = pisos.filter(p => p.edificio_id === edif.id);
                                      const isEdifExpanded = expandedNodes[`edificio-${edif.id}`] ?? true;

                                      return (
                                        <div key={edif.id}>
                                          <div 
                                            onClick={() => toggleNode(`edificio-${edif.id}`)}
                                            className="group flex items-center justify-between p-1.5 rounded hover:bg-slate-100 cursor-pointer text-slate-700 transition-colors"
                                          >
                                            <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0 pr-1">
                                              {isEdifExpanded ? <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />}
                                              <span className="truncate font-semibold text-slate-800" title={edif.nombre}>{edif.nombre}</span>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                              {/* Hover action group */}
                                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mr-1">
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openCreateModal('piso', edif.id);
                                                  }}
                                                  title="Agregar Piso a este Edificio"
                                                  className="p-1 hover:text-blue-600 hover:bg-blue-50 text-slate-400 rounded transition-colors"
                                                >
                                                  <Plus className="w-3 h-3" />
                                                </button>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openEditNodeModal('edificio', edif);
                                                  }}
                                                  title="Editar Edificio"
                                                  className="p-1 hover:text-amber-600 hover:bg-amber-50 text-slate-400 rounded transition-colors"
                                                >
                                                  <Edit3 className="w-3 h-3" />
                                                </button>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openDeleteNodeModal('edificio', edif.id, edif.nombre);
                                                  }}
                                                  title="Eliminar Edificio"
                                                  className="p-1 hover:text-red-600 hover:bg-red-50 text-slate-400 rounded transition-colors"
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                </button>
                                              </div>
                                              <span className="text-[10px] text-slate-400">
                                                {edifPisos.length} Pisos
                                              </span>
                                            </div>
                                          </div>

                                          {/* LEVEL 4: Pisos Nodes */}
                                          {isEdifExpanded && (
                                            <div className="ml-3 pl-2 border-l border-slate-200 space-y-0.5 mt-0.5">
                                              {edifPisos.length === 0 ? (
                                                <div className="py-1 px-2 text-[10px] text-slate-400 flex items-center justify-between bg-slate-50 rounded border border-dashed border-slate-200">
                                                  <span>Sin pisos registrados</span>
                                                  <button
                                                    onClick={() => openCreateModal('piso', edif.id)}
                                                    className="text-blue-600 hover:text-blue-800 font-semibold text-[10px] flex items-center gap-0.5"
                                                  >
                                                    <Plus className="w-3 h-3" />
                                                    <span>Crear Piso</span>
                                                  </button>
                                                </div>
                                              ) : (
                                                edifPisos.map((piso) => {
                                                const pisoRacks = racks.filter(r => r.piso_id === piso.id);
                                                const pisoCamaras = camaras.filter(c => c.piso_id === piso.id);
                                                const isPisoExpanded = expandedNodes[`piso-${piso.id}`] ?? true;

                                                return (
                                                  <div key={piso.id}>
                                                    <div 
                                                      onClick={() => toggleNode(`piso-${piso.id}`)}
                                                      className="group flex items-center justify-between p-1 rounded hover:bg-slate-100 cursor-pointer text-slate-600 transition-colors"
                                                    >
                                                      <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-1">
                                                        {isPisoExpanded ? <ChevronDown className="w-2.5 h-2.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />}
                                                        <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                                        <span className="font-bold text-slate-900 shrink-0 whitespace-nowrap bg-indigo-50/80 border border-indigo-200 px-1.5 py-0.5 rounded text-[11px]" title={piso.nombre}>
                                                          {piso.nombre}
                                                        </span>
                                                        {piso.plano_url && (
                                                          <span 
                                                            title={piso.plano_url.includes('cloudinary') ? 'Plano Cloudinary vinculado' : (piso.plano_url.startsWith('http') ? 'Plano en la Nube vinculado' : 'Plano local vinculado')}
                                                            className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-mono bg-blue-50 text-blue-700 border border-blue-200 shrink-0"
                                                          >
                                                            <Globe className="w-2.5 h-2.5" />
                                                            <span>Plano</span>
                                                          </span>
                                                        )}
                                                      </div>

                                                      <div className="flex items-center gap-1 shrink-0">
                                                        {/* Hover action group */}
                                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mr-1">
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              openEditNodeModal('piso', piso);
                                                            }}
                                                            title="Vincular o Cambiar Plano CAD (Cloudinary o archivo)"
                                                            className="p-1 hover:text-blue-600 hover:bg-blue-50 text-slate-400 rounded transition-colors"
                                                          >
                                                            <Globe className="w-3 h-3" />
                                                          </button>
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              openCreateModal('rack', piso.id);
                                                            }}
                                                            title="Agregar Rack a este Piso"
                                                            className="p-1 hover:text-blue-600 hover:bg-blue-50 text-slate-400 rounded transition-colors"
                                                          >
                                                            <Plus className="w-3 h-3" />
                                                          </button>
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              openEditNodeModal('piso', piso);
                                                            }}
                                                            title="Editar Piso y Plano CAD"
                                                            className="p-1 hover:text-amber-600 hover:bg-amber-50 text-slate-400 rounded transition-colors"
                                                          >
                                                            <Edit3 className="w-3 h-3" />
                                                          </button>
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              openDeleteNodeModal('piso', piso.id, piso.nombre);
                                                            }}
                                                            title="Eliminar Piso"
                                                            className="p-1 hover:text-red-600 hover:bg-red-50 text-slate-400 rounded transition-colors"
                                                          >
                                                            <Trash2 className="w-3 h-3" />
                                                          </button>
                                                        </div>
                                                        <span className="text-[10px] text-slate-400">
                                                          {pisoRacks.length} Racks, {pisoCamaras.length} Cámaras
                                                        </span>
                                                      </div>
                                                    </div>

                                                    {/* LEVEL 5: Racks in Floor */}
                                                    {isPisoExpanded && (
                                                      <div className="ml-4 space-y-1 py-1">
                                                        {pisoRacks.length === 0 && pisoCamaras.length === 0 ? (
                                                          <div className="py-1 px-2 text-[10px] text-slate-400 flex items-center justify-between bg-slate-50 rounded border border-dashed border-slate-200">
                                                            <span>Sin racks ni cámaras</span>
                                                            <button
                                                              onClick={() => openCreateModal('rack', piso.id)}
                                                              className="text-blue-600 hover:text-blue-800 font-semibold text-[10px] flex items-center gap-0.5"
                                                            >
                                                              <Plus className="w-3 h-3" />
                                                              <span>Crear Rack</span>
                                                            </button>
                                                          </div>
                                                        ) : (
                                                          pisoRacks.map((rack) => {
                                                          const isSelected = currentRack?.id === rack.id;
                                                          return (
                                                            <div
                                                              key={rack.id}
                                                              onClick={() => handleSelectRackItem(rack)}
                                                              className={`group flex items-center justify-between p-2 rounded cursor-pointer transition-all ${
                                                                isSelected
                                                                  ? 'bg-blue-600 text-white shadow-xs font-semibold'
                                                                  : 'bg-slate-50 hover:bg-blue-50 text-slate-700 border border-slate-200/60'
                                                              }`}
                                                            >
                                                              <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 pr-1">
                                                                <Server className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-blue-600'}`} />
                                                                <span className="truncate font-mono">{rack.codigo}</span>
                                                              </div>

                                                              <div className="flex items-center gap-1.5 shrink-0">
                                                                {/* Hover actions */}
                                                                <div className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 ${isSelected ? 'text-white' : ''}`}>
                                                                  <button
                                                                    onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      openEditNodeModal('rack', rack);
                                                                    }}
                                                                    title="Editar Rack"
                                                                    className={`p-1 rounded transition-colors ${
                                                                      isSelected 
                                                                        ? 'hover:bg-blue-700 text-blue-100' 
                                                                        : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                                                    }`}
                                                                  >
                                                                    <Edit3 className="w-3 h-3" />
                                                                  </button>
                                                                  <button
                                                                    onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      openDeleteNodeModal('rack', rack.id, rack.codigo);
                                                                    }}
                                                                    title="Eliminar Rack"
                                                                    className={`p-1 rounded transition-colors ${
                                                                      isSelected 
                                                                        ? 'hover:bg-blue-700 text-blue-100' 
                                                                        : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                                                    }`}
                                                                  >
                                                                    <Trash2 className="w-3 h-3" />
                                                                  </button>
                                                                </div>

                                                                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono ${
                                                                  isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600'
                                                                }`}>
                                                                  {isSelected ? 'Activo en Ficha' : `${rack.altura_u}U`}
                                                                </span>
                                                              </div>
                                                            </div>
                                                          );
                                                        })
                                                      )}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })
                                            )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer note in sidebar */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 text-[10px] font-mono text-slate-500 flex justify-between">
            <span>Operaciones CRUD 5 niveles</span>
            <span>Nivel: Gabinete (L5)</span>
          </div>
        </div>

        {/* RIGHT COLUMN: Ficha Técnica de Rack */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {currentRack ? (
            <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
              {/* Header Breadcrumb & Actions */}
              <div className="p-5 border-b border-slate-200">
                <div className="text-[11px] font-mono text-slate-500 mb-1 flex items-center gap-1.5 flex-wrap">
                  <span>{currentSede?.nombre || 'Sede'}</span>
                  <span>/</span>
                  <span>{currentCampus?.nombre || 'Campus'}</span>
                  <span>/</span>
                  <span>{currentEdificio?.nombre || 'Edificio'}</span>
                  <span>/</span>
                  <span className="inline-flex items-center gap-1 text-indigo-800 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">
                    <Layers className="w-3 h-3 text-indigo-600" />
                    <span>{currentPiso?.nombre || 'Piso no asignado'}</span>
                  </span>
                  <span>/</span>
                  <span className="text-slate-800 font-semibold">{currentRack.ubicacion_especifica || 'Sala Técnica'}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h1 className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
                        Rack {currentRack.codigo}
                      </h1>
                      <span className="text-xs font-mono font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded flex items-center gap-1 shadow-2xs">
                        <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span>{currentPiso?.nombre || 'Piso no asignado'}</span>
                      </span>
                      <span className="text-xs font-mono font-medium bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                        Gabinete {currentRack.altura_u}U
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 max-w-xl">
                      {currentRack.formato || 'Rack de Distribución de Telecomunicaciones y Concentrador CCTV'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => setShowRackHistoryModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer"
                      title="Ver Historial y Bitácora del Rack"
                    >
                      <Wrench className="w-3.5 h-3.5 text-blue-600" />
                      <span>Bitácora ({rackHistorial.length})</span>
                    </button>
                    <button
                      onClick={() => onNavigateToElevation(currentRack)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
                    >
                      <Server className="w-3.5 h-3.5 text-blue-600" />
                      <span>Ver Elevación</span>
                    </button>
                    <button
                      onClick={() => onNavigateToPorts(currentRack)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                      <span>Mapeo de Puertos</span>
                    </button>
                    <button
                      onClick={() => openEditNodeModal('rack', currentRack)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-2xs font-semibold"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar Ficha</span>
                    </button>
                    <button
                      onClick={() => openDeleteNodeModal('rack', currentRack.id, currentRack.codigo)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-rose-200 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors shadow-2xs"
                      title="Eliminar este Rack"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Ficha Técnica de Terreno (Grid de Especificaciones) */}
              <div className="p-5 border-b border-slate-200">
                <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  FICHA TÉCNICA DE TERRENO
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
                  <div className="p-3 bg-indigo-50/70 rounded border border-indigo-200">
                    <span className="text-[10px] text-indigo-700 font-bold block mb-0.5 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-indigo-600" />
                      PISO / NIVEL DE UBICACIÓN
                    </span>
                    <span className="font-bold text-slate-900 text-sm block">{currentPiso?.nombre || 'Sin Piso Asignado'}</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">{currentEdificio?.nombre} · {currentCampus?.nombre}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block mb-0.5">FORMATO Y ESTRUCTURA</span>
                    <span className="font-semibold text-slate-800">{currentRack.formato || 'Rack Cerrado 42U'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block mb-0.5">UBICACIÓN ESPECÍFICA</span>
                    <span className="font-semibold text-slate-800">{currentRack.ubicacion_especifica || 'Sala IDF'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block mb-0.5">CUSTODIA DE LLAVES</span>
                    <span className="font-semibold text-slate-800">{currentRack.custodia_llave || 'No registrada'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block mb-0.5">RESPONSABLE TÉCNICO</span>
                    <span className="font-semibold text-slate-800">{currentRack.tecnico_responsable || 'No asignado'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block mb-0.5">ÚLTIMA INSPECCIÓN</span>
                    <span className="font-semibold text-slate-800">{currentRack.ultima_inspeccion || 'Sin registro'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block mb-0.5">CÓDIGO CATASTRAL</span>
                    <span className="font-semibold text-slate-800">CAT-{currentRack.codigo}</span>
                  </div>
                </div>
              </div>

              {/* Ocupación y Resumen de Carga */}
              <div className="p-5 border-b border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
                    OCUPACIÓN FÍSICA EN UNIDADES DE RACK ({totalU}U)
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-700">
                    {occupiedU}U ocupadas ({totalU > 0 ? Math.round((occupiedU / totalU) * 100) : 0}%) · {availableU}U disponibles
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                  <div 
                    className="bg-blue-600 h-full transition-all duration-300" 
                    style={{ width: `${totalU > 0 ? Math.min(100, Math.round((occupiedU / totalU) * 100)) : 0}%` }}
                  />
                </div>
              </div>

              {/* Equipos Montados en este Rack */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold font-mono text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-blue-600" />
                    <span>Equipos Activos y Pasivos en Rack ({rackEquipos.length})</span>
                  </h3>
                  <button
                    onClick={() => onNavigateToElevation(currentRack)}
                    className="text-xs font-mono text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                  >
                    <span>Ver elevación gráfica</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Ubicación U</th>
                        <th className="py-2.5 px-3">Tipo</th>
                        <th className="py-2.5 px-3">Código</th>
                        <th className="py-2.5 px-3">Marca / Modelo</th>
                        <th className="py-2.5 px-3">IP Gestión</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rackEquipos.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400">
                            No hay equipos montados en este rack.
                          </td>
                        </tr>
                      ) : (
                        rackEquipos.map((eq) => (
                          <tr key={eq.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-bold text-blue-700">
                              {eq.posicion_u_inicio && eq.posicion_u_inicio > 0 && eq.posicion_u_fin && eq.posicion_u_fin > 0
                                ? (eq.posicion_u_inicio === eq.posicion_u_fin ? `U${eq.posicion_u_inicio}` : `U${eq.posicion_u_inicio}-U${eq.posicion_u_fin}`)
                                : eq.posicion_u_inicio && eq.posicion_u_inicio > 0
                                ? `U${eq.posicion_u_inicio}`
                                : (
                                  <span className="text-amber-800 font-semibold text-[10px] bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded inline-block">
                                    Piso / Shaft
                                  </span>
                                )}
                            </td>
                            <td className="py-2 px-3 capitalize text-slate-700">{eq.tipo.replace('_', ' ')}</td>
                            <td className="py-2 px-3 font-semibold text-slate-900">{eq.codigo}</td>
                            <td className="py-2 px-3 text-slate-600">
                              {eq.marca || '-'} {eq.modelo ? `(${eq.modelo})` : ''}
                            </td>
                            <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                              {eq.ip_gestion || '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Anotaciones */}
              {currentRack.anotaciones && (
                <div className="p-5 border-t border-slate-200 bg-slate-50/30 text-xs">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Anotaciones de Terreno</span>
                  <p className="text-slate-600 italic">{currentRack.anotaciones}</p>
                </div>
              )}

              {/* Bitácora Técnica e Historial de Intervenciones del Rack */}
              <div className="p-5 border-t border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold font-mono text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <span>Estado de Bitácora / Historial de Intervenciones</span>
                        <span className="text-[10px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.2 rounded-full font-bold">
                          {rackHistorial.length} {rackHistorial.length === 1 ? 'evento' : 'eventos'}
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Mantenimientos preventivos, reparaciones y adecuaciones estructurales en este gabinete
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowRackHistoryModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs cursor-pointer"
                      title="Abrir vista completa de bitácora y auditoría"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span>Ver Historial</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsNewInterventionModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Registrar Nueva Intervención</span>
                    </button>
                  </div>
                </div>

                {/* Línea de tiempo de eventos */}
                {rackHistorial.length === 0 ? (
                  <div className="p-6 bg-slate-50 rounded-lg border border-slate-200 text-center font-mono text-xs text-slate-500">
                    <p className="mb-2">No hay intervenciones registradas en la bitácora de este rack.</p>
                    <button
                      type="button"
                      onClick={() => setIsNewInterventionModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-blue-700 rounded transition-colors shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Registrar Primera Intervención</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 font-mono text-xs">
                    {rackHistorial.slice(0, 4).map((item) => {
                      const isPreventivo = item.tipo_intervencion === 'mantenimiento_preventivo';
                      const isReparacion = item.tipo_intervencion === 'reparacion';
                      const isInstalacion = item.tipo_intervencion === 'instalacion';

                      return (
                        <div key={item.id} className="p-3.5 bg-slate-50/80 rounded-lg border border-slate-200 space-y-1.5 hover:border-slate-300 transition-colors">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-700 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                {new Date(item.fecha).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                isPreventivo 
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : isReparacion
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : isInstalacion
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}>
                                {item.tipo_intervencion.replace(/_/g, ' ')}
                              </span>
                            </div>

                            {item.ticket_referencia && (
                              <span className="text-[10px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                <Tag className="w-3 h-3 text-slate-400" />
                                OT: {item.ticket_referencia}
                              </span>
                            )}
                          </div>

                          {item.descripcion && item.descripcion.includes('[Dispositivos Afectados:') ? (
                            <div className="space-y-1.5">
                              <div className="p-2 bg-blue-50/80 rounded border border-blue-200 text-[11px] text-blue-900 font-mono">
                                <div className="font-bold flex items-center gap-1 text-blue-800 mb-0.5">
                                  <Server className="w-3 h-3 text-blue-600" />
                                  <span>Dispositivos Afectados:</span>
                                </div>
                                <p className="text-blue-950 font-sans text-xs">
                                  {item.descripcion.split('\n\n')[0].replace('[Dispositivos Afectados: ', '').replace(']', '')}
                                </p>
                              </div>
                              {item.descripcion.includes('\n\n') && (
                                <p className="text-slate-800 font-sans text-xs leading-relaxed">
                                  {item.descripcion.split('\n\n').slice(1).join('\n\n')}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-slate-800 font-sans text-xs leading-relaxed">
                              {item.descripcion || 'Sin descripción técnica registrada.'}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200/70 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              Técnico: <strong className="text-slate-700">{item.tecnico_responsable}</strong>
                            </span>
                            {item.repuestos_insumos && (
                              <span className="italic truncate max-w-xs text-slate-600">
                                Insumos: {item.repuestos_insumos}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {rackHistorial.length > 4 && (
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => setShowRackHistoryModal(true)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                        >
                          <span>Ver las {rackHistorial.length} intervenciones registradas en la bitácora</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-400 font-mono">
              <Server className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">
                {sedes.length === 0 ? 'Aún no hay sedes registradas' : 'Ningún rack seleccionado'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {sedes.length === 0
                  ? 'Para comenzar a registrar tu infraestructura física y gabinetes, crea la primera Sede.'
                  : 'Selecciona un rack en el árbol para ver su ficha técnica o crea uno nuevo con el botón (+).'}
              </p>
              {sedes.length === 0 && (
                <button
                  onClick={() => openCreateModal('sede')}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear Primera Sede</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CRUD Form Modal */}
      <NodeFormModal
        isOpen={formModalState.isOpen}
        mode={formModalState.mode}
        level={formModalState.level}
        initialData={formModalState.initialData}
        parentId={formModalState.parentId}
        sedes={sedes}
        campusList={campusList}
        edificios={edificios}
        pisos={pisos}
        onClose={() => setFormModalState(prev => ({ ...prev, isOpen: false }))}
        onSuccess={() => loadTreeData()}
      />

      {/* Safe Deletion Modal with Deep Descendant Counts */}
      <DeleteSafetyModal
        isOpen={deleteModalState.isOpen}
        level={deleteModalState.level}
        nodeId={deleteModalState.nodeId}
        nodeName={deleteModalState.nodeName}
        onClose={() => setDeleteModalState(prev => ({ ...prev, isOpen: false }))}
        onSuccess={() => loadTreeData()}
      />

      {/* Modal / Vista de Bitácora Completa del Rack (Reutiliza MaintenanceHistory) */}
      {showRackHistoryModal && currentRack && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-slate-50 rounded-xl shadow-2xl border border-slate-300 max-w-6xl w-full max-h-[96vh] overflow-y-auto">
            <MaintenanceHistory
              entityType="rack"
              entityId={currentRack.id}
              rack={currentRack}
              onBack={() => {
                setShowRackHistoryModal(false);
                loadRackHistorial(currentRack.id);
              }}
            />
          </div>
        </div>
      )}

      {/* Modal para Registrar Nueva Intervención en Rack */}
      {isNewInterventionModalOpen && currentRack && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-sm font-bold">
                <Wrench className="w-4 h-4 text-blue-400" />
                <span>Nueva Intervención · Rack {currentRack.codigo}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsNewInterventionModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRackIntervention} className="p-5 space-y-4 font-mono text-xs">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Tipo de Intervención *</label>
                <select
                  value={newInterventionData.tipo_intervencion}
                  onChange={(e) => setNewInterventionData({ ...newInterventionData, tipo_intervencion: e.target.value as any })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-blue-600 text-xs"
                >
                  <option value="mantenimiento_preventivo">Mantenimiento Preventivo</option>
                  <option value="reparacion">Reparación</option>
                  <option value="instalacion">Instalación / Adecuación</option>
                  <option value="recambio">Recambio / Sustitución</option>
                </select>
              </div>

              {/* Selector de Dispositivos Afectados en este Rack */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-blue-600" />
                    <span>Dispositivos Afectados ({selectedAffectedDeviceIds.length} seleccionados)</span>
                  </label>
                  {availableRackDevices.length > 0 && (
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setSelectedAffectedDeviceIds(availableRackDevices.map((d: RackDeviceOption) => d.id))}
                        className="text-blue-600 hover:underline cursor-pointer"
                      >
                        Todos ({availableRackDevices.length})
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
                  Selecciona los equipos o cámaras afectados para generar reportes de fallas por dispositivo, modelo o marca.
                </p>

                {availableRackDevices.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic py-1">
                    No hay equipos ni cámaras vinculados actualmente a este bastidor.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1 border border-slate-200 rounded bg-white p-2 divide-y divide-slate-100">
                    {availableRackDevices.map((dev: RackDeviceOption) => {
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Fecha y Hora *</label>
                  <input
                    type="datetime-local"
                    required
                    value={newInterventionData.fecha}
                    onChange={(e) => setNewInterventionData({ ...newInterventionData, fecha: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Técnico Responsable *</label>
                  <input
                    type="text"
                    required
                    value={newInterventionData.tecnico_responsable}
                    onChange={(e) => setNewInterventionData({ ...newInterventionData, tecnico_responsable: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Descripción del Trabajo Realizado *</label>
                <textarea
                  rows={4}
                  required
                  value={newInterventionData.descripcion}
                  onChange={(e) => setNewInterventionData({ ...newInterventionData, descripcion: e.target.value })}
                  placeholder="Detalle de limpieza de filtros, fijación de rieles, peinado de cables, revisión de puesta a tierra o ventilación."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 text-xs font-sans"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Repuestos / Insumos Utilizados</label>
                <input
                  type="text"
                  value={newInterventionData.repuestos_insumos}
                  onChange={(e) => setNewInterventionData({ ...newInterventionData, repuestos_insumos: e.target.value })}
                  placeholder="ej. Tuercas enjauladas M6, amarras de velcro, filtros de polvo"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Ticket de Referencia / OT (Opcional)</label>
                <input
                  type="text"
                  value={newInterventionData.ticket_referencia}
                  onChange={(e) => setNewInterventionData({ ...newInterventionData, ticket_referencia: e.target.value })}
                  placeholder="ej. OT-RACK-401 o TCK-991"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 font-mono text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewInterventionModalOpen(false)}
                  className="px-4 py-1.5 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingIntervention}
                  className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded shadow-xs cursor-pointer"
                >
                  {savingIntervention ? 'Guardando en Supabase...' : 'Guardar Intervención'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
