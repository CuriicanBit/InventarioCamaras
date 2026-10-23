import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import { 
  Cpu, 
  ArrowLeft, 
  Search, 
  Download, 
  Cable, 
  Camera, 
  CheckCircle2, 
  AlertCircle,
  Layers,
  Server,
  HardDrive,
  Network,
  GripVertical,
  X,
  Unlink,
  ChevronRight,
  Maximize2,
  MoveHorizontal,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  Users,
  Wifi,
  Laptop,
  Plus,
  Tag,
  Briefcase,
  GraduationCap,
  Link2,
  Archive,
  Edit,
  Upload
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Rack, Equipo, Camara, Piso, Edificio, PuntoRed, PuertoSwitchOcupacion, Vlan, MapeoPuertoCompleto, EstadoVisualPuerto } from '../types/database';
import { getOccupancyStatus } from '../utils/occupancyAlerts';
import { parsePoePorts } from '../utils/poeUtils';
import { AsociarServicioDialog } from './AsociarServicioDialog';
import { DeviceBodegaDrawer } from './DeviceBodegaDrawer';
import { ImportDevicesModal } from './ImportDevicesModal';

export const formatPoeEstandarShort = (val?: string | null): string => {
  if (!val) return '';
  const clean = val.trim();
  const lower = clean.toLowerCase();
  if (lower === 'af' || lower.includes('802.3af')) return '802.3af';
  if (lower === 'at' || lower.includes('802.3at')) return '802.3at';
  if (lower === 'bt3' || lower.includes('tipo 3') || lower.includes('type 3')) return '802.3bt';
  if (lower === 'bt4' || lower.includes('tipo 4') || lower.includes('type 4')) return '802.3bt';
  if (lower.includes('802.3bt')) return '802.3bt';
  return clean;
};

interface PatchPanelPortMapProps {
  rack?: Rack | null;
  onSelectRack?: (rack: Rack) => void;
  initialEquipmentId?: string;
  onSelectCamera: (camera: Camara) => void;
  onBackToRack: () => void;
}

// Extracted Switch port numeric index (e.g., 'Fa0/1' -> 1, 'Gi1/0/24' -> 24, '8' -> 8)
export function parseSwitchPortNumber(val: string | null | undefined): number | null {
  if (!val) return null;
  const trimmed = String(val).trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  const match = trimmed.match(/(\d+)$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

// Color palette for cross-connect patch cables
const CABLE_PALETTE = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#14b8a6', // Teal
];

export interface CrossConnectCable {
  id: string; // Camera, PuntoRed or cross connect id
  tipo: 'camara' | 'punto_red' | 'enlace_vacio' | string;
  camera?: Camara | null;
  puntoRed?: PuntoRed | null;
  codigo: string;
  subtitulo?: string;
  patchPanelId: string;
  patchPort: number;
  switchId: string;
  switchPortNum: number;
  switchPortLabel: string;
  color: string;
  mapeo?: MapeoPuertoCompleto;
}

export interface PortEntity {
  tipo: 'camara' | 'punto_red' | 'enlace_vacio' | 'dispositivo' | string;
  camara?: Camara;
  punto?: PuntoRed;
  codigo: string;
  subtitulo?: string;
  rosetaCodigo?: string | null;
  estadoVisual?: EstadoVisualPuerto;
  mapeo?: MapeoPuertoCompleto;
}

interface NvrUplinkConnection {
  nvrId: string;
  targetEquipoId: string;
  targetPortNum: number;
  targetTipo: 'switch' | 'patch_panel';
}

export interface PortSelection {
  equipoId: string;
  portNum: number;
  tipo: 'patch_panel' | 'switch';
  camara?: Camara | null;
  puntoRed?: PuntoRed | null;
  mapeo?: MapeoPuertoCompleto | null;
  vlan?: {
    numero: number;
    nombre: string | null;
    color: string | null;
    uso: string | null;
  } | null;
  counterpart?: {
    equipoId: string;
    portNum: number;
    equipoCodigo: string;
    tipo: 'patch_panel' | 'switch';
    portLabel: string;
  } | null;
  isNvrUplink?: boolean;
  nvrId?: string;
}

interface DragPayload {
  sourceType: 'port' | 'nvr-uplink' | 'camera-item' | 'punto-item' | 'dispositivo';
  equipoId?: string;
  equipoTipo?: 'patch_panel' | 'switch';
  portNum?: number;
  camaraId?: string;
  puntoRedId?: string;
  dispositivoId?: string | null;
  conexionId?: string | null;
  nvrId?: string;
  id?: string;
  codigo?: string;
  tipo?: string;
  startX?: number;
  startY?: number;
}

// User-Requested View Modes:
// 1. 'all_visible': ALL ports (1 to 48) are 100% visible simultaneously on screen! (Dual-row 2x24 + zoom fit, zero scrolling needed)
// 2. 'independent_scroll': Each equipment has INDEPENDENT horizontal scroll with real-time elastic rubber cables!
type ViewMode = 'all_visible' | 'independent_scroll';

export const PatchPanelPortMap: React.FC<PatchPanelPortMapProps> = ({
  rack: initialRack,
  onSelectRack,
  initialEquipmentId,
  onSelectCamera,
  onBackToRack,
}) => {
  // Racks state
  const [allRacks, setAllRacks] = useState<Rack[]>([]);
  const [currentRack, setCurrentRack] = useState<Rack | null>(initialRack || null);

  // Equipment, Camera & Network Point state
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [mapeoPuertos, setMapeoPuertos] = useState<MapeoPuertoCompleto[]>([]);
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [puntosRed, setPuntosRed] = useState<PuntoRed[]>([]);
  const [rosetasList, setRosetasList] = useState<any[]>([]);
  const dragHandledRef = useRef<boolean>(false);
  const [switchPortsOccupation, setSwitchPortsOccupation] = useState<PuertoSwitchOcupacion[]>([]);
  const [vlansList, setVlansList] = useState<Vlan[]>([]);
  const [, setPisosMap] = useState<Record<string, Piso>>({});
  const [, setEdificiosMap] = useState<Record<string, Edificio>>({});

  // PoE Highlight toggle state per switch: switchId -> boolean
  const [poeHighlightBySwitch, setPoeHighlightBySwitch] = useState<Record<string, boolean>>({});

  const togglePoeHighlight = useCallback((switchId: string) => {
    setPoeHighlightBySwitch(prev => ({
      ...prev,
      [switchId]: !prev[switchId]
    }));
  }, []);

  // Quick Network Point & Camera Assign Modal states
  const [nuevoPuntoCodigo, setNuevoPuntoCodigo] = useState('');
  const [nuevoPuntoTipo, setNuevoPuntoTipo] = useState<'datos_funcionario' | 'datos_alumno' | 'wifi_ap'>('datos_funcionario');
  const [nuevoPuntoUbicacion, setNuevoPuntoUbicacion] = useState('');
  const [puntoSearchQuery, setPuntoSearchQuery] = useState('');
  const [camaraSearchQuery, setCamaraSearchQuery] = useState('');

  // VIEW MODE:
  // Defaults to 'all_visible' so both Port 1 and Port 48 are visible at once to easily create links!
  const [viewMode, setViewMode] = useState<ViewMode>('all_visible');

  // Zoom scale for fitting all 48 ports in any viewport (100%, 85%, 75%)
  const [zoomScale, setZoomScale] = useState<number>(100);

  // Port arrangement in all_visible mode:
  // 'dual_row' (Standard 2x24 for 48 ports: odds top, evens bottom) vs 'single_row' (1 continuous row of 48)
  const [portLayoutMode, setPortLayoutMode] = useState<'dual_row' | 'single_row'>('dual_row');

  // NVR Uplinks map (nvrId -> NvrUplinkConnection)
  // Connectable to EITHER a Switch OR a Patch Panel (User Request)
  const [nvrUplinks, setNvrUplinks] = useState<Record<string, NvrUplinkConnection>>(() => {
    try {
      const saved = localStorage.getItem('cctv_nvr_uplinks');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Selection & Interaction state - strictly null by default (requirement: no pre-selected port)
  const [selectedPort, setSelectedPort] = useState<PortSelection | null>(null);
  const [selectedNvrId, setSelectedNvrId] = useState<string | null>(null);
  const [hoveredPort, setHoveredPort] = useState<{ equipoId: string; portNum: number } | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState(false);

  // Drag & Drop / Visual connection state
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ equipoId: string; portNum: number } | null>(null);
  const [dragMouseCoord, setDragMouseCoord] = useState<{ x: number; y: number } | null>(null);

  // Click-to-Connect alternative (useful for users who prefer clicking over dragging long distances)
  const [clickConnectSource, setClickConnectSource] = useState<{
    type: 'port' | 'nvr-uplink';
    equipoId?: string;
    portNum?: number;
    equipoCodigo?: string;
    equipoTipo?: 'patch_panel' | 'switch';
    nvrId?: string;
    camara?: Camara | null;
    puntoRedId?: string;
  } | null>(null);

  // Quick Network Point or Camera Assign Modal state
  const [assignModal, setAssignModal] = useState<{
    isOpen: boolean;
    patchPanelId: string;
    patchPort: number;
    switchId: string;
    switchPort: number;
    activeTab: 'punto_red' | 'camara' | 'directo';
    subTab: 'nuevo' | 'existente';
  } | null>(null);

  // Inspector panel visibility (allows expanding diagram to 100% width)
  const [showInspector, setShowInspector] = useState(true);

  // Graphical VLAN Filter/Highlight
  const [selectedVlanFilter, setSelectedVlanFilter] = useState<number | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isDeviceBodegaOpen, setIsDeviceBodegaOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [bodegaKey, setBodegaKey] = useState(0);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  };

  // Diagram geometry tracking for pixel-perfect dynamic elastic cables
  const diagramRef = useRef<HTMLDivElement>(null);
  const portDomRefs = useRef<Record<string, HTMLElement | null>>({});
  const nvrDomRefs = useRef<Record<string, HTMLElement | null>>({});
  const bayScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Calculated SVG paths for cross-connect and NVR cables
  const [cablePaths, setCablePaths] = useState<Record<string, { 
    d: string; 
    x1: number; 
    y1: number; 
    x2: number; 
    y2: number;
    isSrcVisible: boolean;
    isDstVisible: boolean;
  }>>({});
  const [nvrUplinkPaths, setNvrUplinkPaths] = useState<Record<string, { d: string; x1: number; y1: number; x2: number; y2: number }>>({});

  // Animation frame ref for silky smooth 60fps elastic recalculation during scroll/drag
  const animFrameRef = useRef<number | null>(null);
  const hoverDebounceTimerRef = useRef<number | null>(null);

  // Helper key for DOM elements
  const makePortKey = (equipoId: string, portNum: number) => `${equipoId}_${portNum}`;

  // Load all available racks for dropdown switcher
  useEffect(() => {
    const fetchRacks = async () => {
      try {
        const { data } = await supabase.from('racks').select('*, piso:pisos(*, edificio:edificios(*))').order('codigo');
        if (data && data.length > 0) {
          setAllRacks(data);
          if (!currentRack) {
            setCurrentRack(data[0]);
            if (onSelectRack) onSelectRack(data[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching racks:', err);
      }
    };
    fetchRacks();
  }, []);

  // Update current rack when prop changes
  useEffect(() => {
    if (initialRack && initialRack.id !== currentRack?.id) {
      setCurrentRack(initialRack);
      setSelectedPort(null);
      setSelectedNvrId(null);
    }
  }, [initialRack?.id]);

  // Load equipment, cameras, maintenance history and topology for the current rack
  const loadRackData = async () => {
    if (!currentRack) return;
    try {
      setLoading(true);
      const [
        { data: eqData },
        { data: mapeoData },
        { data: pisosData },
        { data: edificiosData },
        { data: histData },
        { data: vlansData },
        { data: rosetasData },
        { data: realCamarasData },
        { data: realPuntosData }
      ] = await Promise.all([
        supabase.from('equipos').select('*, marca_rel:marcas(*), modelo_rel:modelos(*)').eq('rack_id', currentRack.id),
        supabase.from('v_mapeo_puertos_completo').select('*'),
        supabase.from('pisos').select('*'),
        supabase.from('edificios').select('*'),
        supabase.from('historial_mantenimiento').select('*').eq('entidad_tipo', 'equipo').order('created_at', { ascending: false }).limit(20),
        supabase.from('vlans').select('*').order('numero'),
        supabase.from('rosetas').select('*'),
        supabase.from('camaras').select('*, marca_rel:marcas(*), modelo_rel:modelos(*)'),
        supabase.from('puntos_red').select('*')
      ]);

      const loadedEquipos = eqData || [];
      const loadedMapeo: MapeoPuertoCompleto[] = (mapeoData as MapeoPuertoCompleto[]) || [];
      setEquipos(loadedEquipos);
      setMapeoPuertos(loadedMapeo);
      setVlansList(vlansData || []);
      if (rosetasData) setRosetasList(rosetasData);

      // Listas derivadas de v_mapeo_puertos_completo sincronizadas con registros reales
      const realCams = realCamarasData || [];
      const synthCamaras: Camara[] = loadedMapeo
        .filter(m => m.dispositivo_tipo === 'camara' && m.dispositivo_codigo)
        .map(m => {
          const matchReal = realCams.find(c => c.codigo === m.dispositivo_codigo);
          return {
            id: matchReal?.id || m.conexion_logica_id || m.dispositivo_codigo!,
            rack_id: currentRack.id,
            codigo: m.dispositivo_codigo!,
            estado: (m.dispositivo_estado as any) || 'operativa',
            ubicacion_especifica: m.roseta_ubicacion || null,
            puerto_switch: String(m.switch_puerto_numero),
            switch_id: loadedEquipos.find(e => e.codigo === m.switch_codigo)?.id || null,
            patch_panel_id: loadedEquipos.find(e => e.codigo === m.patch_panel_codigo)?.id || null,
            puerto_patch: m.patch_panel_puerto_numero,
            marca: matchReal?.marca || null,
            modelo: matchReal?.modelo || null,
            direccion_ip: matchReal?.direccion_ip || null,
            direccion_mac: matchReal?.direccion_mac || null,
            created_at: new Date().toISOString()
          } as unknown as Camara;
        });
      // Incluir cámaras no asignadas para el modal/listas
      realCams.forEach(rc => {
        if (!synthCamaras.some(sc => sc.id === rc.id || sc.codigo === rc.codigo)) {
          synthCamaras.push(rc);
        }
      });
      setCamaras(synthCamaras);

      const realPtos = realPuntosData || [];
      const synthPuntos: PuntoRed[] = loadedMapeo
        .filter(m => m.dispositivo_tipo && m.dispositivo_tipo !== 'camara' && m.dispositivo_codigo)
        .map(m => {
          const matchReal = realPtos.find(p => p.codigo === m.dispositivo_codigo);
          return {
            id: matchReal?.id || m.conexion_logica_id || m.dispositivo_codigo!,
            codigo: m.dispositivo_codigo!,
            tipo_punto: m.dispositivo_tipo === 'access_point' ? 'wifi_ap' : 'datos_funcionario',
            ubicacion_especifica: m.roseta_ubicacion || null,
            puerto_switch_id: m.puerto_switch_id,
            switch_id: loadedEquipos.find(e => e.codigo === m.switch_codigo)?.id || null,
            patch_panel_id: loadedEquipos.find(e => e.codigo === m.patch_panel_codigo)?.id || null,
            puerto_patch: m.patch_panel_puerto_numero,
            categoria_cable: 'cat6',
            direccion_ip: matchReal?.direccion_ip || null,
            direccion_mac: matchReal?.direccion_mac || null,
            created_at: new Date().toISOString()
          } as unknown as PuntoRed;
        });
      realPtos.forEach(rp => {
        if (!synthPuntos.some(sp => sp.id === rp.id || sp.codigo === rp.codigo)) {
          synthPuntos.push(rp);
        }
      });
      setPuntosRed(synthPuntos);

      const swIds = loadedEquipos.filter(e => e.tipo === 'switch').map(s => s.id);
      const ppIds = loadedEquipos.filter(e => e.tipo === 'patch_panel').map(p => p.id);

      let spDataLoaded: any[] = [];
      if (swIds.length > 0) {
        // Carga puertos_switch con JOIN a la tabla vlans vía vlan_id
        const [psRes, spOccupancyRes] = await Promise.all([
          supabase
            .from('puertos_switch')
            .select('*, vlan_rel:vlans!vlan_id(*)')
            .in('switch_id', swIds)
            .order('numero_puerto', { ascending: true }),
          supabase
            .from('v_puertos_switch_ocupacion')
            .select('*')
            .in('switch_id', swIds)
        ]);

        const occMap: Record<string, any> = {};
        (spOccupancyRes.data || []).forEach(o => {
          occMap[`${o.switch_id}_${o.numero_puerto}`] = o;
        });

        if (psRes.data && psRes.data.length > 0) {
          spDataLoaded = psRes.data.map(p => {
            const occ = occMap[`${p.switch_id}_${p.numero_puerto}`];
            const vlan = p.vlan_rel;
            return {
              puerto_switch_id: p.id,
              switch_id: p.switch_id,
              numero_puerto: p.numero_puerto,
              tipo_puerto: p.tipo_puerto || 'rj45',
              vlan_id: p.vlan_id || vlan?.id || null,
              vlan_numero: vlan?.numero ?? occ?.vlan_numero ?? (typeof p.vlan === 'number' ? p.vlan : null),
              vlan_nombre: vlan?.nombre ?? occ?.vlan_nombre ?? (vlan?.numero ? `VLAN ${vlan.numero}` : null),
              vlan_color: vlan?.color ?? occ?.vlan_color ?? null,
              uso: p.uso || vlan?.uso || vlan?.descripcion || occ?.uso || null,
              descripcion: p.descripcion || occ?.descripcion || null,
              ocupado_por_codigo: occ?.ocupado_por_codigo || null,
              ocupado_por_tipo: occ?.ocupado_por_tipo || null,
            };
          });
        } else {
          spDataLoaded = spOccupancyRes.data || [];
        }
        setSwitchPortsOccupation(spDataLoaded);
      } else {
        setSwitchPortsOccupation([]);
      }

      const pMap: Record<string, Piso> = {};
      pisosData?.forEach(p => { pMap[p.id] = p; });
      setPisosMap(pMap);

      const eMap: Record<string, Edificio> = {};
      edificiosData?.forEach(e => { eMap[e.id] = e; });
      setEdificiosMap(eMap);

      // Restore NVR uplinks from database maintenance logs if available
      if (histData && histData.length > 0) {
        const restoredUplinks: Record<string, NvrUplinkConnection> = {};
        histData.forEach(h => {
          if (h.repuestos_insumos) {
            try {
              const parsed = JSON.parse(h.repuestos_insumos);
              if (parsed?.uplink_nvr && parsed.nvrId && !restoredUplinks[parsed.nvrId]) {
                restoredUplinks[parsed.nvrId] = {
                  nvrId: parsed.nvrId,
                  targetEquipoId: parsed.targetEquipoId,
                  targetPortNum: parsed.targetPortNum,
                  targetTipo: parsed.targetTipo
                };
              }
            } catch {
              // Ignore non-json
            }
          }
        });
        if (Object.keys(restoredUplinks).length > 0) {
          setNvrUplinks(prev => {
            const merged = { ...prev, ...restoredUplinks };
            try { localStorage.setItem('cctv_nvr_uplinks', JSON.stringify(merged)); } catch {}
            return merged;
          });
        }
      }
    } catch (err) {
      console.error('Error loading rack equipment and cameras:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRackData();
    setSelectedPort(null);
    setSelectedNvrId(null);
    setHoveredPort(null);
    setClickConnectSource(null);
  }, [currentRack?.id, initialEquipmentId]);

  // Order equipment top-to-bottom by real physical rack position (posicion_u_inicio descending)
  const rackBayEquipos = useMemo(() => {
    return equipos
      .filter(e => e.tipo === 'switch' || e.tipo === 'patch_panel')
      .sort((a, b) => {
        const uA = a.posicion_u_inicio ?? a.posicion_u_fin ?? 0;
        const uB = b.posicion_u_inicio ?? b.posicion_u_fin ?? 0;
        return uB - uA; // Descending: highest U on top
      });
  }, [equipos]);

  // Max ports found across all equipment in this rack (excluding SFP ports on switches)
  const maxPortsInRack = useMemo(() => {
    if (rackBayEquipos.length === 0) return 24;
    return Math.max(...rackBayEquipos.map(e => {
      if (e.tipo === 'switch') {
        const rj45s = switchPortsOccupation.filter(sp => sp.switch_id === e.id && sp.tipo_puerto !== 'sfp');
        return rj45s.length > 0 ? rj45s.length : (e.puertos_totales || 24);
      }
      return e.puertos_totales || 24;
    }), 24);
  }, [rackBayEquipos, switchPortsOccupation]);

  // NVRs in the rack
  const rackNvrs = useMemo(() => {
    return equipos
      .filter(e => e.tipo === 'nvr')
      .sort((a, b) => (b.posicion_u_inicio ?? 0) - (a.posicion_u_inicio ?? 0));
  }, [equipos]);

  // Switch port VLAN lookup map (synced with vlans table)
  const switchPortVlanMap = useMemo(() => {
    const map: Record<string, {
      vlan_id: string | null;
      vlan_numero: number | null;
      vlan_nombre: string | null;
      vlan_color: string | null;
      uso: string | null;
      puerto_switch_id: string;
      tipo_puerto: string;
    }> = {};

    switchPortsOccupation.forEach(sp => {
      const vlanObj = vlansList.find(v => v.id === (sp as any).vlan_id || v.numero === (sp.vlan_numero ?? sp.vlan));
      const key = makePortKey(sp.switch_id, sp.numero_puerto);
      map[key] = {
        vlan_id: vlanObj?.id || (sp as any).vlan_id || null,
        vlan_numero: sp.vlan_numero ?? vlanObj?.numero ?? null,
        vlan_nombre: sp.vlan_nombre ?? vlanObj?.nombre ?? null,
        vlan_color: vlanObj?.color || sp.vlan_color || null,
        uso: sp.uso || vlanObj?.descripcion || null,
        puerto_switch_id: sp.puerto_switch_id,
        tipo_puerto: sp.tipo_puerto,
      };
    });

    return map;
  }, [switchPortsOccupation, vlansList]);

  // Switch PoE information lookup map (synced with switch / model PoE configuration)
  const switchPoeInfoMap = useMemo(() => {
    const map: Record<string, {
      poeRes: ReturnType<typeof parsePoePorts>;
      isAllPoe: boolean;
      isNonePoe: boolean;
      isPartialPoe: boolean;
      estandarShort: string;
      totalRj45Count: number;
    }> = {};

    equipos.forEach(eq => {
      if (eq.tipo !== 'switch') return;
      const rj45Ports = switchPortsOccupation
        .filter(sp => sp.switch_id === eq.id && sp.tipo_puerto !== 'sfp')
        .map(sp => sp.numero_puerto);
      const totalRj45Count = rj45Ports.length > 0 ? rj45Ports.length : (eq.puertos_totales || 24);
      const poeRaw = eq.poe_puertos || eq.modelo_rel?.poe_puertos_default;
      const poeEstandarRaw = eq.poe_estandar || eq.modelo_rel?.poe_estandar_default;
      const poeRes = parsePoePorts(poeRaw, totalRj45Count);
      const isAllPoe = poeRes.isAll || (totalRj45Count > 0 && poeRes.count === totalRj45Count);
      const isNonePoe = poeRes.isNone || !poeRes.isDefined || poeRes.count === 0;
      const isPartialPoe = !isAllPoe && !isNonePoe;

      map[eq.id] = {
        poeRes,
        isAllPoe,
        isNonePoe,
        isPartialPoe,
        estandarShort: formatPoeEstandarShort(poeEstandarRaw),
        totalRj45Count
      };
    });

    return map;
  }, [equipos, switchPortsOccupation]);

  // Distinct active VLANs in this rack for the legend & filter strip (excluding SFP trunk ports)
  const activeRackVlans = useMemo(() => {
    const seen = new Map<number, { numero: number; nombre: string | null; color: string | null; count: number }>();
    switchPortsOccupation.forEach(sp => {
      if (sp.tipo_puerto === 'sfp') return; // Exclude SFP trunk ports
      const vNum = sp.vlan_numero ?? sp.vlan;
      if (vNum) {
        const vlanObj = vlansList.find(v => v.id === (sp as any).vlan_id || v.numero === vNum);
        const existing = seen.get(vNum);
        if (existing) {
          existing.count += 1;
        } else {
          seen.set(vNum, {
            numero: vNum,
            nombre: sp.vlan_nombre ?? vlanObj?.nombre ?? null,
            color: vlanObj?.color || sp.vlan_color || '#3b82f6',
            count: 1
          });
        }
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.numero - b.numero);
  }, [switchPortsOccupation, vlansList]);

  // Fast lookup maps for v_mapeo_puertos_completo by port key
  const { switchMapeoMap, patchPanelMapeoMap } = useMemo(() => {
    const swMap: Record<string, MapeoPuertoCompleto> = {};
    const ppMap: Record<string, MapeoPuertoCompleto> = {};

    mapeoPuertos.forEach((m) => {
      const swEq = equipos.find(e => e.codigo === m.switch_codigo || e.id === m.switch_codigo);
      if (swEq && m.switch_puerto_numero) {
        swMap[makePortKey(swEq.id, m.switch_puerto_numero)] = m;
      }
      if (m.switch_codigo && m.switch_puerto_numero) {
        swMap[`${m.switch_codigo}:${m.switch_puerto_numero}`] = m;
      }

      if (m.patch_panel_codigo && m.patch_panel_puerto_numero) {
        const ppEq = equipos.find(e => e.codigo === m.patch_panel_codigo || e.id === m.patch_panel_codigo);
        if (ppEq) {
          ppMap[makePortKey(ppEq.id, m.patch_panel_puerto_numero)] = m;
        }
        ppMap[`${m.patch_panel_codigo}:${m.patch_panel_puerto_numero}`] = m;
      }
    });

    return { switchMapeoMap: swMap, patchPanelMapeoMap: ppMap };
  }, [mapeoPuertos, equipos]);

  // Cross-connect connections calculation (consuming v_mapeo_puertos_completo)
  const { connections, patchPortToEntity, switchPortToEntity } = useMemo(() => {
    const conns: CrossConnectCable[] = [];
    const ppMap: Record<string, PortEntity> = {};
    const swMap: Record<string, PortEntity> = {};

    // 1. Process v_mapeo_puertos_completo entries
    mapeoPuertos.forEach((m) => {
      const swEquipo = equipos.find(e => e.codigo === m.switch_codigo || e.id === m.switch_codigo);
      const ppEquipo = m.patch_panel_codigo ? equipos.find(e => e.codigo === m.patch_panel_codigo || e.id === m.patch_panel_codigo) : null;

        const isEnlaceVacio = m.estado_visual_puerto === 'enlace_vacio';
        const isOcupado = m.estado_visual_puerto === 'ocupado_con_dispositivo';

        const matchingCam = camaras.find(c => c.codigo === m.dispositivo_codigo);
        const matchingPunto = puntosRed.find(p => p.codigo === m.dispositivo_codigo);

        const entity: PortEntity = {
          tipo: isEnlaceVacio ? 'enlace_vacio' : (m.dispositivo_tipo || 'dispositivo'),
          camara: matchingCam,
          punto: matchingPunto,
          codigo: m.dispositivo_codigo || (m.roseta_codigo ? `Roseta ${m.roseta_codigo}` : (isEnlaceVacio ? 'Enlace Vacío' : '')),
          subtitulo: m.roseta_ubicacion || (m.roseta_codigo ? `Roseta: ${m.roseta_codigo}` : undefined),
          rosetaCodigo: m.roseta_codigo,
          estadoVisual: m.estado_visual_puerto,
          mapeo: m
        };

      if (swEquipo && m.switch_puerto_numero) {
        const swKey = makePortKey(swEquipo.id, m.switch_puerto_numero);
        if (isOcupado || isEnlaceVacio) {
          swMap[swKey] = entity;
        }
      }

      if (ppEquipo && m.patch_panel_puerto_numero) {
        const ppKey = makePortKey(ppEquipo.id, m.patch_panel_puerto_numero);
        if (isOcupado || isEnlaceVacio) {
          ppMap[ppKey] = entity;
        }
      }

      // Cable físico entre patch panel y switch
      if (swEquipo && ppEquipo && m.patch_panel_puerto_numero && m.switch_puerto_numero && (isOcupado || isEnlaceVacio)) {
        const cableId = m.tramo_cross_connect_id || `conn-${swEquipo.id}-${m.switch_puerto_numero}-${ppEquipo.id}-${m.patch_panel_puerto_numero}`;

        conns.push({
          id: cableId,
          tipo: isEnlaceVacio ? 'enlace_vacio' : (m.dispositivo_tipo === 'camara' ? 'camara' : 'punto_red'),
          camera: matchingCam,
          puntoRed: matchingPunto,
          codigo: m.dispositivo_codigo || (m.roseta_codigo ? `Roseta ${m.roseta_codigo}` : 'Enlace sin disp.'),
          subtitulo: isEnlaceVacio
            ? (m.roseta_codigo ? `Roseta ${m.roseta_codigo}` : 'Enlace sin dispositivo')
            : (m.dispositivo_tipo === 'camara' ? 'Cámara CCTV' : (m.dispositivo_tipo === 'access_point' ? 'WiFi AP' : 'Datos Funcionario')),
          patchPanelId: ppEquipo.id,
          patchPort: m.patch_panel_puerto_numero,
          switchId: swEquipo.id,
          switchPortNum: m.switch_puerto_numero,
          switchPortLabel: `Fa0/${m.switch_puerto_numero}`,
          color: isEnlaceVacio ? '#64748b' : (m.vlan_color || CABLE_PALETTE[conns.length % CABLE_PALETTE.length]),
          mapeo: m
        });
      }
    });

    // 2. Fallback / Process Cameras for backwards compatibility
    camaras.forEach((cam) => {
      const swNum = parseSwitchPortNumber(cam.puerto_switch);
      const entity: PortEntity = {
        tipo: 'camara',
        camara: cam,
        codigo: cam.codigo,
        subtitulo: `${cam.marca_rel?.nombre || cam.marca || 'CCTV'} · ${cam.direccion_ip || 'Sin IP'}`
      };

      if (cam.patch_panel_id && cam.puerto_patch) {
        const ppKey = makePortKey(cam.patch_panel_id, cam.puerto_patch);
        if (!ppMap[ppKey]) ppMap[ppKey] = entity;
      }

      if (cam.switch_id && swNum !== null) {
        const swKey = makePortKey(cam.switch_id, swNum);
        if (!swMap[swKey]) swMap[swKey] = entity;
      }

      if (
        cam.patch_panel_id && 
        cam.puerto_patch && 
        cam.switch_id && 
        swNum !== null &&
        !conns.some(c => c.patchPanelId === cam.patch_panel_id && c.patchPort === cam.puerto_patch)
      ) {
        conns.push({
          id: `cam-${cam.id}`,
          tipo: 'camara',
          camera: cam,
          codigo: cam.codigo,
          subtitulo: 'Cámara CCTV',
          patchPanelId: cam.patch_panel_id,
          patchPort: cam.puerto_patch,
          switchId: cam.switch_id,
          switchPortNum: swNum,
          switchPortLabel: cam.puerto_switch || String(swNum),
          color: CABLE_PALETTE[conns.length % CABLE_PALETTE.length],
        });
      }
    });

    // 3. Fallback / Process Puntos de Red
    puntosRed.forEach((punto) => {
      const isAlumno = punto.tipo_punto === 'datos_alumno' || 
        punto.codigo.toLowerCase().includes('sala') || 
        punto.codigo.toLowerCase().includes('alum');
      const isWifi = punto.tipo_punto === 'wifi_ap' || 
        punto.codigo.toLowerCase().includes('wifi') || 
        punto.codigo.toLowerCase().includes('ap-');

      const tipoLabel = isAlumno
        ? 'Datos Alumno'
        : isWifi
        ? 'WiFi AP'
        : 'Datos Funcionario';

      const entity: PortEntity = {
        tipo: 'punto_red',
        punto: punto,
        codigo: punto.codigo,
        subtitulo: `${tipoLabel}${punto.ubicacion_especifica ? ` · ${punto.ubicacion_especifica}` : ''}`
      };

      if (punto.patch_panel_id && punto.puerto_patch) {
        const ppKey = makePortKey(punto.patch_panel_id, punto.puerto_patch);
        if (!ppMap[ppKey]) ppMap[ppKey] = entity;
      }

      let swNum: number | null = null;
      let effectiveSwitchId: string | null = punto.switch_id;
      if (punto.puerto_switch_id) {
        const sp = switchPortsOccupation.find(s => s.puerto_switch_id === punto.puerto_switch_id);
        if (sp) {
          swNum = sp.numero_puerto;
          if (!effectiveSwitchId) effectiveSwitchId = sp.switch_id;
        }
      }

      if (effectiveSwitchId && swNum !== null) {
        const swKey = makePortKey(effectiveSwitchId, swNum);
        if (!swMap[swKey]) swMap[swKey] = entity;
      }

      if (
        punto.patch_panel_id && 
        punto.puerto_patch && 
        effectiveSwitchId && 
        swNum !== null &&
        !conns.some(c => c.patchPanelId === punto.patch_panel_id && c.patchPort === punto.puerto_patch)
      ) {
        conns.push({
          id: `pr-${punto.id}`,
          tipo: 'punto_red',
          puntoRed: punto,
          codigo: punto.codigo,
          subtitulo: tipoLabel,
          patchPanelId: punto.patch_panel_id,
          patchPort: punto.puerto_patch,
          switchId: effectiveSwitchId,
          switchPortNum: swNum,
          switchPortLabel: `Fa0/${swNum}`,
          color: CABLE_PALETTE[conns.length % CABLE_PALETTE.length],
        });
      }
    });

    return {
      connections: conns,
      patchPortToEntity: ppMap,
      switchPortToEntity: swMap
    };
  }, [mapeoPuertos, equipos, camaras, puntosRed, switchPortsOccupation]);

  // Find connection for a given port
  const findConnectionForPort = (equipoId: string, portNum: number): CrossConnectCable | undefined => {
    return connections.find(c => 
      (c.patchPanelId === equipoId && c.patchPort === portNum) ||
      (c.switchId === equipoId && c.switchPortNum === portNum)
    );
  };

  // Find NVR connected to a given port (either on Switch or Patch Panel)
  const findNvrForPort = (equipoId: string, portNum: number): NvrUplinkConnection | undefined => {
    return Object.values(nvrUplinks).find(u => u.targetEquipoId === equipoId && u.targetPortNum === portNum);
  };

  // Determine currently active connection (hovered or selected)
  const activeConnection = useMemo(() => {
    if (hoveredPort) {
      const conn = findConnectionForPort(hoveredPort.equipoId, hoveredPort.portNum);
      if (conn) return conn;
    }
    if (selectedPort) {
      const conn = findConnectionForPort(selectedPort.equipoId, selectedPort.portNum);
      if (conn) return conn;
    }
    return null;
  }, [hoveredPort, selectedPort, connections]);

  // RECALCULATE DYNAMIC ELASTIC CABLES:
  // Runs whenever any equipment scrolls independently or on window resize/zoom.
  // Changes geometry dynamically like elastic cords and fans out vertical cables to eliminate overlap!
  const recalculateCables = useCallback(() => {
    if (!diagramRef.current) return;
    const containerRect = diagramRef.current.getBoundingClientRect();
    const newPaths: Record<string, { 
      d: string; 
      x1: number; 
      y1: number; 
      x2: number; 
      y2: number;
      isSrcVisible: boolean;
      isDstVisible: boolean;
    }> = {};

    // 1. Cross-Connect Cables (Patch Panel <-> Switch)
    connections.forEach((conn, index) => {
      const srcEl = portDomRefs.current[makePortKey(conn.patchPanelId, conn.patchPort)];
      const dstEl = portDomRefs.current[makePortKey(conn.switchId, conn.switchPortNum)];

      if (srcEl && dstEl) {
        const srcRect = srcEl.getBoundingClientRect();
        const dstRect = dstEl.getBoundingClientRect();

        // Check if endpoints are currently inside their equipment's scrollable bay
        const srcBay = bayScrollRefs.current[conn.patchPanelId]?.getBoundingClientRect();
        const dstBay = bayScrollRefs.current[conn.switchId]?.getBoundingClientRect();

        const isSrcVisible = srcBay ? (srcRect.right >= srcBay.left && srcRect.left <= srcBay.right) : true;
        const isDstVisible = dstBay ? (dstRect.right >= dstBay.left && dstRect.left <= dstBay.right) : true;

        // Effective attachment coordinates (clamped to bay edge if port is scrolled out of view)
        let rawX1 = srcRect.left + srcRect.width / 2;
        let rawX2 = dstRect.left + dstRect.width / 2;

        if (srcBay) {
          rawX1 = Math.max(srcBay.left + 10, Math.min(srcBay.right - 10, rawX1));
        }
        if (dstBay) {
          rawX2 = Math.max(dstBay.left + 10, Math.min(dstBay.right - 10, rawX2));
        }

        const x1 = rawX1 - containerRect.left;
        const x2 = rawX2 - containerRect.left;

        // Attachment points: top/bottom exterior edges so lines never draw across port buttons
        let y1: number;
        let y2: number;
        if (srcRect.top > dstRect.top) {
          y1 = srcRect.top - containerRect.top;
          y2 = dstRect.bottom - containerRect.top;
        } else {
          y1 = srcRect.bottom - containerRect.top;
          y2 = dstRect.top - containerRect.top;
        }

        const dy = y2 - y1;
        const curveOffset = Math.max(25, Math.min(85, Math.abs(dy) * 0.44));
        const cp1y = y1 > y2 ? y1 - curveOffset : y1 + curveOffset;
        const cp2y = y1 > y2 ? y2 + curveOffset : y2 - curveOffset;

        // FIX FOR VERTICAL OVERLAP:
        // Distribute cables that share nearly identical X coordinates into parallel lanes.
        // Each connection gets a calculated horizontal fan-out offset so vertical lines never collapse onto each other!
        const isNearVertical = Math.abs(x2 - x1) < 18;
        const laneOffset = isNearVertical ? (((index * 5 + conn.patchPort * 3) % 7) - 3) * 11 : 0;

        const cp1x = x1 + laneOffset;
        const cp2x = x2 + laneOffset;

        const path = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
        newPaths[conn.id] = { d: path, x1, y1, x2, y2, isSrcVisible, isDstVisible };
      }
    });
    setCablePaths(newPaths);

    // 2. NVR Uplink Cables (NVR <-> Switch OR Patch Panel)
    const newNvrPaths: Record<string, { d: string; x1: number; y1: number; x2: number; y2: number }> = {};
    rackNvrs.forEach(nvr => {
      const uplink = nvrUplinks[nvr.id];
      const nvrEl = nvrDomRefs.current[nvr.id];

      if (uplink && nvrEl) {
        const targetEl = portDomRefs.current[makePortKey(uplink.targetEquipoId, uplink.targetPortNum)];
        if (targetEl) {
          const nvrRect = nvrEl.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();

          const x1 = nvrRect.right - 26 - containerRect.left;
          const y1 = nvrRect.top + nvrRect.height / 2 - containerRect.top;
          const x2 = targetRect.left + targetRect.width / 2 - containerRect.left;
          const y2 = (targetRect.top > nvrRect.top ? targetRect.top : targetRect.bottom) - containerRect.top;

          const dy = y2 - y1;
          const cpY = y1 + dy * 0.5;
          const d = `M ${x1} ${y1} C ${x1 + 45} ${cpY}, ${x2} ${cpY}, ${x2} ${y2}`;
          newNvrPaths[nvr.id] = { d, x1, y1, x2, y2 };
        }
      } else if (nvrEl) {
        const defaultSwitch = rackBayEquipos.find(e => e.tipo === 'switch');
        if (defaultSwitch) {
          const swPortNum = defaultSwitch.puertos_totales || 24;
          const swEl = portDomRefs.current[makePortKey(defaultSwitch.id, swPortNum)];
          if (swEl) {
            const nvrRect = nvrEl.getBoundingClientRect();
            const swRect = swEl.getBoundingClientRect();
            const x1 = nvrRect.right - 26 - containerRect.left;
            const y1 = nvrRect.top + nvrRect.height / 2 - containerRect.top;
            const x2 = swRect.left + swRect.width / 2 - containerRect.left;
            const y2 = swRect.bottom - containerRect.top;

            const dy = y2 - y1;
            const cpY = y1 + dy * 0.5;
            const d = `M ${x1} ${y1} C ${x1 + 45} ${cpY}, ${x2} ${cpY}, ${x2} ${y2}`;
            newNvrPaths[nvr.id] = { d, x1, y1, x2, y2 };
          }
        }
      }
    });
    setNvrUplinkPaths(newNvrPaths);
  }, [connections, nvrUplinks, rackBayEquipos, rackNvrs]);

  // RequestAnimationFrame scheduler for 60fps elastic cable updates
  const scheduleCableRecalc = useCallback(() => {
    if (animFrameRef.current !== null) return;
    animFrameRef.current = requestAnimationFrame(() => {
      recalculateCables();
      animFrameRef.current = null;
    });
  }, [recalculateCables]);

  useLayoutEffect(() => {
    scheduleCableRecalc();
    const timer = setTimeout(scheduleCableRecalc, 60);
    return () => clearTimeout(timer);
  }, [rackBayEquipos, connections, rackNvrs, nvrUplinks, loading, portLayoutMode, viewMode, zoomScale, scheduleCableRecalc]);

  useEffect(() => {
    window.addEventListener('resize', scheduleCableRecalc);
    return () => window.removeEventListener('resize', scheduleCableRecalc);
  }, [scheduleCableRecalc]);

  // Smooth debounced hover handler to prevent highlight disappearing when crossing lines
  const handlePortMouseEnter = (equipoId: string, portNum: number) => {
    if (hoverDebounceTimerRef.current) {
      clearTimeout(hoverDebounceTimerRef.current);
      hoverDebounceTimerRef.current = null;
    }
    setHoveredPort({ equipoId, portNum });
  };

  const handlePortMouseLeave = () => {
    if (hoverDebounceTimerRef.current) clearTimeout(hoverDebounceTimerRef.current);
    hoverDebounceTimerRef.current = window.setTimeout(() => {
      setHoveredPort(null);
    }, 90);
  };

  // Scroll to a specific port in an independent equipment bay
  const scrollToPort = (equipoId: string, portNum: number) => {
    const portEl = portDomRefs.current[makePortKey(equipoId, portNum)];
    const bayEl = bayScrollRefs.current[equipoId];
    if (portEl && bayEl) {
      const bayRect = bayEl.getBoundingClientRect();
      const portRect = portEl.getBoundingClientRect();
      const currentScroll = bayEl.scrollLeft;
      const targetScroll = currentScroll + (portRect.left - bayRect.left) - bayRect.width / 2 + portRect.width / 2;
      bayEl.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
      setTimeout(scheduleCableRecalc, 120);
    }
  };

  // Handle port click
  const handlePortClick = (equipo: Equipo, portNum: number) => {
    const isPatch = equipo.tipo === 'patch_panel';
    const key = makePortKey(equipo.id, portNum);
    const entity = isPatch ? patchPortToEntity[key] : switchPortToEntity[key];
    const nvrUplink = findNvrForPort(equipo.id, portNum);

    // If we are in Click-to-Connect mode
    if (clickConnectSource) {
      handleCompleteClickConnect(equipo, portNum);
      return;
    }

    // Normal selection
    setSelectedNvrId(null);
    let counterpart: PortSelection['counterpart'] = null;
    const conn = findConnectionForPort(equipo.id, portNum);
    if (conn) {
      if (isPatch) {
        const sw = equipos.find(e => e.id === conn.switchId);
        counterpart = {
          equipoId: conn.switchId,
          portNum: conn.switchPortNum,
          equipoCodigo: sw?.codigo || 'Switch',
          tipo: 'switch',
          portLabel: conn.switchPortLabel
        };
      } else {
        const pp = equipos.find(e => e.id === conn.patchPanelId);
        counterpart = {
          equipoId: conn.patchPanelId,
          portNum: conn.patchPort,
          equipoCodigo: pp?.codigo || 'Patch Panel',
          tipo: 'patch_panel',
          portLabel: `Puerto ${conn.patchPort}`
        };
      }
    }

    const vlanInfo = isPatch
      ? (conn ? switchPortVlanMap[makePortKey(conn.switchId, conn.switchPortNum)] : null)
      : switchPortVlanMap[key];

    const effectiveVlanInfo = isPatch
      ? (conn ? (vlanInfo || null) : null)
      : (vlanInfo || (
          entity?.punto?.puerto_switch_id 
            ? switchPortVlanMap[makePortKey(
                switchPortsOccupation.find(s => s.puerto_switch_id === entity.punto?.puerto_switch_id)?.switch_id || '',
                switchPortsOccupation.find(s => s.puerto_switch_id === entity.punto?.puerto_switch_id)?.numero_puerto || 0
              )]
            : entity?.camara?.switch_id
            ? switchPortVlanMap[makePortKey(
                entity.camara.switch_id,
                parseSwitchPortNumber(entity.camara.puerto_switch) || 0
              )]
            : null
        ));

    const spForClick = isPatch 
      ? (conn ? switchPortsOccupation.find(s => s.switch_id === conn.switchId && s.numero_puerto === conn.switchPortNum) : null)
      : switchPortsOccupation.find(s => s.switch_id === equipo.id && s.numero_puerto === portNum);

    let targetCamera = entity?.camara || conn?.camera || null;
    let targetPunto = entity?.punto || conn?.puntoRed || null;

    if (!targetCamera && spForClick?.ocupado_por_codigo) {
      targetCamera = camaras.find(c => c.codigo === spForClick.ocupado_por_codigo) || null;
    }
    if (!targetPunto && spForClick?.ocupado_por_codigo) {
      targetPunto = puntosRed.find(p => p.codigo === spForClick.ocupado_por_codigo) || null;
    }

    if (!targetCamera && !targetPunto && spForClick && (spForClick.ocupado_por_codigo || (spForClick.uso && spForClick.uso !== 'Libre') || spForClick.vlan_numero)) {
      const isAlum = spForClick.vlan_numero === 30 || spForClick.uso?.toLowerCase().includes('alumno') || spForClick.uso?.toLowerCase().includes('sala');
      const isWifi = spForClick.vlan_numero === 40 || spForClick.uso?.toLowerCase().includes('wifi');
      targetPunto = {
        id: `synth-${equipo.id}-${portNum}`,
        codigo: spForClick.ocupado_por_codigo || (isAlum ? `P-ALUMNO-${portNum}` : isWifi ? `AP-WIFI-${portNum}` : `P-FUNC-${portNum}`),
        tipo_punto: isAlum ? 'datos_alumno' : isWifi ? 'wifi_ap' : 'datos_funcionario',
        ubicacion_especifica: `Puerto ${portNum} en ${equipo.codigo}`,
        piso_id: null,
        rack_id: currentRack?.id || null,
        patch_panel_id: isPatch ? equipo.id : null,
        puerto_patch: isPatch ? portNum : null,
        switch_id: !isPatch ? equipo.id : null,
        puerto_switch_id: spForClick.puerto_switch_id || null,
        categoria_cable: 'cat6',
        marca_id: null,
        modelo_id: null,
        numero_serie: null,
        direccion_mac: null,
        direccion_ip: null,
        fecha_compra: null,
        proveedor_compra_id: null,
        fecha_instalacion: null,
        proveedor_instalacion_id: null,
        created_at: new Date().toISOString()
      };
    }

    const clickPortMapeo = isPatch
      ? (patchPanelMapeoMap[key] || patchPanelMapeoMap[`${equipo.codigo}:${portNum}`])
      : (switchMapeoMap[key] || switchMapeoMap[`${equipo.codigo}:${portNum}`]);

    if (selectedPort?.equipoId === equipo.id && selectedPort?.portNum === portNum) {
      setSelectedPort(null);
    } else {
      setSelectedPort({
        equipoId: equipo.id,
        portNum,
        tipo: isPatch ? 'patch_panel' : 'switch',
        camara: targetCamera,
        puntoRed: targetPunto,
        mapeo: clickPortMapeo || entity?.mapeo || conn?.mapeo || null,
        vlan: effectiveVlanInfo?.vlan_numero ? {
          numero: effectiveVlanInfo.vlan_numero,
          nombre: effectiveVlanInfo.vlan_nombre,
          color: effectiveVlanInfo.vlan_color,
          uso: effectiveVlanInfo.uso
        } : null,
        counterpart,
        isNvrUplink: Boolean(nvrUplink),
        nvrId: nvrUplink?.nvrId
      });
    }
  };

  // Complete click-to-connect interaction
  const handleCompleteClickConnect = (targetEquipo: Equipo, targetPortNum: number) => {
    if (!clickConnectSource) return;

    if (clickConnectSource.type === 'nvr-uplink') {
      handleConnectNvrUplink(clickConnectSource.nvrId!, targetEquipo, targetPortNum);
      setClickConnectSource(null);
      return;
    }

    const srcEquipoId = clickConnectSource.equipoId!;
    const srcPortNum = clickConnectSource.portNum!;
    const srcTipo = clickConnectSource.equipoTipo!;
    const dstTipo = targetEquipo.tipo as 'switch' | 'patch_panel';

    if (srcTipo === dstTipo) {
      showToast(`Debes conectar un Patch Panel con un Switch (no entre dos equipos del mismo tipo)`, 'error');
      setClickConnectSource(null);
      return;
    }

    const ppId = srcTipo === 'patch_panel' ? srcEquipoId : targetEquipo.id;
    const patchPort = srcTipo === 'patch_panel' ? srcPortNum : targetPortNum;
    const swId = srcTipo === 'switch' ? srcEquipoId : targetEquipo.id;
    const switchPort = srcTipo === 'switch' ? srcPortNum : targetPortNum;

    handleCreateOrUpdateConnection(ppId, patchPort, swId, switchPort, clickConnectSource.camara?.id, clickConnectSource.puntoRedId);
    setClickConnectSource(null);
  };

  // ==========================================
  // RPC INTEGRATION: CONECTAR Y DESCONECTAR DISPOSITIVOS
  // ==========================================

  // RPC: Conectar Dispositivo (Cámara o Punto de Red) a una Roseta/Puerto
  const handleConnectDispositivoRpc = async (
    dispositivoId: string,
    rosetaId: string,
    tecnico: string = 'Técnico de Terreno'
  ): Promise<boolean> => {
    try {
      setSavingAction(true);
      const { data, error } = await supabase.rpc('rpc_conectar_dispositivo', {
        p_dispositivo_id: dispositivoId,
        p_roseta_id: rosetaId,
        p_tecnico: tecnico
      });

      if (error || !data || data.success === false) {
        const errMsg = data?.error || error?.message || 'Error al conectar el dispositivo';
        console.error('Error rpc_conectar_dispositivo:', errMsg, { data, error });
        showToast(errMsg, 'error');
        return false;
      }

      showToast(data.message || `Dispositivo ${data.dispositivo || ''} conectado exitosamente.`, 'success');
      await loadRackData();
      setBodegaKey(prev => prev + 1);      
      scheduleCableRecalc();
      return true;
    } catch (err: any) {
      console.error('Exception calling rpc_conectar_dispositivo:', err);
      showToast(err.message || 'Error inesperado al conectar dispositivo', 'error');
      return false;
    } finally {
      setSavingAction(false);
    }
  };

  // RPC: Desconectar Dispositivo (Cámara o Punto de Red)
  const handleDisconnectDispositivoRpc = async (
    conexionId: string,
    motivo: string = 'Desconexión desde Mapeo de Puertos',
    tecnico: string = 'Técnico de Terreno'
  ): Promise<boolean> => {
    try {
      setSavingAction(true);
      const { data, error } = await supabase.rpc('rpc_desconectar_dispositivo', {
        p_conexion_id: conexionId,
        p_motivo: motivo,
        p_tecnico: tecnico
      });

      if (error || !data || data.success === false) {
        const errMsg = data?.error || error?.message || 'Error al desconectar el dispositivo';
        console.error('Error rpc_desconectar_dispositivo:', errMsg, { data, error });
        showToast(errMsg, 'error');
        return false;
      }

      showToast(data.message || 'Dispositivo desconectado correctamente', 'info');
      setSelectedPort(null);
      await loadRackData();
      setBodegaKey(prev => prev + 1);
      scheduleCableRecalc();
      return true;
    } catch (err: any) {
      console.error('Exception calling rpc_desconectar_dispositivo:', err);
      showToast(err.message || 'Error inesperado al desconectar dispositivo', 'error');
      return false;
    } finally {
      setSavingAction(false);
    }
  };

  // Helper para persistir y activar enlace físico en tramo_cross_connect entre Switch y Patch Panel
  const ensureCrossConnect = async (
    patchPanelId: string,
    patchPort: number,
    switchId: string,
    switchPort: number
  ): Promise<{ tramoId: string | null; swPortId: string | null; ppPortId: string | null }> => {
    try {
      // 1. Resolver ID del puerto de switch
      let swPortId: string | null = null;
      const swSp = switchPortsOccupation.find(s => s.switch_id === switchId && s.numero_puerto === switchPort);
      if (swSp?.puerto_switch_id) {
        swPortId = swSp.puerto_switch_id;
      } else {
        const { data: dbSwPort } = await supabase
          .from('puertos_switch')
          .select('id')
          .eq('switch_id', switchId)
          .eq('numero_puerto', switchPort)
          .maybeSingle();
        if (dbSwPort?.id) swPortId = dbSwPort.id;
      }

      // 2. Resolver ID del puerto de patch panel (crear en puertos_patch_panel si no existe)
      let ppPortId: string | null = null;
      const { data: dbPpPort } = await supabase
        .from('puertos_patch_panel')
        .select('id')
        .eq('patch_panel_id', patchPanelId)
        .eq('numero_puerto', patchPort)
        .maybeSingle();

      if (dbPpPort?.id) {
        ppPortId = dbPpPort.id;
      } else {
        const { data: newPpPort } = await supabase
          .from('puertos_patch_panel')
          .insert({
            patch_panel_id: patchPanelId,
            numero_puerto: patchPort,
            estado_manual: 'ok'
          })
          .select('id')
          .single();
        if (newPpPort?.id) ppPortId = newPpPort.id;
      }

      if (!swPortId || !ppPortId) {
        console.warn('ensureCrossConnect: No se pudo resolver IDs de puertos', { swPortId, ppPortId });
        return { tramoId: null, swPortId, ppPortId };
      }

      // 3. Desactivar cualquier enlace previo activo en estos mismos puertos para evitar duplicados
      await supabase
        .from('tramo_cross_connect')
        .update({ estado: 'inactivo', fecha_desconexion: new Date().toISOString() })
        .or(`puerto_switch_id.eq.${swPortId},puerto_patch_panel_id.eq.${ppPortId}`)
        .eq('estado', 'activo');

      // 4. Insertar nuevo tramo_cross_connect activo
      const { data: newTc, error: tcErr } = await supabase
        .from('tramo_cross_connect')
        .insert({
          puerto_switch_id: swPortId,
          puerto_patch_panel_id: ppPortId,
          estado: 'activo'
        })
        .select('id')
        .single();

      if (tcErr) {
        console.error('Error insertando tramo_cross_connect:', tcErr);
        
        // Si el error es por duplicado (código 23505), significa que ya existía un cable activo
        if (tcErr.code === '23505') { 
          // 1. Desactivamos el cable viejo
          await supabase
            .from('tramo_cross_connect')
            .update({ estado: 'inactivo', fecha_desconexion: new Date().toISOString() })
            .or(`puerto_switch_id.eq.${swPortId},puerto_patch_panel_id.eq.${ppPortId}`)
            .eq('estado', 'activo');
          
          // 2. Intentamos crear el nuevo cable
          const { data: retryTc, error: retryErr } = await supabase
            .from('tramo_cross_connect')
            .insert({ 
              puerto_switch_id: swPortId, 
              puerto_patch_panel_id: ppPortId, 
              estado: 'activo' 
            })
            .select('id')
            .single();
            
          if (retryErr) {
            return { tramoId: null, swPortId, ppPortId };
          } else {
            return { tramoId: retryTc?.id || null, swPortId, ppPortId };
          }
        } else {
          return { tramoId: null, swPortId, ppPortId };
        }
      }

      return { tramoId: newTc?.id || null, swPortId, ppPortId };
    } catch (err) {
      console.error('Exception in ensureCrossConnect:', err);
      return { tramoId: null, swPortId: null, ppPortId: null };
    }
  };

  // Helper para desactivar enlace físico en tramo_cross_connect
  const disconnectCrossConnect = async (
    equipoId?: string,
    portNum?: number,
    equipoTipo?: 'switch' | 'patch_panel',
    tramoId?: string | null
  ) => {
    try {
      if (tramoId) {
        await supabase
          .from('tramo_cross_connect')
          .update({ estado: 'inactivo', fecha_desconexion: new Date().toISOString() })
          .eq('id', tramoId);
        return;
      }

      if (!equipoId || !portNum) return;

      if (equipoTipo === 'switch') {
        const swSp = switchPortsOccupation.find(s => s.switch_id === equipoId && s.numero_puerto === portNum);
        let swPortId = swSp?.puerto_switch_id;
        if (!swPortId) {
          const { data } = await supabase
            .from('puertos_switch')
            .select('id')
            .eq('switch_id', equipoId)
            .eq('numero_puerto', portNum)
            .maybeSingle();
          swPortId = data?.id;
        }
        if (swPortId) {
          await supabase
            .from('tramo_cross_connect')
            .update({ estado: 'inactivo', fecha_desconexion: new Date().toISOString() })
            .eq('puerto_switch_id', swPortId)
            .eq('estado', 'activo');
        }
      } else {
        const { data } = await supabase
          .from('puertos_patch_panel')
          .select('id')
          .eq('patch_panel_id', equipoId)
          .eq('numero_puerto', portNum)
          .maybeSingle();
        if (data?.id) {
          await supabase
            .from('tramo_cross_connect')
            .update({ estado: 'inactivo', fecha_desconexion: new Date().toISOString() })
            .eq('puerto_patch_panel_id', data.id)
            .eq('estado', 'activo');
        }
      }
    } catch (err) {
      console.error('Error in disconnectCrossConnect:', err);
    }
  };

  // Resolver ID de la Roseta en la base de datos a partir de puerto/equipo o dispositivo
  const resolveRosetaId = async (
    targetEquipo: Equipo,
    targetPortNum: number,
    dispositivoId?: string,
    dispositivoCodigo?: string
  ): Promise<string | null> => {
    const isSwitch = targetEquipo.tipo === 'switch';
    const portKey = makePortKey(targetEquipo.id, targetPortNum);
    const portMapeo = isSwitch ? switchMapeoMap[portKey] : patchPanelMapeoMap[portKey];

    // 1. A partir del código de roseta en la vista del puerto
    if (portMapeo?.roseta_codigo) {
      const match = rosetasList.find(r => r.codigo === portMapeo.roseta_codigo);
      if (match) return match.id;
    }

    // 2. Coincidencia por ID o código de dispositivo en la tabla rosetas
    if (dispositivoId) {
      const matchById = rosetasList.find(r => r.id === dispositivoId);
      if (matchById) return matchById.id;
    }
    if (dispositivoCodigo) {
      const matchByCode = rosetasList.find(r => 
        r.codigo === dispositivoCodigo || 
        r.codigo === `ROS-${dispositivoCodigo}` ||
        r.codigo.toLowerCase() === dispositivoCodigo.toLowerCase()
      );
      if (matchByCode) return matchByCode.id;
    }

    // 3. Patrón de código de roseta por número de puerto (ej. PR-FUNC-P18, PR-SALA-P31)
    const matchByPort = rosetasList.find(r => 
      r.codigo.endsWith(`P${targetPortNum}`) || 
      r.codigo.endsWith(`P${String(targetPortNum).padStart(2, '0')}`)
    );
    if (matchByPort) return matchByPort.id;

    // 4. Consulta directa a la base de datos si la lista local estuviera desactualizada
    try {
      const { data: dbRosetas } = await supabase.from('rosetas').select('*');
      if (dbRosetas && dbRosetas.length > 0) {
        setRosetasList(dbRosetas);
        if (portMapeo?.roseta_codigo) {
          const found = dbRosetas.find(r => r.codigo === portMapeo.roseta_codigo);
          if (found) return found.id;
        }
        if (dispositivoId) {
          const found = dbRosetas.find(r => r.id === dispositivoId);
          if (found) return found.id;
        }
        if (dispositivoCodigo) {
          const found = dbRosetas.find(r => 
            r.codigo === dispositivoCodigo || 
            r.codigo === `ROS-${dispositivoCodigo}`
          );
          if (found) return found.id;
        }
      }

      // 5. Crear roseta si no existe ninguna asociada para permitir la conexión
      const newCodigo = portMapeo?.roseta_codigo || (dispositivoCodigo ? `ROS-${dispositivoCodigo}` : `PR-P${targetPortNum}`);
      const { data: createdRoseta } = await supabase.from('rosetas').insert({
        codigo: newCodigo,
        piso_id: currentRack?.piso_id || null,
        ubicacion_especifica: currentRack?.ubicacion_especifica || null,
        estado: 'activa'
      }).select('*').single();

      if (createdRoseta?.id) {
        setRosetasList(prev => [...prev, createdRoseta]);
        return createdRoseta.id;
      }
    } catch (err) {
      console.error('Error resolving roseta id:', err);
    }
    return null;
  };

  // Resolver ID de la Conexión Lógica para desconexión
  const resolveConexionId = async (
    conexionId?: string,
    dispositivoId?: string,
    portMapeo?: MapeoPuertoCompleto | null
  ): Promise<string | null> => {
    if (conexionId) return conexionId;
    if (portMapeo?.conexion_logica_id) return portMapeo.conexion_logica_id;

    if (dispositivoId) {
      try {
        const { data } = await supabase
          .from('conexiones_logicas')
          .select('id')
          .eq('dispositivo_id', dispositivoId)
          .eq('estado', 'activa')
          .limit(1)
          .maybeSingle();
        if (data?.id) return data.id;
      } catch (err) {
        console.error('Error fetching conexion id:', err);
      }
    }
    return null;
  };

  // DRAG & DROP HANDLERS WITH LIVE ELASTIC CORD PREVIEW & RPC INTEGRATION
  const handleDragStartPort = (e: React.DragEvent, equipo: Equipo, portNum: number) => {
    e.stopPropagation();
    const isPatch = equipo.tipo === 'patch_panel';
    const key = makePortKey(equipo.id, portNum);
    const entity = isPatch ? patchPortToEntity[key] : switchPortToEntity[key];
    const portMapeo = isPatch ? patchPanelMapeoMap[key] : switchMapeoMap[key];
    const conn = findConnectionForPort(equipo.id, portNum);
    const conexionId = portMapeo?.conexion_logica_id || null;
    const devCodigo = portMapeo?.dispositivo_codigo || entity?.codigo || conn?.codigo || null;
    const matchingDev = devCodigo 
      ? (camaras.find(c => c.codigo === devCodigo) || puntosRed.find(p => p.codigo === devCodigo))
      : null;
    const camaraId = entity?.camara?.id || conn?.camera?.id || (portMapeo?.dispositivo_tipo === 'camara' ? matchingDev?.id : undefined);
    const puntoRedId = entity?.punto?.id || conn?.puntoRed?.id || (portMapeo?.dispositivo_tipo !== 'camara' ? matchingDev?.id : undefined);
    const dispositivoId = matchingDev?.id || entity?.camara?.id || entity?.punto?.id || conn?.camera?.id || conn?.puntoRed?.id || null;

    dragHandledRef.current = false;

    const portEl = portDomRefs.current[key];
    const containerRect = diagramRef.current?.getBoundingClientRect();
    let startX = 0;
    let startY = 0;
    if (portEl && containerRect) {
      const pRect = portEl.getBoundingClientRect();
      startX = pRect.left + pRect.width / 2 - containerRect.left;
      startY = pRect.top + pRect.height / 2 - containerRect.top;
    }

    const payload: DragPayload = {
      sourceType: 'port',
      equipoId: equipo.id,
      equipoTipo: equipo.tipo as 'patch_panel' | 'switch',
      portNum,
      camaraId,
      puntoRedId,
      dispositivoId,
      conexionId,
      codigo: devCodigo || undefined,
      startX,
      startY
    };

    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'link';
    setActiveDrag(payload);
    setDragMouseCoord({ x: startX, y: startY });
  };

  const handleDragStartNvr = (e: React.DragEvent, nvrId: string) => {
    e.stopPropagation();
    const nvrEl = nvrDomRefs.current[nvrId];
    const containerRect = diagramRef.current?.getBoundingClientRect();
    let startX = 0;
    let startY = 0;
    if (nvrEl && containerRect) {
      const nRect = nvrEl.getBoundingClientRect();
      startX = nRect.right - 20 - containerRect.left;
      startY = nRect.top + nRect.height / 2 - containerRect.top;
    }

    const payload: DragPayload = {
      sourceType: 'nvr-uplink',
      nvrId,
      startX,
      startY
    };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'link';
    setActiveDrag(payload);
    setDragMouseCoord({ x: startX, y: startY });
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!diagramRef.current) return;
    const containerRect = diagramRef.current.getBoundingClientRect();
    const curX = e.clientX - containerRect.left;
    const curY = e.clientY - containerRect.top;
    setDragMouseCoord({ x: curX, y: curY });
  };

  const handleDragOverPort = (e: React.DragEvent, equipo: Equipo, portNum: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'link';
    if (dragOverTarget?.equipoId !== equipo.id || dragOverTarget?.portNum !== portNum) {
      setDragOverTarget({ equipoId: equipo.id, portNum });
    }
  };

  const handleDragLeavePort = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTarget(null);
  };

  // Manejador de soltar en el contenedor (Arrastrar fuera del puerto para desconectar)
  const handleContainerDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    setDragMouseCoord(null);

    let payload: DragPayload | null = activeDrag;
    if (!payload) {
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) payload = JSON.parse(raw);
      } catch (err) {
        console.error('Error parsing container drop payload:', err);
      }
    }
    setActiveDrag(null);
    if (!payload) return;

    // Arrastre fuera del puerto para desconectar (Tarea 2)
    if (payload.sourceType === 'port' && payload.equipoId && payload.portNum) {
      dragHandledRef.current = true;
      const portKey = makePortKey(payload.equipoId, payload.portNum);
      const portMapeo = payload.equipoTipo === 'switch' ? switchMapeoMap[portKey] : patchPanelMapeoMap[portKey];
      const connId = payload.conexionId || portMapeo?.conexion_logica_id;

      if (connId) {
        await handleDisconnectDispositivoRpc(
          connId,
          'Desconexión por arrastre fuera del puerto',
          'Técnico de Terreno'
        );
      } else {
        const devId = payload.dispositivoId || payload.camaraId || payload.puntoRedId;
        if (devId) {
          const resolvedConnId = await resolveConexionId(undefined, devId, portMapeo);
          if (resolvedConnId) {
            await handleDisconnectDispositivoRpc(
              resolvedConnId,
              'Desconexión por arrastre fuera del puerto',
              'Técnico de Terreno'
            );
          }
        }
      }

      await disconnectCrossConnect(
        payload.equipoId,
        payload.portNum,
        payload.equipoTipo,
        portMapeo?.tramo_cross_connect_id
      );

      await handleDisconnectCable(payload.camaraId, payload.puntoRedId);
    }
  };

  // Manejador al finalizar arrastre (Detecta si el usuario soltó fuera de cualquier puerto)
  const handleDragEndPort = async (e: React.DragEvent, equipo: Equipo, portNum: number) => {
    if (dragHandledRef.current) {
      dragHandledRef.current = false;
      setActiveDrag(null);
      setDragOverTarget(null);
      setDragMouseCoord(null);
      return;
    }

    if (e.dataTransfer.dropEffect === 'none') {
      const portKey = makePortKey(equipo.id, portNum);
      const isPatch = equipo.tipo === 'patch_panel';
      const portMapeo = isPatch ? patchPanelMapeoMap[portKey] : switchMapeoMap[portKey];
      const connId = portMapeo?.conexion_logica_id;

      if (connId) {
        dragHandledRef.current = true;
        await handleDisconnectDispositivoRpc(
          connId,
          'Desconexión por arrastre fuera del puerto',
          'Técnico de Terreno'
        );
      }

      await disconnectCrossConnect(
        equipo.id,
        portNum,
        equipo.tipo as 'switch' | 'patch_panel',
        portMapeo?.tramo_cross_connect_id
      );
      await handleDisconnectCable();
    }

    setActiveDrag(null);
    setDragOverTarget(null);
    setDragMouseCoord(null);
  };

  const handleDropOnPort = async (e: React.DragEvent, targetEquipo: Equipo, targetPortNum: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    setDragMouseCoord(null);
    setActiveDrag(null);
    dragHandledRef.current = true;

    let payload: DragPayload | null = activeDrag;
    if (!payload) {
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (raw) payload = JSON.parse(raw);
      } catch (err) {
        console.error('Error parsing drag payload:', err);
      }
    }

    if (!payload) return;

    // Case 1: Dragging NVR Uplink onto a Switch OR Patch Panel port
    if (payload.sourceType === 'nvr-uplink' && payload.nvrId) {
      handleConnectNvrUplink(payload.nvrId, targetEquipo, targetPortNum);
      return;
    }

    // Case 2: Soltar dispositivo en roseta/puerto
    const droppedDeviceId = payload.camaraId || payload.puntoRedId || payload.dispositivoId || payload.id;
    if (
      (payload.sourceType === 'camera-item' || 
       payload.sourceType === 'punto-item' || 
       payload.sourceType === 'dispositivo' || 
       (payload as any).source === 'bodega') && 
      droppedDeviceId
    ) {
      const isPatch = targetEquipo.tipo === 'patch_panel';
      const rosetaId = await resolveRosetaId(targetEquipo, targetPortNum, droppedDeviceId, payload.codigo);
      
      if (rosetaId) {
        // 1. Si es Patch Panel, asegurar que exista el Tramo Horizontal (el cable físico)
        if (isPatch) {
          let ppPortId = null;
          const { data: existingPpPort } = await supabase.from('puertos_patch_panel')
            .select('id')
            .eq('patch_panel_id', targetEquipo.id)
            .eq('numero_puerto', targetPortNum)
            .maybeSingle();
            
          if (existingPpPort) {
            ppPortId = existingPpPort.id;
          } else {
            const { data: newPpPort } = await supabase.from('puertos_patch_panel')
              .insert({ patch_panel_id: targetEquipo.id, numero_puerto: targetPortNum, estado_manual: 'ok' })
              .select('id').single();
            if (newPpPort) ppPortId = newPpPort.id;
          }
          
          if (ppPortId) {
            const { data: existingTh } = await supabase.from('tramo_horizontal')
              .select('id')
              .eq('puerto_patch_panel_id', ppPortId)
              .eq('estado', 'activo')
              .maybeSingle();
              
            if (!existingTh) {
              await supabase.from('tramo_horizontal').insert({
                puerto_patch_panel_id: ppPortId,
                roseta_id: rosetaId,
                estado: 'activo',
                estado_verificacion: 'sin_verificar'
              });
            }
          }
        }

        // 2. Conectar el dispositivo a la roseta (crea la conexión lógica)
        const connected = await handleConnectDispositivoRpc(droppedDeviceId, rosetaId, 'Técnico de Terreno');
        
        if (connected) {
          // 3. Actualizar el puerto físico en la tabla del dispositivo
          if (payload.tipo === 'camara' || payload.sourceType === 'camera-item') {
            await supabase.from('camaras').update({
              patch_panel_id: isPatch ? targetEquipo.id : null,
              puerto_patch: isPatch ? targetPortNum : null,
              switch_id: !isPatch ? targetEquipo.id : null,
              puerto_switch: !isPatch ? String(targetPortNum) : null
            }).eq('id', droppedDeviceId);
          } else {
            let puertoSwitchId = null;
            if (!isPatch) {
              const swPort = switchPortsOccupation.find(p => p.switch_id === targetEquipo.id && p.numero_puerto === targetPortNum);
              puertoSwitchId = swPort?.puerto_switch_id || null;
            }
            
            await supabase.from('puntos_red').update({
              patch_panel_id: isPatch ? targetEquipo.id : null,
              puerto_patch: isPatch ? targetPortNum : null,
              switch_id: !isPatch ? targetEquipo.id : null,
              puerto_switch_id: puertoSwitchId
            }).eq('id', droppedDeviceId);
          }
          
          // 4. Recargar la vista
          await loadRackData();
          scheduleCableRecalc();
        }
        return;
      }
      
      if (payload.sourceType === 'camera-item') {
        handleAssignCameraToPort(droppedDeviceId, targetEquipo, targetPortNum);
      }
      return;
    }

    // Case 3: Dragging from Port to Port (Cross-Connect o reconexión de dispositivo)
    if (payload.sourceType === 'port' && payload.equipoId && payload.portNum) {
      const srcEquipoId = payload.equipoId;
      const srcPortNum = payload.portNum;
      const srcTipo = payload.equipoTipo;
      const dstTipo = targetEquipo.tipo as 'switch' | 'patch_panel';

      const devId = payload.dispositivoId || payload.camaraId || payload.puntoRedId;

      // Si se arrastra entre puertos del mismo equipo o rosetas, reconectar dispositivo vía RPC
      if (devId && (srcTipo === dstTipo || srcEquipoId === targetEquipo.id)) {
        const rosetaId = await resolveRosetaId(targetEquipo, targetPortNum, devId, payload.codigo);
        if (rosetaId) {
          await handleConnectDispositivoRpc(devId, rosetaId, 'Técnico de Terreno');
          return;
        }
      }

      if (srcTipo === dstTipo) {
        showToast('Debes conectar un Patch Panel con un Switch (no entre dos equipos del mismo tipo)', 'error');
        return;
      }

      const ppId = srcTipo === 'patch_panel' ? srcEquipoId : targetEquipo.id;
      const patchPort = srcTipo === 'patch_panel' ? srcPortNum : targetPortNum;
      const swId = srcTipo === 'switch' ? srcEquipoId : targetEquipo.id;
      const switchPort = srcTipo === 'switch' ? srcPortNum : targetPortNum;

      handleCreateOrUpdateConnection(ppId, patchPort, swId, switchPort, payload.camaraId, payload.puntoRedId);
    }
  };

  // Connect NVR Uplink to EITHER Switch OR Patch Panel
  const handleConnectNvrUplink = async (nvrId: string, targetEquipo: Equipo, targetPortNum: number) => {
    try {
      setSavingAction(true);
      const targetTipo = targetEquipo.tipo as 'switch' | 'patch_panel';
      const newUplink: NvrUplinkConnection = {
        nvrId,
        targetEquipoId: targetEquipo.id,
        targetPortNum,
        targetTipo
      };

      const updated = { ...nvrUplinks, [nvrId]: newUplink };
      setNvrUplinks(updated);
      try { localStorage.setItem('cctv_nvr_uplinks', JSON.stringify(updated)); } catch {}

      await supabase.from('historial_mantenimiento').insert({
        entidad_tipo: 'equipo',
        entidad_id: nvrId,
        tipo_intervencion: 'instalacion',
        fecha: new Date().toISOString(),
        tecnico_responsable: 'Técnico de Terreno',
        descripcion: `[uplink_nvr] Enlace Uplink Gigabit conectado visualmente a ${targetTipo === 'switch' ? 'Switch' : 'Patch Panel'} ${targetEquipo.codigo} puerto ${targetPortNum}`,
        repuestos_insumos: JSON.stringify({ uplink_nvr: true, nvrId, targetEquipoId: targetEquipo.id, targetPortNum, targetTipo })
      });

      showToast(`Uplink de NVR conectado a ${targetEquipo.codigo} [Puerto ${targetPortNum}] exitosamente`, 'success');
      setSelectedNvrId(nvrId);
      scheduleCableRecalc();
    } catch (err: any) {
      console.error('Error saving NVR uplink:', err);
      showToast('Error al conectar NVR: ' + (err.message || 'Error de base de datos'), 'error');
    } finally {
      setSavingAction(false);
    }
  };

  const handleDisconnectNvrUplink = async (nvrId: string) => {
    try {
      setSavingAction(true);
      const updated = { ...nvrUplinks };
      delete updated[nvrId];
      setNvrUplinks(updated);
      try { localStorage.setItem('cctv_nvr_uplinks', JSON.stringify(updated)); } catch {}

      await supabase.from('historial_mantenimiento').insert({
        entidad_tipo: 'equipo',
        entidad_id: nvrId,
        tipo_intervencion: 'modificacion',
        fecha: new Date().toISOString(),
        tecnico_responsable: 'Técnico de Terreno',
        descripcion: `[uplink_nvr] Enlace Uplink de red desconectado`,
        repuestos_insumos: JSON.stringify({ uplink_nvr: false, nvrId })
      });

      showToast('Enlace de red NVR desconectado', 'info');
      scheduleCableRecalc();
    } catch (err: any) {
      console.error('Error disconnecting NVR:', err);
      showToast('Error al desconectar NVR: ' + (err.message || 'Error'), 'error');
    } finally {
      setSavingAction(false);
    }
  };

  // Connect specific camera to cross-connect
  const handleConnectCamera = async (
    patchPanelId: string,
    patchPort: number,
    switchId: string,
    switchPort: number,
    camaraId: string
  ) => {
    try {
      setSavingAction(true);
      const pp = equipos.find(e => e.id === patchPanelId);
      const sw = equipos.find(e => e.id === switchId);

      // 1. Asegurar tramo_cross_connect físico entre switch y patch panel
      await ensureCrossConnect(patchPanelId, patchPort, switchId, switchPort);

      // 2. Conectar dispositivo a roseta mediante RPC si aplica
      const rosetaId = await resolveRosetaId(pp || ({ id: patchPanelId, tipo: 'patch_panel' } as Equipo), patchPort, camaraId);
      if (rosetaId) {
        await handleConnectDispositivoRpc(camaraId, rosetaId, 'Técnico de Terreno');
      }

      // 3. Actualizar registro en camaras
      const switchPortStr = `Fa0/${switchPort}`;
      const { data, error } = await supabase
        .from('camaras')
        .update({
          rack_id: currentRack?.id,
          patch_panel_id: patchPanelId,
          puerto_patch: patchPort,
          switch_id: switchId,
          puerto_switch: switchPortStr
        })
        .eq('id', camaraId)
        .select('*, marca_rel:marcas(*), modelo_rel:modelos(*)')
        .single();

      if (error) throw error;
      await loadRackData();
      showToast(`Conexión física y lógica establecida: Cámara ${data.codigo} a Switch ${sw?.codigo || 'Switch'} [Puerto ${switchPort}]`, 'success');
      scheduleCableRecalc();
    } catch (err: any) {
      console.error('Error creating camera cross-connect:', err);
      showToast('Error al crear enlace: ' + (err.message || 'Error de base de datos'), 'error');
    } finally {
      setSavingAction(false);
    }
  };

  // Connect specific Punto de Red to cross-connect
  const handleConnectPuntoRed = async (
    patchPanelId: string,
    patchPort: number,
    switchId: string,
    switchPort: number,
    puntoRedId: string
  ) => {
    try {
      setSavingAction(true);
      const pp = equipos.find(e => e.id === patchPanelId);
      const sw = equipos.find(e => e.id === switchId);

      // 1. Asegurar tramo_cross_connect físico entre switch y patch panel
      const { swPortId } = await ensureCrossConnect(patchPanelId, patchPort, switchId, switchPort);

      // 2. Conectar dispositivo a roseta mediante RPC si aplica
      const rosetaId = await resolveRosetaId(pp || ({ id: patchPanelId, tipo: 'patch_panel' } as Equipo), patchPort, puntoRedId);
      if (rosetaId) {
        await handleConnectDispositivoRpc(puntoRedId, rosetaId, 'Técnico de Terreno');
      }

      // 3. Actualizar registro en puntos_red
      const effectiveSwPortId = swPortId || switchPortVlanMap[makePortKey(switchId, switchPort)]?.puerto_switch_id || null;
      const { data, error } = await supabase
        .from('puntos_red')
        .update({
          rack_id: currentRack?.id || null,
          patch_panel_id: patchPanelId,
          puerto_patch: patchPort,
          switch_id: switchId,
          puerto_switch_id: effectiveSwPortId
        })
        .eq('id', puntoRedId)
        .select('*')
        .single();

      if (error) throw error;
      await loadRackData();
      showToast(`Conexión física y lógica establecida: Punto ${data.codigo} a Switch ${sw?.codigo || 'Switch'} [Puerto ${switchPort}]`, 'success');
      scheduleCableRecalc();
    } catch (err: any) {
      console.error('Error connecting punto red:', err);
      showToast('Error al conectar punto de red: ' + (err.message || 'Error de base de datos'), 'error');
    } finally {
      setSavingAction(false);
    }
  };

  // Quick create and connect new Punto de Red (Sala, Funcionario, WiFi AP)
  const handleCreateAndConnectNuevoPuntoRed = async (
    patchPanelId: string,
    patchPort: number,
    switchId: string,
    switchPort: number,
    codigo: string,
    tipoPunto: 'datos_funcionario' | 'datos_alumno' | 'wifi_ap',
    ubicacion?: string,
    modeloId?: string | null,
    alimentacion?: string | null
  ) => {
    try {
      setSavingAction(true);
      const swPortId = (switchId && switchPort) 
        ? (switchPortVlanMap[makePortKey(switchId, switchPort)]?.puerto_switch_id || null) 
        : null;

      // 1. Asegurar enlace físico en tramo_cross_connect únicamente si ambos extremos están definidos
      if (patchPanelId && switchId && patchPort && switchPort) {
        await ensureCrossConnect(patchPanelId, patchPort, switchId, switchPort);
      }

      // 2. Insertar punto de red
      const { data, error } = await supabase
        .from('puntos_red')
        .insert({
          codigo: codigo.trim(),
          tipo_punto: tipoPunto,
          ubicacion_especifica: ubicacion?.trim() || null,
          piso_id: currentRack?.piso_id || null,
          rack_id: currentRack?.id || null,
          patch_panel_id: patchPanelId || null,
          puerto_patch: patchPort || null,
          switch_id: switchId || null,
          puerto_switch_id: swPortId || null,
          categoria_cable: 'cat6',
          estado_ciclo_vida: 'instalado',
          modelo_id: modeloId || null,
          alimentacion: alimentacion || null,
        })
        .select('*')
        .single();

      if (error) throw error;

      // 3. Conectar mediante la función RPC a la roseta
      const targetEq = (patchPanelId ? equipos.find(e => e.id === patchPanelId) : null) || (switchId ? equipos.find(e => e.id === switchId) : null);
      const portNumber = patchPort || switchPort || 1;
      const rosetaId = targetEq ? await resolveRosetaId(targetEq, portNumber, data.id, data.codigo) : null;

      // Asegurar que exista el puerto físico y tramo_horizontal en el Patch Panel hacia la roseta
      if (patchPanelId && patchPort && rosetaId) {
        let ppPortId = null;
        const { data: existingPpPort } = await supabase.from('puertos_patch_panel')
          .select('id')
          .eq('patch_panel_id', patchPanelId)
          .eq('numero_puerto', patchPort)
          .maybeSingle();

        if (existingPpPort) {
          ppPortId = existingPpPort.id;
        } else {
          const { data: newPpPort } = await supabase.from('puertos_patch_panel')
            .insert({ patch_panel_id: patchPanelId, numero_puerto: patchPort, estado_manual: 'ok' })
            .select('id').single();
          if (newPpPort) ppPortId = newPpPort.id;
        }

        if (ppPortId) {
          const { data: existingTh } = await supabase.from('tramo_horizontal')
            .select('id')
            .eq('puerto_patch_panel_id', ppPortId)
            .eq('estado', 'activo')
            .maybeSingle();

          if (!existingTh) {
            await supabase.from('tramo_horizontal').insert({
              puerto_patch_panel_id: ppPortId,
              roseta_id: rosetaId,
              estado: 'activo',
              estado_verificacion: 'sin_verificar'
            });
          }
        }
      }

      if (rosetaId) {
        await handleConnectDispositivoRpc(data.id, rosetaId, 'Técnico de Terreno');
      }
      await loadRackData();
      showToast(`Punto ${data.codigo} registrado exitosamente`, 'success');
      scheduleCableRecalc();
    } catch (err: any) {
      console.error('Error creating nuevo punto red:', err);
      showToast('Error al registrar nuevo punto: ' + (err.message || 'Error de base de datos'), 'error');
    } finally {
      setSavingAction(false);
    }
  };

  // Quick create and connect new Camara CCTV
  const handleCreateAndConnectNuevaCamara = async (
    patchPanelId: string,
    patchPort: number,
    switchId: string,
    switchPort: number,
    codigo: string,
    ubicacion?: string,
    modeloId?: string | null,
    alimentacion?: string | null
  ) => {
    try {
      setSavingAction(true);

      // 1. Asegurar enlace físico en tramo_cross_connect únicamente si ambos extremos están definidos
      if (patchPanelId && switchId && patchPort && switchPort) {
        await ensureCrossConnect(patchPanelId, patchPort, switchId, switchPort);
      }

      // 2. Insertar cámara
      const { data, error } = await supabase
        .from('camaras')
        .insert({
          codigo: codigo.trim(),
          ubicacion_especifica: ubicacion?.trim() || null,
          piso_id: currentRack?.piso_id || null,
          rack_id: currentRack?.id || null,
          patch_panel_id: patchPanelId || null,
          puerto_patch: patchPort || null,
          switch_id: switchId || null,
          puerto_switch: (switchId && switchPort) ? `Fa0/${switchPort}` : null,
          modelo_id: modeloId || null,
          alimentacion: alimentacion || null,
          estado_ciclo_vida: 'instalado',
        })
        .select('*, marca_rel:marcas(*), modelo_rel:modelos(*)')
        .single();

      if (error) throw error;

      // 3. Conectar mediante la función RPC a la roseta
      const targetEq = (patchPanelId ? equipos.find(e => e.id === patchPanelId) : null) || (switchId ? equipos.find(e => e.id === switchId) : null);
      const portNumber = patchPort || switchPort || 1;
      const rosetaId = targetEq ? await resolveRosetaId(targetEq, portNumber, data.id, data.codigo) : null;

      // Asegurar que exista el puerto físico y tramo_horizontal en el Patch Panel hacia la roseta
      if (patchPanelId && patchPort && rosetaId) {
        let ppPortId = null;
        const { data: existingPpPort } = await supabase.from('puertos_patch_panel')
          .select('id')
          .eq('patch_panel_id', patchPanelId)
          .eq('numero_puerto', patchPort)
          .maybeSingle();

        if (existingPpPort) {
          ppPortId = existingPpPort.id;
        } else {
          const { data: newPpPort } = await supabase.from('puertos_patch_panel')
            .insert({ patch_panel_id: patchPanelId, numero_puerto: patchPort, estado_manual: 'ok' })
            .select('id').single();
          if (newPpPort) ppPortId = newPpPort.id;
        }

        if (ppPortId) {
          const { data: existingTh } = await supabase.from('tramo_horizontal')
            .select('id')
            .eq('puerto_patch_panel_id', ppPortId)
            .eq('estado', 'activo')
            .maybeSingle();

          if (!existingTh) {
            await supabase.from('tramo_horizontal').insert({
              puerto_patch_panel_id: ppPortId,
              roseta_id: rosetaId,
              estado: 'activo',
              estado_verificacion: 'sin_verificar'
            });
          }
        }
      }

      if (rosetaId) {
        await handleConnectDispositivoRpc(data.id, rosetaId, 'Técnico de Terreno');
      }
      await loadRackData();
      showToast(`Cámara ${data.codigo} creada exitosamente`, 'success');
      scheduleCableRecalc();
    } catch (err: any) {
      console.error('Error creating nueva camara:', err);
      showToast('Error al registrar nueva cámara: ' + (err.message || 'Error de base de datos'), 'error');
    } finally {
      setSavingAction(false);
    }
  };

  // Create or Update Cross-Connect connection in database
  const handleCreateOrUpdateConnection = async (
    patchPanelId: string,
    patchPort: number,
    switchId: string,
    switchPort: number,
    draggedCamaraId?: string,
    draggedPuntoRedId?: string
  ) => {
    // 1. Asegurar SIEMPRE el enlace físico primero (crea la línea y limpia fantasmas)
    const { tramoId } = await ensureCrossConnect(patchPanelId, patchPort, switchId, switchPort);
    if (!tramoId) {
      showToast('Error de base de datos al intentar crear el cable.', 'error');
      return;
    }

    if (draggedCamaraId) {
      await handleConnectCamera(patchPanelId, patchPort, switchId, switchPort, draggedCamaraId);
      return;
    }
    if (draggedPuntoRedId) {
      await handleConnectPuntoRed(patchPanelId, patchPort, switchId, switchPort, draggedPuntoRedId);
      return;
    }

    const patchKey = makePortKey(patchPanelId, patchPort);
    const existingPatchEntity = patchPortToEntity[patchKey];
    const existingSwitchEntity = switchPortToEntity[makePortKey(switchId, switchPort)];
    const patchMapeo = patchPanelMapeoMap[patchKey] || (selectedPort?.equipoId === patchPanelId && selectedPort?.portNum === patchPort ? selectedPort.mapeo : null);

    if (existingPatchEntity?.camara || existingSwitchEntity?.camara) {
      const cam = existingPatchEntity?.camara || existingSwitchEntity?.camara;
      await handleConnectCamera(patchPanelId, patchPort, switchId, switchPort, cam!.id);
      return;
    }

    if (existingPatchEntity?.punto || existingSwitchEntity?.punto) {
      const punto = existingPatchEntity?.punto || existingSwitchEntity?.punto;
      await handleConnectPuntoRed(patchPanelId, patchPort, switchId, switchPort, punto!.id);
      return;
    }

    if (patchMapeo?.dispositivo_codigo) {
      const cam = camaras.find(c => c.codigo === patchMapeo.dispositivo_codigo);
      if (cam) {
        await handleConnectCamera(patchPanelId, patchPort, switchId, switchPort, cam.id);
        return;
      }
      const punto = puntosRed.find(p => p.codigo === patchMapeo.dispositivo_codigo);
      if (punto) {
        await handleConnectPuntoRed(patchPanelId, patchPort, switchId, switchPort, punto.id);
        return;
      }
    }

    // Inspect switch port VLAN and usage to set default suggestions in modal
    const swVlan = switchPortVlanMap[makePortKey(switchId, switchPort)];
    let defaultTipo: 'datos_funcionario' | 'datos_alumno' | 'wifi_ap' = 'datos_funcionario';
    let defaultCodePrefix = 'PR-FUNC-';
    let defaultTab: 'punto_red' | 'camara' = 'punto_red';

    if (swVlan?.uso === 'WiFi AP') {
      defaultTipo = 'wifi_ap';
      defaultCodePrefix = 'AP-WIFI-';
    } else if (swVlan?.uso === 'Datos Alumno') {
      defaultTipo = 'datos_alumno';
      defaultCodePrefix = 'PR-SALA-';
    } else if (swVlan?.uso === 'CCTV') {
      defaultTab = 'camara';
    }

    // --- Consultamos la base de datos directamente por si el estado local no ha refrescado ---
    let inheritedDeviceCode = null;
    let inheritedDeviceType = null;
    let inheritedDeviceId = null;

    const ppPortRes = await supabase.from('puertos_patch_panel').select('id').eq('patch_panel_id', patchPanelId).eq('numero_puerto', patchPort).maybeSingle();
    if (ppPortRes.data) {
      const thRes = await supabase.from('tramo_horizontal').select('roseta_id').eq('puerto_patch_panel_id', ppPortRes.data.id).eq('estado', 'activo').maybeSingle();
      if (thRes.data) {
        const clRes = await supabase.from('conexiones_logicas').select('*').eq('roseta_id', thRes.data.roseta_id).eq('estado', 'activa').maybeSingle();
        if (clRes.data) {
           inheritedDeviceCode = clRes.data.dispositivo_codigo;
           inheritedDeviceType = clRes.data.dispositivo_tipo;
           inheritedDeviceId = clRes.data.dispositivo_id;
        }
      }
    }

    // Si ya tiene un dispositivo conectado en este puerto del Patch Panel, CONECTAR DIRECTAMENTE SIN ABRIR EL MODAL
    if (inheritedDeviceId || inheritedDeviceCode) {
      const devId = inheritedDeviceId 
        || camaras.find(c => c.codigo === inheritedDeviceCode)?.id 
        || puntosRed.find(p => p.codigo === inheritedDeviceCode)?.id;
      if (devId) {
        if (inheritedDeviceType === 'camara') {
          await handleConnectCamera(patchPanelId, patchPort, switchId, switchPort, devId);
        } else {
          await handleConnectPuntoRed(patchPanelId, patchPort, switchId, switchPort, devId);
        }
        return;
      }
    }

    // Si el puerto no tiene dispositivo registrado, abrir el modal para asociar nuevo
    setNuevoPuntoCodigo(`${defaultCodePrefix}P${String(patchPort).padStart(2, '0')}`);
    setNuevoPuntoUbicacion('');
    setNuevoPuntoTipo(defaultTipo);
    setPuntoSearchQuery('');
    setCamaraSearchQuery('');

    setAssignModal({
      isOpen: true,
      patchPanelId,
      patchPort,
      switchId,
      switchPort,
      activeTab: defaultTab,
      subTab: 'nuevo'
    });
  };

  // Assign camera to a single port
  const handleAssignCameraToPort = async (camaraId: string, equipo: Equipo, portNum: number) => {
    try {
      setSavingAction(true);
      const rosetaId = await resolveRosetaId(equipo, portNum, camaraId);
      if (rosetaId) {
        const connected = await handleConnectDispositivoRpc(camaraId, rosetaId, 'Técnico de Terreno');
        if (connected) return;
      }

      const isPatch = equipo.tipo === 'patch_panel';
      const updatePayload: any = { rack_id: currentRack?.id };

      if (isPatch) {
        updatePayload.patch_panel_id = equipo.id;
        updatePayload.puerto_patch = portNum;
      } else {
        updatePayload.switch_id = equipo.id;
        updatePayload.puerto_switch = `Fa0/${portNum}`;
      }

      const { data, error } = await supabase
        .from('camaras')
        .update(updatePayload)
        .eq('id', camaraId)
        .select('*, marca_rel:marcas(*), modelo_rel:modelos(*)')
        .single();

      if (error) throw error;

      await loadRackData();
      showToast(`Cámara ${data.codigo} asignada a ${equipo.codigo} [Puerto ${portNum}]`, 'success');
      handlePortClick(equipo, portNum);
      scheduleCableRecalc();
    } catch (err: any) {
      console.error('Error assigning camera:', err);
      showToast('Error al asignar cámara: ' + (err.message || 'Error de base de datos'), 'error');
    } finally {
      setSavingAction(false);
    }
  };

  // Desconectar cable / dispositivo (Llama a rpc_desconectar_dispositivo y desactiva tramo_cross_connect)
  const handleDisconnectCable = async (targetCamaraId?: string, targetPuntoId?: string, targetConexionId?: string) => {
    try {
      setSavingAction(true);
      const connId = targetConexionId || selectedPort?.mapeo?.conexion_logica_id;
      if (connId) {
        await handleDisconnectDispositivoRpc(connId, 'Desconexión solicitada desde interfaz de puerto', 'Técnico de Terreno');
      } else {
        const camId = targetCamaraId || selectedPort?.camara?.id;
        const ptoId = targetPuntoId || selectedPort?.puntoRed?.id;
        const devId = camId || ptoId;

        if (devId) {
          const resolvedConnId = await resolveConexionId(undefined, devId, selectedPort?.mapeo);
          if (resolvedConnId) {
            await handleDisconnectDispositivoRpc(resolvedConnId, 'Desconexión solicitada desde interfaz de puerto', 'Técnico de Terreno');
          }
        }
      }

      const camId = targetCamaraId || selectedPort?.camara?.id;
      const ptoId = targetPuntoId || selectedPort?.puntoRed?.id;

      if (camId) {
        await supabase
          .from('camaras')
          .update({
            switch_id: null,
            puerto_switch: null,
            patch_panel_id: null, // Limpiar Patch Panel
            puerto_patch: null     // Limpiar Puerto Patch
          })
          .eq('id', camId);
      } else if (ptoId) {
        await supabase
          .from('puntos_red')
          .update({
            switch_id: null,
            puerto_switch_id: null,
            patch_panel_id: null, // Limpiar Patch Panel
            puerto_patch: null     // Limpiar Puerto Patch
          })
          .eq('id', ptoId);
      }

      showToast('Cable de parcheo desconectado. El puerto quedó disponible.', 'info');
      setSelectedPort(null);
      await loadRackData();
      scheduleCableRecalc();
    } catch (err: any) {
      console.error('Error disconnecting cable:', err);
      showToast('Error al desconectar cable: ' + (err.message || 'Error de base de datos'), 'error');
    } finally {
      setSavingAction(false);
    }
  };

  // Export complete matrix to CSV (including VLANs and both Cameras & Network Points)
  const handleExportMatrixCSV = () => {
    if (!currentRack) return;
    const headers = [
      'Rack',
      'Patch Panel',
      'Puerto Patch',
      'Switch',
      'Puerto Switch',
      'VLAN',
      'Tipo Dispositivo / Punto',
      'Codigo',
      'Detalle / Modelo',
      'IP',
      'MAC',
      'Ubicacion Fisica',
      'NVR',
      'Canal NVR'
    ];

    const rows = connections.map(conn => {
      const pp = equipos.find(e => e.id === conn.patchPanelId);
      const sw = equipos.find(e => e.id === conn.switchId);
      const vlan = switchPortVlanMap[makePortKey(conn.switchId, conn.switchPortNum)];
      const vlanLabel = vlan?.vlan_numero ? `VLAN ${vlan.vlan_numero} (${vlan.vlan_nombre || ''})` : 'Sin VLAN';

      if (conn.tipo === 'camara' && conn.camera) {
        const nvr = conn.camera?.nvr_id ? equipos.find(e => e.id === conn.camera?.nvr_id) : null;
        return [
          `"${currentRack.codigo}"`,
          `"${pp?.codigo || '-'}"`,
          conn.patchPort,
          `"${sw?.codigo || '-'}"`,
          `"${conn.switchPortLabel}"`,
          `"${vlanLabel}"`,
          '"Cámara CCTV"',
          `"${conn.camera.codigo}"`,
          `"${conn.camera.marca || ''} ${conn.camera.modelo || ''}"`,
          `"${conn.camera.direccion_ip || '-'}"`,
          `"${conn.camera.direccion_mac || '-'}"`,
          `"${conn.camera.ubicacion_especifica || '-'}"`,
          `"${nvr?.codigo || '-'}"`,
          conn.camera.canal_nvr ?? '-'
        ].join(',');
      } else if (conn.puntoRed) {
        const tipoLabel = conn.puntoRed.tipo_punto === 'datos_funcionario'
          ? 'Punto Funcionario'
          : conn.puntoRed.tipo_punto === 'wifi_ap'
          ? 'WiFi AP'
          : 'Punto de Sala';
        return [
          `"${currentRack.codigo}"`,
          `"${pp?.codigo || '-'}"`,
          conn.patchPort,
          `"${sw?.codigo || '-'}"`,
          `"${conn.switchPortLabel}"`,
          `"${vlanLabel}"`,
          `"${tipoLabel}"`,
          `"${conn.puntoRed.codigo}"`,
          `"Cat6 RJ45"`,
          `"${conn.puntoRed.direccion_ip || '-'}"`,
          `"${conn.puntoRed.direccion_mac || '-'}"`,
          `"${conn.puntoRed.ubicacion_especifica || '-'}"`,
          '"-"',
          '"-"'
        ].join(',');
      }
      return '';
    }).filter(Boolean);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CrossConnect_${currentRack.codigo.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered cameras and puntos_red for search
  const searchResults = useMemo(() => {
    if (!searchFilter.trim()) return { cameras: [], puntos: [], totalCount: 0 };
    const query = searchFilter.toLowerCase().trim();

    const cameras = camaras.filter(c => 
      c.codigo.toLowerCase().includes(query) ||
      (c.direccion_ip && c.direccion_ip.toLowerCase().includes(query)) ||
      (c.direccion_mac && c.direccion_mac.toLowerCase().includes(query)) ||
      (c.ubicacion_especifica && c.ubicacion_especifica.toLowerCase().includes(query))
    );

    const puntos = puntosRed.filter(p =>
      p.codigo.toLowerCase().includes(query) ||
      (p.ubicacion_especifica && p.ubicacion_especifica.toLowerCase().includes(query)) ||
      (p.direccion_ip && p.direccion_ip.toLowerCase().includes(query)) ||
      (p.direccion_mac && p.direccion_mac.toLowerCase().includes(query))
    );

    return { cameras, puntos, totalCount: cameras.length + puntos.length };
  }, [camaras, puntosRed, searchFilter]);

  // Overall statistics for the rack
  const totalSwitchCount = rackBayEquipos.filter(e => e.tipo === 'switch').length;
  const totalPatchPanelCount = rackBayEquipos.filter(e => e.tipo === 'patch_panel').length;
  const totalCrossConnects = connections.length;
  const totalNvrChannels = camaras.filter(c => c.nvr_id).length;

  // Selected NVR record
  const inspectedNvr = selectedNvrId ? rackNvrs.find(n => n.id === selectedNvrId) : null;
  const currentNvrUplink = inspectedNvr ? nvrUplinks[inspectedNvr.id] : null;

  // Loading state
  if (loading && !currentRack) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-slate-500 font-mono text-xs">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Cargando diagrama de cross-connect y puertos...</span>
        </div>
      </div>
    );
  }

  // CASE: EMPTY STATE
  if (!loading && currentRack && rackBayEquipos.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={onBackToRack}
              className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
              title="Volver a Elevación"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-bold font-mono text-slate-900 tracking-tight flex items-center gap-2">
                <Network className="w-4 h-4 text-blue-600" />
                <span>Mapeo Cross-Connect · {currentRack.codigo}</span>
              </h1>
              <p className="text-xs text-slate-500 font-sans">
                Diagrama físico vertical de interconexión con soporte Drag & Drop
              </p>
            </div>
          </div>

          {allRacks.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Cambiar Bastidor:</span>
              <select
                value={currentRack.id}
                onChange={(e) => {
                  const r = allRacks.find(item => item.id === e.target.value);
                  if (r) {
                    setCurrentRack(r);
                    if (onSelectRack) onSelectRack(r);
                  }
                }}
                className="px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono font-medium text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
              >
                {allRacks.map(r => (
                  <option key={r.id} value={r.id}>{r.codigo}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-12 text-center max-w-xl mx-auto space-y-4">
          <div className="w-16 h-16 bg-blue-50 border border-blue-200 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
            <Layers className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-bold text-slate-900 font-mono">
              Sin Equipos de Conmutación o Parcheo
            </h3>
            <p className="text-xs text-slate-500 font-sans leading-relaxed">
              El bastidor <strong>{currentRack.codigo}</strong> no cuenta actualmente con Switches ni Patch Panels instalados en sus unidades de rack.
            </p>
          </div>
          <div className="pt-2 flex justify-center">
            <button
              onClick={onBackToRack}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded shadow-xs transition-colors cursor-pointer"
            >
              <Server className="w-4 h-4" />
              <span>Ir a Elevación de Bastidor / Montar Equipos</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render a single port button with explicit high z-index, VLAN coloring, and occupant icons
  const renderPortButton = (eq: Equipo, pNum: number) => {
    const isSwitch = eq.tipo === 'switch';

    // No mostrar los puertos SFP en esta pantalla (son para enlaces troncales)
    if (isSwitch) {
      const isSfpPort = switchPortsOccupation.some(
        sp => sp.switch_id === eq.id && sp.numero_puerto === pNum && sp.tipo_puerto === 'sfp'
      );
      if (isSfpPort) return null;
    }

    const key = makePortKey(eq.id, pNum);
    const entity = isSwitch ? switchPortToEntity[key] : patchPortToEntity[key];
    const conn = findConnectionForPort(eq.id, pNum);
    const nvrUplink = findNvrForPort(eq.id, pNum);

    // Obtener mapeo directo desde v_mapeo_puertos_completo
    const portMapeo = isSwitch
      ? (switchMapeoMap[key] || switchMapeoMap[`${eq.codigo}:${pNum}`])
      : (patchPanelMapeoMap[key] || patchPanelMapeoMap[`${eq.codigo}:${pNum}`]);

    // Determinar estado_visual_puerto según la vista v_mapeo_puertos_completo
    // Determinar estado_visual_puerto según la vista v_mapeo_puertos_completo o dispositivos asociados
    let estadoVisual: EstadoVisualPuerto = 'puerto_libre';
    if (portMapeo?.dispositivo_codigo || entity?.camara || entity?.punto) {
      estadoVisual = 'ocupado_con_dispositivo';
    } else if (portMapeo?.estado_visual_puerto) {
      estadoVisual = portMapeo.estado_visual_puerto;
    } else if (entity?.estadoVisual) {
      estadoVisual = entity.estadoVisual;
    } else if (nvrUplink) {
      estadoVisual = 'ocupado_con_dispositivo';
    } else if (conn || entity) {
      estadoVisual = (conn?.tipo === 'enlace_vacio' || entity?.tipo === 'enlace_vacio') 
        ? 'enlace_vacio' 
        : 'ocupado_con_dispositivo';
    } else if (isSwitch && switchPortsOccupation.some(sp => sp.switch_id === eq.id && sp.numero_puerto === pNum && (sp.ocupado_por_codigo || (sp.uso && sp.uso !== 'Libre')))) {
      estadoVisual = 'ocupado_con_dispositivo';
    }

    const isOccupied = estadoVisual === 'ocupado_con_dispositivo' || Boolean(portMapeo?.dispositivo_codigo || entity?.camara || entity?.punto);
    const isEnlaceVacio = estadoVisual === 'enlace_vacio' && !isOccupied;

    // Resolución de VLAN asignada
    let swVlan = null;
    if (isSwitch) {
      swVlan = switchPortVlanMap[key];
    } else if (conn) {
      swVlan = switchPortVlanMap[makePortKey(conn.switchId, conn.switchPortNum)];
    }

    if (!swVlan && !isSwitch) {
      if (entity?.punto?.puerto_switch_id) {
        const sp = switchPortsOccupation.find(s => s.puerto_switch_id === entity.punto?.puerto_switch_id);
        if (sp) swVlan = switchPortVlanMap[makePortKey(sp.switch_id, sp.numero_puerto)];
      } else if (entity?.camara?.switch_id) {
        const swNum = parseSwitchPortNumber(entity.camara.puerto_switch);
        if (swNum) swVlan = switchPortVlanMap[makePortKey(entity.camara.switch_id, swNum)];
      }
    }

    const sp = isSwitch 
      ? switchPortsOccupation.find(s => s.switch_id === eq.id && s.numero_puerto === pNum)
      : (conn 
          ? switchPortsOccupation.find(s => s.switch_id === conn.switchId && s.numero_puerto === conn.switchPortNum)
          : (entity?.punto?.puerto_switch_id 
              ? switchPortsOccupation.find(s => s.puerto_switch_id === entity.punto?.puerto_switch_id) 
              : null));

    if (!swVlan && sp?.vlan_numero) {
      const vlanObj = vlansList.find(v => v.numero === sp.vlan_numero);
      swVlan = {
        vlan_id: vlanObj?.id || (sp as any).vlan_id || null,
        vlan_numero: sp.vlan_numero,
        vlan_nombre: sp.vlan_nombre || vlanObj?.nombre || `VLAN ${sp.vlan_numero}`,
        vlan_color: sp.vlan_color || vlanObj?.color || '#3b82f6',
        uso: sp.uso || '',
        puerto_switch_id: sp.puerto_switch_id || '',
        tipo_puerto: sp.tipo_puerto || 'rj45'
      };
    } else if (!swVlan && portMapeo?.vlan_id) {
      swVlan = {
        vlan_id: portMapeo.vlan_id,
        vlan_numero: portMapeo.vlan_nombre ? (parseInt(portMapeo.vlan_nombre.replace(/\D/g, ''), 10) || 1) : 1,
        vlan_nombre: portMapeo.vlan_nombre,
        vlan_color: portMapeo.vlan_color || '#3b82f6',
        uso: portMapeo.dispositivo_tipo || '',
        puerto_switch_id: portMapeo.puerto_switch_id || '',
        tipo_puerto: portMapeo.switch_puerto_tipo || 'rj45'
      };
    }

    // Si portMapeo tiene vlan_id, asegurar número y color desde vlansList si falta
    if (portMapeo?.vlan_id) {
      const vlanFromList = vlansList.find(v => v.id === portMapeo.vlan_id);
      if (vlanFromList) {
        if (!swVlan) {
          swVlan = {
            vlan_id: vlanFromList.id,
            vlan_numero: vlanFromList.numero,
            vlan_nombre: vlanFromList.nombre,
            vlan_color: vlanFromList.color,
            uso: vlanFromList.descripcion || '',
            puerto_switch_id: portMapeo.puerto_switch_id || '',
            tipo_puerto: portMapeo.switch_puerto_tipo || 'rj45'
          };
        } else {
          if (!swVlan.vlan_id) swVlan.vlan_id = vlanFromList.id;
          if (!swVlan.vlan_numero) swVlan.vlan_numero = vlanFromList.numero;
          if (!swVlan.vlan_nombre) swVlan.vlan_nombre = vlanFromList.nombre;
          if (!swVlan.vlan_color) swVlan.vlan_color = vlanFromList.color;
        }
      }
    }

    const vlanNum = swVlan?.vlan_numero 
      ?? (portMapeo?.vlan_nombre ? (parseInt(portMapeo.vlan_nombre.replace(/\D/g, ''), 10) || null) : null)
      ?? (sp?.vlan_numero ?? (sp as any)?.vlan ?? null);

    // Requisito: Siempre que vlan_id no sea nulo (o exista configuración de VLAN en el puerto de switch)
    const hasVlanConfigured = Boolean(
      (portMapeo?.vlan_id !== null && portMapeo?.vlan_id !== undefined && portMapeo.vlan_id !== '') ||
      (swVlan?.vlan_id !== null && swVlan?.vlan_id !== undefined && swVlan.vlan_id !== '') ||
      vlanNum !== null
    );

    const vlanDisplayLabel = vlanNum ? `V${vlanNum}` : (portMapeo?.vlan_nombre || swVlan?.vlan_nombre || 'VLAN');
    const effectiveVlanColor = portMapeo?.vlan_color || swVlan?.vlan_color || '#3b82f6';
    const hasVlanColor = Boolean(effectiveVlanColor);

    // Determinar qué tipo de ocupante tiene (cámara, datos funcionario, datos alumno, wifi ap, nvr)
    const pto = entity?.punto || conn?.puntoRed;
    const isCamera = Boolean(
      portMapeo?.dispositivo_tipo === 'camara' ||
      entity?.tipo === 'camara' || 
      conn?.tipo === 'camara' || 
      entity?.camara || 
      conn?.camera || 
      sp?.ocupado_por_tipo === 'camara' || 
      (sp?.uso && sp.uso.toLowerCase().includes('cctv')) || 
      swVlan?.vlan_numero === 10 || 
      (swVlan?.vlan_nombre && swVlan.vlan_nombre.toLowerCase().includes('cctv'))
    );

    const isWifi = Boolean(
      portMapeo?.dispositivo_tipo === 'access_point' ||
      pto?.tipo_punto === 'wifi_ap' || 
      (sp?.uso && sp.uso.toLowerCase().includes('wifi')) || 
      swVlan?.vlan_numero === 40 || 
      (swVlan?.vlan_nombre && swVlan.vlan_nombre.toLowerCase().includes('wifi')) ||
      (pto?.codigo && (pto.codigo.toLowerCase().includes('wifi') || pto.codigo.toLowerCase().includes('ap-'))) ||
      (sp?.ocupado_por_codigo && (sp.ocupado_por_codigo.toLowerCase().includes('wifi') || sp.ocupado_por_codigo.toLowerCase().includes('ap-')))
    );

    const isAlumno = Boolean(
      pto?.tipo_punto === 'datos_alumno' || 
      swVlan?.vlan_numero === 30 || 
      (swVlan?.vlan_nombre && (swVlan.vlan_nombre.toLowerCase().includes('alumno') || swVlan.vlan_nombre.toLowerCase().includes('sala'))) ||
      (sp?.uso && (sp.uso.toLowerCase().includes('alumno') || sp.uso.toLowerCase().includes('sala'))) || 
      (pto?.codigo && (pto.codigo.toLowerCase().includes('sala') || pto.codigo.toLowerCase().includes('alum'))) ||
      (sp?.ocupado_por_codigo && (sp.ocupado_por_codigo.toLowerCase().includes('sala') || sp.ocupado_por_codigo.toLowerCase().includes('alum')))
    );

    const isFuncionario = Boolean(
      pto?.tipo_punto === 'datos_funcionario' || 
      portMapeo?.dispositivo_tipo === 'usuario' ||
      swVlan?.vlan_numero === 20 || 
      (swVlan?.vlan_nombre && (swVlan.vlan_nombre.toLowerCase().includes('funcionario') || swVlan.vlan_nombre.toLowerCase().includes('personal') || swVlan.vlan_nombre.toLowerCase().includes('docente'))) ||
      (sp?.uso && (sp.uso.toLowerCase().includes('funcionario') || sp.uso.toLowerCase().includes('personal') || sp.uso.toLowerCase().includes('docente'))) || 
      (pto?.codigo && pto.codigo.toLowerCase().includes('func')) ||
      (sp?.ocupado_por_codigo && sp.ocupado_por_codigo.toLowerCase().includes('func'))
    );

    let occupantLabel = 'Libre';
    if (nvrUplink) {
      occupantLabel = 'Uplink NVR';
    } else if (isCamera) {
      occupantLabel = 'Cámara CCTV';
    } else if (isWifi) {
      occupantLabel = 'AP WiFi';
    } else if (isAlumno) {
      occupantLabel = 'Datos Alumno';
    } else if (isFuncionario) {
      occupantLabel = 'Datos Funcionario';
    } else if (isOccupied) {
      occupantLabel = portMapeo?.dispositivo_tipo || sp?.uso || 'Dispositivo';
    } else if (isEnlaceVacio) {
      occupantLabel = 'Enlace Vacío';
    }

    // Requisito 2: Ícono del dispositivo
    let occupantIcon: React.ReactNode = null;
    if (isOccupied) {
      if (isCamera) {
        occupantIcon = <Camera className="w-3.5 h-3.5 shrink-0" style={{ color: effectiveVlanColor }} />;
      } else if (isWifi) {
        occupantIcon = <Wifi className="w-3.5 h-3.5 shrink-0" style={{ color: effectiveVlanColor }} />;
      } else if (isAlumno) {
        occupantIcon = <GraduationCap className="w-3.5 h-3.5 shrink-0" style={{ color: effectiveVlanColor }} />;
      } else if (nvrUplink) {
        occupantIcon = <HardDrive className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
      } else if (isFuncionario) {
        occupantIcon = <Briefcase className="w-3.5 h-3.5 shrink-0" style={{ color: effectiveVlanColor }} />;
      } else {
        occupantIcon = <Laptop className="w-3.5 h-3.5 shrink-0" style={{ color: effectiveVlanColor }} />;
      }
    } else if (isEnlaceVacio) {
      occupantIcon = <Link2 className="w-3 h-3 text-slate-400 shrink-0" />;
    } else {
      occupantIcon = null;
    }

    // Requisito 3: Identificación de códigos para texto y tooltip
    const dispCodigo = portMapeo?.dispositivo_codigo 
      || (nvrUplink ? 'NVR-UP' : (entity?.codigo ? (entity.codigo.length > 7 ? entity.codigo.replace('CAM-ENG-P2-', 'C-') : entity.codigo) : (conn?.codigo ? (conn.codigo.length > 7 ? conn.codigo.replace('CAM-ENG-P2-', 'C-') : conn.codigo) : (sp?.ocupado_por_codigo || (isAlumno ? 'ALUMNO' : isWifi ? 'AP-WIFI' : isFuncionario ? 'FUNC' : '')))));

    const rosetaCodigo = portMapeo?.roseta_codigo || entity?.rosetaCodigo || null;
    const rosetaUbicacion = portMapeo?.roseta_ubicacion || entity?.subtitulo || null;

    const effectiveVlanNum = vlanNum ?? swVlan?.vlan_numero ?? null;
    const matchesVlanFilter = selectedVlanFilter !== null && effectiveVlanNum === selectedVlanFilter;
    const isVlanDimmed = selectedVlanFilter !== null && effectiveVlanNum !== selectedVlanFilter;

    // Búsqueda en tiempo real
    const isSearchActive = searchFilter.trim().length > 0;
    const q = searchFilter.toLowerCase().trim();
    const matchesSearch = isSearchActive && Boolean(
      (dispCodigo && dispCodigo.toLowerCase().includes(q)) ||
      (rosetaCodigo && rosetaCodigo.toLowerCase().includes(q)) ||
      (rosetaUbicacion && rosetaUbicacion.toLowerCase().includes(q)) ||
      (entity?.camara && (
        entity.camara.codigo.toLowerCase().includes(q) ||
        entity.camara.direccion_ip?.toLowerCase().includes(q) ||
        entity.camara.direccion_mac?.toLowerCase().includes(q) ||
        entity.camara.ubicacion_especifica?.toLowerCase().includes(q)
      )) ||
      (entity?.punto && (
        entity.punto.codigo.toLowerCase().includes(q) ||
        entity.punto.ubicacion_especifica?.toLowerCase().includes(q) ||
        entity.punto.direccion_ip?.toLowerCase().includes(q) ||
        entity.punto.direccion_mac?.toLowerCase().includes(q)
      )) ||
      (conn?.camera && (
        conn.camera.codigo.toLowerCase().includes(q) ||
        conn.camera.direccion_ip?.toLowerCase().includes(q) ||
        conn.camera.direccion_mac?.toLowerCase().includes(q) ||
        conn.camera.ubicacion_especifica?.toLowerCase().includes(q)
      )) ||
      (conn?.puntoRed && (
        conn.puntoRed.codigo.toLowerCase().includes(q) ||
        conn.puntoRed.ubicacion_especifica?.toLowerCase().includes(q) ||
        conn.puntoRed.direccion_ip?.toLowerCase().includes(q) ||
        conn.puntoRed.direccion_mac?.toLowerCase().includes(q)
      ))
    );

    const poeInfo = isSwitch ? switchPoeInfoMap[eq.id] : null;
    const isPortPoe = Boolean(isSwitch && poeInfo?.poeRes.portSet.has(pNum));
    // Requisito 2: Si todos los puertos RJ45 del switch son PoE -> no marcar puertos
    const isPortPoeMarked = Boolean(isSwitch && isPortPoe && !poeInfo?.isAllPoe);

    const isPoeHighlightActive = Boolean(isSwitch && poeHighlightBySwitch[eq.id]);
    const isPoeHighlighted = isPoeHighlightActive && isPortPoe;

    const isSelected = selectedPort?.equipoId === eq.id && selectedPort?.portNum === pNum;
    const isHovered = hoveredPort?.equipoId === eq.id && hoveredPort?.portNum === pNum;
    const isConnHighlighted = activeConnection?.id === conn?.id && conn !== undefined;

    const isDropTarget = dragOverTarget?.equipoId === eq.id && dragOverTarget?.portNum === pNum;
    const isClickSource = clickConnectSource?.equipoId === eq.id && clickConnectSource?.portNum === pNum;

    const hasActive = activeConnection !== null || selectedPort !== null;
    const isDimmed = isPoeHighlightActive
      ? !isPortPoe
      : ((hasActive && !isSelected && !isHovered && !isConnHighlighted && !isDropTarget && !isClickSource) 
          || isVlanDimmed 
          || (isSearchActive && !matchesSearch));

    // Dimensionado
    const sizeClasses = viewMode === 'all_visible'
      ? (portLayoutMode === 'single_row' && maxPortsInRack > 24
          ? 'w-9 sm:w-10 h-16 sm:h-[66px] text-[9px]'
          : 'flex-1 min-w-[38px] sm:min-w-[44px] max-w-[62px] h-16 sm:h-[66px] text-[10px]')
      : 'w-11 sm:w-12 h-16 sm:h-[66px] text-[10px]';

    // Requisito 2: Coloración y estilo según estado_visual_puerto
    const dynamicStyle: React.CSSProperties = {};
    if (isOccupied) {
      dynamicStyle.borderColor = effectiveVlanColor;
      dynamicStyle.borderStyle = 'solid';
      dynamicStyle.backgroundColor = `${effectiveVlanColor}24`;
    } else if (isEnlaceVacio) {
      dynamicStyle.borderColor = '#64748b'; // borde gris
      dynamicStyle.borderStyle = 'dashed';  // discontinuo
      dynamicStyle.backgroundColor = '#0f172a99'; // color oscuro
    } else {
      // puerto_libre: vacío (fondo oscuro o color base)
      dynamicStyle.borderColor = '#334155';
      dynamicStyle.borderStyle = 'solid';
      dynamicStyle.backgroundColor = '#0f172a40';
    }

    return (
      <button
        key={`port-${key}`}
        ref={(el) => { portDomRefs.current[key] = el; }}
        draggable={true}
        onDragStart={(e) => handleDragStartPort(e, eq, pNum)}
        onDragEnd={(e) => handleDragEndPort(e, eq, pNum)}
        onDragOver={(e) => handleDragOverPort(e, eq, pNum)}
        onDragLeave={handleDragLeavePort}
        onDrop={(e) => handleDropOnPort(e, eq, pNum)}
        onClick={() => {
          setShowInspector(true);
          handlePortClick(eq, pNum);
        }}
        onMouseEnter={() => handlePortMouseEnter(eq.id, pNum)}
        onMouseLeave={handlePortMouseLeave}
        style={dynamicStyle}
        className={`flex flex-col items-center justify-between p-1 rounded-md border text-center transition-all cursor-grab active:cursor-grabbing relative shrink-0 z-40 select-none overflow-hidden ${sizeClasses} ${
          matchesSearch
            ? 'ring-2 ring-yellow-400 bg-yellow-950/90 scale-105 shadow-xl border-yellow-400 animate-pulse'
            : matchesVlanFilter
            ? 'ring-2 ring-white scale-105 shadow-lg border-white'
            : isDropTarget
            ? 'border-amber-400 bg-amber-950 ring-2 ring-amber-400 scale-105 shadow-lg'
            : isClickSource
            ? 'border-amber-500 bg-amber-900/80 ring-2 ring-amber-400 animate-pulse'
            : isSelected 
            ? 'bg-blue-600 border-blue-300 text-white ring-2 ring-blue-400 scale-105 shadow-md'
            : isConnHighlighted
            ? 'ring-2 ring-cyan-400 shadow-md'
            : nvrUplink
            ? 'ring-1 ring-amber-400'
            : isPoeHighlighted
            ? 'ring-2 ring-amber-400 shadow-sm'
            : isEnlaceVacio
            ? 'border-dashed border-slate-500 hover:border-slate-400'
            : isOccupied
            ? 'hover:brightness-125'
            : 'text-slate-400 hover:bg-slate-800 hover:border-slate-500'
        } ${isDimmed ? 'opacity-25' : 'opacity-100'}`}
        title={
          nvrUplink 
            ? `Puerto ${pNum}: Uplink NVR (${equipos.find(e => e.id === nvrUplink.nvrId)?.codigo || 'NVR'})` 
            : isOccupied 
            ? `Puerto ${pNum}: ${dispCodigo || 'Dispositivo'} (${occupantLabel})${rosetaCodigo ? ` · Roseta: ${rosetaCodigo}${rosetaUbicacion ? ` (${rosetaUbicacion})` : ''}` : ''}${hasVlanConfigured ? ` · VLAN ${vlanNum || ''} (${swVlan?.vlan_nombre || portMapeo?.vlan_nombre || ''})` : ''}${isPortPoe ? ' · PoE ⚡' : ''}` 
            : isEnlaceVacio
            ? `Puerto ${pNum}: Enlace cableado sin dispositivo (Enlace Vacío)${rosetaCodigo ? ` · Roseta: ${rosetaCodigo}${rosetaUbicacion ? ` (${rosetaUbicacion})` : ''}` : ''}${hasVlanConfigured ? ` · VLAN Configurada: ${vlanNum || ''} (${swVlan?.vlan_nombre || portMapeo?.vlan_nombre || ''})` : ''}${isPortPoe ? ' · PoE ⚡' : ''}`
            : `Puerto ${pNum}: Puerto Libre / Disponible${hasVlanConfigured ? ` · VLAN Configurada: ${vlanNum || ''} (${swVlan?.vlan_nombre || portMapeo?.vlan_nombre || ''})` : ''}${isPortPoe ? ' · PoE ⚡' : ''}`
        }
      >
        {/* Barra superior con color de VLAN */}
        {isOccupied && hasVlanConfigured ? (
          <div 
            className="w-full h-1 rounded-t -mt-1 -mx-1 mb-0.5 shrink-0 shadow-2xs" 
            style={{ backgroundColor: effectiveVlanColor }}
            title={`VLAN ${vlanNum || ''}: ${swVlan?.vlan_nombre || portMapeo?.vlan_nombre || ''}`}
          />
        ) : (!isOccupied && hasVlanConfigured) ? (
          // Requisito 3: Borde superior de color tenue para puertos libres o enlaces vacíos
          <div 
            className="w-full h-0.5 rounded-t -mt-1 -mx-1 mb-0.5 shrink-0" 
            style={{ backgroundColor: effectiveVlanColor, opacity: 0.45 }}
            title={`VLAN Configurada: ${swVlan?.vlan_nombre || portMapeo?.vlan_nombre || `VLAN ${vlanNum}`} (Intención de configuración)`}
          />
        ) : isEnlaceVacio ? (
          <div className="w-full h-0.5 -mt-1 -mx-1 mb-0.5 shrink-0 bg-slate-600/40" />
        ) : (
          <div className="w-full h-0.5 -mt-1 -mx-1 mb-0.5 shrink-0 opacity-0" />
        )}

        {/* Fila Superior: Número de puerto + micro-icono ⚡ (10px) + Ícono de ocupante */}
        <div className="flex items-center justify-between w-full px-0.5 leading-none">
          <div className="flex items-center gap-0.5 shrink-0">
            <span className="font-mono font-bold text-[10px] sm:text-[11px] text-slate-100">
              {String(pNum).padStart(2, '0')}
            </span>
            {isPortPoeMarked && (
              <span 
                className="text-[10px] leading-none text-amber-400 select-none shrink-0 inline-flex items-center" 
                style={{ fontSize: '10px', lineHeight: '10px' }}
                title="Puerto con alimentación PoE"
              >
                ⚡
              </span>
            )}
          </div>
          {occupantIcon}
        </div>

        {/* Conector RJ45 central */}
        <div 
          className={`w-4 sm:w-5 h-2.5 sm:h-3 rounded-xs flex items-center justify-center my-0.5 pointer-events-none transition-colors ${
            isPortPoeMarked 
              ? 'bg-amber-950/90 border border-amber-400' 
              : isEnlaceVacio
              ? 'bg-slate-900 border border-slate-600'
              : 'bg-black/90 border border-slate-700'
          }`}
          title={isPortPoeMarked ? "Conector RJ45 PoE (Ámbar)" : undefined}
        >
          <span 
            className="w-2 sm:w-2.5 h-1 rounded-2xs" 
            style={{
              backgroundColor: isPortPoeMarked
                ? '#f59e0b'
                : isOccupied
                ? effectiveVlanColor
                : isEnlaceVacio
                ? '#64748b'
                : '#334155'
            }}
          />
        </div>

        {/* Fila Inferior: Código del dispositivo + Roseta / VLAN */}
        <div className="flex flex-col items-center justify-center w-full min-h-[16px] pointer-events-none leading-none px-0.5 overflow-hidden">
          {isOccupied ? (
            <>
              <span className="text-[8px] sm:text-[8.5px] font-mono font-bold tracking-tight truncate max-w-full text-white drop-shadow-xs" title={`Dispositivo: ${dispCodigo}`}>
                {dispCodigo || 'OCUPADO'}
              </span>
              <div className="flex items-center justify-center gap-0.5 mt-0.5 max-w-full">
                {rosetaCodigo && (
                  <span 
                    className="text-[6.5px] sm:text-[7px] font-mono font-medium text-slate-300 truncate max-w-[34px]"
                    title={`Roseta: ${rosetaCodigo}`}
                  >
                    {rosetaCodigo}
                  </span>
                )}
                {hasVlanConfigured ? (
                  <span 
                    className="text-[6.5px] sm:text-[7px] font-mono font-black tracking-tight leading-none px-1 py-0.5 rounded-2xs shadow-2xs shrink-0"
                    style={{
                      backgroundColor: '#000000cc',
                      color: effectiveVlanColor,
                      border: `1px solid ${effectiveVlanColor}88`
                    }}
                    title={`VLAN ${vlanNum || ''}: ${swVlan?.vlan_nombre || portMapeo?.vlan_nombre || ''}`}
                  >
                    {vlanDisplayLabel}
                  </span>
                ) : !rosetaCodigo ? (
                  <span className="text-[6.5px] sm:text-[7px] font-mono font-medium text-slate-400">
                    Sin VLAN
                  </span>
                ) : null}
              </div>
            </>
          ) : isEnlaceVacio ? (
            <>
              <span className="text-[7.5px] sm:text-[8px] font-mono font-bold tracking-tight truncate max-w-full text-slate-400" title={`Roseta: ${rosetaCodigo || 'Enlace vacío'}`}>
                ENLACE
              </span>
              <div className="flex items-center justify-center gap-0.5 mt-0.5 max-w-full">
                <span className="text-[6.5px] sm:text-[7px] font-mono font-bold tracking-tight leading-none px-1 py-0.5 rounded-2xs bg-slate-800 text-amber-300 border border-slate-600 border-dashed shrink-0">
                  VACÍO
                </span>
                {hasVlanConfigured && (
                  <span 
                    className="text-[6.5px] sm:text-[7px] font-mono font-medium tracking-tight leading-none px-1 py-0.5 rounded-2xs shrink-0 inline-flex items-center gap-0.5 bg-slate-900/90 border"
                    style={{
                      borderColor: `${effectiveVlanColor}40`,
                      color: `${effectiveVlanColor}cc`
                    }}
                    title={`VLAN Configurada: ${swVlan?.vlan_nombre || portMapeo?.vlan_nombre || `VLAN ${vlanNum}`} (Enlace sin dispositivo)`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: effectiveVlanColor, opacity: 0.7 }} />
                    <span>{vlanDisplayLabel}</span>
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="text-[8px] sm:text-[8.5px] font-mono font-medium tracking-tight truncate max-w-full text-slate-400">
                LIBRE
              </span>
              {hasVlanConfigured ? (
                <div className="flex items-center justify-center gap-0.5 mt-0.5 max-w-full">
                  <span 
                    className="text-[6.5px] sm:text-[7px] font-mono font-medium tracking-tight leading-none px-1 py-0.5 rounded-2xs shrink-0 inline-flex items-center gap-0.5 bg-slate-900/80 border"
                    style={{
                      borderColor: `${effectiveVlanColor}40`,
                      color: `${effectiveVlanColor}cc`
                    }}
                    title={`VLAN Configurada: ${swVlan?.vlan_nombre || portMapeo?.vlan_nombre || `VLAN ${vlanNum}`} (Intención de puerto disponible)`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: effectiveVlanColor, opacity: 0.75 }} />
                    <span>{vlanDisplayLabel}</span>
                  </span>
                </div>
              ) : (
                <span className="text-[6.5px] sm:text-[7px] font-mono font-medium text-slate-600 mt-0.5">
                  DISP
                </span>
              )}
            </>
          )}
        </div>
      </button>
    );
  };

  // Sort connections so active connection is rendered LAST (on top layer) in SVG
  const sortedConnections = useMemo(() => {
    return [...connections].sort((a, b) => {
      if (a.id === activeConnection?.id) return 1;
      if (b.id === activeConnection?.id) return -1;
      return 0;
    });
  }, [connections, activeConnection]);

  return (
    <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-4 lg:px-6 py-4 space-y-4">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border text-xs font-medium flex items-center gap-2.5 transition-all animate-bounce ${
          toast.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-900'
            : toast.type === 'info'
            ? 'bg-blue-50 border-blue-200 text-blue-900'
            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-600" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-600 cursor-pointer">×</button>
        </div>
      )}

      {/* Top Header & Rack Switcher */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBackToRack}
            className="p-1.5 border border-slate-300 rounded hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Volver a Elevación de Bastidor"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold font-mono text-slate-900 tracking-tight flex items-center gap-2">
                <Network className="w-5 h-5 text-blue-600" />
                <span>Diagrama Cross-Connect · {currentRack?.codigo}</span>
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-blue-100 text-blue-800 font-semibold border border-blue-200">
                {currentRack?.altura_u ? `${currentRack.altura_u}U` : 'Rack'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Interconexión física visual con Drag & Drop entre puertos de Patch Panels, Switches y NVRs.
            </p>
          </div>
        </div>

        {/* Header Right Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {allRacks.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 text-[11px] font-medium hidden md:inline">Bastidor:</span>
              <select
                value={currentRack?.id}
                onChange={(e) => {
                  const r = allRacks.find(item => item.id === e.target.value);
                  if (r) {
                    setCurrentRack(r);
                    if (onSelectRack) onSelectRack(r);
                  }
                }}
                className="px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-blue-500"
              >
                {allRacks.map(r => (
                  <option key={r.id} value={r.id}>{r.codigo}</option>
                ))}
              </select>
            </div>
          )}

          {/* Search Box with Real-time Floating Dropdown */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cámara, punto, IP, MAC..."
              value={searchFilter}
              onChange={(e) => {
                setSearchFilter(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="pl-8 pr-7 py-1.5 border border-slate-300 rounded text-xs w-44 sm:w-60 focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-white"
            />
            {searchFilter && (
              <button 
                onClick={() => {
                  setSearchFilter('');
                  setIsSearchOpen(false);
                }}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                ×
              </button>
            )}

            {/* Click outside backdrop for search dropdown */}
            {isSearchOpen && searchFilter.trim().length > 0 && (
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setIsSearchOpen(false)} 
              />
            )}

            {/* Search Results Dropdown */}
            {isSearchOpen && searchFilter.trim().length > 0 && (
              <div className="absolute right-0 top-full mt-1.5 w-80 sm:w-96 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden font-mono text-xs max-h-96 overflow-y-auto">
                <div className="p-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-sans">
                  <span>Resultados para "{searchFilter}"</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {searchResults.totalCount} {searchResults.totalCount === 1 ? 'coincidencia' : 'coincidencias'}
                  </span>
                </div>

                {searchResults.totalCount === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-[11px] font-sans">
                    No se encontraron cámaras ni puntos de red coincidentes.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {/* Cameras */}
                    {searchResults.cameras.length > 0 && (
                      <div className="p-1">
                        <span className="px-2 py-1 text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          Cámaras CCTV ({searchResults.cameras.length})
                        </span>
                        {searchResults.cameras.map(cam => {
                          const pp = cam.patch_panel_id ? equipos.find(e => e.id === cam.patch_panel_id) : null;
                          const sw = cam.switch_id ? equipos.find(e => e.id === cam.switch_id) : null;
                          const swNum = parseSwitchPortNumber(cam.puerto_switch);

                          return (
                            <button
                              key={`search-cam-${cam.id}`}
                              type="button"
                              onClick={() => {
                                setIsSearchOpen(false);
                                setShowInspector(true);
                                if (pp && cam.puerto_patch) {
                                  handlePortClick(pp, cam.puerto_patch);
                                  scrollToPort(pp.id, cam.puerto_patch);
                                } else if (sw && swNum) {
                                  handlePortClick(sw, swNum);
                                  scrollToPort(sw.id, swNum);
                                }
                              }}
                              className="w-full text-left p-2 hover:bg-blue-50/70 rounded transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="p-1 rounded bg-cyan-100 text-cyan-700 shrink-0">
                                  <Camera className="w-3.5 h-3.5" />
                                </span>
                                <div className="min-w-0">
                                  <span className="font-bold text-slate-900 block truncate group-hover:text-blue-700">
                                    {cam.codigo}
                                  </span>
                                  <span className="text-[10px] text-slate-500 block truncate font-sans">
                                    {cam.marca_rel?.nombre || cam.marca || 'CCTV'} · {cam.direccion_ip || 'Sin IP'}
                                    {cam.ubicacion_especifica ? ` · ${cam.ubicacion_especifica}` : ''}
                                  </span>
                                </div>
                              </div>
                              <div className="text-[10px] text-right font-mono text-slate-600 shrink-0">
                                {pp && cam.puerto_patch ? (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                                    {pp.codigo} P{cam.puerto_patch}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">Sin puerto</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Puntos de Red */}
                    {searchResults.puntos.length > 0 && (
                      <div className="p-1">
                        <span className="px-2 py-1 text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          Puntos de Red ({searchResults.puntos.length})
                        </span>
                        {searchResults.puntos.map(pto => {
                          const pp = pto.patch_panel_id ? equipos.find(e => e.id === pto.patch_panel_id) : null;
                          const sw = pto.switch_id ? equipos.find(e => e.id === pto.switch_id) : null;
                          let swNum: number | null = null;
                          if (pto.puerto_switch_id) {
                            const sp = switchPortsOccupation.find(s => s.puerto_switch_id === pto.puerto_switch_id);
                            if (sp) swNum = sp.numero_puerto;
                          }

                          return (
                            <button
                              key={`search-pto-${pto.id}`}
                              type="button"
                              onClick={() => {
                                setIsSearchOpen(false);
                                setShowInspector(true);
                                if (pp && pto.puerto_patch) {
                                  handlePortClick(pp, pto.puerto_patch);
                                  scrollToPort(pp.id, pto.puerto_patch);
                                } else if (sw && swNum) {
                                  handlePortClick(sw, swNum);
                                  scrollToPort(sw.id, swNum);
                                }
                              }}
                              className="w-full text-left p-2 hover:bg-cyan-50/70 rounded transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`p-1 rounded shrink-0 ${
                                  pto.tipo_punto === 'wifi_ap'
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : pto.tipo_punto === 'datos_alumno'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}>
                                  {pto.tipo_punto === 'wifi_ap' ? (
                                    <Wifi className="w-3.5 h-3.5" />
                                  ) : pto.tipo_punto === 'datos_alumno' ? (
                                    <GraduationCap className="w-3.5 h-3.5" />
                                  ) : (
                                    <Briefcase className="w-3.5 h-3.5" />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <span className="font-bold text-slate-900 block truncate group-hover:text-cyan-800">
                                    {pto.codigo}
                                  </span>
                                  <span className="text-[10px] text-slate-500 block truncate font-sans">
                                    {pto.tipo_punto === 'wifi_ap' ? 'WiFi AP' : pto.tipo_punto === 'datos_alumno' ? 'Datos Alumno' : 'Datos Funcionario'}
                                    {pto.direccion_ip ? ` · IP: ${pto.direccion_ip}` : ''}
                                    {pto.ubicacion_especifica ? ` · ${pto.ubicacion_especifica}` : ''}
                                  </span>
                                </div>
                              </div>
                              <div className="text-[10px] text-right font-mono text-slate-600 shrink-0">
                                {pp && pto.puerto_patch ? (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                                    {pp.codigo} P{pto.puerto_patch}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">Sin puerto</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Toggle Sidebar Width */}
          <button
            onClick={() => {
              setShowInspector(prev => !prev);
              setTimeout(scheduleCableRecalc, 80);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
              !showInspector
                ? 'bg-blue-600 border-blue-700 text-white'
                : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700'
            }`}
            title={showInspector ? "Expandir diagrama al 100% de la pantalla" : "Mostrar panel lateral de detalle"}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{showInspector ? 'Pantalla Completa' : 'Ver Ficha Lateral'}</span>
          </button>

          <button
            onClick={() => setIsDeviceBodegaOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Archive className="w-4 h-4 text-amber-600" />
            <span>Cajón Bodega</span>
          </button>

          {/* Import CSV Modal Button */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            title="Importar APs y Cámaras masivamente mediante archivo CSV"
          >
            <Upload className="w-4 h-4 text-blue-600" />
            <span>Importar CSV</span>
          </button>

          {/* Export CSV Button */}
          <button
            onClick={handleExportMatrixCSV}
            disabled={connections.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
            title="Exportar matriz de conexiones a CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
      </div>

      {/* Interactive Helper Banner when Click-to-Connect is active */}
      {clickConnectSource && (
        <div className="p-3 bg-amber-500 text-slate-950 font-mono text-xs rounded-lg shadow-md flex items-center justify-between animate-pulse border border-amber-600 sticky top-16 z-40">
          <div className="flex items-center gap-2 font-bold">
            <Cable className="w-4 h-4" />
            <span>
              {clickConnectSource.type === 'nvr-uplink'
                ? 'Conectando Uplink de NVR... Haz clic en cualquier puerto de Switch o Patch Panel para fijar el enlace.'
                : `Conectando desde ${clickConnectSource.equipoCodigo} [Puerto ${clickConnectSource.portNum}]... Haz clic en el puerto de destino (ej. P01 a P48) para enlazar.`
              }
            </span>
          </div>
          <button
            onClick={() => setClickConnectSource(null)}
            className="px-2.5 py-1 bg-slate-900 text-white text-[11px] rounded hover:bg-black font-semibold cursor-pointer"
          >
            Cancelar (Esc)
          </button>
        </div>
      )}

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs flex items-center gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded border border-emerald-200 shrink-0">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-500 uppercase block leading-none">Switches</span>
            <span className="text-sm font-mono font-bold text-slate-900">{totalSwitchCount} activos</span>
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs flex items-center gap-3">
          <div className="p-2 bg-slate-100 text-slate-700 rounded border border-slate-200 shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-500 uppercase block leading-none">Patch Panels</span>
            <span className="text-sm font-mono font-bold text-slate-900">{totalPatchPanelCount} instalados</span>
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-200 shrink-0">
            <Cable className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-500 uppercase block leading-none">Cross-Connects</span>
            <span className="text-sm font-mono font-bold text-blue-600">{totalCrossConnects} enlaces</span>
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded border border-indigo-200 shrink-0">
            <HardDrive className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono text-slate-500 uppercase block leading-none">Canales NVR</span>
            <span className="text-sm font-mono font-bold text-indigo-700">{totalNvrChannels} grabándose</span>
          </div>
        </div>
      </div>

      {/* VLAN Interactive Strip & Graphic Legend */}
      {activeRackVlans.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-white flex flex-wrap items-center justify-between gap-3 shadow-xs font-mono text-xs">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-blue-900/60 text-blue-400 rounded border border-blue-700/60">
              <Tag className="w-3.5 h-3.5" />
            </span>
            <div>
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-tight block">
                VLANs en este Rack ({activeRackVlans.length}):
              </span>
              <span className="text-[10px] text-slate-400 font-sans block">
                Haz clic en una VLAN para ver y resaltar todos sus puertos en el diagrama
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedVlanFilter(null)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all border cursor-pointer ${
                selectedVlanFilter === null
                  ? 'bg-blue-600 text-white border-blue-400 shadow-xs'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-700'
              }`}
            >
              Todas ({switchPortsOccupation.filter(sp => sp.vlan_numero).length}p)
            </button>
            {activeRackVlans.map((v) => {
              const isSelected = selectedVlanFilter === v.numero;
              return (
                <button
                  key={v.numero}
                  type="button"
                  onClick={() => setSelectedVlanFilter(isSelected ? null : v.numero)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold transition-all border cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-white scale-105 shadow-md brightness-125'
                      : 'hover:brightness-125'
                  }`}
                  style={{
                    backgroundColor: isSelected ? (v.color || '#3b82f6') : `${v.color || '#3b82f6'}22`,
                    borderColor: v.color || '#3b82f6',
                    color: isSelected ? '#ffffff' : (v.color || '#38bdf8')
                  }}
                  title={`Filtrar/Resaltar puertos en VLAN ${v.numero} (${v.nombre || 'Sin nombre'}) - ${v.count} puertos`}
                >
                  <span
                    className="w-2 h-2 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: isSelected ? '#ffffff' : (v.color || '#3b82f6') }}
                  />
                  <span>VLAN {v.numero}</span>
                  {v.nombre && <span className="opacity-90 font-normal">({v.nombre})</span>}
                  <span className={`px-1 py-0.1 rounded-full text-[9px] ${isSelected ? 'bg-black/30 text-white' : 'bg-black/40 text-slate-200'}`}>
                    {v.count}p
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* LEYENDA VISIBLE DE ÍCONOS DE OCUPANTES */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-white flex flex-wrap items-center justify-between gap-3 shadow-xs font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="p-1 bg-slate-800 text-slate-300 rounded border border-slate-700">
            <Tag className="w-3.5 h-3.5 text-blue-400" />
          </span>
          <div>
            <span className="text-[11px] font-bold text-slate-200 uppercase tracking-tight block">
              Leyenda de Ocupantes (RJ45):
            </span>
            <span className="text-[10px] text-slate-400 font-sans block">
              Identificación visual por tipo de dispositivo conectado en el puerto
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap text-[11px]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700 text-slate-200" title="Cámara de Videovigilancia CCTV">
            <Camera className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="font-medium">Cámara CCTV</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700 text-slate-200" title="Punto de Red para Datos de Funcionarios / Personal">
            <Briefcase className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-medium">Datos Funcionario</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700 text-slate-200" title="Punto de Red para Datos de Alumnos / Sala de Clases">
            <GraduationCap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-medium">Datos Alumno</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700 text-slate-200" title="Punto de Acceso Inalámbrico WiFi AP">
            <Wifi className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-medium">AP WiFi</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 border border-slate-700 text-amber-300" title="Puerto de Switch con alimentación PoE">
            <span className="text-[10px] leading-none">⚡</span>
            <span className="font-medium">Puerto PoE</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/90 border border-dashed border-slate-500 text-slate-300" title="Enlace cableado sin dispositivo final conectado (borde gris discontinuo)">
            <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-medium">Enlace Vacío</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/40 border border-slate-700/60 text-slate-400" title="Puerto libre y disponible para recibir enlaces">
            <span className="w-3 h-3 rounded-2xs bg-slate-800 border border-slate-700 inline-block shrink-0" />
            <span className="text-[10px]">Puerto Libre</span>
          </div>
        </div>
      </div>

      {/* Main Container: Full Width Diagram Canvas + Inspector Panel */}
      <div className="flex flex-col lg:flex-row gap-5 items-start w-full">
        {/* LEFT / CENTER: Vertical Cross-Connect Diagram Canvas (expands to full screen width) */}
        <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs w-full">
          {/* Canvas Subheader with Interactive Drag&Drop Tips & View Controls */}
          <div className="flex flex-wrap items-center justify-between pb-3 mb-4 border-b border-slate-200 text-xs gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-slate-800 font-bold uppercase text-[11px]">
                Diagrama Físico · {maxPortsInRack} Puertos por Equipo
              </span>
            </div>

            {/* CONTROLS BAR: 2 Clear Modes (Todos Visibles vs Scroll Independiente Elástico) */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Primary View Mode Switch */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-300 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('all_visible');
                    setTimeout(scheduleCableRecalc, 50);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded transition-all font-bold cursor-pointer ${
                    viewMode === 'all_visible'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Todos los Puertos Visibles: Muestra los puertos 1 al 48 simultáneamente en pantalla sin scroll para enlazar fácilmente"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Todos Visibles (1..{maxPortsInRack})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setViewMode('independent_scroll');
                    setTimeout(scheduleCableRecalc, 50);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded transition-all font-bold cursor-pointer ${
                    viewMode === 'independent_scroll'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Scroll Independiente: Cada equipo tiene su propio scroll horizontal con cables elásticos que se adaptan en tiempo real"
                >
                  <MoveHorizontal className="w-3.5 h-3.5" />
                  <span>Scroll Independiente</span>
                </button>
              </div>

              {/* In All-Visible Mode: Port Rows & Zoom options */}
              {viewMode === 'all_visible' ? (
                <div className="flex items-center gap-1.5">
                  {/* Row toggle */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200 text-[10px] font-mono">
                    <button
                      onClick={() => {
                        setPortLayoutMode('dual_row');
                        setTimeout(scheduleCableRecalc, 50);
                      }}
                      className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                        portLayoutMode === 'dual_row' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                      }`}
                      title="2 Filas (Impares arriba / Pares abajo, estándar de 24 columnas)"
                    >
                      2 Filas
                    </button>
                    <button
                      onClick={() => {
                        setPortLayoutMode('single_row');
                        setTimeout(scheduleCableRecalc, 50);
                      }}
                      className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                        portLayoutMode === 'single_row' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                      }`}
                      title="1 Fila Continua"
                    >
                      1 Fila
                    </button>
                  </div>

                  {/* Zoom controls to fit any screen */}
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200 text-[10px] font-mono">
                    <button
                      onClick={() => {
                        setZoomScale(prev => Math.max(70, prev - 10));
                        setTimeout(scheduleCableRecalc, 60);
                      }}
                      className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer"
                      title="Reducir zoom para ajustar a pantalla"
                    >
                      <ZoomOut className="w-3 h-3" />
                    </button>
                    <span className="px-1 text-slate-700 font-bold">{zoomScale}%</span>
                    <button
                      onClick={() => {
                        setZoomScale(prev => Math.min(100, prev + 10));
                        setTimeout(scheduleCableRecalc, 60);
                      }}
                      className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer"
                      title="Aumentar zoom"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200 hidden sm:inline-block">
                  Cables elásticos dinámicos a 60 FPS
                </span>
              )}
            </div>
          </div>

          {/* MAIN DIAGRAM CANVAS:
              Mode 1 ('all_visible'): Width is 100%, everything fits on screen at once, no scrollbar.
              Mode 2 ('independent_scroll'): Width is 100%, and each equipment bay scrolls independently! */}
          <div 
            className="rounded-lg bg-slate-900/5 p-2 sm:p-3 relative overflow-hidden"
            onDragOver={handleContainerDragOver}
            onDrop={handleContainerDrop}
          >
            {/* Zona de soltar para desconectar cuando se arrastra fuera del puerto */}
            {activeDrag?.sourceType === 'port' && (activeDrag.conexionId || activeDrag.dispositivoId || activeDrag.camaraId || activeDrag.puntoRedId) && (
              <div 
                onDragOver={handleContainerDragOver}
                onDrop={handleContainerDrop}
                className="mb-2 p-2.5 rounded-lg border-2 border-dashed border-rose-500 bg-rose-950/80 text-rose-200 text-xs font-semibold flex items-center justify-center gap-2 animate-pulse shadow-lg z-50 relative cursor-pointer"
              >
                <Unlink className="w-4 h-4 text-rose-400" />
                <span>Suelta aquí o fuera de los puertos para Desconectar el dispositivo</span>
              </div>
            )}
            <div 
              ref={diagramRef} 
              className="relative pb-6 select-none w-full transition-transform origin-top-left"
              style={{ 
                transform: viewMode === 'all_visible' && zoomScale < 100 ? `scale(${zoomScale / 100})` : undefined,
                transformOrigin: 'top left',
                width: viewMode === 'all_visible' && zoomScale < 100 ? `${10000 / zoomScale}%` : '100%'
              }}
            >
              {/* SVG OVERLAY: Dynamic Bezier Cross-Connect Cables */}
              {/* Z-Index 30: IN FRONT OF equipment chassis (z-10) so lines and active highlights are completely visible */}
              <svg 
                className="absolute inset-0 w-full h-full pointer-events-none z-30"
                style={{ overflow: 'visible', width: '100%', height: '100%' }}
              >
                <defs>
                  <filter id="cableGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="nvrGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="dragGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Cross-Connect Lines between Patch Panels & Switches */}
                {sortedConnections.map(conn => {
                  const p = cablePaths[conn.id];
                  if (!p) return null;

                  const isConnActive = activeConnection?.id === conn.id;
                  const hasAnyActive = activeConnection !== null;

                  let opacity = 0.70;
                  let strokeWidth = 2.4;
                  if (hasAnyActive) {
                    if (isConnActive) {
                      opacity = 1;
                      strokeWidth = 4.2;
                    } else {
                      opacity = 0.12;
                      strokeWidth = 1.4;
                    }
                  }

                  return (
                    <g key={`cable-g-${conn.id}`}>
                      {/* Visible Cat6 Cable Path */}
                      <path
                        d={p.d}
                        fill="none"
                        stroke={conn.color}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        opacity={opacity}
                        filter={isConnActive ? 'url(#cableGlow)' : undefined}
                        className="transition-all duration-75 pointer-events-stroke cursor-pointer"
                        onMouseEnter={() => handlePortMouseEnter(conn.patchPanelId, conn.patchPort)}
                        onMouseLeave={handlePortMouseLeave}
                        onClick={() => {
                          const pp = equipos.find(e => e.id === conn.patchPanelId);
                          if (pp) handlePortClick(pp, conn.patchPort);
                        }}
                      />
                      {isConnActive && (
                        <>
                          <circle cx={p.x1} cy={p.y1} r={5} fill={conn.color} className="animate-pulse" />
                          <circle cx={p.x2} cy={p.y2} r={5} fill={conn.color} className="animate-pulse" />
                        </>
                      )}
                    </g>
                  );
                })}

                {/* NVR Uplink Network Lines */}
                {rackNvrs.map(nvr => {
                  const up = nvrUplinkPaths[nvr.id];
                  if (!up) return null;
                  const isSelected = selectedNvrId === nvr.id || selectedPort?.nvrId === nvr.id;

                  return (
                    <g key={`nvr-up-g-${nvr.id}`}>
                      <path
                        d={up.d}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={isSelected ? 3.6 : 2.2}
                        strokeDasharray="6,4"
                        opacity={isSelected ? 1 : 0.85}
                        filter={isSelected ? 'url(#nvrGlow)' : undefined}
                        className="transition-all duration-75 pointer-events-none"
                      />
                      {isSelected && (
                        <>
                          <circle cx={up.x1} cy={up.y1} r={4.5} fill="#f59e0b" className="animate-ping" />
                          <circle cx={up.x2} cy={up.y2} r={4.5} fill="#f59e0b" />
                        </>
                      )}
                    </g>
                  );
                })}

                {/* LIVE ELASTIC RUBBER CABLE PREVIEW DURING DRAG */}
                {activeDrag && dragMouseCoord && (
                  <g key="drag-preview-cable">
                    {(() => {
                      const sx = activeDrag.startX ?? 0;
                      const sy = activeDrag.startY ?? 0;
                      let mx = dragMouseCoord.x;
                      let my = dragMouseCoord.y;

                      // If dragging over a valid target port, snap line to that port's center
                      if (dragOverTarget && diagramRef.current) {
                        const targetEl = portDomRefs.current[makePortKey(dragOverTarget.equipoId, dragOverTarget.portNum)];
                        if (targetEl) {
                          const tRect = targetEl.getBoundingClientRect();
                          const cRect = diagramRef.current.getBoundingClientRect();
                          mx = tRect.left + tRect.width / 2 - cRect.left;
                          my = tRect.top + tRect.height / 2 - cRect.top;
                        }
                      }

                      const dy = my - sy;
                      const cpY1 = sy + dy * 0.45;
                      const cpY2 = sy + dy * 0.55;
                      const d = `M ${sx} ${sy} C ${sx} ${cpY1}, ${mx} ${cpY2}, ${mx} ${my}`;

                      return (
                        <>
                          <path
                            d={d}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth={3.8}
                            strokeDasharray="5,3"
                            filter="url(#dragGlow)"
                            className="pointer-events-none"
                          />
                          <circle cx={sx} cy={sy} r={5} fill="#f59e0b" />
                          <circle cx={mx} cy={my} r={6} fill="#fbbf24" className="animate-ping" />
                        </>
                      );
                    })()}
                  </g>
                )}
              </svg>

              {/* STACK OF EQUIPMENT ROWS: Vertically ordered by U position (descending) */}
              <div className="space-y-8 relative z-10">
                {rackBayEquipos.map((eq) => {
                  const isSwitch = eq.tipo === 'switch';
                  const rj45Ports = isSwitch
                    ? (switchPortsOccupation.filter(sp => sp.switch_id === eq.id && sp.tipo_puerto !== 'sfp').map(sp => sp.numero_puerto).sort((a, b) => a - b))
                    : [];
                  const totalRj45Count = isSwitch 
                    ? (rj45Ports.length > 0 ? rj45Ports.length : (eq.puertos_totales || 24))
                    : (eq.puertos_totales || 24);

                  const portList: number[] = isSwitch && rj45Ports.length > 0
                    ? rj45Ports
                    : Array.from({ length: totalRj45Count }, (_, i) => i + 1);

                  const uPos = eq.posicion_u_inicio ?? eq.posicion_u_fin;

                  let connectedCount = 0;
                  for (const p of portList) {
                    const k = makePortKey(eq.id, p);
                    if (isSwitch ? switchPortToEntity[k] : patchPortToEntity[k]) {
                      connectedCount++;
                    }
                  }

                  const headerBg = isSwitch 
                    ? 'bg-slate-900 border-l-4 border-l-emerald-500 text-slate-100' 
                    : 'bg-slate-800 border-l-4 border-l-indigo-500 text-slate-100';

                  const bayBg = isSwitch ? 'bg-[#0f172a]' : 'bg-[#1e293b]';
                  const isIndependent = viewMode === 'independent_scroll';

                  return (
                    <div 
                      key={eq.id}
                      className="rounded-lg border border-slate-700/80 shadow-md overflow-hidden bg-slate-900"
                    >
                      {/* Equipment Chassis Faceplate Header */}
                      <div className={`px-4 py-2 flex flex-wrap items-center justify-between gap-2 ${headerBg}`}>
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded ${isSwitch ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-indigo-950 text-indigo-400 border border-indigo-800'}`}>
                            {isSwitch ? <Cpu className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs tracking-tight text-white">
                                {eq.codigo}
                              </span>
                              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold uppercase ${
                                isSwitch 
                                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700' 
                                  : 'bg-indigo-900/60 text-indigo-300 border border-indigo-700'
                              }`}>
                                {isSwitch ? 'SWITCH GIGABIT' : 'PATCH PANEL'}
                              </span>
                              {uPos && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-700 text-slate-200">
                                  U{uPos}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
                              <span>{eq.marca_rel?.nombre || eq.marca || ''} {eq.modelo_rel?.nombre || eq.modelo || ''}</span>
                              {eq.ip_gestion && (
                                <span>· IP: {eq.ip_gestion}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* In Independent Scroll Mode: Port Bank Selector for instant jump */}
                        <div className="flex items-center gap-3">
                          {isIndependent && (
                            <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-1 rounded border border-slate-700 text-[10px] font-mono">
                              <span className="text-slate-400 text-[9px] mr-1 hidden sm:inline">Desplazar a:</span>
                              <button
                                type="button"
                                onClick={() => scrollToPort(eq.id, 1)}
                                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                                title="Desplazar a puerto 1"
                              >
                                P01
                              </button>
                              {totalRj45Count >= 24 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => scrollToPort(eq.id, Math.floor(totalRj45Count / 2))}
                                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                                    title={`Desplazar a puerto ${Math.floor(totalRj45Count / 2)}`}
                                  >
                                    P{Math.floor(totalRj45Count / 2)}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => scrollToPort(eq.id, totalRj45Count)}
                                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                                    title={`Desplazar a puerto ${totalRj45Count}`}
                                  >
                                    P{totalRj45Count}
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {(() => {
                            const occPct = totalRj45Count > 0 ? Math.round((connectedCount / totalRj45Count) * 100) : 0;
                            const occ = getOccupancyStatus(occPct);
                            const poeInfo = isSwitch ? switchPoeInfoMap[eq.id] : null;
                            const isPoeHighlight = Boolean(isSwitch && poeHighlightBySwitch[eq.id]);

                            return (
                              <div className="flex items-center gap-2">
                                {/* Requisito 2: Si todos los puertos RJ45 del switch son PoE -> Insignia en el encabezado "⚡ PoE n/n · estándar" junto al semáforo */}
                                {isSwitch && poeInfo?.isAllPoe && (
                                  <div 
                                    className="px-2 py-0.5 rounded border border-amber-500/60 bg-amber-950/70 text-amber-300 text-[10px] font-mono font-semibold flex items-center gap-1 select-none"
                                    title={`Todos los puertos RJ45 entregan PoE (${totalRj45Count}/${totalRj45Count})${poeInfo.estandarShort ? ` · Estándar ${poeInfo.estandarShort}` : ''}`}
                                  >
                                    <span>⚡ PoE {totalRj45Count}/{totalRj45Count} · {poeInfo.estandarShort || 'estándar'}</span>
                                  </div>
                                )}

                                {/* Requisito 4: Toggle "⚡ PoE" en el encabezado del switch: resalta puertos PoE y atenúa el resto */}
                                {isSwitch && poeInfo?.isPartialPoe && (
                                  <button
                                    type="button"
                                    onClick={() => togglePoeHighlight(eq.id)}
                                    className={`px-2 py-0.5 rounded border text-[10px] font-mono font-semibold flex items-center gap-1 transition-colors cursor-pointer select-none ${
                                      isPoeHighlight
                                        ? 'bg-amber-500/25 border-amber-400 text-amber-200 ring-1 ring-amber-400/50'
                                        : 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700 hover:border-amber-500/60'
                                    }`}
                                    title={
                                      isPoeHighlight 
                                        ? `Quitar resalte PoE (${poeInfo.poeRes.count}/${totalRj45Count})` 
                                        : `Resaltar puertos PoE (${poeInfo.poeRes.count}/${totalRj45Count}) y atenuar el resto`
                                    }
                                  >
                                    <span>⚡ PoE</span>
                                  </button>
                                )}

                                <div 
                                  className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold flex items-center gap-1.5 ${
                                    occ.status === 'critico'
                                      ? 'bg-rose-950/90 text-rose-200 border-rose-500 animate-pulse'
                                      : occ.status === 'alerta'
                                      ? 'bg-amber-950/90 text-amber-200 border-amber-500'
                                      : 'bg-emerald-950/90 text-emerald-200 border-emerald-500'
                                  }`}
                                  title={`Estándar 75%: ${occ.label}. ${occ.recommendation}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    occ.status === 'critico' ? 'bg-rose-400' : occ.status === 'alerta' ? 'bg-amber-400' : 'bg-emerald-400'
                                  }`} />
                                  <span>{occPct}%</span>
                                  <span className="hidden sm:inline font-normal opacity-90">({connectedCount}/{totalRj45Count})</span>
                                </div>
                                <div className="text-right text-[11px] font-mono hidden md:block">
                                  <span className="text-slate-300 font-bold block text-[10px]">
                                    {totalRj45Count - connectedCount} libres
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Ports Bay:
                          In 'all_visible': Fits 100% width, no overflow, ports 1..48 are 100% visible at the same time.
                          In 'independent_scroll': Has independent overflow-x-auto, recalculating cables at 60fps onScroll! */}
                      <div 
                        ref={(el) => { bayScrollRefs.current[eq.id] = el; }}
                        onScroll={isIndependent ? scheduleCableRecalc : undefined}
                        className={`p-3.5 ${bayBg} relative ${isIndependent ? 'overflow-x-auto scrollbar-thin' : 'overflow-hidden'}`}
                      >
                        {portLayoutMode === 'single_row' ? (
                          /* 1. SINGLE ROW MODE: 1 continuous horizontal sequence */
                          <div className={`flex items-center gap-1.5 ${isIndependent ? 'min-w-max' : 'w-full'}`}>
                            {portList.map((pNum, idx) => (
                              <React.Fragment key={`port-wrap-${eq.id}-${pNum}`}>
                                {renderPortButton(eq, pNum)}
                                {(idx + 1) % 6 === 0 && idx + 1 < portList.length && (
                                  <div className="h-10 w-px bg-slate-700 mx-0.5 shrink-0" />
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        ) : (
                          /* 2. DUAL ROW MODE: 48 ports fit in only 24 columns, perfectly fitting on any screen! */
                          <div className={`flex flex-col gap-2 ${isIndependent ? 'min-w-max' : 'w-full'}`}>
                            {/* Row 1: Odds */}
                            {(() => {
                              const oddPorts = portList.filter((_, idx) => idx % 2 === 0);
                              return (
                                <div className="flex items-center gap-1.5 w-full">
                                  {oddPorts.map((pNum, idx) => (
                                    <React.Fragment key={`port-wrap-${eq.id}-${pNum}`}>
                                      {renderPortButton(eq, pNum)}
                                      {(idx + 1) % 6 === 0 && idx + 1 < oddPorts.length && (
                                        <div className="h-10 w-px bg-slate-700 mx-0.5 shrink-0" />
                                      )}
                                    </React.Fragment>
                                  ))}
                                </div>
                              );
                            })()}
                            {/* Row 2: Evens */}
                            {(() => {
                              const evenPorts = portList.filter((_, idx) => idx % 2 === 1);
                              return (
                                <div className="flex items-center gap-1.5 w-full">
                                  {evenPorts.map((pNum, idx) => (
                                    <React.Fragment key={`port-wrap-${eq.id}-${pNum}`}>
                                      {renderPortButton(eq, pNum)}
                                      {(idx + 1) % 6 === 0 && idx + 1 < evenPorts.length && (
                                        <div className="h-10 w-px bg-slate-700 mx-0.5 shrink-0" />
                                      )}
                                    </React.Fragment>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* NVR SECTION: Compact box per NVR with Draggable Uplink Plug */}
                {rackNvrs.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[11px] font-mono text-slate-500 font-semibold uppercase mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Unidades NVR Grabador (Uplink de Red IP a Switch o Patch Panel)</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-sans italic">
                        Arrastra el plug [Uplink] a un puerto de Switch o Patch Panel
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl">
                      {rackNvrs.map(nvr => {
                        const recordedCameras = camaras.filter(c => c.nvr_id === nvr.id);
                        const channelCount = recordedCameras.length;
                        const uPos = nvr.posicion_u_inicio ?? nvr.posicion_u_fin;
                        const uplink = nvrUplinks[nvr.id];
                        const isNvrSelected = selectedNvrId === nvr.id;

                        const targetEq = uplink ? equipos.find(e => e.id === uplink.targetEquipoId) : null;

                        return (
                          <div
                            key={nvr.id}
                            ref={(el) => { nvrDomRefs.current[nvr.id] = el; }}
                            onClick={() => {
                              setSelectedNvrId(nvr.id);
                              setSelectedPort(null);
                            }}
                            className={`bg-[#0f172a] border rounded-lg p-3.5 shadow-sm text-slate-200 transition-all cursor-pointer ${
                              isNvrSelected 
                                ? 'border-indigo-400 ring-2 ring-indigo-400/60' 
                                : 'border-slate-800 hover:border-slate-700'
                            } border-l-4 border-l-indigo-500`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800">
                                  <HardDrive className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold text-xs text-white">
                                      {nvr.codigo}
                                    </span>
                                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700 font-semibold">
                                      NVR
                                    </span>
                                    {uPos && (
                                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                        U{uPos}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {nvr.marca_rel?.nombre || nvr.marca || ''} {nvr.modelo_rel?.nombre || nvr.modelo || 'Grabador Central'}
                                  </div>
                                </div>
                              </div>

                              {/* DRAGGABLE UPLINK PLUG */}
                              <div
                                draggable={true}
                                onDragStart={(e) => handleDragStartNvr(e, nvr.id)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setClickConnectSource({
                                    type: 'nvr-uplink',
                                    nvrId: nvr.id
                                  });
                                }}
                                className="group flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-500/80 bg-amber-950/70 hover:bg-amber-900/90 text-amber-200 cursor-grab active:cursor-grabbing transition-all shadow-xs"
                                title="Arrastra este enlace hacia un puerto de Switch o Patch Panel"
                              >
                                <GripVertical className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-200" />
                                <Cable className="w-3 h-3 text-amber-400" />
                                <span className="text-[10px] font-mono font-bold">
                                  {uplink && targetEq ? `${targetEq.codigo} [P${uplink.targetPortNum}]` : 'Uplink GigE'}
                                </span>
                              </div>
                            </div>

                            {/* Recording Stats */}
                            {(() => {
                              const nvrCap = nvr.canales_totales || 16;
                              const occPct = nvrCap > 0 ? Math.round((channelCount / nvrCap) * 100) : 0;
                              const occ = getOccupancyStatus(occPct);
                              return (
                                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                                  <span className="text-slate-400">Canales CCTV Asignados:</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-indigo-300 font-bold">
                                      {channelCount} / {nvrCap}
                                    </span>
                                    <span className={`px-1.5 py-0.2 rounded border text-[9px] font-bold ${
                                      occ.status === 'critico'
                                        ? 'bg-rose-950 text-rose-300 border-rose-600'
                                        : occ.status === 'alerta'
                                        ? 'bg-amber-950 text-amber-300 border-amber-600'
                                        : 'bg-emerald-950 text-emerald-300 border-emerald-600'
                                    }`} title={`Estándar 75%: ${occ.label}. ${occ.recommendation}`}>
                                      {occPct}% ({occ.label})
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Uplink Destination Indicator */}
                            <div className="mt-1.5 text-[10px] font-mono flex items-center justify-between text-slate-400">
                              <span>Destino de Red:</span>
                              <span className={uplink ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
                                {uplink && targetEq 
                                  ? `${targetEq.tipo === 'switch' ? 'Switch' : 'Patch Panel'} ${targetEq.codigo} · Puerto ${uplink.targetPortNum}`
                                  : 'Conexión a Switch principal (Uplink 1G)'
                                }
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Port, NVR & Cross-Connect Inspector Panel (Sticky) */}
        {showInspector && (
          <div className="w-full lg:w-80 xl:w-96 shrink-0 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden sticky top-20">
          {/* Header of Inspector */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                {inspectedNvr ? 'Configuración de NVR' : 'Ficha Técnica de Enlace'}
              </span>
              <div className="text-sm font-bold font-mono text-slate-900">
                {inspectedNvr 
                  ? `Grabador ${inspectedNvr.codigo}` 
                  : selectedPort 
                  ? `${equipos.find(e => e.id === selectedPort.equipoId)?.codigo || 'Equipo'} > Puerto ${String(selectedPort.portNum).padStart(2, '0')}`
                  : 'Sin puerto seleccionado'
                }
              </div>
            </div>

            {(selectedPort || inspectedNvr) && (
              <button
                onClick={() => {
                  setSelectedPort(null);
                  setSelectedNvrId(null);
                }}
                className="text-[11px] font-mono text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Cerrar
              </button>
            )}
          </div>

          {/* Body of Inspector */}
          <div className="p-5 text-xs">
            {/* VIEW A: INSPECTING NVR */}
            {inspectedNvr ? (
              <div className="space-y-4">
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-indigo-950 flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4 text-indigo-600" />
                      <span>{inspectedNvr.codigo}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-200 text-indigo-900 font-bold">
                      NVR IP
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-800 font-sans">
                    {inspectedNvr.marca_rel?.nombre || inspectedNvr.marca || ''} {inspectedNvr.modelo_rel?.nombre || inspectedNvr.modelo || ''}
                  </p>
                </div>

                {/* Form to configure NVR network uplink */}
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                  <div className="font-mono text-[11px] font-bold text-slate-800 uppercase flex items-center gap-1.5">
                    <Cable className="w-3.5 h-3.5 text-amber-500" />
                    <span>Conexión de Red / Uplink del NVR</span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
                    Puedes interconectar el NVR directamente a un puerto de <strong>Switch</strong> o de <strong>Patch Panel</strong> arrastrando el plug o seleccionándolo aquí:
                  </p>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Equipo de Destino en el Rack:
                    </label>
                    <select
                      value={currentNvrUplink?.targetEquipoId || ''}
                      onChange={(e) => {
                        const targetEq = equipos.find(eq => eq.id === e.target.value);
                        if (targetEq) {
                          handleConnectNvrUplink(inspectedNvr.id, targetEq, currentNvrUplink?.targetPortNum || 1);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono text-xs"
                    >
                      <option value="">Selecciona equipo (Switch o Patch Panel)...</option>
                      {rackBayEquipos.map(eq => (
                        <option key={eq.id} value={eq.id}>
                          {eq.codigo} ({eq.tipo === 'switch' ? 'Switch' : 'Patch Panel'})
                        </option>
                      ))}
                    </select>

                    {currentNvrUplink && (
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mt-2 mb-1">
                          Puerto de Destino:
                        </label>
                        <select
                          value={currentNvrUplink.targetPortNum}
                          onChange={(e) => {
                            const targetEq = equipos.find(eq => eq.id === currentNvrUplink.targetEquipoId);
                            if (targetEq) {
                              handleConnectNvrUplink(inspectedNvr.id, targetEq, parseInt(e.target.value, 10));
                            }
                          }}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono text-xs"
                        >
                          {Array.from({ length: equipos.find(e => e.id === currentNvrUplink.targetEquipoId)?.puertos_totales || 24 }, (_, i) => i + 1).map(p => (
                            <option key={p} value={p}>Puerto {String(p).padStart(2, '0')}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {currentNvrUplink && (
                    <button
                      onClick={() => handleDisconnectNvrUplink(inspectedNvr.id)}
                      className="w-full py-1.5 text-xs text-rose-700 hover:text-rose-900 border border-rose-200 hover:bg-rose-50 rounded transition-colors font-medium flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Desconectar Uplink</span>
                    </button>
                  )}
                </div>

                {/* Camera List on this NVR */}
                <div>
                  <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">
                    Cámaras Grabándose en este NVR ({camaras.filter(c => c.nvr_id === inspectedNvr.id).length})
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {camaras.filter(c => c.nvr_id === inspectedNvr.id).map(c => (
                      <div 
                        key={c.id}
                        onClick={() => onSelectCamera(c)}
                        className="p-2 border border-slate-200 hover:border-blue-300 rounded bg-white hover:bg-blue-50/40 transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          {c.codigo}
                        </div>
                        <div className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                          Canal {c.canal_nvr ?? '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : !selectedPort ? (
              /* VIEW B: EMPTY STATE */
              <div className="py-10 text-center text-slate-500 space-y-3 font-mono">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                  <Network className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-800 font-sans">
                    Selecciona un puerto para ver su detalle
                  </h4>
                  <p className="text-[11px] text-slate-500 font-sans leading-relaxed">
                    Haz clic o arrastra entre puertos de Patch Panel y Switch para trazar un enlace cross-connect Cat6.
                  </p>
                </div>
              </div>
            ) : selectedPort.isNvrUplink ? (
              /* VIEW C: PORT CONNECTED TO NVR UPLINK */
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold font-mono text-xs text-amber-900">
                    <CheckCircle2 className="w-4 h-4 text-amber-600" />
                    <span>Puerto Asignado a Uplink NVR</span>
                  </div>
                  <p className="text-[11px] text-amber-800 font-sans">
                    Este puerto en {equipos.find(e => e.id === selectedPort.equipoId)?.codigo} recibe el enlace troncal IP del grabador NVR.
                  </p>
                </div>

                <div className="space-y-2 bg-slate-50 p-3 rounded border border-slate-200 font-mono text-[11px]">
                  <div>NVR Conectado: <strong>{equipos.find(e => e.id === selectedPort.nvrId)?.codigo}</strong></div>
                  <div>Equipo Receptor: <strong>{equipos.find(e => e.id === selectedPort.equipoId)?.codigo}</strong></div>
                  <div>Puerto Físico: <strong>P-{String(selectedPort.portNum).padStart(2, '0')}</strong></div>
                </div>

                {selectedPort.nvrId && (
                  <button
                    onClick={() => handleDisconnectNvrUplink(selectedPort.nvrId!)}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Unlink className="w-4 h-4" />
                    <span>Desconectar Uplink del NVR</span>
                  </button>
                )}
              </div>
            ) : selectedPort.camara ? (
              /* VIEW D: PORT WITH ASSOCIATED CAMERA */
              <div className="space-y-4">
                {/* Interconnection Status Banner */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-blue-700 uppercase font-bold">Enlace Físico Activo</span>
                    <span className="px-2 py-0.2 rounded bg-blue-200/80 text-blue-900 font-bold text-[10px]">
                      Cat6 RJ45
                    </span>
                  </div>

                  {/* Cross-connect route representation */}
                  <div className="flex items-center gap-1.5 text-slate-800 font-semibold pt-1">
                    <span>
                      {selectedPort.tipo === 'patch_panel'
                        ? equipos.find(e => e.id === selectedPort.equipoId)?.codigo
                        : selectedPort.counterpart?.equipoCodigo || 'Patch Panel'
                      } [P{selectedPort.tipo === 'patch_panel' ? selectedPort.portNum : selectedPort.counterpart?.portNum}]
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="text-blue-700 font-bold">
                      {selectedPort.camara.codigo}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>
                      {selectedPort.tipo === 'switch'
                        ? equipos.find(e => e.id === selectedPort.equipoId)?.codigo
                        : selectedPort.counterpart?.equipoCodigo || 'Switch'
                      } [{selectedPort.camara.puerto_switch || selectedPort.portNum}]
                    </span>
                  </div>
                </div>

                {/* Camera Technical Data */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Cámara Asociada:</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {selectedPort.mapeo?.dispositivo_codigo || selectedPort.camara.codigo}
                    </span>
                  </div>

                  {selectedPort.mapeo?.roseta_codigo && (
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Código de Roseta:</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {selectedPort.mapeo.roseta_codigo}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Marca & Modelo:</span>
                    <span className="font-mono text-slate-800">
                      {selectedPort.camara.marca_rel?.nombre || selectedPort.camara.marca || '-'} {selectedPort.camara.modelo_rel?.nombre || selectedPort.camara.modelo || ''}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Dirección IP:</span>
                    <span className="font-mono font-bold text-blue-700">
                      {selectedPort.camara.direccion_ip || 'No asignada'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Dirección MAC:</span>
                    <span className="font-mono text-slate-700">
                      {selectedPort.camara.direccion_mac || 'No registrada'}
                    </span>
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <span className="text-slate-500 font-medium block mb-0.5">Ubicación Física:</span>
                    <span className="font-mono text-slate-800 text-[11px] block bg-slate-50 p-2 rounded border border-slate-200">
                      {selectedPort.camara.ubicacion_especifica || 'Sin descripción de ubicación'}
                    </span>
                  </div>

                  {/* NVR and Recording Channel */}
                  <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded text-[11px] font-mono space-y-1">
                    <div className="text-indigo-900 font-bold flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Destino de Grabación NVR</span>
                    </div>
                    <div className="flex items-center justify-between text-indigo-950">
                      <span>NVR:</span>
                      <span className="font-bold">
                        {equipos.find(e => e.id === selectedPort.camara?.nvr_id)?.codigo || 'NVR Grabador'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-indigo-950">
                      <span>Canal Asignado:</span>
                      <span className="font-bold">
                        Canal {selectedPort.camara.canal_nvr ?? 'No asignado'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions: View Camera Detail & Disconnect Cable */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => onSelectCamera(selectedPort.camara!)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-xs transition-colors cursor-pointer shadow-xs"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Ver Ficha Completa de Cámara</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDisconnectCable(selectedPort.camara!.id, undefined, selectedPort.mapeo?.conexion_logica_id || undefined)}
                    className="w-full flex items-center justify-center gap-2 py-1.5 text-rose-700 hover:text-rose-900 border border-rose-200 hover:bg-rose-50 rounded text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Desconectar Dispositivo</span>
                  </button>
                </div>
              </div>
            ) : selectedPort.puntoRed ? (
              /* VIEW D2: PORT WITH ASSOCIATED NETWORK POINT (Funcionario / Sala / WiFi) */
              <div className="space-y-4">
                {/* Interconnection Status Banner */}
                <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-lg space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-cyan-800 uppercase font-bold">Enlace Físico Activo · Punto de Red</span>
                    <span className={`px-2 py-0.2 rounded font-bold text-[10px] ${
                      selectedPort.puntoRed.tipo_punto === 'datos_funcionario'
                        ? 'bg-blue-100 text-blue-900 border border-blue-200'
                        : selectedPort.puntoRed.tipo_punto === 'wifi_ap'
                        ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                        : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                    }`}>
                      {selectedPort.puntoRed.tipo_punto === 'datos_funcionario'
                        ? 'Punto Funcionario'
                        : selectedPort.puntoRed.tipo_punto === 'wifi_ap'
                        ? 'WiFi AP'
                        : 'Punto de Sala'}
                    </span>
                  </div>

                  {/* Cross-connect route representation */}
                  <div className="flex items-center gap-1.5 text-slate-800 font-semibold pt-1">
                    <span>
                      {selectedPort.tipo === 'patch_panel'
                        ? equipos.find(e => e.id === selectedPort.equipoId)?.codigo
                        : selectedPort.counterpart?.equipoCodigo || 'Patch Panel'
                      } [P{selectedPort.tipo === 'patch_panel' ? selectedPort.portNum : selectedPort.counterpart?.portNum}]
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                    <span className="text-cyan-800 font-bold">
                      {selectedPort.puntoRed.codigo}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                    <span>
                      {selectedPort.tipo === 'switch'
                        ? equipos.find(e => e.id === selectedPort.equipoId)?.codigo
                        : selectedPort.counterpart?.equipoCodigo || 'Switch'
                      } [{selectedPort.counterpart?.portLabel || `P${selectedPort.portNum}`}]
                    </span>
                  </div>
                </div>

                {/* Technical Data */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Código de Dispositivo:</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {selectedPort.mapeo?.dispositivo_codigo || selectedPort.puntoRed.codigo}
                    </span>
                  </div>

                  {selectedPort.mapeo?.roseta_codigo && (
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Código de Roseta:</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {selectedPort.mapeo.roseta_codigo}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Tipo de Servicio:</span>
                    <span className="font-mono font-semibold text-slate-800 flex items-center gap-1.5">
                      {selectedPort.puntoRed.tipo_punto === 'datos_funcionario' ? (
                        <>
                          <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                          <span>Datos Funcionario</span>
                        </>
                      ) : selectedPort.puntoRed.tipo_punto === 'wifi_ap' ? (
                        <>
                          <Wifi className="w-3.5 h-3.5 text-indigo-600" />
                          <span>AP WiFi</span>
                        </>
                      ) : (
                        <>
                          <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Datos Alumno</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* VLAN info */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">VLAN de Switch:</span>
                    {selectedPort.vlan ? (
                      <span 
                        className="font-mono font-bold px-2 py-0.5 rounded text-xs inline-flex items-center gap-1.5"
                        style={{
                          backgroundColor: `${selectedPort.vlan.color || '#3b82f6'}20`,
                          borderColor: `${selectedPort.vlan.color || '#3b82f6'}60`,
                          color: selectedPort.vlan.color || '#0284c7',
                          borderWidth: 1
                        }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedPort.vlan.color || '#3b82f6' }} />
                        <span>VLAN {selectedPort.vlan.numero} {selectedPort.vlan.nombre ? `(${selectedPort.vlan.nombre})` : ''}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono text-xs italic">Sin VLAN asignada</span>
                    )}
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <span className="text-slate-500 font-medium block mb-0.5">Ubicación Física:</span>
                    <span className="font-mono text-slate-800 text-[11px] block bg-slate-50 p-2 rounded border border-slate-200">
                      {selectedPort.puntoRed.ubicacion_especifica || 'Sin descripción de ubicación registrada'}
                    </span>
                  </div>

                  {/* SI ES AP WIFI: MOSTRAR MARCA, MODELO, MAC, IP */}
                  {selectedPort.puntoRed.tipo_punto === 'wifi_ap' && (
                    <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-2 text-[11px] font-mono mt-2">
                      <div className="text-indigo-950 font-bold flex items-center gap-1.5 border-b border-indigo-200/80 pb-1.5">
                        <Wifi className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Detalles del Access Point (WiFi AP)</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-sans font-medium">Marca & Modelo:</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {selectedPort.puntoRed.marca_rel?.nombre || (selectedPort.puntoRed as any).marca || '-'} {selectedPort.puntoRed.modelo_rel?.nombre || (selectedPort.puntoRed as any).modelo || ''}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-sans font-medium">Dirección IP:</span>
                        <span className="font-mono font-bold text-indigo-700">
                          {selectedPort.puntoRed.direccion_ip || 'No asignada'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-sans font-medium">Dirección MAC:</span>
                        <span className="font-mono text-slate-700">
                          {selectedPort.puntoRed.direccion_mac || 'No registrada'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions: Disconnect */}
                <div className="space-y-2 pt-2">

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedPort.puntoRed) {
                        const isPatch = selectedPort.tipo === 'patch_panel';
                        const targetPpId = selectedPort.puntoRed.patch_panel_id 
                          || equipos.find(e => e.codigo === selectedPort.mapeo?.patch_panel_codigo)?.id 
                          || (isPatch ? selectedPort.equipoId : '');
                        const targetSwId = selectedPort.puntoRed.switch_id 
                          || equipos.find(e => e.codigo === selectedPort.mapeo?.switch_codigo)?.id 
                          || (!isPatch ? selectedPort.equipoId : '');

                        setNuevoPuntoCodigo(selectedPort.puntoRed.codigo);
                        setNuevoPuntoTipo(selectedPort.puntoRed.tipo_punto as any);
                        setNuevoPuntoUbicacion(selectedPort.puntoRed.ubicacion_especifica || '');
                        setAssignModal({
                          isOpen: true,
                          patchPanelId: targetPpId,
                          patchPort: selectedPort.mapeo?.patch_panel_puerto_numero || (isPatch ? selectedPort.portNum : 1),
                          switchId: targetSwId,
                          switchPort: selectedPort.mapeo?.switch_puerto_numero || (!isPatch ? selectedPort.portNum : 1),
                          activeTab: 'punto_red',
                          subTab: 'existente'
                        });
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded font-semibold text-xs transition-colors cursor-pointer mb-2"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Editar Datos del Dispositivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDisconnectCable(undefined, selectedPort.puntoRed!.id, selectedPort.mapeo?.conexion_logica_id || undefined)}
                    className="w-full flex items-center justify-center gap-2 py-1.5 text-rose-700 hover:text-rose-900 border border-rose-200 hover:bg-rose-50 rounded text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Desconectar Dispositivo</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (selectedPort.mapeo?.tramo_cross_connect_id) {
                        await disconnectCrossConnect(
                          selectedPort.equipoId, 
                          selectedPort.portNum, 
                          selectedPort.tipo, 
                          selectedPort.mapeo.tramo_cross_connect_id
                        );
                        showToast('Cable físico desconectado. El dispositivo sigue en la roseta.', 'info');
                        setSelectedPort(null);
                        await loadRackData();
                        setBodegaKey(prev => prev + 1);
                        scheduleCableRecalc();
                      } else {
                        showToast('No se encontró el ID del cable físico en este puerto', 'error');
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-1.5 text-amber-700 hover:text-amber-900 border border-amber-300 hover:bg-amber-50 rounded text-xs font-semibold transition-colors cursor-pointer mt-2"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Solo Desconectar Cable Físico</span>
                  </button>                  
                </div>
              </div>
            ) : selectedPort.mapeo?.estado_visual_puerto === 'enlace_vacio' ? (
              /* VIEW D3: ENLACE VACÍO (CABLEADO SIN DISPOSITIVO CONECTADO) */
              <div className="space-y-4">
                <div className="p-3 bg-slate-900 border border-dashed border-slate-600 rounded-lg text-slate-200 space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-amber-400 uppercase font-bold flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Enlace Vacío</span>
                    </span>
                    <span className="px-2 py-0.2 rounded font-bold text-[10px] bg-amber-950/80 text-amber-300 border border-amber-600/50">
                      Cable sin Dispositivo
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-sans">
                    Existe un cable de parcheo cross-connect conectado entre equipos, pero no hay ningún dispositivo final (cámara, AP o terminal) conectado al extremo.
                  </p>

                  {/* Cross-connect route */}
                  <div className="flex items-center gap-1.5 text-slate-200 font-semibold pt-1">
                    <span>
                      {selectedPort.mapeo.patch_panel_codigo || 'Patch Panel'} [P{selectedPort.mapeo.patch_panel_puerto_numero || '-'}]
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-amber-400 font-bold">
                      {selectedPort.mapeo.roseta_codigo ? `Roseta ${selectedPort.mapeo.roseta_codigo}` : 'Cross-Connect'}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      {selectedPort.mapeo.switch_codigo || 'Switch'} [P{selectedPort.mapeo.switch_puerto_numero}]
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs font-mono">
                  {selectedPort.mapeo.roseta_codigo && (
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                      <span className="text-slate-500 font-medium">Código de Roseta:</span>
                      <span className="font-bold text-slate-900 text-sm">
                        {selectedPort.mapeo.roseta_codigo}
                      </span>
                    </div>
                  )}

                  {selectedPort.mapeo.roseta_ubicacion && (
                    <div className="pt-1">
                      <span className="text-slate-500 font-medium block mb-0.5">Ubicación de Roseta:</span>
                      <span className="text-slate-800 text-[11px] block bg-slate-50 p-2 rounded border border-slate-200">
                        {selectedPort.mapeo.roseta_ubicacion}
                      </span>
                    </div>
                  )}

                  {/* VLAN info */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-500 font-medium">VLAN Asignada:</span>
                    {selectedPort.vlan ? (
                      <span 
                        className="font-mono font-bold px-2 py-0.5 rounded text-xs inline-flex items-center gap-1.5"
                        style={{
                          backgroundColor: `${selectedPort.vlan.color || '#3b82f6'}20`,
                          borderColor: `${selectedPort.vlan.color || '#3b82f6'}60`,
                          color: selectedPort.vlan.color || '#0284c7',
                          borderWidth: 1
                        }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedPort.vlan.color || '#3b82f6' }} />
                        <span>VLAN {selectedPort.vlan.numero} {selectedPort.vlan.nombre ? `(${selectedPort.vlan.nombre})` : ''}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono text-xs italic">Sin VLAN asignada</span>
                    )}
                  </div>
                </div>

                {/* Actions: Associate device & Disconnect Cable */}
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const counterpart = selectedPort.counterpart;
                      const ppId = selectedPort.tipo === 'patch_panel' ? selectedPort.equipoId : (counterpart?.equipoId || selectedPort.equipoId);
                      const ppPort = selectedPort.tipo === 'patch_panel' ? selectedPort.portNum : (counterpart?.portNum || selectedPort.portNum);
                      const swId = selectedPort.tipo === 'switch' ? selectedPort.equipoId : (counterpart?.equipoId || selectedPort.equipoId);
                      const swPort = selectedPort.tipo === 'switch' ? selectedPort.portNum : (counterpart?.portNum || selectedPort.portNum);
                      setAssignModal({
                        isOpen: true,
                        patchPanelId: ppId,
                        patchPort: ppPort,
                        switchId: swId,
                        switchPort: swPort,
                        activeTab: 'punto_red',
                        subTab: 'nuevo'
                      });
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-xs transition-colors cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Asociar Dispositivo a este Enlace</span>
                  </button>

                  {/* NUEVO BOTÓN PARA DESCONECTAR EL CABLE FÍSICO */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (selectedPort.mapeo?.tramo_cross_connect_id) {
                        await disconnectCrossConnect(
                          selectedPort.equipoId, 
                          selectedPort.portNum, 
                          selectedPort.tipo, 
                          selectedPort.mapeo.tramo_cross_connect_id
                        );
                        showToast('Cable físico desconectado', 'info');
                        setSelectedPort(null);
                        await loadRackData();
                        scheduleCableRecalc();
                      } else {
                        showToast('No se encontró el ID del tramo para desconectar', 'error');
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-1.5 text-rose-700 hover:text-rose-900 border border-rose-200 hover:bg-rose-50 rounded text-xs font-semibold transition-colors cursor-pointer mt-2"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Desconectar Cable Físico</span>
                  </button>
                </div>
              </div>
            ) : (
              /* VIEW E: VACANT / AVAILABLE PORT */
              <div className="space-y-4">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold font-mono text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Puerto Disponible</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 font-sans">
                    Este puerto en {equipos.find(e => e.id === selectedPort.equipoId)?.codigo} está libre y listo para recibir un enlace.
                  </p>
                </div>

                <div className="bg-slate-50 p-2.5 rounded border border-slate-200 font-mono text-[10px] space-y-1">
                  <div>Equipo: <strong>{equipos.find(e => e.id === selectedPort.equipoId)?.codigo}</strong></div>
                  <div>Tipo: <strong>{selectedPort.tipo === 'switch' ? 'Switch de Acceso' : 'Patch Panel'}</strong></div>
                  <div>Puerto Físico: <strong>P-{String(selectedPort.portNum).padStart(2, '0')}</strong></div>
                  {selectedPort.tipo === 'switch' && (() => {
                    const poeInfo = switchPoeInfoMap[selectedPort.equipoId];
                    const isPoe = poeInfo?.poeRes.portSet.has(selectedPort.portNum);
                    if (!isPoe) return null;
                    return (
                      <div className="text-amber-800 font-semibold flex items-center gap-1 pt-0.5">
                        <span>⚡ Alimentación PoE:</span>
                        <span>Disponible{poeInfo?.estandarShort ? ` (${poeInfo.estandarShort})` : ''}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Quick Connect Action Button */}
                <div className="space-y-2 pt-1">
                  <button
                    onClick={() => {
                      const eq = equipos.find(e => e.id === selectedPort.equipoId);
                      if (eq) {
                        setClickConnectSource({
                          type: 'port',
                          equipoId: eq.id,
                          portNum: selectedPort.portNum,
                          equipoCodigo: eq.codigo,
                          equipoTipo: selectedPort.tipo
                        });
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-slate-900 hover:bg-black text-white rounded text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Cable className="w-3.5 h-3.5 text-blue-400" />
                    <span>Conectar Cable Desde Aquí</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const isPatch = selectedPort.tipo === 'patch_panel';
                      setAssignModal({
                        isOpen: true,
                        patchPanelId: isPatch ? selectedPort.equipoId : '',
                        patchPort: isPatch ? selectedPort.portNum : 0,
                        switchId: !isPatch ? selectedPort.equipoId : '',
                        switchPort: !isPatch ? selectedPort.portNum : 0,
                        activeTab: 'punto_red',
                        subTab: 'nuevo'
                      });
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-4 h-4 text-blue-600" />
                    <span>+ Registrar Dispositivo Aquí</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* MULTI-SERVICE CROSS-CONNECT ASSIGN MODAL (AsociarServicioDialog) */}
      {assignModal && assignModal.isOpen && (() => {
        const pp = equipos.find(e => e.id === assignModal.patchPanelId);
        const sw = equipos.find(e => e.id === assignModal.switchId);
        const swVlanInfo = switchPortVlanMap[makePortKey(assignModal.switchId, assignModal.switchPort)];

        return (
          <AsociarServicioDialog
            isOpen={assignModal.isOpen}
            onClose={() => setAssignModal(null)}
            codigo_patch={pp?.codigo || (assignModal.patchPanelId ? 'Patch Panel' : '')}
            puerto_patch={assignModal.patchPort}
            codigo_switch={sw?.codigo || (assignModal.switchId ? 'Switch' : '')}
            puerto_switch={assignModal.switchPort}
            puerto_switch_id={swVlanInfo?.puerto_switch_id}
            patchPanelId={assignModal.patchPanelId}
            switchId={assignModal.switchId}
            activeTab={assignModal.activeTab}
            subTab={assignModal.subTab}
            vlan_id={swVlanInfo?.vlan_id}
            vlan_numero={swVlanInfo?.vlan_numero}
            vlan_nombre={swVlanInfo?.vlan_nombre}
            color_vlan={swVlanInfo?.vlan_color}
            uso_vlan={swVlanInfo?.uso}
            puntosRed={puntosRed}
            camaras={camaras}
            onCreateNuevoPunto={async ({ codigo, tipo_punto, ubicacion, modelo_id, alimentacion }) => {
              if (tipo_punto === 'camara_cctv') {
                await handleCreateAndConnectNuevaCamara(
                  assignModal.patchPanelId,
                  assignModal.patchPort,
                  assignModal.switchId,
                  assignModal.switchPort,
                  codigo,
                  ubicacion,
                  modelo_id,
                  alimentacion
                );
              } else {
                const mappedTipo: 'datos_funcionario' | 'datos_alumno' | 'wifi_ap' =
                  tipo_punto === 'datos_alumno'
                    ? 'datos_alumno'
                    : tipo_punto === 'wifi_ap'
                    ? 'wifi_ap'
                    : 'datos_funcionario';
                await handleCreateAndConnectNuevoPuntoRed(
                  assignModal.patchPanelId,
                  assignModal.patchPort,
                  assignModal.switchId,
                  assignModal.switchPort,
                  codigo,
                  mappedTipo,
                  ubicacion,
                  modelo_id,
                  alimentacion
                );
              }
              setAssignModal(null);
              setSelectedPort(null);
              await loadRackData();
              scheduleCableRecalc();
            }}
            onSelectExistentePunto={async (puntoId) => {
              const pp = equipos.find(e => e.id === assignModal.patchPanelId);
              const rosetaId = await resolveRosetaId(pp || ({ id: assignModal.patchPanelId, tipo: 'patch_panel' } as Equipo), assignModal.patchPort, puntoId);
              if (rosetaId) {
                const connected = await handleConnectDispositivoRpc(puntoId, rosetaId, 'Técnico de Terreno');
                if (connected) {
                  setAssignModal(null);
                  setSelectedPort(null);
                  await loadRackData();
                  scheduleCableRecalc();
                  return;
                }
              }
              await handleCreateOrUpdateConnection(
                assignModal.patchPanelId,
                assignModal.patchPort,
                assignModal.switchId,
                assignModal.switchPort,
                undefined,
                puntoId
              );
              setAssignModal(null);
              setSelectedPort(null);
              await loadRackData();
              scheduleCableRecalc();
            }}
            onSelectExistenteCamara={async (camaraId) => {
              const pp = equipos.find(e => e.id === assignModal.patchPanelId);
              const rosetaId = await resolveRosetaId(pp || ({ id: assignModal.patchPanelId, tipo: 'patch_panel' } as Equipo), assignModal.patchPort, camaraId);
              if (rosetaId) {
                const connected = await handleConnectDispositivoRpc(camaraId, rosetaId, 'Técnico de Terreno');
                if (connected) {
                  setAssignModal(null);
                  setSelectedPort(null);
                  await loadRackData();
                  scheduleCableRecalc();
                  return;
                }
              }
              await handleCreateOrUpdateConnection(
                assignModal.patchPanelId,
                assignModal.patchPort,
                assignModal.switchId,
                assignModal.switchPort,
                camaraId
              );
              setAssignModal(null);
              setSelectedPort(null);
              await loadRackData();
              scheduleCableRecalc();
            }}
            onConnectSoloCable={async () => {
              const { tramoId } = await ensureCrossConnect(assignModal.patchPanelId, assignModal.patchPort, assignModal.switchId, assignModal.switchPort);
              if (tramoId) {
                showToast(`Enlace físico creado correctamente`, 'success');
              } else {
                showToast('Error al crear el cable físico', 'error');
              }
              setAssignModal(null);
              setSelectedPort(null);
              await loadRackData();
              scheduleCableRecalc();
            }}
            loading={savingAction}
          />
        );
      })()}
      {/* Cajón de Bodega de Dispositivos (APs y Cámaras) */}
      <DeviceBodegaDrawer 
        key={bodegaKey}
        isOpen={isDeviceBodegaOpen} 
        onToggle={() => setIsDeviceBodegaOpen(false)} 
        onRefresh={() => loadRackData()}
      />

      {/* Modal de Importación Masiva de Dispositivos */}
      <ImportDevicesModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onRefresh={() => {
          loadRackData();
          setBodegaKey(k => k + 1);
        }}
      />
    </div>
  );
};
