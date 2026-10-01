import React, { useState, useEffect, useMemo } from 'react';
import { 
  ListFilter, 
  Search, 
  Download, 
  Plus, 
  ExternalLink, 
  Edit3, 
  Wrench, 
  X, 
  Camera, 
  Server, 
  Building, 
  RefreshCw,
  Eye,
  Layers
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Camara, Equipo, Rack, Piso, Edificio, Campus, Sede, Proveedor } from '../types/database';

interface InventoryItem {
  id: string;
  sourceType: 'camara' | 'equipo';
  codigo: string;
  tipo: string;
  tipoCamara: string;
  tipoLabel: string;
  marca: string;
  modelo: string;
  numeroSerie: string;
  mac: string;
  ip: string;
  ubicacionFisica: string;
  rackCodigo: string;
  posicionU: string;
  conexion: string;
  fechaCompra: string;
  proveedorNombre: string;
  sedeNombre: string;
  edificioNombre: string;
  rawItem: Camara | Equipo;
}

interface InventoryListProps {
  onSelectCamera: (cam: Camara) => void;
  onSelectRack: (rackId: string) => void;
  onNavigateToRegistration: () => void;
  onNavigateToMaintenance: (cam: Camara) => void;
}

export const InventoryList: React.FC<InventoryListProps> = ({
  onSelectCamera,
  onSelectRack,
  onNavigateToRegistration,
  onNavigateToMaintenance,
}) => {
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [campusList, setCampusList] = useState<Campus[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSede, setFilterSede] = useState('all');
  const [filterEdificio, setFilterEdificio] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterTipoCamara, setFilterTipoCamara] = useState('all');
  const [filterProveedor, setFilterProveedor] = useState('all');
  const [filterPeriodo, setFilterPeriodo] = useState('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Load all tables to construct rich unified inventory
  const loadInventory = async () => {
    try {
      setLoading(true);
      const [
        { data: camData },
        { data: eqData },
        { data: rData },
        { data: pData },
        { data: edData },
        { data: cData },
        { data: sData },
        { data: provData }
      ] = await Promise.all([
        supabase.from('camaras').select('*').order('codigo'),
        supabase.from('equipos').select('*').order('codigo'),
        supabase.from('racks').select('*'),
        supabase.from('pisos').select('*'),
        supabase.from('edificios').select('*'),
        supabase.from('campus').select('*'),
        supabase.from('sedes').select('*'),
        supabase.from('proveedores').select('*'),
      ]);

      setCamaras(camData || []);
      setEquipos(eqData || []);
      setRacks(rData || []);
      setPisos(pData || []);
      setEdificios(edData || []);
      setCampusList(cData || []);
      setSedes(sData || []);
      setProveedores(provData || []);
    } catch (err) {
      console.error('Error loading inventory list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  // Maps for fast relation lookup
  const racksMap = useMemo(() => new Map(racks.map(r => [r.id, r])), [racks]);
  const pisosMap = useMemo(() => new Map(pisos.map(p => [p.id, p])), [pisos]);
  const edificiosMap = useMemo(() => new Map(edificios.map(e => [e.id, e])), [edificios]);
  const campusMap = useMemo(() => new Map(campusList.map(c => [c.id, c])), [campusList]);
  const sedesMap = useMemo(() => new Map(sedes.map(s => [s.id, s])), [sedes]);
  const provMap = useMemo(() => new Map(proveedores.map(p => [p.id, p])), [proveedores]);

  // Transform both cameras and equipment into a unified list
  const unifiedInventory: InventoryItem[] = useMemo(() => {
    const list: InventoryItem[] = [];

    // Add cameras
    camaras.forEach(cam => {
      const piso = cam.piso_id ? pisosMap.get(cam.piso_id) : undefined;
      const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
      const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
      const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;
      const rack = cam.rack_id ? racksMap.get(cam.rack_id) : undefined;
      const prov = cam.proveedor_compra_id ? provMap.get(cam.proveedor_compra_id) : undefined;

      const locStr = `${sede ? sede.nombre.replace('Sede ', '') : 'Central'} > ${edificio ? edificio.nombre.replace('Edificio ', 'Edif ') : 'Edif A'} > ${piso ? piso.nombre.replace('Piso ', 'P') : 'P2'}`;
      const connStr = cam.puerto_patch ? `PP-01 (Pto ${String(cam.puerto_patch).padStart(2, '0')})` : 'Sin parchear';

      const rawTipo = (cam.tipo_camara || cam.tipo_dispositivo || 'domo').toLowerCase();
      let label = 'Cámara Domo';
      let cameraKey = 'domo';
      if (rawTipo === 'bullet') {
        label = 'Cámara Bullet';
        cameraKey = 'bullet';
      } else if (rawTipo === 'ptz') {
        label = 'Cámara PTZ';
        cameraKey = 'ptz';
      } else if (rawTipo === 'fisheye') {
        label = 'Cámara Fisheye';
        cameraKey = 'fisheye';
      } else if (rawTipo === 'multisensor') {
        label = 'Cámara Multisensor';
        cameraKey = 'multisensor';
      }

      list.push({
        id: cam.id,
        sourceType: 'camara',
        codigo: cam.codigo,
        tipo: rawTipo,
        tipoCamara: cameraKey,
        tipoLabel: label,
        marca: cam.marca || '-',
        modelo: cam.modelo || '-',
        numeroSerie: cam.numero_serie || 'N/A',
        mac: cam.direccion_mac || '-',
        ip: cam.direccion_ip || '-',
        ubicacionFisica: locStr,
        rackCodigo: rack?.codigo || '-',
        posicionU: '-',
        conexion: connStr,
        fechaCompra: cam.fecha_compra || '-',
        proveedorNombre: prov?.nombre || '-',
        sedeNombre: sede?.nombre || '-',
        edificioNombre: edificio?.nombre || '-',
        rawItem: cam,
      });
    });

    // Add rack equipments
    equipos.forEach(eq => {
      const rack = eq.rack_id ? racksMap.get(eq.rack_id) : undefined;
      const piso = rack?.piso_id ? pisosMap.get(rack.piso_id) : undefined;
      const edificio = piso?.edificio_id ? edificiosMap.get(piso.edificio_id) : undefined;
      const campus = edificio?.campus_id ? campusMap.get(edificio.campus_id) : undefined;
      const sede = campus?.sede_id ? sedesMap.get(campus.sede_id) : undefined;
      const prov = eq.proveedor_compra_id ? provMap.get(eq.proveedor_compra_id) : undefined;

      const locParts: string[] = [];
      if (sede) locParts.push(sede.nombre.replace('Sede ', ''));
      if (edificio) locParts.push(edificio.nombre.replace('Edificio ', 'Edif '));
      if (piso) locParts.push(piso.nombre.replace('Piso ', 'P'));
      const locStr = locParts.length > 0 ? locParts.join(' > ') : '-';
      const uStr = eq.posicion_u_inicio ? `(U${eq.posicion_u_inicio})` : '';

      let connStr = '-';
      let label = 'Equipo Activo';
      if (eq.tipo === 'switch') {
        label = `Switch PoE ${eq.puertos_totales || 24}P`;
        connStr = eq.puertos_totales ? `${eq.puertos_totales} Puertos` : 'Switch';
      } else if (eq.tipo === 'patch_panel') {
        label = `Patch Panel ${eq.puertos_totales || 24}`;
        connStr = eq.puertos_totales ? `${eq.puertos_totales} Puertos` : 'Patch Panel';
      } else if (eq.tipo === 'nvr') {
        label = 'Grabador NVR';
        connStr = eq.canales_totales ? `${eq.canales_totales} Canales` : 'NVR';
      } else if (eq.tipo === 'ups') {
        label = 'Sistema UPS';
        connStr = eq.capacidad_va ? `${eq.capacidad_va} VA` : 'UPS';
      } else if (eq.tipo === 'organizador') {
        label = 'Pasivo / Guía';
        connStr = 'Pasivo';
      }

      list.push({
        id: eq.id,
        sourceType: 'equipo',
        codigo: eq.codigo,
        tipo: eq.tipo,
        tipoCamara: '-',
        tipoLabel: label,
        marca: eq.marca || '-',
        modelo: eq.modelo || '-',
        numeroSerie: eq.numero_serie || 'N/A',
        mac: '-',
        ip: eq.ip_gestion || '-',
        ubicacionFisica: locStr,
        rackCodigo: rack ? `${rack.codigo} ${uStr}`.trim() : '-',
        posicionU: uStr || '-',
        conexion: connStr,
        fechaCompra: eq.fecha_compra || '-',
        proveedorNombre: prov?.nombre || '-',
        sedeNombre: sede?.nombre || '-',
        edificioNombre: edificio?.nombre || '-',
        rawItem: eq,
      });
    });

    return list;
  }, [camaras, equipos, racksMap, pisosMap, edificiosMap, campusMap, sedesMap, provMap]);

  // Apply filters
  const filteredInventory = useMemo(() => {
    return unifiedInventory.filter(item => {
      // Query search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesQ = 
          item.codigo.toLowerCase().includes(q) ||
          item.marca.toLowerCase().includes(q) ||
          item.modelo.toLowerCase().includes(q) ||
          item.numeroSerie.toLowerCase().includes(q) ||
          item.ip.toLowerCase().includes(q) ||
          item.mac.toLowerCase().includes(q) ||
          item.tipoCamara.toLowerCase().includes(q) ||
          item.rackCodigo.toLowerCase().includes(q);
        if (!matchesQ) return false;
      }

      // Sede filter
      if (filterSede !== 'all') {
        if (!item.sedeNombre.toLowerCase().includes(filterSede.toLowerCase())) return false;
      }

      // Edificio filter
      if (filterEdificio !== 'all') {
        if (!item.edificioNombre.toLowerCase().includes(filterEdificio.toLowerCase())) return false;
      }

      // Tipo Hardware filter
      if (filterTipo !== 'all') {
        if (filterTipo === 'camaras' && item.sourceType !== 'camara') return false;
        if (filterTipo === 'switch' && item.tipo !== 'switch') return false;
        if (filterTipo === 'patch_panel' && item.tipo !== 'patch_panel') return false;
        if (filterTipo === 'nvr' && item.tipo !== 'nvr') return false;
        if (filterTipo === 'ups' && item.tipo !== 'ups') return false;
      }

      // Tipo Cámara filter
      if (filterTipoCamara !== 'all') {
        if (item.sourceType !== 'camara') return false;
        if (item.tipoCamara !== filterTipoCamara) return false;
      }

      // Proveedor filter
      if (filterProveedor !== 'all') {
        if (!item.proveedorNombre.toLowerCase().includes(filterProveedor.toLowerCase())) return false;
      }

      return true;
    });
  }, [unifiedInventory, searchQuery, filterSede, filterEdificio, filterTipo, filterTipoCamara, filterProveedor]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredInventory.length / pageSize) || 1;
  const paginatedItems = filteredInventory.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Reset filters
  const resetFilters = () => {
    setSearchQuery('');
    setFilterSede('all');
    setFilterEdificio('all');
    setFilterTipo('all');
    setFilterTipoCamara('all');
    setFilterProveedor('all');
    setFilterPeriodo('all');
    setCurrentPage(1);
  };

  const hasActiveFilters = searchQuery || filterSede !== 'all' || filterEdificio !== 'all' || filterTipo !== 'all' || filterTipoCamara !== 'all' || filterProveedor !== 'all';

  // Export full table to CSV
  const handleExportCSV = () => {
    const headers = ['Codigo', 'Tipo Hardware', 'Tipo Camara', 'Marca', 'Modelo', 'Numero Serie', 'IP', 'Ubicacion Fisica', 'Rack Asignado', 'Conexion', 'Fecha Compra', 'Proveedor'];
    const rows = filteredInventory.map(item => [
      `"${item.codigo}"`,
      `"${item.tipoLabel}"`,
      `"${item.tipoCamara}"`,
      `"${item.marca}"`,
      `"${item.modelo}"`,
      `"${item.numeroSerie}"`,
      `"${item.ip}"`,
      `"${item.ubicacionFisica}"`,
      `"${item.rackCodigo}"`,
      `"${item.conexion}"`,
      `"${item.fechaCompra}"`,
      `"${item.proveedorNombre}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `inventario_cctv_infraestructura.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Subheader strip */}
      <div className="flex items-center justify-between text-[11px] font-mono border-b border-slate-200 pb-2 text-slate-500">
        <div>
          <span>BASE DE DATOS DE INFRAESTRUCTURA • AUDITORÍA FÍSICA V2.4</span>
        </div>
        <div className="flex items-center gap-2">
          <span>{filteredInventory.length} Dispositivos Encontrados</span>
        </div>
      </div>

      {/* Main Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <ListFilter className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-bold font-mono text-slate-900 tracking-tight">
              Inventario Físico de Equipamiento
            </h1>
            <span className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded font-semibold">
              {unifiedInventory.length} Dispositivos Registrados
            </span>
          </div>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Registro unificado de cámaras CCTV, switches PoE, patch panels, NVRs y respaldo de energía
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Exportar Listado CSV</span>
          </button>
          <button
            onClick={onNavigateToRegistration}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ Registrar Nuevo Equipo</span>
          </button>
        </div>
      </div>

      {/* Comprehensive Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3 font-mono text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {/* Search box */}
          <div className="lg:col-span-2">
            <label className="block text-[10px] uppercase text-slate-500 mb-1">
              Búsqueda de Campo (Código, MAC, Serie, Modelo)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Ej. CAM-ENG-P2, Hikvision, 48:8F..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600 text-xs font-mono"
              />
            </div>
          </div>

          {/* Sede Dropdown */}
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">Sede Campus</label>
            <select
              value={filterSede}
              onChange={(e) => {
                setFilterSede(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
            >
              <option value="all">Todas las Sedes</option>
              {sedes.map(s => (
                <option key={s.id} value={s.nombre}>{s.nombre}</option>
              ))}
            </select>
          </div>

          {/* Edificio Dropdown */}
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">Edificio / Pabellón</label>
            <select
              value={filterEdificio}
              onChange={(e) => {
                setFilterEdificio(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
            >
              <option value="all">Todos los Edificios</option>
              {edificios.map(e => (
                <option key={e.id} value={e.nombre}>{e.nombre}</option>
              ))}
            </select>
          </div>

          {/* Tipo Hardware Dropdown */}
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">Tipo Hardware</label>
            <select
              value={filterTipo}
              onChange={(e) => {
                setFilterTipo(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
            >
              <option value="all">Todos los Tipos</option>
              <option value="camaras">Cámaras CCTV</option>
              <option value="switch">Switches PoE</option>
              <option value="patch_panel">Patch Panels</option>
              <option value="nvr">Grabadores NVR</option>
              <option value="ups">Sistemas UPS</option>
            </select>
          </div>

          {/* Tipo Cámara Dropdown */}
          <div>
            <label className="block text-[10px] uppercase text-blue-700 font-bold mb-1">Tipo de Cámara</label>
            <select
              value={filterTipoCamara}
              onChange={(e) => {
                setFilterTipoCamara(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1.5 border border-blue-300 rounded text-xs bg-blue-50/50 font-medium text-blue-900"
            >
              <option value="all">Todas las Cámaras</option>
              <option value="domo">Domo</option>
              <option value="bullet">Bullet</option>
              <option value="ptz">PTZ</option>
              <option value="fisheye">Fisheye</option>
              <option value="multisensor">Multisensor</option>
            </select>
          </div>

          {/* Proveedor Dropdown */}
          <div>
            <label className="block text-[10px] uppercase text-slate-500 mb-1">Proveedor (Compra/Inst.)</label>
            <select
              value={filterProveedor}
              onChange={(e) => {
                setFilterProveedor(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white truncate"
            >
              <option value="all">Todos los Proveedores</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.nombre}>{p.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Applied filters tags & reset */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap text-[11px]">
            <span className="text-slate-500 font-semibold">Filtros Activos:</span>
            {searchQuery && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                Búsqueda: {searchQuery}
                <button onClick={() => setSearchQuery('')}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterSede !== 'all' && (
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                Sede: {filterSede}
                <button onClick={() => setFilterSede('all')}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterTipo !== 'all' && (
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                Tipo: {filterTipo}
                <button onClick={() => setFilterTipo('all')}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterTipoCamara !== 'all' && (
              <span className="bg-blue-50 text-blue-800 font-semibold px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                Cámara: {filterTipoCamara.toUpperCase()}
                <button onClick={() => setFilterTipoCamara('all')}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterProveedor !== 'all' && (
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                Proveedor: {filterProveedor}
                <button onClick={() => setFilterProveedor('all')}><X className="w-3 h-3" /></button>
              </span>
            )}
            <button
              onClick={resetFilters}
              className="text-blue-600 hover:text-blue-800 underline ml-2"
            >
              Restablecer todos los filtros
            </button>
          </div>
        )}
      </div>

      {/* Main Inventory Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase">
              <tr>
                <th className="py-3 px-3">Código</th>
                <th className="py-3 px-3">Tipo de Equipo</th>
                <th className="py-3 px-3">Tipo Cámara</th>
                <th className="py-3 px-3">Marca & Modelo</th>
                <th className="py-3 px-3">Ubicación Física</th>
                <th className="py-3 px-3">Rack Asignado</th>
                <th className="py-3 px-3">Conexión (PP / Puerto)</th>
                <th className="py-3 px-3">Fecha Compra</th>
                <th className="py-3 px-3">Proveedor</th>
                <th className="py-3 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400 font-sans">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Cargando inventario general de Supabase...
                  </td>
                </tr>
              ) : unifiedInventory.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-500 font-mono">
                    <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-700 text-sm">No hay dispositivos registrados en el inventario</p>
                    <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto font-sans">
                      Comienza registrando la primera cámara en terreno o montando equipamiento activo en los racks.
                    </p>
                    <button
                      onClick={onNavigateToRegistration}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Registrar Primer Dispositivo</span>
                    </button>
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400 font-sans">
                    No se encontraron dispositivos que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  let badgeStyle = 'bg-slate-100 text-slate-700';
                  if (item.sourceType === 'camara') {
                    badgeStyle = 'bg-blue-50 text-blue-800 border border-blue-200';
                  } else if (item.tipo === 'switch') {
                    badgeStyle = 'bg-indigo-50 text-indigo-800 border border-indigo-200';
                  } else if (item.tipo === 'patch_panel') {
                    badgeStyle = 'bg-slate-100 text-slate-800 border border-slate-300';
                  } else if (item.tipo === 'nvr') {
                    badgeStyle = 'bg-amber-50 text-amber-800 border border-amber-200';
                  }

                  return (
                    <tr 
                      key={`${item.sourceType}-${item.id}`}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-bold text-blue-700 whitespace-nowrap">
                        {item.codigo}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${badgeStyle}`}>
                          {item.tipoLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {item.sourceType === 'camara' ? (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-100/70 text-blue-900 border border-blue-200">
                            {item.tipoCamara}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-semibold text-slate-900">{item.marca} {item.modelo}</span>
                        {item.ip !== '-' && (
                          <span className="text-[10px] text-slate-400 block font-mono">IP: {item.ip}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 text-[11px] whitespace-nowrap">
                        {item.ubicacionFisica}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-semibold whitespace-nowrap">
                        {item.rackCodigo}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 text-[11px] whitespace-nowrap">
                        {item.conexion}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {item.fechaCompra}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 text-[11px] truncate max-w-[150px]">
                        {item.proveedorNombre}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {item.sourceType === 'camara' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => onSelectCamera(item.rawItem as Camara)}
                              className="text-blue-600 hover:text-blue-800 font-semibold text-[11px] hover:underline"
                            >
                              Ver Ficha
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              onClick={() => onNavigateToMaintenance(item.rawItem as Camara)}
                              className="text-slate-500 hover:text-slate-800 text-[11px]"
                              title="Bitácora"
                            >
                              Bitácora
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              const eq = item.rawItem as Equipo;
                              if (eq.rack_id) onSelectRack(eq.rack_id);
                            }}
                            className="text-blue-600 hover:text-blue-800 font-semibold text-[11px] hover:underline"
                          >
                            Ver Rack
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-slate-600">
          <div>
            Mostrando <span className="font-bold text-slate-900">{Math.min(filteredInventory.length, (currentPage - 1) * pageSize + 1)}</span> - <span className="font-bold text-slate-900">{Math.min(filteredInventory.length, currentPage * pageSize)}</span> de <span className="font-bold text-slate-900">{filteredInventory.length}</span> equipos registrados en terreno
          </div>

          <div className="flex items-center gap-1">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
            >
              Anterior
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`w-7 h-7 rounded text-xs font-semibold ${
                  currentPage === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
            ))}

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="px-2.5 py-1 border border-slate-300 rounded bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
