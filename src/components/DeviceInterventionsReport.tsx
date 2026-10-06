import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wrench, 
  AlertTriangle, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Download, 
  FileText, 
  Filter, 
  RefreshCw, 
  Camera, 
  Network, 
  HardDrive, 
  Cable, 
  Server, 
  ArrowRight, 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  MapPin, 
  Tag, 
  User, 
  Calendar, 
  ExternalLink, 
  ShieldAlert, 
  Boxes, 
  BarChart3, 
  Clock, 
  X, 
  Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
  Sede, 
  Campus, 
  Edificio, 
  Piso, 
  Rack, 
  Equipo, 
  Camara, 
  HistorialMantenimiento, 
  TipoIntervencion 
} from '../types/database';
import { 
  exportReportToExcel, 
  exportReportToPdf, 
  ReportFilterItem, 
  ReportKpiSummaryItem 
} from '../utils/reportExport';

interface DeviceInterventionsReportProps {
  sedes: Sede[];
  campusList: Campus[];
  edificios: Edificio[];
  pisos: Piso[];
  racks: Rack[];
  equipos: Equipo[];
  camaras: Camara[];
  onSelectCamera?: (camera: Camara) => void;
  onSelectRack?: (rack: Rack) => void;
}

export interface DeviceInterventionAggregated {
  id: string;
  sourceType: 'equipo' | 'camara' | 'rack';
  codigo: string;
  tipoLabel: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  ip: string;
  ubicacionCompleta: string;
  rackCodigo?: string;
  totalIntervenciones: number;
  reparaciones: number;
  preventivos: number;
  recambios: number;
  instalaciones: number;
  lastIntervention: HistorialMantenimiento | null;
  intervencionesList: HistorialMantenimiento[];
  frequencyStatus: 'critico' | 'alerta' | 'optimo' | 'sin_intervenciones';
  frequencyLabel: string;
  frequencyBadgeClass: string;
  rawItem: any;
}

export const DeviceInterventionsReport: React.FC<DeviceInterventionsReportProps> = ({
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
  const [intervenciones, setIntervenciones] = useState<HistorialMantenimiento[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');
  const [selectedMarca, setSelectedMarca] = useState<string>('all');
  const [selectedModelo, setSelectedModelo] = useState<string>('all');
  const [selectedTipo, setSelectedTipo] = useState<string>('all');
  const [selectedTipoIntervencion, setSelectedTipoIntervencion] = useState<string>('all');
  const [selectedFrecuencia, setSelectedFrecuencia] = useState<'all_intervened' | 'criticos' | 'recurrentes' | 'todos'>(
    'all_intervened'
  );
  const [searchTerm, setSearchTerm] = useState<string>('');

  // View mode
  const [viewMode, setViewMode] = useState<'dispositivos' | 'cronologico'>('dispositivos');

  // Expanded items for timeline preview
  const [expandedDeviceIds, setExpandedDeviceIds] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 12;

  // Lookup maps for fast hierarchical location resolution
  const sedesMap = useMemo(() => new Map(sedes.map(s => [s.id, s])), [sedes]);
  const campusMap = useMemo(() => new Map(campusList.map(c => [c.id, c])), [campusList]);
  const edificiosMap = useMemo(() => new Map(edificios.map(e => [e.id, e])), [edificios]);
  const pisosMap = useMemo(() => new Map(pisos.map(p => [p.id, p])), [pisos]);
  const racksMap = useMemo(() => new Map(racks.map(r => [r.id, r])), [racks]);

  // Load all maintenance records from Supabase
  const loadInterventions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('historial_mantenimiento')
        .select('*')
        .order('fecha', { ascending: false });

      if (error) throw error;
      setIntervenciones(data || []);
    } catch (err) {
      console.error('Error loading interventions for report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInterventions();
  }, []);

  // Build unified inventory dictionary
  const allDevicesList = useMemo(() => {
    const list: {
      id: string;
      sourceType: 'equipo' | 'camara' | 'rack';
      codigo: string;
      tipoLabel: string;
      marca: string;
      modelo: string;
      numeroSerie: string;
      ip: string;
      ubicacionCompleta: string;
      rackCodigo?: string;
      rawItem: any;
    }[] = [];

    // 1. Equipos
    equipos.forEach(eq => {
      const rack = eq.rack_id ? racksMap.get(eq.rack_id) : undefined;
      const piso = rack?.piso_id ? pisosMap.get(rack.piso_id) : undefined;
      const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
      const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
      const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;

      const locParts: string[] = [];
      if (sede) locParts.push(sede.nombre);
      if (edificio) locParts.push(edificio.nombre);
      if (piso) locParts.push(piso.nombre);
      if (rack) locParts.push(`Rack ${rack.codigo}${eq.posicion_u_inicio ? ` (U${eq.posicion_u_inicio})` : ''}`);

      let tipoLabel = 'Equipo';
      if (eq.tipo === 'switch') tipoLabel = 'Switch PoE';
      else if (eq.tipo === 'nvr') tipoLabel = 'Grabador NVR';
      else if (eq.tipo === 'patch_panel') tipoLabel = 'Patch Panel';
      else if (eq.tipo === 'ups') tipoLabel = 'UPS / Energía';
      else if (eq.tipo) tipoLabel = String(eq.tipo).toUpperCase();

      list.push({
        id: eq.id,
        sourceType: 'equipo',
        codigo: eq.codigo,
        tipoLabel,
        marca: eq.marca_rel?.nombre || eq.marca || 'Genérico',
        modelo: eq.modelo_rel?.nombre || eq.modelo || 'Sin Modelo',
        numeroSerie: eq.numero_serie || 'N/A',
        ip: eq.ip_gestion || '-',
        ubicacionCompleta: locParts.length > 0 ? locParts.join(' > ') : 'Sin asignar a bastidor',
        rackCodigo: rack?.codigo,
        rawItem: eq,
      });
    });

    // 2. Cámaras
    camaras.forEach(cam => {
      const piso = cam.piso_id ? pisosMap.get(cam.piso_id) : undefined;
      const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
      const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
      const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;
      const rack = cam.rack_id ? racksMap.get(cam.rack_id) : undefined;

      const locParts: string[] = [];
      if (sede) locParts.push(sede.nombre);
      if (edificio) locParts.push(edificio.nombre);
      if (piso) locParts.push(piso.nombre);
      if (rack) locParts.push(`Rack ${rack.codigo}`);
      if (cam.ubicacion_especifica) locParts.push(cam.ubicacion_especifica);

      list.push({
        id: cam.id,
        sourceType: 'camara',
        codigo: cam.codigo,
        tipoLabel: cam.tipo_camara ? `Cámara ${cam.tipo_camara.toUpperCase()}` : 'Cámara CCTV',
        marca: cam.marca_rel?.nombre || cam.marca || 'Hikvision',
        modelo: cam.modelo_rel?.nombre || cam.modelo || 'Sin Modelo',
        numeroSerie: cam.numero_serie || 'N/A',
        ip: cam.direccion_ip || '-',
        ubicacionCompleta: locParts.length > 0 ? locParts.join(' > ') : 'Sin ubicación asignada',
        rackCodigo: rack?.codigo,
        rawItem: cam,
      });
    });

    // 3. Racks
    racks.forEach(rk => {
      const piso = rk.piso_id ? pisosMap.get(rk.piso_id) : undefined;
      const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
      const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
      const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;

      const locParts: string[] = [];
      if (sede) locParts.push(sede.nombre);
      if (edificio) locParts.push(edificio.nombre);
      if (piso) locParts.push(piso.nombre);
      if (rk.ubicacion_especifica) locParts.push(rk.ubicacion_especifica);

      list.push({
        id: rk.id,
        sourceType: 'rack',
        codigo: `Rack ${rk.codigo}`,
        tipoLabel: 'Bastidor Rack',
        marca: (rk as any).marca || 'Genérico',
        modelo: (rk as any).formato || `${rk.altura_u || 42}U`,
        numeroSerie: 'N/A',
        ip: '-',
        ubicacionCompleta: locParts.length > 0 ? locParts.join(' > ') : 'Planta Física',
        rackCodigo: rk.codigo,
        rawItem: rk,
      });
    });

    return list;
  }, [equipos, camaras, racks, racksMap, pisosMap, edificiosMap, campusMap, sedesMap]);

  const deviceDict = useMemo(() => {
    return new Map(allDevicesList.map(d => [d.id, d]));
  }, [allDevicesList]);

  // Aggregate interventions by device
  const aggregatedDevices: DeviceInterventionAggregated[] = useMemo(() => {
    // Map of deviceId -> Array of interventions
    const historyByDevice = new Map<string, HistorialMantenimiento[]>();

    intervenciones.forEach(item => {
      const devId = item.entidad_id;
      if (!historyByDevice.has(devId)) {
        historyByDevice.set(devId, []);
      }
      historyByDevice.get(devId)!.push(item);
    });

    const result: DeviceInterventionAggregated[] = [];

    // For all devices in inventory
    allDevicesList.forEach(dev => {
      const devEvents = historyByDevice.get(dev.id) || [];
      const total = devEvents.length;

      let reparaciones = 0;
      let preventivos = 0;
      let recambios = 0;
      let instalaciones = 0;

      devEvents.forEach(e => {
        if (e.tipo_intervencion === 'reparacion') reparaciones++;
        else if (e.tipo_intervencion === 'mantenimiento_preventivo') preventivos++;
        else if (e.tipo_intervencion === 'recambio') recambios++;
        else if (e.tipo_intervencion === 'instalacion') instalaciones++;
      });

      let frequencyStatus: 'critico' | 'alerta' | 'optimo' | 'sin_intervenciones' = 'sin_intervenciones';
      let frequencyLabel = 'Sin Intervenciones';
      let frequencyBadgeClass = 'bg-slate-100 text-slate-500 border-slate-200';

      if (total >= 3 || reparaciones >= 2) {
        frequencyStatus = 'critico';
        frequencyLabel = 'Alta Frecuencia / Crítico (≥3)';
        frequencyBadgeClass = 'bg-rose-50 text-rose-700 border-rose-300 font-bold';
      } else if (total === 2 || reparaciones === 1) {
        frequencyStatus = 'alerta';
        frequencyLabel = 'Frecuencia Moderada (2)';
        frequencyBadgeClass = 'bg-amber-50 text-amber-800 border-amber-300 font-semibold';
      } else if (total === 1) {
        frequencyStatus = 'optimo';
        frequencyLabel = 'Intervención Aislada (1)';
        frequencyBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-300';
      }

      result.push({
        id: dev.id,
        sourceType: dev.sourceType,
        codigo: dev.codigo,
        tipoLabel: dev.tipoLabel,
        marca: dev.marca,
        modelo: dev.modelo,
        numeroSerie: dev.numeroSerie,
        ip: dev.ip,
        ubicacionCompleta: dev.ubicacionCompleta,
        rackCodigo: dev.rackCodigo,
        totalIntervenciones: total,
        reparaciones,
        preventivos,
        recambios,
        instalaciones,
        lastIntervention: devEvents[0] || null,
        intervencionesList: devEvents,
        frequencyStatus,
        frequencyLabel,
        frequencyBadgeClass,
        rawItem: dev.rawItem,
      });
    });

    return result;
  }, [allDevicesList, intervenciones]);

  // Extract unique brands and models for cascading filter dropdowns
  const availableMarcas = useMemo(() => {
    const set = new Set<string>();
    aggregatedDevices.forEach(d => {
      if (d.marca && d.marca !== '-') set.add(d.marca);
    });
    return Array.from(set).sort();
  }, [aggregatedDevices]);

  const availableModelos = useMemo(() => {
    const set = new Set<string>();
    aggregatedDevices.forEach(d => {
      if (selectedMarca === 'all' || d.marca === selectedMarca) {
        if (d.modelo && d.modelo !== '-') set.add(d.modelo);
      }
    });
    return Array.from(set).sort();
  }, [aggregatedDevices, selectedMarca]);

  // Filtered aggregated devices
  const filteredDevices = useMemo(() => {
    return aggregatedDevices.filter(item => {
      // 1. Single device filter
      if (selectedDeviceId !== 'all' && item.id !== selectedDeviceId) return false;

      // 2. Frequency filter
      if (selectedFrecuencia === 'all_intervened' && item.totalIntervenciones === 0) return false;
      if (selectedFrecuencia === 'criticos' && item.frequencyStatus !== 'critico') return false;
      if (selectedFrecuencia === 'recurrentes' && item.totalIntervenciones < 2) return false;

      // 3. Marca filter
      if (selectedMarca !== 'all' && item.marca.toLowerCase() !== selectedMarca.toLowerCase()) return false;

      // 4. Modelo filter
      if (selectedModelo !== 'all' && item.modelo.toLowerCase() !== selectedModelo.toLowerCase()) return false;

      // 5. Tipo filter
      if (selectedTipo !== 'all') {
        if (selectedTipo === 'camara' && item.sourceType !== 'camara') return false;
        if (selectedTipo === 'rack' && item.sourceType !== 'rack') return false;
        if (selectedTipo === 'switch' && !item.tipoLabel.toLowerCase().includes('switch')) return false;
        if (selectedTipo === 'nvr' && !item.tipoLabel.toLowerCase().includes('nvr') && !item.tipoLabel.toLowerCase().includes('grabador')) return false;
        if (selectedTipo === 'patch_panel' && !item.tipoLabel.toLowerCase().includes('patch')) return false;
        if (selectedTipo === 'ups' && !item.tipoLabel.toLowerCase().includes('ups')) return false;
      }

      // 6. Tipo Intervención filter
      if (selectedTipoIntervencion !== 'all') {
        const hasType = item.intervencionesList.some(e => e.tipo_intervencion === selectedTipoIntervencion);
        if (!hasType) return false;
      }

      // 7. Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const mCode = item.codigo.toLowerCase().includes(q);
        const mMarca = item.marca.toLowerCase().includes(q);
        const mModelo = item.modelo.toLowerCase().includes(q);
        const mUbi = item.ubicacionCompleta.toLowerCase().includes(q);
        const mIp = item.ip.toLowerCase().includes(q);
        const mHist = item.intervencionesList.some(
          e => (e.tecnico_responsable || '').toLowerCase().includes(q) ||
               (e.ticket_referencia || '').toLowerCase().includes(q) ||
               (e.descripcion || '').toLowerCase().includes(q) ||
               (e.repuestos_insumos || '').toLowerCase().includes(q)
        );
        if (!mCode && !mMarca && !mModelo && !mUbi && !mIp && !mHist) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort by total interventions descending, then reparaciones desc, then code
      if (b.totalIntervenciones !== a.totalIntervenciones) {
        return b.totalIntervenciones - a.totalIntervenciones;
      }
      if (b.reparaciones !== a.reparaciones) {
        return b.reparaciones - a.reparaciones;
      }
      return a.codigo.localeCompare(b.codigo);
    });
  }, [
    aggregatedDevices,
    selectedDeviceId,
    selectedFrecuencia,
    selectedMarca,
    selectedModelo,
    selectedTipo,
    selectedTipoIntervencion,
    searchTerm,
  ]);

  // Chronological filtered flat list of interventions
  const filteredInterventionsChronological = useMemo(() => {
    const validDeviceIds = new Set(filteredDevices.map(d => d.id));
    return intervenciones.filter(item => {
      if (!validDeviceIds.has(item.entidad_id)) return false;
      if (selectedTipoIntervencion !== 'all' && item.tipo_intervencion !== selectedTipoIntervencion) return false;
      return true;
    });
  }, [filteredDevices, intervenciones, selectedTipoIntervencion]);

  // Brand & Model failure analytics based on filtered devices
  const analytics = useMemo(() => {
    const brandCounts: Record<string, { total: number; reparaciones: number; devices: Set<string> }> = {};
    const modelCounts: Record<string, { marca: string; total: number; reparaciones: number; devices: Set<string> }> = {};

    let totalInterventions = 0;
    let totalReparaciones = 0;
    let totalPreventivos = 0;
    let criticalDevicesCount = 0;

    filteredDevices.forEach(d => {
      totalInterventions += d.totalIntervenciones;
      totalReparaciones += d.reparaciones;
      totalPreventivos += d.preventivos;
      if (d.frequencyStatus === 'critico') criticalDevicesCount++;

      // Aggregate brand
      if (d.marca && d.totalIntervenciones > 0) {
        if (!brandCounts[d.marca]) {
          brandCounts[d.marca] = { total: 0, reparaciones: 0, devices: new Set() };
        }
        brandCounts[d.marca].total += d.totalIntervenciones;
        brandCounts[d.marca].reparaciones += d.reparaciones;
        brandCounts[d.marca].devices.add(d.id);
      }

      // Aggregate model
      if (d.modelo && d.totalIntervenciones > 0 && d.modelo !== 'Sin Modelo') {
        const key = `${d.marca} ${d.modelo}`;
        if (!modelCounts[key]) {
          modelCounts[key] = { marca: d.marca, total: 0, reparaciones: 0, devices: new Set() };
        }
        modelCounts[key].total += d.totalIntervenciones;
        modelCounts[key].reparaciones += d.reparaciones;
        modelCounts[key].devices.add(d.id);
      }
    });

    const topBrands = Object.entries(brandCounts)
      .map(([marca, data]) => ({ marca, total: data.total, reparaciones: data.reparaciones, count: data.devices.size }))
      .sort((a, b) => b.total - a.total);

    const topModels = Object.entries(modelCounts)
      .map(([modeloKey, data]) => ({ modeloKey, marca: data.marca, total: data.total, reparaciones: data.reparaciones, count: data.devices.size }))
      .sort((a, b) => b.total - a.total);

    return {
      totalDevices: filteredDevices.length,
      devicesWithInterventions: filteredDevices.filter(d => d.totalIntervenciones > 0).length,
      totalInterventions,
      totalReparaciones,
      totalPreventivos,
      criticalDevicesCount,
      topBrands,
      topModels,
    };
  }, [filteredDevices]);

  // Paginated devices
  const paginatedDevices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDevices.slice(start, start + pageSize);
  }, [filteredDevices, currentPage, pageSize]);

  const toggleExpand = (id: string) => {
    setExpandedDeviceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetFilters = () => {
    setSelectedDeviceId('all');
    setSelectedMarca('all');
    setSelectedModelo('all');
    setSelectedTipo('all');
    setSelectedTipoIntervencion('all');
    setSelectedFrecuencia('all_intervened');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const hasActiveFilters = 
    selectedDeviceId !== 'all' ||
    selectedMarca !== 'all' ||
    selectedModelo !== 'all' ||
    selectedTipo !== 'all' ||
    selectedTipoIntervencion !== 'all' ||
    selectedFrecuencia !== 'all_intervened' ||
    searchTerm.trim() !== '';

  // Export to Excel using shared engine
  const handleExportExcel = () => {
    const isSingleDevice = selectedDeviceId !== 'all';
    const singleDev = isSingleDevice ? deviceDict.get(selectedDeviceId) : undefined;

    const headers = [
      'Código Dispositivo',
      'Tipo Dispositivo',
      'Marca',
      'Modelo',
      'Ubicación Física Completa',
      'Rack',
      'Total Intervenciones',
      'Reparaciones / Fallas',
      'Preventivos',
      'Nivel de Frecuencia',
      'Última Intervención (Fecha)',
      'Último Técnico',
      'Detalle de Intervenciones Registradas',
    ];

    const rows = filteredDevices.map(d => {
      const historyStr = d.intervencionesList
        .map(i => `[${new Date(i.fecha).toLocaleDateString()} - ${i.tipo_intervencion.toUpperCase()}: ${i.descripcion || ''} (Téc: ${i.tecnico_responsable}${i.ticket_referencia ? ` | OT: ${i.ticket_referencia}` : ''})]`)
        .join('; ');

      return [
        d.codigo,
        d.tipoLabel,
        d.marca,
        d.modelo,
        d.ubicacionCompleta,
        d.rackCodigo ? `Rack ${d.rackCodigo}` : '-',
        d.totalIntervenciones,
        d.reparaciones,
        d.preventivos,
        d.frequencyLabel,
        d.lastIntervention ? new Date(d.lastIntervention.fecha).toLocaleDateString() : 'N/A',
        d.lastIntervention?.tecnico_responsable || 'N/A',
        historyStr,
      ];
    });

    const activeFilters: ReportFilterItem[] = [];
    if (isSingleDevice && singleDev) {
      activeFilters.push({ label: 'Dispositivo', value: `${singleDev.codigo} (${singleDev.marca} ${singleDev.modelo})` });
    }
    if (selectedMarca !== 'all') activeFilters.push({ label: 'Marca', value: selectedMarca });
    if (selectedModelo !== 'all') activeFilters.push({ label: 'Modelo', value: selectedModelo });
    if (selectedTipo !== 'all') activeFilters.push({ label: 'Tipo', value: selectedTipo.toUpperCase() });
    if (selectedTipoIntervencion !== 'all') activeFilters.push({ label: 'Tipo Intervención', value: selectedTipoIntervencion });
    if (searchTerm.trim()) activeFilters.push({ label: 'Búsqueda', value: `"${searchTerm.trim()}"` });

    const summaryKpis: ReportKpiSummaryItem[] = [
      { label: 'Total Intervenciones', value: analytics.totalInterventions },
      { label: 'Reparaciones (Fallas)', value: analytics.totalReparaciones },
      { label: 'Preventivos', value: analytics.totalPreventivos },
      { label: 'Equipos Críticos (≥3)', value: analytics.criticalDevicesCount },
      { 
        label: 'Top Marca más Frecuente', 
        value: analytics.topBrands[0] ? `${analytics.topBrands[0].marca} (${analytics.topBrands[0].total})` : 'N/A' 
      },
    ];

    exportReportToExcel({
      title: isSingleDevice 
        ? `Reporte de Intervenciones - Dispositivo ${singleDev?.codigo || selectedDeviceId}`
        : 'Reporte de Gestión de Intervenciones y Confiabilidad por Dispositivo',
      subtitle: 'Auditoría Técnica de Fallas, Mantenimiento y Frecuencia de Intervenciones',
      filename: isSingleDevice
        ? `Reporte_Intervenciones_${singleDev?.codigo || 'Dispositivo'}_${new Date().toISOString().slice(0, 10)}`
        : `Reporte_Intervenciones_Dispositivos_${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      appliedFilters: activeFilters,
      summaryKpis,
    });
  };

  // Export to PDF using shared engine
  const handleExportPdf = () => {
    const isSingleDevice = selectedDeviceId !== 'all';
    const singleDev = isSingleDevice ? deviceDict.get(selectedDeviceId) : undefined;

    const headers = [
      'Código',
      'Tipo',
      'Marca',
      'Modelo',
      'Ubicación',
      'Total',
      'Fallas',
      'Prev.',
      'Frecuencia',
      'Última Fecha',
    ];

    const rows = filteredDevices.map(d => [
      d.codigo,
      d.tipoLabel,
      d.marca,
      d.modelo,
      d.ubicacionCompleta,
      d.totalIntervenciones,
      d.reparaciones,
      d.preventivos,
      d.totalIntervenciones >= 3 ? 'ALTA (≥3)' : d.totalIntervenciones === 2 ? 'MODERADA (2)' : d.totalIntervenciones === 1 ? 'NORMAL (1)' : 'SIN INTERV.',
      d.lastIntervention ? new Date(d.lastIntervention.fecha).toLocaleDateString() : 'N/A',
    ]);

    const activeFilters: ReportFilterItem[] = [];
    if (isSingleDevice && singleDev) {
      activeFilters.push({ label: 'Dispositivo', value: `${singleDev.codigo} (${singleDev.marca} ${singleDev.modelo})` });
    }
    if (selectedMarca !== 'all') activeFilters.push({ label: 'Marca', value: selectedMarca });
    if (selectedModelo !== 'all') activeFilters.push({ label: 'Modelo', value: selectedModelo });
    if (selectedTipo !== 'all') activeFilters.push({ label: 'Tipo', value: selectedTipo.toUpperCase() });

    const summaryKpis: ReportKpiSummaryItem[] = [
      { label: 'Total Intervenciones', value: analytics.totalInterventions },
      { label: 'Reparaciones', value: analytics.totalReparaciones },
      { label: 'Preventivos', value: analytics.totalPreventivos },
      { label: 'Dispositivos Críticos', value: analytics.criticalDevicesCount },
      { 
        label: 'Top Marca Afectada', 
        value: analytics.topBrands[0] ? `${analytics.topBrands[0].marca} (${analytics.topBrands[0].total})` : '-' 
      },
    ];

    exportReportToPdf({
      title: isSingleDevice 
        ? `Reporte de Intervenciones: ${singleDev?.codigo || selectedDeviceId}`
        : 'Reporte de Intervenciones y Confiabilidad por Dispositivo',
      subtitle: 'Auditoría Técnica de Mantenimiento, Frecuencia de Fallas y Análisis por Marca / Modelo',
      filename: isSingleDevice
        ? `Reporte_Intervenciones_${singleDev?.codigo || 'Dispositivo'}_${new Date().toISOString().slice(0, 10)}`
        : `Reporte_Intervenciones_Dispositivos_${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      appliedFilters: activeFilters,
      summaryKpis,
      orientation: 'landscape',
    });
  };

  // Export single device directly from row
  const handleExportSingleDevicePdf = (dev: DeviceInterventionAggregated) => {
    const headers = [
      'Fecha',
      'Tipo Intervención',
      'Técnico Responsable',
      'Ticket / OT',
      'Repuestos / Insumos',
      'Descripción del Trabajo Realizado',
    ];

    const rows = dev.intervencionesList.map(item => [
      new Date(item.fecha).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
      item.tipo_intervencion.replace(/_/g, ' ').toUpperCase(),
      item.tecnico_responsable,
      item.ticket_referencia || 'N/A',
      item.repuestos_insumos || '-',
      item.descripcion || '-',
    ]);

    const appliedFilters: ReportFilterItem[] = [
      { label: 'Dispositivo', value: dev.codigo },
      { label: 'Tipo', value: dev.tipoLabel },
      { label: 'Marca / Modelo', value: `${dev.marca} ${dev.modelo}` },
      { label: 'Ubicación', value: dev.ubicacionCompleta },
      { label: 'IP', value: dev.ip },
    ];

    const summaryKpis: ReportKpiSummaryItem[] = [
      { label: 'Total Intervenciones', value: dev.totalIntervenciones },
      { label: 'Reparaciones / Fallas', value: dev.reparaciones },
      { label: 'Mantenimientos Preventivos', value: dev.preventivos },
      { label: 'Estado Confiabilidad', value: dev.frequencyLabel },
    ];

    exportReportToPdf({
      title: `Bitácora Técnica e Intervenciones: ${dev.codigo}`,
      subtitle: `Historial de Mantenimiento Individual · ${dev.marca} ${dev.modelo} · ${dev.ubicacionCompleta}`,
      filename: `Bitacora_Intervenciones_${dev.codigo}_${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
      appliedFilters,
      summaryKpis,
      orientation: 'landscape',
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Executive Reliability Summary (KPI Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs font-mono">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            Total Intervenciones
          </span>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {analytics.totalInterventions}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            En {analytics.devicesWithInterventions} dispositivos
          </span>
        </div>

        <div className={`p-3.5 rounded-lg border shadow-2xs font-mono ${
          analytics.criticalDevicesCount > 0 ? 'bg-rose-50/70 border-rose-300' : 'bg-white border-slate-200'
        }`}>
          <span className="text-[10px] text-rose-700 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Alta Frecuencia (≥3)</span>
            {analytics.criticalDevicesCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
            )}
          </span>
          <div className="text-2xl font-bold text-rose-700 mt-1">
            {analytics.criticalDevicesCount}
          </div>
          <span className="text-[10px] text-rose-600 mt-0.5 block font-sans">
            Equipos con fallas recurrentes
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs font-mono">
          <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Reparaciones / Fallas</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          </span>
          <div className="text-2xl font-bold text-amber-700 mt-1">
            {analytics.totalReparaciones}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block font-sans">
            Correctivos aplicados
          </span>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs font-mono">
          <span className="text-[10px] text-blue-700 font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Preventivos</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
          </span>
          <div className="text-2xl font-bold text-blue-700 mt-1">
            {analytics.totalPreventivos}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block font-sans">
            Mantenimiento programado
          </span>
        </div>

        {/* Top Brand Widget */}
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs font-mono">
          <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider block">
            Top Marca Intervenida
          </span>
          <div className="text-base font-bold text-slate-900 mt-1 truncate">
            {analytics.topBrands[0]?.marca || 'Sin registros'}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            {analytics.topBrands[0] ? `${analytics.topBrands[0].total} eventos (${analytics.topBrands[0].reparaciones} fallas)` : 'N/A'}
          </span>
        </div>

        {/* Top Model Widget */}
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs font-mono">
          <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider block">
            Top Modelo con Fallas
          </span>
          <div className="text-xs font-bold text-indigo-900 mt-1 truncate" title={analytics.topModels[0]?.modeloKey}>
            {analytics.topModels[0]?.modeloKey || 'Sin registros'}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            {analytics.topModels[0] ? `${analytics.topModels[0].total} eventos en ${analytics.topModels[0].count} equipos` : 'N/A'}
          </span>
        </div>
      </div>

      {/* Top Problematic Brands & Models Quick Analytics Bar */}
      {analytics.topBrands.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs font-mono flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-slate-800">
              Ranking de Marcas Más Intervenidas:
            </span>
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              {analytics.topBrands.slice(0, 4).map(b => (
                <button
                  key={b.marca}
                  type="button"
                  onClick={() => setSelectedMarca(b.marca)}
                  className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                    selectedMarca === b.marca
                      ? 'bg-blue-600 text-white border-blue-600 font-bold'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {b.marca} ({b.total})
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>Modelos Críticos:</span>
            {analytics.topModels.slice(0, 2).map(m => (
              <span key={m.modeloKey} className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-semibold truncate max-w-xs">
                {m.modeloKey}: {m.total} interv.
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main Filter & Action Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold font-mono text-slate-900 uppercase tracking-wider">
              Filtros de Auditoría y Trazabilidad de Fallas
            </h2>
            {hasActiveFilters && (
              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                Filtros activos
              </span>
            )}
          </div>

          {/* Export & Actions Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                title="Limpiar todos los filtros"
              >
                <X className="w-3.5 h-3.5" />
                <span>Restablecer</span>
              </button>
            )}

            <button
              type="button"
              onClick={loadInterventions}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded shadow-2xs hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
              <span>Actualizar</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredDevices.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Exportar auditoría de fallas e intervenciones a Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar a Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={filteredDevices.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Generar informe técnico PDF con resumen de frecuencia y marcas"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Exportar a PDF</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
          {/* 1. Selector de Dispositivo Específico */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">
              Dispositivo Específico
            </label>
            <select
              value={selectedDeviceId}
              onChange={(e) => { setSelectedDeviceId(e.target.value); setCurrentPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs font-mono"
            >
              <option value="all">Todos los Dispositivos ({aggregatedDevices.length})</option>
              {aggregatedDevices
                .filter(d => d.totalIntervenciones > 0)
                .map(d => (
                  <option key={d.id} value={d.id}>
                    {d.codigo} · {d.marca} {d.modelo} ({d.totalIntervenciones} interv.)
                  </option>
                ))}
            </select>
          </div>

          {/* 2. Filtro por Marca */}
          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">
              Marca
            </label>
            <select
              value={selectedMarca}
              onChange={(e) => { 
                setSelectedMarca(e.target.value); 
                setSelectedModelo('all');
                setCurrentPage(1); 
              }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs"
            >
              <option value="all">Todas las Marcas ({availableMarcas.length})</option>
              {availableMarcas.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* 3. Filtro por Modelo */}
          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">
              Modelo
            </label>
            <select
              value={selectedModelo}
              onChange={(e) => { setSelectedModelo(e.target.value); setCurrentPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs"
            >
              <option value="all">Todos los Modelos ({availableModelos.length})</option>
              {availableModelos.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* 4. Filtro por Tipo de Dispositivo */}
          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">
              Tipo Dispositivo
            </label>
            <select
              value={selectedTipo}
              onChange={(e) => { setSelectedTipo(e.target.value); setCurrentPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs"
            >
              <option value="all">Todos los Tipos</option>
              <option value="camara">Cámaras CCTV</option>
              <option value="switch">Switches PoE</option>
              <option value="nvr">Grabadores NVR/DVR</option>
              <option value="patch_panel">Patch Panels</option>
              <option value="rack">Bastidores / Racks</option>
              <option value="ups">UPS / Energía</option>
            </select>
          </div>

          {/* 5. Filtro por Frecuencia / Severidad */}
          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">
              Frecuencia / Severidad
            </label>
            <select
              value={selectedFrecuencia}
              onChange={(e) => { setSelectedFrecuencia(e.target.value as any); setCurrentPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs"
            >
              <option value="all_intervened">Solo Intervenidos (&gt;0)</option>
              <option value="criticos">Alta Frecuencia (≥3) Críticos</option>
              <option value="recurrentes">Recurrentes (≥2)</option>
              <option value="todos">Todo el Inventario (inc. 0)</option>
            </select>
          </div>
        </div>

        {/* Secondary filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs font-mono">
          <div>
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">
              Tipo de Intervención
            </label>
            <select
              value={selectedTipoIntervencion}
              onChange={(e) => { setSelectedTipoIntervencion(e.target.value); setCurrentPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs"
            >
              <option value="all">Todos los Tipos de Intervención</option>
              <option value="reparacion">Solo Reparaciones (Fallas / Correctivos)</option>
              <option value="mantenimiento_preventivo">Solo Mantenimiento Preventivo</option>
              <option value="recambio">Solo Recambios de Equipo</option>
              <option value="instalacion">Solo Instalaciones</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] text-slate-500 uppercase font-semibold mb-1">
              Búsqueda Rápida (Código, Técnico, Ticket OT, Descripción, Repuestos)
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Buscar por código, serie, técnico, OT-2026, repuesto..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-blue-600 text-xs font-mono"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Results Table & View Mode Switcher */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        {/* Table Header Strip */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">
              {viewMode === 'dispositivos' 
                ? `Dispositivos Evaluados (${filteredDevices.length})`
                : `Eventos de Bitácora Registrados (${filteredInterventionsChronological.length})`}
            </span>
            {analytics.criticalDevicesCount > 0 && (
              <span className="text-[10px] font-bold bg-rose-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                {analytics.criticalDevicesCount} con alta frecuencia
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Vista:</span>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
              <button
                type="button"
                onClick={() => setViewMode('dispositivos')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'dispositivos'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Frecuencia por Dispositivo
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cronologico')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'cronologico'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bitácora Cronológica
              </button>
            </div>
          </div>
        </div>

        {/* View 1: Dispositivos con Frecuencia de Intervenciones */}
        {viewMode === 'dispositivos' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Dispositivo</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Marca</th>
                  <th className="py-2.5 px-3">Modelo</th>
                  <th className="py-2.5 px-3">Ubicación Física</th>
                  <th className="py-2.5 px-3 text-center">Intervenciones</th>
                  <th className="py-2.5 px-3 text-center">Fallas / Prev.</th>
                  <th className="py-2.5 px-3">Confiabilidad</th>
                  <th className="py-2.5 px-3">Última Intervención</th>
                  <th className="py-2.5 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedDevices.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400 font-mono">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-700">No se encontraron dispositivos</p>
                      <p className="text-xs text-slate-400 mt-1">
                        No hay equipos que coincidan con la combinación de filtros seleccionada.
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedDevices.map((dev) => {
                    const isExpanded = expandedDeviceIds.has(dev.id);

                    return (
                      <React.Fragment key={dev.id}>
                        <tr className={`hover:bg-slate-50/80 transition-colors ${dev.frequencyStatus === 'critico' ? 'bg-rose-50/20' : ''}`}>
                          <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {dev.sourceType === 'camara' ? (
                                <div 
                                  className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer"
                                  onClick={() => onSelectCamera && onSelectCamera(dev.rawItem as Camara)}
                                  title="Ver Ficha de Cámara"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                </div>
                              ) : dev.sourceType === 'rack' ? (
                                <div 
                                  className="p-1 rounded bg-slate-900 text-blue-400 hover:bg-slate-800 cursor-pointer"
                                  onClick={() => onSelectRack && onSelectRack(dev.rawItem as Rack)}
                                  title="Ver Ficha de Rack"
                                >
                                  <Server className="w-3.5 h-3.5" />
                                </div>
                              ) : dev.tipoLabel.includes('Switch') ? (
                                <div className="p-1 rounded bg-emerald-50 text-emerald-600">
                                  <Network className="w-3.5 h-3.5" />
                                </div>
                              ) : dev.tipoLabel.includes('NVR') || dev.tipoLabel.includes('Grabador') ? (
                                <div className="p-1 rounded bg-indigo-50 text-indigo-600">
                                  <HardDrive className="w-3.5 h-3.5" />
                                </div>
                              ) : (
                                <div className="p-1 rounded bg-slate-100 text-slate-700">
                                  <Cable className="w-3.5 h-3.5" />
                                </div>
                              )}

                              <div>
                                <span className="font-bold text-slate-900">{dev.codigo}</span>
                                {dev.ip && dev.ip !== '-' && (
                                  <span className="block text-[9px] text-slate-500 font-mono">
                                    {dev.ip}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                            {dev.tipoLabel}
                          </td>

                          <td className="py-2.5 px-3 text-slate-900 font-bold whitespace-nowrap">
                            {dev.marca}
                          </td>

                          <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate" title={dev.modelo}>
                            {dev.modelo}
                          </td>

                          <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={dev.ubicacionCompleta}>
                            {dev.ubicacionCompleta}
                          </td>

                          {/* Total Interventions Badge */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold font-mono ${
                              dev.totalIntervenciones >= 3 
                                ? 'bg-rose-600 text-white' 
                                : dev.totalIntervenciones === 2 
                                ? 'bg-amber-500 text-white' 
                                : dev.totalIntervenciones === 1 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-slate-100 text-slate-400'
                            }`}>
                              {dev.totalIntervenciones}
                            </span>
                          </td>

                          {/* Breakdown: Reparaciones vs Preventivos */}
                          <td className="py-2.5 px-3 text-center text-[11px] whitespace-nowrap">
                            {dev.totalIntervenciones === 0 ? (
                              <span className="text-slate-400">-</span>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5 font-bold">
                                <span className={dev.reparaciones > 0 ? 'text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200' : 'text-slate-400'}>
                                  {dev.reparaciones} rep.
                                </span>
                                <span className="text-slate-300">/</span>
                                <span className="text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                  {dev.preventivos} prev.
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Confiabilidad / Frecuencia Status Badge */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase border ${dev.frequencyBadgeClass}`}>
                              {dev.frequencyStatus === 'critico' && <ShieldAlert className="w-3 h-3 text-rose-600" />}
                              <span>{dev.frequencyLabel}</span>
                            </span>
                          </td>

                          {/* Última Intervención */}
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap text-[11px]">
                            {dev.lastIntervention ? (
                              <div>
                                <span className="font-bold text-slate-700 block">
                                  {new Date(dev.lastIntervention.fecha).toLocaleDateString()}
                                </span>
                                <span className="text-[10px] text-slate-400 block truncate max-w-[120px]">
                                  {dev.lastIntervention.tecnico_responsable}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">Sin historial</span>
                            )}
                          </td>

                          {/* Row Actions */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {dev.totalIntervenciones > 0 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(dev.id)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border ${
                                      isExpanded 
                                        ? 'bg-blue-600 text-white border-blue-600 font-bold' 
                                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                    }`}
                                    title="Desplegar bitácora completa de este dispositivo"
                                  >
                                    <span>{isExpanded ? 'Ocultar' : 'Bitácora'}</span>
                                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleExportSingleDevicePdf(dev)}
                                    className="p-1 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                                    title={`Descargar reporte individual en PDF para ${dev.codigo}`}
                                  >
                                    <FileText className="w-3.5 h-3.5 text-rose-600" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Timeline of this Device */}
                        {isExpanded && dev.intervencionesList.length > 0 && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={10} className="p-4 border-t border-b border-slate-200">
                              <div className="space-y-3 pl-6 border-l-2 border-blue-500">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                                    <Wrench className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Línea de Tiempo de Intervenciones · {dev.codigo} ({dev.marca} {dev.modelo})</span>
                                  </h4>
                                  <button
                                    type="button"
                                    onClick={() => handleExportSingleDevicePdf(dev)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded shadow-2xs cursor-pointer"
                                  >
                                    <FileText className="w-3 h-3" />
                                    <span>Exportar Reporte de este Dispositivo</span>
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  {dev.intervencionesList.map((item) => (
                                    <div 
                                      key={item.id} 
                                      className="bg-white p-3 rounded-lg border border-slate-200 text-xs font-mono space-y-1.5 shadow-2xs hover:border-slate-300 transition-colors"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-slate-800 flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                            {new Date(item.fecha).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                          </span>
                                          <span className={`px-2 py-0.2 rounded text-[10px] font-bold uppercase border ${
                                            item.tipo_intervencion === 'reparacion'
                                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                                              : item.tipo_intervencion === 'mantenimiento_preventivo'
                                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                                              : item.tipo_intervencion === 'recambio'
                                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          }`}>
                                            {item.tipo_intervencion.replace(/_/g, ' ')}
                                          </span>
                                        </div>

                                        <div className="flex items-center gap-3">
                                          {item.ticket_referencia && (
                                            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                                              <Tag className="w-3 h-3 text-slate-400" />
                                              OT: {item.ticket_referencia}
                                            </span>
                                          )}
                                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                            <User className="w-3 h-3 text-slate-400" />
                                            Téc: <strong className="text-slate-700">{item.tecnico_responsable}</strong>
                                          </span>
                                        </div>
                                      </div>

                                      <p className="text-slate-800 font-sans text-xs leading-relaxed">
                                        {item.descripcion || 'Sin descripción técnica.'}
                                      </p>

                                      {item.repuestos_insumos && (
                                        <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 flex items-center gap-1">
                                          <span className="font-semibold text-slate-600">Repuestos utilizados:</span>
                                          <span className="italic text-slate-700">{item.repuestos_insumos}</span>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* View 2: Bitácora Cronológica Completa */}
        {viewMode === 'cronologico' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Dispositivo</th>
                  <th className="py-2.5 px-3">Tipo Dispositivo</th>
                  <th className="py-2.5 px-3">Marca / Modelo</th>
                  <th className="py-2.5 px-3">Tipo Intervención</th>
                  <th className="py-2.5 px-3">Técnico</th>
                  <th className="py-2.5 px-3">Ticket / OT</th>
                  <th className="py-2.5 px-3">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInterventionsChronological.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-mono">
                      No hay intervenciones registradas para los filtros activos.
                    </td>
                  </tr>
                ) : (
                  filteredInterventionsChronological.slice(0, 30).map((item) => {
                    const dev = deviceDict.get(item.entidad_id);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 whitespace-nowrap font-bold text-slate-700">
                          {new Date(item.fecha).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-bold text-blue-700">
                          {dev?.codigo || item.entidad_id.slice(0, 8)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                          {dev?.tipoLabel || item.entidad_tipo}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-800">
                          {dev ? `${dev.marca} ${dev.modelo}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            item.tipo_intervencion === 'reparacion'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : item.tipo_intervencion === 'mantenimiento_preventivo'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {item.tipo_intervencion.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                          {item.tecnico_responsable}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                          {item.ticket_referencia || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-sans max-w-md truncate" title={item.descripcion || ''}>
                          {item.descripcion || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination bar */}
        {viewMode === 'dispositivos' && filteredDevices.length > pageSize && (
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500">
              Mostrando {Math.min((currentPage - 1) * pageSize + 1, filteredDevices.length)} a{' '}
              {Math.min(currentPage * pageSize, filteredDevices.length)} de {filteredDevices.length} dispositivos
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
              >
                Anterior
              </button>
              <span className="px-2 py-1 text-slate-600">
                Pág. {currentPage} de {Math.ceil(filteredDevices.length / pageSize)}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredDevices.length / pageSize), p + 1))}
                disabled={currentPage >= Math.ceil(filteredDevices.length / pageSize)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
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
