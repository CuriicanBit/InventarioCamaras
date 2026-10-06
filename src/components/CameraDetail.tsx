import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  ArrowLeft, 
  Wrench, 
  Edit3, 
  Printer, 
  Shield, 
  Server, 
  Cpu, 
  HardDrive, 
  Cable, 
  Calendar, 
  Building, 
  User, 
  Compass, 
  Eye, 
  CheckCircle,
  Plus,
  Trash2,
  Archive,
  AlertTriangle,
  MapPin,
  Save,
  X,
  Upload
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
  Camara, 
  Rack, 
  Equipo, 
  Proveedor, 
  HistorialMantenimiento, 
  Marca, 
  Modelo, 
  TipoCamara,
  Piso,
  Edificio,
  Campus,
  Sede,
  EstadoCicloVida,
  PuertoSwitchOcupacion
} from '../types/database';
import { MarcaSelect, ModeloSelect, ProveedorSelect } from './catalogs/CatalogSelectors';
import { DecommissionModal } from './DecommissionModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface CameraDetailProps {
  camera: Camara;
  onBack: () => void;
  onNavigateToMaintenance: (camera: Camara) => void;
  onNavigateToRack: (rackId: string) => void;
  onNavigateToPlanimetria?: () => void;
  onCameraUpdated?: (updatedCam: Camara) => void;
  onCameraDeleted?: (deletedCamId: string) => void;
}

export const CameraDetail: React.FC<CameraDetailProps> = ({
  camera,
  onBack,
  onNavigateToMaintenance,
  onNavigateToRack,
  onNavigateToPlanimetria,
  onCameraUpdated,
  onCameraDeleted,
}) => {
  const [currentCam, setCurrentCam] = useState<Camara>(camera);
  const [rack, setRack] = useState<Rack | null>(null);
  const [patchPanel, setPatchPanel] = useState<Equipo | null>(null);
  const [switchEq, setSwitchEq] = useState<Equipo | null>(null);
  const [nvrEq, setNvrEq] = useState<Equipo | null>(null);
  const [provCompra, setProvCompra] = useState<Proveedor | null>(null);
  const [provInst, setProvInst] = useState<Proveedor | null>(null);
  const [historial, setHistorial] = useState<HistorialMantenimiento[]>([]);
  const [proveedoresList, setProveedoresList] = useState<Proveedor[]>([]);
  
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);

  // Hierarchy for floor and rack selectors in edit modal
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [campusList, setCampusList] = useState<Campus[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [allRacks, setAllRacks] = useState<Rack[]>([]);
  const [allEquipos, setAllEquipos] = useState<Equipo[]>([]);

  // Edit Camera Modal
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Camara>>({});
  const [editSwitchPorts, setEditSwitchPorts] = useState<PuertoSwitchOcupacion[]>([]);
  const [occupiedPpPorts, setOccupiedPpPorts] = useState<{ [port: number]: string }>({});
  const [saving, setSaving] = useState(false);

  // Load switch ports (RJ45 only, excluding SFP) when editing switch_id
  useEffect(() => {
    if (!editFormData.switch_id) {
      setEditSwitchPorts([]);
      return;
    }
    const loadPorts = async () => {
      try {
        const { data } = await supabase
          .from('v_puertos_switch_ocupacion')
          .select('*')
          .eq('switch_id', editFormData.switch_id)
          .order('numero_puerto');
        // Exclude SFP ports for camera final device
        const rj45Only = (data || []).filter(p => p.tipo_puerto !== 'sfp');
        setEditSwitchPorts(rj45Only);
      } catch (err) {
        console.error('Error loading switch ports for camera edit:', err);
      }
    };
    loadPorts();
  }, [editFormData.switch_id]);

  // Load patch panel ports occupancy when editing patch_panel_id
  useEffect(() => {
    if (!editFormData.patch_panel_id) {
      setOccupiedPpPorts({});
      return;
    }
    const loadPpOccupancy = async () => {
      try {
        const [
          { data: cams },
          { data: puntos },
        ] = await Promise.all([
          supabase
            .from('camaras')
            .select('id, codigo, puerto_patch')
            .eq('patch_panel_id', editFormData.patch_panel_id)
            .neq('id', currentCam.id),
          supabase
            .from('puntos_red')
            .select('id, codigo, puerto_patch')
            .eq('patch_panel_id', editFormData.patch_panel_id),
        ]);

        const occMap: { [port: number]: string } = {};
        (cams || []).forEach(c => {
          if (c.puerto_patch) occMap[c.puerto_patch] = c.codigo;
        });
        (puntos || []).forEach(pt => {
          if (pt.puerto_patch) occMap[pt.puerto_patch] = pt.codigo;
        });
        setOccupiedPpPorts(occMap);
      } catch (err) {
        console.error('Error loading patch panel occupancy for camera edit:', err);
      }
    };
    loadPpOccupancy();
  }, [editFormData.patch_panel_id, currentCam.id]);

  // Lifecycle & Delete modals
  const [decommissionModalOpen, setDecommissionModalOpen] = useState(false);
  const [deleteConfirmModalOpen, setDeleteConfirmModalOpen] = useState(false);

  // Load camera linked entities and hierarchy
  const loadCameraRelations = async () => {
    try {
      // Refresh current camera record
      const { data: refreshedCam } = await supabase
        .from('camaras')
        .select('*')
        .eq('id', camera.id)
        .single();
      
      const activeCam = refreshedCam || camera;
      setCurrentCam(activeCam);

      // Parallel fetch related tables
      const [
        { data: rData },
        { data: ppData },
        { data: swData },
        { data: nvrData },
        { data: provData },
        { data: hData },
        { data: marcasData },
        { data: modelosData },
        { data: pisosData },
        { data: edData },
        { data: cData },
        { data: sData },
        { data: racksData },
        { data: eqData }
      ] = await Promise.all([
        activeCam.rack_id ? supabase.from('racks').select('*').eq('id', activeCam.rack_id).single() : Promise.resolve({ data: null }),
        activeCam.patch_panel_id ? supabase.from('equipos').select('*').eq('id', activeCam.patch_panel_id).single() : Promise.resolve({ data: null }),
        activeCam.switch_id ? supabase.from('equipos').select('*').eq('id', activeCam.switch_id).single() : Promise.resolve({ data: null }),
        activeCam.nvr_id ? supabase.from('equipos').select('*').eq('id', activeCam.nvr_id).single() : Promise.resolve({ data: null }),
        supabase.from('proveedores').select('*'),
        supabase.from('historial_mantenimiento').select('*').eq('entidad_id', activeCam.id).order('fecha', { ascending: false }),
        supabase.from('marcas').select('*').order('nombre'),
        supabase.from('modelos').select('*').order('nombre'),
        supabase.from('pisos').select('*').order('nombre'),
        supabase.from('edificios').select('*').order('nombre'),
        supabase.from('campus').select('*').order('nombre'),
        supabase.from('sedes').select('*').order('nombre'),
        supabase.from('racks').select('*').order('codigo'),
        supabase.from('equipos').select('*').order('codigo'),
      ]);

      if (rData) setRack(rData);
      if (ppData) setPatchPanel(ppData);
      if (swData) setSwitchEq(swData);
      if (nvrData) setNvrEq(nvrData);
      
      const provs = provData || [];
      setProveedoresList(provs);
      setMarcas(marcasData || []);
      setModelos(modelosData || []);
      setPisos(pisosData || []);
      setEdificios(edData || []);
      setCampusList(cData || []);
      setSedes(sData || []);
      setAllRacks(racksData || []);
      setAllEquipos(eqData || []);

      if (activeCam.proveedor_compra_id) {
        setProvCompra(provs.find(p => p.id === activeCam.proveedor_compra_id) || null);
      }
      if (activeCam.proveedor_instalacion_id) {
        setProvInst(provs.find(p => p.id === activeCam.proveedor_instalacion_id) || null);
      }

      setHistorial(hData || []);
    } catch (err) {
      console.error('Error loading camera detail relations:', err);
    }
  };

  useEffect(() => {
    loadCameraRelations();
  }, [camera.id]);

  // Helper to format floor hierarchy name
  const getPisoLabel = (p: Piso) => {
    const ed = edificios.find(e => e.id === p.edificio_id);
    const camp = campusList.find(c => c.id === ed?.campus_id);
    const sed = sedes.find(s => s.id === camp?.sede_id);
    return `${p.nombre} — ${ed?.nombre || 'Edificio'}, ${camp?.nombre || 'Campus'} (${sed?.nombre || 'Sede'})`;
  };

  const openEditModal = () => {
    const rawType = (currentCam.tipo_camara || currentCam.tipo_dispositivo || 'domo') as any;
    setEditFormData({
      codigo: currentCam.codigo,
      tipo_camara: rawType,
      tipo_dispositivo: rawType,
      marca_id: currentCam.marca_id || null,
      modelo_id: currentCam.modelo_id || null,
      marca: currentCam.marca || '',
      modelo: currentCam.modelo || '',
      numero_serie: currentCam.numero_serie || '',
      direccion_mac: currentCam.direccion_mac || '',
      direccion_ip: currentCam.direccion_ip || '',
      ubicacion_especifica: currentCam.ubicacion_especifica || '',
      piso_id: currentCam.piso_id,
      rack_id: currentCam.rack_id || null,
      patch_panel_id: currentCam.patch_panel_id || null,
      switch_id: currentCam.switch_id || null,
      nvr_id: currentCam.nvr_id || null,
      puerto_patch: currentCam.puerto_patch ?? null,
      puerto_switch: currentCam.puerto_switch ? (String(currentCam.puerto_switch).match(/\d+$/)?.[0] || String(currentCam.puerto_switch)) : null,
      canal_nvr: currentCam.canal_nvr ?? null,
      posicion_x: currentCam.posicion_x ?? 50,
      posicion_y: currentCam.posicion_y ?? 50,
      ambiente: currentCam.ambiente || 'interior',
      antivandalico: currentCam.antivandalico ?? true,
      resolucion_mp: currentCam.resolucion_mp ?? 4,
      altura_montaje_m: currentCam.altura_montaje_m ?? 2.8,
      lente: currentCam.lente || '2.8mm',
      zoom_optico: currentCam.zoom_optico || '',
      num_sensores: currentCam.num_sensores ?? 4,
      azimut: currentCam.azimut ?? 105,
      apertura_fov: currentCam.apertura_fov || 103,
      alcance_metros: currentCam.alcance_metros || 18.5,
      fecha_compra: currentCam.fecha_compra || '',
      fecha_instalacion: currentCam.fecha_instalacion || '',
      proveedor_compra_id: currentCam.proveedor_compra_id || undefined,
      proveedor_instalacion_id: currentCam.proveedor_instalacion_id || undefined,
    });
    setIsEditing(true);
  };

  const handleEditTipoChange = (newTipo: string) => {
    const updated: Partial<Camara> = {
      ...editFormData,
      tipo_camara: newTipo,
      tipo_dispositivo: newTipo as any,
    };
    if (newTipo === 'domo' || newTipo === 'bullet') {
      updated.zoom_optico = null;
      updated.num_sensores = null;
      if (!updated.lente) updated.lente = '2.8mm';
      if (updated.apertura_fov === 360) updated.apertura_fov = 103;
      if (updated.azimut === null) updated.azimut = 105;
    } else if (newTipo === 'ptz') {
      updated.lente = null;
      updated.num_sensores = null;
      updated.apertura_fov = 360;
      updated.azimut = null;
    } else if (newTipo === 'fisheye') {
      updated.lente = null;
      updated.zoom_optico = null;
      updated.num_sensores = null;
      updated.apertura_fov = 360;
      updated.azimut = null;
    } else if (newTipo === 'multisensor') {
      updated.lente = null;
      updated.zoom_optico = null;
      if (!updated.num_sensores) updated.num_sensores = 4;
      if (updated.apertura_fov === 360 || (updated.apertura_fov && updated.apertura_fov < 180)) updated.apertura_fov = 180;
      if (updated.azimut === null) updated.azimut = 105;
    }
    setEditFormData(updated);
  };

  // Interactive Pin Placement on Floor Plan in Edit Modal
  const handleFloorPlanClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pctX = Math.round((x / rect.width) * 100);
    const pctY = Math.round((y / rect.height) * 100);
    setEditFormData(prev => ({
      ...prev,
      posicion_x: Math.max(2, Math.min(98, pctX)),
      posicion_y: Math.max(2, Math.min(98, pctY)),
    }));
  };

  const [uploadingPlan, setUploadingPlan] = useState(false);

  const handleUploadPisoPlanEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetPisoId = editFormData.piso_id || currentCam.piso_id;
    if (!file || !targetPisoId) return;
    try {
      setUploadingPlan(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const { error } = await supabase
          .from('pisos')
          .update({ plano_url: base64 })
          .eq('id', targetPisoId);

        if (error) throw error;
        setPisos(prev => prev.map(p => p.id === targetPisoId ? { ...p, plano_url: base64 } : p));
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Error uploading floor plan in CameraDetail:', err);
      alert('Error al subir plano: ' + (err.message || String(err)));
    } finally {
      setUploadingPlan(false);
    }
  };

  const handleSaveCamera = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);

      const tCam = editFormData.tipo_camara || 'domo';
      const isPtz = tCam === 'ptz';
      const isFisheye = tCam === 'fisheye';
      const isMultisensor = tCam === 'multisensor';
      const isDomoOrBullet = tCam === 'domo' || tCam === 'bullet';

      const finalFov = isPtz ? 360 : (editFormData.apertura_fov ?? (isFisheye ? 360 : 103));
      const finalAzimut = isPtz ? null : (isFisheye && finalFov >= 360 ? null : editFormData.azimut);
      const finalLente = isDomoOrBullet ? (editFormData.lente || null) : null;
      const finalZoom = isPtz ? (editFormData.zoom_optico || null) : null;
      const finalNumSensores = isMultisensor ? (editFormData.num_sensores || 4) : null;

      // 1. Validar puerto de Patch Panel no ocupado
      if (editFormData.patch_panel_id && editFormData.puerto_patch) {
        const portNum = Number(editFormData.puerto_patch);
        // Validar contra otras cámaras en ese patch panel
        const { data: occCam } = await supabase
          .from('camaras')
          .select('id, codigo')
          .eq('patch_panel_id', editFormData.patch_panel_id)
          .eq('puerto_patch', portNum)
          .neq('id', currentCam.id)
          .maybeSingle();

        if (occCam) {
          alert(`Error de validación: El puerto ${portNum} del Patch Panel ya está ocupado por la cámara "${occCam.codigo}". Por favor selecciona un puerto libre.`);
          setSaving(false);
          return;
        }

        // Validar contra puntos de red en ese patch panel
        const { data: occPunto } = await supabase
          .from('puntos_red')
          .select('id, codigo')
          .eq('patch_panel_id', editFormData.patch_panel_id)
          .eq('puerto_patch', portNum)
          .maybeSingle();

        if (occPunto) {
          alert(`Error de validación: El puerto ${portNum} del Patch Panel ya está ocupado por el punto de red "${occPunto.codigo}". Por favor selecciona un puerto libre.`);
          setSaving(false);
          return;
        }
      }

      // 2. Validar puerto de Switch no ocupado
      let cleanSwitchPort: string | null = null;
      if (editFormData.switch_id && editFormData.puerto_switch) {
        cleanSwitchPort = String(editFormData.puerto_switch).match(/\d+$/)?.[0] || String(editFormData.puerto_switch).trim();
        const pNum = parseInt(cleanSwitchPort, 10);

        // Validar en puertos de switch cargados
        const matchedSwPort = editSwitchPorts.find(p => p.numero_puerto === pNum);
        if (matchedSwPort?.ocupado_por_codigo && matchedSwPort.ocupado_por_codigo !== currentCam.codigo) {
          alert(`Error de validación: El puerto ${cleanSwitchPort} del Switch ya está ocupado por "${matchedSwPort.ocupado_por_codigo}" (${matchedSwPort.ocupado_por_tipo === 'camara' ? 'Cámara' : 'Punto de red'}). Por favor selecciona un puerto libre.`);
          setSaving(false);
          return;
        }

        // Validar directamente en base de datos contra otras cámaras
        const { data: swCams } = await supabase
          .from('camaras')
          .select('id, codigo, puerto_switch')
          .eq('switch_id', editFormData.switch_id)
          .neq('id', currentCam.id);

        const conflictingCam = (swCams || []).find(c => {
          if (!c.puerto_switch) return false;
          const cP = String(c.puerto_switch).match(/\d+$/)?.[0] || String(c.puerto_switch);
          return cP === cleanSwitchPort;
        });

        if (conflictingCam) {
          alert(`Error de validación: El puerto ${cleanSwitchPort} del Switch ya está ocupado por la cámara "${conflictingCam.codigo}". Por favor selecciona un puerto libre.`);
          setSaving(false);
          return;
        }
      }

      const payload: any = {
        codigo: editFormData.codigo?.trim() || currentCam.codigo,
        piso_id: editFormData.piso_id || currentCam.piso_id,
        rack_id: editFormData.rack_id || null,
        patch_panel_id: editFormData.patch_panel_id || null,
        switch_id: editFormData.switch_id || null,
        nvr_id: editFormData.nvr_id || null,
        puerto_patch: editFormData.puerto_patch ? Number(editFormData.puerto_patch) : null,
        puerto_switch: cleanSwitchPort,
        canal_nvr: editFormData.canal_nvr ? Number(editFormData.canal_nvr) : null,
        marca_id: editFormData.marca_id || null,
        modelo_id: editFormData.modelo_id || null,
        marca: editFormData.marca || null,
        modelo: editFormData.modelo || null,
        numero_serie: editFormData.numero_serie?.trim() || null,
        direccion_mac: editFormData.direccion_mac?.trim() || null,
        direccion_ip: editFormData.direccion_ip?.trim() || null,
        ubicacion_especifica: editFormData.ubicacion_especifica?.trim() || null,
        ambiente: editFormData.ambiente || 'interior',
        antivandalico: editFormData.antivandalico ?? true,
        resolucion_mp: editFormData.resolucion_mp ? Number(editFormData.resolucion_mp) : 4,
        altura_montaje_m: editFormData.altura_montaje_m ? Number(editFormData.altura_montaje_m) : 2.8,
        tipo_camara: tCam,
        tipo_dispositivo: tCam,
        apertura_fov: finalFov,
        azimut: finalAzimut,
        lente: finalLente,
        zoom_optico: finalZoom,
        num_sensores: finalNumSensores,
        alcance_metros: editFormData.alcance_metros ? Number(editFormData.alcance_metros) : 18.5,
        posicion_x: editFormData.posicion_x ?? 50,
        posicion_y: editFormData.posicion_y ?? 50,
        fecha_compra: editFormData.fecha_compra?.trim() || null,
        fecha_instalacion: editFormData.fecha_instalacion?.trim() || null,
        proveedor_compra_id: editFormData.proveedor_compra_id || null,
        proveedor_instalacion_id: editFormData.proveedor_instalacion_id || null,
      };

      const { data, error } = await supabase
        .from('camaras')
        .update(payload)
        .eq('id', currentCam.id)
        .select()
        .single();

      if (error) throw error;

      setCurrentCam(data);
      setIsEditing(false);
      loadCameraRelations();
      if (onCameraUpdated) {
        onCameraUpdated(data);
      }
    } catch (err: any) {
      console.error('Error saving camera:', err);
      alert('Error al guardar datos de la cámara: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Filtered racks and equipments for the modal selectors
  const modalRacks = allRacks.filter(r => !editFormData.piso_id || r.piso_id === editFormData.piso_id);
  const selectedRackId = editFormData.rack_id;
  const rackPatchPanels = allEquipos.filter(e => e.tipo === 'patch_panel' && (!selectedRackId || e.rack_id === selectedRackId));
  const rackSwitches = allEquipos.filter(e => e.tipo === 'switch' && (!selectedRackId || e.rack_id === selectedRackId));
  const rackNvrs = allEquipos.filter(e => e.tipo === 'nvr' && (!selectedRackId || e.rack_id === selectedRackId));

  // Current floor name for display
  const currentPiso = pisos.find(p => p.id === currentCam.piso_id);
  const currentEdificio = currentPiso ? edificios.find(e => e.id === currentPiso.edificio_id) : null;

  // Coordinates and FOV cone math for preview in read-only and edit modals
  const posX = currentCam.posicion_x || 48.5;
  const posY = currentCam.posicion_y || 32.1;
  const currentTipo = currentCam.tipo_camara || currentCam.tipo_dispositivo || 'domo';
  const isPtz = currentTipo === 'ptz';
  const effectiveFov = isPtz ? 360 : (currentCam.apertura_fov || 103);
  const isCircle = effectiveFov >= 360;
  const safeAzimut = currentCam.azimut ?? 90;
  const fovRadius = 80;

  const radStart = ((safeAzimut - effectiveFov / 2 - 90) * Math.PI) / 180;
  const radEnd = ((safeAzimut + effectiveFov / 2 - 90) * Math.PI) / 180;
  const x1 = (posX * 400) / 100;
  const y1 = (posY * 220) / 100;
  const x2 = x1 + Math.cos(radStart) * fovRadius;
  const y2 = y1 + Math.sin(radStart) * fovRadius;
  const x3 = x1 + Math.cos(radEnd) * fovRadius;
  const y3 = y1 + Math.sin(radEnd) * fovRadius;
  const largeArcFlag = effectiveFov > 180 ? 1 : 0;
  const conePath = `M ${x1} ${y1} L ${x2} ${y2} A ${fovRadius} ${fovRadius} 0 ${largeArcFlag} 1 ${x3} ${y3} Z`;

  // Live SVG calculations for edit modal
  const editPosX = editFormData.posicion_x ?? posX;
  const editPosY = editFormData.posicion_y ?? posY;
  const editTipoCur = editFormData.tipo_camara || currentTipo;
  const editIsPtz = editTipoCur === 'ptz';
  const editFovVal = editIsPtz ? 360 : (editFormData.apertura_fov || 103);
  const editIsCircle = editFovVal >= 360;
  const editSafeAz = editFormData.azimut ?? 90;
  const editRadStart = ((editSafeAz - editFovVal / 2 - 90) * Math.PI) / 180;
  const editRadEnd = ((editSafeAz + editFovVal / 2 - 90) * Math.PI) / 180;
  const editX1 = (editPosX * 400) / 100;
  const editY1 = (editPosY * 220) / 100;
  const editRadius = Math.min(120, Math.max(35, (editFormData.alcance_metros || 18) * 3.5));
  const editX2 = editX1 + Math.cos(editRadStart) * editRadius;
  const editY2 = editY1 + Math.sin(editRadStart) * editRadius;
  const editX3 = editX1 + Math.cos(editRadEnd) * editRadius;
  const editY3 = editY1 + Math.sin(editRadEnd) * editRadius;
  const editLargeArc = editFovVal > 180 ? 1 : 0;
  const editConePath = `M ${editX1} ${editY1} L ${editX2} ${editY2} A ${editRadius} ${editRadius} 0 ${editLargeArc} 1 ${editX3} ${editY3} Z`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner & Status strip */}
      <div className="flex flex-wrap items-center justify-between text-[11px] font-mono border-b border-slate-200 pb-2 text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          {(!currentCam.estado_ciclo_vida || currentCam.estado_ciclo_vida === 'instalado') ? (
            <span className="text-emerald-700 font-semibold flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              ACTIVO INSTALADO EN TERRENO
            </span>
          ) : (
            <span className="text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded font-bold uppercase flex items-center gap-1">
              <Archive className="w-3.5 h-3.5 text-amber-700" />
              ESTADO: {currentCam.estado_ciclo_vida.replace(/_/g, ' ')}
            </span>
          )}
          <span>•</span>
          <span>Última Inspección: 15/03/2024</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            Catálogo: CCTV-IND-DOM
          </span>
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 font-semibold">
            {currentCam.antivandalico ? 'IK10 Vandal-Proof' : 'Estándar'}
          </span>
        </div>
      </div>

      {/* Main Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 text-slate-600 transition-colors"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-[10px] font-mono text-blue-700 font-semibold tracking-wider uppercase mb-0.5">
              IDENTIFICADOR FÍSICO · NORMA TIA-606-C
            </div>
            <div className="flex items-center gap-2">
              <Camera className="w-6 h-6 text-blue-600" />
              <h1 className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
                {currentCam.codigo}
              </h1>
              <span className="text-xs font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold uppercase">
                {currentCam.tipo_camara || currentCam.tipo_dispositivo || 'Domo'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5 font-medium">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {currentEdificio ? currentEdificio.nombre : ''}{currentPiso ? ` — ${currentPiso.nombre}` : ''}{currentCam.ubicacion_especifica ? `, ${currentCam.ubicacion_especifica}` : ''}
              </span>
            </p>
          </div>
        </div>

        {/* Action Buttons: Explicit Editar, Retirar de Instalación, Eliminar Definitivamente */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={openEditModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-xs"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Editar Cámara</span>
          </button>

          <button
            onClick={() => setDecommissionModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded transition-colors shadow-2xs"
            title="Retirar de servicio para enviar a bodega o baja"
          >
            <Archive className="w-3.5 h-3.5 text-amber-700" />
            <span>Retirar de Instalación</span>
          </button>

          <button
            onClick={() => setDeleteConfirmModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-900 border border-red-300 rounded transition-colors shadow-2xs"
            title="Eliminar permanentemente de la base de datos"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            <span>Eliminar Definitivamente</span>
          </button>

          <button
            onClick={() => onNavigateToMaintenance(currentCam)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
          >
            <Wrench className="w-3.5 h-3.5 text-slate-600" />
            <span>Bitácora ({historial.length})</span>
          </button>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Imprimir PDF</span>
          </button>
        </div>
      </div>

      {/* Grid: Left Technical Datasheets & Right CAD Plan / Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 3 Structured Technical Sections */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section 1: Hardware & Especificaciones */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <Camera className="w-4 h-4 text-blue-600" />
                <span>1. Hardware & Especificaciones</span>
              </h2>
              <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-bold uppercase">
                {currentTipo.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono bg-slate-50 p-4 rounded border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">MARCA / FABRICANTE</span>
                <span className="font-bold text-slate-900 text-sm">{currentCam.marca || 'No registrada'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">MODELO EXACTO</span>
                <span className="font-bold text-slate-900">{currentCam.modelo || 'No registrado'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">NÚMERO DE SERIE</span>
                <span className="font-bold text-blue-700">{currentCam.numero_serie || 'No registrado'}</span>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase block">DIRECCIÓN MAC</span>
                <span className="font-bold text-slate-800">{currentCam.direccion_mac || 'No registrada'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">DIRECCIÓN IP ESTÁTICA</span>
                <span className="font-bold text-blue-700">{currentCam.direccion_ip || 'No asignada'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">RESOLUCIÓN SENSOR</span>
                <span className="font-bold text-slate-800">{currentCam.resolucion_mp ? `${currentCam.resolucion_mp} MP` : 'No especificada'}</span>
              </div>

              <div>
                <span className="text-[10px] text-slate-500 uppercase block">AMBIENTE</span>
                <span className="font-bold text-slate-800">
                  {currentCam.ambiente === 'exterior' ? 'Exterior (IP67)' : 'Interior'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">PROTECCIÓN ANTIVANDÁLICA</span>
                <span className="font-bold text-slate-800">
                  {currentCam.antivandalico ? 'Sí (IK10 Reforzada)' : 'No estándar'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">ALTURA DE MONTAJE</span>
                <span className="font-bold text-slate-800">{currentCam.altura_montaje_m || 2.8} m s.n.p.t.</span>
              </div>

              {/* CAMPOS ESPECÍFICOS SEGÚN EL TIPO */}
              {(currentTipo === 'domo' || currentTipo === 'bullet') && (
                <>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">ÓPTICA / LENTE</span>
                    <span className="font-bold text-blue-800">{currentCam.lente || '2.8 mm'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">APERTURA FOV</span>
                    <span className="font-bold text-blue-800">{currentCam.apertura_fov || 103}° Horizontal</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">ORIENTACIÓN / AZIMUT</span>
                    <span className="font-bold text-blue-800">{currentCam.azimut ?? 0}°</span>
                  </div>
                </>
              )}

              {currentTipo === 'ptz' && (
                <>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">ZOOM ÓPTICO</span>
                    <span className="font-bold text-blue-800">{currentCam.zoom_optico || '25x Motorizado'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[10px] text-slate-500 uppercase block">COBERTURA ANGULAR</span>
                    <span className="font-bold text-blue-800">360° Giro Continuo Panorámico (Sin Azimut Fijo)</span>
                  </div>
                </>
              )}

              {currentTipo === 'fisheye' && (
                <>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">APERTURA FOV</span>
                    <span className="font-bold text-blue-800">
                      {currentCam.apertura_fov || 360}° ({currentCam.apertura_fov === 180 ? 'Muro' : 'Techo 360°'})
                    </span>
                  </div>
                  {currentCam.apertura_fov && currentCam.apertura_fov < 360 && (
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">ORIENTACIÓN / AZIMUT</span>
                      <span className="font-bold text-blue-800">{currentCam.azimut ?? 90}°</span>
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">ALCANCE ÚTIL</span>
                    <span className="font-bold text-slate-800">{currentCam.alcance_metros || 18.5} m</span>
                  </div>
                </>
              )}

              {currentTipo === 'multisensor' && (
                <>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">NÚMERO DE SENSORES</span>
                    <span className="font-bold text-blue-800">{currentCam.num_sensores || 4} Sensores independientes</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">APERTURA FOV TOTAL</span>
                    <span className="font-bold text-blue-800">{currentCam.apertura_fov || 180}°</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">ORIENTACIÓN CENTRAL</span>
                    <span className="font-bold text-blue-800">{currentCam.azimut ?? 0}°</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section 2: Trayectoria de Cableado & Topología Física */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <Cable className="w-4 h-4 text-blue-600" />
                <span>2. Trayectoria de Cableado & Topología Física</span>
              </h2>
              <span className="text-[10px] font-mono text-slate-400 uppercase">
                INFRAESTRUCTURA PASIVA / ACTIVA
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div 
                onClick={() => rack && onNavigateToRack(rack.id)}
                className={`p-3 rounded border transition-colors ${
                  rack ? 'bg-slate-50 border-slate-200 hover:bg-blue-50/50 cursor-pointer' : 'bg-slate-50/50 border-dashed border-slate-300'
                }`}
              >
                <span className="text-[10px] text-slate-500 uppercase block">RACK DE CABECERA</span>
                <span className="font-bold text-blue-700 text-xs block truncate">{rack?.codigo || '(Sin rack)'}</span>
                <span className="text-[10px] text-slate-500 truncate block">{rack?.ubicacion_especifica || 'Sala Técnica'}</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <span className="text-[10px] text-slate-500 uppercase block">PATCH PANEL & PUERTO</span>
                <span className="font-bold text-slate-900 text-xs block truncate">
                  {patchPanel ? `${patchPanel.codigo} • P${String(currentCam.puerto_patch || 1).padStart(2, '0')}` : (currentCam.puerto_patch ? `Puerto ${currentCam.puerto_patch}` : 'Sin parchear')}
                </span>
                <span className="text-[10px] text-slate-500 block truncate">
                  {patchPanel ? (patchPanel.modelo || (patchPanel.puertos_totales ? `${patchPanel.puertos_totales} Puertos` : 'Patch Panel')) : '-'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <span className="text-[10px] text-slate-500 uppercase block">SWITCH DE ACCESO</span>
                <span className="font-bold text-slate-900 text-xs block truncate">
                  {switchEq ? `${switchEq.codigo} • ${currentCam.puerto_switch || 'Puerto no configurado'}` : (currentCam.puerto_switch || 'Sin switch')}
                </span>
                <span className="text-[10px] text-slate-500 block truncate">{switchEq?.modelo || '-'}</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <span className="text-[10px] text-slate-500 uppercase block">DESTINO GRABACIÓN</span>
                <span className="font-bold text-slate-900 text-xs block truncate">
                  {nvrEq ? `${nvrEq.codigo} • Ch ${String(currentCam.canal_nvr || 1).padStart(2, '0')}` : (currentCam.canal_nvr ? `Canal ${currentCam.canal_nvr}` : 'Sin NVR')}
                </span>
                <span className="text-[10px] text-slate-500 block truncate">{nvrEq?.modelo || '-'}</span>
              </div>
            </div>
          </div>

          {/* Section 3: Datos de Adquisición e Instalación */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>3. Adquisición, Garantía & Contratistas</span>
              </h2>
              <span className="text-[10px] font-mono text-slate-400 uppercase">
                ADMINISTRATIVO / FINANCIERO
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono bg-slate-50 p-4 rounded border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">FECHA DE COMPRA</span>
                <span className="font-bold text-slate-900">{currentCam.fecha_compra || 'No registrada'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">PROVEEDOR DE COMPRA</span>
                <span className="font-bold text-blue-700">{provCompra?.nombre || 'No registrado'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">FECHA DE INSTALACIÓN</span>
                <span className="font-bold text-slate-900">{currentCam.fecha_instalacion || 'No registrada'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">CONTRATISTA DE INSTALACIÓN</span>
                <span className="font-bold text-blue-700">{provInst?.nombre || 'No registrado'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: CAD Plan Geometry & History */}
        <div className="lg:col-span-5 space-y-6">
          {/* Section 4: Posicionamiento en Plano CAD */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-blue-600" />
                <span>Ubicación en Plano CAD ({currentPiso?.nombre || 'Piso 2'})</span>
              </h3>
              <span className="text-[10px] font-mono text-slate-500">
                X={posX}%, Y={posY}%
              </span>
            </div>

            <div className="bg-[#f8fafc] border border-slate-300 rounded p-2 overflow-hidden shadow-inner mb-3">
              <svg viewBox="0 0 400 220" className="w-full h-48 select-none">
                <defs>
                  <pattern id="gridDet" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="400" height="220" fill="url(#gridDet)" />

                {/* Custom floor plan image if loaded for this piso */}
                {currentPiso?.plano_url ? (
                  <image 
                    href={currentPiso.plano_url} 
                    xlinkHref={currentPiso.plano_url}
                    x="0" 
                    y="0" 
                    width="400" 
                    height="220" 
                    preserveAspectRatio="xMidYMid meet" 
                    opacity="0.95" 
                  />
                ) : (
                  <>
                    {/* Simplified CAD architecture */}
                    <rect x="20" y="20" width="100" height="70" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                    <text x="70" y="55" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle">{currentPiso?.nombre || 'Piso'} - SALA 1</text>
                    <rect x="130" y="20" width="100" height="70" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                    <text x="180" y="55" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle">LAB REDES</text>
                    <rect x="240" y="20" width="140" height="70" fill="#eff6ff" stroke="#3b82f6" strokeWidth="1.5" />
                    <text x="310" y="55" fontSize="8" fontFamily="monospace" fill="#475569" textAnchor="middle">SALA TÉCNICA IDF</text>
                    <rect x="20" y="100" width="360" height="40" fill="#f0f7ff" stroke="#93c5fd" strokeWidth="1" strokeDasharray="3,3" />
                    <text x="75" y="124" fontSize="8" fontFamily="monospace" fill="#3b82f6" fontWeight="bold">PASILLO {currentPiso?.nombre?.toUpperCase() || 'PISO'} · {currentEdificio?.nombre?.toUpperCase() || ''}</text>
                    <rect x="20" y="150" width="360" height="60" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                    <text x="180" y="185" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle">OFICINAS Y DEPENDENCIAS</text>
                  </>
                )}

                {/* Dynamic FOV coverage */}
                {isCircle ? (
                  <circle 
                    cx={x1} 
                    cy={y1} 
                    r={fovRadius} 
                    fill="rgba(37, 99, 235, 0.25)" 
                    stroke="#2563eb" 
                    strokeWidth="1.5" 
                    strokeDasharray="2,2" 
                  />
                ) : (
                  <path 
                    d={conePath} 
                    fill="rgba(37, 99, 235, 0.32)" 
                    stroke="#2563eb" 
                    strokeWidth="1.5" 
                    strokeDasharray="2,2" 
                  />
                )}

                {/* Camera Pin */}
                <circle cx={x1} cy={y1} r="7" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
                <circle cx={x1} cy={y1} r="3" fill="#ffffff" />
                <text x={x1} y={y1 - 10} fontSize="8" fontFamily="monospace" fill="#1e40af" fontWeight="bold" textAnchor="middle">
                  {currentCam.codigo}
                </text>
              </svg>
            </div>

            {onNavigateToPlanimetria && (
              <button
                onClick={onNavigateToPlanimetria}
                className="w-full py-1.5 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-mono font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <Compass className="w-3.5 h-3.5 text-blue-600" />
                <span>Abrir en Planimetría & Vector de Cobertura</span>
              </button>
            )}
          </div>

          {/* Section 5: Estado de Bitácora (Timeline Preview) */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-blue-600" />
                <span>Estado de Bitácora ({historial.length} Eventos)</span>
              </h3>
              <button
                onClick={() => onNavigateToMaintenance(currentCam)}
                className="text-blue-600 hover:text-blue-800 text-[11px] font-mono font-medium hover:underline flex items-center gap-0.5"
              >
                <span>Ver Todo</span>
              </button>
            </div>

            <div className="space-y-3">
              {historial.length === 0 ? (
                <p className="text-xs text-slate-400 font-mono py-4 text-center">
                  No hay intervenciones registradas en bitácora.
                </p>
              ) : (
                historial.slice(0, 3).map((item) => (
                  <div key={item.id} className="p-3 bg-slate-50 rounded border border-slate-200 text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 font-bold">
                        {new Date(item.fecha).toLocaleDateString()}
                      </span>
                      <span className="text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200 uppercase font-semibold">
                        {item.tipo_intervencion.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {item.ticket_referencia && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 inline-block">
                        Ticket: {item.ticket_referencia}
                      </span>
                    )}
                    <p className="text-slate-800 font-medium text-[11px] line-clamp-2">
                      {item.descripcion}
                    </p>
                    <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200/60 flex justify-between">
                      <span>Téc: {item.tecnico_responsable}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FULL EDIT CAMERA MODAL WITH POSITION PIN-MOVER, LOCATION & NETWORKING */}
      {isEditing && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-4xl w-full max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 font-mono text-xs">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between sticky top-0 z-10">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-600" />
                <span>Editar Cámara Completa: {currentCam.codigo}</span>
              </h3>
              <button 
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCamera} className="p-6 space-y-6">
              {/* BLOQUE 1: IDENTIFICACIÓN Y HARDWARE */}
              <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-blue-600" />
                  <span>1. Identificación y Hardware Físico</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Tipo de Cámara *</label>
                    <select
                      value={editFormData.tipo_camara || 'domo'}
                      onChange={(e) => handleEditTipoChange(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-semibold text-blue-900"
                    >
                      <option value="domo">Cámara Domo Fijo</option>
                      <option value="bullet">Cámara Bullet</option>
                      <option value="ptz">Cámara PTZ Motorizada</option>
                      <option value="fisheye">Cámara Fisheye (360° / 180°)</option>
                      <option value="multisensor">Cámara Multisensor</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Código / Rótulo *</label>
                    <input
                      type="text"
                      required
                      value={editFormData.codigo || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, codigo: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded font-bold text-blue-700 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Número de Serie</label>
                    <input
                      type="text"
                      value={editFormData.numero_serie || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, numero_serie: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                    />
                  </div>
                </div>

                {/* Marca y Modelo administrables */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Marca</label>
                    <MarcaSelect
                      value={editFormData.marca_id}
                      marcas={marcas}
                      onMarcaCreated={(newM) => setMarcas(prev => [...prev, newM].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
                      onChange={(mId, mName) => {
                        setEditFormData({
                          ...editFormData,
                          marca_id: mId || null,
                          marca: mName || '',
                          modelo_id: null,
                          modelo: ''
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Modelo</label>
                    <ModeloSelect
                      value={editFormData.modelo_id}
                      marcaId={editFormData.marca_id}
                      tipoEquipo="camara"
                      modelos={modelos}
                      marcas={marcas}
                      onModeloCreated={(newMod) => setModelos(prev => [...prev, newMod].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
                      onChange={(modId, modName, defaults) => {
                        const next = {
                          ...editFormData,
                          modelo_id: modId || null,
                          modelo: modName || ''
                        };
                        if (defaults) {
                          if (defaults.tipo_camara_default) next.tipo_camara = defaults.tipo_camara_default as any;
                          if (defaults.lente_default) next.lente = defaults.lente_default;
                          if (defaults.resolucion_mp_default) next.resolucion_mp = defaults.resolucion_mp_default;
                          if (defaults.apertura_fov_default) next.apertura_fov = defaults.apertura_fov_default;
                          if (defaults.zoom_optico_default) next.zoom_optico = String(defaults.zoom_optico_default);
                        }
                        setEditFormData(next);
                      }}
                    />
                  </div>
                </div>

                {/* Red IP / MAC */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Dirección MAC</label>
                    <input
                      type="text"
                      value={editFormData.direccion_mac || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, direccion_mac: e.target.value })}
                      placeholder="54:8C:AF:..."
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Dirección IP Estática</label>
                    <input
                      type="text"
                      value={editFormData.direccion_ip || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, direccion_ip: e.target.value })}
                      placeholder="10.14.20.108"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-semibold text-blue-700"
                    />
                  </div>
                </div>

                {/* Parámetros ambientales y ópticos fijos */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-200">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Ambiente</label>
                    <select
                      value={editFormData.ambiente || 'interior'}
                      onChange={(e) => setEditFormData({ ...editFormData, ambiente: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      <option value="interior">Interior</option>
                      <option value="exterior">Exterior</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Antivandálica</label>
                    <select
                      value={editFormData.antivandalico ? 'si' : 'no'}
                      onChange={(e) => setEditFormData({ ...editFormData, antivandalico: e.target.value === 'si' })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      <option value="si">Sí (IK10)</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Resolución (MP)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editFormData.resolucion_mp ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditFormData({ ...editFormData, resolucion_mp: val === '' ? ('' as any) : parseFloat(val) });
                      }}
                      placeholder="4"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Altura Montaje (m)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editFormData.altura_montaje_m ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditFormData({ ...editFormData, altura_montaje_m: val === '' ? ('' as any) : parseFloat(val) });
                      }}
                      placeholder="2.8"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    />
                  </div>
                </div>

                {/* CAMPOS ESPECÍFICOS SEGÚN EL TIPO DE CÁMARA */}
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded space-y-2">
                  <span className="text-[10px] uppercase font-bold text-blue-800 tracking-wider block">
                    Parámetros Ópticos Dinámicos • {(editFormData.tipo_camara || 'domo').toUpperCase()}
                  </span>

                  {(editFormData.tipo_camara === 'domo' || editFormData.tipo_camara === 'bullet') && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-700 font-semibold mb-1">Lente / Óptica</label>
                        <input
                          type="text"
                          value={editFormData.lente || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, lente: e.target.value })}
                          placeholder="2.8mm"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-700 font-semibold mb-1">Apertura FOV (°)</label>
                        <input
                          type="number"
                          value={editFormData.apertura_fov ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditFormData({ ...editFormData, apertura_fov: val === '' ? ('' as any) : parseInt(val, 10) });
                          }}
                          placeholder="103"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-700 font-semibold mb-1">Azimut Orientación (°)</label>
                        <input
                          type="number"
                          value={editFormData.azimut ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditFormData({ ...editFormData, azimut: val === '' ? ('' as any) : parseInt(val, 10) });
                          }}
                          placeholder="90"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {editFormData.tipo_camara === 'ptz' && (
                    <div>
                      <label className="block text-[11px] text-slate-700 font-semibold mb-1">Zoom Óptico Motorizado *</label>
                      <input
                        type="text"
                        value={editFormData.zoom_optico || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, zoom_optico: e.target.value })}
                        placeholder="ej. 25x o 32x"
                        className="w-full max-w-xs px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Apertura fijada automáticamente en 360° panorámico y azimut en null.
                      </p>
                    </div>
                  )}

                  {editFormData.tipo_camara === 'fisheye' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-700 font-semibold mb-1">Apertura FOV Fisheye (°)</label>
                        <input
                          type="number"
                          value={editFormData.apertura_fov ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              setEditFormData({ ...editFormData, apertura_fov: '' as any });
                            } else {
                              const num = parseInt(val, 10);
                              setEditFormData({
                                ...editFormData,
                                apertura_fov: isNaN(num) ? ('' as any) : num,
                                azimut: num >= 360 ? null : (editFormData.azimut ?? 90),
                              });
                            }
                          }}
                          placeholder="360"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                        />
                        <span className="text-[10px] text-slate-500">360° Techo o 180° Muro</span>
                      </div>
                      {(editFormData.apertura_fov || 360) < 360 && (
                        <div>
                          <label className="block text-[11px] text-slate-700 font-semibold mb-1">Azimut Muro (°)</label>
                          <input
                            type="number"
                            value={editFormData.azimut ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditFormData({ ...editFormData, azimut: val === '' ? ('' as any) : parseInt(val, 10) });
                            }}
                            placeholder="90"
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {editFormData.tipo_camara === 'multisensor' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-700 font-semibold mb-1">N° de Sensores *</label>
                        <input
                          type="number"
                          min="2"
                          max="8"
                          value={editFormData.num_sensores ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditFormData({ ...editFormData, num_sensores: val === '' ? ('' as any) : parseInt(val, 10) });
                          }}
                          placeholder="4"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-700 font-semibold mb-1">FOV Total (°)</label>
                        <input
                          type="number"
                          value={editFormData.apertura_fov ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditFormData({ ...editFormData, apertura_fov: val === '' ? ('' as any) : parseInt(val, 10) });
                          }}
                          placeholder="180"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-700 font-semibold mb-1">Azimut Central (°)</label>
                        <input
                          type="number"
                          value={editFormData.azimut ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditFormData({ ...editFormData, azimut: val === '' ? ('' as any) : parseInt(val, 10) });
                          }}
                          placeholder="90"
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* BLOQUE 2: UBICACIÓN Y TOPOLOGÍA DE RED COMPLETA */}
              <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-2">
                  <Cable className="w-3.5 h-3.5 text-blue-600" />
                  <span>2. Ubicación Física y Trayectoria de Red</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-700 font-semibold mb-1">Piso (Jerarquía Sede &gt; Campus &gt; Edificio) *</label>
                    <select
                      required
                      value={editFormData.piso_id || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, piso_id: e.target.value, rack_id: null })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      <option value="" disabled>Seleccione piso...</option>
                      {pisos.map(p => (
                        <option key={p.id} value={p.id}>{getPisoLabel(p)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-700 font-semibold mb-1">Rack de Cabecera</label>
                    <select
                      value={editFormData.rack_id || ''}
                      onChange={(e) => setEditFormData({
                        ...editFormData, 
                        rack_id: e.target.value || null,
                        patch_panel_id: null,
                        switch_id: null,
                        nvr_id: null
                      })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      <option value="">(Sin rack asignado)</option>
                      {modalRacks.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.codigo} {r.ubicacion_especifica ? `— ${r.ubicacion_especifica}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Ubicación Específica en Piso</label>
                  <input
                    type="text"
                    value={editFormData.ubicacion_especifica || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, ubicacion_especifica: e.target.value })}
                    placeholder="ej. Pasillo central Piso 2, cielo falso frente a Aula 202"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                  />
                </div>

                {/* Dispositivos de red en ese rack */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-200">
                  {/* Patch panel */}
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Patch Panel & Puerto</label>
                    <div className="flex gap-1.5">
                      <select
                        value={editFormData.patch_panel_id || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, patch_panel_id: e.target.value || null, puerto_patch: null })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white text-xs truncate"
                      >
                        <option value="">(Ninguno)</option>
                        {rackPatchPanels.map(pp => (
                          <option key={pp.id} value={pp.id}>{pp.codigo}</option>
                        ))}
                      </select>
                      {editFormData.patch_panel_id ? (
                        <select
                          value={editFormData.puerto_patch ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditFormData({ ...editFormData, puerto_patch: val === '' ? (null as any) : parseInt(val, 10) });
                          }}
                          className="w-36 px-2 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono font-semibold truncate"
                        >
                          <option value="">(Puerto Patch)</option>
                          {Array.from({
                            length: (rackPatchPanels.find(pp => pp.id === editFormData.patch_panel_id)?.puertos_totales || 24)
                          }, (_, i) => i + 1).map(portNum => {
                            const occupiedBy = occupiedPpPorts[portNum];
                            const isOccupied = Boolean(occupiedBy);
                            let label = `P.${String(portNum).padStart(2, '0')}`;
                            if (isOccupied) label += ` · ✗ Ocupado (${occupiedBy})`;
                            else label += ` · ✓ Libre`;
                            return (
                              <option key={portNum} value={portNum} disabled={isOccupied} className={isOccupied ? 'text-slate-400 bg-slate-50' : 'text-slate-900 font-bold'}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <input
                          type="text"
                          disabled
                          placeholder="-"
                          className="w-16 px-2 py-1.5 border border-slate-200 rounded bg-slate-50 text-slate-400 text-xs text-center font-mono cursor-not-allowed"
                        />
                      )}
                    </div>
                  </div>

                  {/* Switch */}
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Switch & Puerto (RJ45)</label>
                    <div className="flex gap-1.5">
                      <select
                        value={editFormData.switch_id || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, switch_id: e.target.value || null, puerto_switch: null })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white text-xs truncate"
                      >
                        <option value="">(Ninguno)</option>
                        {rackSwitches.map(sw => (
                          <option key={sw.id} value={sw.id}>{sw.codigo}</option>
                        ))}
                      </select>
                      {editSwitchPorts.length > 0 ? (
                        <select
                          value={editFormData.puerto_switch ? (String(editFormData.puerto_switch).match(/\d+$/)?.[0] || String(editFormData.puerto_switch)) : ''}
                          onChange={(e) => setEditFormData({ ...editFormData, puerto_switch: e.target.value })}
                          className="w-36 px-2 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono font-semibold truncate"
                        >
                          <option value="">(Puerto RJ45)</option>
                          {editSwitchPorts.map(p => {
                            const isOccupied = Boolean(p.ocupado_por_codigo) && p.ocupado_por_codigo !== currentCam.codigo;
                            const portVal = String(p.numero_puerto);
                            const vNum = p.vlan_numero ?? p.vlan;
                            let label = `P.${p.numero_puerto} (Fa0/${p.numero_puerto})`;
                            if (vNum) label += ` [VLAN ${vNum}]`;
                            if (isOccupied) label += ` · ✗ Ocupado (${p.ocupado_por_codigo})`;
                            else label += ` · ✓ Libre`;
                            return (
                              <option key={p.puerto_switch_id} value={portVal} disabled={isOccupied} className={isOccupied ? 'text-slate-400 bg-slate-50' : 'text-slate-900 font-bold'}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={editFormData.puerto_switch || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, puerto_switch: e.target.value })}
                          className="w-20 px-2 py-1.5 border border-slate-300 rounded bg-white text-xs text-center font-mono"
                          placeholder="Fa0/8"
                        />
                      )}
                    </div>
                  </div>

                  {/* NVR */}
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">NVR Grabador & Canal</label>
                    <div className="flex gap-1.5">
                      <select
                        value={editFormData.nvr_id || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, nvr_id: e.target.value || null })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white text-xs truncate"
                      >
                        <option value="">(Ninguno)</option>
                        {rackNvrs.map(nvr => (
                          <option key={nvr.id} value={nvr.id}>{nvr.codigo}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        max="64"
                        value={editFormData.canal_nvr ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditFormData({ ...editFormData, canal_nvr: val === '' ? ('' as any) : parseInt(val, 10) });
                        }}
                        className="w-16 px-2 py-1.5 border border-slate-300 rounded bg-white text-xs text-center font-mono"
                        placeholder="1"
                        title="Canal NVR"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* BLOQUE 3: POSICIONAMIENTO EN PLANO ("MOVER EL PIN") */}
              <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-2">
                    <Compass className="w-3.5 h-3.5 text-blue-600" />
                    <span>3. Posicionamiento en Plano CAD (Mover el Pin)</span>
                  </h4>
                  <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                    Coordenadas: X={editPosX}%, Y={editPosY}%
                  </span>
                </div>

                {/* Building & Floor Plan Info Banner */}
                {(() => {
                  const editPiso = pisos.find(p => p.id === editFormData.piso_id);
                  const editEdificio = editPiso ? edificios.find(e => e.id === editPiso.edificio_id) : null;
                  const editCampus = editEdificio ? campusList.find(c => c.id === editEdificio.campus_id) : null;

                  return (
                    <div className="bg-white border border-slate-200 rounded p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Plano Arquitectónico:</span>
                        <strong className="text-blue-800">
                          {editEdificio?.nombre || 'Edificio'} — {editPiso?.nombre || 'Piso'}
                        </strong>
                        <span className="text-slate-400">({editCampus?.nombre || 'Campus'})</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {editPiso?.plano_url ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            <span>Plano Oficial Cargado</span>
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                            <span>Plano Esquemático Base</span>
                          </span>
                        )}

                        <label className="cursor-pointer px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[10px] font-bold inline-flex items-center gap-1 transition-colors shadow-2xs">
                          <Upload className="w-3 h-3 text-blue-600" />
                          <span>{uploadingPlan ? 'Subiendo...' : (editPiso?.plano_url ? 'Cambiar Imagen' : 'Subir Plano de Este Piso')}</span>
                          <input
                            type="file"
                            accept="image/*,.svg"
                            disabled={uploadingPlan}
                            className="hidden"
                            onChange={handleUploadPisoPlanEdit}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })()}

                <p className="text-[10px] text-slate-500 font-sans">
                  Haga clic sobre cualquier zona del plano para reubicar inmediatamente el pin y cono de cobertura de la cámara.
                </p>

                {/* SVG Interactive Plan */}
                <div className="bg-[#f8fafc] border-2 border-slate-300 rounded-lg p-2 relative overflow-hidden shadow-inner cursor-crosshair">
                  <svg 
                    viewBox="0 0 400 220" 
                    className="w-full h-52 select-none"
                    onClick={handleFloorPlanClick}
                  >
                    <defs>
                      <pattern id="gridEditModal" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                    <rect width="400" height="220" fill="url(#gridEditModal)" />

                    {/* Custom Floor Plan Image corresponding to the selected building and floor */}
                    {(() => {
                      const editPiso = pisos.find(p => p.id === editFormData.piso_id);
                      const editEdificio = editPiso ? edificios.find(e => e.id === editPiso.edificio_id) : null;
                      if (editPiso?.plano_url) {
                        return (
                          <image 
                            href={editPiso.plano_url} 
                            x="0" 
                            y="0" 
                            width="400" 
                            height="220" 
                            preserveAspectRatio="xMidYMid meet" 
                            opacity="0.92" 
                          />
                        );
                      }
                      return (
                        <>
                          <rect x="20" y="20" width="100" height="70" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                          <text x="70" y="55" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle">{editPiso?.nombre || 'Piso'} - SALA 1</text>

                          <rect x="130" y="20" width="100" height="70" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                          <text x="180" y="55" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle">LAB REDES</text>

                          <rect x="240" y="20" width="140" height="70" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" />
                          <text x="310" y="55" fontSize="8" fontFamily="monospace" fill="#475569" textAnchor="middle">SALA TÉCNICA IDF</text>

                          <rect x="20" y="100" width="360" height="40" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1" strokeDasharray="3,3" />
                          <text x="75" y="124" fontSize="8" fontFamily="monospace" fill="#3b82f6" fontWeight="bold">PASILLO {editPiso?.nombre?.toUpperCase() || 'PISO'} · {editEdificio?.nombre?.toUpperCase() || ''}</text>

                          <rect x="20" y="150" width="360" height="60" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                          <text x="180" y="185" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle">OFICINAS DOCENTES</text>
                        </>
                      );
                    })()}

                    {/* Live FOV Cone or Full Circle */}
                    {editIsCircle ? (
                      <circle 
                        cx={editX1} 
                        cy={editY1} 
                        r={editRadius} 
                        fill="rgba(37, 99, 235, 0.25)" 
                        stroke="#2563eb" 
                        strokeWidth="1.5" 
                        strokeDasharray="2,2" 
                      />
                    ) : (
                      <path 
                        d={editConePath} 
                        fill="rgba(37, 99, 235, 0.32)" 
                        stroke="#2563eb" 
                        strokeWidth="1.5" 
                        strokeDasharray="2,2" 
                      />
                    )}

                    {/* Active Placed Camera Node */}
                    <circle cx={editX1} cy={editY1} r="7" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
                    <circle cx={editX1} cy={editY1} r="3" fill="#ffffff" />
                    <text x={editX1} y={editY1 - 10} fontSize="8" fontFamily="monospace" fill="#1e40af" fontWeight="bold" textAnchor="middle">
                      {editFormData.codigo || currentCam.codigo}
                    </text>
                  </svg>
                </div>

                {/* Range sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  {editTipoCur !== 'ptz' && (editTipoCur !== 'fisheye' || (editFormData.apertura_fov || 360) < 360) ? (
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-600">Azimut Orientación</span>
                        <span className="font-bold text-blue-700">{editFormData.azimut ?? 90}°</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={editFormData.azimut ?? 90}
                        onChange={(e) => setEditFormData({ ...editFormData, azimut: parseInt(e.target.value) || 0 })}
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                    </div>
                  ) : (
                    <div className="p-2 bg-slate-100 rounded text-slate-500 text-center">
                      Azimut N/A (360° Omnidireccional)
                    </div>
                  )}

                  {editTipoCur !== 'ptz' ? (
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-600">Apertura FOV</span>
                        <span className="font-bold text-blue-700">{editFormData.apertura_fov || 103}°</span>
                      </div>
                      <input
                        type="range"
                        min="30"
                        max="360"
                        value={editFormData.apertura_fov || 103}
                        onChange={(e) => setEditFormData({ ...editFormData, apertura_fov: parseInt(e.target.value) || 103 })}
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                    </div>
                  ) : (
                    <div className="p-2 bg-slate-100 rounded text-slate-500 text-center">
                      Apertura 360° Panorámico
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600">Alcance Visual Útil</span>
                      <span className="font-bold text-blue-700">{editFormData.alcance_metros || 18.5} m</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      value={editFormData.alcance_metros || 18.5}
                      onChange={(e) => setEditFormData({ ...editFormData, alcance_metros: parseFloat(e.target.value) || 18.5 })}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* BLOQUE 4: COMPRA Y CONTRATISTAS */}
              <div className="bg-slate-50/70 p-4 rounded-lg border border-slate-200 space-y-3">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>4. Adquisición y Contratistas</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Fecha de Compra</label>
                    <input
                      type="date"
                      value={editFormData.fecha_compra || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, fecha_compra: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Proveedor de Compra</label>
                    <ProveedorSelect
                      value={editFormData.proveedor_compra_id}
                      rubroFilter="venta"
                      proveedores={proveedoresList}
                      onProveedorCreated={(newP) => setProveedoresList(prev => [...prev, newP].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
                      onChange={(pId) => setEditFormData({ ...editFormData, proveedor_compra_id: pId || undefined })}
                      placeholder="Seleccionar proveedor de compra..."
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Fecha de Instalación</label>
                    <input
                      type="date"
                      value={editFormData.fecha_instalacion || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, fecha_instalacion: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Proveedor de Instalación</label>
                    <ProveedorSelect
                      value={editFormData.proveedor_instalacion_id}
                      rubroFilter="instalacion"
                      proveedores={proveedoresList}
                      onProveedorCreated={(newP) => setProveedoresList(prev => [...prev, newP].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
                      onChange={(pId) => setEditFormData({ ...editFormData, proveedor_instalacion_id: pId || undefined })}
                      placeholder="Seleccionar contratista de instalación..."
                    />
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2 sticky bottom-0 bg-white py-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-1.5 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded shadow-xs disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Guardando...' : 'Guardar Todos los Cambios'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODALES DE CICLO DE VIDA Y ELIMINACIÓN DEFINITIVA */}
      <DecommissionModal
        isOpen={decommissionModalOpen}
        onClose={() => setDecommissionModalOpen(false)}
        itemType="camara"
        itemId={currentCam.id}
        itemCode={currentCam.codigo}
        onSuccess={async (nuevoEstado) => {
          await loadCameraRelations();
          if (onCameraUpdated) {
            onCameraUpdated({
              ...currentCam,
              estado_ciclo_vida: nuevoEstado,
            });
          }
        }}
      />

      <DeleteConfirmModal
        isOpen={deleteConfirmModalOpen}
        onClose={() => setDeleteConfirmModalOpen(false)}
        itemType="camara"
        itemId={currentCam.id}
        itemCode={currentCam.codigo}
        onSuccess={() => {
          if (onCameraDeleted) {
            onCameraDeleted(currentCam.id);
          }
          onBack();
        }}
      />
    </div>
  );
};
