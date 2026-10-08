import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Server, 
  Cpu, 
  ArrowLeft, 
  Plus, 
  Edit, 
  Trash2, 
  ExternalLink, 
  QrCode, 
  HardDrive, 
  Zap, 
  Check, 
  ShieldCheck,
  Calendar,
  Building,
  RefreshCw,
  Network,
  Archive,
  AlertCircle,
  GripVertical,
  CheckCircle2,
  ArrowDownToLine,
  Layers,
  ChevronRight,
  Sparkles,
  Cable,
  AlignJustify,
  Boxes,
  Power,
  Router,
  Disc,
  Info,
  ArrowRight,
  Camera,
  BarChart3,
  AlertTriangle,
  Wrench
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Rack, Equipo, Proveedor, Marca, Modelo, TipoEquipo, Camara, PuntoRed, formatRolRed, normalizeRolRedForDb } from '../types/database';
import { calculateEquipmentOccupancy, EquipmentOccupancyInfo } from '../utils/occupancyAlerts';
import { MarcaSelect, ModeloSelect, ProveedorSelect } from './catalogs/CatalogSelectors';
import { DecommissionModal } from './DecommissionModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { RackBodegaDrawer } from './RackBodegaDrawer';
import { MaintenanceHistory } from './MaintenanceHistory';
import { SwitchPortsTable } from './SwitchPortsTable';
import { 
  inferUHeight, 
  calculateUInferior, 
  validateUSlotAvailability, 
  findFirstAvailableUSlot,
  SlotValidationResult 
} from '../utils/rackUnits';

interface RackElevationProps {
  rack: Rack;
  onBackToTree: () => void;
  onNavigateToPorts: (equipmentId?: string) => void;
}

export const RackElevation: React.FC<RackElevationProps> = ({
  rack,
  onBackToTree,
  onNavigateToPorts,
}) => {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [puntosRed, setPuntosRed] = useState<PuntoRed[]>([]);
  const [switchPortsOccupation, setSwitchPortsOccupation] = useState<any[]>([]);
  const [nvrUplinks, setNvrUplinks] = useState<Record<string, any>>({});
  const [bodegaEquipos, setBodegaEquipos] = useState<Equipo[]>([]);
  const [loadingBodega, setLoadingBodega] = useState(false);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [selectedEquipo, setSelectedEquipo] = useState<Equipo | null>(null);
  const selectedEquipoRef = useRef<Equipo | null>(null);
  useEffect(() => {
    selectedEquipoRef.current = selectedEquipo;
  }, [selectedEquipo]);
  const [loading, setLoading] = useState(true);

  // Cajón de Bodega deslizable (drawer lateral)
  const [isBodegaDrawerOpen, setIsBodegaDrawerOpen] = useState(false);

  // Pestañas en el panel de detalle: 'resumen' o 'puertos' (expandido para switches)
  const [equipmentDetailTab, setEquipmentDetailTab] = useState<'resumen' | 'puertos'>('resumen');
  const isPuertosTabActive = selectedEquipo?.tipo === 'switch' && equipmentDetailTab === 'puertos';

  // Switches en este rack
  const availableSwitchesInRack = useMemo(() => equipos.filter(e => e.tipo === 'switch'), [equipos]);

  // Modo de visualización de ranuras en bastidor
  const [slotDisplayMode, setSlotDisplayMode] = useState<'individual' | 'compact'>('individual');

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<{
    id: string;
    source: 'bodega' | 'rack';
    codigo: string;
    tipo: TipoEquipo;
    uHeight: number;
  } | null>(null);
  const draggedItemRef = useRef<{
    id: string;
    source: 'bodega' | 'rack';
    codigo: string;
    tipo: TipoEquipo;
    uHeight: number;
  } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<SlotValidationResult | null>(null);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modals for lifecycle & deletion
  const [decommissionModalOpen, setDecommissionModalOpen] = useState(false);
  const [deleteConfirmModalOpen, setDeleteConfirmModalOpen] = useState(false);
  const [showRackHistoryModal, setShowRackHistoryModal] = useState(false);

  // Modal for new/edit equipment
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formAlturaU, setFormAlturaU] = useState<number | ''>(1);
  const [modoAvanzadoU, setModoAvanzadoU] = useState<boolean>(false);
  const [formData, setFormData] = useState<{
    id?: string;
    rack_id: string;
    tipo: TipoEquipo;
    codigo: string;
    marca_id: string | null;
    modelo_id: string | null;
    marca: string | null;
    modelo: string | null;
    numero_serie: string;
    posicion_u_inicio: number | '';
    posicion_u_fin: number | '';
    ip_gestion: string;
    vlan: string;
    puertos_totales: string;
    canales_totales: string;
    capacidad_va: string;
    fecha_compra: string;
    fecha_instalacion: string;
    proveedor_compra_id: string | null;
    proveedor_instalacion_id: string | null;
    rol_red?: string;
    es_rackeable?: boolean;
  }>({
    rack_id: rack.id,
    tipo: 'switch',
    codigo: '',
    marca_id: null,
    modelo_id: null,
    marca: null,
    modelo: null,
    numero_serie: '',
    posicion_u_inicio: 1,
    posicion_u_fin: 1,
    ip_gestion: '',
    vlan: '',
    puertos_totales: '',
    canales_totales: '',
    capacidad_va: '',
    fecha_compra: '',
    fecha_instalacion: '',
    proveedor_compra_id: null,
    proveedor_instalacion_id: null,
    rol_red: '',
    es_rackeable: true,
  });
  const [saving, setSaving] = useState(false);
  const [savingRolRed, setSavingRolRed] = useState(false);

  const totalU = rack.altura_u || 42;

  // Equipos montados en el bastidor (ocupan unidades 1U..totalU)
  const rackMountedEquipos = equipos.filter(eq => Boolean(eq.posicion_u_inicio && eq.posicion_u_inicio > 0));

  // Equipos de piso / shaft adyacente (No rackeables, ej: UPS Torre en piso de shaft al lado del rack)
  const adjacentFloorEquipos = equipos.filter(
    eq => !eq.posicion_u_inicio || eq.posicion_u_inicio === 0 || eq.u_range === 'Piso / Shaft'
  );

  // Occupied slots map: key is U number (1..totalU), value is Equipo montado
  const occupiedSlotsMap: Record<number, Equipo> = {};
  rackMountedEquipos.forEach(eq => {
    if (eq.posicion_u_inicio && eq.posicion_u_inicio > 0) {
      const uStart = Math.min(eq.posicion_u_inicio, eq.posicion_u_fin || eq.posicion_u_inicio);
      const uEnd = Math.max(eq.posicion_u_inicio, eq.posicion_u_fin || eq.posicion_u_inicio);
      for (let u = uStart; u <= uEnd; u++) {
        occupiedSlotsMap[u] = eq;
      }
    }
  });

  const occupiedUCount = Object.keys(occupiedSlotsMap).length;
  const availableUCount = Math.max(0, totalU - occupiedUCount);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Carga equipos de bodega (no instalados o sin rack)
  const loadBodegaData = async () => {
    try {
      setLoadingBodega(true);
      const { data, error } = await supabase
        .from('equipos')
        .select('*, proveedor_compra:proveedores!proveedor_compra_id(*), proveedor_instalacion:proveedores!proveedor_instalacion_id(*), marca_rel:marcas(*), modelo_rel:modelos(*)')
        .or('rack_id.is.null,estado_ciclo_vida.neq.instalado')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBodegaEquipos(data || []);
    } catch (err) {
      console.error('Error loading bodega data:', err);
    } finally {
      setLoadingBodega(false);
    }
  };

  // Load rack equipment, providers, brands, models, cameras, and bodega
  const loadData = async (options?: { preserveSelectedId?: string; background?: boolean }) => {
    try {
      if (!options?.background) {
        setLoading(true);
      }
      const [
        { data: eqData },
        { data: provData },
        { data: marcasData },
        { data: modelosData },
        { data: camData },
        { data: puntosData },
        { data: spData }
      ] = await Promise.all([
        supabase
          .from('equipos')
          .select('*, proveedor_compra:proveedores!proveedor_compra_id(*), proveedor_instalacion:proveedores!proveedor_instalacion_id(*), marca_rel:marcas(*), modelo_rel:modelos(*)')
          .eq('rack_id', rack.id)
          .order('posicion_u_inicio', { ascending: false }),
        supabase.from('proveedores').select('*').order('nombre'),
        supabase.from('marcas').select('*').order('nombre'),
        supabase.from('modelos').select('*').order('nombre'),
        supabase
          .from('camaras')
          .select('*, patch_panel:equipos!patch_panel_id(*), switch:equipos!switch_id(*), nvr:equipos!nvr_id(*)')
          .or('estado_ciclo_vida.is.null,estado_ciclo_vida.eq.instalado'),
        supabase
          .from('puntos_red')
          .select('*')
          .or('estado_ciclo_vida.is.null,estado_ciclo_vida.eq.instalado'),
        supabase
          .from('v_puertos_switch_ocupacion')
          .select('*')
      ]);

      const loadedEquipos = (eqData || []).filter(
        eq => !eq.estado_ciclo_vida || eq.estado_ciclo_vida === 'instalado'
      );
      setEquipos(loadedEquipos);
      setProveedores(provData || []);
      setMarcas(marcasData || []);
      setModelos(modelosData || []);
      setCamaras(camData || []);
      setPuntosRed(puntosData || []);
      setSwitchPortsOccupation(spData || []);

      try {
        const savedUplinks = localStorage.getItem('cctv_nvr_uplinks');
        if (savedUplinks) setNvrUplinks(JSON.parse(savedUplinks));
      } catch (e) {
        console.error('Error reading nvr uplinks:', e);
      }

      // Maintain currently selected equipment if still present in rack, otherwise default to first switch or first device
      if (loadedEquipos.length > 0) {
        const targetId = options?.preserveSelectedId ?? selectedEquipoRef.current?.id;
        if (targetId) {
          const found = loadedEquipos.find(e => e.id === targetId);
          if (found) {
            setSelectedEquipo(found);
          } else {
            setSelectedEquipo(loadedEquipos.find(e => e.tipo === 'switch') || loadedEquipos[0]);
          }
        } else {
          setSelectedEquipo(loadedEquipos.find(e => e.tipo === 'switch') || loadedEquipos[0]);
        }
      } else {
        setSelectedEquipo(null);
      }

      await loadBodegaData();
    } catch (err) {
      console.error('Error loading rack elevation data:', err);
    } finally {
      if (!options?.background) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [rack.id]);

  // Mapa reactivo de ocupación física estricta y estándar de alerta 75% para cada equipo
  const equipmentOccupancyMap = useMemo(() => {
    const map: Record<string, EquipmentOccupancyInfo> = {};
    equipos.forEach(eq => {
      map[eq.id] = calculateEquipmentOccupancy(
        eq, 
        camaras, 
        nvrUplinks, 
        puntosRed, 
        switchPortsOccupation
      );
    });
    return map;
  }, [equipos, camaras, nvrUplinks, puntosRed, switchPortsOccupation]);

  // Montar equipo desde Bodega al Rack
  const handleMountFromBodega = async (eq: Equipo, targetUSuperior: number, uHeight: number) => {
    const uInferior = calculateUInferior(targetUSuperior, uHeight);
    const validation = validateUSlotAvailability(targetUSuperior, uHeight, totalU, occupiedSlotsMap);
    
    if (!validation.isValid) {
      showToast(validation.reason || 'Posición U no disponible', 'error');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('equipos')
        .update({
          rack_id: rack.id,
          posicion_u_inicio: uInferior,
          posicion_u_fin: targetUSuperior,
          estado_ciclo_vida: 'instalado'
        })
        .eq('id', eq.id)
        .select('*, proveedor_compra:proveedores!proveedor_compra_id(*), proveedor_instalacion:proveedores!proveedor_instalacion_id(*), marca_rel:marcas(*), modelo_rel:modelos(*)')
        .single();

      if (error) throw error;

      setEquipos(prev => [data, ...prev].sort((a, b) => (b.posicion_u_inicio || 0) - (a.posicion_u_inicio || 0)));
      setBodegaEquipos(prev => prev.filter(item => item.id !== eq.id));
      setSelectedEquipo(data);
      setEquipmentDetailTab('resumen');
      showToast(`Equipo ${data.codigo} montado exitosamente en U${uInferior} a U${targetUSuperior}`, 'success');
    } catch (err: any) {
      console.error('Error mounting equipment from bodega:', err);
      showToast('Error al montar equipo: ' + (err.message || 'Conflicto de U'), 'error');
      loadData();
    }
  };

  // Mover equipo ya montado dentro del rack (reordenar arriba o abajo)
  const handleMoveRackEquipment = async (equipoId: string, targetUSuperior: number, uHeight: number) => {
    const uInferior = calculateUInferior(targetUSuperior, uHeight);
    const validation = validateUSlotAvailability(targetUSuperior, uHeight, totalU, occupiedSlotsMap, equipoId);

    if (!validation.isValid) {
      showToast(validation.reason || 'Posición U no disponible', 'error');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('equipos')
        .update({
          posicion_u_inicio: uInferior,
          posicion_u_fin: targetUSuperior
        })
        .eq('id', equipoId)
        .select('*, proveedor_compra:proveedores!proveedor_compra_id(*), proveedor_instalacion:proveedores!proveedor_instalacion_id(*), marca_rel:marcas(*), modelo_rel:modelos(*)')
        .single();

      if (error) throw error;

      setEquipos(prev => prev.map(item => item.id === equipoId ? data : item).sort((a, b) => (b.posicion_u_inicio || 0) - (a.posicion_u_inicio || 0)));
      if (selectedEquipo?.id === equipoId) {
        setSelectedEquipo(data);
      }
      showToast(`Equipo ${data.codigo} reubicado en U${uInferior} a U${targetUSuperior}`, 'success');
    } catch (err: any) {
      console.error('Error moving equipment in rack:', err);
      showToast('Error al reubicar equipo: ' + (err.message || 'Conflicto de U'), 'error');
      loadData();
    }
  };

  // Desmontar equipo del rack y devolverlo a Bodega
  const handleDismantleToBodega = async (equipoId: string) => {
    try {
      const { data, error } = await supabase
        .from('equipos')
        .update({
          rack_id: null,
          posicion_u_inicio: null,
          posicion_u_fin: null,
          estado_ciclo_vida: 'en_bodega'
        })
        .eq('id', equipoId)
        .select('*, proveedor_compra:proveedores!proveedor_compra_id(*), proveedor_instalacion:proveedores!proveedor_instalacion_id(*), marca_rel:marcas(*), modelo_rel:modelos(*)')
        .single();

      if (error) throw error;

      setEquipos(prev => prev.filter(item => item.id !== equipoId));
      setBodegaEquipos(prev => [data, ...prev]);
      if (selectedEquipo?.id === equipoId) {
        setSelectedEquipo(null);
      }
      showToast(`Equipo ${data.codigo} desmontado del rack y transferido a Bodega`, 'success');
    } catch (err: any) {
      console.error('Error dismantling equipment:', err);
      showToast('Error al desmontar: ' + (err.message || ''), 'error');
    }
  };

  // Drag over slot handler
  const handleSlotDragOver = (e: React.DragEvent, targetU: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const activeItem = draggedItem || draggedItemRef.current;
    if (!activeItem) return;

    if (dragOverTarget?.targetU === targetU) return;

    const validation = validateUSlotAvailability(
      targetU,
      activeItem.uHeight,
      totalU,
      occupiedSlotsMap,
      activeItem.source === 'rack' ? activeItem.id : null
    );
    setDragOverTarget(validation);
  };

  // Drop on slot handler
  const handleSlotDrop = (e: React.DragEvent, targetU: number) => {
    e.preventDefault();
    e.stopPropagation();

    let activeItem = draggedItem || draggedItemRef.current;
    if (!activeItem) {
      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw) {
          activeItem = JSON.parse(raw);
        }
      } catch (err) {
        console.error('Error parsing drop data:', err);
      }
    }

    if (!activeItem) return;

    const validation = validateUSlotAvailability(
      targetU,
      activeItem.uHeight,
      totalU,
      occupiedSlotsMap,
      activeItem.source === 'rack' ? activeItem.id : null
    );

    if (!validation.isValid) {
      showToast(validation.reason || 'Posición no válida', 'error');
      setDraggedItem(null);
      draggedItemRef.current = null;
      setDragOverTarget(null);
      return;
    }

    if (activeItem.source === 'bodega') {
      const found = bodegaEquipos.find(item => item.id === activeItem!.id);
      if (found) {
        handleMountFromBodega(found, targetU, activeItem.uHeight);
      }
    } else if (activeItem.source === 'rack') {
      handleMoveRackEquipment(activeItem.id, targetU, activeItem.uHeight);
    }

    setDraggedItem(null);
    draggedItemRef.current = null;
    setDragOverTarget(null);
  };

  // Open modal to add equipment (supports standard rack equipment or floor/shaft non-rackeable equipment like tower UPS)
  const handleOpenAddModal = (options?: { isNonRackeable?: boolean; tipo?: TipoEquipo }) => {
    setIsEditing(false);
    setModoAvanzadoU(false);
    const isNonRackeable = Boolean(options?.isNonRackeable);
    const tipo = options?.tipo || (isNonRackeable ? 'ups' : 'switch');
    const initialHeight = isNonRackeable ? 0 : 1;
    const firstFreeSlot = isNonRackeable ? 0 : (findFirstAvailableUSlot(totalU, 1, occupiedSlotsMap) || totalU);
    setFormAlturaU(initialHeight || 1);

    setFormData({
      rack_id: rack.id,
      tipo: tipo,
      codigo: '',
      marca_id: null,
      modelo_id: null,
      marca: null,
      modelo: null,
      numero_serie: '',
      posicion_u_inicio: isNonRackeable ? 0 : calculateUInferior(firstFreeSlot, 1),
      posicion_u_fin: isNonRackeable ? 0 : firstFreeSlot,
      ip_gestion: '',
      vlan: '',
      puertos_totales: '',
      canales_totales: '',
      capacidad_va: tipo === 'ups' ? '1500' : '',
      fecha_compra: '',
      fecha_instalacion: new Date().toISOString().split('T')[0],
      proveedor_compra_id: null,
      proveedor_instalacion_id: null,
      rol_red: '',
      es_rackeable: !isNonRackeable,
    });
    setIsModalOpen(true);
  };

  // Open modal to edit selected equipment
  const handleOpenEditModal = (eq: Equipo) => {
    setIsEditing(true);
    setModoAvanzadoU(false);
    const matchedBrand = marcas.find(m => m.id === eq.marca_id || m.nombre === eq.marca);
    const matchedModel = modelos.find(m => m.id === eq.modelo_id || m.nombre === eq.modelo);

    const isNonRack = !eq.posicion_u_inicio || eq.posicion_u_inicio === 0 || eq.u_range === 'Piso / Shaft';
    const uStart = isNonRack ? 0 : (eq.posicion_u_inicio || 1);
    const uEnd = isNonRack ? 0 : (eq.posicion_u_fin || uStart);
    const currentHeight = isNonRack ? 0 : (uEnd - uStart + 1);
    setFormAlturaU(currentHeight || 1);

    setFormData({
      id: eq.id,
      rack_id: eq.rack_id || rack.id,
      tipo: eq.tipo,
      codigo: eq.codigo,
      marca_id: matchedBrand?.id || eq.marca_id || null,
      modelo_id: matchedModel?.id || eq.modelo_id || null,
      marca: matchedBrand?.nombre || eq.marca || null,
      modelo: matchedModel?.nombre || eq.modelo || null,
      numero_serie: eq.numero_serie || '',
      posicion_u_inicio: uStart,
      posicion_u_fin: uEnd,
      ip_gestion: eq.ip_gestion || '',
      vlan: eq.vlan !== null && eq.vlan !== undefined ? String(eq.vlan) : '',
      puertos_totales: eq.puertos_totales !== null && eq.puertos_totales !== undefined ? String(eq.puertos_totales) : '',
      canales_totales: eq.canales_totales !== null && eq.canales_totales !== undefined ? String(eq.canales_totales) : '',
      capacidad_va: eq.capacidad_va !== null && eq.capacidad_va !== undefined ? String(eq.capacidad_va) : '',
      fecha_compra: eq.fecha_compra ? eq.fecha_compra.split('T')[0] : '',
      fecha_instalacion: eq.fecha_instalacion ? eq.fecha_instalacion.split('T')[0] : '',
      proveedor_compra_id: eq.proveedor_compra_id || null,
      proveedor_instalacion_id: eq.proveedor_instalacion_id || null,
      rol_red: eq.rol_red || '',
      es_rackeable: !isNonRack,
    });
    setIsModalOpen(true);
  };

  // Quick update switch rol_red from Ficha de Equipo
  const handleUpdateRolRed = async (equipoId: string, nuevoRol: string) => {
    try {
      setSavingRolRed(true);
      const val = normalizeRolRedForDb(nuevoRol);
      const { error } = await supabase
        .from('equipos')
        .update({ rol_red: val })
        .eq('id', equipoId);

      if (error) throw error;

      setEquipos(prev => prev.map(eq => eq.id === equipoId ? { ...eq, rol_red: val } : eq));
      setSelectedEquipo(prev => prev && prev.id === equipoId ? { ...prev, rol_red: val } : prev);
      const displayLabel = formatRolRed(val);
      showToast(`Rol de red ${displayLabel ? `actualizado a "${displayLabel}"` : 'eliminado'} para el switch`);
    } catch (err: any) {
      console.error('Error updating switch rol_red:', err);
      alert('Error al actualizar el rol del switch: ' + (err.message || String(err)));
    } finally {
      setSavingRolRed(false);
    }
  };

  // When changing equipment type: clean hidden fields and update inferred U height
  const handleTipoChange = (newTipo: TipoEquipo) => {
    const newHeight = inferUHeight(formData.modelo, newTipo);
    setFormAlturaU(newHeight);
    const currentUSuperior = Number(formData.posicion_u_fin || totalU);
    const validUSup = currentUSuperior > 0 ? currentUSuperior : totalU;
    const newUInferior = calculateUInferior(validUSup, newHeight);

    const willBeRackeable = newTipo === 'ups' ? formData.es_rackeable !== false : true;

    setFormData(prev => ({
      ...prev,
      tipo: newTipo,
      modelo_id: null,
      modelo: null,
      es_rackeable: willBeRackeable,
      posicion_u_inicio: willBeRackeable ? (prev.posicion_u_inicio && prev.posicion_u_inicio > 0 ? prev.posicion_u_inicio : newUInferior) : 0,
      posicion_u_fin: willBeRackeable ? (prev.posicion_u_fin && prev.posicion_u_fin > 0 ? prev.posicion_u_fin : validUSup) : 0,
      puertos_totales: '',
      canales_totales: '',
      capacidad_va: newTipo === 'ups' ? '1500' : '',
      ip_gestion: '',
      vlan: '',
    }));
  };

  // When selecting a model: autocomplete defaults & infer U height
  const handleModeloChange = (modeloId: string, modeloName: string, defaults?: Partial<Modelo>) => {
    const newHeight = inferUHeight(modeloName, formData.tipo);
    setFormAlturaU(newHeight);
    const currentUSuperior = Number(formData.posicion_u_fin || totalU);
    const newUInferior = calculateUInferior(currentUSuperior, newHeight);

    setFormData(prev => ({
      ...prev,
      modelo_id: modeloId || null,
      modelo: modeloName || null,
      posicion_u_inicio: newUInferior,
      puertos_totales: defaults?.puertos_default ? String(defaults.puertos_default) : prev.puertos_totales,
      canales_totales: defaults?.canales_default ? String(defaults.canales_default) : prev.canales_totales,
      capacidad_va: defaults?.capacidad_va_default ? String(defaults.capacidad_va_default) : prev.capacidad_va,
    }));
  };

  // Submit Add/Edit form to Supabase
  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();

    const isNonRackeable = formData.tipo === 'ups' && formData.es_rackeable === false;

    if (!isNonRackeable) {
      const uSup = Number(formData.posicion_u_fin || totalU);
      const uInf = Number(formData.posicion_u_inicio || 1);
      const validation = validateUSlotAvailability(
        Math.max(uSup, uInf),
        Math.abs(uSup - uInf) + 1,
        totalU,
        occupiedSlotsMap,
        isEditing ? formData.id : null
      );

      if (!validation.isValid) {
        alert(`No se puede guardar: ${validation.reason}. Seleccione una ubicación disponible.`);
        return;
      }
    }

    try {
      setSaving(true);
      const isSwitch = formData.tipo === 'switch';
      const isPatchPanel = formData.tipo === 'patch_panel';
      const isNvr = formData.tipo === 'nvr';
      const isUps = formData.tipo === 'ups';

      const uSup = isNonRackeable ? null : Number(formData.posicion_u_fin || totalU);
      const uInf = isNonRackeable ? null : Number(formData.posicion_u_inicio || 1);

      const payload: any = {
        rack_id: rack.id,
        tipo: formData.tipo,
        codigo: formData.codigo.trim(),
        marca_id: formData.marca_id || null,
        modelo_id: formData.modelo_id || null,
        marca: formData.marca || null,
        modelo: formData.modelo || null,
        numero_serie: formData.numero_serie.trim() || null,
        posicion_u_inicio: isNonRackeable ? null : Math.min(uInf!, uSup!),
        posicion_u_fin: isNonRackeable ? null : Math.max(uInf!, uSup!),
        fecha_compra: formData.fecha_compra.trim() || null,
        fecha_instalacion: formData.fecha_instalacion.trim() || null,
        proveedor_compra_id: formData.proveedor_compra_id || null,
        proveedor_instalacion_id: formData.proveedor_instalacion_id || null,
        estado_ciclo_vida: 'instalado',
        puertos_totales: (isSwitch || isPatchPanel) && formData.puertos_totales.trim()
          ? Number(formData.puertos_totales) : null,
        canales_totales: isNvr && formData.canales_totales.trim()
          ? Number(formData.canales_totales) : null,
        capacidad_va: isUps && formData.capacidad_va.trim()
          ? Number(formData.capacidad_va) : null,
        ip_gestion: (isSwitch || isNvr) && formData.ip_gestion.trim()
          ? formData.ip_gestion.trim() : null,
        vlan: (isSwitch || isNvr) && formData.vlan.trim()
          ? Number(formData.vlan) : null,
        rol_red: isSwitch ? normalizeRolRedForDb(formData.rol_red) : null,
      };

      if (isEditing && formData.id) {
        const { data, error } = await supabase
          .from('equipos')
          .update(payload)
          .eq('id', formData.id)
          .select('*, proveedor_compra:proveedores!proveedor_compra_id(*), proveedor_instalacion:proveedores!proveedor_instalacion_id(*), marca_rel:marcas(*), modelo_rel:modelos(*)')
          .single();

        if (error) throw error;
        setEquipos(prev => prev.map(item => item.id === data.id ? data : item));
        setSelectedEquipo(data);
        showToast(`Equipo ${data.codigo} actualizado correctamente`);
      } else {
        const { data, error } = await supabase
          .from('equipos')
          .insert([payload])
          .select('*, proveedor_compra:proveedores!proveedor_compra_id(*), proveedor_instalacion:proveedores!proveedor_instalacion_id(*), marca_rel:marcas(*), modelo_rel:modelos(*)')
          .single();

        if (error) throw error;
        setEquipos(prev => [data, ...prev].sort((a, b) => (b.posicion_u_inicio || 0) - (a.posicion_u_inicio || 0)));
        setSelectedEquipo(data);
        showToast(isNonRackeable 
          ? `Equipo ${data.codigo} asociado al piso/shaft adyacente exitosamente`
          : `Equipo ${data.codigo} montado en rack exitosamente`);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving equipment:', err);
      alert('Error al guardar equipo: ' + (err.message || 'Verifique los campos'));
    } finally {
      setSaving(false);
    }
  };

  // Delete equipment permanently
  const handleDeleteEquipo = async (id: string) => {
    if (!window.confirm('¿Está seguro de desmontar y eliminar este equipo del rack?')) return;
    try {
      const { error } = await supabase.from('equipos').delete().eq('id', id);
      if (error) throw error;
      setEquipos(prev => prev.filter(e => e.id !== id));
      if (selectedEquipo?.id === id) {
        setSelectedEquipo(null);
      }
      showToast('Equipo eliminado del rack');
    } catch (err) {
      console.error('Error deleting equipment:', err);
      alert('Error al eliminar equipo');
    }
  };

  // Helpers for equipment icon, type label, and capacity in rack elevation faceplates
  const getEquipmentIcon = (tipo: string, isSelected: boolean, isPassiveOrPP: boolean) => {
    const iconColor = (darkColor: string, lightColor: string) => {
      if (isSelected) return 'text-white';
      return isPassiveOrPP ? lightColor : darkColor;
    };

    switch (tipo?.toLowerCase()) {
      case 'switch':
        return <Network className={`w-4 h-4 shrink-0 ${iconColor('text-blue-400', 'text-blue-600')}`} />;
      case 'patch_panel':
        return <Cable className={`w-4 h-4 shrink-0 ${iconColor('text-emerald-400', 'text-slate-700')}`} />;
      case 'nvr':
        return <HardDrive className={`w-4 h-4 shrink-0 ${iconColor('text-indigo-400', 'text-indigo-600')}`} />;
      case 'dvr':
        return <Disc className={`w-4 h-4 shrink-0 ${iconColor('text-rose-400', 'text-rose-600')}`} />;
      case 'ups':
        return <Zap className={`w-4 h-4 shrink-0 ${iconColor('text-amber-400', 'text-amber-600')}`} />;
      case 'organizador':
        return <AlignJustify className={`w-4 h-4 shrink-0 ${iconColor('text-slate-300', 'text-slate-600')}`} />;
      case 'mufa':
        return <Boxes className={`w-4 h-4 shrink-0 ${iconColor('text-cyan-400', 'text-cyan-600')}`} />;
      case 'servidor':
        return <Server className={`w-4 h-4 shrink-0 ${iconColor('text-purple-400', 'text-purple-600')}`} />;
      case 'pdu':
        return <Power className={`w-4 h-4 shrink-0 ${iconColor('text-orange-400', 'text-orange-600')}`} />;
      case 'router':
        return <Router className={`w-4 h-4 shrink-0 ${iconColor('text-sky-400', 'text-sky-600')}`} />;
      case 'bandeja':
        return <Layers className={`w-4 h-4 shrink-0 ${iconColor('text-teal-400', 'text-teal-600')}`} />;
      default:
        return <Cpu className={`w-4 h-4 shrink-0 ${iconColor('text-slate-400', 'text-slate-600')}`} />;
    }
  };

  const getTipoEquipoLabel = (tipo: string): string => {
    switch (tipo?.toLowerCase()) {
      case 'switch':
        return 'Switch';
      case 'patch_panel':
        return 'Patch Panel';
      case 'nvr':
        return 'NVR';
      case 'dvr':
        return 'DVR';
      case 'ups':
        return 'UPS';
      case 'organizador':
        return 'Organizador';
      case 'mufa':
        return 'Mufa';
      case 'servidor':
        return 'Servidor';
      case 'pdu':
        return 'PDU';
      case 'router':
        return 'Router';
      case 'bandeja':
        return 'Bandeja';
      case 'otro':
        return 'Dispositivo';
      default:
        return tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1).replace(/_/g, ' ') : 'Dispositivo';
    }
  };

  const getCapacidadLabel = (eq: Equipo): string | null => {
    const parts: string[] = [];
    const p = eq.puertos_totales ?? eq.modelo_rel?.puertos_default;
    const c = eq.canales_totales ?? eq.modelo_rel?.canales_default;

    if (p !== null && p !== undefined && Number(p) > 0) {
      const numP = Number(p);
      parts.push(`${numP} ${numP === 1 ? 'puerto' : 'puertos'}`);
    }

    if (c !== null && c !== undefined && Number(c) > 0) {
      const numC = Number(c);
      parts.push(`${numC} ${numC === 1 ? 'canal' : 'canales'}`);
    }

    return parts.length > 0 ? `(${parts.join(' / ')})` : null;
  };

  // Render the rack elevation rows from totalU down to 1
  const renderRackRows = () => {
    const rows = [];
    let currentU = totalU;
    const isDraggingActive = Boolean(draggedItem);

    while (currentU >= 1) {
      const slotTopU = currentU;
      const eq = occupiedSlotsMap[currentU];

      if (eq) {
        const uStart = Math.min(eq.posicion_u_inicio || 1, eq.posicion_u_fin || eq.posicion_u_inicio || 1);
        const uEnd = Math.max(eq.posicion_u_inicio || 1, eq.posicion_u_fin || eq.posicion_u_inicio || 1);
        const uHeight = uEnd - uStart + 1;
        const isSelected = selectedEquipo?.id === eq.id;
        const isThisItemDragged = draggedItem?.id === eq.id;

        // Visual theme based on equipment type
        let bgStyle = 'bg-slate-800 text-white border-slate-700';
        let badgeColor = 'bg-slate-700 text-slate-200';
        let accentBorder = 'border-l-4 border-l-slate-400';

        if (eq.tipo === 'switch') {
          bgStyle = isSelected 
            ? 'bg-blue-600 text-white ring-2 ring-blue-400' 
            : 'bg-[#1e293b] text-slate-100 hover:bg-[#283850]';
          badgeColor = isSelected ? 'bg-blue-800 text-blue-100' : 'bg-blue-950 text-blue-300 border border-blue-800';
          accentBorder = 'border-l-4 border-l-blue-500';
        } else if (eq.tipo === 'patch_panel') {
          bgStyle = isSelected 
            ? 'bg-slate-700 text-white ring-2 ring-slate-400' 
            : 'bg-[#f1f5f9] text-slate-800 border-slate-300 hover:bg-[#e2e8f0]';
          badgeColor = isSelected ? 'bg-slate-900 text-slate-100' : 'bg-slate-200 text-slate-700 border border-slate-300';
          accentBorder = 'border-l-4 border-l-slate-500';
        } else if (eq.tipo === 'nvr') {
          bgStyle = isSelected 
            ? 'bg-indigo-900 text-white ring-2 ring-indigo-400' 
            : 'bg-[#0f172a] text-slate-200 hover:bg-[#1e293b]';
          badgeColor = 'bg-indigo-950 text-indigo-300 border border-indigo-700';
          accentBorder = 'border-l-4 border-l-indigo-500';
        } else if (eq.tipo === 'ups') {
          bgStyle = isSelected 
            ? 'bg-slate-900 text-white ring-2 ring-amber-400' 
            : 'bg-[#18181b] text-slate-200 hover:bg-[#27272a]';
          badgeColor = 'bg-amber-950 text-amber-300 border border-amber-800';
          accentBorder = 'border-l-4 border-l-amber-500';
        } else if (eq.tipo === 'organizador') {
          bgStyle = 'bg-[#334155] text-slate-300 hover:bg-[#475569]';
          badgeColor = 'bg-slate-600 text-slate-200';
          accentBorder = 'border-l-4 border-l-slate-400';
        } else if (eq.tipo === 'mufa') {
          bgStyle = isSelected 
            ? 'bg-cyan-900 text-white ring-2 ring-cyan-400' 
            : 'bg-[#15232d] text-cyan-200 hover:bg-[#1f3647]';
          badgeColor = 'bg-cyan-950 text-cyan-300 border border-cyan-700';
          accentBorder = 'border-l-4 border-l-cyan-500';
        }

        const isPassiveOrPP = eq.tipo === 'patch_panel';
        const textColor = isPassiveOrPP && !isSelected ? 'text-slate-800' : 'text-white';
        const capacidadStr = getCapacidadLabel(eq);

        const equipmentTopU = uEnd;
        rows.push(
          <div
            key={`eq-${eq.id}-${slotTopU}`}
            onClick={() => {
              setSelectedEquipo(eq);
              if (eq.tipo !== 'switch') {
                setEquipmentDetailTab('resumen');
              }
            }}
            draggable={true}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', JSON.stringify({
                id: eq.id,
                source: 'rack',
                codigo: eq.codigo,
                tipo: eq.tipo,
                uHeight: uHeight
              }));
              const item = {
                id: eq.id,
                source: 'rack' as const,
                codigo: eq.codigo,
                tipo: eq.tipo,
                uHeight: uHeight
              };
              draggedItemRef.current = item;
              setDraggedItem(item);
            }}
            onDragEnd={() => {
              draggedItemRef.current = null;
              setDraggedItem(null);
              setDragOverTarget(null);
            }}
            onDragOver={(e) => handleSlotDragOver(e, equipmentTopU)}
            onDrop={(e) => handleSlotDrop(e, equipmentTopU)}
            className={`group flex border-b border-slate-300 text-xs font-mono transition-all cursor-grab active:cursor-grabbing select-none ${bgStyle} ${accentBorder} ${
              isThisItemDragged ? 'opacity-30 ring-2 ring-dashed ring-amber-400' : ''
            }`}
            style={{ minHeight: `${uHeight * 30}px` }}
          >
            {/* Left U rail marker */}
            <div className="w-10 flex flex-col justify-between items-center py-1 bg-slate-200/90 text-slate-700 font-bold border-r border-slate-300 select-none text-[10px]">
              <span>{String(uEnd).padStart(2, '0')}U</span>
              {uHeight > 1 && <span>{String(uStart).padStart(2, '0')}U</span>}
            </div>

            {/* Equipment Faceplate */}
            <div className="flex-1 px-3 py-1 flex items-center justify-between overflow-hidden">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div 
                  className="text-slate-400 group-hover:text-amber-400 cursor-grab shrink-0" 
                  title="Arrastrar para mover verticalmente o a Bodega"
                >
                  <GripVertical className="w-4 h-4" />
                </div>

                {/* Ícono identificativo para cada dispositivo */}
                {getEquipmentIcon(eq.tipo, isSelected, isPassiveOrPP)}
                
                {/* Tipo de dispositivo, Código y Puertos/Canales entre paréntesis */}
                <div className="flex items-center gap-2 truncate">
                  <span className={`font-bold tracking-tight text-xs shrink-0 ${textColor}`}>
                    {getTipoEquipoLabel(eq.tipo)}
                  </span>
                  <span className={`font-semibold text-xs font-mono shrink-0 ${textColor}`}>
                    {eq.codigo}
                  </span>
                  {capacidadStr && (
                    <span className={`text-[11px] font-mono shrink-0 ${
                      isSelected 
                        ? 'text-blue-100 font-semibold' 
                        : (isPassiveOrPP ? 'text-blue-700 font-semibold' : 'text-blue-300 font-medium')
                    }`}>
                      {capacidadStr}
                    </span>
                  )}
                </div>
              </div>

              {/* Badges / Bay visuals */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Ocupación con alerta estándar 75% (<73% Verde, 74-77% Amarillo, >=78% Rojo) */}
                {(() => {
                  const occ = equipmentOccupancyMap[eq.id];
                  if (!occ || occ.totalCapacity <= 0) return null;
                  return (
                    <div 
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold flex items-center gap-1.5 border shadow-2xs ${
                        occ.status === 'critico'
                          ? 'bg-rose-950/90 text-rose-100 border-rose-500/80 animate-pulse'
                          : occ.status === 'alerta'
                          ? 'bg-amber-950/90 text-amber-100 border-amber-500/80'
                          : 'bg-emerald-950/90 text-emerald-200 border-emerald-600/80'
                      }`}
                      title={`Ocupación: ${occ.occupiedCount}/${occ.totalCapacity} (${occ.percentage}%). Estándar 75%: ${occ.statusLabel}. ${occ.recommendation}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        occ.status === 'critico' 
                          ? 'bg-rose-400' 
                          : occ.status === 'alerta' 
                          ? 'bg-amber-400' 
                          : 'bg-emerald-400'
                      }`} />
                      <span>{occ.percentage}%</span>
                      <span className="hidden sm:inline text-[9px] opacity-80">({occ.occupiedCount}/{occ.totalCapacity})</span>
                    </div>
                  );
                })()}

                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${badgeColor}`}>
                  {isSelected ? 'SELECCIONADO' : `${uHeight}U`}
                </span>
              </div>
            </div>

            {/* Right U rail marker */}
            <div className="w-10 flex flex-col justify-between items-center py-1 bg-slate-200/90 text-slate-700 font-bold border-l border-slate-300 select-none text-[10px]">
              <span>{String(uEnd).padStart(2, '0')}U</span>
              {uHeight > 1 && <span>{String(uStart).padStart(2, '0')}U</span>}
            </div>
          </div>
        );

        currentU = uStart - 1;
      } else {
        // Ranuras libres
        // Durante drag o en modo individual, mostramos ranura por ranura para permitir arrastre preciso
        if (slotDisplayMode === 'individual' || isDraggingActive) {
          const singleSlotU = slotTopU;
          const isPartOfLandingFootprint = 
            dragOverTarget && 
            singleSlotU >= dragOverTarget.uInferior && 
            singleSlotU <= dragOverTarget.targetU;

          const isLandingTop = dragOverTarget && singleSlotU === dragOverTarget.targetU;

          let slotStyle = "bg-slate-900/40 hover:bg-slate-800/80 border-b border-slate-800/80 text-slate-500";
          if (isPartOfLandingFootprint) {
            slotStyle = dragOverTarget.isValid
              ? "bg-emerald-500/25 border-emerald-400 text-emerald-200 border-dashed border-2 ring-1 ring-emerald-400/50"
              : "bg-rose-500/25 border-rose-400 text-rose-200 border-dashed border-2 ring-1 ring-rose-400/50";
          }

          rows.push(
            <div
              key={`free-${singleSlotU}`}
              onDragOver={(e) => handleSlotDragOver(e, singleSlotU)}
              onDrop={(e) => handleSlotDrop(e, singleSlotU)}
              className={`flex text-xs font-mono h-7.5 transition-all select-none ${slotStyle}`}
            >
              <div className="w-10 flex items-center justify-center bg-slate-800/80 text-slate-400 border-r border-slate-700 text-[10px] pointer-events-none select-none">
                {String(singleSlotU).padStart(2, '0')}U
              </div>
              <div className="flex-1 flex items-center justify-center text-[10px] px-2 truncate pointer-events-none select-none">
                {isLandingTop ? (
                  dragOverTarget.isValid ? (
                    <span className="text-emerald-300 font-bold flex items-center gap-1.5 animate-pulse">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      Soltar aquí: {draggedItem?.codigo} (U{dragOverTarget.uInferior} - U{dragOverTarget.targetU})
                    </span>
                  ) : (
                    <span className="text-rose-300 font-bold flex items-center gap-1.5 animate-pulse">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      {dragOverTarget.reason || 'Espacio no disponible'}
                    </span>
                  )
                ) : isPartOfLandingFootprint ? (
                  <span className={dragOverTarget.isValid ? 'text-emerald-400' : 'text-rose-400'}>
                    ·
                  </span>
                ) : (
                  <span className="text-slate-500 opacity-60">
                    [ U{String(singleSlotU).padStart(2, '0')} Libre · Arrastra aquí ]
                  </span>
                )}
              </div>
              <div className="w-10 flex items-center justify-center bg-slate-800/80 text-slate-400 border-l border-slate-700 text-[10px] pointer-events-none select-none">
                {String(singleSlotU).padStart(2, '0')}U
              </div>
            </div>
          );
          currentU--;
        } else {
          // Modo agrupado cuando no hay arrastre activo
          let freeEnd = slotTopU;
          let freeStart = slotTopU;
          while (freeStart > 1 && !occupiedSlotsMap[freeStart - 1]) {
            freeStart--;
          }
          const freeCount = freeEnd - freeStart + 1;
          const rangeTopU = freeEnd;

          if (freeCount >= 3) {
            rows.push(
              <div
                key={`free-range-${freeEnd}-${freeStart}`}
                onDragOver={(e) => handleSlotDragOver(e, rangeTopU)}
                onDrop={(e) => handleSlotDrop(e, rangeTopU)}
                className="flex border-b border-slate-800/80 bg-slate-900/30 hover:bg-slate-800/60 text-slate-400 text-xs font-mono select-none transition-colors"
                style={{ minHeight: `${Math.min(freeCount, 3) * 26}px` }}
              >
                <div className="w-10 flex flex-col justify-between items-center py-1 bg-slate-800/80 text-slate-400 border-r border-slate-700 text-[10px] pointer-events-none">
                  <span>{String(freeEnd).padStart(2, '0')}U</span>
                  <span>{String(freeStart).padStart(2, '0')}U</span>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-[11px] text-slate-400 py-1 gap-1 pointer-events-none">
                  <span>[ {freeCount}U DISPONIBLES · U{String(freeStart).padStart(2, '0')} A U{String(freeEnd).padStart(2, '0')} ]</span>
                  <span className="text-[9px] text-slate-500 font-sans">
                    Arrastra un equipo aquí o haz clic en "+ Registrar Montaje"
                  </span>
                </div>
                <div className="w-10 flex flex-col justify-between items-center py-1 bg-slate-800/80 text-slate-400 border-l border-slate-700 text-[10px] pointer-events-none">
                  <span>{String(freeEnd).padStart(2, '0')}U</span>
                  <span>{String(freeStart).padStart(2, '0')}U</span>
                </div>
              </div>
            );
            currentU = freeStart - 1;
          } else {
            const singleSlotU = slotTopU;
            rows.push(
              <div
                key={`free-${singleSlotU}`}
                onDragOver={(e) => handleSlotDragOver(e, singleSlotU)}
                onDrop={(e) => handleSlotDrop(e, singleSlotU)}
                className="flex border-b border-slate-800/80 bg-slate-900/40 hover:bg-slate-800/80 text-slate-400 text-xs font-mono h-7 select-none"
              >
                <div className="w-10 flex items-center justify-center bg-slate-800/80 text-slate-400 border-r border-slate-700 text-[10px] pointer-events-none">
                  {String(singleSlotU).padStart(2, '0')}U
                </div>
                <div className="flex-1 flex items-center justify-center text-[10px] text-slate-500 pointer-events-none">
                  [ U{String(singleSlotU).padStart(2, '0')} Disponible ]
                </div>
                <div className="w-10 flex items-center justify-center bg-slate-800/80 text-slate-400 border-l border-slate-700 text-[10px] pointer-events-none">
                  {String(singleSlotU).padStart(2, '0')}U
                </div>
              </div>
            );
            currentU--;
          }
        }
      }
    }
    return rows;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-xl font-mono text-xs flex items-center gap-2 border animate-in slide-in-from-top-2 duration-200 ${
          toast.type === 'success'
            ? 'bg-emerald-900 text-emerald-100 border-emerald-500 shadow-emerald-950/40'
            : 'bg-rose-900 text-rose-100 border-rose-500 shadow-rose-950/40'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBackToTree}
            className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 text-slate-600 transition-colors"
            title="Volver al Explorador"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-600" />
              <h1 className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                Rack {rack.codigo}
              </h1>
              <span className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                Gabinete {totalU}U
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {rack.ubicacion_especifica || 'Sala Técnica'} · {rack.formato || 'Bastidor Estándar 19"'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Botón Bitácora del Rack */}
          <button
            type="button"
            onClick={() => setShowRackHistoryModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded transition-colors shadow-2xs cursor-pointer"
            title="Ver Bitácora Técnica e Historial de Intervenciones de este Rack"
          >
            <Wrench className="w-4 h-4 text-blue-600" />
            <span>Bitácora Rack</span>
          </button>

          {/* Botón para abrir el Cajón de Bodega deslizable */}
          <button
            type="button"
            onClick={() => setIsBodegaDrawerOpen(prev => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors shadow-2xs border cursor-pointer ${
              isBodegaDrawerOpen
                ? 'bg-amber-600 text-white border-amber-600 ring-2 ring-amber-400'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
            }`}
            title={isBodegaDrawerOpen ? "Cerrar panel de bodega" : "Abrir panel deslizable de bodega"}
          >
            <Archive className="w-4 h-4 text-amber-600 group-hover:text-amber-800" />
            <span>Cajón Bodega ({bodegaEquipos.length})</span>
          </button>

          {/* Botón de acceso directo para UPS Torre / Equipo No Rackeable */}
          <button
            type="button"
            onClick={() => handleOpenAddModal({ isNonRackeable: true, tipo: 'ups' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded transition-colors shadow-2xs"
            title="Registrar una UPS formato torre u otro equipo en el piso del shaft al lado del bastidor"
          >
            <Zap className="w-4 h-4 text-amber-600" />
            <span>+ UPS Torre / Shaft</span>
          </button>

          <button 
            onClick={() => handleOpenAddModal({ isNonRackeable: false })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ Registrar Montaje</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Conditional Layout (Expanded Puertos vs 2-Column Resumen) */}
      {isPuertosTabActive && selectedEquipo ? (
        /* ============================================================ */
        /* LAYOUT EXPANDIDO: PESTAÑA "PUERTOS Y VLANS" ACTIVA           */
        /* Rack compacto arriba + Tabla Puertos/VLANs ancho completo    */
        /* ============================================================ */
        <div className="space-y-6">
          {/* BLOQUE COMPACTO SUPERIOR */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Columna Izquierda: Elevación del Rack Compacta con scroll interno */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-slate-200 mb-3 gap-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-600" />
                  <h2 className="text-xs font-bold text-slate-900 tracking-tight">
                    Elevación Rack {rack.codigo} ({totalU}U a 1U)
                  </h2>
                  <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.2 rounded font-semibold">
                    Modo Compacto
                  </span>
                </div>
                <div className="flex items-center border border-slate-200 rounded bg-slate-50 p-0.5 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => setSlotDisplayMode('individual')}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                      slotDisplayMode === 'individual'
                        ? 'bg-white shadow-2xs font-bold text-slate-800 border border-slate-200'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    1U
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlotDisplayMode('compact')}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                      slotDisplayMode === 'compact'
                        ? 'bg-white shadow-2xs font-bold text-slate-800 border border-slate-200'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Agrupado
                  </button>
                </div>
              </div>

              {/* Physical Cabinet Frame compacto con scroll */}
              <div className="bg-[#0f172a] p-2.5 rounded-lg border-2 border-slate-700 shadow-sm">
                <div className="bg-slate-800 text-slate-300 py-1 px-2.5 rounded-t border-b border-slate-700 text-center text-[9px] font-mono font-bold tracking-widest uppercase flex items-center justify-between">
                  <span>RIEL IZQ</span>
                  <span className="text-white">BASTIDOR {totalU}U (19")</span>
                  <span>RIEL DER</span>
                </div>
                <div className="border border-slate-700 bg-slate-900 max-h-[290px] overflow-y-auto pr-0.5 scrollbar-thin">
                  {renderRackRows()}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 text-center font-mono">
                💡 Haz clic en otro switch para inspeccionar sus puertos, o pulsa "Ver Resumen" para volver al panel lateral.
              </p>
            </div>

            {/* Columna Derecha: Tarjeta de Resumen y Control del Switch */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col justify-between">
              <div>
                {/* Header con cambio de Pestaña */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3 gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                      <Network className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold font-mono text-slate-900">
                          {selectedEquipo.codigo}
                        </span>
                        {selectedEquipo.rol_red && (
                          <span className={`text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full border shadow-2xs ${
                            normalizeRolRedForDb(selectedEquipo.rol_red) === 'core'
                              ? 'bg-purple-100 text-purple-800 border-purple-200'
                              : normalizeRolRedForDb(selectedEquipo.rol_red) === 'distribucion'
                              ? 'bg-blue-100 text-blue-800 border-blue-200'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}>
                            {formatRolRed(selectedEquipo.rol_red)}
                          </span>
                        )}
                        <span className="text-xs font-mono font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          U{String(selectedEquipo.posicion_u_inicio || 1).padStart(2, '0')}
                          {selectedEquipo.posicion_u_fin && selectedEquipo.posicion_u_fin !== selectedEquipo.posicion_u_inicio && (
                            ` - U${String(selectedEquipo.posicion_u_fin).padStart(2, '0')}`
                          )}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 font-sans">
                        {selectedEquipo.marca_rel?.nombre || selectedEquipo.marca} {selectedEquipo.modelo_rel?.nombre || selectedEquipo.modelo}
                      </span>
                    </div>
                  </div>

                  {/* Pestañas: Resumen vs Puertos y VLANs */}
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setEquipmentDetailTab('resumen')}
                      className="px-2.5 py-1 rounded text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white transition-all flex items-center gap-1 cursor-pointer"
                      title="Volver a la vista de 2 columnas con resumen detallado"
                    >
                      <Server className="w-3.5 h-3.5" />
                      <span>Ver Resumen</span>
                    </button>
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded text-xs font-bold bg-indigo-600 text-white shadow-xs flex items-center gap-1 cursor-default"
                    >
                      <Cpu className="w-3.5 h-3.5" />
                      <span>Puertos y VLANs</span>
                    </button>
                  </div>
                </div>

                {/* Métricas rápidas de ocupación física */}
                {(() => {
                  const occ = equipmentOccupancyMap[selectedEquipo.id];
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 font-mono text-xs">
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 block uppercase">Capacidad</span>
                        <span className="font-bold text-slate-800 text-sm">
                          {selectedEquipo.puertos_totales || 24} Puertos
                        </span>
                      </div>
                      <div className="bg-blue-50/70 p-2.5 rounded border border-blue-200">
                        <span className="text-[10px] text-blue-600 block uppercase">Ocupados</span>
                        <span className="font-bold text-blue-900 text-sm">
                          {occ?.occupiedCount ?? 0} ({occ?.percentage ?? 0}%)
                        </span>
                      </div>
                      <div className="bg-emerald-50/70 p-2.5 rounded border border-emerald-200">
                        <span className="text-[10px] text-emerald-600 block uppercase">Libres</span>
                        <span className="font-bold text-emerald-900 text-sm">
                          {occ?.availableCount ?? (selectedEquipo.puertos_totales || 24)}
                        </span>
                      </div>
                      <div className="bg-indigo-50/70 p-2.5 rounded border border-indigo-200">
                        <span className="text-[10px] text-indigo-600 block uppercase">IP Gestión</span>
                        <span className="font-bold text-indigo-900 text-[11px] truncate block" title={selectedEquipo.ip_gestion || ''}>
                          {selectedEquipo.ip_gestion || 'No asignada'}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Selector rápido de switches del rack */}
                {availableSwitchesInRack.length > 1 && (
                  <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono mb-2">
                    <span className="text-slate-500 text-[11px] shrink-0 font-sans">Switches en este Rack:</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {availableSwitchesInRack.map(sw => (
                        <button
                          key={sw.id}
                          type="button"
                          onClick={() => setSelectedEquipo(sw)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                            sw.id === selectedEquipo.id
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-blue-50 hover:text-blue-700'
                          }`}
                        >
                          <span>{sw.codigo}</span>
                          {sw.rol_red && (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded ${
                              sw.id === selectedEquipo.id
                                ? 'bg-blue-800 text-blue-100'
                                : normalizeRolRedForDb(sw.rol_red) === 'core'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : normalizeRolRedForDb(sw.rol_red) === 'distribucion'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              {formatRolRed(sw.rol_red)}
                            </span>
                          )}
                          {sw.posicion_u_inicio ? <span className="opacity-75 font-normal text-[10px]">(U{sw.posicion_u_inicio})</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Botones de acción inferior */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigateToPorts(selectedEquipo.id)}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5 text-blue-600" />
                    <span>Mapeo Cruzado (Cross-Connect)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(selectedEquipo)}
                    className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5 text-slate-500" />
                    <span>Editar Parámetros</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setEquipmentDetailTab('resumen')}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>Volver a Resumen</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* TABLA DE PUERTOS Y VLANS A ANCHO COMPLETO */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 mb-4 gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-900 tracking-tight font-mono">
                  Puertos y VLANs — {selectedEquipo.codigo} ({selectedEquipo.marca_rel?.nombre || selectedEquipo.marca} {selectedEquipo.modelo_rel?.nombre || selectedEquipo.modelo})
                </h2>
                <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-bold">
                  Ancho Completo
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEquipmentDetailTab('resumen')}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 self-start sm:self-auto cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver a vista de 2 columnas</span>
              </button>
            </div>

            <SwitchPortsTable
              switchEquipo={selectedEquipo}
              availableSwitches={equipos.filter(e => e.tipo === 'switch')}
              onSelectSwitch={(sw) => setSelectedEquipo(sw)}
              onPortsUpdated={() => {
                loadData({ preserveSelectedId: selectedEquipo.id, background: true });
              }}
            />
          </div>
        </div>
      ) : (
        /* ============================================================ */
        /* LAYOUT ESTÁNDAR: 2 COLUMNAS (Rack a la izq, Panel a la der) */
        /* ============================================================ */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: Bastidor 19" Rack Elevation */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 mb-4 gap-2">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Elevación Frontal ({totalU}U a 1U)
              </h2>
            </div>

            {/* Selector de visualización y Leyenda */}
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <div className="flex items-center border border-slate-200 rounded bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setSlotDisplayMode('individual')}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    slotDisplayMode === 'individual'
                      ? 'bg-white shadow-2xs font-bold text-slate-800 border border-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Muestra cada unidad U por separado para arrastrar y soltar con precisión"
                >
                  Ranuras 1U
                </button>
                <button
                  type="button"
                  onClick={() => setSlotDisplayMode('compact')}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    slotDisplayMode === 'compact'
                      ? 'bg-white shadow-2xs font-bold text-slate-800 border border-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Agrupa espacios vacíos continuos"
                >
                  Agrupado
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-2 text-slate-500 ml-2">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-blue-600 rounded-xs" /> Activo
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-slate-200 border border-slate-400 rounded-xs" /> Pasivo
                </span>
              </div>
            </div>
          </div>

          {/* Banner de Ayuda Drag and Drop */}
          <div className="mb-3 px-3 py-2 bg-blue-50/70 border border-blue-200 rounded text-[11px] font-mono text-blue-900 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <GripVertical className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>
                <strong>Arrastra y Suelta:</strong> Mueve equipos arriba/abajo en el rack, o tráelos desde el <strong>Cajón de Bodega</strong>.
              </span>
            </span>
            {draggedItem && (
              <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded border border-amber-300 animate-pulse">
                Moviendo {draggedItem.codigo} ({draggedItem.uHeight}U)
              </span>
            )}
          </div>

          {/* Physical Cabinet Frame */}
          <div className="bg-[#0f172a] p-3 rounded-lg border-2 border-slate-700 shadow-md">
            {/* Top Cabinet Header */}
            <div className="bg-slate-800 text-slate-300 py-1.5 px-3 rounded-t border-b border-slate-700 text-center text-[10px] font-mono font-bold tracking-widest uppercase flex items-center justify-between">
              <span>RIEL FRONTAL IZQUIERDO</span>
              <span className="text-white">BASTIDOR {totalU}U ESTÁNDAR 19"</span>
              <span>RIEL FRONTAL DERECHO</span>
            </div>

            {/* Slots Container con scroll suave */}
            <div className="border border-slate-700 bg-slate-900 max-h-[720px] overflow-y-auto pr-0.5 scrollbar-thin">
              {renderRackRows()}
            </div>

            {/* Bottom Cabinet Zocalo */}
            <div className="bg-slate-800 text-slate-400 py-1 px-3 rounded-b border-t border-slate-700 text-center text-[9px] font-mono tracking-widest uppercase mt-0.5">
              ZÓCALO / BANDEJA PASAMUROS INFERIOR
            </div>

            {/* SECCIÓN PISO DEL SHAFT / EQUIPAMIENTO ADYACENTE NO RACKEABLE (ej. UPS TORRE) */}
            <div className="mt-3 pt-3 border-t border-slate-700">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[11px] font-mono font-bold tracking-wide uppercase text-amber-300 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    Piso del Shaft · Equipamiento Adyacente (No Rackeable)
                  </span>
                  <span className="text-[9px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                    0U · Al lado del bastidor
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenAddModal({ isNonRackeable: true, tipo: 'ups' })}
                  className="text-[10px] font-mono text-amber-300 hover:text-amber-200 flex items-center gap-1 bg-amber-950/60 hover:bg-amber-950 px-2 py-0.5 rounded border border-amber-800/80 transition-colors"
                  title="Registrar una UPS formato torre u otro equipo en el piso del shaft"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Agregar UPS Torre / Piso</span>
                </button>
              </div>

              {adjacentFloorEquipos.length === 0 ? (
                <div 
                  onClick={() => handleOpenAddModal({ isNonRackeable: true, tipo: 'ups' })}
                  className="p-3 bg-slate-900/60 border border-dashed border-slate-700 hover:border-amber-500/60 rounded-lg text-center cursor-pointer transition-all group"
                >
                  <div className="flex items-center justify-center gap-2 text-slate-400 group-hover:text-amber-300 text-xs">
                    <Zap className="w-4 h-4 text-amber-500/70 group-hover:text-amber-400" />
                    <span>¿Tienes una <strong>UPS Torre</strong> al lado del bastidor en el shaft?</span>
                    <span className="text-[10px] text-amber-400 underline font-bold ml-1">
                      Asóciala aquí sin consumir unidades U
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Refleja el respaldo eléctrico en el diagrama manteniendo la capacidad 19" ({totalU}U) exacta.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {adjacentFloorEquipos.map(eq => {
                    const isSelected = selectedEquipo?.id === eq.id;
                    const capacidadStr = getCapacidadLabel(eq);
                    return (
                      <div
                        key={eq.id}
                        onClick={() => {
                          setSelectedEquipo(eq);
                          setEquipmentDetailTab('resumen');
                        }}
                        className={`group relative p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                          isSelected
                            ? 'bg-amber-950/40 border-amber-500 ring-2 ring-amber-400/60 text-white'
                            : 'bg-slate-900/90 hover:bg-slate-800/90 border-slate-700 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            {/* Tower chassis badge/icon */}
                            <div className={`p-2 rounded-md ${isSelected ? 'bg-amber-600 text-white' : 'bg-amber-950/80 text-amber-400 border border-amber-700/60'} shrink-0 shadow-xs`}>
                              <Zap className="w-4.5 h-4.5" />
                            </div>

                            {/* Info: Icon, Type, Code, Capacity */}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-xs text-white">
                                  {getTipoEquipoLabel(eq.tipo)} (Torre / Piso Shaft)
                                </span>
                                <span className="font-mono font-bold text-xs text-amber-300 bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-800">
                                  {eq.codigo}
                                </span>
                                {capacidadStr && (
                                  <span className="text-[11px] font-mono text-blue-300">
                                    {capacidadStr}
                                  </span>
                                )}
                                {eq.capacidad_va && (
                                  <span className="text-[11px] font-mono text-amber-400 font-semibold">
                                    ({eq.capacidad_va} VA)
                                  </span>
                                )}
                              </div>

                              {/* Power line indicator to Rack */}
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                                <span className="text-amber-400 font-mono">⚡ Alimentación AC:</span>
                                <span className="text-slate-300">Conectada al PDU / Rieles del Bastidor {rack.codigo}</span>
                                <span className="text-slate-500">•</span>
                                <span className="text-slate-400">Piso del shaft</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-slate-800 text-amber-300 border border-slate-600">
                              NO RACKEABLE · 0U
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Ficha Técnica del Equipo (Pestañas Resumen / Puertos y VLANs) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Equipment Tab selector */}
          {selectedEquipo && (
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setEquipmentDetailTab('resumen')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 border cursor-pointer ${
                  equipmentDetailTab === 'resumen'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Resumen ({selectedEquipo.codigo})</span>
              </button>

              {selectedEquipo.tipo === 'switch' && (
                <button
                  type="button"
                  onClick={() => setEquipmentDetailTab('puertos')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 border cursor-pointer bg-white text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300"
                  title="Abrir tabla expandida de Puertos y VLANs a ancho completo"
                >
                  <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Puertos y VLANs</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    Expandir
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Tab Content: Ficha Técnica del Equipo Seleccionado */}
          {selectedEquipo ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
                {/* Header */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                      IDENTIFICADOR TÉCNICO
                    </span>
                    <div className="text-lg font-bold font-mono text-slate-900 flex items-center gap-2 flex-wrap">
                      <span>{selectedEquipo.codigo}</span>
                      {selectedEquipo.tipo === 'switch' && selectedEquipo.rol_red && (
                        <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-full border shadow-2xs ${
                          normalizeRolRedForDb(selectedEquipo.rol_red) === 'core'
                            ? 'bg-purple-100 text-purple-800 border-purple-200'
                            : normalizeRolRedForDb(selectedEquipo.rol_red) === 'distribucion'
                            ? 'bg-blue-100 text-blue-800 border-blue-200'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        }`}>
                          {formatRolRed(selectedEquipo.rol_red)}
                        </span>
                      )}
                      {(!selectedEquipo.posicion_u_inicio || selectedEquipo.posicion_u_inicio === 0 || selectedEquipo.u_range === 'Piso / Shaft') ? (
                        <span className="text-xs font-mono font-semibold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-600" />
                          Piso / Shaft (0U)
                        </span>
                      ) : (
                        <span className="text-xs font-mono font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          U{String(selectedEquipo.posicion_u_inicio).padStart(2, '0')}
                          {selectedEquipo.posicion_u_fin && selectedEquipo.posicion_u_fin !== selectedEquipo.posicion_u_inicio && (
                            ` - U${String(selectedEquipo.posicion_u_fin).padStart(2, '0')}`
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(selectedEquipo)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded"
                      title="Editar parámetros"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDismantleToBodega(selectedEquipo.id)}
                      className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded"
                      title="Desmontar y devolver a Bodega"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteEquipo(selectedEquipo.id)}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Eliminar permanentemente"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Details Body */}
                <div className="p-5 space-y-4 text-xs font-mono">
                  {/* Brand & Model */}
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      {selectedEquipo.marca_rel?.nombre || selectedEquipo.marca} {selectedEquipo.modelo_rel?.nombre || selectedEquipo.modelo}
                    </h3>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Categoría: <span className="uppercase font-semibold">{getTipoEquipoLabel(selectedEquipo.tipo)}</span> · {
                        (!selectedEquipo.posicion_u_inicio || selectedEquipo.posicion_u_inicio === 0 || selectedEquipo.u_range === 'Piso / Shaft')
                          ? 'Piso Shaft Adyacente (No Rackeable · 0U)'
                          : `${(Math.abs((selectedEquipo.posicion_u_fin || selectedEquipo.posicion_u_inicio || 1) - (selectedEquipo.posicion_u_inicio || 1)) + 1)}U`
                      }
                    </p>
                  </div>

                  {/* Rol en la Red (Editable para Switches) */}
                  {selectedEquipo.tipo === 'switch' && (
                    <div className="p-3 bg-purple-50/60 border border-purple-200/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <span className="text-[10px] font-mono text-purple-900 uppercase tracking-wider block font-bold">
                          Rol en la Red
                        </span>
                        <span className="text-xs text-slate-600 font-sans">
                          Jerarquía del switch en la red (Acceso, Distribución o Core)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={normalizeRolRedForDb(selectedEquipo.rol_red) || ''}
                          disabled={savingRolRed}
                          onChange={(e) => handleUpdateRolRed(selectedEquipo.id, e.target.value)}
                          className="text-xs font-mono font-bold px-2.5 py-1.5 bg-white border border-purple-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs cursor-pointer"
                        >
                          <option value="">Sin definir (vacío)</option>
                          <option value="acceso">Acceso</option>
                          <option value="distribucion">Distribución</option>
                          <option value="core">Core</option>
                        </select>
                        {selectedEquipo.rol_red && (
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border shrink-0 ${
                            normalizeRolRedForDb(selectedEquipo.rol_red) === 'core'
                              ? 'bg-purple-100 text-purple-800 border-purple-300'
                              : normalizeRolRedForDb(selectedEquipo.rol_red) === 'distribucion'
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          }`}>
                            {formatRolRed(selectedEquipo.rol_red)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Technical Specs Grid */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded border border-slate-200 text-[11px]">
                    <div>
                      <span className="text-slate-500 text-[10px] block">NÚMERO DE SERIE</span>
                      <span className="font-bold text-slate-800">{selectedEquipo.numero_serie || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">VLAN / SEGMENTO</span>
                      <span className="text-slate-800 font-semibold">{selectedEquipo.vlan ? `VLAN ${selectedEquipo.vlan}` : 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">IP DE GESTIÓN</span>
                      <span className="text-blue-700 font-bold">{selectedEquipo.ip_gestion || 'No asignada'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">PUERTOS / CAPACIDAD</span>
                      <span className="text-slate-800">
                        {selectedEquipo.puertos_totales ? `${selectedEquipo.puertos_totales} Puertos RJ45` : ''}
                        {selectedEquipo.canales_totales ? `${selectedEquipo.canales_totales} Canales NVR` : ''}
                        {selectedEquipo.capacidad_va ? `${selectedEquipo.capacidad_va}VA Respaldo` : ''}
                        {!selectedEquipo.puertos_totales && !selectedEquipo.canales_totales && !selectedEquipo.capacidad_va ? 'Unidad Pasiva' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Quick drag hint / Location info */}
                  {(!selectedEquipo.posicion_u_inicio || selectedEquipo.posicion_u_inicio === 0 || selectedEquipo.u_range === 'Piso / Shaft') ? (
                    <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded text-[11px] text-amber-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Ubicado sobre el piso del shaft junto al bastidor. No consume ranuras 19".</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDismantleToBodega(selectedEquipo.id)}
                        className="px-2 py-0.5 bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 rounded text-[10px] font-semibold shrink-0"
                      >
                        A Bodega
                      </button>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded text-[11px] text-blue-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <GripVertical className="w-3.5 h-3.5 text-blue-600" />
                        <span>Puedes arrastrarlo en el bastidor para reubicarlo.</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDismantleToBodega(selectedEquipo.id)}
                        className="px-2 py-0.5 bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 rounded text-[10px] font-semibold"
                      >
                        A Bodega
                      </button>
                    </div>
                  )}

                  {/* SECCIÓN ESTÁNDAR DE OCUPACIÓN Y DISPOSITIVOS CONECTADOS (NORMA 75%) */}
                  {(() => {
                    const occ = equipmentOccupancyMap[selectedEquipo.id];
                    if (!occ || occ.totalCapacity <= 0) return null;

                    return (
                      <div className="space-y-3 pt-1">
                        {/* SECCIÓN ESTÁNDAR DE OCUPACIÓN */}
                        <div className={`p-3 rounded-lg border text-xs ${
                          occ.status === 'critico'
                            ? 'bg-rose-50/80 border-rose-300 text-rose-950'
                            : occ.status === 'alerta'
                            ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                            : 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                        }`}>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 font-bold">
                              {occ.status === 'critico' ? (
                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                              ) : occ.status === 'alerta' ? (
                                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              )}
                              <span className="text-[11px] uppercase tracking-wide">
                                Estándar de Ocupación ({occ.percentage}%)
                              </span>
                            </div>

                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                              occ.status === 'critico'
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : occ.status === 'alerta'
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            }`}>
                              {occ.status === 'critico' ? '>=78% SATURADO' : occ.status === 'alerta' ? '74-77% UMBRAL 75%' : '<73% DISPONIBLE'}
                            </span>
                          </div>

                          {/* Progress Bar con meta del 75% marcada */}
                          <div className="space-y-1 my-2">
                            <div className="relative w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-300 ${
                                  occ.status === 'critico' ? 'bg-rose-600' : occ.status === 'alerta' ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, occ.percentage)}%` }}
                              />
                              {/* 75% reference line */}
                              <div 
                                className="absolute top-0 bottom-0 w-0.5 bg-slate-800/70 z-10" 
                                style={{ left: '75%' }} 
                                title="Estándar Objetivo: 75% de Ocupación"
                              />
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                              <span>{occ.occupiedCount} ocupados ({occ.availableCount} libres)</span>
                              <span className="font-semibold text-slate-700">Meta: 75% | Capacidad: {occ.totalCapacity}</span>
                            </div>
                          </div>

                          {/* Directriz de inventario */}
                          <div className="mt-2 pt-2 border-t border-slate-200/80 text-[11px] leading-relaxed">
                            <p className="font-semibold">
                              {occ.status === 'critico' ? (
                                <span className="text-rose-700">🚨 Directriz de Ampliación de Inventario:</span>
                              ) : occ.status === 'alerta' ? (
                                <span className="text-amber-800">⚠️ Directriz de Inventario:</span>
                              ) : (
                                <span className="text-emerald-800">✅ Directriz de Inventario:</span>
                              )}
                            </p>
                            <p className="mt-0.5 text-slate-700">
                              {occ.recommendation}
                            </p>
                          </div>
                        </div>

                        {/* SECCIÓN DISPOSITIVOS CONECTADOS */}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-mono font-bold text-slate-800 uppercase flex items-center gap-1.5">
                              <Network className="w-3.5 h-3.5 text-blue-600" />
                              Dispositivos Conectados ({occ.connectedCameras.length + occ.connectedUplinks.length})
                            </span>
                            {(selectedEquipo.tipo === 'switch' || selectedEquipo.tipo === 'patch_panel') && (
                              <button
                                type="button"
                                onClick={() => onNavigateToPorts(selectedEquipo.id)}
                                className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-0.5"
                              >
                                <span>Matriz</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {occ.connectedCameras.length === 0 && occ.connectedUplinks.length === 0 ? (
                            <div className="text-center py-3 text-slate-400 text-[11px]">
                              <span>No hay cámaras ni dispositivos de red conectados a este equipo.</span>
                            </div>
                          ) : (
                            <div className="max-h-52 overflow-y-auto divide-y divide-slate-200 space-y-1 pr-1 scrollbar-thin">
                              {occ.connectedUplinks.map((up: any, idx: number) => (
                                <div key={`uplink-${idx}`} className="pt-1 pb-1 flex items-center justify-between text-[11px]">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded text-[10px] border border-amber-300">
                                      Puerto {up.portNum}
                                    </span>
                                    <span className="font-semibold text-slate-800">Uplink NVR Troncal</span>
                                  </div>
                                  <span className="text-[10px] text-amber-700 font-mono">1 Gbps</span>
                                </div>
                              ))}
                              {occ.connectedCameras.map((conn: any, idx: number) => {
                                const isPuntoRed = conn.camera?.tipo_dispositivo === 'punto_red' || conn.camera?.modelo === 'Punto de Red';
                                return (
                                  <div key={`cam-${conn.camera.id || idx}-${idx}`} className="pt-1.5 pb-1 flex items-center justify-between text-[11px]">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={`font-mono font-bold px-1.5 py-0.2 rounded text-[10px] border shrink-0 ${
                                        isPuntoRed 
                                          ? 'text-indigo-800 bg-indigo-100 border-indigo-200' 
                                          : 'text-blue-800 bg-blue-100 border-blue-200'
                                      }`}>
                                        {conn.portOrChannel}
                                      </span>
                                      <div className="min-w-0">
                                        <span className="font-bold text-slate-900 block truncate">
                                          {conn.camera.codigo}
                                        </span>
                                        <span className="text-[10px] text-slate-500 block truncate">
                                          {conn.camera.modelo || conn.camera.tipo_dispositivo || (isPuntoRed ? 'Punto de Red' : 'Cámara')} {conn.camera.direccion_ip ? `· IP ${conn.camera.direccion_ip}` : ''}
                                        </span>
                                      </div>
                                    </div>
                                    {isPuntoRed ? (
                                      <Network className="w-3.5 h-3.5 text-indigo-500 shrink-0 ml-2" />
                                    ) : (
                                      <Camera className="w-3.5 h-3.5 text-blue-500 shrink-0 ml-2" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Actions */}
                  <div className="pt-2 flex flex-col gap-2">
                    {/* Botón directo a Puertos y VLANs (Modo Expandido) */}
                    {selectedEquipo.tipo === 'switch' && (
                      <button
                        type="button"
                        onClick={() => setEquipmentDetailTab('puertos')}
                        className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
                      >
                        <Cpu className="w-4 h-4" />
                        <span>Abrir Puertos y VLANs (Modo Expandido)</span>
                      </button>
                    )}

                    {(selectedEquipo.tipo === 'switch' || selectedEquipo.tipo === 'patch_panel') && (
                      <button
                        onClick={() => onNavigateToPorts(selectedEquipo.id)}
                        className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                      >
                        <Cpu className="w-3.5 h-3.5" />
                        <span>Ver Mapeo Completo de Puertos ({selectedEquipo.codigo})</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenEditModal(selectedEquipo)}
                      className="w-full py-2 px-3 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5 text-slate-500" />
                      <span>Editar Parámetros Físicos</span>
                    </button>

                    {/* Acciones de Ciclo de Vida y Eliminación */}
                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <button
                        type="button"
                        onClick={() => setDecommissionModalOpen(true)}
                        className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-2xs"
                      >
                        <Archive className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>Retirar de Instalación (Bodega / Baja)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirmModalOpen(true)}
                        className="w-full py-2 px-3 bg-red-50 hover:bg-red-100 text-red-800 border border-red-300 rounded text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-2xs"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        <span>Eliminar Definitivamente (Prueba / Error)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : equipos.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-500 text-xs space-y-3 shadow-xs">
                <Server className="w-10 h-10 text-slate-300 mx-auto" />
                <div>
                  <p className="font-bold text-slate-800 text-sm">Gabinete Vacío ({totalU}U Libres)</p>
                  <p className="text-slate-500 text-[11px] mt-1 max-w-xs mx-auto">
                    Arrastra equipos desde el Cajón de Bodega o haz clic para registrar un nuevo montaje.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsBodegaDrawerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Ver Cajón de Bodega</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAddModal()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Registrar Montaje</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-xs">
                Haz clic sobre cualquier equipo del bastidor para examinar su ficha técnica, o abre el <strong>Cajón de Bodega</strong> para montar más dispositivos.
              </div>
            )}

          {/* Resumen de Ocupación U */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-900">Resumen de Ocupación U</span>
              <span className="text-xs font-mono text-slate-500">{totalU} Unidades Totales</span>
            </div>

            {/* Visual Bar */}
            <div className="w-full bg-slate-100 rounded-full h-3 flex overflow-hidden border border-slate-200 my-2">
              <div 
                className="bg-blue-600 h-full transition-all duration-300" 
                style={{ width: `${totalU > 0 ? (occupiedUCount / totalU) * 100 : 0}%` }}
                title={`${occupiedUCount}U Ocupadas`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-center pt-2 font-mono text-xs">
              <div className="p-2 bg-blue-50/60 rounded border border-blue-100">
                <span className="text-lg font-bold text-blue-700 block">{occupiedUCount} U</span>
                <span className="text-[10px] text-slate-500 uppercase">Ocupadas ({totalU > 0 ? Math.round((occupiedUCount / totalU) * 100) : 0}%)</span>
              </div>
              <div className="p-2 bg-emerald-50/60 rounded border border-emerald-100">
                <span className="text-lg font-bold text-emerald-700 block">{availableUCount} U</span>
                <span className="text-[10px] text-slate-500 uppercase">Disponibles ({totalU > 0 ? Math.round((availableUCount / totalU) * 100) : 100}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Cajón de Bodega Deslizable (Drawer Lateral) */}
      <RackBodegaDrawer
        isOpen={isBodegaDrawerOpen}
        onToggle={() => setIsBodegaDrawerOpen(false)}
        bodegaEquipos={bodegaEquipos}
        loadingBodega={loadingBodega}
        onRefreshBodega={loadBodegaData}
        onMountEquipo={(eq, targetU, uHeight) => handleMountFromBodega(eq, targetU, uHeight)}
        occupiedSlotsMap={occupiedSlotsMap}
        totalU={totalU}
        onDragStartBodegaItem={(eq, uHeight) => {
          setDraggedItem({
            id: eq.id,
            source: 'bodega',
            codigo: eq.codigo,
            tipo: eq.tipo,
            uHeight: uHeight
          });
        }}
        onDragEndBodegaItem={() => {
          setDraggedItem(null);
          setDragOverTarget(null);
        }}
        isDraggingFromRack={draggedItem?.source === 'rack'}
        onDropToBodega={() => {
          if (draggedItem?.id) {
            handleDismantleToBodega(draggedItem.id);
            setDraggedItem(null);
            setDragOverTarget(null);
          }
        }}
      />

      {/* Modal para Registrar / Editar Montaje */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm font-mono">
                  {isEditing ? `Editar Equipo: ${formData.codigo}` : `Montar Nuevo Dispositivo en Rack ${rack.codigo}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-mono text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEquipment} className="p-5 space-y-4 text-xs font-mono max-h-[82vh] overflow-y-auto">
              {/* Tipo de Equipo & Código Interno */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Tipo de Dispositivo *</label>
                  <select
                    value={formData.tipo}
                    onChange={(e) => handleTipoChange(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-blue-600 bg-white text-xs"
                  >
                    <option value="switch">Switch de Red</option>
                    <option value="patch_panel">Patch Panel</option>
                    <option value="nvr">NVR / Grabador</option>
                    <option value="ups">UPS / Respaldo</option>
                    <option value="organizador">Organizador Pasacables</option>
                    <option value="mufa">Mufa / Fibra Óptica</option>
                    <option value="otro">PDU / Servidor / Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Código Identificador *</label>
                  <input
                    type="text"
                    required
                    value={formData.codigo || ''}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                    placeholder="ej. SW-03, PP-02, PDU-01"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-blue-600 text-xs font-bold text-blue-700"
                  />
                </div>
              </div>

              {/* Marca y Modelo (Infiere Altura U) */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Marca</label>
                  <MarcaSelect
                    value={formData.marca_id}
                    marcas={marcas}
                    onMarcaCreated={(newM) => setMarcas(prev => [...prev, newM].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
                    onChange={(mId, mName) => {
                      setFormData({ 
                        ...formData, 
                        marca_id: mId || null, 
                        marca: mName || null, 
                        modelo_id: null,
                        modelo: null
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Modelo</label>
                  <ModeloSelect
                    value={formData.modelo_id}
                    marcaId={formData.marca_id}
                    tipoEquipo={formData.tipo}
                    modelos={modelos}
                    marcas={marcas}
                    onModeloCreated={(newMod) => setModelos(prev => [...prev, newMod].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
                    onChange={(modId, modName, defaults) => handleModeloChange(modId, modName, defaults)}
                  />
                </div>
              </div>

              {/* SECCIÓN INTELIGENTE DE DISPOSICIÓN & UBICACIÓN FÍSICA */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-slate-800 font-bold flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-blue-600" />
                    <span>Disposición & Ubicación Física</span>
                  </label>
                  {(formData.tipo !== 'ups' || formData.es_rackeable !== false) && (
                    <button
                      type="button"
                      onClick={() => setModoAvanzadoU(!modoAvanzadoU)}
                      className="text-[10px] text-blue-600 hover:underline font-mono"
                    >
                      {modoAvanzadoU ? '← Modo inteligente (U Superior + Altura)' : 'Ajuste manual Inicio/Fin'}
                    </button>
                  )}
                </div>

                {/* Selector de Modalidad: Montado en Bastidor vs Piso del Shaft (No Rackeable) - ÚNICAMENTE PARA UPS */}
                {formData.tipo === 'ups' && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          es_rackeable: true,
                          posicion_u_inicio: prev.posicion_u_inicio && prev.posicion_u_inicio > 0 ? prev.posicion_u_inicio : 1,
                          posicion_u_fin: prev.posicion_u_fin && prev.posicion_u_fin > 0 ? prev.posicion_u_fin : 1
                        }));
                      }}
                      className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                        formData.es_rackeable !== false
                          ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-500 text-blue-950 font-semibold'
                          : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-blue-600" />
                        <span className="font-bold">Montado en Bastidor</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-normal">
                        Estándar 19", ocupa unidades U (1U - {totalU}U)
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          es_rackeable: false,
                          posicion_u_inicio: 0,
                          posicion_u_fin: 0
                        }));
                      }}
                      className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                        formData.es_rackeable === false
                          ? 'bg-amber-50/90 border-amber-500 ring-1 ring-amber-500 text-amber-950 font-semibold'
                          : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-600" />
                        <span className="font-bold">Piso / Shaft (No Rackeable)</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-normal">
                        Junto al rack, ej: UPS Torre o pedestal (0U)
                      </span>
                    </button>
                  </div>
                )}

                {formData.tipo === 'ups' && formData.es_rackeable === false ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-[11px] space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Equipo Adyacente en Piso del Shaft (No consume unidades U)</span>
                    </div>
                    <p className="text-[10px] text-amber-800/90 leading-relaxed font-sans">
                      Ideal para UPS en formato torre o equipos de suelo que comparten el shaft de corrientes débiles y alimentan eléctricamente el rack, pero no disponen de orejas ni rieles 19". Se reflejará claramente al lado de la elevación frontal del bastidor.
                    </p>
                  </div>
                ) : (
                  <>
                    {!modoAvanzadoU ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Selector de Altura (U) */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] text-slate-700 font-semibold">
                              Altura (Unidades U) *
                            </label>
                            <span className="text-[10px] text-slate-500 font-sans">
                              Sugerida por modelo/tipo
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4].map(u => (
                              <button
                                key={u}
                                type="button"
                                onClick={() => {
                                  const uSup = Number(formData.posicion_u_fin || totalU);
                                  const uInf = calculateUInferior(uSup, u);
                                  setFormAlturaU(u);
                                  setFormData(prev => ({
                                    ...prev,
                                    posicion_u_inicio: uInf,
                                    posicion_u_fin: uSup
                                  }));
                                }}
                                className={`flex-1 py-1 text-xs font-bold rounded border transition-colors ${
                                  formAlturaU === u
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                }`}
                              >
                                {u}U
                              </button>
                            ))}
                            <input
                              type="number"
                              min="1"
                              max="12"
                              value={formAlturaU}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                  setFormAlturaU('' as any);
                                } else {
                                  const u = Math.max(1, parseInt(val, 10) || 1);
                                  const uSup = Number(formData.posicion_u_fin || totalU);
                                  const uInf = calculateUInferior(uSup, u);
                                  setFormAlturaU(u);
                                  setFormData(prev => ({
                                    ...prev,
                                    posicion_u_inicio: uInf,
                                    posicion_u_fin: uSup
                                  }));
                                }
                              }}
                              className="w-12 px-1.5 py-1 text-xs border border-slate-300 rounded text-center font-bold bg-white"
                              title="Altura manual en U"
                            />
                          </div>
                        </div>

                        {/* Selector de U Superior */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] text-slate-700 font-semibold">
                              U Superior (Tope en bastidor) *
                            </label>
                            <span className="text-[10px] text-slate-500">1 a {totalU}</span>
                          </div>
                          <input
                            type="number"
                            min="1"
                            max={totalU}
                            required
                            value={formData.posicion_u_fin}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                setFormData(prev => ({ ...prev, posicion_u_fin: '' as any }));
                              } else {
                                const uSup = parseInt(val, 10);
                                if (!isNaN(uSup)) {
                                  const h = Number(formAlturaU) || 1;
                                  const uInf = calculateUInferior(uSup, h);
                                  setFormData(prev => ({
                                    ...prev,
                                    posicion_u_fin: uSup,
                                    posicion_u_inicio: uInf
                                  }));
                                }
                              }
                            }}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono font-bold text-blue-700 text-xs focus:ring-1 focus:ring-blue-600 bg-white"
                          />
                        </div>
                      </div>
                    ) : (
                      /* Modo tradicional Inicio/Fin */
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-700 font-semibold mb-1">Posición U Inicio (Base)</label>
                          <input
                            type="number"
                            min="1"
                            max={totalU}
                            value={formData.posicion_u_inicio}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                setFormData(prev => ({ ...prev, posicion_u_inicio: '' as any }));
                              } else {
                                const uInf = parseInt(val, 10);
                                if (!isNaN(uInf)) {
                                  const curSup = Number(formData.posicion_u_fin) || uInf;
                                  const uSup = Math.max(uInf, curSup);
                                  setFormData(prev => ({ ...prev, posicion_u_inicio: uInf, posicion_u_fin: uSup }));
                                  setFormAlturaU(uSup - uInf + 1);
                                }
                              }
                            }}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-700 font-semibold mb-1">Posición U Fin (Tope)</label>
                          <input
                            type="number"
                            min="1"
                            max={totalU}
                            value={formData.posicion_u_fin}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                setFormData(prev => ({ ...prev, posicion_u_fin: '' as any }));
                              } else {
                                const uSup = parseInt(val, 10);
                                if (!isNaN(uSup)) {
                                  const curInf = Number(formData.posicion_u_inicio) || uSup;
                                  const uInf = Math.min(uSup, curInf);
                                  setFormData(prev => ({ ...prev, posicion_u_fin: uSup, posicion_u_inicio: uInf }));
                                  setFormAlturaU(uSup - uInf + 1);
                                }
                              }
                            }}
                            className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Feedback en vivo de validación */}
                {(() => {
                  const uSup = Number(formData.posicion_u_fin || totalU);
                  const hU = Number(formAlturaU) || 1;
                  const uInf = calculateUInferior(uSup, hU);
                  const validation = validateUSlotAvailability(
                    uSup,
                    hU,
                    totalU,
                    occupiedSlotsMap,
                    isEditing ? formData.id : null
                  );

                  if (validation.isValid) {
                    return (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded text-emerald-800 text-xs flex items-center gap-2 font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          <strong>Espacio disponible:</strong> Ocupará desde la <strong>U {uInf}</strong> hasta la <strong>U {uSup}</strong> ({formAlturaU}U en total).
                        </span>
                      </div>
                    );
                  } else {
                    return (
                      <div className="p-2.5 bg-rose-50 border border-rose-300 rounded text-rose-800 text-xs flex items-center gap-2 font-medium">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          <strong>Conflicto de espacio:</strong> {validation.reason}
                        </span>
                      </div>
                    );
                  }
                })()}
              </div>

              {/* Número de Serie */}
              <div>
                <label className="block text-[11px] text-slate-700 font-semibold mb-1">Número de Serie</label>
                <input
                  type="text"
                  value={formData.numero_serie || ''}
                  onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })}
                  placeholder="ej. FDO24391823"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-blue-600 text-xs"
                />
              </div>

              {/* Fechas y Proveedores */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Fecha de Compra</label>
                  <input
                    type="date"
                    value={formData.fecha_compra}
                    onChange={(e) => setFormData({ ...formData, fecha_compra: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Proveedor de Compra</label>
                  <ProveedorSelect
                    value={formData.proveedor_compra_id}
                    rubroFilter="venta"
                    proveedores={proveedores}
                    onProveedorCreated={(newP) => setProveedores(prev => [...prev, newP].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
                    onChange={(pId) => setFormData({ ...formData, proveedor_compra_id: pId || null })}
                    placeholder="Seleccionar..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Fecha de Instalación</label>
                  <input
                    type="date"
                    value={formData.fecha_instalacion}
                    onChange={(e) => setFormData({ ...formData, fecha_instalacion: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Proveedor de Instalación</label>
                  <ProveedorSelect
                    value={formData.proveedor_instalacion_id}
                    rubroFilter="instalacion"
                    proveedores={proveedores}
                    onProveedorCreated={(newP) => setProveedores(prev => [...prev, newP].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
                    onChange={(pId) => setFormData({ ...formData, proveedor_instalacion_id: pId || null })}
                    placeholder="Seleccionar..."
                  />
                </div>
              </div>

              {/* CAMPOS ADICIONALES SEGÚN EL TIPO */}
              {(formData.tipo === 'patch_panel' || formData.tipo === 'switch' || formData.tipo === 'nvr' || formData.tipo === 'ups') && (
                <div className="p-3 bg-blue-50/50 border border-blue-200/80 rounded space-y-3 mt-2">
                  <div className="text-[10px] uppercase font-bold text-blue-800 tracking-wider">
                    Campos Específicos para {formData.tipo === 'patch_panel' ? 'Patch Panel' : formData.tipo.toUpperCase()}
                  </div>

                  {formData.tipo === 'patch_panel' && (
                    <div>
                      <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                        Puertos Totales *
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        max="96"
                        value={formData.puertos_totales}
                        onChange={(e) => setFormData({ ...formData, puertos_totales: e.target.value })}
                        placeholder="ej. 24 o 48"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-blue-600 text-xs font-bold"
                      />
                    </div>
                  )}

                  {formData.tipo === 'switch' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                          Puertos Totales *
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          max="96"
                          value={formData.puertos_totales}
                          onChange={(e) => setFormData({ ...formData, puertos_totales: e.target.value })}
                          placeholder="ej. 24 o 48"
                          className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-blue-600 text-xs font-bold"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                            IP de Gestión
                          </label>
                          <input
                            type="text"
                            value={formData.ip_gestion}
                            onChange={(e) => setFormData({ ...formData, ip_gestion: e.target.value })}
                            placeholder="ej. 10.14.20.15"
                            className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-blue-600 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                            VLAN
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="4094"
                            value={formData.vlan}
                            onChange={(e) => setFormData({ ...formData, vlan: e.target.value })}
                            placeholder="ej. 20"
                            className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-blue-600 text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                          Rol en la Red
                        </label>
                        <select
                          value={normalizeRolRedForDb(formData.rol_red) || ''}
                          onChange={(e) => setFormData({ ...formData, rol_red: e.target.value })}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-blue-600 text-xs font-semibold"
                        >
                          <option value="">Sin definir (vacío)</option>
                          <option value="acceso">Acceso</option>
                          <option value="distribucion">Distribución</option>
                          <option value="core">Core</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {formData.tipo === 'nvr' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                          Canales Totales *
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          max="128"
                          value={formData.canales_totales}
                          onChange={(e) => setFormData({ ...formData, canales_totales: e.target.value })}
                          placeholder="ej. 16, 32 o 64"
                          className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-blue-600 text-xs font-bold"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                            IP de Gestión
                          </label>
                          <input
                            type="text"
                            value={formData.ip_gestion}
                            onChange={(e) => setFormData({ ...formData, ip_gestion: e.target.value })}
                            placeholder="ej. 10.14.20.200"
                            className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-blue-600 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                            VLAN
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="4094"
                            value={formData.vlan}
                            onChange={(e) => setFormData({ ...formData, vlan: e.target.value })}
                            placeholder="ej. 20"
                            className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-blue-600 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.tipo === 'ups' && (
                    <div>
                      <label className="block text-[11px] text-slate-700 font-semibold mb-1">
                        Capacidad (VA)
                      </label>
                      <input
                        type="number"
                        min="100"
                        max="50000"
                        value={formData.capacidad_va}
                        onChange={(e) => setFormData({ ...formData, capacidad_va: e.target.value })}
                        placeholder="ej. 1500 o 3000"
                        className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-blue-600 text-xs font-bold"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-1.5 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 text-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    saving || 
                    !formData.codigo.trim() ||
                    !validateUSlotAvailability(
                      Number(formData.posicion_u_fin || totalU),
                      Number(formAlturaU) || 1,
                      totalU,
                      occupiedSlotsMap,
                      isEditing ? formData.id : null
                    ).isValid
                  }
                  className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded shadow-xs transition-colors disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : (isEditing ? 'Actualizar Equipo' : 'Montar en Rack')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modales de Ciclo de Vida y Eliminación */}
      {selectedEquipo && (
        <>
          <DecommissionModal
            isOpen={decommissionModalOpen}
            onClose={() => setDecommissionModalOpen(false)}
            itemType="equipo"
            itemId={selectedEquipo.id}
            itemCode={selectedEquipo.codigo}
            onSuccess={async () => {
              setSelectedEquipo(null);
              await loadData();
            }}
          />
          <DeleteConfirmModal
            isOpen={deleteConfirmModalOpen}
            onClose={() => setDeleteConfirmModalOpen(false)}
            itemType="equipo"
            itemId={selectedEquipo.id}
            itemCode={selectedEquipo.codigo}
            onSuccess={async () => {
              setSelectedEquipo(null);
              await loadData();
            }}
          />
        </>
      )}

      {/* Modal Bitácora del Rack */}
      {showRackHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-slate-50 rounded-xl shadow-2xl border border-slate-300 max-w-6xl w-full max-h-[96vh] overflow-y-auto">
            <MaintenanceHistory
              entityType="rack"
              entityId={rack.id}
              rack={rack}
              onBack={() => setShowRackHistoryModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
