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
  ChevronLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Rack, Equipo, Camara, Piso, Edificio } from '../types/database';

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

interface CrossConnectCable {
  id: string; // Camera id
  camera: Camara;
  patchPanelId: string;
  patchPort: number;
  switchId: string;
  switchPortNum: number;
  switchPortLabel: string;
  color: string;
}

interface NvrUplinkConnection {
  nvrId: string;
  targetEquipoId: string;
  targetPortNum: number;
  targetTipo: 'switch' | 'patch_panel';
}

interface PortSelection {
  equipoId: string;
  portNum: number;
  tipo: 'patch_panel' | 'switch';
  camara?: Camara | null;
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
  sourceType: 'port' | 'nvr-uplink' | 'camera-item';
  equipoId?: string;
  equipoTipo?: 'patch_panel' | 'switch';
  portNum?: number;
  camaraId?: string;
  nvrId?: string;
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

  // Equipment & Camera state
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [, setPisosMap] = useState<Record<string, Piso>>({});
  const [, setEdificiosMap] = useState<Record<string, Edificio>>({});

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
  const [loading, setLoading] = useState(true);
  const [, setSavingAction] = useState(false);

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
  } | null>(null);

  // Quick Camera Assign Modal state
  const [assignModal, setAssignModal] = useState<{
    isOpen: boolean;
    patchPanelId: string;
    patchPort: number;
    switchId: string;
    switchPort: number;
    existingCamaraId?: string;
  } | null>(null);

  // Inspector panel visibility (allows expanding diagram to 100% width)
  const [showInspector, setShowInspector] = useState(true);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
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
        { data: camData },
        { data: pisosData },
        { data: edificiosData },
        { data: histData }
      ] = await Promise.all([
        supabase.from('equipos').select('*, marca_rel:marcas(*), modelo_rel:modelos(*)').eq('rack_id', currentRack.id),
        supabase.from('camaras').select('*, marca_rel:marcas(*), modelo_rel:modelos(*)').eq('rack_id', currentRack.id),
        supabase.from('pisos').select('*'),
        supabase.from('edificios').select('*'),
        supabase.from('historial_mantenimiento').select('*').eq('entidad_tipo', 'equipo').order('created_at', { ascending: false }).limit(20)
      ]);

      setEquipos(eqData || []);
      setCamaras(camData || []);

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
  }, [currentRack?.id]);

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

  // Max ports found across all equipment in this rack (e.g. 24 or 48)
  const maxPortsInRack = useMemo(() => {
    if (rackBayEquipos.length === 0) return 24;
    return Math.max(...rackBayEquipos.map(e => e.puertos_totales || 24), 24);
  }, [rackBayEquipos]);

  // NVRs in the rack
  const rackNvrs = useMemo(() => {
    return equipos
      .filter(e => e.tipo === 'nvr')
      .sort((a, b) => (b.posicion_u_inicio ?? 0) - (a.posicion_u_inicio ?? 0));
  }, [equipos]);

  // Cross-connect connections calculation
  const { connections, patchPortToCam, switchPortToCam } = useMemo(() => {
    const conns: CrossConnectCable[] = [];
    const ppMap: Record<string, Camara> = {};
    const swMap: Record<string, Camara> = {};

    camaras.forEach((cam) => {
      // Map patch panel port
      if (cam.patch_panel_id && cam.puerto_patch) {
        const ppKey = makePortKey(cam.patch_panel_id, cam.puerto_patch);
        ppMap[ppKey] = cam;
      }

      // Map switch port
      const swNum = parseSwitchPortNumber(cam.puerto_switch);
      if (cam.switch_id && swNum !== null) {
        const swKey = makePortKey(cam.switch_id, swNum);
        swMap[swKey] = cam;
      }

      // Cross-connect connection between Patch Panel & Switch
      if (
        cam.patch_panel_id && 
        cam.puerto_patch && 
        cam.switch_id && 
        swNum !== null
      ) {
        conns.push({
          id: cam.id,
          camera: cam,
          patchPanelId: cam.patch_panel_id,
          patchPort: cam.puerto_patch,
          switchId: cam.switch_id,
          switchPortNum: swNum,
          switchPortLabel: cam.puerto_switch || String(swNum),
          color: CABLE_PALETTE[conns.length % CABLE_PALETTE.length],
        });
      }
    });

    return {
      connections: conns,
      patchPortToCam: ppMap,
      switchPortToCam: swMap
    };
  }, [camaras]);

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
    const cam = isPatch ? patchPortToCam[key] : switchPortToCam[key];
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

    if (selectedPort?.equipoId === equipo.id && selectedPort?.portNum === portNum) {
      setSelectedPort(null);
    } else {
      setSelectedPort({
        equipoId: equipo.id,
        portNum,
        tipo: isPatch ? 'patch_panel' : 'switch',
        camara: cam || null,
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

    handleCreateOrUpdateConnection(ppId, patchPort, swId, switchPort, clickConnectSource.camara?.id);
    setClickConnectSource(null);
  };

  // DRAG & DROP HANDLERS WITH LIVE ELASTIC CORD PREVIEW
  const handleDragStartPort = (e: React.DragEvent, equipo: Equipo, portNum: number) => {
    e.stopPropagation();
    const isPatch = equipo.tipo === 'patch_panel';
    const key = makePortKey(equipo.id, portNum);
    const cam = isPatch ? patchPortToCam[key] : switchPortToCam[key];

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
      camaraId: cam?.id,
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

  const handleDropOnPort = (e: React.DragEvent, targetEquipo: Equipo, targetPortNum: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    setDragMouseCoord(null);
    setActiveDrag(null);

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

    // Case 2: Dragging a Camera item directly onto a port
    if (payload.sourceType === 'camera-item' && payload.camaraId) {
      handleAssignCameraToPort(payload.camaraId, targetEquipo, targetPortNum);
      return;
    }

    // Case 3: Dragging from Port to Port (Cross-Connect)
    if (payload.sourceType === 'port' && payload.equipoId && payload.portNum) {
      const srcEquipoId = payload.equipoId;
      const srcPortNum = payload.portNum;
      const srcTipo = payload.equipoTipo;
      const dstTipo = targetEquipo.tipo as 'switch' | 'patch_panel';

      if (srcTipo === dstTipo) {
        showToast('Debes conectar un Patch Panel con un Switch (no entre dos equipos del mismo tipo)', 'error');
        return;
      }

      const ppId = srcTipo === 'patch_panel' ? srcEquipoId : targetEquipo.id;
      const patchPort = srcTipo === 'patch_panel' ? srcPortNum : targetPortNum;
      const swId = srcTipo === 'switch' ? srcEquipoId : targetEquipo.id;
      const switchPort = srcTipo === 'switch' ? srcPortNum : targetPortNum;

      handleCreateOrUpdateConnection(ppId, patchPort, swId, switchPort, payload.camaraId);
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

  // Create or Update Cross-Connect connection in database
  const handleCreateOrUpdateConnection = async (
    patchPanelId: string,
    patchPort: number,
    switchId: string,
    switchPort: number,
    draggedCamaraId?: string
  ) => {
    const existingPatchCam = patchPortToCam[makePortKey(patchPanelId, patchPort)];
    const existingSwitchCam = switchPortToCam[makePortKey(switchId, switchPort)];

    const targetCamera = draggedCamaraId 
      ? camaras.find(c => c.id === draggedCamaraId) 
      : (existingPatchCam || existingSwitchCam);

    if (!targetCamera) {
      setAssignModal({
        isOpen: true,
        patchPanelId,
        patchPort,
        switchId,
        switchPort
      });
      return;
    }

    try {
      setSavingAction(true);
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
        .eq('id', targetCamera.id)
        .select('*, marca_rel:marcas(*), modelo_rel:modelos(*)')
        .single();

      if (error) throw error;

      setCamaras(prev => prev.map(c => c.id === targetCamera.id ? data : c));

      const pp = equipos.find(e => e.id === patchPanelId);
      const sw = equipos.find(e => e.id === switchId);

      showToast(`Enlace cross-connect creado: ${targetCamera.codigo} [${pp?.codigo} P${patchPort} ───> ${sw?.codigo} P${switchPort}]`, 'success');

      setSelectedPort({
        equipoId: patchPanelId,
        portNum: patchPort,
        tipo: 'patch_panel',
        camara: data,
        counterpart: {
          equipoId: switchId,
          portNum: switchPort,
          equipoCodigo: sw?.codigo || 'Switch',
          tipo: 'switch',
          portLabel: switchPortStr
        }
      });

      scheduleCableRecalc();
    } catch (err: any) {
      console.error('Error creating cross-connect:', err);
      showToast('Error al crear enlace: ' + (err.message || 'Error de base de datos'), 'error');
    } finally {
      setSavingAction(false);
    }
  };

  // Assign camera to a single port
  const handleAssignCameraToPort = async (camaraId: string, equipo: Equipo, portNum: number) => {
    try {
      setSavingAction(true);
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

      setCamaras(prev => prev.map(c => c.id === camaraId ? data : c));
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

  // Disconnect cross-connect cable
  const handleDisconnectCable = async (camaraId: string) => {
    try {
      setSavingAction(true);
      const { data, error } = await supabase
        .from('camaras')
        .update({
          switch_id: null,
          puerto_switch: null
        })
        .eq('id', camaraId)
        .select('*, marca_rel:marcas(*), modelo_rel:modelos(*)')
        .single();

      if (error) throw error;

      setCamaras(prev => prev.map(c => c.id === camaraId ? data : c));
      showToast('Cable de parcheo desconectado. El puerto de switch quedó disponible.', 'info');
      setSelectedPort(null);
      scheduleCableRecalc();
    } catch (err: any) {
      console.error('Error disconnecting cable:', err);
      showToast('Error al desconectar cable: ' + (err.message || 'Error de base de datos'), 'error');
    } finally {
      setSavingAction(false);
    }
  };

  // Export complete matrix to CSV
  const handleExportMatrixCSV = () => {
    if (!currentRack) return;
    const headers = [
      'Rack',
      'Patch Panel',
      'Puerto Patch',
      'Switch',
      'Puerto Switch',
      'Codigo Camara',
      'Modelo Camara',
      'IP',
      'MAC',
      'Ubicacion Fisica',
      'NVR',
      'Canal NVR'
    ];

    const rows = connections.map(conn => {
      const pp = equipos.find(e => e.id === conn.patchPanelId);
      const sw = equipos.find(e => e.id === conn.switchId);
      const nvr = conn.camera.nvr_id ? equipos.find(e => e.id === conn.camera.nvr_id) : null;
      return [
        `"${currentRack.codigo}"`,
        `"${pp?.codigo || '-'}"`,
        conn.patchPort,
        `"${sw?.codigo || '-'}"`,
        `"${conn.switchPortLabel}"`,
        `"${conn.camera.codigo}"`,
        `"${conn.camera.marca || ''} ${conn.camera.modelo || ''}"`,
        `"${conn.camera.direccion_ip || '-'}"`,
        `"${conn.camera.direccion_mac || '-'}"`,
        `"${conn.camera.ubicacion_especifica || '-'}"`,
        `"${nvr?.codigo || '-'}"`,
        conn.camera.canal_nvr ?? '-'
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CrossConnect_${currentRack.codigo.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered cameras for search
  const filteredCameras = useMemo(() => {
    if (!searchFilter.trim()) return [];
    const query = searchFilter.toLowerCase().trim();
    return camaras.filter(c => 
      c.codigo.toLowerCase().includes(query) ||
      (c.direccion_ip && c.direccion_ip.toLowerCase().includes(query)) ||
      (c.direccion_mac && c.direccion_mac.toLowerCase().includes(query)) ||
      (c.ubicacion_especifica && c.ubicacion_especifica.toLowerCase().includes(query))
    );
  }, [camaras, searchFilter]);

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

  // Render a single port button with explicit high z-index
  const renderPortButton = (eq: Equipo, pNum: number) => {
    const isSwitch = eq.tipo === 'switch';
    const key = makePortKey(eq.id, pNum);
    const cam = isSwitch ? switchPortToCam[key] : patchPortToCam[key];
    const conn = findConnectionForPort(eq.id, pNum);
    const nvrUplink = findNvrForPort(eq.id, pNum);

    const isSelected = selectedPort?.equipoId === eq.id && selectedPort?.portNum === pNum;
    const isHovered = hoveredPort?.equipoId === eq.id && hoveredPort?.portNum === pNum;
    const isConnHighlighted = activeConnection?.id === conn?.id && conn !== undefined;

    const isDropTarget = dragOverTarget?.equipoId === eq.id && dragOverTarget?.portNum === pNum;
    const isClickSource = clickConnectSource?.equipoId === eq.id && clickConnectSource?.portNum === pNum;

    const hasActive = activeConnection !== null || selectedPort !== null;
    const isDimmed = hasActive && !isSelected && !isHovered && !isConnHighlighted && !isDropTarget && !isClickSource;

    // Sizing:
    // With full-screen width, ports scale generously so all 48 ports fit and labels are 100% readable
    const sizeClasses = viewMode === 'all_visible'
      ? (portLayoutMode === 'single_row' && maxPortsInRack > 24
          ? 'w-9 sm:w-10 h-13 text-[9px]'
          : 'flex-1 min-w-[36px] sm:min-w-[42px] max-w-[58px] h-13 text-[10px]')
      : 'w-11 sm:w-12 h-13 text-[10px]';

    return (
      <button
        key={`port-${key}`}
        ref={(el) => { portDomRefs.current[key] = el; }}
        draggable={true}
        onDragStart={(e) => handleDragStartPort(e, eq, pNum)}
        onDragOver={(e) => handleDragOverPort(e, eq, pNum)}
        onDragLeave={handleDragLeavePort}
        onDrop={(e) => handleDropOnPort(e, eq, pNum)}
        onClick={() => {
          setShowInspector(true);
          handlePortClick(eq, pNum);
        }}
        onMouseEnter={() => handlePortMouseEnter(eq.id, pNum)}
        onMouseLeave={handlePortMouseLeave}
        className={`flex flex-col items-center justify-between p-1 rounded border text-center transition-all cursor-grab active:cursor-grabbing relative shrink-0 z-40 select-none ${sizeClasses} ${
          isDropTarget
            ? 'border-amber-400 bg-amber-950 ring-2 ring-amber-400 scale-105 shadow-lg'
            : isClickSource
            ? 'border-amber-500 bg-amber-900/80 ring-2 ring-amber-400 animate-pulse'
            : isSelected 
            ? 'bg-blue-600 border-blue-300 text-white ring-2 ring-blue-400 scale-105 shadow-md'
            : isConnHighlighted
            ? 'bg-blue-950 border-blue-400 text-blue-200 ring-2 ring-blue-400'
            : nvrUplink
            ? 'bg-amber-950/90 border-amber-500 text-amber-200 ring-1 ring-amber-400'
            : cam
            ? 'bg-slate-900 border-blue-600/70 text-blue-200 hover:border-blue-400'
            : 'bg-slate-800/70 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-500'
        } ${isDimmed ? 'opacity-35' : 'opacity-100'}`}
        title={nvrUplink ? `Puerto ${pNum}: Uplink NVR` : cam ? `Puerto ${pNum}: ${cam.codigo}` : `Puerto ${pNum}: Disponible (Arrastra para enlazar)`}
      >
        <span className="font-mono font-bold leading-none text-[10px] sm:text-[11px] text-slate-100">
          {String(pNum).padStart(2, '0')}
        </span>

        <div className="w-4 sm:w-5 h-2.5 sm:h-3 bg-black/90 border border-slate-700 rounded-xs flex items-center justify-center my-0.5 pointer-events-none">
          <span className={`w-2 sm:w-2.5 h-1 rounded-2xs ${
            nvrUplink
              ? 'bg-amber-400'
              : cam 
              ? (isSelected ? 'bg-white' : isConnHighlighted ? 'bg-cyan-400' : 'bg-blue-400')
              : 'bg-slate-700'
          }`} />
        </div>

        <span className="text-[8px] sm:text-[8.5px] font-mono font-bold tracking-tight truncate max-w-full leading-none pointer-events-none block px-0.5">
          {nvrUplink ? 'NVR-UP' : cam ? (cam.codigo.length > 7 ? cam.codigo.replace('CAM-ENG-P2-', 'C-') : cam.codigo) : 'LIBRE'}
        </span>
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

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cámara, IP..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs w-36 sm:w-48 focus:outline-hidden focus:ring-1 focus:ring-blue-500 bg-white"
            />
            {searchFilter && (
              <button 
                onClick={() => setSearchFilter('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ×
              </button>
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
          >
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
                  const totalPorts = eq.puertos_totales || 24;
                  const uPos = eq.posicion_u_inicio ?? eq.posicion_u_fin;

                  let connectedCount = 0;
                  for (let p = 1; p <= totalPorts; p++) {
                    const k = makePortKey(eq.id, p);
                    if (isSwitch ? switchPortToCam[k] : patchPortToCam[k]) {
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
                              {totalPorts >= 24 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => scrollToPort(eq.id, Math.floor(totalPorts / 2))}
                                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                                    title={`Desplazar a puerto ${Math.floor(totalPorts / 2)}`}
                                  >
                                    P{Math.floor(totalPorts / 2)}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => scrollToPort(eq.id, totalPorts)}
                                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                                    title={`Desplazar a puerto ${totalPorts}`}
                                  >
                                    P{totalPorts}
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          <div className="text-right text-[11px] font-mono">
                            <span className="text-slate-300 font-bold">
                              {connectedCount} / {totalPorts} Puertos
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              ({totalPorts > 0 ? Math.round((connectedCount / totalPorts) * 100) : 0}% ocupado)
                            </span>
                          </div>
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
                            {Array.from({ length: totalPorts }, (_, i) => i + 1).map((pNum) => (
                              <React.Fragment key={`port-wrap-${eq.id}-${pNum}`}>
                                {renderPortButton(eq, pNum)}
                                {pNum % 6 === 0 && pNum < totalPorts && (
                                  <div className="h-10 w-px bg-slate-700 mx-0.5 shrink-0" />
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        ) : (
                          /* 2. DUAL ROW MODE: 48 ports fit in only 24 columns, perfectly fitting on any screen! */
                          <div className={`flex flex-col gap-2 ${isIndependent ? 'min-w-max' : 'w-full'}`}>
                            {/* Row 1: Odds (1, 3, 5... 47) */}
                            <div className="flex items-center gap-1.5 w-full">
                              {Array.from({ length: Math.ceil(totalPorts / 2) }, (_, i) => i * 2 + 1).map((pNum) => {
                                if (pNum > totalPorts) return null;
                                return (
                                  <React.Fragment key={`port-wrap-${eq.id}-${pNum}`}>
                                    {renderPortButton(eq, pNum)}
                                    {pNum % 12 === 11 && pNum < totalPorts && (
                                      <div className="h-10 w-px bg-slate-700 mx-0.5 shrink-0" />
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                            {/* Row 2: Evens (2, 4, 6... 48) */}
                            <div className="flex items-center gap-1.5 w-full">
                              {Array.from({ length: Math.floor(totalPorts / 2) }, (_, i) => (i + 1) * 2).map((pNum) => {
                                if (pNum > totalPorts) return null;
                                return (
                                  <React.Fragment key={`port-wrap-${eq.id}-${pNum}`}>
                                    {renderPortButton(eq, pNum)}
                                    {pNum % 12 === 0 && pNum < totalPorts && (
                                      <div className="h-10 w-px bg-slate-700 mx-0.5 shrink-0" />
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
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
                            <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                              <span className="text-slate-400">Canales CCTV Asignados:</span>
                              <span className="text-indigo-300 font-bold">
                                {channelCount} {nvr.canales_totales ? `/ ${nvr.canales_totales}` : ''} canal(es)
                              </span>
                            </div>

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
                      {selectedPort.camara.codigo}
                    </span>
                  </div>

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
                    onClick={() => handleDisconnectCable(selectedPort.camara!.id)}
                    className="w-full flex items-center justify-center gap-2 py-1.5 text-rose-700 hover:text-rose-900 border border-rose-200 hover:bg-rose-50 rounded text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Desconectar Cable de Parcheo</span>
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
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {/* QUICK CAMERA ASSIGN MODAL (When connecting two empty ports) */}
      {assignModal && assignModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded">
                  <Cable className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-mono font-bold text-sm text-slate-900">
                    Asociar Cámara al Enlace Cross-Connect
                  </h3>
                  <p className="text-[11px] text-slate-500 font-sans">
                    {equipos.find(e => e.id === assignModal.patchPanelId)?.codigo} [P{assignModal.patchPort}] ───&gt; {equipos.find(e => e.id === assignModal.switchId)?.codigo} [P{assignModal.switchPort}]
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setAssignModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-mono text-slate-600 font-semibold block">
                Selecciona la cámara a conectar en este enlace:
              </span>
              <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                {camaras.map(c => {
                  const isAlreadyPatched = Boolean(c.patch_panel_id && c.puerto_patch && c.switch_id);
                  return (
                    <button
                      key={c.id}
                      onClick={async () => {
                        await handleCreateOrUpdateConnection(
                          assignModal.patchPanelId,
                          assignModal.patchPort,
                          assignModal.switchId,
                          assignModal.switchPort,
                          c.id
                        );
                        setAssignModal(null);
                      }}
                      className="w-full text-left p-2.5 rounded border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/40 transition-all flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <div className="font-mono font-bold text-xs text-slate-900">
                          {c.codigo}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {c.marca_rel?.nombre || c.marca || ''} {c.modelo_rel?.nombre || c.modelo || ''} · {c.direccion_ip || 'Sin IP'}
                        </div>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                        isAlreadyPatched 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isAlreadyPatched ? 'Reasignar' : 'Disponible'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setAssignModal(null)}
                className="px-4 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-300 rounded font-medium cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
