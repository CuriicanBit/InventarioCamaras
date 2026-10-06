import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  MapPin, 
  Layers, 
  Server, 
  Search, 
  Download, 
  FileText, 
  Filter, 
  RefreshCw, 
  Camera, 
  Network, 
  HardDrive, 
  Cable, 
  Zap, 
  Cpu, 
  CheckCircle2, 
  AlertCircle, 
  Archive, 
  Trash2, 
  Boxes,
  ExternalLink,
  X
} from 'lucide-react';
import { Sede, Campus, Edificio, Piso, Rack, Equipo, Camara } from '../types/database';
import { exportReportToExcel, exportReportToPdf, ReportFilterItem, ReportKpiSummaryItem } from '../utils/reportExport';

interface LocationInventoryReportProps {
  sedes: Sede[];
  campusList: Campus[];
  edificios: Edificio[];
  pisos: Piso[];
  racks: Rack[];
  equipos: Equipo[];
  camaras: Camara[];
  onSelectCamera?: (camera: Camara) => void;
  onSelectRack?: (rack: Rack) => void;
  onNavigateToPorts?: (equipmentId?: string) => void;
}

export interface UnifiedLocationItem {
  id: string;
  sourceType: 'camara' | 'equipo';
  codigo: string;
  tipo: string;
  tipoLabel: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  ip: string;
  estadoCicloVida: string;
  estadoLabel: string;
  estadoBadgeClass: string;
  sedeId?: string;
  campusId?: string;
  edificioId?: string;
  pisoId?: string;
  rackId?: string;
  sedeNombre: string;
  campusNombre: string;
  edificioNombre: string;
  pisoNombre: string;
  rackCodigo?: string;
  rackUbicacion?: string;
  ubicacionCompleta: string;
  rawItem: Camara | Equipo;
}

export const LocationInventoryReport: React.FC<LocationInventoryReportProps> = ({
  sedes,
  campusList,
  edificios,
  pisos,
  racks,
  equipos,
  camaras,
  onSelectCamera,
  onSelectRack,
}) => {
  // Cascading location filters
  const [selectedSedeId, setSelectedSedeId] = useState<string>('all');
  const [selectedCampusId, setSelectedCampusId] = useState<string>('all');
  const [selectedEdificioId, setSelectedEdificioId] = useState<string>('all');
  const [selectedPisoId, setSelectedPisoId] = useState<string>('all');

  // Additional filters
  const [selectedTipo, setSelectedTipo] = useState<string>('all');
  const [selectedEstado, setSelectedEstado] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  // Lookup maps
  const sedesMap = useMemo(() => new Map(sedes.map(s => [s.id, s])), [sedes]);
  const campusMap = useMemo(() => new Map(campusList.map(c => [c.id, c])), [campusList]);
  const edificiosMap = useMemo(() => new Map(edificios.map(e => [e.id, e])), [edificios]);
  const pisosMap = useMemo(() => new Map(pisos.map(p => [p.id, p])), [pisos]);
  const racksMap = useMemo(() => new Map(racks.map(r => [r.id, r])), [racks]);

  // Dependent cascading options
  const availableCampus = useMemo(() => {
    if (selectedSedeId === 'all') return campusList;
    return campusList.filter(c => c.sede_id === selectedSedeId);
  }, [campusList, selectedSedeId]);

  const availableEdificios = useMemo(() => {
    if (selectedCampusId !== 'all') {
      return edificios.filter(e => e.campus_id === selectedCampusId);
    }
    if (selectedSedeId !== 'all') {
      const validCampusIds = new Set(availableCampus.map(c => c.id));
      return edificios.filter(e => validCampusIds.has(e.campus_id));
    }
    return edificios;
  }, [edificios, selectedCampusId, selectedSedeId, availableCampus]);

  const availablePisos = useMemo(() => {
    if (selectedEdificioId !== 'all') {
      return pisos.filter(p => p.edificio_id === selectedEdificioId);
    }
    if (selectedCampusId !== 'all' || selectedSedeId !== 'all') {
      const validEdifIds = new Set(availableEdificios.map(e => e.id));
      return pisos.filter(p => validEdifIds.has(p.edificio_id));
    }
    return pisos;
  }, [pisos, selectedEdificioId, selectedCampusId, selectedSedeId, availableEdificios]);

  // Handle cascading changes
  const handleSedeChange = (sedeId: string) => {
    setSelectedSedeId(sedeId);
    setSelectedCampusId('all');
    setSelectedEdificioId('all');
    setSelectedPisoId('all');
    setCurrentPage(1);
  };

  const handleCampusChange = (campusId: string) => {
    setSelectedCampusId(campusId);
    setSelectedEdificioId('all');
    setSelectedPisoId('all');
    setCurrentPage(1);
  };

  const handleEdificioChange = (edificioId: string) => {
    setSelectedEdificioId(edificioId);
    setSelectedPisoId('all');
    setCurrentPage(1);
  };

  const handlePisoChange = (pisoId: string) => {
    setSelectedPisoId(pisoId);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSelectedSedeId('all');
    setSelectedCampusId('all');
    setSelectedEdificioId('all');
    setSelectedPisoId('all');
    setSelectedTipo('all');
    setSelectedEstado('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Helper to format estado badge
  const getEstadoInfo = (rawEstado?: string) => {
    const estado = rawEstado || 'instalado';
    switch (estado) {
      case 'instalado':
        return {
          label: 'Instalado',
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'en_bodega':
        return {
          label: 'En Bodega',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'retirado_pendiente_bodega':
        return {
          label: 'Retirado (Pendiente)',
          badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
        };
      case 'dado_de_baja':
        return {
          label: 'Dado de Baja',
          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        };
      default:
        return {
          label: estado.replace(/_/g, ' '),
          badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
        };
    }
  };

  // Build unified inventory dataset
  const unifiedInventory: UnifiedLocationItem[] = useMemo(() => {
    const list: UnifiedLocationItem[] = [];

    // 1. Process Cámaras
    camaras.forEach(cam => {
      const piso = cam.piso_id ? pisosMap.get(cam.piso_id) : undefined;
      const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
      const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
      const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;
      const rack = cam.rack_id ? racksMap.get(cam.rack_id) : undefined;

      const locParts: string[] = [];
      if (sede) locParts.push(sede.nombre);
      if (campus) locParts.push(campus.nombre);
      if (edificio) locParts.push(edificio.nombre);
      if (piso) locParts.push(piso.nombre);
      if (rack) locParts.push(`Rack ${rack.codigo}`);
      if (cam.ubicacion_especifica) locParts.push(cam.ubicacion_especifica);

      const ubiCompleta = locParts.length > 0 ? locParts.join(' > ') : 'Sin ubicación asignada';
      const estadoInfo = getEstadoInfo(cam.estado_ciclo_vida);

      const tipoLabel = cam.tipo_camara 
        ? `Cámara ${cam.tipo_camara.toUpperCase()}`
        : 'Cámara CCTV';

      list.push({
        id: `cam-${cam.id}`,
        sourceType: 'camara',
        codigo: cam.codigo,
        tipo: 'camara',
        tipoLabel,
        marca: cam.marca || '-',
        modelo: cam.modelo || 'Sin Modelo',
        numeroSerie: cam.numero_serie || 'N/A',
        ip: cam.direccion_ip || '-',
        estadoCicloVida: cam.estado_ciclo_vida || 'instalado',
        estadoLabel: estadoInfo.label,
        estadoBadgeClass: estadoInfo.badgeClass,
        sedeId: sede?.id,
        campusId: campus?.id,
        edificioId: edificio?.id,
        pisoId: piso?.id,
        rackId: rack?.id,
        sedeNombre: sede?.nombre || '-',
        campusNombre: campus?.nombre || '-',
        edificioNombre: edificio?.nombre || '-',
        pisoNombre: piso?.nombre || '-',
        rackCodigo: rack?.codigo,
        rackUbicacion: rack?.ubicacion_especifica || undefined,
        ubicacionCompleta: ubiCompleta,
        rawItem: cam,
      });
    });

    // 2. Process Equipos
    equipos.forEach(eq => {
      const rack = eq.rack_id ? racksMap.get(eq.rack_id) : undefined;
      const piso = rack?.piso_id 
        ? pisosMap.get(rack.piso_id) 
        : (eq as any).piso_id ? pisosMap.get((eq as any).piso_id) : undefined;
      const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
      const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
      const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;

      const locParts: string[] = [];
      if (sede) locParts.push(sede.nombre);
      if (campus) locParts.push(campus.nombre);
      if (edificio) locParts.push(edificio.nombre);
      if (piso) locParts.push(piso.nombre);
      if (rack) {
        locParts.push(`Rack ${rack.codigo}${eq.posicion_u_inicio ? ` (U${eq.posicion_u_inicio})` : ''}`);
      } else {
        locParts.push('Fuera de Bastidor / Piso Shaft');
      }

      const ubiCompleta = locParts.length > 0 ? locParts.join(' > ') : 'Sin asignación física';
      const estadoInfo = getEstadoInfo(eq.estado_ciclo_vida);

      let tipoLabel = 'Equipo Activo';
      switch (eq.tipo as string) {
        case 'switch': tipoLabel = 'Switch PoE'; break;
        case 'patch_panel': tipoLabel = 'Patch Panel'; break;
        case 'nvr': tipoLabel = 'Grabador NVR'; break;
        case 'ups': tipoLabel = 'UPS / Respaldo'; break;
        case 'servidor': tipoLabel = 'Servidor Video'; break;
        case 'mufa': tipoLabel = 'Mufa Óptica'; break;
        case 'organizador': tipoLabel = 'Organizador'; break;
        default: tipoLabel = eq.tipo ? String(eq.tipo).toUpperCase() : 'Dispositivo'; break;
      }

      list.push({
        id: `eq-${eq.id}`,
        sourceType: 'equipo',
        codigo: eq.codigo,
        tipo: eq.tipo,
        tipoLabel,
        marca: eq.marca_rel?.nombre || eq.marca || '-',
        modelo: eq.modelo_rel?.nombre || eq.modelo || 'Sin Modelo',
        numeroSerie: eq.numero_serie || 'N/A',
        ip: eq.ip_gestion || '-',
        estadoCicloVida: eq.estado_ciclo_vida || 'instalado',
        estadoLabel: estadoInfo.label,
        estadoBadgeClass: estadoInfo.badgeClass,
        sedeId: sede?.id,
        campusId: campus?.id,
        edificioId: edificio?.id,
        pisoId: piso?.id,
        rackId: rack?.id,
        sedeNombre: sede?.nombre || '-',
        campusNombre: campus?.nombre || '-',
        edificioNombre: edificio?.nombre || '-',
        pisoNombre: piso?.nombre || '-',
        rackCodigo: rack?.codigo,
        rackUbicacion: rack?.ubicacion_especifica || undefined,
        ubicacionCompleta: ubiCompleta,
        rawItem: eq,
      });
    });

    return list;
  }, [camaras, equipos, racksMap, pisosMap, edificiosMap, campusMap, sedesMap]);

  // Filtered inventory list
  const filteredInventory = useMemo(() => {
    return unifiedInventory.filter(item => {
      // Sede filter
      if (selectedSedeId !== 'all' && item.sedeId !== selectedSedeId) return false;

      // Campus filter
      if (selectedCampusId !== 'all' && item.campusId !== selectedCampusId) return false;

      // Edificio filter
      if (selectedEdificioId !== 'all' && item.edificioId !== selectedEdificioId) return false;

      // Piso filter
      if (selectedPisoId !== 'all' && item.pisoId !== selectedPisoId) return false;

      // Tipo filter
      if (selectedTipo !== 'all') {
        if (selectedTipo === 'camara' && item.sourceType !== 'camara') return false;
        if (selectedTipo === 'switch' && item.tipo !== 'switch') return false;
        if (selectedTipo === 'nvr' && item.tipo !== 'nvr' && item.tipo !== 'dvr') return false;
        if (selectedTipo === 'patch_panel' && item.tipo !== 'patch_panel') return false;
        if (selectedTipo === 'ups' && item.tipo !== 'ups') return false;
        if (selectedTipo === 'otros' && (item.sourceType === 'camara' || item.tipo === 'switch' || item.tipo === 'nvr' || item.tipo === 'patch_panel' || item.tipo === 'ups')) {
          return false;
        }
      }

      // Estado filter
      if (selectedEstado !== 'all' && item.estadoCicloVida !== selectedEstado) return false;

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const mCode = item.codigo.toLowerCase().includes(q);
        const mMarca = item.marca.toLowerCase().includes(q);
        const mModelo = item.modelo.toLowerCase().includes(q);
        const mUbi = item.ubicacionCompleta.toLowerCase().includes(q);
        const mIp = item.ip.toLowerCase().includes(q);
        const mSerie = item.numeroSerie.toLowerCase().includes(q);
        if (!mCode && !mMarca && !mModelo && !mUbi && !mIp && !mSerie) return false;
      }

      return true;
    }).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [
    unifiedInventory,
    selectedSedeId,
    selectedCampusId,
    selectedEdificioId,
    selectedPisoId,
    selectedTipo,
    selectedEstado,
    searchTerm,
  ]);

  // Summary KPIs based on CURRENT filtered list
  const kpis = useMemo(() => {
    let cameras = 0;
    let switches = 0;
    let nvrs = 0;
    let patches = 0;
    let others = 0;
    let installed = 0;
    let inWarehouse = 0;

    filteredInventory.forEach(item => {
      if (item.sourceType === 'camara') cameras++;
      else if (item.tipo === 'switch') switches++;
      else if (item.tipo === 'nvr' || item.tipo === 'dvr') nvrs++;
      else if (item.tipo === 'patch_panel') patches++;
      else others++;

      if (item.estadoCicloVida === 'instalado') installed++;
      else if (item.estadoCicloVida === 'en_bodega' || item.estadoCicloVida === 'retirado_pendiente_bodega') inWarehouse++;
    });

    return {
      total: filteredInventory.length,
      cameras,
      switches,
      nvrs,
      patches,
      others,
      installed,
      inWarehouse,
    };
  }, [filteredInventory]);

  // Active filters list for exports
  const activeFiltersForExport = useMemo((): ReportFilterItem[] => {
    const list: ReportFilterItem[] = [];

    if (selectedSedeId !== 'all') {
      const s = sedesMap.get(selectedSedeId);
      if (s) list.push({ label: 'Sede', value: s.nombre });
    }
    if (selectedCampusId !== 'all') {
      const c = campusMap.get(selectedCampusId);
      if (c) list.push({ label: 'Campus', value: c.nombre });
    }
    if (selectedEdificioId !== 'all') {
      const e = edificiosMap.get(selectedEdificioId);
      if (e) list.push({ label: 'Edificio', value: e.nombre });
    }
    if (selectedPisoId !== 'all') {
      const p = pisosMap.get(selectedPisoId);
      if (p) list.push({ label: 'Piso', value: p.nombre });
    }
    if (selectedTipo !== 'all') {
      list.push({ label: 'Tipo', value: selectedTipo.toUpperCase() });
    }
    if (selectedEstado !== 'all') {
      list.push({ label: 'Estado', value: selectedEstado.replace(/_/g, ' ') });
    }
    if (searchTerm.trim()) {
      list.push({ label: 'Búsqueda', value: `"${searchTerm.trim()}"` });
    }

    return list;
  }, [
    selectedSedeId,
    selectedCampusId,
    selectedEdificioId,
    selectedPisoId,
    selectedTipo,
    selectedEstado,
    searchTerm,
    sedesMap,
    campusMap,
    edificiosMap,
    pisosMap,
  ]);

  const summaryKpisForExport = useMemo((): ReportKpiSummaryItem[] => {
    return [
      { label: 'Total Dispositivos', value: kpis.total },
      { label: 'Cámaras', value: kpis.cameras },
      { label: 'Switches', value: kpis.switches },
      { label: 'NVR / DVR', value: kpis.nvrs },
      { label: 'Patch Panels', value: kpis.patches },
      { label: 'Otros Equipos', value: kpis.others },
    ];
  }, [kpis]);

  // Export to Excel using shared engine
  const handleExportExcel = () => {
    const headers = [
      'Código',
      'Tipo de Dispositivo',
      'Marca',
      'Modelo',
      'Sede',
      'Campus',
      'Edificio',
      'Piso',
      'Rack / Sala',
      'Ubicación Completa',
      'Estado Ciclo de Vida',
      'Dirección IP',
      'Número de Serie',
    ];

    const rows = filteredInventory.map(item => [
      item.codigo,
      item.tipoLabel,
      item.marca,
      item.modelo,
      item.sedeNombre,
      item.campusNombre,
      item.edificioNombre,
      item.pisoNombre,
      item.rackCodigo ? `Rack ${item.rackCodigo}` : '-',
      item.ubicacionCompleta,
      item.estadoLabel,
      item.ip,
      item.numeroSerie,
    ]);

    exportReportToExcel({
      title: 'Reporte de Inventario por Ubicación Física',
      subtitle: 'Inventario de Cámaras y Equipamiento CCTV según Jerarquía de Planta Física',
      filename: `Reporte_Inventario_Ubicacion_${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      appliedFilters: activeFiltersForExport,
      summaryKpis: summaryKpisForExport,
    });
  };

  // Export to PDF using shared engine
  const handleExportPdf = () => {
    const headers = [
      'Código',
      'Tipo',
      'Marca',
      'Modelo',
      'Ubicación Completa (Sede > Campus > Edif > Piso > Rack)',
      'Estado',
      'IP / Gestión',
    ];

    const rows = filteredInventory.map(item => [
      item.codigo,
      item.tipoLabel,
      item.marca,
      item.modelo,
      item.ubicacionCompleta,
      item.estadoLabel,
      item.ip,
    ]);

    exportReportToPdf({
      title: 'Reporte de Inventario por Ubicación Física',
      subtitle: 'CCTV InfraRegistro · Inventario de Dispositivos y Planta Física (Norma TIA-606-C)',
      filename: `Reporte_Inventario_Ubicacion_${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      appliedFilters: activeFiltersForExport,
      summaryKpis: summaryKpisForExport,
      orientation: 'landscape',
    });
  };

  // Pagination slice
  const totalPages = Math.ceil(filteredInventory.length / pageSize) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInventory.slice(start, start + pageSize);
  }, [filteredInventory, currentPage, pageSize]);

  const hasActiveFilters = 
    selectedSedeId !== 'all' || 
    selectedCampusId !== 'all' || 
    selectedEdificioId !== 'all' || 
    selectedPisoId !== 'all' || 
    selectedTipo !== 'all' || 
    selectedEstado !== 'all' || 
    searchTerm.trim() !== '';

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Resumen superior con totales por tipo de dispositivo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs font-mono">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Total Dispositivos
          </span>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {kpis.total}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Filtrados en ubicación
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs font-mono">
          <span className="text-[10px] text-blue-700 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Cámaras CCTV</span>
            <Camera className="w-3.5 h-3.5 text-blue-600" />
          </span>
          <div className="text-2xl font-bold text-blue-700 mt-1">
            {kpis.cameras}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Domo, Bullet, PTZ
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs font-mono">
          <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Switches PoE</span>
            <Network className="w-3.5 h-3.5 text-emerald-600" />
          </span>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {kpis.switches}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Distribución & Acceso
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs font-mono">
          <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>NVRs / DVRs</span>
            <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
          </span>
          <div className="text-2xl font-bold text-indigo-700 mt-1">
            {kpis.nvrs}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Grabación & Storage
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs font-mono">
          <span className="text-[10px] text-slate-700 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Patch Panels</span>
            <Cable className="w-3.5 h-3.5 text-slate-600" />
          </span>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {kpis.patches}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            Terminación Cat6/6A
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs font-mono">
          <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Otros Equipos</span>
            <Boxes className="w-3.5 h-3.5 text-amber-600" />
          </span>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {kpis.others}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            UPS, Servidores, etc.
          </span>
        </div>
      </div>

      {/* Main Filter & Action Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold font-mono text-slate-900 uppercase tracking-wider">
              Filtros Jerárquicos en Cascada (Norma TIA-606-C)
            </h2>
            {hasActiveFilters && (
              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                Filtros activos ({activeFiltersForExport.length})
              </span>
            )}
          </div>

          {/* Export Buttons using generic export engine */}
          <div className="flex items-center gap-2 flex-wrap">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                title="Limpiar todos los filtros"
              >
                <X className="w-3.5 h-3.5" />
                <span>Restablecer</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredInventory.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Exportar registros filtrados a hoja de cálculo Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar a Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={filteredInventory.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Generar reporte PDF con portada, totales y detalle paginado"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Exportar a PDF</span>
            </button>
          </div>
        </div>

        {/* Cascading selectors: Sede -> Campus -> Edificio -> Piso */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-blue-600" />
              <span>1. Sede</span>
            </label>
            <select
              value={selectedSedeId}
              onChange={(e) => handleSedeChange(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs"
            >
              <option value="all">Todas las Sedes ({sedes.length})</option>
              {sedes.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-indigo-600" />
              <span>2. Campus</span>
            </label>
            <select
              value={selectedCampusId}
              onChange={(e) => handleCampusChange(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs"
            >
              <option value="all">
                {selectedSedeId === 'all' 
                  ? `Todos los Campus (${campusList.length})`
                  : `Campus de la Sede (${availableCampus.length})`}
              </option>
              {availableCampus.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-emerald-600" />
              <span>3. Edificio</span>
            </label>
            <select
              value={selectedEdificioId}
              onChange={(e) => handleEdificioChange(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs"
            >
              <option value="all">
                Todos los Edificios ({availableEdificios.length})
              </option>
              {availableEdificios.map(e => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1 flex items-center gap-1">
              <Layers className="w-3 h-3 text-amber-600" />
              <span>4. Piso / Nivel</span>
            </label>
            <select
              value={selectedPisoId}
              onChange={(e) => handlePisoChange(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs"
            >
              <option value="all">
                Todos los Pisos ({availablePisos.length})
              </option>
              {availablePisos.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Secondary filters & search bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs font-mono">
          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">
              Tipo de Dispositivo
            </label>
            <select
              value={selectedTipo}
              onChange={(e) => { setSelectedTipo(e.target.value); setCurrentPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs"
            >
              <option value="all">Todos los tipos ({kpis.total})</option>
              <option value="camara">Cámaras ({kpis.cameras})</option>
              <option value="switch">Switches PoE ({kpis.switches})</option>
              <option value="nvr">Grabadores NVR/DVR ({kpis.nvrs})</option>
              <option value="patch_panel">Patch Panels ({kpis.patches})</option>
              <option value="ups">UPS / Energía ({unifiedInventory.filter(i => i.tipo === 'ups').length})</option>
              <option value="otros">Otros Equipos ({kpis.others})</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">
              Ciclo de Vida
            </label>
            <select
              value={selectedEstado}
              onChange={(e) => { setSelectedEstado(e.target.value); setCurrentPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs"
            >
              <option value="all">Todos los estados</option>
              <option value="instalado">Instalado en Terreno</option>
              <option value="en_bodega">En Bodega</option>
              <option value="retirado_pendiente_bodega">Retirado (Pendiente)</option>
              <option value="dado_de_baja">Dado de Baja</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">
              Búsqueda Rápida
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Código, marca, modelo, IP, serie..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs font-mono"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Results Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">
              Listado de Inventario ({filteredInventory.length} dispositivos)
            </span>
            {hasActiveFilters && (
              <span className="text-[10px] text-slate-500 font-normal">
                (filtrados de {unifiedInventory.length} totales)
              </span>
            )}
          </div>

          <div className="text-[11px] text-slate-500">
            Página <strong className="text-slate-800">{currentPage}</strong> de <strong className="text-slate-800">{totalPages}</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase">
              <tr>
                <th className="py-2.5 px-3">Código</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Marca</th>
                <th className="py-2.5 px-3">Modelo</th>
                <th className="py-2.5 px-3">Ubicación Completa</th>
                <th className="py-2.5 px-3">Estado Ciclo de Vida</th>
                <th className="py-2.5 px-3 text-right">IP / Conexión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-mono">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-700">No se encontraron dispositivos</p>
                    <p className="text-xs text-slate-400 mt-1">
                      No hay equipos o cámaras que coincidan con la combinación de filtros seleccionada.
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-300 rounded text-blue-700 hover:bg-slate-50 text-xs font-semibold"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Restablecer Filtros</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedList.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {item.sourceType === 'camara' ? (
                          <div 
                            className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer"
                            onClick={() => onSelectCamera && onSelectCamera(item.rawItem as Camara)}
                            title="Ver Ficha de Cámara"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </div>
                        ) : item.tipo === 'switch' ? (
                          <div className="p-1 rounded bg-emerald-50 text-emerald-600">
                            <Network className="w-3.5 h-3.5" />
                          </div>
                        ) : item.tipo === 'nvr' ? (
                          <div className="p-1 rounded bg-indigo-50 text-indigo-600">
                            <HardDrive className="w-3.5 h-3.5" />
                          </div>
                        ) : item.tipo === 'patch_panel' ? (
                          <div className="p-1 rounded bg-slate-100 text-slate-700">
                            <Cable className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="p-1 rounded bg-amber-50 text-amber-700">
                            <Zap className="w-3.5 h-3.5" />
                          </div>
                        )}

                        {item.sourceType === 'camara' && onSelectCamera ? (
                          <button
                            type="button"
                            onClick={() => onSelectCamera(item.rawItem as Camara)}
                            className="text-blue-700 hover:underline font-bold text-left cursor-pointer"
                          >
                            {item.codigo}
                          </button>
                        ) : (
                          <span>{item.codigo}</span>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                      <span className="text-[11px] font-medium font-sans">
                        {item.tipoLabel}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      {item.marca}
                    </td>

                    <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap font-medium">
                      {item.modelo}
                    </td>

                    <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="leading-snug">{item.ubicacionCompleta}</span>
                        {item.rackId && onSelectRack && (
                          <button
                            type="button"
                            onClick={() => {
                              const r = racksMap.get(item.rackId!);
                              if (r) onSelectRack(r);
                            }}
                            className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5 ml-1"
                            title="Ver en Diagrama de Rack"
                          >
                            <span>(Rack)</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${item.estadoBadgeClass}`}>
                        {item.estadoLabel}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-right text-slate-500 whitespace-nowrap text-[11px]">
                      {item.ip !== '-' ? (
                        <span className="font-mono text-slate-700 font-semibold">{item.ip}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {filteredInventory.length > pageSize && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-slate-600">
            <div>
              Mostrando <span className="font-bold text-slate-900">{(currentPage - 1) * pageSize + 1}</span> - <span className="font-bold text-slate-900">{Math.min(currentPage * pageSize, filteredInventory.length)}</span> de <span className="font-bold text-slate-900">{filteredInventory.length}</span> registros
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
              >
                Anterior
              </button>

              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let p = i + 1;
                if (totalPages > 5 && currentPage > 3) {
                  p = currentPage - 2 + i;
                  if (p > totalPages) p = totalPages - (4 - i);
                }
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`w-7 h-7 rounded text-xs font-semibold ${
                      currentPage === p
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
