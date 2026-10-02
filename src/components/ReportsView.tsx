import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  Download, 
  Printer, 
  RefreshCw, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  AlertCircle, 
  Server, 
  Network, 
  Cable, 
  HardDrive, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  Cpu, 
  Camera, 
  Layers, 
  Filter, 
  ArrowRight,
  Sparkles,
  Info
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Equipo, Camara, Rack, Piso, Edificio, Campus, Sede } from '../types/database';
import { calculateEquipmentOccupancy, EquipmentOccupancyInfo, OccupancyStatus } from '../utils/occupancyAlerts';

interface ReportsViewProps {
  onSelectRack?: (rack: Rack) => void;
  onNavigateToPorts?: (equipmentId?: string) => void;
  onSelectCamera?: (camera: Camara) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  onSelectRack,
  onNavigateToPorts,
  onSelectCamera,
}) => {
  const [activeTab, setActiveTab] = useState<'capacidad' | 'conectividad' | 'futuros'>('capacidad');
  const [loading, setLoading] = useState(true);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [nvrUplinks, setNvrUplinks] = useState<Record<string, any>>({});

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | OccupancyStatus>('all');
  const [filterTipo, setFilterTipo] = useState<'all' | 'switch' | 'nvr' | 'patch_panel'>('all');
  const [filterRackId, setFilterRackId] = useState<string>('all');

  // Expanded equipment id for connected device details
  const [expandedEquipoId, setExpandedEquipoId] = useState<string | null>(null);

  // Load NVR uplinks from storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cctv_nvr_uplinks');
      if (saved) setNvrUplinks(JSON.parse(saved));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [
        { data: eqData },
        { data: camData },
        { data: rkData },
        { data: psData },
        { data: edData },
        { data: sdData },
      ] = await Promise.all([
        supabase
          .from('equipos')
          .select('*, marca_rel:marcas(*), modelo_rel:modelos(*), rack:racks(*)')
          .or('estado_ciclo_vida.is.null,estado_ciclo_vida.eq.instalado')
          .order('codigo'),
        supabase
          .from('camaras')
          .select('*, patch_panel:equipos!patch_panel_id(*), switch:equipos!switch_id(*), nvr:equipos!nvr_id(*)')
          .or('estado_ciclo_vida.is.null,estado_ciclo_vida.eq.instalado'),
        supabase.from('racks').select('*, piso:pisos(*)').order('codigo'),
        supabase.from('pisos').select('*'),
        supabase.from('edificios').select('*'),
        supabase.from('sedes').select('*'),
      ]);

      setEquipos(eqData || []);
      setCamaras(camData || []);
      setRacks(rkData || []);
      setPisos(psData || []);
      setEdificios(edData || []);
      setSedes(sdData || []);
    } catch (err) {
      console.error('Error loading reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute lookup maps
  const racksMap = useMemo(() => new Map(racks.map(r => [r.id, r])), [racks]);
  const pisosMap = useMemo(() => new Map(pisos.map(p => [p.id, p])), [pisos]);
  const edificiosMap = useMemo(() => new Map(edificios.map(e => [e.id, e])), [edificios]);

  // Compute occupancy for switches, NVRs, and patch panels
  const occupancyList = useMemo(() => {
    const relevant = equipos.filter(
      e => e.tipo === 'switch' || e.tipo === 'nvr' || e.tipo === 'patch_panel'
    );

    return relevant.map(eq => {
      const occ = calculateEquipmentOccupancy(eq, camaras, nvrUplinks);
      const rack = eq.rack_id ? racksMap.get(eq.rack_id) : undefined;
      const piso = rack?.piso_id ? pisosMap.get(rack.piso_id) : undefined;
      const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;

      const locParts: string[] = [];
      if (edificio) locParts.push(edificio.nombre);
      if (piso) locParts.push(piso.nombre);
      if (rack) locParts.push(`Rack ${rack.codigo}`);

      return {
        ...occ,
        equipo: eq,
        rack,
        ubicacionStr: locParts.length > 0 ? locParts.join(' > ') : 'Sin asignar a Rack',
        marcaNombre: eq.marca_rel?.nombre || eq.marca || '-',
        modeloNombre: eq.modelo_rel?.nombre || eq.modelo || 'Sin Modelo',
      };
    });
  }, [equipos, camaras, nvrUplinks, racksMap, pisosMap, edificiosMap]);

  // Filtered list
  const filteredList = useMemo(() => {
    return occupancyList.filter(item => {
      // Status filter
      if (filterStatus !== 'all' && item.status !== filterStatus) return false;

      // Tipo filter
      if (filterTipo !== 'all' && item.tipo !== filterTipo) return false;

      // Rack filter
      if (filterRackId !== 'all') {
        if (filterRackId === 'sin_rack' && item.equipo.rack_id) return false;
        if (filterRackId !== 'sin_rack' && item.equipo.rack_id !== filterRackId) return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchCode = item.equipoCodigo.toLowerCase().includes(q);
        const matchMarca = item.marcaNombre.toLowerCase().includes(q);
        const matchModelo = item.modeloNombre.toLowerCase().includes(q);
        const matchUbi = item.ubicacionStr.toLowerCase().includes(q);
        if (!matchCode && !matchMarca && !matchModelo && !matchUbi) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort by status criticality (critico first, then alerta, then optimo), then percentage desc
      const priority = { critico: 3, alerta: 2, optimo: 1 };
      if (priority[b.status] !== priority[a.status]) {
        return priority[b.status] - priority[a.status];
      }
      return b.percentage - a.percentage;
    });
  }, [occupancyList, filterStatus, filterTipo, filterRackId, search]);

  // KPIs
  const kpis = useMemo(() => {
    let totalCap = 0;
    let totalOcc = 0;
    let critCount = 0;
    let alertCount = 0;
    let optCount = 0;

    occupancyList.forEach(item => {
      totalCap += item.totalCapacity;
      totalOcc += item.occupiedCount;
      if (item.status === 'critico') critCount++;
      else if (item.status === 'alerta') alertCount++;
      else optCount++;
    });

    const globalPct = totalCap > 0 ? Math.round((totalOcc / totalCap) * 100) : 0;

    return {
      totalDevices: occupancyList.length,
      critCount,
      alertCount,
      optCount,
      totalCap,
      totalOcc,
      globalPct,
    };
  }, [occupancyList]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Codigo',
      'Tipo Dispositivo',
      'Rack',
      'Ubicacion Fisica',
      'Marca',
      'Modelo',
      'Capacidad Total (Puertos/Canales)',
      'Ocupados',
      'Disponibles',
      'Porcentaje Ocupacion',
      'Estado Alerta',
      'Directriz / Accion Recomendada',
      'Total Camaras Conectadas',
      'Detalle Conexiones'
    ];

    const rows = filteredList.map(item => {
      const connectionsDetail = item.connectedCameras
        .map(c => `[${c.portOrChannel}: ${c.camera.codigo} ${c.camera.modelo || ''}]`)
        .join('; ');

      return [
        `"${item.equipoCodigo}"`,
        `"${item.tipo.toUpperCase()}"`,
        `"${item.rack?.codigo || 'N/A'}"`,
        `"${item.ubicacionStr}"`,
        `"${item.marcaNombre}"`,
        `"${item.modeloNombre}"`,
        item.totalCapacity,
        item.occupiedCount,
        item.availableCount,
        `"${item.percentage}%"`,
        `"${item.statusLabel}"`,
        `"${item.recommendation}"`,
        item.connectedCameras.length,
        `"${connectionsDetail.replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_Capacidad_Ocupacion_CCTV_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'switch':
        return <Network className="w-4 h-4 text-blue-600" />;
      case 'nvr':
        return <HardDrive className="w-4 h-4 text-indigo-600" />;
      case 'patch_panel':
        return <Cable className="w-4 h-4 text-slate-700" />;
      default:
        return <Server className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner / Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-mono text-slate-900 tracking-tight flex items-center gap-2">
                <span>Módulo de Reportes & Capacidad</span>
                <span className="text-xs font-mono font-normal uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                  Estándar 75%
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Control de Ocupación, Alertas de Sobrecapacidad y Directrices de Ampliación de Inventario
              </p>
            </div>
          </div>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded transition-colors shadow-2xs"
            title="Refrescar datos de la base de datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded transition-colors shadow-2xs"
            title="Exportar reporte completo a formato CSV compatible con Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar CSV / Excel</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-xs"
            title="Imprimir o exportar reporte a PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      {/* Report Module Tabs */}
      <div className="border-b border-slate-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('capacidad')}
            className={`px-4 py-2.5 text-xs font-bold font-mono border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'capacidad'
                ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Capacidad & Expansión de Inventario</span>
            {kpis.critCount > 0 && (
              <span className="text-[10px] bg-rose-600 text-white px-1.5 py-0.2 rounded-full font-bold animate-pulse">
                {kpis.critCount} críticos
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('conectividad')}
            className={`px-4 py-2.5 text-xs font-bold font-mono border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'conectividad'
                ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Matriz de Dispositivos Conectados</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('futuros')}
            className={`px-4 py-2.5 text-xs font-bold font-mono border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'futuros'
                ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Próximos Reportes</span>
          </button>
        </div>

        {/* Standard Threshold Legend Strip */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
          <span className="font-semibold text-slate-700">Norma Ocupación:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>&lt;73% Verde (Holgura)</span>
          </span>
          <span className="text-slate-300">•</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>74-77% Amarillo (Alerta Límite)</span>
          </span>
          <span className="text-slate-300">•</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>&ge;78% Rojo (Ampliación Requerida)</span>
          </span>
        </div>
      </div>

      {activeTab === 'capacidad' && (
        <div className="space-y-6">
          {/* Executive KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs font-mono">
              <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">
                Total Equipos
              </span>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {kpis.totalDevices}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Switches, NVRs y Patch
              </span>
            </div>

            <div className={`p-4 rounded-lg border shadow-2xs font-mono ${
              kpis.critCount > 0 ? 'bg-rose-50/80 border-rose-300' : 'bg-white border-slate-200'
            }`}>
              <span className="text-[10px] text-rose-700 font-bold uppercase block tracking-wider flex items-center justify-between">
                <span>Críticos (&ge;78%)</span>
                {kpis.critCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />}
              </span>
              <div className="text-2xl font-bold text-rose-700 mt-1">
                {kpis.critCount}
              </div>
              <span className="text-[10px] text-rose-600 font-semibold mt-0.5 block">
                🔴 Requieren Ampliación
              </span>
            </div>

            <div className={`p-4 rounded-lg border shadow-2xs font-mono ${
              kpis.alertCount > 0 ? 'bg-amber-50/80 border-amber-300' : 'bg-white border-slate-200'
            }`}>
              <span className="text-[10px] text-amber-800 font-bold uppercase block tracking-wider">
                En Alerta (74-77%)
              </span>
              <div className="text-2xl font-bold text-amber-800 mt-1">
                {kpis.alertCount}
              </div>
              <span className="text-[10px] text-amber-700 font-semibold mt-0.5 block">
                🟡 Límite Estándar
              </span>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs font-mono">
              <span className="text-[10px] text-emerald-700 font-bold uppercase block tracking-wider">
                Holgura (&lt;73%)
              </span>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                {kpis.optCount}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                🟢 Capacidad Suficiente
              </span>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs font-mono">
              <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">
                Puertos / Canales Red
              </span>
              <div className="text-2xl font-bold text-blue-600 mt-1">
                {kpis.totalOcc} <span className="text-xs text-slate-400 font-normal">/ {kpis.totalCap}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden border border-slate-200">
                <div 
                  className={`h-full ${kpis.globalPct >= 78 ? 'bg-rose-500' : kpis.globalPct >= 74 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                  style={{ width: `${Math.min(100, kpis.globalPct)}%` }} 
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Ocupación global {kpis.globalPct}%
              </span>
            </div>
          </div>

          {/* Action Directive Callout Banner when critical items exist */}
          {kpis.critCount > 0 ? (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-lg p-4 font-mono text-xs shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 animate-bounce" />
                  <span>DIRECTRIZ DE AMPLIACIÓN DE INVENTARIO URGENTE</span>
                </div>
                <span className="bg-rose-600 text-white font-bold px-2 py-0.5 rounded text-[11px]">
                  {kpis.critCount} EQUIPO(S) SATURADO(S)
                </span>
              </div>
              <p className="text-rose-800 text-[11px] leading-relaxed">
                Se han detectado dispositivos con ocupación igual o superior al <strong>78%</strong> (superando el umbral estándar del 75%). Para asegurar la continuidad operativa del sistema CCTV y permitir nuevas conexiones de cámaras, se recomienda programar la compra y montaje de equipamiento adicional según el listado inferior.
              </p>
            </div>
          ) : (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 font-mono text-xs flex items-center justify-between text-emerald-900">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Inventario Saludable:</strong> Ningún switch ni grabador NVR supera el umbral crítico del 78%. El margen de crecimiento está dentro de los parámetros seguros.
                </span>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3 font-mono text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por código, marca, modelo, rack..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Status Filter */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md border border-slate-200 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setFilterStatus('all')}
                    className={`px-2 py-1 rounded transition-colors ${
                      filterStatus === 'all' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todos ({occupancyList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('critico')}
                    className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                      filterStatus === 'critico' ? 'bg-rose-600 text-white font-bold shadow-2xs' : 'text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    <span>Críticos</span>
                    <span className="text-[10px] opacity-90">({kpis.critCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('alerta')}
                    className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                      filterStatus === 'alerta' ? 'bg-amber-500 text-white font-bold shadow-2xs' : 'text-amber-800 hover:bg-amber-50'
                    }`}
                  >
                    <span>Alerta</span>
                    <span className="text-[10px] opacity-90">({kpis.alertCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('optimo')}
                    className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                      filterStatus === 'optimo' ? 'bg-emerald-600 text-white font-bold shadow-2xs' : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    <span>Holgura</span>
                    <span className="text-[10px] opacity-90">({kpis.optCount})</span>
                  </button>
                </div>

                {/* Tipo Filter */}
                <select
                  value={filterTipo}
                  onChange={(e) => setFilterTipo(e.target.value as any)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white text-slate-700 font-mono"
                >
                  <option value="all">Todos los Tipos</option>
                  <option value="switch">Switches de Red</option>
                  <option value="nvr">Grabadores NVR</option>
                  <option value="patch_panel">Patch Panels</option>
                </select>

                {/* Rack Filter */}
                <select
                  value={filterRackId}
                  onChange={(e) => setFilterRackId(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white text-slate-700 font-mono"
                >
                  <option value="all">Todos los Racks</option>
                  {racks.map(r => (
                    <option key={r.id} value={r.id}>Rack {r.codigo}</option>
                  ))}
                  <option value="sin_rack">Sin Rack Asignado</option>
                </select>
              </div>
            </div>
          </div>

          {/* Interactive Report Table */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden font-mono text-xs">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs">
                Listado Detallado de Equipos & Ocupación ({filteredList.length})
              </span>
              <span className="text-[11px] text-slate-500 font-sans">
                Haz clic en una fila para ver las cámaras y puertos conectados
              </span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                <span>Analizando infraestructura y ocupación de puertos...</span>
              </div>
            ) : filteredList.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
                <p className="font-bold text-slate-700 text-sm">No se encontraron equipos con los filtros seleccionados</p>
                <p className="text-[11px] text-slate-500">Prueba ajustando los filtros de estado o la búsqueda.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-100/80 border-b border-slate-200 text-[10px] text-slate-600 uppercase font-bold tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Dispositivo</th>
                      <th className="py-2.5 px-3">Ubicación / Rack</th>
                      <th className="py-2.5 px-3">Marca / Modelo</th>
                      <th className="py-2.5 px-3 text-center">Total</th>
                      <th className="py-2.5 px-3 text-center">En Uso</th>
                      <th className="py-2.5 px-3 text-center">Libres</th>
                      <th className="py-2.5 px-3 min-w-[180px]">% Ocupación (Norma 75%)</th>
                      <th className="py-2.5 px-3">Estado / Directriz</th>
                      <th className="py-2.5 px-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredList.map((item) => {
                      const isExpanded = expandedEquipoId === item.equipoId;
                      return (
                        <React.Fragment key={item.equipoId}>
                          <tr 
                            onClick={() => setExpandedEquipoId(isExpanded ? null : item.equipoId)}
                            className={`cursor-pointer transition-colors ${
                              isExpanded 
                                ? 'bg-blue-50/40' 
                                : item.status === 'critico'
                                ? 'hover:bg-rose-50/40'
                                : item.status === 'alerta'
                                ? 'hover:bg-amber-50/40'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              <div className="flex items-center gap-2">
                                {getTipoIcon(item.tipo)}
                                <div>
                                  <span className="font-mono text-xs">{item.equipoCodigo}</span>
                                  <span className="text-[10px] text-slate-400 block font-normal uppercase">
                                    {item.tipo.replace('_', ' ')}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                              <span>{item.ubicacionStr}</span>
                            </td>

                            <td className="py-2.5 px-3 text-slate-700 text-[11px]">
                              <span className="font-semibold">{item.marcaNombre}</span>
                              <span className="text-slate-400 block text-[10px]">{item.modeloNombre}</span>
                            </td>

                            <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                              {item.totalCapacity}
                            </td>

                            <td className="py-2.5 px-3 text-center font-bold text-blue-700">
                              {item.occupiedCount}
                            </td>

                            <td className="py-2.5 px-3 text-center font-bold text-slate-500">
                              {item.availableCount}
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px] font-bold">
                                  <span className={item.badgeTextClass}>{item.percentage}%</span>
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    {item.occupiedCount} de {item.totalCapacity}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                  <div 
                                    className={`h-full ${item.barColorClass}`} 
                                    style={{ width: `${Math.min(100, item.percentage)}%` }} 
                                  />
                                </div>
                              </div>
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="flex flex-col gap-0.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${item.badgeBgClass}`}>
                                  {item.status === 'critico' && <AlertTriangle className="w-3 h-3 shrink-0" />}
                                  {item.status === 'alerta' && <AlertCircle className="w-3 h-3 shrink-0" />}
                                  {item.status === 'optimo' && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                                  <span>{item.statusLabel}</span>
                                </span>
                                {item.needsExpansion && (
                                  <span className="text-[9px] text-rose-700 font-bold tracking-tight">
                                    Directriz: Ampliar Inventario
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedEquipoId(isExpanded ? null : item.equipoId);
                                  }}
                                  className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                                  title="Ver cámaras y conexiones"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>

                                {item.rack && onSelectRack && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectRack(item.rack!);
                                    }}
                                    className="p-1 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                                    title={`Ir a Elevación de Rack ${item.rack.codigo}`}
                                  >
                                    <Server className="w-4 h-4" />
                                  </button>
                                )}

                                {onNavigateToPorts && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onNavigateToPorts(item.equipoId);
                                    }}
                                    className="p-1 hover:bg-indigo-100 text-indigo-600 rounded transition-colors"
                                    title="Ver en Mapeo de Puertos"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Drawer: List of Connected Devices */}
                          {isExpanded && (
                            <tr className="bg-slate-50/90 border-b border-slate-200 animate-in fade-in duration-150">
                              <td colSpan={9} className="p-4 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-2">
                                  <div className="flex items-center gap-2">
                                    <Cpu className="w-4 h-4 text-blue-600" />
                                    <span className="font-bold text-slate-800 text-xs">
                                      Dispositivos Conectados a {item.equipoCodigo} ({item.connectedCameras.length} cámaras vinculadas)
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px]">
                                    <span className="text-slate-500">
                                      {item.availableCount} {item.tipo === 'nvr' ? 'canales' : 'puertos'} disponibles para nuevas cámaras
                                    </span>
                                    {onNavigateToPorts && (
                                      <button
                                        type="button"
                                        onClick={() => onNavigateToPorts(item.equipoId)}
                                        className="text-blue-600 hover:underline font-bold flex items-center gap-1"
                                      >
                                        <span>Abrir Mapeo Gráfico</span>
                                        <ArrowRight className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Directriz Técnica */}
                                <div className={`p-2.5 rounded border text-[11px] flex items-center gap-2 ${
                                  item.status === 'critico'
                                    ? 'bg-rose-100/70 border-rose-300 text-rose-900'
                                    : item.status === 'alerta'
                                    ? 'bg-amber-100/70 border-amber-300 text-amber-900'
                                    : 'bg-emerald-100/70 border-emerald-300 text-emerald-900'
                                }`}>
                                  <Info className="w-4 h-4 shrink-0" />
                                  <span><strong>Recomendación Técnica:</strong> {item.recommendation}</span>
                                </div>

                                {item.connectedCameras.length === 0 ? (
                                  <div className="p-4 text-center text-slate-400 text-xs">
                                    No hay cámaras registradas en los puertos o canales de este dispositivo.
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
                                    {item.connectedCameras.map(({ camera: cam, portOrChannel, details }) => (
                                      <div
                                        key={cam.id}
                                        onClick={() => onSelectCamera && onSelectCamera(cam)}
                                        className="p-2 bg-white rounded border border-slate-200 hover:border-blue-400 cursor-pointer transition-all shadow-2xs space-y-1 hover:shadow-xs group"
                                      >
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="font-bold font-mono text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                            {portOrChannel}
                                          </span>
                                          <Camera className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                                        </div>
                                        <div className="font-bold text-slate-900 text-xs truncate">
                                          {cam.codigo}
                                        </div>
                                        <p className="text-[10px] text-slate-500 truncate font-sans">
                                          {details}
                                        </p>
                                        {cam.direccion_ip && (
                                          <span className="text-[9px] font-mono text-slate-600 bg-slate-100 px-1 rounded block truncate">
                                            IP: {cam.direccion_ip}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'conectividad' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs font-mono text-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Matriz Integral de Conectividad</h2>
              <p className="text-slate-500 text-xs mt-0.5">
                Relación extremo a extremo: Cámara &rarr; Patch Panel &rarr; Switch PoE &rarr; Grabador NVR
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Matriz CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Cámara</th>
                  <th className="py-2.5 px-3">IP / Modelo</th>
                  <th className="py-2.5 px-3">Patch Panel</th>
                  <th className="py-2.5 px-3">Puerto Patch</th>
                  <th className="py-2.5 px-3">Switch PoE</th>
                  <th className="py-2.5 px-3">Puerto Switch</th>
                  <th className="py-2.5 px-3">NVR</th>
                  <th className="py-2.5 px-3">Canal NVR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {camaras.map(cam => (
                  <tr key={cam.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-900 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-blue-600" />
                      <span>{cam.codigo}</span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      <span>{cam.direccion_ip || '-'}</span>
                      <span className="text-[10px] text-slate-400 block">{cam.modelo || cam.tipo_dispositivo || ''}</span>
                    </td>
                    <td className="py-2 px-3 text-slate-700 font-semibold">
                      {cam.patch_panel?.codigo || '-'}
                    </td>
                    <td className="py-2 px-3 text-blue-700 font-bold">
                      {cam.puerto_patch ? `P${cam.puerto_patch}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-slate-700 font-semibold">
                      {cam.switch?.codigo || '-'}
                    </td>
                    <td className="py-2 px-3 text-blue-700 font-bold">
                      {cam.puerto_switch || '-'}
                    </td>
                    <td className="py-2 px-3 text-indigo-700 font-semibold">
                      {cam.nvr?.codigo || '-'}
                    </td>
                    <td className="py-2 px-3 text-indigo-700 font-bold">
                      {cam.canal_nvr ? `CH ${cam.canal_nvr}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'futuros' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs font-mono text-xs space-y-6">
          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
            <Sparkles className="w-6 h-6 text-blue-600 shrink-0" />
            <div>
              <h2 className="font-bold text-sm">Módulo Preparado para Nuevos Reportes Técnicos</h2>
              <p className="text-slate-600 text-xs mt-0.5">
                Esta sección centralizada está diseñada para incorporar progresivamente todos los reportes personalizados que necesites solicitar para auditorías, compras o mantenimiento.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
              <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <span>Auditoría de Ciclo de Vida & Garantías</span>
              </div>
              <p className="text-slate-500 text-[11px] font-sans leading-relaxed">
                Reporte de antigüedad de equipos, fechas de compra, vigencia de soporte con proveedores y proyección de obsolescencia tecnológica.
              </p>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
              <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Ocupación de Espacio en Gabinetes (RU 19")</span>
              </div>
              <p className="text-slate-500 text-[11px] font-sans leading-relaxed">
                Análisis de unidades U libres versus ocupadas por sala IDF/MDF, evaluando saturación física de bastidores según norma TIA-606-C.
              </p>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
              <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Camera className="w-4 h-4 text-purple-600" />
                <span>Bitácora de Intervenciones & Fallas</span>
              </div>
              <p className="text-slate-500 text-[11px] font-sans leading-relaxed">
                Métricas de mantención preventiva vs correctiva, tiempos de respuesta técnico y recambio de repuestos por edificio o campus.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
