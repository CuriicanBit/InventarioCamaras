import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Network, 
  ArrowRightLeft, 
  Shield, 
  Radio, 
  HelpCircle, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  X, 
  AlertTriangle, 
  Check, 
  ExternalLink, 
  Server, 
  Cpu, 
  Building2, 
  Layers, 
  Zap, 
  Info, 
  Calendar,
  Unlink,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
  EnlaceTroncalVista, 
  TopologiaSwitchVista, 
  formatRolRed, 
  formatSwitchPorts 
} from '../types/database';
import { exportReportToExcel } from '../utils/reportExport';
import { TopologyDiagram } from './TopologyDiagram';

interface TopologyViewProps {
  onNavigateToRack?: (rackId: string) => void;
  onNavigateToPorts?: (equipmentId: string) => void;
  onOpenSwitchFicha?: (switchId: string, rackId?: string | null) => void;
}

export const TopologyView: React.FC<TopologyViewProps> = ({
  onNavigateToRack,
  onNavigateToPorts,
  onOpenSwitchFicha
}) => {
  // View selector: 'listado' | 'esquema'
  const [viewMode, setViewMode] = useState<'listado' | 'esquema'>('listado');
  const [selectedEnlaceForDiagram, setSelectedEnlaceForDiagram] = useState<string | null>(null);

  // Data states
  const [loading, setLoading] = useState<boolean>(true);
  const [enlaces, setEnlaces] = useState<EnlaceTroncalVista[]>([]);
  const [switches, setSwitches] = useState<TopologiaSwitchVista[]>([]);
  const [equiposMap, setEquiposMap] = useState<Record<string, { id: string; rack_id: string | null; ip_gestion: string | null; vlan: number | null }>>({});

  // Filter states for Enlaces
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [edificioFilter, setEdificioFilter] = useState<string>('all');
  const [tipoFilter, setTipoFilter] = useState<'all' | 'principal' | 'respaldo'>('all');

  // Secondary table filter / selection
  const [secondaryTab, setSecondaryTab] = useState<'sin_enlace' | 'sin_rol' | 'todos'>('sin_enlace');
  const secondaryTableRef = useRef<HTMLDivElement>(null);

  // Modals & toasts
  const [disconnectModal, setDisconnectModal] = useState<EnlaceTroncalVista | null>(null);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);
  const [selectedSwitchDetail, setSelectedSwitchDetail] = useState<TopologiaSwitchVista | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Load topology data from Supabase views
  const loadTopologyData = async () => {
    try {
      setLoading(true);
      const [
        { data: enlacesData, error: enlacesErr },
        { data: switchesData, error: switchesErr },
        { data: rawEquipos, error: eqErr }
      ] = await Promise.all([
        supabase
          .from('v_enlaces_troncales')
          .select('*')
          .eq('activo', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('v_topologia_switches')
          .select('*')
          .order('codigo', { ascending: true }),
        supabase
          .from('equipos')
          .select('id, rack_id, ip_gestion, vlan')
          .eq('tipo', 'switch')
      ]);

      if (enlacesErr) throw enlacesErr;
      if (switchesErr) throw switchesErr;

      setEnlaces((enlacesData as EnlaceTroncalVista[]) || []);
      setSwitches((switchesData as TopologiaSwitchVista[]) || []);

      if (rawEquipos) {
        const eMap: Record<string, { id: string; rack_id: string | null; ip_gestion: string | null; vlan: number | null }> = {};
        rawEquipos.forEach((e: any) => {
          eMap[e.id] = {
            id: e.id,
            rack_id: e.rack_id,
            ip_gestion: e.ip_gestion,
            vlan: e.vlan
          };
        });
        setEquiposMap(eMap);
      }
    } catch (err: any) {
      console.error('Error cargando datos de topología:', err);
      showToast('Error al cargar datos de topología: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTopologyData();
  }, []);

  // Normalization helper for roles
  const normalizeRole = (role?: string | null): 'core' | 'distribucion' | 'acceso' | 'sin_rol' => {
    if (!role) return 'sin_rol';
    const clean = role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (clean === 'core') return 'core';
    if (clean === 'distribucion') return 'distribucion';
    if (clean === 'acceso') return 'acceso';
    return 'sin_rol';
  };

  // Helper for role badge styling & label
  const renderRoleBadge = (role?: string | null) => {
    const norm = normalizeRole(role);
    switch (norm) {
      case 'core':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300 shadow-2xs">
            Core
          </span>
        );
      case 'distribucion':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300 shadow-2xs">
            Distribución
          </span>
        );
      case 'acceso':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
            Acceso
          </span>
        );
      case 'sin_rol':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300">
            Sin rol
          </span>
        );
    }
  };

  // KPI Metrics
  const totalEnlaces = enlaces.length;
  const enlacesRespaldo = enlaces.filter(e => !e.es_principal).length;
  const enlacesFueraJerarquia = enlaces.filter(e => Boolean(e.salta_jerarquia)).length;
  const switchesSinEnlace = switches.filter(s => Number(s.enlaces || 0) === 0);
  const switchesSinRol = switches.filter(s => !s.rol_red || s.rol_red.trim() === '');

  // Extract unique building names present in either extreme
  const availableEdificios = useMemo(() => {
    const set = new Set<string>();
    enlaces.forEach(e => {
      if (e.superior_edificio && e.superior_edificio.trim() !== '') set.add(e.superior_edificio.trim());
      if (e.inferior_edificio && e.inferior_edificio.trim() !== '') set.add(e.inferior_edificio.trim());
    });
    return Array.from(set).sort();
  }, [enlaces]);

  // Filtered links
  const filteredEnlaces = useMemo(() => {
    return enlaces.filter(e => {
      // 1. Tipo filter
      if (tipoFilter === 'principal' && !e.es_principal) return false;
      if (tipoFilter === 'respaldo' && e.es_principal) return false;

      // 2. Role filter: matches if EITHER extreme has this role
      if (roleFilter !== 'all') {
        const normSup = normalizeRole(e.superior_rol);
        const normInf = normalizeRole(e.inferior_rol);
        if (normSup !== roleFilter && normInf !== roleFilter) return false;
      }

      // 3. Edificio filter: matches if EITHER extreme belongs to this building
      if (edificioFilter !== 'all') {
        const edSup = (e.superior_edificio || '').trim();
        const edInf = (e.inferior_edificio || '').trim();
        if (edSup !== edificioFilter && edInf !== edificioFilter) return false;
      }

      // 4. Free search query (código, ubicación, modelo)
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim();
        const matchSup = 
          (e.superior_codigo && e.superior_codigo.toLowerCase().includes(q)) ||
          (e.superior_ubicacion && e.superior_ubicacion.toLowerCase().includes(q)) ||
          (e.superior_modelo && e.superior_modelo.toLowerCase().includes(q));
        const matchInf = 
          (e.inferior_codigo && e.inferior_codigo.toLowerCase().includes(q)) ||
          (e.inferior_ubicacion && e.inferior_ubicacion.toLowerCase().includes(q)) ||
          (e.inferior_modelo && e.inferior_modelo.toLowerCase().includes(q));
        if (!matchSup && !matchInf) return false;
      }

      return true;
    });
  }, [enlaces, tipoFilter, roleFilter, edificioFilter, searchFilter]);

  // Scroll to secondary table when clicking card
  const handleScrollToSecondary = (tab: 'sin_enlace' | 'sin_rol') => {
    setSecondaryTab(tab);
    if (secondaryTableRef.current) {
      secondaryTableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Disconnect trunk link action
  const handleConfirmDisconnect = async () => {
    if (!disconnectModal) return;
    try {
      setDisconnecting(true);
      const enlaceId = disconnectModal.enlace_id;
      const { error } = await supabase
        .from('enlaces_switch')
        .delete()
        .eq('id', enlaceId);

      if (error) throw error;

      showToast(`Enlace entre ${disconnectModal.superior_codigo} y ${disconnectModal.inferior_codigo} desconectado con éxito.`);
      setDisconnectModal(null);
      await loadTopologyData();
    } catch (err: any) {
      console.error('Error desconectando enlace:', err);
      showToast('Error al desconectar enlace: ' + (err.message || String(err)));
    } finally {
      setDisconnecting(false);
    }
  };

  // Export to Excel using existing export engine
  const handleExportExcel = () => {
    if (filteredEnlaces.length === 0) {
      showToast('No hay enlaces para exportar con los filtros seleccionados.');
      return;
    }

    const appliedFilters = [];
    if (searchFilter) appliedFilters.push({ label: 'Búsqueda', value: searchFilter });
    if (roleFilter !== 'all') appliedFilters.push({ label: 'Rol', value: formatRolRed(roleFilter) || roleFilter });
    if (edificioFilter !== 'all') appliedFilters.push({ label: 'Edificio', value: edificioFilter });
    if (tipoFilter !== 'all') appliedFilters.push({ label: 'Tipo', value: tipoFilter === 'principal' ? 'Principal' : 'Respaldo' });

    exportReportToExcel({
      title: 'Topología de Red · Enlaces Troncales',
      subtitle: 'NodoUA · Universidad Autónoma de Chile, sede Talca',
      filename: `topologia_enlaces_${new Date().toISOString().split('T')[0]}`,
      headers: [
        'Superior',
        'Rol Superior',
        'Ubicación Superior',
        'Puerto SFP Superior',
        'Inferior',
        'Rol Inferior',
        'Ubicación Inferior',
        'Puerto SFP Inferior',
        'Tipo Enlace',
        'Fecha Registro'
      ],
      rows: filteredEnlaces.map(e => [
        e.superior_codigo,
        formatRolRed(e.superior_rol) || 'Sin rol',
        e.superior_ubicacion || 'Sin ubicación',
        `SFP ${e.superior_puerto}`,
        e.inferior_codigo,
        formatRolRed(e.inferior_rol) || 'Sin rol',
        e.inferior_ubicacion || 'Sin ubicación',
        `SFP ${e.inferior_puerto}`,
        e.es_principal ? 'Principal' : 'Respaldo',
        new Date(e.created_at).toLocaleDateString()
      ]),
      appliedFilters,
      summaryKpis: [
        { label: 'Total Enlaces', value: totalEnlaces },
        { label: 'Enlaces de Respaldo', value: enlacesRespaldo },
        { label: 'Switches sin Enlace', value: switchesSinEnlace.length },
        { label: 'Switches sin Rol', value: switchesSinRol.length }
      ]
    });
  };

  // Secondary table filtered switches
  const secondarySwitches = useMemo(() => {
    if (secondaryTab === 'sin_enlace') return switchesSinEnlace;
    if (secondaryTab === 'sin_rol') return switchesSinRol;
    return switches;
  }, [secondaryTab, switchesSinEnlace, switchesSinRol, switches]);

  // Open switch ficha handler
  const handleOpenFicha = (sw: TopologiaSwitchVista) => {
    const extra = equiposMap[sw.id];
    if (onOpenSwitchFicha) {
      onOpenSwitchFicha(sw.id, extra?.rack_id);
    } else if (extra?.rack_id && onNavigateToRack) {
      onNavigateToRack(extra.rack_id);
    } else {
      setSelectedSwitchDetail(sw);
    }
  };

  const hasActiveFilters = Boolean(
    searchFilter || 
    roleFilter !== 'all' || 
    edificioFilter !== 'all' || 
    tipoFilter !== 'all'
  );

  const resetFilters = () => {
    setSearchFilter('');
    setRoleFilter('all');
    setEdificioFilter('all');
    setTipoFilter('all');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 p-3 bg-slate-900 text-white rounded-lg shadow-xl text-xs font-mono flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200">
          <Info className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{toastMessage}</span>
          <button 
            type="button" 
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header and View Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono text-blue-700 font-semibold tracking-wider uppercase mb-1 flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5 text-blue-600" />
            <span>INFRAESTRUCTURA DE CONECTIVIDAD & TRONCALES SFP</span>
          </div>
          <h1 className="text-2xl font-bold font-mono text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Topología de Red</span>
          </h1>
          <p className="text-xs text-slate-600 mt-1 font-medium font-sans max-w-2xl">
            Monitoreo y administración de enlaces troncales de fibra óptica entre conmutadores (Core, Distribución y Acceso).
          </p>
        </div>

        {/* View Mode Selector: Listado vs Esquema */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 self-start md:self-center font-mono text-xs">
          <button
            type="button"
            onClick={() => setViewMode('listado')}
            className={`px-3.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'listado'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Listado</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('esquema')}
            className={`px-3.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'esquema'
                ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Esquema</span>
          </button>
        </div>
      </div>

      {/* VIEW: ESQUEMA (Diagrama Interactivo) */}
      {viewMode === 'esquema' && (
        <TopologyDiagram
          switches={switches}
          enlaces={enlaces}
          selectedEnlaceIdFromList={selectedEnlaceForDiagram}
          onClearSelectedEnlaceFromList={() => setSelectedEnlaceForDiagram(null)}
          onDisconnectEnlace={(enlace) => setDisconnectModal(enlace)}
          onOpenSwitchFicha={(swObj) => handleOpenFicha(swObj)}
          onSwitchRoleUpdated={() => {
            loadTopologyData();
            showToast('Rol de red actualizado exitosamente');
          }}
          onNavigateToListadoWithEnlace={(enlaceId) => {
            setViewMode('listado');
            const en = enlaces.find(e => e.enlace_id === enlaceId);
            if (en) {
              setSearchFilter(en.superior_codigo);
            }
          }}
        />
      )}

      {/* VIEW: LISTADO */}
      {viewMode === 'listado' && (
        <>
          {/* 1. TARJETAS METRICAS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
            {/* Card 1: Total Enlaces */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-semibold">
                  Total Enlaces Troncales
                </span>
                <span className="text-2xl font-bold font-mono text-slate-900 mt-0.5 block">
                  {totalEnlaces}
                </span>
                <span className="text-[11px] text-slate-500 font-sans mt-0.5 block">
                  Troncales de fibra activos
                </span>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-200">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
            </div>

            {/* Card 2: Enlaces de Respaldo */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block font-semibold">
                  Enlaces de Respaldo
                </span>
                <span className="text-2xl font-bold font-mono text-indigo-700 mt-0.5 block">
                  {enlacesRespaldo}
                </span>
                <span className="text-[11px] text-slate-500 font-sans mt-0.5 block">
                  Rutas redundantes secundarias
                </span>
              </div>
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-200">
                <Shield className="w-5 h-5" />
              </div>
            </div>

            {/* Card 3: Enlaces fuera de jerarquía */}
            <div className={`bg-white border rounded-xl p-4 shadow-xs flex items-center justify-between ${
              enlacesFueraJerarquia > 0 ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
            }`}>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider block font-bold text-rose-800">
                  Enlaces fuera de jerarquía
                </span>
                <span className="text-2xl font-bold font-mono text-rose-700 mt-0.5 block">
                  {enlacesFueraJerarquia}
                </span>
                <span className="text-[11px] text-rose-600 font-sans mt-0.5 block">
                  Salta Distribución
                </span>
              </div>
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>

            {/* Card 4: Switches sin enlace troncal (Clickable) */}
            <button
              type="button"
              onClick={() => handleScrollToSecondary('sin_enlace')}
              className="bg-white hover:bg-amber-50/40 border border-slate-200 hover:border-amber-300 rounded-xl p-4 shadow-xs flex items-center justify-between text-left transition-all cursor-pointer group"
              title="Clic para ver switches sin enlace troncal"
            >
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-amber-800 uppercase tracking-wider block font-bold">
                    Switches Sin Enlace
                  </span>
                  <ChevronRight className="w-3 h-3 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-2xl font-bold font-mono text-amber-900 mt-0.5 block">
                  {switchesSinEnlace.length}
                </span>
                <span className="text-[11px] text-amber-700 font-sans mt-0.5 block">
                  Conmutadores aislados (0 enlaces)
                </span>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-200 group-hover:scale-105 transition-transform">
                <Radio className="w-5 h-5" />
              </div>
            </button>

            {/* Card 5: Switches sin rol asignado (Clickable) */}
            <button
              type="button"
              onClick={() => handleScrollToSecondary('sin_rol')}
              className="bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl p-4 shadow-xs flex items-center justify-between text-left transition-all cursor-pointer group"
              title="Clic para ver switches sin rol asignado"
            >
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-slate-600 uppercase tracking-wider block font-bold">
                    Switches Sin Rol
                  </span>
                  <ChevronRight className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-2xl font-bold font-mono text-slate-800 mt-0.5 block">
                  {switchesSinRol.length}
                </span>
                <span className="text-[11px] text-slate-500 font-sans mt-0.5 block">
                  Pendientes de clasificar
                </span>
              </div>
              <div className="p-3 bg-slate-100 text-slate-600 rounded-xl border border-slate-200 group-hover:scale-105 transition-transform">
                <HelpCircle className="w-5 h-5" />
              </div>
            </button>
          </div>

          {/* 2. TABLA DE ENLACES TRONCALES */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 font-mono text-xs">
            {/* Header / Filter Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                  <span>Listado de Enlaces Troncales</span>
                  <span className="text-xs font-normal text-slate-500">
                    ({filteredEnlaces.length} de {enlaces.length} activos)
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                  Conexiones punto a punto entre puertos SFP de fibra óptica
                </p>
              </div>

              {/* Action buttons: Refresh & Export */}
              <div className="flex items-center gap-2 self-start lg:self-center">
                <button
                  type="button"
                  onClick={loadTopologyData}
                  disabled={loading}
                  className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                  title="Recargar enlaces troncales"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs transition-colors shadow-2xs cursor-pointer"
                  title="Descargar listado en formato Excel"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar a Excel</span>
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
              {/* Búsqueda Libre */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Buscar switch, ubicación, modelo..."
                  className="w-full pl-8 pr-7 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
                {searchFilter && (
                  <button
                    type="button"
                    onClick={() => setSearchFilter('')}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Filtro Rol */}
              <div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="all">Rol: Todos los roles</option>
                  <option value="core">Rol: Core (en cualquier extremo)</option>
                  <option value="distribucion">Rol: Distribución</option>
                  <option value="acceso">Rol: Acceso</option>
                  <option value="sin_rol">Rol: Sin rol asignado</option>
                </select>
              </div>

              {/* Filtro Edificio */}
              <div>
                <select
                  value={edificioFilter}
                  onChange={(e) => setEdificioFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="all">Edificio: Todos los edificios</option>
                  {availableEdificios.map(ed => (
                    <option key={ed} value={ed}>
                      Edificio: {ed}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro Tipo */}
              <div>
                <select
                  value={tipoFilter}
                  onChange={(e) => setTipoFilter(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="all">Tipo: Todos (Principal y Respaldo)</option>
                  <option value="principal">Tipo: Solo Principal</option>
                  <option value="respaldo">Tipo: Solo Respaldo</option>
                </select>
              </div>
            </div>

            {/* Active Filters Tag & Reset */}
            {hasActiveFilters && (
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap text-[11px]">
                <span className="text-slate-500 font-semibold font-sans">Filtros Activos:</span>
                {searchFilter && (
                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                    Búsqueda: {searchFilter}
                    <button onClick={() => setSearchFilter('')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {roleFilter !== 'all' && (
                  <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200 flex items-center gap-1">
                    Rol: {formatRolRed(roleFilter) || roleFilter}
                    <button onClick={() => setRoleFilter('all')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {edificioFilter !== 'all' && (
                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                    Edificio: {edificioFilter}
                    <button onClick={() => setEdificioFilter('all')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {tipoFilter !== 'all' && (
                  <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                    Tipo: {tipoFilter === 'principal' ? 'Principal' : 'Respaldo'}
                    <button onClick={() => setTipoFilter('all')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-blue-600 hover:text-blue-800 underline ml-2 cursor-pointer font-sans"
                >
                  Restablecer filtros
                </button>
              </div>
            )}

            {/* Links Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-3">Superior</th>
                    <th className="py-3 px-2 text-center w-28">Puerto SFP</th>
                    <th className="py-3 px-3">Inferior</th>
                    <th className="py-3 px-2 text-center w-28">Puerto SFP</th>
                    <th className="py-3 px-3 text-center w-28">Tipo</th>
                    <th className="py-3 px-3 text-center w-28">Registrado</th>
                    <th className="py-3 px-3 text-right w-44">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                        <p>Cargando enlaces troncales desde Supabase...</p>
                      </td>
                    </tr>
                  ) : enlaces.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                        <ArrowRightLeft className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                        <p className="font-bold text-slate-700 text-sm">No hay enlaces troncales registrados</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                          Puedes conectar switches entre sí abriendo la sección de Puertos SFP en la Ficha de Switch desde el Diagrama de Rack.
                        </p>
                      </td>
                    </tr>
                  ) : filteredEnlaces.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400 font-sans">
                        <Search className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <p className="font-bold text-slate-700 text-sm">Sin resultados para los filtros seleccionados</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Prueba cambiando el rol, edificio o limpiando el campo de búsqueda.
                        </p>
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="mt-3 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold cursor-pointer"
                        >
                          Limpiar todos los filtros
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredEnlaces.map((e) => {
                      return (
                        <tr key={e.enlace_id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Extremo Superior */}
                          <td className="py-3 px-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-blue-700 hover:underline cursor-pointer" onClick={() => {
                                  const swObj = switches.find(s => s.id === e.superior_id);
                                  if (swObj) handleOpenFicha(swObj);
                                }}>
                                  {e.superior_codigo}
                                </span>
                                {renderRoleBadge(e.superior_rol)}
                              </div>
                              <div className="text-[11px] text-slate-500 font-sans truncate max-w-xs" title={e.superior_ubicacion || 'Sin ubicación'}>
                                {e.superior_ubicacion || 'Sin ubicación'}
                              </div>
                              {e.superior_modelo && (
                                <div className="text-[10px] text-slate-400 font-sans">
                                  {e.superior_modelo}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Puerto SFP Superior */}
                          <td className="py-3 px-2 text-center whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100/80 text-amber-900 border border-amber-300 font-bold text-[11px]">
                              <Radio className="w-3 h-3 text-amber-700" />
                              <span>SFP {e.superior_puerto}</span>
                            </span>
                          </td>

                          {/* Extremo Inferior */}
                          <td className="py-3 px-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-blue-700 hover:underline cursor-pointer" onClick={() => {
                                  const swObj = switches.find(s => s.id === e.inferior_id);
                                  if (swObj) handleOpenFicha(swObj);
                                }}>
                                  {e.inferior_codigo}
                                </span>
                                {renderRoleBadge(e.inferior_rol)}
                              </div>
                              <div className="text-[11px] text-slate-500 font-sans truncate max-w-xs" title={e.inferior_ubicacion || 'Sin ubicación'}>
                                {e.inferior_ubicacion || 'Sin ubicación'}
                              </div>
                              {e.inferior_modelo && (
                                <div className="text-[10px] text-slate-400 font-sans">
                                  {e.inferior_modelo}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Puerto SFP Inferior */}
                          <td className="py-3 px-2 text-center whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100/80 text-amber-900 border border-amber-300 font-bold text-[11px]">
                              <Radio className="w-3 h-3 text-amber-700" />
                              <span>SFP {e.inferior_puerto}</span>
                            </span>
                          </td>

                          {/* Tipo (Principal / Respaldo) */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              {e.es_principal ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  <Zap className="w-3 h-3 text-amber-700" />
                                  <span>Principal</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
                                  <Shield className="w-3 h-3 text-indigo-700" />
                                  <span>Respaldo</span>
                                </span>
                              )}
                              {e.salta_jerarquia && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                  Salta Distribución
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Registrado */}
                          <td className="py-3 px-3 text-center text-slate-500 text-[11px] whitespace-nowrap">
                            {e.created_at ? new Date(e.created_at).toLocaleDateString() : '—'}
                          </td>

                          {/* Acciones */}
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Ver en esquema */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEnlaceForDiagram(e.enlace_id);
                                  setViewMode('esquema');
                                }}
                                className="px-2 py-1 text-[11px] font-semibold text-blue-700 hover:text-white hover:bg-blue-600 bg-blue-50 border border-blue-200 hover:border-blue-600 rounded transition-colors flex items-center gap-1 cursor-pointer"
                                title="Ver y resaltar este enlace en el diagrama interactivo de topología"
                              >
                                <Network className="w-3 h-3" />
                                <span>Ver en esquema</span>
                              </button>

                              {/* Desconectar Enlace */}
                              <button
                                type="button"
                                onClick={() => setDisconnectModal(e)}
                                className="px-2 py-1 text-[11px] font-semibold text-rose-700 hover:text-white hover:bg-rose-600 bg-rose-50 border border-rose-200 hover:border-rose-600 rounded transition-colors flex items-center gap-1 cursor-pointer"
                                title="Desconectar este enlace troncal"
                              >
                                <Unlink className="w-3 h-3" />
                                <span>Desconectar</span>
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
          </div>

          {/* 3. TABLA SECUNDARIA: SWITCHES SIN ENLACE TRONCAL */}
          {(switchesSinEnlace.length > 0 || switchesSinRol.length > 0) && (
            <div 
              ref={secondaryTableRef}
              id="switches-sin-enlace-section" 
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3 font-mono text-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Switches sin Enlace Troncal
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    {switchesSinEnlace.length} switches
                  </span>
                </div>

                {/* Sub-tabs selector for secondary table */}
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSecondaryTab('sin_enlace')}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      secondaryTab === 'sin_enlace'
                        ? 'bg-amber-100 text-amber-900 font-bold border border-amber-300'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Sin Enlace ({switchesSinEnlace.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecondaryTab('sin_rol')}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      secondaryTab === 'sin_rol'
                        ? 'bg-purple-100 text-purple-900 font-bold border border-purple-300'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Sin Rol ({switchesSinRol.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecondaryTab('todos')}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      secondaryTab === 'todos'
                        ? 'bg-slate-200 text-slate-900 font-bold border border-slate-300'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Todos ({switches.length})
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Modelo</th>
                      <th className="py-2.5 px-3">Rol en la Red</th>
                      <th className="py-2.5 px-3">Ubicación</th>
                      <th className="py-2.5 px-3 text-right">Ficha de Equipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {secondarySwitches.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400 font-sans text-xs">
                          No hay conmutadores en esta categoría.
                        </td>
                      </tr>
                    ) : (
                      secondarySwitches.map((sw) => {
                        const modeloText = `${sw.marca ? sw.marca + ' ' : ''}${sw.modelo || 'Sin modelo'}`;
                        const portsText = formatSwitchPorts(sw.puertos_rj45, sw.puertos_sfp);
                        const extra = equiposMap[sw.id];

                        return (
                          <tr key={sw.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2.5 px-3 font-bold text-blue-700">
                              {sw.codigo}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              <div>
                                <span className="font-semibold">{modeloText}</span>
                                <span className="text-[10px] text-slate-400 block font-normal">
                                  {portsText}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              {renderRoleBadge(sw.rol_red)}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                              {sw.ubicacion || 'Sin ubicación'}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleOpenFicha(sw)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:text-white hover:bg-blue-600 bg-blue-50 border border-blue-200 hover:border-blue-600 rounded transition-colors cursor-pointer"
                                title="Abrir ficha técnica del conmutador"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Ver Ficha</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: CONFIRMACIÓN DE DESCONEXIÓN */}
      {disconnectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-mono text-xs">
            <div className="p-4 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-900 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Confirmar Desconexión de Troncal</span>
              </div>
              <button
                type="button"
                onClick={() => setDisconnectModal(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-slate-700 font-sans leading-relaxed">
                ¿Está seguro de desconectar el enlace troncal entre los siguientes switches?
              </p>

              {/* Box detail */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-sans">Superior:</span>
                  <span className="font-bold text-slate-900">
                    {disconnectModal.superior_codigo} · SFP {disconnectModal.superior_puerto}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-sans">Inferior:</span>
                  <span className="font-bold text-slate-900">
                    {disconnectModal.inferior_codigo} · SFP {disconnectModal.inferior_puerto}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                  <span className="text-slate-500 font-sans">Tipo de Enlace:</span>
                  <span className={`px-2 py-0.2 rounded text-[10px] font-bold border ${
                    disconnectModal.es_principal 
                      ? 'bg-amber-100 text-amber-900 border-amber-300' 
                      : 'bg-indigo-100 text-indigo-900 border-indigo-300'
                  }`}>
                    {disconnectModal.es_principal ? 'Principal' : 'Respaldo'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded text-[11px] font-sans flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>Esta acción eliminará el registro en la tabla de enlaces y liberará ambos puertos SFP para nuevas conexiones.</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={disconnecting}
                  onClick={() => setDisconnectModal(null)}
                  className="px-3.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={disconnecting}
                  onClick={handleConfirmDisconnect}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {disconnecting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Desconectando...</span>
                    </>
                  ) : (
                    <>
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Desconectar Enlace</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: FICHA DE EQUIPO SWITCH */}
      {selectedSwitchDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-mono text-xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-slate-900 text-sm">
                  Ficha Técnica · {selectedSwitchDetail.codigo}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSwitchDetail(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Código Switch</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedSwitchDetail.codigo}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Rol en la Red</span>
                  <div className="mt-0.5">{renderRoleBadge(selectedSwitchDetail.rol_red)}</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Marca & Modelo</span>
                  <span className="font-semibold text-slate-800">
                    {selectedSwitchDetail.marca || 'Genérica'} {selectedSwitchDetail.modelo || ''}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Puertos</span>
                  <span className="font-semibold text-slate-800">
                    {formatSwitchPorts(selectedSwitchDetail.puertos_rj45, selectedSwitchDetail.puertos_sfp)}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-500 uppercase block">Ubicación Física</span>
                  <span className="font-semibold text-slate-800 font-sans">
                    {selectedSwitchDetail.ubicacion || 'Sin ubicación'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Troncales Activos</span>
                  <span className="font-bold text-slate-900">{selectedSwitchDetail.enlaces} enlaces</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">SFP Conectados</span>
                  <span className="font-bold text-slate-900">{selectedSwitchDetail.sfp_conectados} puertos</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                <div className="flex items-center gap-2">
                  {equiposMap[selectedSwitchDetail.id]?.rack_id && onNavigateToRack && (
                    <button
                      type="button"
                      onClick={() => {
                        const rId = equiposMap[selectedSwitchDetail.id]?.rack_id;
                        if (rId) onNavigateToRack(rId);
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Server className="w-3.5 h-3.5" />
                      <span>Ir a Diagrama de Rack</span>
                    </button>
                  )}
                  {onNavigateToPorts && (
                    <button
                      type="button"
                      onClick={() => onNavigateToPorts(selectedSwitchDetail.id)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Cpu className="w-3.5 h-3.5" />
                      <span>Ver Mapeo de Puertos</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedSwitchDetail(null)}
                  className="px-3.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded text-xs font-semibold cursor-pointer ml-auto"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
