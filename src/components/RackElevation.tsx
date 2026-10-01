import React, { useState, useEffect, useRef } from 'react';
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
  Sparkles
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Rack, Equipo, Proveedor, Marca, Modelo, TipoEquipo } from '../types/database';
import { MarcaSelect, ModeloSelect, ProveedorSelect } from './catalogs/CatalogSelectors';
import { DecommissionModal } from './DecommissionModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { RackBodegaDrawer } from './RackBodegaDrawer';
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
  const [bodegaEquipos, setBodegaEquipos] = useState<Equipo[]>([]);
  const [loadingBodega, setLoadingBodega] = useState(false);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [selectedEquipo, setSelectedEquipo] = useState<Equipo | null>(null);
  const [loading, setLoading] = useState(true);

  // Panel derecho: 'detalle' o 'bodega'
  const [rightPanelTab, setRightPanelTab] = useState<'detalle' | 'bodega'>('detalle');

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

  // Modal for new/edit equipment
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formAlturaU, setFormAlturaU] = useState<number>(1);
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
    posicion_u_inicio: number;
    posicion_u_fin: number;
    ip_gestion: string;
    vlan: string;
    puertos_totales: string;
    canales_totales: string;
    capacidad_va: string;
    fecha_compra: string;
    fecha_instalacion: string;
    proveedor_compra_id: string | null;
    proveedor_instalacion_id: string | null;
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
  });
  const [saving, setSaving] = useState(false);

  const totalU = rack.altura_u || 42;

  // Occupied slots map: key is U number (1..totalU), value is Equipo
  const occupiedSlotsMap: Record<number, Equipo> = {};
  equipos.forEach(eq => {
    if (eq.posicion_u_inicio) {
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

  // Load rack equipment, providers, brands, models, and bodega
  const loadData = async () => {
    try {
      setLoading(true);
      const [
        { data: eqData },
        { data: provData },
        { data: marcasData },
        { data: modelosData }
      ] = await Promise.all([
        supabase
          .from('equipos')
          .select('*, proveedor_compra:proveedores!proveedor_compra_id(*), proveedor_instalacion:proveedores!proveedor_instalacion_id(*), marca_rel:marcas(*), modelo_rel:modelos(*)')
          .eq('rack_id', rack.id)
          .order('posicion_u_inicio', { ascending: false }),
        supabase.from('proveedores').select('*').order('nombre'),
        supabase.from('marcas').select('*').order('nombre'),
        supabase.from('modelos').select('*').order('nombre'),
      ]);

      const loadedEquipos = (eqData || []).filter(
        eq => !eq.estado_ciclo_vida || eq.estado_ciclo_vida === 'instalado'
      );
      setEquipos(loadedEquipos);
      setProveedores(provData || []);
      setMarcas(marcasData || []);
      setModelos(modelosData || []);

      // Auto-select first active switch or first device
      if (loadedEquipos.length > 0) {
        const defaultSelected = loadedEquipos.find(e => e.tipo === 'switch') || loadedEquipos[0];
        setSelectedEquipo(defaultSelected);
      } else {
        setSelectedEquipo(null);
      }

      await loadBodegaData();
    } catch (err) {
      console.error('Error loading rack elevation data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [rack.id]);

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
      setRightPanelTab('detalle');
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

  // Open modal to add equipment
  const handleOpenAddModal = () => {
    setIsEditing(false);
    setModoAvanzadoU(false);
    const initialHeight = 1;
    const firstFreeSlot = findFirstAvailableUSlot(totalU, initialHeight, occupiedSlotsMap) || totalU;
    setFormAlturaU(initialHeight);

    setFormData({
      rack_id: rack.id,
      tipo: 'switch',
      codigo: '',
      marca_id: null,
      modelo_id: null,
      marca: null,
      modelo: null,
      numero_serie: '',
      posicion_u_inicio: calculateUInferior(firstFreeSlot, initialHeight),
      posicion_u_fin: firstFreeSlot,
      ip_gestion: '',
      vlan: '',
      puertos_totales: '',
      canales_totales: '',
      capacidad_va: '',
      fecha_compra: '',
      fecha_instalacion: '',
      proveedor_compra_id: null,
      proveedor_instalacion_id: null,
    });
    setIsModalOpen(true);
  };

  // Open modal to edit selected equipment
  const handleOpenEditModal = (eq: Equipo) => {
    setIsEditing(true);
    setModoAvanzadoU(false);
    const matchedBrand = marcas.find(m => m.id === eq.marca_id || m.nombre === eq.marca);
    const matchedModel = modelos.find(m => m.id === eq.modelo_id || m.nombre === eq.modelo);

    const uStart = Math.min(eq.posicion_u_inicio || 1, eq.posicion_u_fin || eq.posicion_u_inicio || 1);
    const uEnd = Math.max(eq.posicion_u_inicio || 1, eq.posicion_u_fin || eq.posicion_u_inicio || 1);
    const currentHeight = uEnd - uStart + 1;
    setFormAlturaU(currentHeight);

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
      fecha_compra: eq.fecha_compra || '',
      fecha_instalacion: eq.fecha_instalacion || '',
      proveedor_compra_id: eq.proveedor_compra_id || null,
      proveedor_instalacion_id: eq.proveedor_instalacion_id || null,
    });
    setIsModalOpen(true);
  };

  // When changing equipment type: clean hidden fields and update inferred U height
  const handleTipoChange = (newTipo: TipoEquipo) => {
    const newHeight = inferUHeight(formData.modelo, newTipo);
    setFormAlturaU(newHeight);
    const currentUSuperior = Number(formData.posicion_u_fin || totalU);
    const newUInferior = calculateUInferior(currentUSuperior, newHeight);

    setFormData(prev => ({
      ...prev,
      tipo: newTipo,
      modelo_id: null,
      modelo: null,
      posicion_u_inicio: newUInferior,
      puertos_totales: '',
      canales_totales: '',
      capacidad_va: '',
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

    try {
      setSaving(true);
      const isSwitch = formData.tipo === 'switch';
      const isPatchPanel = formData.tipo === 'patch_panel';
      const isNvr = formData.tipo === 'nvr';
      const isUps = formData.tipo === 'ups';

      const payload: any = {
        rack_id: rack.id,
        tipo: formData.tipo,
        codigo: formData.codigo.trim(),
        marca_id: formData.marca_id || null,
        modelo_id: formData.modelo_id || null,
        marca: formData.marca || null,
        modelo: formData.modelo || null,
        numero_serie: formData.numero_serie.trim() || null,
        posicion_u_inicio: Math.min(uInf, uSup),
        posicion_u_fin: Math.max(uInf, uSup),
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
        showToast(`Equipo ${data.codigo} montado en rack exitosamente`);
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

        const equipmentTopU = uEnd;
        rows.push(
          <div
            key={`eq-${eq.id}-${slotTopU}`}
            onClick={() => {
              setSelectedEquipo(eq);
              setRightPanelTab('detalle');
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
              <div className="flex items-center gap-2 overflow-hidden">
                <div 
                  className="text-slate-400 group-hover:text-amber-400 cursor-grab shrink-0" 
                  title="Arrastrar para mover verticalmente o a Bodega"
                >
                  <GripVertical className="w-4 h-4" />
                </div>
                {eq.tipo === 'switch' && <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-xs" />}
                {eq.tipo === 'nvr' && <HardDrive className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                {eq.tipo === 'ups' && <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                {eq.tipo === 'mufa' && <Network className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                
                <div className="truncate">
                  <span className={`font-semibold ${textColor}`}>
                    {eq.marca_rel?.nombre || eq.marca ? `${eq.marca_rel?.nombre || eq.marca} ` : ''}{eq.modelo_rel?.nombre || eq.modelo || eq.codigo}
                  </span>
                  <span className={`ml-2 text-[10px] opacity-80 ${textColor}`}>
                    ({eq.codigo}) {eq.puertos_totales ? `${eq.puertos_totales}P` : ''}
                  </span>
                </div>
              </div>

              {/* Badges / Bay visuals */}
              <div className="flex items-center gap-2 shrink-0">
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
          {/* Botón para abrir o destacar el Cajón de Bodega */}
          <button
            type="button"
            onClick={() => setRightPanelTab(rightPanelTab === 'bodega' ? 'detalle' : 'bodega')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors shadow-2xs border ${
              rightPanelTab === 'bodega'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
            }`}
          >
            <Archive className="w-4 h-4 text-amber-600 group-hover:text-amber-800" />
            <span>Cajón Bodega ({bodegaEquipos.length})</span>
          </button>

          <button 
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ Registrar Montaje</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Rack Elevation (Left) & Inspector / Bodega Drawer (Right) */}
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
          </div>
        </div>

        {/* RIGHT: Tabs (Ficha Técnica & Cajón de Bodega) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Tab selector */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setRightPanelTab('detalle')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 border ${
                rightPanelTab === 'detalle'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Ficha del Equipo {selectedEquipo ? `(${selectedEquipo.codigo})` : ''}</span>
            </button>

            <button
              type="button"
              onClick={() => setRightPanelTab('bodega')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 border ${
                rightPanelTab === 'bodega'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Archive className="w-3.5 h-3.5 text-amber-500" />
              <span>Cajón de Bodega</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                rightPanelTab === 'bodega' ? 'bg-amber-800 text-white' : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}>
                {bodegaEquipos.length}
              </span>
            </button>
          </div>

          {/* Tab Content: Cajón de Bodega */}
          {rightPanelTab === 'bodega' ? (
            <RackBodegaDrawer
              isOpen={true}
              onToggle={() => setRightPanelTab('detalle')}
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
          ) : (
            /* Tab Content: Ficha Técnica del Equipo Seleccionado */
            selectedEquipo ? (
              <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
                {/* Header */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                      IDENTIFICADOR TÉCNICO
                    </span>
                    <div className="text-lg font-bold font-mono text-slate-900 flex items-center gap-2">
                      <span>{selectedEquipo.codigo}</span>
                      <span className="text-xs font-mono font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        U{String(selectedEquipo.posicion_u_inicio).padStart(2, '0')}
                        {selectedEquipo.posicion_u_fin && selectedEquipo.posicion_u_fin !== selectedEquipo.posicion_u_inicio && (
                          ` - U${String(selectedEquipo.posicion_u_fin).padStart(2, '0')}`
                        )}
                      </span>
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
                      Categoría: <span className="uppercase font-semibold">{selectedEquipo.tipo}</span> · {
                        (Math.abs((selectedEquipo.posicion_u_fin || selectedEquipo.posicion_u_inicio || 1) - (selectedEquipo.posicion_u_inicio || 1)) + 1)
                      }U
                    </p>
                  </div>

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

                  {/* Quick drag hint */}
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

                  {/* Actions */}
                  <div className="pt-2 flex flex-col gap-2">
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
                    onClick={() => setRightPanelTab('bodega')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Ver Cajón de Bodega</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenAddModal}
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
            )
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

              {/* SECCIÓN INTELIGENTE DE DISPOSICIÓN U */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-slate-800 font-bold flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-blue-600" />
                    <span>Disposición en el Bastidor</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setModoAvanzadoU(!modoAvanzadoU)}
                    className="text-[10px] text-blue-600 hover:underline font-mono"
                  >
                    {modoAvanzadoU ? '← Modo inteligente (U Superior + Altura)' : 'Ajuste manual Inicio/Fin'}
                  </button>
                </div>

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
                            const u = Math.max(1, parseInt(e.target.value) || 1);
                            const uSup = Number(formData.posicion_u_fin || totalU);
                            const uInf = calculateUInferior(uSup, u);
                            setFormAlturaU(u);
                            setFormData(prev => ({
                              ...prev,
                              posicion_u_inicio: uInf,
                              posicion_u_fin: uSup
                            }));
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
                        value={formData.posicion_u_fin || totalU}
                        onChange={(e) => {
                          const uSup = parseInt(e.target.value) || 1;
                          const uInf = calculateUInferior(uSup, formAlturaU);
                          setFormData(prev => ({
                            ...prev,
                            posicion_u_fin: uSup,
                            posicion_u_inicio: uInf
                          }));
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
                          const uInf = parseInt(e.target.value) || 1;
                          const uSup = Math.max(uInf, formData.posicion_u_fin);
                          setFormData(prev => ({ ...prev, posicion_u_inicio: uInf, posicion_u_fin: uSup }));
                          setFormAlturaU(uSup - uInf + 1);
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
                          const uSup = parseInt(e.target.value) || 1;
                          const uInf = Math.min(uSup, formData.posicion_u_inicio);
                          setFormData(prev => ({ ...prev, posicion_u_fin: uSup, posicion_u_inicio: uInf }));
                          setFormAlturaU(uSup - uInf + 1);
                        }}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* Feedback en vivo de validación */}
                {(() => {
                  const uSup = Number(formData.posicion_u_fin || totalU);
                  const uInf = calculateUInferior(uSup, formAlturaU);
                  const validation = validateUSlotAvailability(
                    uSup,
                    formAlturaU,
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
                      formAlturaU,
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
    </div>
  );
};
