import React, { useState, useEffect, useMemo } from 'react';
import { 
  Network, 
  Search, 
  Download, 
  Plus, 
  Wifi, 
  Briefcase, 
  GraduationCap, 
  Server, 
  Cpu, 
  MapPin, 
  Layers, 
  Edit3, 
  Wrench, 
  Trash2, 
  Archive, 
  CheckCircle2, 
  RefreshCw, 
  Filter,
  X,
  ExternalLink,
  Cable
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
  PuntoRed, 
  Sede, 
  Campus, 
  Edificio, 
  Piso, 
  Rack, 
  Equipo, 
  PuertoSwitch,
  TipoPuntoRed 
} from '../types/database';
import { DecommissionModal } from './DecommissionModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { MaintenanceHistory } from './MaintenanceHistory';

interface NetworkPointsListProps {
  onSelectPoint: (point: PuntoRed) => void;
  onNavigateToRegistration: () => void;
  onNavigateToEdit: (point: PuntoRed) => void;
  onNavigateToRack: (rackId: string) => void;
}

export const NetworkPointsList: React.FC<NetworkPointsListProps> = ({
  onSelectPoint,
  onNavigateToRegistration,
  onNavigateToEdit,
  onNavigateToRack,
}) => {
  const [points, setPoints] = useState<PuntoRed[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [campusList, setCampusList] = useState<Campus[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [puertosSwitch, setPuertosSwitch] = useState<PuertoSwitch[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [filterSede, setFilterSede] = useState<string>('all');
  const [filterEdificio, setFilterEdificio] = useState<string>('all');
  const [filterPiso, setFilterPiso] = useState<string>('all');
  const [filterVlan, setFilterVlan] = useState<string>('all');
  const [filterEstado, setFilterEstado] = useState<string>('all');

  // Modal states for quick actions in table
  const [historyModalTarget, setHistoryModalTarget] = useState<PuntoRed | null>(null);
  const [decommissionTarget, setDecommissionTarget] = useState<PuntoRed | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PuntoRed | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [
        { data: prData },
        { data: sData },
        { data: cData },
        { data: edData },
        { data: pData },
        { data: rData },
        { data: eqData },
        { data: psData },
      ] = await Promise.all([
        supabase.from('puntos_red').select('*, marca_rel:marcas(*), modelo_rel:modelos(*)').order('codigo'),
        supabase.from('sedes').select('*').order('nombre'),
        supabase.from('campus').select('*').order('nombre'),
        supabase.from('edificios').select('*').order('nombre'),
        supabase.from('pisos').select('*').order('nombre'),
        supabase.from('racks').select('*').order('codigo'),
        supabase.from('equipos').select('*').order('codigo'),
        supabase.from('puertos_switch').select('*'),
      ]);

      setPoints(prData || []);
      setSedes(sData || []);
      setCampusList(cData || []);
      setEdificios(edData || []);
      setPisos(pData || []);
      setRacks(rData || []);
      setAllEquipos(eqData || []);
      setPuertosSwitch(psData || []);
    } catch (err) {
      console.error('Error loading puntos_red data:', err);
    } finally {
      setLoading(false);
    }
  };

  const setAllEquipos = (eqList: Equipo[]) => {
    setEquipos(eqList);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Map enriched helper objects for each point
  const enrichedPoints = useMemo(() => {
    return points.map(pt => {
      const p = pisos.find(pi => pi.id === pt.piso_id);
      const ed = p ? edificios.find(e => e.id === p.edificio_id) : null;
      const camp = ed ? campusList.find(c => c.id === ed.campus_id) : null;
      const sed = camp ? sedes.find(s => s.id === camp.sede_id) : null;
      const rk = pt.rack_id ? racks.find(r => r.id === pt.rack_id) : null;
      const sw = pt.switch_id ? equipos.find(e => e.id === pt.switch_id) : null;
      const ps = pt.puerto_switch_id ? puertosSwitch.find(port => port.id === pt.puerto_switch_id) : null;
      const pp = pt.patch_panel_id ? equipos.find(e => e.id === pt.patch_panel_id) : null;

      return {
        ...pt,
        pisoNombre: p?.nombre || '-',
        edificioNombre: ed?.nombre || '-',
        campusNombre: camp?.nombre || '-',
        sedeNombre: sed?.nombre || '-',
        sedeId: sed?.id || '',
        edificioId: ed?.id || '',
        rackCodigo: rk?.codigo || '-',
        switchCodigo: sw?.codigo || '-',
        puertoNumero: ps?.numero_puerto || null,
        vlanNumero: ps?.vlan || null,
        puertoUso: ps?.uso || null,
        patchCodigo: pp?.codigo || '-',
      };
    });
  }, [points, pisos, edificios, campusList, sedes, racks, equipos, puertosSwitch]);

  // Extract unique VLANs present among assigned ports
  const availableVlans = useMemo(() => {
    const vlanSet = new Set<number>();
    enrichedPoints.forEach(pt => {
      if (pt.vlanNumero !== null && pt.vlanNumero !== undefined) {
        vlanSet.add(pt.vlanNumero);
      }
    });
    return Array.from(vlanSet).sort((a, b) => a - b);
  }, [enrichedPoints]);

  // Filter enriched points
  const filteredPoints = useMemo(() => {
    return enrichedPoints.filter(pt => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = pt.codigo.toLowerCase().includes(q);
        const matchUbi = (pt.ubicacion_especifica || '').toLowerCase().includes(q);
        const matchEd = pt.edificioNombre.toLowerCase().includes(q);
        const matchPiso = pt.pisoNombre.toLowerCase().includes(q);
        const matchSw = pt.switchCodigo.toLowerCase().includes(q);
        const matchMac = (pt.direccion_mac || '').toLowerCase().includes(q);
        const matchIp = (pt.direccion_ip || '').toLowerCase().includes(q);
        const matchSerie = (pt.numero_serie || '').toLowerCase().includes(q);
        const matchMarca = (pt.marca_rel?.nombre || '').toLowerCase().includes(q);
        const matchMod = (pt.modelo_rel?.nombre || '').toLowerCase().includes(q);

        if (!matchCode && !matchUbi && !matchEd && !matchPiso && !matchSw && !matchMac && !matchIp && !matchSerie && !matchMarca && !matchMod) {
          return false;
        }
      }

      // Tipo filter
      if (filterTipo !== 'all' && pt.tipo_punto !== filterTipo) return false;

      // Sede filter
      if (filterSede !== 'all' && pt.sedeId !== filterSede) return false;

      // Edificio filter
      if (filterEdificio !== 'all' && pt.edificioId !== filterEdificio) return false;

      // Piso filter
      if (filterPiso !== 'all' && pt.piso_id !== filterPiso) return false;

      // VLAN filter
      if (filterVlan !== 'all') {
        const targetVlan = parseInt(filterVlan);
        if (pt.vlanNumero !== targetVlan) return false;
      }

      // Estado filter
      if (filterEstado !== 'all') {
        const currEst = pt.estado_ciclo_vida || 'instalado';
        if (currEst !== filterEstado) return false;
      }

      return true;
    });
  }, [enrichedPoints, searchQuery, filterTipo, filterSede, filterEdificio, filterPiso, filterVlan, filterEstado]);

  // Metrics for KPIs
  const totalCount = points.length;
  const countFuncionario = points.filter(p => p.tipo_punto === 'datos_funcionario').length;
  const countAlumno = points.filter(p => p.tipo_punto === 'datos_alumno').length;
  const countWifi = points.filter(p => p.tipo_punto === 'wifi_ap').length;
  const countAssignedPorts = points.filter(p => p.puerto_switch_id).length;

  // Paginated items
  const totalPages = Math.ceil(filteredPoints.length / pageSize) || 1;
  const paginatedPoints = filteredPoints.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      'Codigo', 
      'Tipo de Punto', 
      'Sede', 
      'Campus', 
      'Edificio', 
      'Piso', 
      'Ubicacion Especifica', 
      'Rack', 
      'Patch Panel', 
      'Puerto Patch', 
      'Switch', 
      'Puerto Switch', 
      'VLAN', 
      'Categoria Cable', 
      'Marca AP', 
      'Modelo AP', 
      'Serie AP', 
      'MAC', 
      'IP', 
      'Estado Ciclo Vida'
    ];

    const rows = filteredPoints.map(pt => [
      `"${pt.codigo}"`,
      `"${pt.tipo_punto === 'wifi_ap' ? 'AP WiFi' : pt.tipo_punto === 'datos_funcionario' ? 'Datos Funcionario' : 'Datos Alumno'}"`,
      `"${pt.sedeNombre}"`,
      `"${pt.campusNombre}"`,
      `"${pt.edificioNombre}"`,
      `"${pt.pisoNombre}"`,
      `"${(pt.ubicacion_especifica || '').replace(/"/g, '""')}"`,
      `"${pt.rackCodigo}"`,
      `"${pt.patchCodigo}"`,
      `"${pt.puerto_patch || ''}"`,
      `"${pt.switchCodigo}"`,
      `"${pt.puertoNumero ? `Puerto ${pt.puertoNumero}` : ''}"`,
      `"${pt.vlanNumero || ''}"`,
      `"${pt.categoria_cable || 'cat6'}"`,
      `"${pt.marca_rel?.nombre || ''}"`,
      `"${pt.modelo_rel?.nombre || ''}"`,
      `"${pt.numero_serie || ''}"`,
      `"${pt.direccion_mac || ''}"`,
      `"${pt.direccion_ip || ''}"`,
      `"${pt.estado_ciclo_vida || 'instalado'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `puntos_de_red_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1720px] mx-auto px-3 sm:px-6 py-6 space-y-6 font-mono text-xs">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight font-mono">
                Puntos de Red y Access Points
              </h1>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Registro y monitoreo de enlaces de usuario (Funcionarios, Alumnos) y puntos de acceso inalámbricos WiFi
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadAllData}
            title="Recargar datos"
            className="p-2 border border-slate-300 rounded hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs font-semibold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToRegistration}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nuevo Punto de Red</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs flex items-center gap-3">
          <div className="p-2.5 bg-slate-100 text-slate-700 rounded-lg">
            <Network className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">Total Puntos</span>
            <span className="text-lg font-bold text-slate-900">{totalCount}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg">
            <Briefcase className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">Funcionarios</span>
            <span className="text-lg font-bold text-blue-700">{countFuncionario}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-lg">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">Alumnos</span>
            <span className="text-lg font-bold text-emerald-700">{countAlumno}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-lg">
            <Wifi className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">APs WiFi</span>
            <span className="text-lg font-bold text-indigo-700">{countWifi}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs flex items-center gap-3 col-span-2 sm:col-span-1">
          <div className="p-2.5 bg-cyan-50 text-cyan-700 rounded-lg">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-semibold block uppercase">Puertos Switch</span>
            <span className="text-lg font-bold text-cyan-700">{countAssignedPorts}</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          {/* Search bar */}
          <div className="lg:col-span-4 relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar por código, ubicación, switch, MAC, IP..."
              className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded bg-slate-50 focus:bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tipo */}
          <div className="lg:col-span-2">
            <select
              value={filterTipo}
              onChange={(e) => {
                setFilterTipo(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
            >
              <option value="all">Tipo: Todos</option>
              <option value="datos_funcionario">Datos Funcionario</option>
              <option value="datos_alumno">Datos Alumno</option>
              <option value="wifi_ap">AP WiFi</option>
            </select>
          </div>

          {/* Filter Sede */}
          <div className="lg:col-span-2">
            <select
              value={filterSede}
              onChange={(e) => {
                setFilterSede(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
            >
              <option value="all">Sede: Todas</option>
              {sedes.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>

          {/* Filter Edificio */}
          <div className="lg:col-span-2">
            <select
              value={filterEdificio}
              onChange={(e) => {
                setFilterEdificio(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
            >
              <option value="all">Edificio: Todos</option>
              {edificios.map(ed => (
                <option key={ed.id} value={ed.id}>{ed.nombre}</option>
              ))}
            </select>
          </div>

          {/* Filter Piso */}
          <div className="lg:col-span-1">
            <select
              value={filterPiso}
              onChange={(e) => {
                setFilterPiso(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
            >
              <option value="all">Piso: Todos</option>
              {pisos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          {/* Filter VLAN */}
          <div className="lg:col-span-1">
            <select
              value={filterVlan}
              onChange={(e) => {
                setFilterVlan(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white text-xs font-mono focus:ring-1 focus:ring-blue-600"
            >
              <option value="all">VLAN: Todas</option>
              {availableVlans.map(v => (
                <option key={v} value={v}>VLAN {v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filters Summary */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
          <div>
            Mostrando <strong className="text-slate-900">{filteredPoints.length}</strong> de {totalCount} puntos de red registrados
          </div>

          {(searchQuery || filterTipo !== 'all' || filterSede !== 'all' || filterEdificio !== 'all' || filterPiso !== 'all' || filterVlan !== 'all' || filterEstado !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterTipo('all');
                setFilterSede('all');
                setFilterEdificio('all');
                setFilterPiso('all');
                setFilterVlan('all');
                setFilterEstado('all');
                setCurrentPage(1);
              }}
              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Restablecer Filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3">Código</th>
                <th className="py-3 px-3">Tipo de Punto</th>
                <th className="py-3 px-3">Ubicación Física</th>
                <th className="py-3 px-3">Rack & Patch</th>
                <th className="py-3 px-3">Switch / Puerto</th>
                <th className="py-3 px-3 text-center">VLAN</th>
                <th className="py-3 px-3">Cable</th>
                <th className="py-3 px-3">Hardware / Conexión</th>
                <th className="py-3 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedPoints.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Network className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600 text-sm">No se encontraron puntos de red</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {points.length === 0 ? 'Comienza registrando el primer punto de datos o AP WiFi.' : 'Prueba ajustando los filtros de búsqueda.'}
                    </p>
                    {points.length === 0 && (
                      <button
                        type="button"
                        onClick={onNavigateToRegistration}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Crear Primer Punto</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedPoints.map((pt) => {
                  const isAP = pt.tipo_punto === 'wifi_ap';
                  const isFunc = pt.tipo_punto === 'datos_funcionario';

                  return (
                    <tr 
                      key={pt.id} 
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      onClick={() => onSelectPoint(pt)}
                    >
                      {/* Código */}
                      <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${isAP ? 'bg-indigo-600' : isFunc ? 'bg-blue-600' : 'bg-emerald-600'}`} />
                          <span className="text-blue-700 hover:underline">{pt.codigo}</span>
                        </div>
                      </td>

                      {/* Tipo de Punto */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {isAP ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            <Wifi className="w-3 h-3 text-indigo-600" />
                            <span>AP WiFi</span>
                          </span>
                        ) : isFunc ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                            <Briefcase className="w-3 h-3 text-blue-600" />
                            <span>Datos Funcionario</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <GraduationCap className="w-3 h-3 text-emerald-600" />
                            <span>Datos Alumno</span>
                          </span>
                        )}
                      </td>

                      {/* Ubicación */}
                      <td className="py-2.5 px-3">
                        <div className="text-slate-800 font-semibold">
                          {pt.pisoNombre} · {pt.edificioNombre}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-xs">
                          {pt.ubicacion_especifica || pt.sedeNombre}
                        </div>
                      </td>

                      {/* Rack & Patch */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-700">
                        {pt.rack_id ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToRack(pt.rack_id!);
                            }}
                            className="font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                          >
                            <span>Rack {pt.rackCodigo}</span>
                          </button>
                        ) : (
                          <span className="text-slate-400">Sin Rack</span>
                        )}
                        <span className="text-[10px] text-slate-500 block">
                          PP: {pt.patchCodigo} {pt.puerto_patch ? `(P#${pt.puerto_patch})` : ''}
                        </span>
                      </td>

                      {/* Switch / Puerto */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-semibold text-slate-900 block">{pt.switchCodigo}</span>
                        <span className="text-[10px] text-blue-700 font-bold block">
                          {pt.puertoNumero ? `Puerto ${pt.puertoNumero}` : 'Sin puerto'}
                        </span>
                      </td>

                      {/* VLAN */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {pt.vlanNumero ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            VLAN {pt.vlanNumero}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Cable */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="uppercase font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                          {pt.categoria_cable || 'CAT6'}
                        </span>
                      </td>

                      {/* Hardware / Conexión */}
                      <td className="py-2.5 px-3 text-slate-600">
                        {isAP ? (
                          <div className="text-[11px]">
                            <strong className="text-slate-800">{pt.marca_rel?.nombre || ''} {pt.modelo_rel?.nombre || 'AP'}</strong>
                            {pt.direccion_ip && (
                              <span className="block text-[10px] text-blue-700 font-mono">IP: {pt.direccion_ip}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">Punto Pasivo RJ-45</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onSelectPoint(pt)}
                            title="Ver Ficha Técnica"
                            className="p-1 hover:text-blue-600 hover:bg-blue-50 text-slate-500 rounded transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setHistoryModalTarget(pt)}
                            title="Bitácora / Historial"
                            className="p-1 hover:text-blue-600 hover:bg-blue-50 text-slate-500 rounded transition-colors"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onNavigateToEdit(pt)}
                            title="Editar Punto"
                            className="p-1 hover:text-amber-600 hover:bg-amber-50 text-slate-500 rounded transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDecommissionTarget(pt)}
                            title="Retirar de Instalación"
                            className="p-1 hover:text-amber-700 hover:bg-amber-50 text-slate-400 rounded transition-colors"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteTarget(pt)}
                            title="Eliminar Definitivamente"
                            className="p-1 hover:text-red-600 hover:bg-red-50 text-slate-400 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500">
              Página {currentPage} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white disabled:opacity-50 text-slate-700 hover:bg-slate-100"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white disabled:opacity-50 text-slate-700 hover:bg-slate-100"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bitácora Modal */}
      {historyModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-slate-50 rounded-xl shadow-2xl border border-slate-300 max-w-5xl w-full max-h-[96vh] overflow-y-auto">
            <MaintenanceHistory
              entityType="punto_red"
              entityId={historyModalTarget.id}
              puntoRed={historyModalTarget}
              onBack={() => setHistoryModalTarget(null)}
            />
          </div>
        </div>
      )}

      {/* Retiro de Instalación Modal */}
      {decommissionTarget && (
        <DecommissionModal
          isOpen={Boolean(decommissionTarget)}
          onClose={() => setDecommissionTarget(null)}
          itemType="punto_red"
          itemId={decommissionTarget.id}
          itemCode={decommissionTarget.codigo}
          onSuccess={() => {
            setDecommissionTarget(null);
            loadAllData();
          }}
        />
      )}

      {/* Eliminación Definitiva Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          itemType="punto_red"
          itemId={deleteTarget.id}
          itemCode={deleteTarget.codigo}
          onSuccess={() => {
            setDeleteTarget(null);
            loadAllData();
          }}
        />
      )}
    </div>
  );
};
