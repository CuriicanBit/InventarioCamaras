import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Camera,
  Network,
  Server,
  Layers,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  RefreshCw,
  Briefcase,
  GraduationCap,
  Wifi,
  TrendingUp,
  MapPin,
  ExternalLink,
  ShieldAlert,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  Building2,
  HardDrive
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
  PieChart,
  Pie,
  LineChart,
  Line,
  CartesianGrid,
  Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabase';
import {
  Equipo,
  Camara,
  Rack,
  Piso,
  Edificio,
  Campus,
  Sede,
  PuntoRed,
  PuertoSwitchOcupacion,
  Vlan
} from '../types/database';

interface ExecutiveDashboardProps {
  onSelectRack?: (rack: Rack) => void;
  onNavigateToPorts?: (equipmentId?: string) => void;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  onSelectRack,
  onNavigateToPorts,
}) => {
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Entities loaded from Supabase
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [puntosRed, setPuntosRed] = useState<PuntoRed[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [campusList, setCampusList] = useState<Campus[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [switchPorts, setSwitchPorts] = useState<PuertoSwitchOcupacion[]>([]);

  // DOM refs to capture each visual section for PDF export
  const chartEdificiosRef = useRef<HTMLDivElement>(null);
  const tableRacksRef = useRef<HTMLDivElement>(null);
  const chartVlanRef = useRef<HTMLDivElement>(null);
  const chartLifecycleRef = useRef<HTMLDivElement>(null);
  const chartTrendRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [
        { data: camData },
        { data: puntosData },
        { data: eqData },
        { data: rkData },
        { data: psData },
        { data: edData },
        { data: cpData },
        { data: sdData },
        { data: vlData },
        { data: spData },
      ] = await Promise.all([
        supabase
          .from('camaras')
          .select('*, patch_panel:equipos!patch_panel_id(*), switch:equipos!switch_id(*), nvr:equipos!nvr_id(*), marca_rel:marcas(*), modelo_rel:modelos(*), proveedor_compra:proveedores!proveedor_compra_id(*), proveedor_instalacion:proveedores!proveedor_instalacion_id(*)')
          .order('codigo'),
        supabase
          .from('puntos_red')
          .select('*, patch_panel:equipos!patch_panel_id(*), switch:equipos!switch_id(*), marca_rel:marcas(*), modelo_rel:modelos(*), proveedor_compra:proveedores!proveedor_compra_id(*), proveedor_instalacion:proveedores!proveedor_instalacion_id(*)')
          .order('codigo'),
        supabase
          .from('equipos')
          .select('*, marca_rel:marcas(*), modelo_rel:modelos(*), rack:racks(*), proveedor_compra:proveedores!proveedor_compra_id(*), proveedor_instalacion:proveedores!proveedor_instalacion_id(*)')
          .order('codigo'),
        supabase.from('racks').select('*, piso:pisos(*)').order('codigo'),
        supabase.from('pisos').select('*').order('nombre'),
        supabase.from('edificios').select('*').order('nombre'),
        supabase.from('campus').select('*').order('nombre'),
        supabase.from('sedes').select('*').order('nombre'),
        supabase.from('vlans').select('*').order('numero'),
        supabase.from('v_puertos_switch_ocupacion').select('*'),
      ]);

      setCamaras(camData || []);
      setPuntosRed(puntosData || []);
      setEquipos(eqData || []);
      setRacks(rkData || []);
      setPisos(psData || []);
      setEdificios(edData || []);
      setCampusList(cpData || []);
      setSedes(sdData || []);
      setVlans(vlData || []);
      setSwitchPorts(spData || []);
    } catch (err) {
      console.error('Error cargando datos para Dashboard Ejecutivo:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Quick lookup maps
  const pisosMap = useMemo(() => new Map(pisos.map(p => [p.id, p])), [pisos]);
  const edificiosMap = useMemo(() => new Map(edificios.map(e => [e.id, e])), [edificios]);
  const campusMap = useMemo(() => new Map(campusList.map(c => [c.id, c])), [campusList]);
  const sedesMap = useMemo(() => new Map(sedes.map(s => [s.id, s])), [sedes]);
  const racksMap = useMemo(() => new Map(racks.map(r => [r.id, r])), [racks]);

  // Helper to build full hierarchical location string
  const getLocationString = (pisoId?: string | null, ubicacionEspecifica?: string | null) => {
    if (!pisoId) return ubicacionEspecifica || 'Sin ubicación';
    const piso = pisosMap.get(pisoId);
    const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
    const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
    const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;

    const parts = [
      sede?.nombre,
      campus?.nombre,
      edificio?.nombre,
      piso?.nombre,
      ubicacionEspecifica
    ].filter(Boolean);

    return parts.join(' > ') || 'Sin ubicación';
  };

  // 1. TARJETAS DE RESUMEN
  const kpiSummary = useMemo(() => {
    const totalCamaras = camaras.length;
    
    // Puntos de red breakdown
    const puntosFuncionario = puntosRed.filter(p => p.tipo_punto === 'datos_funcionario').length;
    const puntosAlumno = puntosRed.filter(p => p.tipo_punto === 'datos_alumno').length;
    const puntosWifi = puntosRed.filter(p => p.tipo_punto === 'wifi_ap').length;
    const totalPuntosRed = puntosRed.length;

    // Equipos de rack
    const totalEquipos = equipos.length;
    const switchesCount = equipos.filter(e => e.tipo === 'switch').length;
    const patchPanelsCount = equipos.filter(e => e.tipo === 'patch_panel').length;
    const nvrsCount = equipos.filter(e => e.tipo === 'nvr').length;

    // Racks
    const totalRacks = racks.length;

    return {
      totalCamaras,
      totalPuntosRed,
      puntosFuncionario,
      puntosAlumno,
      puntosWifi,
      totalEquipos,
      switchesCount,
      patchPanelsCount,
      nvrsCount,
      totalRacks
    };
  }, [camaras, puntosRed, equipos, racks]);

  // Map RJ45 switch ports occupancy by switch_id
  const switchPortStats = useMemo(() => {
    const stats: Record<string, { totalRj45: number; occupiedRj45: number; configuredRj45: number; freeRj45: number }> = {};

    switchPorts.forEach(port => {
      if (port.tipo_puerto === 'rj45') {
        if (!stats[port.switch_id]) {
          stats[port.switch_id] = { totalRj45: 0, occupiedRj45: 0, configuredRj45: 0, freeRj45: 0 };
        }
        stats[port.switch_id].totalRj45 += 1;
        
        // CRITERIO ESTRICTO DE "OCUPADO" (Ocupación Física):
        // Únicamente si existe una cámara o un punto de red conectado al puerto
        // (columna ocupado_por_tipo u ocupado_por_codigo en v_puertos_switch_ocupacion).
        // Si sólo tiene VLAN o Uso asignado pero sin dispositivo, es "Configurado", NO "Ocupado".
        const isOccupied = Boolean(port.ocupado_por_tipo || port.ocupado_por_codigo);
        const hasVlan = Boolean(port.vlan_numero || (port as any).vlan);
        const hasUso = Boolean(port.uso && port.uso.trim() !== '' && port.uso.trim().toLowerCase() !== 'libre');

        if (isOccupied) {
          stats[port.switch_id].occupiedRj45 += 1;
        } else if (hasVlan || hasUso) {
          stats[port.switch_id].configuredRj45 += 1;
        } else {
          stats[port.switch_id].freeRj45 += 1;
        }
      }
    });

    return stats;
  }, [switchPorts]);

  // 2. GRÁFICO: OCUPACIÓN DE PUERTOS POR EDIFICIO
  const buildingOccupancyData = useMemo(() => {
    // Group switches by edificio
    const bldMap: Record<string, { 
      edificioId: string; 
      edificioNombre: string; 
      campusNombre: string;
      totalRj45: number; 
      occupiedRj45: number;
      switchCount: number;
    }> = {};

    // Initialize with all buildings that exist
    edificios.forEach(ed => {
      const camp = ed.campus_id ? campusMap.get(ed.campus_id) : undefined;
      bldMap[ed.id] = {
        edificioId: ed.id,
        edificioNombre: ed.nombre,
        campusNombre: camp?.nombre || '',
        totalRj45: 0,
        occupiedRj45: 0,
        switchCount: 0
      };
    });

    // Aggregate from switches
    equipos.filter(e => e.tipo === 'switch').forEach(sw => {
      const rack = sw.rack_id ? racksMap.get(sw.rack_id) : undefined;
      const piso = rack?.piso_id ? pisosMap.get(rack.piso_id) : undefined;
      const edificioId = piso?.edificio_id;

      if (edificioId && bldMap[edificioId]) {
        const stats = switchPortStats[sw.id] || { totalRj45: sw.puertos_totales || 24, occupiedRj45: 0 };
        bldMap[edificioId].totalRj45 += stats.totalRj45;
        bldMap[edificioId].occupiedRj45 += stats.occupiedRj45;
        bldMap[edificioId].switchCount += 1;
      }
    });

    // Convert to array and calculate percentage
    const results = Object.values(bldMap)
      .filter(b => b.totalRj45 > 0 || b.switchCount > 0)
      .map(b => {
        const pct = b.totalRj45 > 0 ? Math.round((b.occupiedRj45 / b.totalRj45) * 100) : 0;
        let color = '#10b981'; // Green < 75%
        if (pct >= 90) {
          color = '#ef4444'; // Red > 90%
        } else if (pct >= 75) {
          color = '#f59e0b'; // Yellow 75% - 90%
        }
        return {
          ...b,
          porcentaje: pct,
          color,
          displayLabel: b.edificioNombre.length > 22 ? `${b.edificioNombre.slice(0, 20)}…` : b.edificioNombre
        };
      })
      .sort((a, b) => b.porcentaje - a.porcentaje); // Highest first

    return results;
  }, [edificios, equipos, racksMap, pisosMap, campusMap, switchPortStats]);

  // 3. TABLA: RACKS EN RIESGO (Ocupación > 75%)
  const racksAtRisk = useMemo(() => {
    const list: {
      rack: Rack;
      edificioNombre: string;
      pisoNombre: string;
      ubicacionCompleta: string;
      totalRj45: number;
      occupiedRj45: number;
      freeRj45: number;
      percentage: number;
      switchCount: number;
    }[] = [];

    racks.forEach(rack => {
      const rackSwitches = equipos.filter(e => e.tipo === 'switch' && e.rack_id === rack.id);
      let totalRj45 = 0;
      let occupiedRj45 = 0;

      rackSwitches.forEach(sw => {
        const stats = switchPortStats[sw.id] || { totalRj45: sw.puertos_totales || 24, occupiedRj45: 0 };
        totalRj45 += stats.totalRj45;
        occupiedRj45 += stats.occupiedRj45;
      });

      if (totalRj45 > 0) {
        const percentage = Math.round((occupiedRj45 / totalRj45) * 100);
        if (percentage >= 75) {
          const piso = rack.piso_id ? pisosMap.get(rack.piso_id) : undefined;
          const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
          const ubicacionCompleta = getLocationString(rack.piso_id, rack.ubicacion_especifica);

          list.push({
            rack,
            edificioNombre: edificio?.nombre || 'Sin edificio',
            pisoNombre: piso?.nombre || 'Sin piso',
            ubicacionCompleta,
            totalRj45,
            occupiedRj45,
            freeRj45: Math.max(0, totalRj45 - occupiedRj45),
            percentage,
            switchCount: rackSwitches.length
          });
        }
      }
    });

    return list.sort((a, b) => b.percentage - a.percentage);
  }, [racks, equipos, pisosMap, edificiosMap, switchPortStats]);

  // 4. GRÁFICO: DISTRIBUCIÓN POR VLAN (Donut)
  const vlanDistributionData = useMemo(() => {
    const counts: Record<number, { count: number; vlan?: Vlan }> = {};

    // Group ports by VLAN
    switchPorts.forEach(port => {
      if (port.vlan_numero) {
        if (!counts[port.vlan_numero]) {
          const vObj = vlans.find(v => v.numero === port.vlan_numero);
          counts[port.vlan_numero] = { count: 0, vlan: vObj };
        }
        counts[port.vlan_numero].count += 1;
      }
    });

    return Object.entries(counts)
      .map(([numStr, item]) => {
        const num = Number(numStr);
        const name = item.vlan?.nombre || `VLAN ${num}`;
        const color = item.vlan?.color || '#3b82f6';
        return {
          vlanNumero: num,
          name: `VLAN ${num} · ${name}`,
          shortName: `VLAN ${num}`,
          value: item.count,
          color,
          descripcion: item.vlan?.descripcion || ''
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [switchPorts, vlans]);

  // 5. GRÁFICO: ESTADO DE CICLO DE VIDA (Cámaras + Equipos + Puntos)
  const lifecycleDistributionData = useMemo(() => {
    const counts: Record<string, number> = {
      instalado: 0,
      retirado_pendiente_bodega: 0,
      en_bodega: 0,
      dado_de_baja: 0
    };

    const allEntities = [
      ...camaras.map(c => c.estado_ciclo_vida || 'instalado'),
      ...equipos.map(e => e.estado_ciclo_vida || 'instalado'),
      ...puntosRed.map(p => p.estado_ciclo_vida || 'instalado')
    ];

    allEntities.forEach(status => {
      const s = status.toLowerCase();
      if (counts[s] !== undefined) {
        counts[s] += 1;
      } else {
        counts.instalado += 1;
      }
    });

    const labels: Record<string, { label: string; color: string }> = {
      instalado: { label: 'Instalado / Operativo', color: '#10b981' }, // Verde
      retirado_pendiente_bodega: { label: 'Retirado Pendiente Bodega', color: '#f59e0b' }, // Ámbar
      en_bodega: { label: 'En Bodega / Disponible', color: '#6366f1' }, // Índigo
      dado_de_baja: { label: 'Dado de Baja', color: '#ef4444' } // Rojo
    };

    return Object.entries(counts).map(([key, value]) => ({
      key,
      name: labels[key]?.label || key,
      value,
      color: labels[key]?.color || '#94a3b8'
    }));
  }, [camaras, equipos, puntosRed]);

  // 6. GRÁFICO: TENDENCIA DE INSTALACIONES (Últimos 12 meses)
  const installationTrendsData = useMemo(() => {
    const months: { key: string; label: string; camaras: number; puntos: number; equipos: number; total: number }[] = [];
    
    // Build last 12 months in chronological order
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthNum = d.getMonth() + 1;
      const key = `${year}-${String(monthNum).padStart(2, '0')}`;
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const label = `${monthNames[d.getMonth()]} ${String(year).slice(-2)}`;
      months.push({ key, label, camaras: 0, puntos: 0, equipos: 0, total: 0 });
    }

    const monthMap = new Map(months.map(m => [m.key, m]));

    const parseDateToKey = (dateStr?: string | null, fallbackCreated?: string | null): string | null => {
      const raw = dateStr || fallbackCreated;
      if (!raw) return null;
      try {
        const s = raw.slice(0, 7); // 'YYYY-MM'
        return s;
      } catch {
        return null;
      }
    };

    // Cámaras
    camaras.forEach(c => {
      const k = parseDateToKey(c.fecha_instalacion, c.created_at);
      if (k && monthMap.has(k)) {
        const item = monthMap.get(k)!;
        item.camaras += 1;
        item.total += 1;
      }
    });

    // Puntos de red
    puntosRed.forEach(p => {
      const k = parseDateToKey(p.fecha_instalacion, p.created_at);
      if (k && monthMap.has(k)) {
        const item = monthMap.get(k)!;
        item.puntos += 1;
        item.total += 1;
      }
    });

    // Equipos
    equipos.forEach(e => {
      const k = parseDateToKey(e.fecha_instalacion, e.created_at);
      if (k && monthMap.has(k)) {
        const item = monthMap.get(k)!;
        item.equipos += 1;
        item.total += 1;
      }
    });

    return months;
  }, [camaras, puntosRed, equipos]);

  // 7. EXPORTACIÓN A EXCEL DATASET COMPLETO
  const handleExportExcelDataset = () => {
    try {
      setExportingExcel(true);
      const wb = XLSX.utils.book_new();

      // 1. Hoja Cámaras
      const camHeaders = [
        'Código',
        'Tipo Dispositivo',
        'Tipo Cámara',
        'Marca',
        'Modelo',
        'Número de Serie',
        'Dirección MAC',
        'Dirección IP',
        'Ambiente',
        'Antivandálico',
        'Resolución MP',
        'Lente',
        'Zoom Óptico',
        'Sede',
        'Campus',
        'Edificio',
        'Piso',
        'Ubicación Específica',
        'Rack',
        'Patch Panel',
        'Puerto Patch',
        'Switch',
        'Puerto Switch',
        'NVR',
        'Canal NVR',
        'Estado Ciclo Vida',
        'Proveedor Compra',
        'Fecha Compra',
        'Proveedor Instalación',
        'Fecha Instalación',
        'Fecha Registro'
      ];

      const camRows = camaras.map(c => {
        const piso = c.piso_id ? pisosMap.get(c.piso_id) : undefined;
        const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
        const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
        const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;
        const rack = c.rack_id ? racksMap.get(c.rack_id) : undefined;

        return [
          c.codigo,
          c.tipo_dispositivo || 'N/A',
          c.tipo_camara || 'N/A',
          c.marca_rel?.nombre || c.marca || 'N/A',
          c.modelo_rel?.nombre || c.modelo || 'N/A',
          c.numero_serie || 'N/A',
          c.direccion_mac || 'N/A',
          c.direccion_ip || 'N/A',
          c.ambiente || 'N/A',
          c.antivandalico ? 'Sí' : 'No',
          c.resolucion_mp || 'N/A',
          c.lente || 'N/A',
          c.zoom_optico || 'N/A',
          sede?.nombre || 'N/A',
          campus?.nombre || 'N/A',
          edificio?.nombre || 'N/A',
          piso?.nombre || 'N/A',
          c.ubicacion_especifica || 'N/A',
          rack?.codigo || 'N/A',
          c.patch_panel?.codigo || 'N/A',
          c.puerto_patch ? `P${c.puerto_patch}` : 'N/A',
          c.switch?.codigo || 'N/A',
          c.puerto_switch ? `P${c.puerto_switch}` : 'N/A',
          c.nvr?.codigo || 'N/A',
          c.canal_nvr ? `Canal ${c.canal_nvr}` : 'N/A',
          c.estado_ciclo_vida || 'instalado',
          c.proveedor_compra?.nombre || 'N/A',
          c.fecha_compra || 'N/A',
          c.proveedor_instalacion?.nombre || 'N/A',
          c.fecha_instalacion || 'N/A',
          c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A'
        ];
      });

      const wsCams = XLSX.utils.aoa_to_sheet([camHeaders, ...camRows]);
      wsCams['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
      wsCams['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: camRows.length, c: camHeaders.length - 1 } }) };
      wsCams['!cols'] = camHeaders.map(h => ({ wch: Math.max(h.length + 3, 14) }));
      XLSX.utils.book_append_sheet(wb, wsCams, 'Cámaras');

      // 2. Hoja Puntos de Red
      const ptoHeaders = [
        'Código',
        'Tipo Punto',
        'Categoría Cable',
        'Marca',
        'Modelo',
        'Número de Serie',
        'Dirección MAC',
        'Dirección IP',
        'Sede',
        'Campus',
        'Edificio',
        'Piso',
        'Ubicación Específica',
        'Rack',
        'Patch Panel',
        'Puerto Patch',
        'Switch',
        'Puerto Switch',
        'Estado Ciclo Vida',
        'Proveedor Compra',
        'Fecha Compra',
        'Proveedor Instalación',
        'Fecha Instalación',
        'Fecha Registro'
      ];

      const ptoRows = puntosRed.map(p => {
        const piso = p.piso_id ? pisosMap.get(p.piso_id) : undefined;
        const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
        const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
        const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;
        const rack = p.rack_id ? racksMap.get(p.rack_id) : undefined;

        const tipoLabel = 
          p.tipo_punto === 'wifi_ap' ? 'AP WiFi' : 
          p.tipo_punto === 'datos_alumno' ? 'Datos Alumno' : 'Datos Funcionario';

        return [
          p.codigo,
          tipoLabel,
          p.categoria_cable?.toUpperCase() || 'N/A',
          p.marca_rel?.nombre || 'N/A',
          p.modelo_rel?.nombre || 'N/A',
          p.numero_serie || 'N/A',
          p.direccion_mac || 'N/A',
          p.direccion_ip || 'N/A',
          sede?.nombre || 'N/A',
          campus?.nombre || 'N/A',
          edificio?.nombre || 'N/A',
          piso?.nombre || 'N/A',
          p.ubicacion_especifica || 'N/A',
          rack?.codigo || 'N/A',
          p.patch_panel?.codigo || 'N/A',
          p.puerto_patch ? `P${p.puerto_patch}` : 'N/A',
          p.switch?.codigo || 'N/A',
          p.puerto_switch_id ? 'Asignado' : 'N/A',
          p.estado_ciclo_vida || 'instalado',
          p.proveedor_compra?.nombre || 'N/A',
          p.fecha_compra || 'N/A',
          p.proveedor_instalacion?.nombre || 'N/A',
          p.fecha_instalacion || 'N/A',
          p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'
        ];
      });

      const wsPtos = XLSX.utils.aoa_to_sheet([ptoHeaders, ...ptoRows]);
      wsPtos['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
      wsPtos['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ptoRows.length, c: ptoHeaders.length - 1 } }) };
      wsPtos['!cols'] = ptoHeaders.map(h => ({ wch: Math.max(h.length + 3, 14) }));
      XLSX.utils.book_append_sheet(wb, wsPtos, 'Puntos de Red');

      // 3. Hoja Equipos
      const eqHeaders = [
        'Código',
        'Tipo Equipo',
        'Marca',
        'Modelo',
        'Número de Serie',
        'IP Gestión',
        'VLAN Gestión',
        'Puertos Totales',
        'Canales Totales',
        'Capacidad VA',
        'Posición U Inicio',
        'Posición U Fin',
        'Sede',
        'Campus',
        'Edificio',
        'Piso',
        'Rack',
        'Estado Ciclo Vida',
        'Proveedor Compra',
        'Fecha Compra',
        'Proveedor Instalación',
        'Fecha Instalación',
        'Fecha Registro'
      ];

      const eqRows = equipos.map(e => {
        const rack = e.rack_id ? racksMap.get(e.rack_id) : undefined;
        const piso = rack?.piso_id ? pisosMap.get(rack.piso_id) : undefined;
        const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
        const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
        const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;

        return [
          e.codigo,
          e.tipo.toUpperCase(),
          e.marca_rel?.nombre || e.marca || 'N/A',
          e.modelo_rel?.nombre || e.modelo || 'N/A',
          e.numero_serie || 'N/A',
          e.ip_gestion || 'N/A',
          e.vlan ? `VLAN ${e.vlan}` : 'N/A',
          e.puertos_totales || 'N/A',
          e.canales_totales || 'N/A',
          e.capacidad_va || 'N/A',
          e.posicion_u_inicio || 'N/A',
          e.posicion_u_fin || 'N/A',
          sede?.nombre || 'N/A',
          campus?.nombre || 'N/A',
          edificio?.nombre || 'N/A',
          piso?.nombre || 'N/A',
          rack?.codigo || 'N/A',
          e.estado_ciclo_vida || 'instalado',
          e.proveedor_compra?.nombre || 'N/A',
          e.fecha_compra || 'N/A',
          e.proveedor_instalacion?.nombre || 'N/A',
          e.fecha_instalacion || 'N/A',
          e.created_at ? new Date(e.created_at).toLocaleDateString() : 'N/A'
        ];
      });

      const wsEqs = XLSX.utils.aoa_to_sheet([eqHeaders, ...eqRows]);
      wsEqs['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
      wsEqs['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: eqRows.length, c: eqHeaders.length - 1 } }) };
      wsEqs['!cols'] = eqHeaders.map(h => ({ wch: Math.max(h.length + 3, 14) }));
      XLSX.utils.book_append_sheet(wb, wsEqs, 'Equipos');

      // 4. Hoja Racks
      const rkHeaders = [
        'Código',
        'Altura (U)',
        'Formato',
        'Sede',
        'Campus',
        'Edificio',
        'Piso',
        'Ubicación Específica',
        'Custodia Llave',
        'Técnico Responsable',
        'Última Inspección',
        'Total Switches RJ45',
        'Puertos RJ45 Totales',
        'Puertos RJ45 Ocupados',
        '% Ocupación Puertos',
        'Equipos Instalados',
        'Anotaciones',
        'Fecha Creación'
      ];

      const rkRows = racks.map(r => {
        const piso = r.piso_id ? pisosMap.get(r.piso_id) : undefined;
        const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
        const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
        const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;

        const rackEquipos = equipos.filter(e => e.rack_id === r.id);
        const rackSwitches = rackEquipos.filter(e => e.tipo === 'switch');
        let totRj45 = 0;
        let occRj45 = 0;

        rackSwitches.forEach(sw => {
          const stats = switchPortStats[sw.id] || { totalRj45: sw.puertos_totales || 24, occupiedRj45: 0 };
          totRj45 += stats.totalRj45;
          occRj45 += stats.occupiedRj45;
        });

        const pct = totRj45 > 0 ? Math.round((occRj45 / totRj45) * 100) : 0;

        return [
          r.codigo,
          r.altura_u,
          r.formato || 'N/A',
          sede?.nombre || 'N/A',
          campus?.nombre || 'N/A',
          edificio?.nombre || 'N/A',
          piso?.nombre || 'N/A',
          r.ubicacion_especifica || 'N/A',
          r.custodia_llave || 'N/A',
          r.tecnico_responsable || 'N/A',
          r.ultima_inspeccion || 'N/A',
          rackSwitches.length,
          totRj45,
          occRj45,
          `${pct}%`,
          rackEquipos.length,
          r.anotaciones || 'N/A',
          r.created_at ? new Date(r.created_at).toLocaleDateString() : 'N/A'
        ];
      });

      const wsRks = XLSX.utils.aoa_to_sheet([rkHeaders, ...rkRows]);
      wsRks['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
      wsRks['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rkRows.length, c: rkHeaders.length - 1 } }) };
      wsRks['!cols'] = rkHeaders.map(h => ({ wch: Math.max(h.length + 3, 14) }));
      XLSX.utils.book_append_sheet(wb, wsRks, 'Racks');

      // Trigger download
      const todayStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Dataset_Completo_Infraestructura_${todayStr}.xlsx`);
    } catch (err) {
      console.error('Error exportando Excel dataset:', err);
      alert('Error generando el archivo Excel. Por favor reintenta.');
    } finally {
      setExportingExcel(false);
    }
  };

  // 7. EXPORTACIÓN A PDF CON PORTADA Y CAPTURA DE GRÁFICOS (html2canvas)
  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const todayStr = new Date().toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      const timeStr = new Date().toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit'
      });

      // Helper for header banner on internal pages
      const addPageHeader = (pageTitle: string, pageNum: number, totalPagesStr = '4') => {
        // Top banner bar
        doc.setFillColor(15, 23, 42); // slate-900
        doc.rect(0, 0, pageWidth, 18, 'F');

        doc.setFillColor(37, 99, 235); // blue-600
        doc.rect(0, 18, pageWidth, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text('UNIVERSIDAD DE TALCA · INFORME EJECUTIVO DE INFRAESTRUCTURA', 14, 11);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(todayStr, pageWidth - 14, 11, { align: 'right' });

        // Section Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42);
        doc.text(pageTitle, 14, 29);

        // Footer
        doc.setDrawColor(226, 232, 240);
        doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('CCTV InfraRegistro · Dirección de Tecnologías de Información', 14, pageHeight - 7);
        doc.text(`Página ${pageNum} de ${totalPagesStr}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
      };

      // --- PÁGINA 1: PORTADA EJECUTIVA ---
      // Decorative background geometric blocks
      doc.setFillColor(15, 23, 42); // slate-900 top cover
      doc.rect(0, 0, pageWidth, 90, 'F');

      doc.setFillColor(37, 99, 235); // blue accent strip
      doc.rect(0, 90, pageWidth, 4, 'F');

      // University Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(56, 189, 248); // sky-400
      doc.text('UNIVERSIDAD DE TALCA', 20, 32);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(203, 213, 225); // slate-300
      doc.text('Dirección de Tecnologías de la Información y Planta Física', 20, 40);

      // Main Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.setTextColor(255, 255, 255);
      doc.text('Informe Ejecutivo de', 20, 58);
      doc.text('Infraestructura', 20, 70);

      // Subtitle / Date badge
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text(`Fecha de emisión: ${todayStr} a las ${timeStr} hrs`, 20, 82);

      // Executive KPI Summary Panel on Cover Page
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text('Resumen Ejecutivo de Capacidad e Inventario', 20, 110);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(
        'El presente documento consolida la ocupación de puertos en bastidores, la distribución de VLANs de red,',
        20,
        118
      );
      doc.text(
        'el estado del ciclo de vida del parque tecnológico y el ritmo de intervenciones de los últimos 12 meses.',
        20,
        124
      );

      // KPI Boxes on Cover Page
      const kpiBoxes = [
        { label: 'CÁMARAS CCTV', val: `${kpiSummary.totalCamaras}`, sub: 'Dispositivos de videovigilancia' },
        { 
          label: 'PUNTOS DE RED', 
          val: `${kpiSummary.totalPuntosRed}`, 
          sub: `${kpiSummary.puntosFuncionario} Func. | ${kpiSummary.puntosAlumno} Alum. | ${kpiSummary.puntosWifi} WiFi` 
        },
        { label: 'EQUIPOS DE RACK', val: `${kpiSummary.totalEquipos}`, sub: `${kpiSummary.switchesCount} Switches activos` },
        { label: 'BASTIDORES RACK', val: `${kpiSummary.totalRacks}`, sub: `${racksAtRisk.length} racks en umbral crítico (>75%)` },
      ];

      kpiBoxes.forEach((kpi, idx) => {
        const yPos = 135 + idx * 24;
        doc.setFillColor(248, 250, 252); // slate-50
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.roundedRect(20, yPos, pageWidth - 40, 20, 2, 2, 'FD');

        // Blue accent bar on left of card
        doc.setFillColor(37, 99, 235);
        doc.rect(20, yPos, 3, 20, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.label, 28, yPos + 7);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42);
        doc.text(kpi.val, 28, yPos + 16);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(kpi.sub, pageWidth - 26, yPos + 12, { align: 'right' });
      });

      // Bottom Note
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        'Datos sincronizados en tiempo real desde la plataforma CCTV InfraRegistro · Campus Central y Alameda.',
        20,
        pageHeight - 20
      );

      // --- PÁGINA 2: OCUPACIÓN DE PUERTOS POR EDIFICIO & RACKS EN RIESGO ---
      doc.addPage();
      addPageHeader('1. Ocupación de Puertos y Racks en Riesgo', 2);

      // Capture Building Bar Chart
      if (chartEdificiosRef.current) {
        try {
          const canvas = await html2canvas(chartEdificiosRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - 28;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          doc.addImage(imgData, 'PNG', 14, 35, imgWidth, Math.min(imgHeight, 105));
        } catch (e) {
          console.error('Error capturando gráfico de edificios:', e);
        }
      }

      // Capture Racks Table
      if (tableRacksRef.current) {
        try {
          const canvas = await html2canvas(tableRacksRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - 28;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          doc.addImage(imgData, 'PNG', 14, 150, imgWidth, Math.min(imgHeight, 120));
        } catch (e) {
          console.error('Error capturando tabla de racks en riesgo:', e);
        }
      }

      // --- PÁGINA 3: DISTRIBUCIÓN POR VLAN & ESTADO DE CICLO DE VIDA ---
      doc.addPage();
      addPageHeader('2. Distribución de VLANs y Ciclo de Vida', 3);

      if (chartVlanRef.current) {
        try {
          const canvas = await html2canvas(chartVlanRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - 28;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          doc.addImage(imgData, 'PNG', 14, 35, imgWidth, Math.min(imgHeight, 115));
        } catch (e) {
          console.error('Error capturando gráfico de VLANs:', e);
        }
      }

      if (chartLifecycleRef.current) {
        try {
          const canvas = await html2canvas(chartLifecycleRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - 28;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          doc.addImage(imgData, 'PNG', 14, 155, imgWidth, Math.min(imgHeight, 115));
        } catch (e) {
          console.error('Error capturando gráfico de ciclo de vida:', e);
        }
      }

      // --- PÁGINA 4: TENDENCIA DE INSTALACIONES (ÚLTIMOS 12 MESES) ---
      doc.addPage();
      addPageHeader('3. Tendencia y Ritmo de Avance de Inventario', 4);

      if (chartTrendRef.current) {
        try {
          const canvas = await html2canvas(chartTrendRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = pageWidth - 28;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          doc.addImage(imgData, 'PNG', 14, 35, imgWidth, Math.min(imgHeight, 140));
        } catch (e) {
          console.error('Error capturando gráfico de tendencia:', e);
        }
      }

      // Save PDF file
      const filename = `Informe_Ejecutivo_Infraestructura_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Error generando PDF ejecutivo:', err);
      alert('Hubo un error al generar el PDF. Por favor verifica e intenta nuevamente.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shadow-2xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold font-mono text-slate-900 tracking-tight flex items-center gap-2">
                <span>Dashboard Ejecutivo de Infraestructura</span>
              </h1>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Capacidad de conmutación, distribución de VLANs y monitoreo en tiempo real · Universidad de Talca
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Recargar datos desde la base de datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Generar PDF ejecutivo con portada y gráficos capturados"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{exportingPdf ? 'Generando PDF...' : 'Exportar a PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcelDataset}
            disabled={exportingExcel || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Exportar dataset completo en Excel con hojas separadas para Cámaras, Puntos de Red, Equipos y Racks"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exportingExcel ? 'Generando Excel...' : 'Exportar Dataset Completo (Excel)'}</span>
          </button>
        </div>
      </div>

      {/* 1. TARJETAS DE RESUMEN (arriba, en una fila) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cámaras */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase font-bold text-slate-500 tracking-wider">
              Total Cámaras
            </span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Camera className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 tracking-tight">
              {loading ? '...' : kpiSummary.totalCamaras}
            </div>
            <div className="text-[11px] text-slate-500 font-sans mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>CCTV en campus y salas</span>
            </div>
          </div>
        </div>

        {/* Total Puntos de Red (desglosado por Funcionario/Alumno/AP WiFi) */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase font-bold text-slate-500 tracking-wider">
              Puntos de Red
            </span>
            <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600 border border-cyan-100">
              <Network className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 tracking-tight">
              {loading ? '...' : kpiSummary.totalPuntosRed}
            </div>
            {/* Desglose visual explícito */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-semibold" title="Puntos para Funcionarios / Administrativos">
                <Briefcase className="w-2.5 h-2.5" />
                <span>Func: {kpiSummary.puntosFuncionario}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold" title="Puntos para Alumnos / Aulas">
                <GraduationCap className="w-2.5 h-2.5" />
                <span>Alum: {kpiSummary.puntosAlumno}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 font-semibold" title="Puntos para Puntos de Acceso WiFi">
                <Wifi className="w-2.5 h-2.5" />
                <span>WiFi: {kpiSummary.puntosWifi}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Total Equipos de Rack */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase font-bold text-slate-500 tracking-wider">
              Equipos de Rack
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 tracking-tight">
              {loading ? '...' : kpiSummary.totalEquipos}
            </div>
            <div className="text-[11px] text-slate-500 font-sans mt-1">
              <span>{kpiSummary.switchesCount} Switches · {kpiSummary.patchPanelsCount} Patch Panels · {kpiSummary.nvrsCount} NVRs</span>
            </div>
          </div>
        </div>

        {/* Total Racks */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase font-bold text-slate-500 tracking-wider">
              Total Racks
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 tracking-tight">
              {loading ? '...' : kpiSummary.totalRacks}
            </div>
            <div className="text-[11px] text-slate-500 font-sans mt-1 flex items-center justify-between">
              <span>Bastidores de telecomunicaciones</span>
              {racksAtRisk.length > 0 && (
                <span className="text-[10px] font-mono font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                  {racksAtRisk.length} en riesgo
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. GRÁFICO: OCUPACIÓN DE PUERTOS POR EDIFICIO */}
      <div 
        ref={chartEdificiosRef} 
        className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold font-mono text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>Ocupación de Puertos de Switch por Edificio</span>
            </h2>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Porcentaje de puertos RJ45 ocupados sobre el total disponible en cada edificio (umbral normativo: 75%)
            </p>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>&lt;75% Normal</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>75%-90% Alerta</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>&gt;90% Crítico</span>
            </span>
          </div>
        </div>

        {buildingOccupancyData.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-mono text-xs">
            No se registran switches asignados a edificios actualmente.
          </div>
        ) : (
          <div className="w-full h-[280px] sm:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={buildingOccupancyData}
                margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} stroke="#f1f5f9" />
                <XAxis 
                  type="number" 
                  domain={[0, 100]} 
                  unit="%" 
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
                <YAxis 
                  type="category" 
                  dataKey="displayLabel" 
                  width={150} 
                  tick={{ fontSize: 11, fill: '#1e293b', fontWeight: 500 }}
                />
                <Tooltip
                  formatter={(val: any, name: any, item: any) => [
                    `${val}% (${item.payload.occupiedRj45} de ${item.payload.totalRj45} puertos ocupados en ${item.payload.switchCount} switch${item.payload.switchCount === 1 ? '' : 'es'})`,
                    'Ocupación RJ45'
                  ]}
                  labelFormatter={(lbl: any, payload: any) => payload?.[0]?.payload?.edificioNombre || lbl}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, color: '#ffffff', fontSize: 12, fontFamily: 'monospace' }}
                  itemStyle={{ color: '#38bdf8' }}
                />
                <ReferenceLine 
                  x={75} 
                  stroke="#ef4444" 
                  strokeDasharray="4 4" 
                  strokeWidth={2}
                  label={{ value: 'Umbral 75%', position: 'top', fill: '#ef4444', fontSize: 11, fontWeight: 'bold' }} 
                />
                <Bar 
                  dataKey="porcentaje" 
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                >
                  {buildingOccupancyData.map((entry, index) => (
                    <Cell key={`cell-bld-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 3. TABLA: RACKS EN RIESGO (Ocupación > 75%) */}
      <div 
        ref={tableRacksRef} 
        className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold font-mono text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Racks en Riesgo de Capacidad (Ocupación &gt; 75%)</span>
            </h2>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Información accionable para planificar compras de nuevos switches o expansión de unidades de rack
            </p>
          </div>

          <span className="text-xs font-mono font-bold text-slate-600">
            {racksAtRisk.length} {racksAtRisk.length === 1 ? 'rack en alerta' : 'racks en alerta'}
          </span>
        </div>

        {racksAtRisk.length === 0 ? (
          <div className="p-6 bg-emerald-50/50 border border-emerald-200 rounded-lg text-emerald-800 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs font-sans">
              <strong className="font-bold">Capacidad en estado óptimo:</strong> Ningún bastidor rack supera el 75% de ocupación de puertos RJ45 en conmutación.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Rack</th>
                  <th className="py-2.5 px-3">Ubicación Física</th>
                  <th className="py-2.5 px-3">Switches</th>
                  <th className="py-2.5 px-3 text-center">% Ocupación</th>
                  <th className="py-2.5 px-3 text-center">Puertos Ocupados / Total</th>
                  <th className="py-2.5 px-3 text-center">Puertos Libres Restantes</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {racksAtRisk.map((item) => {
                  const isCrit = item.percentage >= 90;
                  return (
                    <tr key={`risk-rack-${item.rack.id}`} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{item.rack.codigo}</div>
                        <div className="text-[10px] text-slate-500 font-sans">{item.rack.altura_u}U {item.rack.formato ? `· ${item.rack.formato}` : ''}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate" title={item.ubicacionCompleta}>
                        <div className="font-semibold text-slate-900">{item.edificioNombre} · {item.pisoNombre}</div>
                        <div className="text-[10px] text-slate-500 truncate">{item.rack.ubicacion_especifica || 'Gabinete'}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {item.switchCount} switch{item.switchCount === 1 ? '' : 'es'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-xs ${
                          isCrit ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          <AlertTriangle className="w-3 h-3" />
                          <span>{item.percentage}%</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-800 font-medium">
                        {item.occupiedRj45} / {item.totalRj45} p
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`font-bold px-2 py-0.5 rounded ${
                          item.freeRj45 === 0 
                            ? 'bg-rose-50 text-rose-700 font-black' 
                            : 'bg-slate-100 text-slate-800'
                        }`}>
                          {item.freeRj45} {item.freeRj45 === 1 ? 'puerto libre' : 'puertos libres'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {onSelectRack && (
                          <button
                            type="button"
                            onClick={() => onSelectRack(item.rack)}
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                            title="Ver elevación y puertos de este rack"
                          >
                            <span>Ver Rack</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4 & 5. GRÁFICOS CIRCULARES: DISTRIBUCIÓN POR VLAN & ESTADO DE CICLO DE VIDA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 4. GRÁFICO: DISTRIBUCIÓN POR VLAN (Donut) */}
        <div 
          ref={chartVlanRef} 
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3 flex flex-col justify-between"
        >
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold font-mono text-slate-900 flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-cyan-600" />
              <span>Distribución de Puertos por VLAN</span>
            </h2>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Conteo de bocas de switch asignadas por cada VLAN registrada en el catálogo universitario
            </p>
          </div>

          {vlanDistributionData.length === 0 ? (
            <div className="p-8 text-center text-slate-400 font-mono text-xs">
              No hay puertos asignados a VLANs actualmente.
            </div>
          ) : (
            <>
              <div className="w-full h-[240px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={vlanDistributionData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {vlanDistributionData.map((entry, index) => (
                        <Cell key={`cell-vlan-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any, name: any) => [`${val} puertos`, name]}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, color: '#ffffff', fontSize: 12, fontFamily: 'monospace' }}
                      itemStyle={{ color: '#38bdf8' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Leyenda con colores propios de cada VLAN */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px] font-mono">
                {vlanDistributionData.map((v) => (
                  <div key={`legend-vlan-${v.vlanNumero}`} className="flex items-center gap-1.5 p-1 rounded bg-slate-50 border border-slate-100">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                    <span className="truncate font-semibold text-slate-800" title={v.name}>{v.shortName}</span>
                    <span className="text-slate-500 text-[10px] ml-auto font-bold">{v.value}p</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 5. GRÁFICO: ESTADO DE CICLO DE VIDA (Torta) */}
        <div 
          ref={chartLifecycleRef} 
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3 flex flex-col justify-between"
        >
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold font-mono text-slate-900 flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-emerald-600" />
              <span>Estado de Ciclo de Vida del Parque Tecnológico</span>
            </h2>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Consolidado de cámaras + equipos de rack + puntos de red según su ciclo operativo
            </p>
          </div>

          <div className="w-full h-[240px] sm:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={lifecycleDistributionData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={0}
                  outerRadius={85}
                  label={({ percent }: any) => (percent && percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : '')}
                  labelLine={false}
                >
                  {lifecycleDistributionData.map((entry, index) => (
                    <Cell key={`cell-life-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any, name: any) => [`${val} activos`, name]}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, color: '#ffffff', fontSize: 12, fontFamily: 'monospace' }}
                  itemStyle={{ color: '#38bdf8' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Leyenda de Ciclo de Vida */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px] font-mono">
            {lifecycleDistributionData.map((item) => (
              <div key={`legend-life-${item.key}`} className="flex items-center gap-1.5 p-1.5 rounded bg-slate-50 border border-slate-100">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="truncate font-semibold text-slate-800" title={item.name}>{item.name}</span>
                <span className="text-slate-600 text-[10px] ml-auto font-bold">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. GRÁFICO: TENDENCIA DE INSTALACIONES (Últimos 12 meses) */}
      <div 
        ref={chartTrendRef} 
        className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold font-mono text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>Tendencia y Ritmo de Instalaciones (Últimos 12 Meses)</span>
            </h2>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Cantidad de dispositivos (cámaras, puntos de red y equipos) incorporados mensualmente al inventario
            </p>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-600" />
              <span>Total Nuevos</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-cyan-500" />
              <span>Cámaras</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-500" />
              <span>Puntos Red</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-indigo-500" />
              <span>Equipos</span>
            </span>
          </div>
        </div>

        <div className="w-full h-[280px] sm:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={installationTrendsData}
              margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <YAxis 
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, color: '#ffffff', fontSize: 12, fontFamily: 'monospace' }}
                itemStyle={{ color: '#38bdf8' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'monospace', paddingTop: 8 }} />
              <Line 
                type="monotone" 
                dataKey="total" 
                name="Total Dispositivos" 
                stroke="#2563eb" 
                strokeWidth={3} 
                dot={{ r: 4, fill: '#2563eb' }}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey="camaras" 
                name="Cámaras CCTV" 
                stroke="#06b6d4" 
                strokeWidth={1.5} 
                dot={{ r: 3, fill: '#06b6d4' }}
              />
              <Line 
                type="monotone" 
                dataKey="puntos" 
                name="Puntos de Red" 
                stroke="#10b981" 
                strokeWidth={1.5} 
                dot={{ r: 3, fill: '#10b981' }}
              />
              <Line 
                type="monotone" 
                dataKey="equipos" 
                name="Equipos Rack" 
                stroke="#8b5cf6" 
                strokeWidth={1.5} 
                dot={{ r: 3, fill: '#8b5cf6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
