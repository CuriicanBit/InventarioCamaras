import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Save, 
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
  Check, 
  AlertCircle, 
  Plus, 
  Info,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
  Sede, 
  Campus, 
  Edificio, 
  Piso, 
  Rack, 
  Equipo, 
  Proveedor, 
  Marca, 
  Modelo, 
  PuntoRed, 
  TipoPuntoRed, 
  CategoriaCable,
  PuertoSwitchOcupacion
} from '../types/database';
import { MarcaSelect, ModeloSelect, ProveedorSelect } from './catalogs/CatalogSelectors';
import { NodeFormModal } from './TreeNodeModals';
import { NodeLevel } from '../utils/treeHierarchy';

interface NetworkPointFormProps {
  initialPoint?: PuntoRed | null;
  onSuccess: (newPointId?: string) => void;
  onCancel: () => void;
}

export const NetworkPointForm: React.FC<NetworkPointFormProps> = ({
  initialPoint,
  onSuccess,
  onCancel,
}) => {
  const isEditing = Boolean(initialPoint?.id);

  // Cascading hierarchy options
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [campusList, setCampusList] = useState<Campus[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [allEquipos, setAllEquipos] = useState<Equipo[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Switch ports and occupation
  const [switchPorts, setSwitchPorts] = useState<PuertoSwitchOcupacion[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(false);

  // Modal for quick node creation
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

  // Form Fields
  const [tipoPunto, setTipoPunto] = useState<TipoPuntoRed>(initialPoint?.tipo_punto || 'datos_funcionario');
  const [codigo, setCodigo] = useState<string>(initialPoint?.codigo || '');
  const [ubicacionEspecifica, setUbicacionEspecifica] = useState<string>(initialPoint?.ubicacion_especifica || '');

  // Cascading selections
  const [selectedSedeId, setSelectedSedeId] = useState<string>('');
  const [selectedCampusId, setSelectedCampusId] = useState<string>('');
  const [selectedEdificioId, setSelectedEdificioId] = useState<string>('');
  const [selectedPisoId, setSelectedPisoId] = useState<string>(initialPoint?.piso_id || '');

  // Connectivity
  const [selectedRackId, setSelectedRackId] = useState<string>(initialPoint?.rack_id || '');
  const [selectedPatchPanelId, setSelectedPatchPanelId] = useState<string>(initialPoint?.patch_panel_id || '');
  const [puertoPatch, setPuertoPatch] = useState<string>(initialPoint?.puerto_patch ? String(initialPoint.puerto_patch) : '1');
  const [selectedSwitchId, setSelectedSwitchId] = useState<string>(initialPoint?.switch_id || '');
  const [selectedPuertoSwitchId, setSelectedPuertoSwitchId] = useState<string>(initialPoint?.puerto_switch_id || '');
  const [categoriaCable, setCategoriaCable] = useState<CategoriaCable>(initialPoint?.categoria_cable || 'cat6');

  // AP Hardware (only for wifi_ap)
  const [marcaId, setMarcaId] = useState<string | null>(initialPoint?.marca_id || null);
  const [modeloId, setModeloId] = useState<string | null>(initialPoint?.modelo_id || null);
  const [numeroSerie, setNumeroSerie] = useState<string>(initialPoint?.numero_serie || '');
  const [direccionMac, setDireccionMac] = useState<string>(initialPoint?.direccion_mac || '');
  const [direccionIp, setDireccionIp] = useState<string>(initialPoint?.direccion_ip || '');

  // Acquisition and Installation
  const [fechaCompra, setFechaCompra] = useState<string>(initialPoint?.fecha_compra || new Date().toISOString().slice(0, 10));
  const [proveedorCompraId, setProveedorCompraId] = useState<string>(initialPoint?.proveedor_compra_id || '');
  const [fechaInstalacion, setFechaInstalacion] = useState<string>(initialPoint?.fecha_instalacion || new Date().toISOString().slice(0, 10));
  const [proveedorInstalacionId, setProveedorInstalacionId] = useState<string>(initialPoint?.proveedor_instalacion_id || '');

  // Status and submission
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Generate suggested code if creating new
  const suggestCode = (type: TipoPuntoRed) => {
    const prefix = type === 'wifi_ap' ? 'AP-WIFI' : type === 'datos_funcionario' ? 'PR-FUNC' : 'PR-ALUM';
    const rand = Math.floor(10 + Math.random() * 89);
    return `${prefix}-${rand}`;
  };

  useEffect(() => {
    if (!isEditing && !codigo) {
      setCodigo(suggestCode(tipoPunto));
    }
  }, [tipoPunto, isEditing]);

  // Load all initial tables
  const loadFormData = async () => {
    try {
      setLoadingInitial(true);
      const [
        { data: sData },
        { data: cData },
        { data: edData },
        { data: pData },
        { data: rData },
        { data: eqData },
        { data: marcasData },
        { data: modelosData },
        { data: provData }
      ] = await Promise.all([
        supabase.from('sedes').select('*').order('nombre'),
        supabase.from('campus').select('*').order('nombre'),
        supabase.from('edificios').select('*').order('nombre'),
        supabase.from('pisos').select('*').order('nombre'),
        supabase.from('racks').select('*').order('codigo'),
        supabase.from('equipos').select('*').order('codigo'),
        supabase.from('marcas').select('*').order('nombre'),
        supabase.from('modelos').select('*').order('nombre'),
        supabase.from('proveedores').select('*').order('nombre'),
      ]);

      const loadedSedes = sData || [];
      const loadedCampus = cData || [];
      const loadedEdificios = edData || [];
      const loadedPisos = pData || [];
      const loadedRacks = rData || [];

      setSedes(loadedSedes);
      setCampusList(loadedCampus);
      setEdificios(loadedEdificios);
      setPisos(loadedPisos);
      setRacks(loadedRacks);
      setAllEquipos(eqData || []);
      setMarcas(marcasData || []);
      setModelos(modelosData || []);
      setProveedores(provData || []);

      // If initialPoint exists or editing, reconstruct cascade IDs
      if (initialPoint?.piso_id) {
        const foundPiso = loadedPisos.find(p => p.id === initialPoint.piso_id);
        if (foundPiso) {
          setSelectedPisoId(foundPiso.id);
          const foundEd = loadedEdificios.find(e => e.id === foundPiso.edificio_id);
          if (foundEd) {
            setSelectedEdificioId(foundEd.id);
            const foundCamp = loadedCampus.find(c => c.id === foundEd.campus_id);
            if (foundCamp) {
              setSelectedCampusId(foundCamp.id);
              const foundSede = loadedSedes.find(s => s.id === foundCamp.sede_id);
              if (foundSede) setSelectedSedeId(foundSede.id);
            }
          }
        }
      } else if (loadedPisos.length > 0) {
        // Default cascade to first piso
        const firstP = loadedPisos[0];
        setSelectedPisoId(firstP.id);
        const firstEd = loadedEdificios.find(e => e.id === firstP.edificio_id);
        if (firstEd) {
          setSelectedEdificioId(firstEd.id);
          const firstCamp = loadedCampus.find(c => c.id === firstEd.campus_id);
          if (firstCamp) {
            setSelectedCampusId(firstCamp.id);
            const firstSede = loadedSedes.find(s => s.id === firstCamp.sede_id);
            if (firstSede) setSelectedSedeId(firstSede.id);
          }
        }
      }

      // If editing or existing rack, ensure selected rack
      if (initialPoint?.rack_id) {
        setSelectedRackId(initialPoint.rack_id);
      } else if (loadedRacks.length > 0) {
        setSelectedRackId(loadedRacks[0].id);
      }
    } catch (err) {
      console.error('Error loading form data for puntos_red:', err);
      setErrorMsg('Error al cargar la información inicial.');
    } finally {
      setLoadingInitial(false);
    }
  };

  useEffect(() => {
    loadFormData();
  }, []);

  // Filtered dropdowns for cascading location
  const filteredCampus = campusList.filter(c => !selectedSedeId || c.sede_id === selectedSedeId);
  const filteredEdificios = edificios.filter(e => !selectedCampusId || e.campus_id === selectedCampusId);
  const filteredPisos = pisos.filter(p => !selectedEdificioId || p.edificio_id === selectedEdificioId);

  // Auto-sync cascade when higher level changes
  const handleSedeChange = (sedeId: string) => {
    setSelectedSedeId(sedeId);
    const validCamp = campusList.filter(c => c.sede_id === sedeId);
    const nextCampId = validCamp[0]?.id || '';
    setSelectedCampusId(nextCampId);

    const validEd = edificios.filter(e => e.campus_id === nextCampId);
    const nextEdId = validEd[0]?.id || '';
    setSelectedEdificioId(nextEdId);

    const validPisos = pisos.filter(p => p.edificio_id === nextEdId);
    const nextPisoId = validPisos[0]?.id || '';
    setSelectedPisoId(nextPisoId);
  };

  const handleCampusChange = (campId: string) => {
    setSelectedCampusId(campId);
    const validEd = edificios.filter(e => e.campus_id === campId);
    const nextEdId = validEd[0]?.id || '';
    setSelectedEdificioId(nextEdId);

    const validPisos = pisos.filter(p => p.edificio_id === nextEdId);
    const nextPisoId = validPisos[0]?.id || '';
    setSelectedPisoId(nextPisoId);
  };

  const handleEdificioChange = (edId: string) => {
    setSelectedEdificioId(edId);
    const validPisos = pisos.filter(p => p.edificio_id === edId);
    setSelectedPisoId(validPisos[0]?.id || '');
  };

  // Filter equipment in selected rack
  const rackEquipos = allEquipos.filter(e => !selectedRackId || e.rack_id === selectedRackId);
  const patchPanels = rackEquipos.filter(e => e.tipo === 'patch_panel');
  const switches = rackEquipos.filter(e => e.tipo === 'switch');

  // Set default patch panel and switch when rack changes
  useEffect(() => {
    if (patchPanels.length > 0 && (!selectedPatchPanelId || !patchPanels.some(p => p.id === selectedPatchPanelId))) {
      setSelectedPatchPanelId(patchPanels[0].id);
    }
    if (switches.length > 0 && (!selectedSwitchId || !switches.some(s => s.id === selectedSwitchId))) {
      setSelectedSwitchId(switches[0].id);
    }
  }, [selectedRackId, allEquipos]);

  // Load ports for selected switch using v_puertos_switch_ocupacion
  useEffect(() => {
    if (!selectedSwitchId) {
      setSwitchPorts([]);
      return;
    }

    const loadPorts = async () => {
      try {
        setLoadingPorts(true);
        // Query v_puertos_switch_ocupacion for accurate occupation status (ONLY RJ45 ports, exclude SFP)
        const { data, error } = await supabase
          .from('v_puertos_switch_ocupacion')
          .select('*')
          .eq('switch_id', selectedSwitchId)
          .order('numero_puerto');

        if (error) throw error;
        // Exclude SFP ports - network points are final devices that only connect to RJ45
        const rj45Ports = (data || []).filter(p => p.tipo_puerto !== 'sfp');
        setSwitchPorts(rj45Ports);

        // If no port selected yet or port doesn't belong to switch, select first available
        if (!selectedPuertoSwitchId || !rj45Ports.some(p => p.puerto_switch_id === selectedPuertoSwitchId)) {
          const firstAvailable = rj45Ports.find(
            p => !p.ocupado_por_codigo || (isEditing && p.puerto_switch_id === initialPoint?.puerto_switch_id)
          );
          if (firstAvailable) {
            setSelectedPuertoSwitchId(firstAvailable.puerto_switch_id);
          }
        }
      } catch (err) {
        console.error('Error loading switch ports from v_puertos_switch_ocupacion:', err);
      } finally {
        setLoadingPorts(false);
      }
    };

    loadPorts();
  }, [selectedSwitchId, isEditing, initialPoint?.puerto_switch_id]);

  // Handle Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanCodigo = codigo.trim();
    if (!cleanCodigo) {
      setErrorMsg('El código del punto de red es obligatorio.');
      return;
    }
    if (!selectedPisoId) {
      setErrorMsg('Debe seleccionar la ubicación física (Piso) del punto.');
      return;
    }
    if (!selectedRackId) {
      setErrorMsg('Debe seleccionar el Rack de conexión.');
      return;
    }
    if (!selectedSwitchId) {
      setErrorMsg('Debe seleccionar el Switch de distribución.');
      return;
    }
    if (!selectedPuertoSwitchId) {
      setErrorMsg('Debe seleccionar un puerto de switch válido.');
      return;
    }

    // Verify port isn't occupied by someone else
    const targetPort = switchPorts.find(p => p.puerto_switch_id === selectedPuertoSwitchId);
    if (targetPort && targetPort.ocupado_por_codigo) {
      const isMyOwnPort = isEditing && initialPoint?.puerto_switch_id === selectedPuertoSwitchId;
      if (!isMyOwnPort) {
        setErrorMsg(`El puerto ${targetPort.numero_puerto} ya está ocupado por ${targetPort.ocupado_por_codigo} (${targetPort.ocupado_por_tipo}). Seleccione otro puerto.`);
        return;
      }
    }

    try {
      setSaving(true);

      const payload: any = {
        codigo: cleanCodigo,
        tipo_punto: tipoPunto,
        piso_id: selectedPisoId || null,
        ubicacion_especifica: ubicacionEspecifica.trim() || null,
        rack_id: selectedRackId || null,
        patch_panel_id: selectedPatchPanelId || null,
        puerto_patch: puertoPatch ? parseInt(puertoPatch) : null,
        switch_id: selectedSwitchId || null,
        puerto_switch_id: selectedPuertoSwitchId || null,
        categoria_cable: categoriaCable,
        fecha_compra: fechaCompra || null,
        proveedor_compra_id: proveedorCompraId || null,
        fecha_instalacion: fechaInstalacion || null,
        proveedor_instalacion_id: proveedorInstalacionId || null,
        estado_ciclo_vida: initialPoint?.estado_ciclo_vida || 'instalado',
      };

      // If AP WiFi, include hardware fields; otherwise set them to null
      if (tipoPunto === 'wifi_ap') {
        payload.marca_id = marcaId || null;
        payload.modelo_id = modeloId || null;
        payload.numero_serie = numeroSerie.trim() || null;
        payload.direccion_mac = direccionMac.trim() || null;
        payload.direccion_ip = direccionIp.trim() || null;
      } else {
        payload.marca_id = null;
        payload.modelo_id = null;
        payload.numero_serie = null;
        payload.direccion_mac = null;
        payload.direccion_ip = null;
      }

      let savedId = initialPoint?.id;

      if (isEditing && initialPoint?.id) {
        const { error: updateErr } = await supabase
          .from('puntos_red')
          .update(payload)
          .eq('id', initialPoint.id);

        if (updateErr) throw updateErr;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('puntos_red')
          .insert([payload])
          .select()
          .single();

        if (insertErr) throw insertErr;
        savedId = inserted.id;

        // Auto-register initial installation event in bitácora
        if (savedId) {
          try {
            await supabase.from('historial_mantenimiento').insert([{
              entidad_tipo: 'punto_red',
              entidad_id: savedId,
              tipo_intervencion: 'instalacion',
              fecha: new Date(fechaInstalacion || new Date()).toISOString(),
              tecnico_responsable: 'Cuadrilla Terreno Infraestructura',
              descripcion: `Registro inicial en terreno de punto de red [${cleanCodigo}]. Tipo: ${tipoPunto === 'wifi_ap' ? 'Access Point WiFi' : (tipoPunto === 'datos_funcionario' ? 'Datos Funcionario' : 'Datos Alumno')}. Categoría de cable: ${categoriaCable.toUpperCase()}.`,
              ticket_referencia: `REG-${cleanCodigo}`,
            }]);
          } catch (histErr) {
            console.warn('Could not auto-insert initial maintenance record:', histErr);
          }
        }
      }

      onSuccess(savedId);
    } catch (err: any) {
      console.error('Error saving punto_red:', err);
      setErrorMsg(err.message || 'Error al guardar el punto de red. Verifique los datos ingresados.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-slate-500 font-mono text-xs">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p>Cargando catálogo y topología para registro de punto de red...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6">
      {/* Header & Back Button */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                {tipoPunto === 'wifi_ap' ? <Wifi className="w-4 h-4" /> : <Network className="w-4 h-4" />}
              </span>
              <h1 className="text-xl font-bold font-mono text-slate-900 tracking-tight">
                {isEditing ? `Editar Punto de Red · ${initialPoint?.codigo}` : 'Registro de Punto de Red en Terreno'}
              </h1>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Puntos de datos para funcionarios, alumnos y access points WiFi institucionales (Norma TIA-568/606)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 border border-slate-300 rounded text-xs font-mono text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Guardando...' : (isEditing ? 'Actualizar Ficha' : 'Guardar Punto de Red')}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 font-mono text-xs">
        {/* SECCIÓN 1: TIPO DE PUNTO & IDENTIFICACIÓN */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>1. Tipo de Punto & Código de Identificación *</span>
            </h2>
            <span className="text-[10px] text-slate-400">Norma TIA-606-C</span>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-2">
              Tipo de Punto de Red *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Opción 1: Datos Funcionario */}
              <button
                type="button"
                onClick={() => setTipoPunto('datos_funcionario')}
                className={`p-3 rounded-lg border text-left transition-all flex items-start gap-3 cursor-pointer ${
                  tipoPunto === 'datos_funcionario'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}
              >
                <div className={`p-2 rounded shrink-0 ${tipoPunto === 'datos_funcionario' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs">Datos Funcionario</div>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                    Punto pasivo de red RJ-45 para estaciones de trabajo docentes y administrativas.
                  </p>
                </div>
              </button>

              {/* Opción 2: Datos Alumno */}
              <button
                type="button"
                onClick={() => setTipoPunto('datos_alumno')}
                className={`p-3 rounded-lg border text-left transition-all flex items-start gap-3 cursor-pointer ${
                  tipoPunto === 'datos_alumno'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-900 ring-2 ring-emerald-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}
              >
                <div className={`p-2 rounded shrink-0 ${tipoPunto === 'datos_alumno' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs">Datos Alumno</div>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                    Punto de red en laboratorios docentes, bibliotecas o mesones de estudio.
                  </p>
                </div>
              </button>

              {/* Opción 3: AP WiFi */}
              <button
                type="button"
                onClick={() => setTipoPunto('wifi_ap')}
                className={`p-3 rounded-lg border text-left transition-all flex items-start gap-3 cursor-pointer ${
                  tipoPunto === 'wifi_ap'
                    ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 ring-2 ring-indigo-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                }`}
              >
                <div className={`p-2 rounded shrink-0 ${tipoPunto === 'wifi_ap' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs">AP WiFi</div>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                    Access Point inalámbrico para cobertura de campus. Requiere registrar hardware activo.
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Código del Punto *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  placeholder="ej. PR-FUNC-01, AP-WIFI-04"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono font-bold text-slate-900 focus:ring-1 focus:ring-blue-600"
                />
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setCodigo(suggestCode(tipoPunto))}
                    className="px-2 py-1.5 border border-slate-300 rounded bg-slate-50 hover:bg-slate-100 text-[10px] text-slate-600 whitespace-nowrap"
                    title="Generar código sugerido"
                  >
                    Auto
                  </button>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Identificador único grabado en la placa frontal o etiqueta de terreno.
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Categoría de Cable de Par Trenzado *
              </label>
              <select
                value={categoriaCable}
                onChange={(e) => setCategoriaCable(e.target.value as CategoriaCable)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
              >
                <option value="cat6">Cat6 (Estándar Gigabit UTP)</option>
                <option value="cat6a">Cat6A (10-Gigabit Apantallado / F/UTP)</option>
              </select>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Estándar de certificación del enlace permanente.
              </span>
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: UBICACIÓN FÍSICA EN CASCADA */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>2. Ubicación en Cascada (Sede &gt; Campus &gt; Edificio &gt; Piso) *</span>
            </h2>
            <button
              type="button"
              onClick={() => openTreeModal('sede')}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>+ Nueva Sede / Edificio</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 mb-1 uppercase font-semibold">1. Sede *</label>
              <select
                value={selectedSedeId}
                onChange={(e) => handleSedeChange(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
              >
                {sedes.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 mb-1 uppercase font-semibold">2. Campus *</label>
              <select
                value={selectedCampusId}
                onChange={(e) => handleCampusChange(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
              >
                {filteredCampus.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 mb-1 uppercase font-semibold">3. Edificio *</label>
              <select
                value={selectedEdificioId}
                onChange={(e) => handleEdificioChange(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
              >
                {filteredEdificios.map(ed => (
                  <option key={ed.id} value={ed.id}>{ed.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 mb-1 uppercase font-semibold">4. Piso / Nivel *</label>
              <select
                value={selectedPisoId}
                onChange={(e) => setSelectedPisoId(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600 font-bold text-slate-900"
              >
                {filteredPisos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              Ubicación Específica en Terreno
            </label>
            <input
              type="text"
              value={ubicacionEspecifica}
              onChange={(e) => setUbicacionEspecifica(e.target.value)}
              placeholder="ej. Oficina 204, Mesón lateral biblioteca, Cielo falso frente a sala 102"
              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Detalle descriptivo para facilitar al técnico encontrar el punto físico.
            </span>
          </div>
        </div>

        {/* SECCIÓN 3: CONEXIÓN FÍSICA Y RED (RACK, PATCH PANEL, SWITCH Y PUERTO) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>3. Conexión de Telecomunicaciones (Rack &gt; Patch Panel &gt; Switch) *</span>
            </h2>
            <span className="text-[10px] text-slate-400">Validación de ocupación en tiempo real</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Rack selector */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-blue-600" />
                <span>Rack / Gabinete Distribuidor *</span>
              </label>
              <select
                value={selectedRackId}
                onChange={(e) => setSelectedRackId(e.target.value)}
                required
                className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600 font-semibold"
              >
                <option value="">Seleccione un rack...</option>
                {racks.map(r => (
                  <option key={r.id} value={r.id}>
                    Rack {r.codigo} {r.ubicacion_especifica ? `(${r.ubicacion_especifica})` : ''} - {r.altura_u}U
                  </option>
                ))}
              </select>
            </div>

            {/* Patch Panel & Puerto */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-600" />
                <span>Patch Panel & Puerto Patch *</span>
              </label>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-8">
                  <select
                    value={selectedPatchPanelId}
                    onChange={(e) => setSelectedPatchPanelId(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
                  >
                    <option value="">Seleccione Patch Panel...</option>
                    {patchPanels.map(pp => (
                      <option key={pp.id} value={pp.id}>
                        {pp.codigo} ({pp.puertos_totales || 24}P) {pp.marca ? `· ${pp.marca}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-4">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-slate-400 text-[10px]">P#</span>
                    <input
                      type="number"
                      min={1}
                      max={96}
                      value={puertoPatch}
                      onChange={(e) => setPuertoPatch(e.target.value)}
                      placeholder="1"
                      className="w-full pl-7 pr-2 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono text-center font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Switch selector */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-blue-600" />
                <span>Switch de Acceso *</span>
              </label>
              <select
                value={selectedSwitchId}
                onChange={(e) => setSelectedSwitchId(e.target.value)}
                required
                className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600 font-semibold"
              >
                <option value="">Seleccione Switch...</option>
                {switches.map(sw => (
                  <option key={sw.id} value={sw.id}>
                    {sw.codigo} ({sw.marca || 'Switch'} {sw.modelo || ''}) - {sw.puertos_totales || 24} Puertos
                  </option>
                ))}
              </select>
            </div>

            {/* Puerto de Switch (from puertos_switch and v_puertos_switch_ocupacion) */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-blue-600" />
                  <span>Puerto de Switch *</span>
                </span>
                {loadingPorts && (
                  <span className="text-[10px] text-blue-600 animate-pulse">Cargando puertos...</span>
                )}
              </label>
              
              <select
                value={selectedPuertoSwitchId}
                onChange={(e) => setSelectedPuertoSwitchId(e.target.value)}
                required
                disabled={loadingPorts || switchPorts.length === 0}
                className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600 font-semibold disabled:bg-slate-100"
              >
                <option value="">Seleccione un puerto...</option>
                {switchPorts.map(p => {
                  const isCurrentPointPort = isEditing && initialPoint?.puerto_switch_id === p.puerto_switch_id;
                  const isOccupied = Boolean(p.ocupado_por_codigo) && !isCurrentPointPort;

                  let label = `Puerto ${p.numero_puerto}`;
                  const vNum = p.vlan_numero ?? p.vlan;
                  if (vNum) label += ` (VLAN ${vNum}${p.vlan_nombre ? ` - ${p.vlan_nombre}` : ''})`;
                  if (p.uso) label += ` [${p.uso}]`;

                  if (isCurrentPointPort) {
                    label += ` · ✓ ASIGNADO A ESTE PUNTO`;
                  } else if (isOccupied) {
                    label += ` · ✗ OCUPADO POR ${p.ocupado_por_codigo} (${p.ocupado_por_tipo === 'camara' ? 'Cámara' : 'Punto Red'})`;
                  } else {
                    label += ` · Disponible`;
                  }

                  return (
                    <option 
                      key={p.puerto_switch_id} 
                      value={p.puerto_switch_id}
                      disabled={isOccupied}
                      className={isOccupied ? 'text-slate-400 bg-slate-50' : 'text-slate-900 font-bold'}
                    >
                      {label}
                    </option>
                  );
                })}
              </select>

              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                <span>Total: {switchPorts.length} puertos en switch</span>
                <span className="text-emerald-700 font-semibold">
                  Disponibles: {switchPorts.filter(p => !p.ocupado_por_codigo || (isEditing && p.puerto_switch_id === initialPoint?.puerto_switch_id)).length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SECCIÓN 4: HARDWARE DE ACCESS POINT (SOLO SI ES AP WIFI) O AVISO DE PUNTO PASIVO */}
        {tipoPunto === 'wifi_ap' ? (
          <div className="bg-indigo-50/40 border border-indigo-200 rounded-lg p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-200 pb-2">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-indigo-700" />
                <h2 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                  4. Hardware de Access Point WiFi (Equipo Activo)
                </h2>
              </div>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold">
                tipo_equipo = 'access_point'
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Marca de Access Point *
                </label>
                <MarcaSelect
                  value={marcaId}
                  onChange={(id) => {
                    setMarcaId(id);
                    setModelos([]); // Reset local filtered
                  }}
                  marcas={marcas}
                  onMarcaCreated={(newM) => setMarcas(prev => [...prev, newM])}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Modelo de Access Point *
                </label>
                <ModeloSelect
                  value={modeloId}
                  marcaId={marcaId}
                  tipoEquipo="access_point"
                  onChange={(id) => setModeloId(id)}
                  modelos={modelos}
                  marcas={marcas}
                  onModeloCreated={(newMod) => setModelos(prev => [...prev, newMod])}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Número de Serie
                </label>
                <input
                  type="text"
                  value={numeroSerie}
                  onChange={(e) => setNumeroSerie(e.target.value.toUpperCase())}
                  placeholder="ej. AP-SN-9982341"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600 font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Dirección MAC
                </label>
                <input
                  type="text"
                  value={direccionMac}
                  onChange={(e) => setDireccionMac(e.target.value.toUpperCase())}
                  placeholder="ej. AA:BB:CC:DD:EE:FF"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Dirección IP de Gestión (DHCP / Estática)
                </label>
                <input
                  type="text"
                  value={direccionIp}
                  onChange={(e) => setDireccionIp(e.target.value)}
                  placeholder="ej. 10.14.30.25"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center gap-3 text-slate-600">
            <Info className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="text-[11px] leading-relaxed">
              <strong className="text-slate-900 block font-sans">Punto de Conexión Pasivo:</strong>
              Los campos de hardware propio (Marca, Modelo, Serie, MAC e IP) permanecen ocultos para este tipo de punto (<span className="font-bold text-blue-700">{tipoPunto === 'datos_funcionario' ? 'Datos Funcionario' : 'Datos Alumno'}</span>), ya que corresponde únicamente a una toma física de red sin hardware activo dedicado.
            </div>
          </div>
        )}

        {/* SECCIÓN 5: PROVEEDORES Y FECHAS DE COMPRA E INSTALACIÓN */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>5. Adquisición e Instalación</span>
            </h2>
            <span className="text-[10px] text-slate-400">Garantía & Contratistas</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Fecha de Compra</span>
              </label>
              <input
                type="date"
                value={fechaCompra}
                onChange={(e) => setFechaCompra(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Proveedor de Compra / Suministro
              </label>
              <ProveedorSelect
                value={proveedorCompraId}
                onChange={(id) => setProveedorCompraId(id)}
                proveedores={proveedores}
                onProveedorCreated={(newP) => setProveedores(prev => [...prev, newP])}
                rubroFilter="venta"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Fecha de Instalación / Certificación</span>
              </label>
              <input
                type="date"
                value={fechaInstalacion}
                onChange={(e) => setFechaInstalacion(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Proveedor / Cuadrilla Instaladora
              </label>
              <ProveedorSelect
                value={proveedorInstalacionId}
                onChange={(id) => setProveedorInstalacionId(id)}
                proveedores={proveedores}
                onProveedorCreated={(newP) => setProveedores(prev => [...prev, newP])}
                rubroFilter="instalacion"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-slate-300 rounded text-xs font-mono text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancelar y Volver
          </button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{saving ? 'Guardando en base de datos...' : (isEditing ? 'Guardar Cambios' : 'Registrar Punto de Red')}</span>
          </button>
        </div>
      </form>

      {/* Quick Tree Hierarchy Modal */}
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
        onSuccess={() => loadFormData()}
      />
    </div>
  );
};
