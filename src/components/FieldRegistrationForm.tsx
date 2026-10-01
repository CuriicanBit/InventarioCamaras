import React, { useState, useEffect } from 'react';
import { 
  Plus,
  PlusCircle, 
  ArrowLeft, 
  Layers, 
  Server, 
  Cpu, 
  Camera, 
  MapPin, 
  Compass, 
  Check, 
  Save, 
  Calendar, 
  User, 
  FileText,
  AlertCircle,
  Upload,
  CheckCircle,
  Image as ImageIcon,
  Globe,
  Link2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Sede, Campus, Edificio, Piso, Rack, Equipo, Proveedor, Marca, Modelo, Camara } from '../types/database';
import { MarcaSelect, ModeloSelect, ProveedorSelect } from './catalogs/CatalogSelectors';
import { NodeFormModal } from './TreeNodeModals';
import { NodeLevel } from '../utils/treeHierarchy';

interface FieldRegistrationFormProps {
  onSuccess: (newCamId?: string) => void;
  onCancel: () => void;
}

export const FieldRegistrationForm: React.FC<FieldRegistrationFormProps> = ({
  onSuccess,
  onCancel,
}) => {
  // Cascading options
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [campusList, setCampusList] = useState<Campus[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [allEquipos, setAllEquipos] = useState<Equipo[]>([]);
  const [patchPanels, setPatchPanels] = useState<Equipo[]>([]);
  const [switches, setSwitches] = useState<Equipo[]>([]);
  const [nvrs, setNvrs] = useState<Equipo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [existingCamaras, setExistingCamaras] = useState<Camara[]>([]);
  const [uploadingPlan, setUploadingPlan] = useState(false);

  // Quick CRUD modal for physical tree nodes when creating from scratch
  const [treeModalState, setTreeModalState] = useState<{
    isOpen: boolean;
    level: NodeLevel;
    parentId?: string;
  }>({
    isOpen: false,
    level: 'sede',
  });

  const openTreeModal = (level: NodeLevel, parentId?: string) => {
    setTreeModalState({
      isOpen: true,
      level,
      parentId,
    });
  };

  // Selected cascade values
  const [selectedSedeId, setSelectedSedeId] = useState<string>('');
  const [selectedCampusId, setSelectedCampusId] = useState<string>('');
  const [selectedEdificioId, setSelectedEdificioId] = useState<string>('');
  const [selectedPisoId, setSelectedPisoId] = useState<string>('');
  const [selectedRackId, setSelectedRackId] = useState<string>('');
  const [selectedPatchPanelId, setSelectedPatchPanelId] = useState<string>('');
  const [selectedSwitchId, setSelectedSwitchId] = useState<string>('');
  const [selectedNvrId, setSelectedNvrId] = useState<string>('');

  // Port and routing values
  const [puertoPatch, setPuertoPatch] = useState<number>(8);
  const [puertoSwitch, setPuertoSwitch] = useState<string>('Fa0/8');
  const [canalNvr, setCanalNvr] = useState<number>(8);

  // Form registration mode: camera vs rack equipment
  const [tipoRegistro, setTipoRegistro] = useState<'camara' | 'equipo'>('camara');

  // Camera Hardware fields
  const [tipoCamara, setTipoCamara] = useState<'domo' | 'bullet' | 'ptz' | 'fisheye' | 'multisensor'>('domo');
  const [codigo, setCodigo] = useState<string>('CAM-ENG-P2-25');
  const [marcaId, setMarcaId] = useState<string | null>(null);
  const [modeloId, setModeloId] = useState<string | null>(null);
  const [marca, setMarca] = useState<string>('');
  const [modelo, setModelo] = useState<string>('');
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [numeroSerie, setNumeroSerie] = useState<string>('HKV20248831B');
  const [direccionMac, setDireccionMac] = useState<string>('54:8C:AF:33:91:2E');
  const [direccionIp, setDireccionIp] = useState<string>('10.14.20.125');
  const [ubicacionEspecifica, setUbicacionEspecifica] = useState<string>('Pasillo central Piso 2, cielo falso frente a Laboratorio de Redes 202');
  const [ambiente, setAmbiente] = useState<'interior' | 'exterior'>('interior');
  const [antivandalico, setAntivandalico] = useState<boolean>(true);
  const [resolucionMp, setResolucionMp] = useState<string>('4');
  const [alturaMontajeM, setAlturaMontajeM] = useState<string>('2.8');

  // Fields according to type
  const [lente, setLente] = useState<string>('2.8mm');
  const [zoomOptico, setZoomOptico] = useState<string>('');
  const [numSensores, setNumSensores] = useState<string>('4');

  // Acquisition fields
  const [fechaCompra, setFechaCompra] = useState<string>('2024-01-10');
  const [proveedorCompraId, setProveedorCompraId] = useState<string>('');
  const [fechaInstalacion, setFechaInstalacion] = useState<string>('2024-03-15');
  const [proveedorInstalacionId, setProveedorInstalacionId] = useState<string>('');

  // FOV and positioning fields
  const [posicionX, setPosicionX] = useState<number>(48.5);
  const [posicionY, setPosicionY] = useState<number>(32.1);
  const [azimut, setAzimut] = useState<number | null>(105);
  const [aperturaFov, setAperturaFov] = useState<number>(103);
  const [alcanceMetros, setAlcanceMetros] = useState<number>(18);

  const handleTipoCamaraChange = (newTipo: 'domo' | 'bullet' | 'ptz' | 'fisheye' | 'multisensor') => {
    setTipoCamara(newTipo);
    // Limpia los valores de los campos que se ocultan y ajusta valores iniciales
    if (newTipo === 'domo' || newTipo === 'bullet') {
      setZoomOptico('');
      setNumSensores('');
      if (!lente) setLente('2.8mm');
      if (aperturaFov === 360) setAperturaFov(103);
      if (azimut === null) setAzimut(105);
    } else if (newTipo === 'ptz') {
      setLente('');
      setNumSensores('');
      setAperturaFov(360);
      setAzimut(null);
    } else if (newTipo === 'fisheye') {
      setLente('');
      setZoomOptico('');
      setNumSensores('');
      setAperturaFov(360);
      setAzimut(null);
    } else if (newTipo === 'multisensor') {
      setLente('');
      setZoomOptico('');
      if (!numSensores) setNumSensores('4');
      if (aperturaFov === 360 || aperturaFov < 180) setAperturaFov(180);
      if (azimut === null) setAzimut(105);
    }
  };

  // Visit metadata
  const [fechaInspeccion, setFechaInspeccion] = useState<string>('2024-03-15');
  const [tecnicoResponsable, setTecnicoResponsable] = useState<string>('M. Morales - Cuadrilla Infraestructura');
  const [observaciones, setObservaciones] = useState<string>('Lente fijado en 2.8mm cubriendo pasillo este. Conector RJ45 crimpado con bota de protección azul.');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load all initial lookup lists
  const fetchInitialData = async (
    preferredSedeId?: string,
    preferredCampusId?: string,
    preferredEdificioId?: string,
    preferredPisoId?: string,
    preferredRackId?: string
  ) => {
    try {
      const [
        { data: sData },
        { data: cData },
        { data: eData },
        { data: pData },
        { data: rData },
        { data: eqData },
        { data: provData },
        { data: marcasData },
        { data: modelosData },
        { data: camarasData }
      ] = await Promise.all([
        supabase.from('sedes').select('*').order('nombre'),
        supabase.from('campus').select('*').order('nombre'),
        supabase.from('edificios').select('*').order('nombre'),
        supabase.from('pisos').select('*').order('nombre'),
        supabase.from('racks').select('*').order('codigo'),
        supabase.from('equipos').select('*').order('codigo'),
        supabase.from('proveedores').select('*').order('nombre'),
        supabase.from('marcas').select('*').order('nombre'),
        supabase.from('modelos').select('*').order('nombre'),
        supabase.from('camaras').select('*').order('codigo'),
      ]);

      const sedesLoaded = sData || [];
      const campusLoaded = cData || [];
      const edificiosLoaded = eData || [];
      const pisosLoaded = pData || [];
      const racksLoaded = rData || [];
      const equiposLoaded = eqData || [];
      const provsLoaded = provData || [];
      const marcasLoaded = marcasData || [];
      const modelosLoaded = modelosData || [];
      const camarasLoaded = camarasData || [];

      setSedes(sedesLoaded);
      setCampusList(campusLoaded);
      setEdificios(edificiosLoaded);
      setPisos(pisosLoaded);
      setRacks(racksLoaded);
      setAllEquipos(equiposLoaded);
      setProveedores(provsLoaded);
      setMarcas(marcasLoaded);
      setModelos(modelosLoaded);
      setExistingCamaras(camarasLoaded);

      // Pre-select location defaults without blowing away valid user selections
      let activeSedeId = preferredSedeId || '';
      if (!activeSedeId && selectedSedeId && sedesLoaded.some(s => s.id === selectedSedeId)) {
        activeSedeId = selectedSedeId;
      }
      if (!activeSedeId && sedesLoaded.length > 0) {
        activeSedeId = sedesLoaded[0].id;
      }
      setSelectedSedeId(activeSedeId);

      const subCampus = campusLoaded.filter(c => c.sede_id === activeSedeId);
      let activeCampusId = preferredCampusId || '';
      if (!activeCampusId && selectedCampusId && subCampus.some(c => c.id === selectedCampusId)) {
        activeCampusId = selectedCampusId;
      }
      if (!activeCampusId && subCampus.length > 0) {
        activeCampusId = subCampus[0].id;
      }
      setSelectedCampusId(activeCampusId);

      const subEdificios = edificiosLoaded.filter(e => e.campus_id === activeCampusId);
      let activeEdificioId = preferredEdificioId || '';
      if (!activeEdificioId && selectedEdificioId && subEdificios.some(e => e.id === selectedEdificioId)) {
        activeEdificioId = selectedEdificioId;
      }
      if (!activeEdificioId && subEdificios.length > 0) {
        activeEdificioId = subEdificios[0].id;
      }
      setSelectedEdificioId(activeEdificioId);

      const subPisos = pisosLoaded.filter(p => p.edificio_id === activeEdificioId);
      let activePisoId = preferredPisoId || '';
      if (!activePisoId && selectedPisoId && subPisos.some(p => p.id === selectedPisoId)) {
        activePisoId = selectedPisoId;
      }
      if (!activePisoId && subPisos.length > 0) {
        activePisoId = subPisos[0].id;
      }
      setSelectedPisoId(activePisoId);

      let activeRackId = preferredRackId || '';
      if (!activeRackId && selectedRackId && racksLoaded.some(r => r.id === selectedRackId)) {
        activeRackId = selectedRackId;
      }
      if (!activeRackId && racksLoaded.length > 0) {
        activeRackId = racksLoaded[0].id;
      }
      setSelectedRackId(activeRackId);

      if (activeRackId) {
        const rEq = equiposLoaded.filter(e => e.rack_id === activeRackId);
        const ppList = rEq.filter(e => e.tipo === 'patch_panel');
        const swList = rEq.filter(e => e.tipo === 'switch');
        const nvrList = rEq.filter(e => e.tipo === 'nvr');

        setPatchPanels(ppList);
        setSwitches(swList);
        setNvrs(nvrList);

        if (ppList.length > 0) setSelectedPatchPanelId(ppList[0].id);
        if (swList.length > 0) setSelectedSwitchId(swList[0].id);
        if (nvrList.length > 0) setSelectedNvrId(nvrList[0].id);
      } else {
        setPatchPanels([]);
        setSwitches([]);
        setNvrs([]);
      }
    } catch (err) {
      console.error('Error fetching initial lookup options:', err);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Filtered physical location cascading lists (where camera is mounted)
  const availableCampus = campusList.filter(c => c.sede_id === selectedSedeId);
  const availableEdificios = edificios.filter(e => e.campus_id === selectedCampusId);
  const availablePisos = pisos.filter(p => p.edificio_id === selectedEdificioId);

  // Available Racks for Headend Connection:
  // Must be independent of the physical camera floor! The technician can pick ANY rack in the campus.
  const campusEdificioIds = new Set(
    edificios.filter(e => !selectedCampusId || e.campus_id === selectedCampusId).map(e => e.id)
  );
  const campusPisoIds = new Set(
    pisos.filter(p => campusEdificioIds.has(p.edificio_id)).map(p => p.id)
  );
  const availableRacks = selectedCampusId
    ? racks.filter(r => !r.piso_id || campusPisoIds.has(r.piso_id))
    : racks;

  // Update cascade physical location when parents change
  const handleSedeChange = (sedeId: string) => {
    setSelectedSedeId(sedeId);
    const subCampus = campusList.filter(c => c.sede_id === sedeId);
    if (subCampus.length > 0) {
      handleCampusChange(subCampus[0].id);
    } else {
      setSelectedCampusId('');
      setSelectedEdificioId('');
      setSelectedPisoId('');
    }
  };

  const handleCampusChange = (campusId: string) => {
    setSelectedCampusId(campusId);
    const subEdif = edificios.filter(e => e.campus_id === campusId);
    if (subEdif.length > 0) {
      handleEdificioChange(subEdif[0].id);
    } else {
      setSelectedEdificioId('');
      setSelectedPisoId('');
    }
  };

  const handleEdificioChange = (edifId: string) => {
    setSelectedEdificioId(edifId);
    const subPisos = pisos.filter(p => p.edificio_id === edifId);
    if (subPisos.length > 0) {
      handlePisoChange(subPisos[0].id);
    } else {
      setSelectedPisoId('');
    }
  };

  // Changing the camera's physical floor does NOT reset or filter the headend rack!
  const handlePisoChange = (pisoId: string) => {
    setSelectedPisoId(pisoId);
  };

  // Changing headend rack updates available patch panels, switches and NVRs for that rack
  const handleRackChange = (rackId: string) => {
    setSelectedRackId(rackId);
    if (!rackId) {
      setPatchPanels([]);
      setSwitches([]);
      setNvrs([]);
      setSelectedPatchPanelId('');
      setSelectedSwitchId('');
      setSelectedNvrId('');
      return;
    }

    const rackEq = allEquipos.filter(e => e.rack_id === rackId);
    const ppList = rackEq.filter(e => e.tipo === 'patch_panel');
    const swList = rackEq.filter(e => e.tipo === 'switch');
    const nvrList = rackEq.filter(e => e.tipo === 'nvr');

    setPatchPanels(ppList);
    setSwitches(swList);
    setNvrs(nvrList);

    setSelectedPatchPanelId(ppList[0]?.id || '');
    setSelectedSwitchId(swList[0]?.id || '');
    setSelectedNvrId(nvrList[0]?.id || '');
  };

  // Click on floor plan to position camera
  const handleFloorPlanClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;
    setPosicionX(Math.round(clickX * 10) / 10);
    setPosicionY(Math.round(clickY * 10) / 10);
  };

  // Upload or replace floor plan image for selected piso
  const handleUploadPisoPlan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPisoId) return;
    try {
      setUploadingPlan(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const { error } = await supabase
          .from('pisos')
          .update({ plano_url: base64 })
          .eq('id', selectedPisoId);

        if (error) throw error;
        setPisos(prev => prev.map(p => p.id === selectedPisoId ? { ...p, plano_url: base64 } : p));
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Error uploading floor plan:', err);
      alert('Error al subir plano: ' + (err.message || String(err)));
    } finally {
      setUploadingPlan(false);
    }
  };

  // Attach floor plan link (Cloudinary, AWS S3, web URL)
  const handleSetPisoPlanUrl = async () => {
    if (!selectedPisoId) return;
    const currentPiso = pisos.find(p => p.id === selectedPisoId);
    const existing = currentPiso?.plano_url && !currentPiso.plano_url.startsWith('data:') ? currentPiso.plano_url : '';
    const url = prompt(
      'Ingresa el enlace directo del plano arquitectónico (Cloudinary, AWS S3, Imgur o URL web):\nEj: https://res.cloudinary.com/.../plano.png',
      existing
    );
    if (url === null) return;
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      if (confirm('¿Deseas desvincular el plano arquitectónico de este piso?')) {
        await supabase.from('pisos').update({ plano_url: null }).eq('id', selectedPisoId);
        setPisos(prev => prev.map(p => p.id === selectedPisoId ? { ...p, plano_url: null } : p));
      }
      return;
    }
    try {
      setUploadingPlan(true);
      const { error } = await supabase.from('pisos').update({ plano_url: cleanUrl }).eq('id', selectedPisoId);
      if (error) throw error;
      setPisos(prev => prev.map(p => p.id === selectedPisoId ? { ...p, plano_url: cleanUrl } : p));
    } catch (err: any) {
      console.error('Error attaching floor plan link:', err);
      alert('Error al guardar enlace del plano: ' + (err.message || String(err)));
    } finally {
      setUploadingPlan(false);
    }
  };

  // Submit form to Supabase
  const handleSave = async (andRegisterNext: boolean = false) => {
    try {
      setSaving(true);
      setErrorMsg(null);

      if (!selectedPisoId) {
        throw new Error('Debe seleccionar un piso para ubicar el dispositivo.');
      }
      if (!codigo.trim()) {
        throw new Error('El código de identificación es obligatorio.');
      }

      const isPtz = tipoCamara === 'ptz';
      const isFisheye = tipoCamara === 'fisheye';
      const isMultisensor = tipoCamara === 'multisensor';
      const isDomoOrBullet = tipoCamara === 'domo' || tipoCamara === 'bullet';

      const finalFov = isPtz ? 360 : (aperturaFov ?? (isFisheye ? 360 : 103));
      const finalAzimut = isPtz ? null : (isFisheye && finalFov >= 360 ? null : azimut);
      const finalLente = isDomoOrBullet ? (lente.trim() || null) : null;
      const finalZoom = isPtz ? (zoomOptico.trim() || null) : null;
      const finalNumSensores = isMultisensor ? (numSensores ? Number(numSensores) : 4) : null;

      // Insert into camaras table
      const payload: any = {
        piso_id: selectedPisoId,
        rack_id: selectedRackId || null,
        codigo: codigo.trim(),
        tipo_camara: tipoCamara,
        tipo_dispositivo: tipoCamara,
        marca_id: marcaId || null,
        modelo_id: modeloId || null,
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        numero_serie: numeroSerie.trim() || null,
        direccion_mac: direccionMac.trim() || null,
        direccion_ip: direccionIp.trim() || null,
        ubicacion_especifica: ubicacionEspecifica.trim() || null,
        ambiente: ambiente,
        antivandalico: antivandalico,
        resolucion_mp: resolucionMp ? parseFloat(resolucionMp) : null,
        altura_montaje_m: alturaMontajeM ? parseFloat(alturaMontajeM) : null,
        lente: finalLente,
        zoom_optico: finalZoom,
        num_sensores: finalNumSensores,
        patch_panel_id: selectedPatchPanelId || null,
        puerto_patch: puertoPatch ? Number(puertoPatch) : null,
        switch_id: selectedSwitchId || null,
        puerto_switch: puertoSwitch || null,
        nvr_id: selectedNvrId || null,
        canal_nvr: canalNvr ? Number(canalNvr) : null,
        posicion_x: posicionX,
        posicion_y: posicionY,
        azimut: finalAzimut,
        apertura_fov: finalFov,
        alcance_metros: alcanceMetros ? Number(alcanceMetros) : null,
        fecha_compra: fechaCompra || null,
        proveedor_compra_id: proveedorCompraId || null,
        fecha_instalacion: fechaInstalacion || null,
        proveedor_instalacion_id: proveedorInstalacionId || null,
      };

      const { data: newCam, error: camErr } = await supabase
        .from('camaras')
        .insert([payload])
        .select()
        .single();

      if (camErr) throw camErr;

      // Automatically register initial installation record in historial_mantenimiento
      if (newCam && tecnicoResponsable.trim()) {
        await supabase.from('historial_mantenimiento').insert([
          {
            entidad_tipo: 'camara',
            entidad_id: newCam.id,
            tipo_intervencion: 'instalacion',
            fecha: fechaInspeccion ? `${fechaInspeccion}T10:00:00Z` : new Date().toISOString(),
            tecnico_responsable: tecnicoResponsable.trim(),
            descripcion: observaciones || `Alta técnica y conectorización inicial de cámara ${newCam.codigo}.`,
            repuestos_insumos: 'Conectores RJ45 Cat6, Fijaciones mecánicas',
          }
        ]);
      }

      if (andRegisterNext) {
        // Increment camera code and reset for next entry
        const match = codigo.match(/(\d+)$/);
        const nextNum = match ? parseInt(match[1]) + 1 : 26;
        setCodigo(`CAM-ENG-P2-${nextNum}`);
        setPuertoPatch(prev => Math.min(prev + 1, 24));
        setCanalNvr(prev => Math.min(prev + 1, 32));
        setDireccionIp(prev => {
          const parts = prev.split('.');
          if (parts.length === 4) {
            parts[3] = String(parseInt(parts[3]) + 1);
            return parts.join('.');
          }
          return prev;
        });
        alert('Cámara guardada exitosamente. Formulario listo para la siguiente cámara.');
      } else {
        onSuccess(newCam?.id);
      }
    } catch (err: any) {
      console.error('Error saving field registration:', err);
      setErrorMsg(err.message || 'Error al guardar los datos');
    } finally {
      setSaving(false);
    }
  };

  // FOV cone geometry calculations for SVG plan
  const fovRadius = 80;
  const x1 = (posicionX * 400) / 100;
  const y1 = (posicionY * 220) / 100;

  const isPtz = tipoCamara === 'ptz';
  const effectiveFov = isPtz ? 360 : aperturaFov;
  const isCircle = effectiveFov >= 360;
  const safeAzimut = azimut ?? 90;

  const radStart = ((safeAzimut - effectiveFov / 2 - 90) * Math.PI) / 180;
  const radEnd = ((safeAzimut + effectiveFov / 2 - 90) * Math.PI) / 180;
  const x2 = x1 + Math.cos(radStart) * fovRadius;
  const y2 = y1 + Math.sin(radStart) * fovRadius;
  const x3 = x1 + Math.cos(radEnd) * fovRadius;
  const y3 = y1 + Math.sin(radEnd) * fovRadius;
  const largeArcFlag = effectiveFov > 180 ? 1 : 0;
  const conePath = `M ${x1} ${y1} L ${x2} ${y2} A ${fovRadius} ${fovRadius} 0 ${largeArcFlag} 1 ${x3} ${y3} Z`;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner strip */}
      <div className="flex items-center justify-between text-[11px] font-mono border-b border-slate-200 pb-2 text-slate-500">
        <div className="flex items-center gap-2">
          <span className="text-blue-600 font-semibold uppercase">OPERACIONES DE TERRENO / FICHA DE CAPTURA F-704</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-emerald-700 font-medium flex items-center gap-1">
            <Check className="w-3 h-3" /> Caché Local Activa
          </span>
          <span>•</span>
          <span>Sincronización Automática</span>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono text-blue-700 font-bold uppercase tracking-wider mb-1">
            AUDITORÍA & ALTA TÉCNICA
          </div>
          <h1 className="text-xl font-bold font-mono text-slate-900 tracking-tight">
            Alta de Equipo / Cámara en Terreno
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl">
            Registro manual post-visita de inspección física. Ingrese los datos verificados en sitio para actualizar el gemelo digital de conectividad y matriz de puertos.
          </p>
        </div>
        <button
          onClick={onCancel}
          className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 text-slate-600"
          title="Volver"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Step 1: Topología Física & Mapeo de Red */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[10px] font-bold">1</span>
            <span>Topología Física & Mapeo de Red</span>
          </h2>
          <span className="text-[10px] font-mono text-slate-400 uppercase">
            Cascada Jerárquica
          </span>
        </div>

        {/* 4 Cascading Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          {/* 1. Sede */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] text-slate-600">Sede *</label>
              <button
                type="button"
                onClick={() => openTreeModal('sede')}
                className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 font-sans"
              >
                + Nueva Sede
              </button>
            </div>
            <select
              value={selectedSedeId}
              onChange={(e) => handleSedeChange(e.target.value)}
              disabled={sedes.length === 0}
              className={`w-full px-3 py-1.5 border border-slate-300 rounded text-xs ${
                sedes.length === 0 ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'bg-white focus:ring-1 focus:ring-blue-600'
              }`}
            >
              {sedes.length === 0 ? (
                <option value="">(Aún no hay sedes registradas)</option>
              ) : (
                sedes.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))
              )}
            </select>
            {sedes.length === 0 && (
              <div className="mt-1.5 p-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 flex items-center justify-between">
                <span>Primero crea una Sede</span>
                <button
                  type="button"
                  onClick={() => openTreeModal('sede')}
                  className="font-bold text-blue-600 hover:underline ml-1"
                >
                  + Crear Sede
                </button>
              </div>
            )}
          </div>

          {/* 2. Campus */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] text-slate-600">Campus *</label>
              {selectedSedeId && (
                <button
                  type="button"
                  onClick={() => openTreeModal('campus', selectedSedeId)}
                  className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 font-sans"
                >
                  + Nuevo Campus
                </button>
              )}
            </div>
            <select
              value={selectedCampusId}
              onChange={(e) => handleCampusChange(e.target.value)}
              disabled={sedes.length === 0 || !selectedSedeId || availableCampus.length === 0}
              className={`w-full px-3 py-1.5 border border-slate-300 rounded text-xs ${
                sedes.length === 0 || !selectedSedeId || availableCampus.length === 0
                  ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                  : 'bg-white focus:ring-1 focus:ring-blue-600'
              }`}
            >
              {sedes.length === 0 ? (
                <option value="">(Primero crea una Sede)</option>
              ) : availableCampus.length === 0 ? (
                <option value="">(Primero crea un Campus)</option>
              ) : (
                availableCampus.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))
              )}
            </select>
            {sedes.length === 0 ? (
              <p className="text-[10px] text-slate-400 mt-1">Primero crea una Sede</p>
            ) : availableCampus.length === 0 && selectedSedeId ? (
              <div className="mt-1.5 p-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 flex items-center justify-between">
                <span>Primero crea un Campus</span>
                <button
                  type="button"
                  onClick={() => openTreeModal('campus', selectedSedeId)}
                  className="font-bold text-blue-600 hover:underline ml-1"
                >
                  + Crear Campus
                </button>
              </div>
            ) : null}
          </div>

          {/* 3. Edificio */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] text-slate-600">Edificio *</label>
              {selectedCampusId && (
                <button
                  type="button"
                  onClick={() => openTreeModal('edificio', selectedCampusId)}
                  className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 font-sans"
                >
                  + Nuevo Edificio
                </button>
              )}
            </div>
            <select
              value={selectedEdificioId}
              onChange={(e) => handleEdificioChange(e.target.value)}
              disabled={availableCampus.length === 0 || !selectedCampusId || availableEdificios.length === 0}
              className={`w-full px-3 py-1.5 border border-slate-300 rounded text-xs ${
                availableCampus.length === 0 || !selectedCampusId || availableEdificios.length === 0
                  ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                  : 'bg-white focus:ring-1 focus:ring-blue-600'
              }`}
            >
              {availableCampus.length === 0 ? (
                <option value="">(Primero crea un Campus)</option>
              ) : availableEdificios.length === 0 ? (
                <option value="">(Primero crea un Edificio)</option>
              ) : (
                availableEdificios.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))
              )}
            </select>
            {availableCampus.length === 0 ? (
              <p className="text-[10px] text-slate-400 mt-1">Primero crea un Campus</p>
            ) : availableEdificios.length === 0 && selectedCampusId ? (
              <div className="mt-1.5 p-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 flex items-center justify-between">
                <span>Primero crea un Edificio</span>
                <button
                  type="button"
                  onClick={() => openTreeModal('edificio', selectedCampusId)}
                  className="font-bold text-blue-600 hover:underline ml-1"
                >
                  + Crear Edificio
                </button>
              </div>
            ) : null}
          </div>

          {/* 4. Piso / Nivel */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] text-slate-600">Piso / Nivel *</label>
              {selectedEdificioId && (
                <button
                  type="button"
                  onClick={() => openTreeModal('piso', selectedEdificioId)}
                  className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 font-sans"
                >
                  + Nuevo Piso
                </button>
              )}
            </div>
            <select
              value={selectedPisoId}
              onChange={(e) => handlePisoChange(e.target.value)}
              disabled={availableEdificios.length === 0 || !selectedEdificioId || availablePisos.length === 0}
              className={`w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-bold text-blue-700 ${
                availableEdificios.length === 0 || !selectedEdificioId || availablePisos.length === 0
                  ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                  : 'bg-white focus:ring-1 focus:ring-blue-600'
              }`}
            >
              {availableEdificios.length === 0 ? (
                <option value="">(Primero crea un Edificio)</option>
              ) : availablePisos.length === 0 ? (
                <option value="">(Primero crea un Piso)</option>
              ) : (
                availablePisos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))
              )}
            </select>
            {availableEdificios.length === 0 ? (
              <p className="text-[10px] text-slate-400 mt-1">Primero crea un Edificio</p>
            ) : availablePisos.length === 0 && selectedEdificioId ? (
              <div className="mt-1.5 p-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800 flex items-center justify-between">
                <span>Primero crea un Piso</span>
                <button
                  type="button"
                  onClick={() => openTreeModal('piso', selectedEdificioId)}
                  className="font-bold text-blue-600 hover:underline ml-1"
                >
                  + Crear Piso
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Rack & Cross-Connect Routing Dropdowns */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-3 text-xs font-mono">
          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
            CONEXIÓN A RACK Y CANALIZACIÓN
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] text-slate-700 font-semibold">
                Rack de Cabecera (IDF/MDF)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  Independiente del piso físico
                </span>
                <button
                  type="button"
                  onClick={() => openTreeModal('rack', selectedPisoId || pisos[0]?.id)}
                  className="text-[10px] text-blue-700 hover:text-blue-900 font-bold hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> + Agregar nuevo Rack...
                </button>
              </div>
            </div>
            <select
              value={selectedRackId}
              onChange={(e) => handleRackChange(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-blue-600 text-xs font-mono"
            >
              <option value="">(Sin rack de cabecera / Por definir)</option>
              {availableRacks.map(r => {
                const rPiso = pisos.find(p => p.id === r.piso_id);
                const rEdif = edificios.find(e => e.id === rPiso?.edificio_id);
                return (
                  <option key={r.id} value={r.id}>
                    {r.codigo} — {rEdif ? rEdif.nombre : 'Sin edificio'} / {rPiso ? rPiso.nombre : 'Sin piso'} {r.ubicacion_especifica ? `[${r.ubicacion_especifica}]` : ''}
                  </option>
                );
              })}
            </select>

            {availableRacks.length === 0 ? (
              <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 flex items-center justify-between">
                <div>
                  <span className="font-semibold block">Aún no hay ningún Rack registrado</span>
                  <span className="text-[11px] text-blue-700">Para conectorizar puertos o asociar switches, registra el primer gabinete.</span>
                </div>
                <button
                  type="button"
                  onClick={() => openTreeModal('rack', selectedPisoId || pisos[0]?.id)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold shrink-0 transition-colors shadow-2xs"
                >
                  + Agregar nuevo Rack
                </button>
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 mt-1">
                Seleccione cualquier rack del campus al que arribe el enlace de red, sin importar si está ubicado en otro piso o edificio.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Patch Panel Físico</label>
              <select
                value={selectedPatchPanelId}
                onChange={(e) => setSelectedPatchPanelId(e.target.value)}
                disabled={patchPanels.length === 0}
                className={`w-full px-3 py-1.5 border border-slate-300 rounded text-xs ${
                  patchPanels.length === 0 ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'bg-white focus:ring-1 focus:ring-blue-600'
                }`}
              >
                {patchPanels.length === 0 ? (
                  <option value="">(Sin Patch Panels en este Rack)</option>
                ) : (
                  <>
                    <option value="">(Seleccionar Patch Panel)</option>
                    {patchPanels.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} ({p.modelo || '24P Cat6'})
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Puerto Patch Panel</label>
              <select
                value={puertoPatch}
                onChange={(e) => setPuertoPatch(parseInt(e.target.value) || 1)}
                disabled={patchPanels.length === 0}
                className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-blue-600 text-xs disabled:bg-slate-50 disabled:text-slate-400"
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>Puerto {String(n).padStart(2, '0')} (Asignado en Terreno)</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Switch Asociado y Puerto</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={selectedSwitchId}
                  onChange={(e) => setSelectedSwitchId(e.target.value)}
                  disabled={switches.length === 0}
                  className={`w-full px-3 py-1.5 border border-slate-300 rounded text-xs truncate ${
                    switches.length === 0 ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'bg-white focus:ring-1 focus:ring-blue-600'
                  }`}
                >
                  {switches.length === 0 ? (
                    <option value="">(Sin Switches)</option>
                  ) : (
                    <>
                      <option value="">(Seleccionar Switch)</option>
                      {switches.map(s => (
                        <option key={s.id} value={s.id}>{s.codigo} ({s.marca || 'Switch'})</option>
                      ))}
                    </>
                  )}
                </select>
                <input
                  type="text"
                  value={puertoSwitch}
                  onChange={(e) => setPuertoSwitch(e.target.value)}
                  placeholder="Fa0/8"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-600 mb-1">NVR Asignado y Canal</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={selectedNvrId}
                  onChange={(e) => setSelectedNvrId(e.target.value)}
                  disabled={nvrs.length === 0}
                  className={`w-full px-3 py-1.5 border border-slate-300 rounded text-xs truncate ${
                    nvrs.length === 0 ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'bg-white focus:ring-1 focus:ring-blue-600'
                  }`}
                >
                  {nvrs.length === 0 ? (
                    <option value="">(Sin Grabadores NVR)</option>
                  ) : (
                    <>
                      <option value="">(Seleccionar NVR)</option>
                      {nvrs.map(n => (
                        <option key={n.id} value={n.id}>{n.codigo} (32 Ch)</option>
                      ))}
                    </>
                  )}
                </select>
                <input
                  type="number"
                  min="1"
                  max="64"
                  value={canalNvr}
                  onChange={(e) => setCanalNvr(parseInt(e.target.value) || 1)}
                  placeholder="Canal 08"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step 2: Identificación del Hardware */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[10px] font-bold">2</span>
            <span>Identificación del Hardware</span>
          </h2>
          <span className="text-[10px] font-mono text-slate-400 uppercase">
            Cat6A / PoE 802.3at
          </span>
        </div>

        <div className="space-y-3 text-xs font-mono">
          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Tipo de Cámara *</label>
            <select
              value={tipoCamara}
              onChange={(e) => handleTipoCamaraChange(e.target.value as any)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-blue-600 text-xs font-semibold text-blue-900"
            >
              <option value="domo">Cámara Domo Fijo (Interior / Antivandálica)</option>
              <option value="bullet">Cámara Bullet (Perimetral / Exterior)</option>
              <option value="ptz">Cámara PTZ Motorizada (Giro 360° & Zoom)</option>
              <option value="fisheye">Cámara Fisheye (Ojo de Pez 360° / Panorámica)</option>
              <option value="multisensor">Cámara Multisensor (Múltiples cabezales independientes)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Código de Identificación / Rótulo *</label>
              <input
                type="text"
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="CAM-ENG-P2-08"
                className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 font-bold text-blue-700"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Marca</label>
              <MarcaSelect
                value={marcaId}
                marcas={marcas}
                onMarcaCreated={(newM) => setMarcas(prev => [...prev, newM].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
                onChange={(mId, mName) => {
                  setMarcaId(mId || null);
                  setMarca(mName || '');
                  setModeloId(null);
                  setModelo('');
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Modelo</label>
              <ModeloSelect
                value={modeloId}
                marcaId={marcaId}
                tipoEquipo="camara"
                modelos={modelos}
                marcas={marcas}
                onModeloCreated={(newMod) => setModelos(prev => [...prev, newMod].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
                onChange={(modId, modName, defaults) => {
                  setModeloId(modId || null);
                  setModelo(modName || '');
                  if (defaults) {
                    if (defaults.tipo_camara_default) {
                      handleTipoCamaraChange(defaults.tipo_camara_default as any);
                    }
                    if (defaults.lente_default !== undefined && defaults.lente_default !== null) {
                      setLente(defaults.lente_default);
                    }
                    if (defaults.resolucion_mp_default !== undefined && defaults.resolucion_mp_default !== null) {
                      setResolucionMp(String(defaults.resolucion_mp_default));
                    }
                    if (defaults.apertura_fov_default !== undefined && defaults.apertura_fov_default !== null) {
                      setAperturaFov(defaults.apertura_fov_default);
                    }
                    if (defaults.zoom_optico_default !== undefined && defaults.zoom_optico_default !== null) {
                      setZoomOptico(String(defaults.zoom_optico_default));
                    }
                  }
                }}
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Número de Serie Físico</label>
              <input
                type="text"
                value={numeroSerie}
                onChange={(e) => setNumeroSerie(e.target.value)}
                placeholder="E918237419"
                className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Dirección MAC</label>
              <input
                type="text"
                value={direccionMac}
                onChange={(e) => setDireccionMac(e.target.value)}
                placeholder="54:8C:AF:33:91:2B"
                className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Dirección IP Estática Asignada</label>
              <input
                type="text"
                value={direccionIp}
                onChange={(e) => setDireccionIp(e.target.value)}
                placeholder="10.14.20.108"
                className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 text-blue-700 font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Ubicación Física Específica</label>
            <input
              type="text"
              value={ubicacionEspecifica}
              onChange={(e) => setUbicacionEspecifica(e.target.value)}
              placeholder="Pasillo central Piso 2, cielo falso frente a Laboratorio de Redes 202"
              className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
            />
          </div>

          {/* Características Ambientales y Físicas (Siempre Visibles) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Ambiente</label>
              <select
                value={ambiente}
                onChange={(e) => setAmbiente(e.target.value as any)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs focus:ring-1 focus:ring-blue-600"
              >
                <option value="interior">Interior</option>
                <option value="exterior">Exterior</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Antivandálica</label>
              <select
                value={antivandalico ? 'si' : 'no'}
                onChange={(e) => setAntivandalico(e.target.value === 'si')}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs focus:ring-1 focus:ring-blue-600"
              >
                <option value="si">Sí (IK10 / Reforzada)</option>
                <option value="no">No estándar</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Resolución (MP)</label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="32"
                value={resolucionMp}
                onChange={(e) => setResolucionMp(e.target.value)}
                placeholder="4"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs focus:ring-1 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Altura Montaje (m)</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="25"
                value={alturaMontajeM}
                onChange={(e) => setAlturaMontajeM(e.target.value)}
                placeholder="2.8"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* CAMPOS ESPECÍFICOS SEGÚN EL TIPO */}
          <div className="mt-3 p-3.5 bg-blue-50/50 border border-blue-200 rounded-lg space-y-3">
            <span className="text-[10px] uppercase font-bold text-blue-800 tracking-wider block">
              Parámetros Ópticos Dinámicos • {tipoCamara.toUpperCase()}
            </span>

            {/* Domo o Bullet: Lente, Apertura FOV, Azimut */}
            {(tipoCamara === 'domo' || tipoCamara === 'bullet') && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Lente / Distancia Focal</label>
                  <input
                    type="text"
                    value={lente}
                    onChange={(e) => setLente(e.target.value)}
                    placeholder="ej. 2.8mm o 2.8-12mm varifocal"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Apertura FOV Horizontal *</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="30"
                      max="140"
                      value={aperturaFov}
                      onChange={(e) => setAperturaFov(parseInt(e.target.value) || 103)}
                      className="w-20 px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    />
                    <span className="text-slate-500 text-xs">grados (°)</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Azimut / Orientación *</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="360"
                      value={azimut ?? 0}
                      onChange={(e) => setAzimut(parseInt(e.target.value) || 0)}
                      className="w-20 px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    />
                    <span className="text-slate-500 text-xs">0° N - 360°</span>
                  </div>
                </div>
              </div>
            )}

            {/* PTZ: Zoom Óptico (Azimut y Apertura se ocultan, FOV=360, azimut=null) */}
            {tipoCamara === 'ptz' && (
              <div className="space-y-2">
                <div className="max-w-xs">
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Zoom Óptico Motorizado *</label>
                  <input
                    type="text"
                    value={zoomOptico}
                    onChange={(e) => setZoomOptico(e.target.value)}
                    placeholder="ej. 25x o 32x óptico"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  ℹ️ Para cámaras PTZ, la apertura se fija en 360° continuo y el azimut se guarda como nulo al no poseer orientación estática única.
                </p>
              </div>
            )}

            {/* Fisheye: Apertura FOV inicial 360, editable a 180 si va montada en muro. Azimut solo si FOV < 360 */}
            {tipoCamara === 'fisheye' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-700 font-semibold mb-1">Apertura FOV *</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={aperturaFov}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setAperturaFov(val);
                          if (val >= 360) {
                            setAzimut(null);
                          } else if (azimut === null) {
                            setAzimut(90);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                      >
                        <option value={360}>360° (Montaje en Techo / Cielo Falso)</option>
                        <option value={180}>180° (Montaje Vertical en Muro / Pared)</option>
                      </select>
                    </div>
                  </div>

                  {aperturaFov < 360 && (
                    <div>
                      <label className="block text-[11px] text-slate-700 font-semibold mb-1">Azimut / Orientación Muro *</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="360"
                          value={azimut ?? 90}
                          onChange={(e) => setAzimut(parseInt(e.target.value) || 0)}
                          className="w-24 px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                        />
                        <span className="text-slate-500 text-xs">0° N - 360°</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Multisensor: Número de sensores, Apertura FOV total*, Azimut* */}
            {tipoCamara === 'multisensor' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Número de Sensores / Cabezales *</label>
                  <input
                    type="number"
                    min="2"
                    max="8"
                    value={numSensores}
                    onChange={(e) => setNumSensores(e.target.value)}
                    placeholder="4"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Apertura FOV Total *</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="90"
                      max="360"
                      value={aperturaFov}
                      onChange={(e) => setAperturaFov(parseInt(e.target.value) || 180)}
                      className="w-20 px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    />
                    <span className="text-slate-500 text-xs">grados (ej. 180° o 360°)</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-700 font-semibold mb-1">Azimut / Orientación Central *</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="360"
                      value={azimut ?? 0}
                      onChange={(e) => setAzimut(parseInt(e.target.value) || 0)}
                      className="w-20 px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    />
                    <span className="text-slate-500 text-xs">0° N - 360°</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Step 3: Datos de Adquisición e Instalación */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[10px] font-bold">3</span>
            <span>Datos de Adquisición e Instalación</span>
          </h2>
          <span className="text-[10px] font-mono text-slate-400 uppercase">
            Garantía & Contratistas
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Fecha de Compra</label>
            <input
              type="date"
              value={fechaCompra}
              onChange={(e) => setFechaCompra(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Proveedor de Compra</label>
            <ProveedorSelect
              value={proveedorCompraId}
              rubroFilter="venta"
              proveedores={proveedores}
              onProveedorCreated={(newP) => setProveedores(prev => [...prev, newP].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
              onChange={(pId) => setProveedorCompraId(pId || '')}
              placeholder="Seleccionar proveedor de compra..."
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Fecha de Instalación</label>
            <input
              type="date"
              value={fechaInstalacion}
              onChange={(e) => setFechaInstalacion(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Proveedor de Instalación / Contratista</label>
            <ProveedorSelect
              value={proveedorInstalacionId}
              rubroFilter="instalacion"
              proveedores={proveedores}
              onProveedorCreated={(newP) => setProveedores(prev => [...prev, newP].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}
              onChange={(pId) => setProveedorInstalacionId(pId || '')}
              placeholder="Seleccionar contratista de instalación..."
            />
          </div>
        </div>
      </div>

      {/* Step 4: Posicionamiento en Plano de Planta y Cono de Visión (FOV) */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[10px] font-bold">4</span>
            <span>Posicionamiento en Plano de Planta y Cono de Visión (FOV)</span>
          </h2>
          <span className="text-[10px] font-mono text-slate-400 uppercase">
            Vectorial 2D / Coordenadas CAD
          </span>
        </div>

        {/* Building & Floor Plan Banner */}
        {!selectedPisoId ? (
          <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg p-10 text-center text-slate-500 font-mono space-y-2">
            <Layers className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="font-semibold text-slate-700 text-sm">Primero selecciona o crea un Piso en el Paso 1</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Una vez seleccionado el piso, aquí se desplegará su plano arquitectónico para ubicar la cámara y proyectar su ángulo de cobertura con precisión.
            </p>
          </div>
        ) : (
          <>
            {(() => {
              const currentPiso = pisos.find(p => p.id === selectedPisoId);
              const currentEdificio = currentPiso ? edificios.find(e => e.id === currentPiso.edificio_id) : edificios.find(e => e.id === selectedEdificioId);
              const currentCampus = currentEdificio ? campusList.find(c => c.id === currentEdificio.campus_id) : campusList.find(c => c.id === selectedCampusId);

              return (
                <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Plano de Ubicación:</span>
                    <strong className="text-blue-800">
                      {currentEdificio?.nombre || 'Edificio'} — {currentPiso?.nombre || 'Piso'}
                    </strong>
                    <span className="text-slate-400">({currentCampus?.nombre || 'Campus'})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {currentPiso?.plano_url ? (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        <span>Plano Arquitectónico Oficial Cargado</span>
                      </span>
                    ) : (
                      <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                        <span>Plano Esquemático Base</span>
                      </span>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={handleSetPisoPlanUrl}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded text-[11px] font-bold inline-flex items-center gap-1 transition-colors shadow-2xs"
                        title="Vincular link de Cloudinary, AWS S3 o imagen web"
                      >
                        <Globe className="w-3.5 h-3.5 text-blue-600" />
                        <span>Link Cloudinary / URL</span>
                      </button>

                      <label className="cursor-pointer px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[11px] font-bold inline-flex items-center gap-1 transition-colors shadow-2xs">
                        <Upload className="w-3.5 h-3.5 text-slate-600" />
                        <span>{uploadingPlan ? 'Subiendo...' : (currentPiso?.plano_url ? 'Subir Archivo' : 'Subir Archivo')}</span>
                        <input
                          type="file"
                          accept="image/*,.svg"
                          disabled={uploadingPlan}
                          className="hidden"
                          onChange={handleUploadPisoPlan}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-600">
                Visor Interactivo: <span className="text-blue-700 font-semibold">Haga clic sobre el plano para fijar coordenadas de la cámara</span>
              </span>
              <span className="text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                Posición: X={posicionX}%, Y={posicionY}%
              </span>
            </div>

        {/* SVG Interactive Map */}
        <div className="bg-[#f8fafc] border-2 border-slate-300 rounded-lg p-2 relative overflow-hidden shadow-inner cursor-crosshair">
          {(() => {
            const currentPiso = pisos.find(p => p.id === selectedPisoId);
            const currentEdificio = currentPiso ? edificios.find(e => e.id === currentPiso.edificio_id) : edificios.find(e => e.id === selectedEdificioId);
            const floorExistingCameras = existingCamaras.filter(
              c => c.piso_id === selectedPisoId && c.posicion_x !== null && c.posicion_y !== null && (!c.estado_ciclo_vida || c.estado_ciclo_vida === 'instalado')
            );

            return (
              <svg 
                viewBox="0 0 400 220" 
                className="w-full h-56 select-none"
                onClick={handleFloorPlanClick}
              >
                <defs>
                  <pattern id="gridForm" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="400" height="220" fill="url(#gridForm)" />

                {/* Custom Floor Plan Image corresponding to the selected building and floor */}
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
                    {/* Fallback Vector CAD Rooms reflecting the building and floor */}
                    <rect x="20" y="20" width="100" height="70" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                    <text x="70" y="55" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle">{currentPiso?.nombre || 'Piso'} - SALA 1</text>

                    <rect x="130" y="20" width="100" height="70" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                    <text x="180" y="55" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle">LAB REDES</text>

                    <rect x="240" y="20" width="140" height="70" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" />
                    <text x="310" y="55" fontSize="8" fontFamily="monospace" fill="#475569" textAnchor="middle">SALA TÉCNICA IDF</text>

                    <rect x="20" y="100" width="360" height="40" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1" strokeDasharray="3,3" />
                    <text x="75" y="124" fontSize="8" fontFamily="monospace" fill="#3b82f6" fontWeight="bold">
                      PASILLO {currentPiso?.nombre?.toUpperCase() || 'PISO'} · {currentEdificio?.nombre?.toUpperCase() || ''}
                    </text>

                    <rect x="20" y="150" width="360" height="60" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                    <text x="180" y="185" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle">OFICINAS DOCENTES Y SALAS REUNIONES</text>
                  </>
                )}

                {/* Existing cameras on this floor as reference points */}
                {floorExistingCameras.map((c) => {
                  const exX = ((c.posicion_x || 50) * 400) / 100;
                  const exY = ((c.posicion_y || 50) * 220) / 100;
                  return (
                    <g key={c.id} opacity="0.65">
                      <circle cx={exX} cy={exY} r="4" fill="#64748b" stroke="#ffffff" strokeWidth="1" />
                      <text x={exX} y={exY - 6} fontSize="6" fontFamily="monospace" fill="#334155" fontWeight="bold" textAnchor="middle">
                        {c.codigo}
                      </text>
                    </g>
                  );
                })}

                {/* Live FOV Cone or Full Circle */}
                {isCircle ? (
                  <circle 
                    cx={x1} 
                    cy={y1} 
                    r={fovRadius} 
                    fill="rgba(37, 99, 235, 0.22)" 
                    stroke="#2563eb" 
                    strokeWidth="1.5" 
                    strokeDasharray="2,2" 
                  />
                ) : (
                  <path 
                    d={conePath} 
                    fill="rgba(37, 99, 235, 0.28)" 
                    stroke="#2563eb" 
                    strokeWidth="1.5" 
                    strokeDasharray="2,2" 
                  />
                )}

                {/* Active Placed Camera Node */}
                <circle cx={x1} cy={y1} r="7" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
                <circle cx={x1} cy={y1} r="3" fill="#ffffff" />
                <text x={x1} y={y1 - 10} fontSize="8" fontFamily="monospace" fill="#1e40af" fontWeight="bold" textAnchor="middle">
                  {codigo} ({effectiveFov}°)
                </text>
              </svg>
            );
          })()}
        </div>

        {/* Sliders for Azimuth, FOV angle, and Range */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs font-mono">
          {/* Azimuth slider: only if not PTZ, and if Fisheye only if FOV < 360 */}
          {tipoCamara !== 'ptz' && (tipoCamara !== 'fisheye' || aperturaFov < 360) ? (
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-600">Orientación / Azimut</span>
                <span className="font-bold text-blue-700">{azimut ?? 0}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={azimut ?? 0}
                onChange={(e) => setAzimut(parseInt(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                <span>0° N</span>
                <span>90° E</span>
                <span>180° S</span>
                <span>270° O</span>
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded flex flex-col justify-center">
              <span className="text-slate-500 text-[11px] block">Orientación Azimut</span>
              <span className="text-slate-700 font-semibold text-xs mt-0.5">No aplica (Cobertura 360°)</span>
            </div>
          )}

          {/* Apertura FOV slider: hidden for PTZ */}
          {tipoCamara !== 'ptz' ? (
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-600">Apertura FOV</span>
                <span className="font-bold text-blue-700">{aperturaFov}°</span>
              </div>
              <input
                type="range"
                min="30"
                max={tipoCamara === 'fisheye' || tipoCamara === 'multisensor' ? 360 : 140}
                value={aperturaFov}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setAperturaFov(val);
                  if (tipoCamara === 'fisheye') {
                    if (val >= 360) setAzimut(null);
                    else if (azimut === null) setAzimut(90);
                  }
                }}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                <span>30° Tele</span>
                <span>103° Amplio</span>
                <span>{tipoCamara === 'fisheye' || tipoCamara === 'multisensor' ? '360° Todo' : '140° Max'}</span>
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded flex flex-col justify-center">
              <span className="text-slate-500 text-[11px] block">Apertura Angular</span>
              <span className="text-slate-700 font-semibold text-xs mt-0.5">360° Continuo PTZ</span>
            </div>
          )}

          <div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-600">Alcance Visual Útil</span>
              <span className="font-bold text-blue-700">{alcanceMetros} m</span>
            </div>
            <input
              type="range"
              min="3"
              max="50"
              value={alcanceMetros}
              onChange={(e) => setAlcanceMetros(parseInt(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
              <span>3m</span>
              <span>15m</span>
              <span>30m</span>
              <span>50m</span>
            </div>
          </div>
        </div>
          </>
        )}
      </div>

      {/* Step 5: Metadatos de la Visita */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h2 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[10px] font-bold">5</span>
            <span>Metadatos de la Visita</span>
          </h2>
          <span className="text-[10px] font-mono text-slate-400 uppercase">
            Trazabilidad Técnica
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Fecha de Inspección / Montaje</label>
            <input
              type="date"
              value={fechaInspeccion}
              onChange={(e) => setFechaInspeccion(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Técnico Responsable</label>
            <input
              type="text"
              value={tecnicoResponsable}
              onChange={(e) => setTecnicoResponsable(e.target.value)}
              placeholder="ej. M. Morales - Cuadrilla Infraestructura"
              className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="text-xs font-mono">
          <label className="block text-[11px] text-slate-600 mb-1">Notas u Observaciones de Terreno</label>
          <textarea
            rows={3}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Observaciones de conectorización, tirada de cableado, soporte a losa, etc."
            className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 text-xs"
          />
        </div>
      </div>

      {/* Action Submit Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="w-full sm:w-auto px-5 py-2 text-xs font-medium border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
        >
          Cancelar y volver
        </button>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(true)}
            className="w-full sm:w-auto px-4 py-2 text-xs font-mono border border-blue-600 text-blue-700 hover:bg-blue-50 rounded font-semibold transition-colors shadow-2xs"
          >
            + Guardar y Registrar Siguiente
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(false)}
            className="w-full sm:w-auto px-6 py-2 text-xs font-mono bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando en Supabase...' : 'Guardar Registro Técnico'}</span>
          </button>
        </div>
      </div>

      {/* Quick CRUD modal for physical hierarchy nodes */}
      <NodeFormModal
        isOpen={treeModalState.isOpen}
        mode="create"
        level={treeModalState.level}
        parentId={treeModalState.parentId}
        sedes={sedes}
        campusList={campusList}
        edificios={edificios}
        pisos={pisos}
        onClose={() => setTreeModalState(prev => ({ ...prev, isOpen: false }))}
        onSuccess={async () => {
          await fetchInitialData();
          setTreeModalState(prev => ({ ...prev, isOpen: false }));
        }}
      />
    </div>
  );
};
