import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Compass, 
  Eye, 
  Layers, 
  ShieldAlert, 
  Zap, 
  Camera, 
  Download, 
  Plus, 
  ArrowLeft, 
  Upload, 
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  Edit3,
  Save,
  X,
  Link2,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
  Globe,
  Copy,
  Check,
  FileText
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Camara, Piso, TipoCamara, Edificio, Campus, Sede, Rack, Equipo } from '../types/database';

interface FloorPlanCoverageProps {
  onSelectCamera: (cam: Camara) => void;
  onNavigateToRegistration: () => void;
  onBack: () => void;
  initialCameraId?: string;
  initialPisoId?: string;
}

// Fallback coordinates for floor plan demo cameras in viewBox (540 x 260)
const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  'CAM-ENG-P2-01': { x: 75, y: 110 },
  'CAM-ENG-P2-02': { x: 260, y: 85 },
  'CAM-ENG-P2-03': { x: 345, y: 85 },
  'CAM-ENG-P2-08': { x: 285, y: 110 },
  'CAM-ENG-P2-05': { x: 440, y: 110 },
  'CAM-ENG-P2-06': { x: 250, y: 135 },
  'CAM-ENG-P2-04': { x: 505, y: 135 },
};

export const FloorPlanCoverage: React.FC<FloorPlanCoverageProps> = ({
  onSelectCamera,
  onNavigateToRegistration,
  onBack,
  initialCameraId,
  initialPisoId,
}) => {
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [campusList, setCampusList] = useState<Campus[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [selectedPiso, setSelectedPiso] = useState<Piso | null>(null);
  const [selectedCam, setSelectedCam] = useState<Camara | null>(null);
  const [showFovCones, setShowFovCones] = useState(true);
  const [showBlindSpots, setShowBlindSpots] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [loading, setLoading] = useState(true);

  // Edit coverage state
  const [isEditing, setIsEditing] = useState(false);
  const [editTipo, setEditTipo] = useState<TipoCamara>('domo');
  const [editLente, setEditLente] = useState('');
  const [editFov, setEditFov] = useState<number | ''>(103);
  const [editAzimut, setEditAzimut] = useState<number | null | ''>(90);
  const [editAlcance, setEditAlcance] = useState<number | ''>(18.5);
  const [editZoom, setEditZoom] = useState('');
  const [editNumSensores, setEditNumSensores] = useState<number | ''>(4);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [camRes, pisoRes, edRes, campRes, sedRes, rackRes, eqRes] = await Promise.all([
          supabase.from('camaras').select('*').order('codigo'),
          supabase.from('pisos').select('*').order('nombre'),
          supabase.from('edificios').select('*').order('nombre'),
          supabase.from('campus').select('*').order('nombre'),
          supabase.from('sedes').select('*').order('nombre'),
          supabase.from('racks').select('*').order('codigo'),
          supabase.from('equipos').select('*').order('codigo'),
        ]);

        const loadedCamaras = camRes.data || [];
        const loadedPisos = pisoRes.data || [];
        const loadedEdificios = edRes.data || [];
        const loadedCampus = campRes.data || [];
        const loadedSedes = sedRes.data || [];
        const loadedRacks = rackRes.data || [];
        const loadedEquipos = eqRes.data || [];

        setCamaras(loadedCamaras);
        setPisos(loadedPisos);
        setEdificios(loadedEdificios);
        setCampusList(loadedCampus);
        setSedes(loadedSedes);
        setRacks(loadedRacks);
        setEquipos(loadedEquipos);

        // Determine initial piso by real piso_id or initialCamera
        let targetPiso: Piso | null = null;
        if (initialPisoId) {
          targetPiso = loadedPisos.find(p => p.id === initialPisoId) || null;
        }
        if (!targetPiso && initialCameraId) {
          const foundCam = loadedCamaras.find(c => c.id === initialCameraId);
          if (foundCam && foundCam.piso_id) {
            targetPiso = loadedPisos.find(p => p.id === foundCam.piso_id) || null;
          }
        }
        if (!targetPiso && loadedPisos.length > 0) {
          // Fallback to first piso without string pattern matching
          targetPiso = loadedPisos[0];
        }
        setSelectedPiso(targetPiso);

        // Set initial selected camera on that floor
        if (targetPiso) {
          const floorCams = loadedCamaras.filter(
            c => c.piso_id === targetPiso!.id && (!c.estado_ciclo_vida || c.estado_ciclo_vida === 'instalado')
          );
          const camToSelect = initialCameraId 
            ? floorCams.find(c => c.id === initialCameraId) || floorCams[0] || null
            : floorCams[0] || null;
          setSelectedCam(camToSelect);
        }
      } catch (err) {
        console.error('Error fetching floor plan coverage data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [initialCameraId, initialPisoId]);

  // Formatter for full floor path: "Piso 1 — Edificio A, Campus Central (Sede Central)"
  const getFullFloorPath = (piso: Piso) => {
    const ed = edificios.find(e => e.id === piso.edificio_id);
    const camp = campusList.find(c => c.id === ed?.campus_id);
    const sed = sedes.find(s => s.id === camp?.sede_id);
    const edName = ed ? ed.nombre : 'Edificio';
    const campName = camp ? camp.nombre : 'Campus';
    const sedName = sed ? ` (${sed.nombre})` : '';
    return `${piso.nombre} — ${edName}, ${campName}${sedName}`;
  };

  const handlePisoChange = (newPisoId: string) => {
    const found = pisos.find(p => p.id === newPisoId);
    if (found) {
      setSelectedPiso(found);
      const floorCams = camaras.filter(
        c => c.piso_id === found.id && (!c.estado_ciclo_vida || c.estado_ciclo_vida === 'instalado')
      );
      setSelectedCam(floorCams[0] || null);
      setIsEditing(false);
    }
  };

  // When selectedCam changes or user enters edit mode, initialize edit states
  const initEditForm = (cam: Camara) => {
    const t = (cam.tipo_camara || cam.tipo_dispositivo || 'domo') as TipoCamara;
    setEditTipo(t);
    setEditLente(cam.lente || '2.8mm');
    setEditFov(t === 'ptz' ? 360 : (cam.apertura_fov ?? (t === 'fisheye' ? 360 : 103)));
    setEditAzimut(t === 'ptz' ? null : (t === 'fisheye' && (cam.apertura_fov ?? 360) >= 360 ? null : (cam.azimut ?? 90)));
    setEditAlcance(cam.alcance_metros ?? 18.5);
    setEditZoom(cam.zoom_optico || '25x');
    setEditNumSensores(cam.num_sensores || 4);
  };

  const handleStartEdit = () => {
    if (!selectedCam) return;
    initEditForm(selectedCam);
    setIsEditing(true);
  };

  const handleTipoChange = (newTipo: TipoCamara) => {
    setEditTipo(newTipo);
    const curFov = Number(editFov) || 103;
    if (newTipo === 'domo' || newTipo === 'bullet') {
      setEditZoom('');
      setEditNumSensores(4);
      if (!editLente) setEditLente('2.8mm');
      if (curFov >= 360) setEditFov(103);
      if (editAzimut === null) setEditAzimut(90);
    } else if (newTipo === 'ptz') {
      setEditLente('');
      setEditNumSensores(4);
      setEditFov(360);
      setEditAzimut(null);
      if (!editZoom) setEditZoom('25x');
    } else if (newTipo === 'fisheye') {
      setEditLente('');
      setEditZoom('');
      setEditNumSensores(4);
      setEditFov(360);
      setEditAzimut(null);
    } else if (newTipo === 'multisensor') {
      setEditLente('');
      setEditZoom('');
      if (!editNumSensores) setEditNumSensores(4);
      if (curFov < 180 || curFov >= 360) setEditFov(180);
      if (editAzimut === null) setEditAzimut(90);
    }
  };

  const handleSaveCoverage = async () => {
    if (!selectedCam) return;
    try {
      setSavingEdit(true);

      const isPtz = editTipo === 'ptz';
      const isFisheye = editTipo === 'fisheye';
      const isMultisensor = editTipo === 'multisensor';
      const isDomoOrBullet = editTipo === 'domo' || editTipo === 'bullet';

      const finalFov = isPtz ? 360 : (Number(editFov) || 103);
      const finalAzimut = isPtz ? null : (isFisheye && finalFov >= 360 ? null : (editAzimut === '' ? 90 : editAzimut));
      const finalLente = isDomoOrBullet ? (editLente.trim() || null) : null;
      const finalZoom = isPtz ? (editZoom.trim() || null) : null;
      const finalNumSensores = isMultisensor ? (Number(editNumSensores) || 4) : null;

      const payload: any = {
        tipo_camara: editTipo,
        tipo_dispositivo: editTipo,
        apertura_fov: finalFov,
        azimut: finalAzimut,
        lente: finalLente,
        zoom_optico: finalZoom,
        num_sensores: finalNumSensores,
        alcance_metros: editAlcance,
      };

      const { data, error } = await supabase
        .from('camaras')
        .update(payload)
        .eq('id', selectedCam.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setSelectedCam(data);
        setCamaras(prev => prev.map(c => c.id === data.id ? data : c));
      }
      setIsEditing(false);
    } catch (err: any) {
      console.error('Error saving coverage:', err);
      alert('Error al guardar cobertura: ' + (err.message || String(err)));
    } finally {
      setSavingEdit(false);
    }
  };

  // Helper function to build SVG path for coverage
  // - Full circle when fov >= 360 (PTZ or fisheye techo)
  // - Semicircle / sector when fov = 180 (fisheye muro)
  // - Cone oriented with azimut, fov and r for domo, bullet and multisensor
  // - Safely handles azimut === null
  const getCoveragePath = (cx: number, cy: number, az: number | null, fov: number, r: number) => {
    if (fov >= 360) {
      // Circle path centered at (cx, cy)
      return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    }
    const safeAz = az ?? 90;
    const radStart = ((safeAz - fov / 2 - 90) * Math.PI) / 180;
    const radEnd = ((safeAz + fov / 2 - 90) * Math.PI) / 180;
    const x2 = cx + Math.cos(radStart) * r;
    const y2 = cy + Math.sin(radStart) * r;
    const x3 = cx + Math.cos(radEnd) * r;
    const y3 = cy + Math.sin(radEnd) * r;
    const largeArcFlag = fov > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x2} ${y2} A ${r} ${r} 0 ${largeArcFlag} 1 ${x3} ${y3} Z`;
  };

  const isCustomImagePlan = Boolean(selectedPiso?.plano_url && selectedPiso.plano_url.trim().length > 5);
  const [uploadingPlan, setUploadingPlan] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [planInputUrl, setPlanInputUrl] = useState('');
  const [planInputScale, setPlanInputScale] = useState('1m = 32px');
  const [planTab, setPlanTab] = useState<'url' | 'upload'>('url');
  const [planUrlPreviewError, setPlanUrlPreviewError] = useState(false);
  const [planUrlLoaded, setPlanUrlLoaded] = useState(false);
  const [planUrlDimensions, setPlanUrlDimensions] = useState<{ width: number; height: number } | null>(null);
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [savingPlanUrl, setSavingPlanUrl] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [planToast, setPlanToast] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!planToast) return;
    const t = setTimeout(() => setPlanToast(null), 3500);
    return () => clearTimeout(t);
  }, [planToast]);

  // Open plan modal with current piso URL and scale
  const handleOpenPlanModal = (defaultTab?: 'url' | 'upload') => {
    if (selectedPiso) {
      const currentUrl = selectedPiso.plano_url && !selectedPiso.plano_url.startsWith('data:') ? selectedPiso.plano_url : '';
      setPlanInputUrl(currentUrl);
      setPlanInputScale(selectedPiso.plano_escala || '1m = 32px');
      setUploadedFileBase64(selectedPiso.plano_url?.startsWith('data:') ? selectedPiso.plano_url : null);
      setUploadedFileName(null);
      setPlanUrlPreviewError(false);
      setPlanUrlLoaded(false);
      setPlanUrlDimensions(null);
      setPlanTab(defaultTab || (selectedPiso.plano_url?.startsWith('http') ? 'url' : (selectedPiso.plano_url?.startsWith('data:') ? 'upload' : 'url')));
      setPlanModalOpen(true);
    }
  };

  // Handle local file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert('El archivo supera los 8MB. Para archivos pesados, te recomendamos alojarlo en Cloudinary, AWS S3 o similar y vincular su URL.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedFileBase64(reader.result as string);
      setUploadedFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  // Paste from clipboard helper
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        setPlanInputUrl(text.trim());
        setPlanUrlPreviewError(false);
        setPlanUrlLoaded(false);
        setCopiedNotification(true);
        setTimeout(() => setCopiedNotification(false), 2000);
      } else {
        alert('El portapapeles no contiene una URL válida que empiece por http:// o https://');
      }
    } catch {
      alert('Permiso de portapapeles denegado o no soportado en este navegador. Puedes pegar manualmente con Ctrl+V o Cmd+V.');
    }
  };

  // Preset demo Cloudinary floor plan
  const handleSetExampleCloudinary = () => {
    // Clean, high-resolution architectural layout example
    const sampleUrl = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
    setPlanInputUrl(sampleUrl);
    setPlanUrlPreviewError(false);
    setPlanUrlLoaded(false);
  };

  // Preset vector architectural floor plan
  const handleSetVectorBlueprint = () => {
    const sampleSvg = 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Sample_Floorplan.svg';
    setPlanInputUrl(sampleSvg);
    setPlanUrlPreviewError(false);
    setPlanUrlLoaded(false);
  };

  // Save floor plan (either URL or Base64 file)
  const handleSavePlan = async () => {
    if (!selectedPiso) return;
    try {
      setSavingPlanUrl(true);
      let targetUrl: string | null = null;

      if (planTab === 'url') {
        const cleanUrl = planInputUrl.trim();
        if (!cleanUrl) {
          alert('Por favor ingresa o pega un enlace válido (ej: Cloudinary o URL pública de imagen).');
          return;
        }
        targetUrl = cleanUrl;
      } else {
        if (!uploadedFileBase64) {
          alert('Por favor selecciona o sube un archivo de plano arquitectónico.');
          return;
        }
        targetUrl = uploadedFileBase64;
      }

      const finalScale = planInputScale.trim() || '1m = 32px';

      const { error } = await supabase
        .from('pisos')
        .update({ 
          plano_url: targetUrl,
          plano_escala: finalScale
        })
        .eq('id', selectedPiso.id);

      if (error) throw error;

      setSelectedPiso(prev => prev ? { ...prev, plano_url: targetUrl, plano_escala: finalScale } : null);
      setPisos(prev => prev.map(p => p.id === selectedPiso.id ? { ...p, plano_url: targetUrl, plano_escala: finalScale } : p));
      setPlanModalOpen(false);
      setPlanToast(`Plano arquitectónico asignado exitosamente a ${selectedPiso.nombre}`);
    } catch (err: any) {
      console.error('Error saving floor plan:', err);
      alert('Error al guardar el plano: ' + (err.message || String(err)));
    } finally {
      setSavingPlanUrl(false);
    }
  };

  // Remove floor plan
  const handleRemoveFloorPlan = async () => {
    if (!selectedPiso) return;
    if (!confirm(`¿Deseas desvincular el plano arquitectónico del piso "${selectedPiso.nombre}"?`)) return;
    try {
      setSavingPlanUrl(true);
      const { error } = await supabase
        .from('pisos')
        .update({ plano_url: null })
        .eq('id', selectedPiso.id);

      if (error) throw error;
      setSelectedPiso(prev => prev ? { ...prev, plano_url: null } : null);
      setPisos(prev => prev.map(p => p.id === selectedPiso.id ? { ...p, plano_url: null } : p));
      setPlanInputUrl('');
      setUploadedFileBase64(null);
      setPlanModalOpen(false);
      setPlanToast(`Plano desvinculado de ${selectedPiso.nombre}. Se activó la vista CAD vectorial estándar.`);
    } catch (err: any) {
      console.error('Error removing floor plan:', err);
      alert('Error al quitar plano: ' + (err.message || String(err)));
    } finally {
      setSavingPlanUrl(false);
    }
  };

  // Current hierarchy location objects
  const currentEd = selectedPiso ? edificios.find(e => e.id === selectedPiso.edificio_id) : null;
  const currentCamp = currentEd ? campusList.find(c => c.id === currentEd.campus_id) : null;
  const currentSed = currentCamp ? sedes.find(s => s.id === currentCamp.sede_id) : null;

  // Calculate coordinates for cameras on this floor - strictly filtered by selectedPiso.id
  const currentPisoCameras = camaras.filter(
    cam => selectedPiso && cam.piso_id === selectedPiso.id && (!cam.estado_ciclo_vida || cam.estado_ciclo_vida === 'instalado')
  );

  const floorCameras = currentPisoCameras.map((cam, idx) => {
    let cx = 0;
    let cy = 0;

    if (cam.posicion_x !== null && cam.posicion_x !== undefined && cam.posicion_y !== null && cam.posicion_y !== undefined) {
      cx = (cam.posicion_x * 540) / 100;
      cy = (cam.posicion_y * 260) / 100;
    } else if (DEFAULT_POSITIONS[cam.codigo]) {
      cx = DEFAULT_POSITIONS[cam.codigo].x;
      cy = DEFAULT_POSITIONS[cam.codigo].y;
    } else {
      cx = 60 + ((idx * 65) % 420);
      cy = 110 + (idx % 2 === 0 ? 0 : 25);
    }

    const tipo = (cam.tipo_camara || cam.tipo_dispositivo || 'domo') as TipoCamara;
    const isPtz = tipo === 'ptz';
    const isFisheye = tipo === 'fisheye';
    const fov = isPtz ? 360 : (cam.apertura_fov ?? (isFisheye ? 360 : 103));
    const az = isPtz ? null : (isFisheye && fov >= 360 ? null : (cam.azimut ?? null));
    const radius = cam.alcance_metros ? Math.min(130, Math.max(45, cam.alcance_metros * 4.5)) : 80;

    return {
      cam,
      codigo: cam.codigo,
      cx,
      cy,
      az,
      fov,
      r: radius,
      tipo,
    };
  });

  if (!loading && pisos.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={onBack}
              className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 text-slate-600"
              title="Volver"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-xl font-bold font-mono text-slate-900 tracking-tight">
              Planimetría y Cobertura
            </h1>
          </div>
        </div>

        <div className="bg-white border border-dashed border-slate-300 rounded-lg p-12 text-center space-y-4 font-mono">
          <div className="w-14 h-14 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center mx-auto text-blue-600">
            <Layers className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-base font-bold text-slate-900">
              Aún no hay Pisos Registrados
            </h2>
            <p className="text-xs text-slate-500 font-sans leading-relaxed">
              Para visualizar planos arquitectónicos y conos de cobertura de cámaras, primero debes estructurar la topología creando una Sede, Campus, Edificio y Piso en el Árbol de Navegación.
            </p>
          </div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Navegación Física</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono border-b border-slate-200 pb-2 text-slate-500 gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span>{currentSed?.nombre || 'Sede'}</span>
          <span>&gt;</span>
          <span>{currentCamp?.nombre || 'Campus'}</span>
          <span>&gt;</span>
          <span>{currentEd?.nombre || 'Edificio'}</span>
          <span>&gt;</span>
          <span className="font-semibold text-slate-700">{selectedPiso?.nombre || 'Piso'}</span>
          <span>&gt;</span>
          <strong className="text-slate-900">Planimetría & Cobertura ({floorCameras.length} Cámaras)</strong>
        </div>
        <div className="flex items-center gap-3">
          {pisos.length > 0 && (
            <div className="flex items-center gap-1.5 mr-2">
              <span className="text-slate-500 font-semibold">Piso jerárquico:</span>
              <select
                value={selectedPiso?.id || ''}
                onChange={(e) => handlePisoChange(e.target.value)}
                className="bg-white border border-slate-300 rounded px-2.5 py-1 text-[11px] font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-600 max-w-xs sm:max-w-md truncate font-semibold shadow-2xs"
              >
                {pisos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {getFullFloorPath(p)} {p.plano_url ? '• (Plano cargado)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <span>Cálculo de Cobertura</span>
          <span>•</span>
          <span className="text-emerald-700 font-semibold flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Calibración: {selectedPiso?.plano_escala || '1m = 32px'}
          </span>
        </div>
      </div>

      {/* Header and Layer Controls */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onBack}
              className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 text-slate-600"
              title="Volver"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                Plano CAD {selectedPiso?.nombre || 'Piso'} · {currentEd?.nombre || 'Edificio'}
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Capa Arquitectónica:</span>
                {selectedPiso?.plano_url ? (
                  selectedPiso.plano_url.startsWith('http') ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold">
                      <Globe className="w-3 h-3" />
                      {selectedPiso.plano_url.includes('cloudinary') ? 'Enlace Cloudinary CDN' : 'Enlace Web Cloud'}
                      <a 
                        href={selectedPiso.plano_url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="hover:underline ml-0.5 text-blue-500 hover:text-blue-700"
                        title="Abrir enlace en pestaña nueva"
                      >
                        <ExternalLink className="w-2.5 h-2.5 inline" />
                      </a>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
                      <ImageIcon className="w-3 h-3" />
                      Archivo Local (Base64)
                    </span>
                  )
                ) : (
                  <span className="text-slate-400">Esquema CAD Vectorial Simulado</span>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenPlanModal()}
                  className="text-blue-600 hover:text-blue-800 hover:underline text-[11px] font-medium"
                >
                  [Gestionar / Cambiar]
                </button>
              </p>
            </div>
          </div>
        </div>

        {/* Layer Toggles & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <button
            onClick={() => setShowFovCones(!showFovCones)}
            className={`px-3 py-1.5 rounded border transition-colors ${
              showFovCones
                ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Conos & Círculos FOV
          </button>
          <button
            onClick={() => setShowBlindSpots(!showBlindSpots)}
            className={`px-3 py-1.5 rounded border transition-colors ${
              showBlindSpots
                ? 'bg-red-50 text-red-700 border-red-300 font-semibold'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Puntos Ciegos (2)
          </button>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`px-3 py-1.5 rounded border transition-colors ${
              showLabels
                ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Etiquetas ID
          </button>

          {/* Subir o Vincular Plano (Cloudinary / Archivo) Button */}
          <button
            type="button"
            onClick={() => handleOpenPlanModal()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-blue-300 bg-blue-50/80 hover:bg-blue-100 text-blue-900 transition-colors font-semibold shadow-2xs"
            title="Subir archivo o anexar enlace de Cloudinary / URL"
          >
            <Link2 className="w-3.5 h-3.5 text-blue-600" />
            <span>{selectedPiso?.plano_url ? 'Gestionar Plano (Cloudinary / Archivo)' : 'Subir / Vincular Plano'}</span>
          </button>

          <button
            onClick={onNavigateToRegistration}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors shadow-xs ml-1"
          >
            <Plus className="w-4 h-4" />
            <span>Añadir Cámara</span>
          </button>
        </div>
      </div>

      {/* Main Grid: CAD Viewport on Left & Selected Camera / Inspector on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT: Architectural Floor Plan Canvas */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pb-2 border-b border-slate-200">
            <span>MODO PLANO ACTIVO: Vectorial HD · Zoom: 100%</span>
            <span>Cámaras en Piso: {floorCameras.length} · Área Analizada: 1,480 m²</span>
          </div>

          <div className="bg-[#f8fafc] border-2 border-slate-300 rounded-lg p-2 relative overflow-hidden shadow-inner min-h-[380px] flex items-center justify-center">
            {!selectedPiso?.plano_url ? (
              <div className="w-full py-12 px-6 text-center space-y-4 font-mono">
                <div className="w-14 h-14 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center mx-auto text-blue-600 shadow-2xs">
                  <Globe className="w-7 h-7" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="text-sm font-bold text-slate-800">
                    Este piso aún no tiene un plano arquitectónico cargado
                  </h3>
                  <p className="text-xs text-slate-500 font-sans leading-relaxed">
                    Puedes anexar un enlace de servicios en la nube como <strong className="font-semibold text-blue-700">Cloudinary</strong>, AWS S3, o subir un archivo de imagen/SVG de <strong className="font-semibold text-slate-700">{selectedPiso?.nombre}</strong>.
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleOpenPlanModal('url')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
                  >
                    <Globe className="w-4 h-4" />
                    <span>Anexar Enlace Cloudinary / URL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenPlanModal('upload')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold shadow-2xs transition-colors"
                  >
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>Subir Archivo de Imagen</span>
                  </button>
                  <button
                    type="button"
                    onClick={onNavigateToRegistration}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold shadow-2xs transition-colors"
                  >
                    <Plus className="w-4 h-4 text-blue-600" />
                    <span>Registrar Cámara</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {floorCameras.length === 0 && (
                  <div className="absolute top-4 left-4 right-4 bg-blue-50/90 border border-blue-200 backdrop-blur-xs rounded p-2.5 flex items-center justify-between text-xs font-mono text-blue-900 z-10 shadow-xs">
                    <span>Plano cargado correctamente. Aún no hay cámaras posicionadas en este nivel.</span>
                    <button
                      type="button"
                      onClick={onNavigateToRegistration}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-[11px] shadow-2xs transition-colors"
                    >
                      + Añadir Cámara a este Plano
                    </button>
                  </div>
                )}

                {/* Top-Right Plan Source Badge */}
                <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-md px-2.5 py-1 text-[10px] font-mono text-slate-700 shadow-xs flex items-center gap-2 z-10">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-slate-800">
                    {selectedPiso?.plano_url?.includes('cloudinary') ? 'Cloudinary CDN' : (selectedPiso?.plano_url?.startsWith('http') ? 'Enlace Cloud' : 'Archivo Local')}
                  </span>
                  <span className="text-slate-400">·</span>
                  <button
                    type="button"
                    onClick={() => handleOpenPlanModal()}
                    className="text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                  >
                    Gestionar
                  </button>
                </div>

                <svg viewBox="0 0 540 260" className="w-full h-[380px] select-none">
              <defs>
                <pattern id="cadGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
                </pattern>
                <pattern id="diagonalHatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="0" y2="10" stroke="#f87171" strokeWidth="1.5" />
                </pattern>
              </defs>
              <rect width="540" height="260" fill="url(#cadGrid)" />

              {/* Custom Image/SVG Floor Plan Layer if uploaded or linked via Cloudinary */}
              {isCustomImagePlan && selectedPiso?.plano_url && (
                <image 
                  href={selectedPiso.plano_url} 
                  xlinkHref={selectedPiso.plano_url}
                  x="15" 
                  y="15" 
                  width="510" 
                  height="230" 
                  preserveAspectRatio="xMidYMid meet" 
                  opacity="0.95" 
                />
              )}

              {/* Rooms Geometry (Vector CAD fallback/overlay) */}
              {!isCustomImagePlan && (
                <>
                  {/* Aula 201 */}
                  <rect x="25" y="25" width="95" height="65" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                  <text x="72" y="55" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">AULA 201</text>
                  <text x="72" y="66" fontSize="6.5" fontFamily="monospace" fill="#94a3b8" textAnchor="middle">Capacidad: 35 Est.</text>

                  {/* Lab Redes 202 */}
                  <rect x="125" y="25" width="125" height="65" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
                  <text x="187" y="55" fontSize="8" fontFamily="monospace" fill="#475569" textAnchor="middle" fontWeight="bold">LAB DE REDES Y TELECOM 202</text>
                  <text x="187" y="66" fontSize="6.5" fontFamily="monospace" fill="#3b82f6" textAnchor="middle">Área de Alta Seguridad IP</text>

                  {/* Sala Técnica IDF 204 */}
                  <rect x="255" y="25" width="60" height="65" fill="#eff6ff" stroke="#3b82f6" strokeWidth="1.5" />
                  <text x="285" y="55" fontSize="7.5" fontFamily="monospace" fill="#1e40af" textAnchor="middle" fontWeight="bold">SALA TÉCNICA IDF</text>
                  <text x="285" y="66" fontSize="6" fontFamily="monospace" fill="#60a5fa" textAnchor="middle">RCK-ENG-P2-01</text>

                  {/* Aula 203 */}
                  <rect x="320" y="25" width="95" height="65" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                  <text x="367" y="55" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">AULA 203</text>
                  <text x="367" y="66" fontSize="6.5" fontFamily="monospace" fill="#94a3b8" textAnchor="middle">Capacidad: 40 Est.</text>

                  {/* Escalera Norte */}
                  <rect x="420" y="25" width="95" height="65" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" />
                  <text x="467" y="58" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">ESCALERA NORTE</text>

                  {/* Pasillo Central Distribuidor */}
                  <rect x="25" y="95" width="490" height="40" fill="#f0f7ff" stroke="#93c5fd" strokeWidth="1" strokeDasharray="3,3" />
                  <text x="180" y="118" fontSize="9" fontFamily="monospace" fill="#3b82f6" fontWeight="bold">PASILLO CENTRAL DISTRIBUIDOR PRINCIPAL</text>

                  {/* Aula Multimedia 204 */}
                  <rect x="25" y="140" width="115" height="95" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                  <text x="82" y="185" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">AULA MULTIMEDIA 204</text>

                  {/* Escalera Emergencia B (Blind spot #1) */}
                  <rect x="145" y="140" width="80" height="95" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                  {showBlindSpots && (
                    <rect x="148" y="145" width="74" height="40" fill="url(#diagonalHatch)" stroke="#ef4444" strokeWidth="1" />
                  )}
                  <text x="185" y="200" fontSize="7.5" fontFamily="monospace" fill="#dc2626" textAnchor="middle" fontWeight="bold">ESCALERA EMERGENCIA B</text>
                  {showBlindSpots && (
                    <text x="185" y="168" fontSize="7" fontFamily="monospace" fill="#b91c1c" textAnchor="middle" fontWeight="bold">P. CIEGO #1</text>
                  )}

                  {/* Hall Estudiantes */}
                  <rect x="230" y="140" width="130" height="95" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                  <text x="295" y="190" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">HALL ESTUDIANTES & CO-WORK</text>

                  {/* Depto Investigacion */}
                  <rect x="365" y="140" width="150" height="95" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" />
                  <text x="440" y="190" fontSize="8" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">DEPTO. INVESTIGACIÓN</text>
                </>
              )}

              {/* FOV Coverage Projection (Cone / Circle / Semicircle based on type and FOV) */}
              {showFovCones && floorCameras.map(fc => {
                const path = getCoveragePath(fc.cx, fc.cy, fc.az, fc.fov, fc.r);
                const isSelected = selectedCam?.codigo === fc.codigo;
                return (
                  <path
                    key={`fov-${fc.codigo}`}
                    d={path}
                    fill={isSelected ? 'rgba(37, 99, 235, 0.32)' : 'rgba(96, 165, 250, 0.18)'}
                    stroke={isSelected ? '#1d4ed8' : '#3b82f6'}
                    strokeWidth={isSelected ? '1.5' : '1'}
                    strokeDasharray={fc.fov >= 360 ? 'none' : '2,2'}
                  />
                );
              })}

              {/* Camera Nodes */}
              {floorCameras.map(fc => {
                const isSelected = selectedCam?.codigo === fc.codigo;
                return (
                  <g 
                    key={fc.codigo}
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedCam(fc.cam);
                      if (isEditing) initEditForm(fc.cam);
                    }}
                  >
                    <circle
                      cx={fc.cx}
                      cy={fc.cy}
                      r={isSelected ? '8' : '6'}
                      fill={isSelected ? '#1d4ed8' : '#2563eb'}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <circle cx={fc.cx} cy={fc.cy} r="2.5" fill="#ffffff" />
                    {showLabels && (
                      <g>
                        <rect
                          x={fc.cx - 30}
                          y={fc.cy - 18}
                          width="60"
                          height="12"
                          fill="rgba(255, 255, 255, 0.9)"
                          stroke={isSelected ? '#1d4ed8' : '#cbd5e1'}
                          strokeWidth="0.8"
                          rx="2"
                        />
                        <text
                          x={fc.cx}
                          y={fc.cy - 10}
                          fontSize="6.5"
                          fontFamily="monospace"
                          fontWeight={isSelected ? 'bold' : 'normal'}
                          fill={isSelected ? '#1d4ed8' : '#334155'}
                          textAnchor="middle"
                        >
                          {fc.codigo}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Coordinates / Map scale legend */}
            <div className="absolute bottom-3 left-3 bg-slate-900/90 text-white font-mono text-[9px] px-2.5 py-1 rounded flex items-center gap-3">
              <span className="flex items-center gap-1 text-blue-400">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Nodo Cámara
              </span>
              <span className="flex items-center gap-1 text-indigo-300">
                <span className="w-2 h-2 bg-blue-400/40 border border-blue-400" /> Cobertura (Cono / Círculo 360°)
              </span>
              <span className="flex items-center gap-1 text-red-300">
                <span className="w-2 h-2 bg-red-400/40 border border-red-400" /> Punto Ciego
              </span>
            </div>
          </>
        )}
      </div>

      {/* Bottom KPI stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs pt-2">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded">
          <span className="text-[10px] text-slate-500 uppercase block">COBERTURA TOTAL PASILLOS</span>
          <span className="text-xl font-bold text-blue-700 block mt-0.5">
            {floorCameras.length === 0 ? '0%' : '87.4%'}
          </span>
          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div 
              className="bg-blue-600 h-full transition-all" 
              style={{ width: floorCameras.length === 0 ? '0%' : '87.4%' }} 
            />
          </div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded">
          <span className="text-[10px] text-slate-500 uppercase block">CÁMARAS ACTIVAS PISO</span>
          <span className="text-xl font-bold text-slate-900 block mt-0.5">{floorCameras.length}</span>
          <span className="text-[10px] text-slate-400 block mt-1">
            {floorCameras.length === 0 ? 'Sin cámaras registradas' : '100% Vinculadas a Switch'}
          </span>
        </div>

        <div className="p-3 bg-red-50/60 border border-red-200 rounded">
          <span className="text-[10px] text-red-700 uppercase block font-semibold">PUNTOS CIEGOS CRÍTICOS</span>
          <span className="text-xl font-bold text-red-700 block mt-0.5">
            {floorCameras.length === 0 ? '0' : '2'}
          </span>
          <span className="text-[10px] text-red-600 block mt-1">
            {floorCameras.length === 0 ? 'Sin puntos ciegos' : 'Requiere domo de apoyo'}
          </span>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded">
          <span className="text-[10px] text-slate-500 uppercase block">CONSUMO POE TOTAL PISO</span>
          <span className="text-xl font-bold text-slate-900 block mt-0.5">
            {floorCameras.length === 0 ? '0 W' : `${(floorCameras.length * 7.1).toFixed(1)} W`}
          </span>
          <span className="text-[10px] text-slate-400 block mt-1">
            {floorCameras.length === 0 ? 'Sin consumo activo' : 'Switch PoE RCK-ENG-P2-01'}
          </span>
        </div>
      </div>
        </div>

        {/* RIGHT: Selected Device & Controls Inspector */}
        <div className="lg:col-span-4 space-y-6">
          {selectedCam ? (
            <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden font-mono text-xs">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                    DISPOSITIVO SELECCIONADO
                  </span>
                  <span className="text-base font-bold text-blue-700 block">
                    {selectedCam.codigo}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold uppercase">
                    {selectedCam.tipo_camara || selectedCam.tipo_dispositivo || 'Domo'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditing) {
                        setIsEditing(false);
                      } else {
                        handleStartEdit();
                      }
                    }}
                    className="p-1 border border-slate-300 rounded hover:bg-slate-200 text-slate-700"
                    title={isEditing ? 'Cerrar edición' : 'Editar cobertura'}
                  >
                    {isEditing ? <X className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* READ-ONLY VIEW OR DYNAMIC EDIT VIEW */}
              {!isEditing ? (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded border border-slate-200 text-[11px]">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Dirección IP</span>
                      <span className="font-bold text-slate-900">{selectedCam.direccion_ip || 'No asignada'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Ángulo Apertura</span>
                      <span className="font-bold text-blue-700">
                        {selectedCam.tipo_camara === 'ptz' ? '360° Panorámico' : `${selectedCam.apertura_fov || 103}°`}
                      </span>
                    </div>

                    {(selectedCam.tipo_camara === 'domo' || selectedCam.tipo_camara === 'bullet' || !selectedCam.tipo_camara) && (
                      <>
                        <div>
                          <span className="text-slate-500 text-[10px] block">Óptica / Lente</span>
                          <span className="text-slate-800">{selectedCam.lente || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">Azimut Orientación</span>
                          <span className="text-blue-700 font-bold">{selectedCam.azimut ?? 0}°</span>
                        </div>
                      </>
                    )}

                    {selectedCam.tipo_camara === 'ptz' && (
                      <div className="col-span-2">
                        <span className="text-slate-500 text-[10px] block">Zoom Óptico Motorizado</span>
                        <span className="text-blue-700 font-bold">{selectedCam.zoom_optico || 'Motorizado'} (360° Sin Azimut fijo)</span>
                      </div>
                    )}

                    {selectedCam.tipo_camara === 'fisheye' && (
                      <>
                        <div>
                          <span className="text-slate-500 text-[10px] block">Montaje Fisheye</span>
                          <span className="text-slate-800 font-bold">
                            {(selectedCam.apertura_fov ?? 360) >= 360 ? 'Techo (360°)' : 'Muro (180°)'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">Azimut</span>
                          <span className="text-blue-700 font-bold">
                            {(selectedCam.apertura_fov ?? 360) >= 360 ? 'N/A (360° completo)' : `${selectedCam.azimut ?? 0}°`}
                          </span>
                        </div>
                      </>
                    )}

                    {selectedCam.tipo_camara === 'multisensor' && (
                      <>
                        <div>
                          <span className="text-slate-500 text-[10px] block">N° Sensores</span>
                          <span className="text-slate-800 font-bold">{selectedCam.num_sensores || 4}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">Azimut Eje Central</span>
                          <span className="text-blue-700 font-bold">{selectedCam.azimut ?? 0}°</span>
                        </div>
                      </>
                    )}

                    <div className="col-span-2">
                      <span className="text-slate-500 text-[10px] block">Alcance Efectivo Útil</span>
                      <span className="text-slate-800 font-bold">{selectedCam.alcance_metros ? `${selectedCam.alcance_metros} metros` : 'No especificado'}</span>
                    </div>
                  </div>

                  {/* Topología y Enlace Físico Real */}
                  <div className="space-y-1.5 text-[11px] bg-white border border-slate-200 rounded p-3 font-mono">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      TOPOLOGÍA DE CONEXIÓN
                    </span>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Rack Asignado:</span>
                      <span className="font-bold text-slate-800">
                        {selectedCam.rack_id ? (racks.find(r => r.id === selectedCam.rack_id)?.codigo || 'Rack') : 'Sin rack'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Patch Panel / Puerto:</span>
                      <span className="font-bold text-slate-800">
                        {selectedCam.patch_panel_id ? (equipos.find(e => e.id === selectedCam.patch_panel_id)?.codigo || 'PP') : 'Sin PP'} {selectedCam.puerto_patch ? `• P${String(selectedCam.puerto_patch).padStart(2, '0')}` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Switch / Puerto:</span>
                      <span className="text-slate-800">
                        {selectedCam.switch_id ? (equipos.find(e => e.id === selectedCam.switch_id)?.codigo || 'SW') : 'Sin Switch'} {selectedCam.puerto_switch ? `• ${selectedCam.puerto_switch}` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">NVR / Canal:</span>
                      <span className="text-slate-800">
                        {selectedCam.nvr_id ? (equipos.find(e => e.id === selectedCam.nvr_id)?.codigo || 'NVR') : 'Sin NVR'} {selectedCam.canal_nvr ? `• Canal ${selectedCam.canal_nvr}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="py-2 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                      <span>Editar Cobertura</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectCamera(selectedCam)}
                      className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ficha Completa</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* INLINE EDIT MODE - ONLY APPLICABLE CONTROLS */
                <div className="p-4 space-y-3 bg-blue-50/20">
                  <div className="flex items-center justify-between pb-1.5 border-b border-blue-200">
                    <span className="text-[11px] font-bold text-blue-900 uppercase">
                      Edición de Cobertura en Plano
                    </span>
                    <span className="text-[10px] text-blue-600 font-mono">
                      {selectedCam.codigo}
                    </span>
                  </div>

                  {/* Tipo de cámara selector */}
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Tipo de Cámara</label>
                    <select
                      value={editTipo}
                      onChange={(e) => handleTipoChange(e.target.value as TipoCamara)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs font-semibold text-blue-900"
                    >
                      <option value="domo">Cámara Domo Fijo</option>
                      <option value="bullet">Cámara Bullet</option>
                      <option value="ptz">Cámara PTZ Motorizada</option>
                      <option value="fisheye">Cámara Fisheye</option>
                      <option value="multisensor">Cámara Multisensor</option>
                    </select>
                  </div>

                  {/* CONTROLS ONLY FOR DOMO & BULLET */}
                  {(editTipo === 'domo' || editTipo === 'bullet') && (
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Lente / Óptica</label>
                        <input
                          type="text"
                          value={editLente}
                          onChange={(e) => setEditLente(e.target.value)}
                          placeholder="ej. 2.8mm o 4.0mm"
                          className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-600 mb-1">Apertura FOV (°)</label>
                          <input
                            type="number"
                            min="30"
                            max="140"
                            value={editFov}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') setEditFov('' as any);
                              else {
                                const n = parseInt(val, 10);
                                if (!isNaN(n)) setEditFov(n);
                              }
                            }}
                            placeholder="103"
                            className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-600 mb-1">Azimut (0 - 360°)</label>
                          <input
                            type="number"
                            min="0"
                            max="360"
                            value={editAzimut ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') setEditAzimut('' as any);
                              else {
                                const n = parseInt(val, 10);
                                if (!isNaN(n)) setEditAzimut(n);
                              }
                            }}
                            placeholder="90"
                            className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CONTROLS ONLY FOR PTZ */}
                  {editTipo === 'ptz' && (
                    <div className="space-y-2 p-2.5 bg-blue-50 border border-blue-200 rounded">
                      <div>
                        <label className="block text-[11px] text-slate-700 font-semibold mb-1">Zoom Óptico Motorizado</label>
                        <input
                          type="text"
                          value={editZoom}
                          onChange={(e) => setEditZoom(e.target.value)}
                          placeholder="ej. 25x o 32x"
                          className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-xs"
                        />
                      </div>
                      <p className="text-[10px] text-slate-600">
                        Cobertura en círculo continuo de 360°. El azimut es nulo y la apertura se fija en 360°.
                      </p>
                    </div>
                  )}

                  {/* CONTROLS ONLY FOR FISHEYE */}
                  {editTipo === 'fisheye' && (
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-600 mb-1">Modo de Montaje</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditFov(360);
                              setEditAzimut(null);
                            }}
                            className={`py-1 px-2 rounded border text-xs text-center ${
                              Number(editFov) >= 360
                                ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                                : 'bg-white text-slate-700 border-slate-300'
                            }`}
                          >
                            Techo (FOV 360°)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditFov(180);
                              if (editAzimut === null) setEditAzimut(90);
                            }}
                            className={`py-1 px-2 rounded border text-xs text-center ${
                              Number(editFov) < 360
                                ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                                : 'bg-white text-slate-700 border-slate-300'
                            }`}
                          >
                            Muro (FOV 180°)
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-600 mb-1">Apertura FOV (°)</label>
                          <input
                            type="number"
                            min="90"
                            max="360"
                            value={editFov}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                setEditFov('' as any);
                              } else {
                                const num = parseInt(val, 10);
                                if (!isNaN(num)) {
                                  setEditFov(num);
                                  if (num >= 360) setEditAzimut(null);
                                  else if (editAzimut === null) setEditAzimut(90);
                                }
                              }
                            }}
                            placeholder="360"
                            className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-xs font-mono"
                          />
                        </div>
                        {Number(editFov) < 360 && (
                          <div>
                            <label className="block text-[11px] text-slate-600 mb-1">Azimut Muro (°)</label>
                            <input
                              type="number"
                              min="0"
                              max="360"
                              value={editAzimut ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') setEditAzimut('' as any);
                                else {
                                  const n = parseInt(val, 10);
                                  if (!isNaN(n)) setEditAzimut(n);
                                }
                              }}
                              placeholder="90"
                              className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-xs font-mono"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* CONTROLS ONLY FOR MULTISENSOR */}
                  {editTipo === 'multisensor' && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-600 mb-1">N° Sensores</label>
                          <input
                            type="number"
                            min="2"
                            max="8"
                            value={editNumSensores}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') setEditNumSensores('' as any);
                              else {
                                const n = parseInt(val, 10);
                                if (!isNaN(n)) setEditNumSensores(n);
                              }
                            }}
                            placeholder="4"
                            className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-600 mb-1">FOV Total (°)</label>
                          <input
                            type="number"
                            min="90"
                            max="360"
                            value={editFov}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') setEditFov('' as any);
                              else {
                                const n = parseInt(val, 10);
                                if (!isNaN(n)) setEditFov(n);
                              }
                            }}
                            placeholder="180"
                            className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-600 mb-1">Azimut (°)</label>
                          <input
                            type="number"
                            min="0"
                            max="360"
                            value={editAzimut ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') setEditAzimut('' as any);
                              else {
                                const n = parseInt(val, 10);
                                if (!isNaN(n)) setEditAzimut(n);
                              }
                            }}
                            placeholder="90"
                            className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Alcance visual útil (común a todos) */}
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Alcance Útil (metros)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="5"
                      max="80"
                      value={editAlcance}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') setEditAlcance('' as any);
                        else {
                          const n = parseFloat(val);
                          if (!isNaN(n)) setEditAlcance(n);
                        }
                      }}
                      placeholder="18.5"
                      className="w-full px-2.5 py-1 border border-slate-300 rounded bg-white text-xs font-mono"
                    />
                  </div>

                  {/* Botones de acción guardar/cancelar */}
                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={savingEdit}
                      onClick={handleSaveCoverage}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-xs shadow-xs disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingEdit ? 'Guardando...' : 'Aplicar Cambios'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : floorCameras.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-slate-500 font-mono text-xs space-y-3 shadow-xs">
              <Camera className="w-10 h-10 text-slate-300 mx-auto" />
              <div>
                <p className="font-bold text-slate-800 text-sm">Sin Cámaras en este Piso</p>
                <p className="text-slate-500 text-[11px] mt-1 font-sans">
                  Aún no se han registrado cámaras de seguridad en {selectedPiso?.nombre || 'este nivel'}.
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateToRegistration}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar Primera Cámara</span>
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-slate-400 font-mono text-xs">
              Haga clic sobre un nodo de cámara en el plano para examinar sus especificaciones de cobertura.
            </div>
          )}

          {/* Blind Spots Identified Box */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs font-mono text-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Puntos Ciegos Detectados</span>
              </h3>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                floorCameras.length === 0 
                  ? 'bg-slate-100 text-slate-600' 
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {floorCameras.length === 0 ? 'Sin Datos' : '2 Críticos'}
              </span>
            </div>

            {floorCameras.length === 0 ? (
              <p className="text-slate-400 text-xs py-2 font-sans">
                No hay cámaras instaladas en este nivel para analizar zonas de sombra o puntos ciegos.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-red-50/50 border border-red-200 rounded space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <strong className="text-red-900 font-bold">Acceso Escalera Emergencia B</strong>
                    <span className="text-red-700 font-bold">34.5 m²</span>
                  </div>
                  <p className="text-[10px] text-slate-600 font-sans leading-relaxed">
                    Obstrucción visual por muro de carga estructural. El recorrido hacia salida de incendio queda oculto para CAM-ENG-P2-08 y CAM-ENG-P2-06.
                  </p>
                  <div className="pt-1 text-[10px] flex items-center justify-between text-blue-700 font-bold">
                    <span>Acción Recomendada:</span>
                    <span>+ Instalar Mini Domo 2.8mm</span>
                  </div>
                </div>

                <div className="p-3 bg-amber-50/50 border border-amber-200 rounded space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <strong className="text-amber-900 font-bold">Acceso Lateral Pasillo Este</strong>
                    <span className="text-amber-700 font-bold">18.2 m²</span>
                  </div>
                  <p className="text-[10px] text-slate-600 font-sans leading-relaxed">
                    Final de alcance efectivo de resolución facial para CAM-ENG-P2-04 (&gt;28 metros de tiro óptico).
                  </p>
                  <div className="pt-1 text-[10px] flex items-center justify-between text-blue-700 font-bold">
                    <span>Acción Recomendada:</span>
                    <span>Reorientar tiro óptico a 85°</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Toast Notification */}
      {planToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl border border-slate-700 text-xs font-mono flex items-center gap-2.5 animate-in slide-in-from-bottom-2 duration-150">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{planToast}</span>
          <button 
            type="button" 
            onClick={() => setPlanToast(null)} 
            className="text-slate-400 hover:text-white ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MODAL: GESTIÓN DE PLANO ARQUITECTÓNICO (CLOUDINARY / URL / ARCHIVO LOCAL) */}
      {planModalOpen && selectedPiso && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 font-mono">
                      Vincular o Subir Plano Arquitectónico
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                      {selectedPiso.nombre}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {currentEd?.nombre || 'Edificio'} · {currentCamp?.nombre || 'Campus'}
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setPlanModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-md hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-5 text-xs font-sans max-h-[75vh] overflow-y-auto">
              {/* Tab Selector: Cloudinary/URL vs Subir Archivo Local */}
              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg border border-slate-200 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setPlanTab('url')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md transition-all font-semibold ${
                    planTab === 'url'
                      ? 'bg-white text-blue-700 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>Enlace Cloudinary / URL Web</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPlanTab('upload')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md transition-all font-semibold ${
                    planTab === 'upload'
                      ? 'bg-white text-blue-700 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>Subir Archivo de Imagen</span>
                </button>
              </div>

              {/* TAB 1: CLOUDINARY / URL EN LA NUBE */}
              {planTab === 'url' && (
                <div className="space-y-4 animate-in fade-in duration-100">
                  <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-[11px] text-blue-900 leading-relaxed font-sans">
                    <p className="font-semibold flex items-center gap-1.5 text-blue-950 mb-1">
                      <Link2 className="w-3.5 h-3.5 text-blue-700" />
                      <span>Integración con Servicios Cloud (Cloudinary, AWS S3, Imgur o CDN)</span>
                    </p>
                    <span>
                      Pega el link directo a la imagen arquitectónica (JPG, PNG, WebP o SVG). La imagen se cargará de inmediato para proyectar la planimetría y el cálculo de conos de cobertura FOV.
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-mono font-semibold text-slate-800">
                        Enlace Directo de la Imagen *
                      </label>
                      <button
                        type="button"
                        onClick={handlePasteFromClipboard}
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-600 hover:text-blue-800 font-semibold"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedNotification ? '¡Pegado!' : 'Pegar de Portapapeles'}</span>
                      </button>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="url"
                        value={planInputUrl}
                        onChange={(e) => {
                          setPlanInputUrl(e.target.value);
                          setPlanUrlPreviewError(false);
                          setPlanUrlLoaded(false);
                        }}
                        placeholder="https://res.cloudinary.com/usuario/image/upload/v1/planos/piso2.png"
                        className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-lg font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white"
                      />
                      {planInputUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setPlanInputUrl('');
                            setPlanUrlPreviewError(false);
                            setPlanUrlLoaded(false);
                          }}
                          className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                          title="Limpiar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Ejemplos y sugerencias rápidas */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[10px]">
                    <span className="text-slate-500 font-medium">Ejemplos para probar:</span>
                    <button
                      type="button"
                      onClick={handleSetExampleCloudinary}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 transition-colors"
                    >
                      ☁️ Demo Cloudinary
                    </button>
                    <button
                      type="button"
                      onClick={handleSetVectorBlueprint}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 transition-colors"
                    >
                      📐 Demo Plano SVG
                    </button>
                  </div>

                  {/* Vista Previa de la URL ingresada */}
                  {planInputUrl && (
                    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="font-semibold text-slate-700">Vista Previa de Enlace:</span>
                        {planUrlLoaded && (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1 text-[10px]">
                            <CheckCircle className="w-3 h-3" />
                            <span>Imagen verificada {planUrlDimensions ? `(${planUrlDimensions.width}×${planUrlDimensions.height}px)` : ''}</span>
                          </span>
                        )}
                        {planUrlPreviewError && (
                          <span className="text-red-600 font-semibold flex items-center gap-1 text-[10px]">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Error al cargar imagen</span>
                          </span>
                        )}
                      </div>

                      <div className="w-full h-44 bg-white border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center p-2 relative">
                        <img 
                          src={planInputUrl} 
                          alt="Vista previa de plano"
                          crossOrigin="anonymous"
                          className="max-w-full max-h-full object-contain"
                          onLoad={(e) => {
                            setPlanUrlLoaded(true);
                            setPlanUrlPreviewError(false);
                            const img = e.currentTarget;
                            setPlanUrlDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                          }}
                          onError={() => {
                            setPlanUrlPreviewError(true);
                            setPlanUrlLoaded(false);
                          }}
                        />
                        {planUrlPreviewError && (
                          <div className="absolute inset-0 bg-red-50/90 flex flex-col items-center justify-center p-4 text-center font-mono">
                            <AlertTriangle className="w-6 h-6 text-red-500 mb-1" />
                            <p className="font-bold text-red-800 text-xs">No se pudo visualizar la imagen</p>
                            <p className="text-[10px] text-red-600 mt-0.5 max-w-xs font-sans">
                              Verifica que el link de Cloudinary u hosting sea público y apunte directamente al archivo (.png, .jpg, .svg).
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SUBIR ARCHIVO LOCAL */}
              {planTab === 'upload' && (
                <div className="space-y-4 animate-in fade-in duration-100">
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50/60 hover:bg-slate-50 transition-colors">
                    <input
                      type="file"
                      id="planFileInput"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <label 
                      htmlFor="planFileInput" 
                      className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                    >
                      <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-slate-800 font-mono">
                          {uploadedFileName || 'Haz clic para seleccionar o arrastra un archivo'}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Formatos admitidos: PNG, JPG, JPEG, WebP, SVG (Máximo 8 MB)
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-md font-semibold text-xs shadow-2xs mt-2">
                        Examinar Archivo...
                      </span>
                    </label>
                  </div>

                  {/* Vista previa de archivo local */}
                  {uploadedFileBase64 && (
                    <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="font-semibold text-slate-700">Archivo Preparado:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedFileBase64(null);
                            setUploadedFileName(null);
                          }}
                          className="text-red-600 hover:underline text-[10px]"
                        >
                          Quitar archivo
                        </button>
                      </div>
                      <div className="w-full h-44 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center p-2">
                        <img 
                          src={uploadedFileBase64} 
                          alt="Vista previa archivo local" 
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <p className="text-[10px] font-mono text-slate-500 truncate">
                        {uploadedFileName ? `Nombre: ${uploadedFileName}` : 'Archivo convertido a Base64'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* SECCIÓN COMÚN: ESCALA DE CALIBRACIÓN CAD */}
              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-mono font-semibold text-slate-800">
                    Escala de Calibración CAD (para cálculo de FOV y Metros)
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">Norma TIA-606-C</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={planInputScale}
                    onChange={(e) => setPlanInputScale(e.target.value)}
                    placeholder="1m = 32px"
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-600 bg-white"
                  />
                  <div className="flex items-center gap-1 font-mono text-[10px]">
                    <button
                      type="button"
                      onClick={() => setPlanInputScale('1m = 32px')}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                    >
                      1m = 32px
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanInputScale('1m = 25px')}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                    >
                      1m = 25px
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanInputScale('1m = 50px')}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                    >
                      1m = 50px
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 font-sans">
                  Define cuántos píxeles en el lienzo equivalen a un metro real para proyectar los radios de tiro óptico de cada cámara.
                </p>
              </div>

              {/* PLANO ACTUALMENTE ASIGNADO & DESVINCULAR */}
              {selectedPiso.plano_url && (
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="w-8 h-8 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <CheckCircle className="w-4 h-4" />
                    </div>
                    <div className="overflow-hidden font-mono text-[11px]">
                      <p className="font-semibold text-slate-800">Plano Actualmente Asignado</p>
                      <p className="text-slate-500 text-[10px] truncate max-w-sm">
                        {selectedPiso.plano_url.startsWith('data:') ? 'Imagen local en Base64' : selectedPiso.plano_url}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedPiso.plano_url.startsWith('http') && (
                      <a
                        href={selectedPiso.plano_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 text-[11px] font-mono text-blue-700 hover:bg-blue-50 border border-blue-200 rounded transition-colors"
                      >
                        Abrir Link ↗
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={savingPlanUrl}
                      onClick={handleRemoveFloorPlan}
                      className="px-2.5 py-1 text-[11px] font-mono text-red-600 hover:bg-red-50 border border-red-200 rounded transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Desvincular</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPlanModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 text-xs font-semibold font-mono"
              >
                Cancelar
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingPlanUrl || (planTab === 'url' ? !planInputUrl.trim() : !uploadedFileBase64)}
                  onClick={handleSavePlan}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold font-mono shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingPlanUrl ? 'Guardando Plano...' : 'Guardar y Aplicar Plano'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
