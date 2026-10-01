import React, { useState, useEffect } from 'react';
import { 
  Tag, 
  Cpu, 
  Building, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  RefreshCw, 
  AlertTriangle, 
  Check, 
  X, 
  AlertCircle,
  HelpCircle,
  Link2Off,
  Filter
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Marca, Modelo, Proveedor, TipoEquipo } from '../types/database';

export const CatalogsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'marcas' | 'modelos' | 'proveedores'>('marcas');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Data lists
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);

  // Usage counts map: itemId -> { modelos?: number, equipos?: number, camaras?: number, total: number, details?: string }
  const [usageStats, setUsageStats] = useState<Record<string, { total: number; text: string }>>({});

  // Modals state
  const [marcaModal, setMarcaModal] = useState<{ isOpen: boolean; mode: 'create' | 'edit'; item?: Marca } | null>(null);
  const [modeloModal, setModeloModal] = useState<{ isOpen: boolean; mode: 'create' | 'edit'; item?: Modelo } | null>(null);
  const [proveedorModal, setProveedorModal] = useState<{ isOpen: boolean; mode: 'create' | 'edit'; item?: Proveedor } | null>(null);

  // Delete modal state
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    type: 'marca' | 'modelo' | 'proveedor';
    id: string;
    nombre: string;
    usageCount: number;
    usageDetails: string;
  } | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Form states for modals
  const [brandFormName, setBrandFormName] = useState('');
  
  const [modelForm, setModelForm] = useState<{
    marca_id: string;
    nombre: string;
    tipo_equipo: string;
    puertos_default: string;
    canales_default: string;
    capacidad_va_default: string;
    tipo_camara_default: string;
    lente_default: string;
    resolucion_mp_default: string;
    apertura_fov_default: string;
    zoom_optico_default: string;
  }>({
    marca_id: '',
    nombre: '',
    tipo_equipo: 'switch',
    puertos_default: '',
    canales_default: '',
    capacidad_va_default: '',
    tipo_camara_default: 'domo',
    lente_default: '2.8mm',
    resolucion_mp_default: '4',
    apertura_fov_default: '103',
    zoom_optico_default: '',
  });

  const [provForm, setProvForm] = useState<{
    nombre: string;
    rubro: 'venta' | 'instalacion' | 'ambos';
    contacto: string;
  }>({
    nombre: '',
    rubro: 'ambos',
    contacto: '',
  });

  // Fetch all catalogs and calculate usage
  const loadCatalogs = async () => {
    try {
      setLoading(true);
      const [
        { data: marcasData },
        { data: modelosData },
        { data: provData },
        { data: allEquipos },
        { data: allCamaras },
      ] = await Promise.all([
        supabase.from('marcas').select('*').order('nombre'),
        supabase.from('modelos').select('*, marca:marcas(*)').order('nombre'),
        supabase.from('proveedores').select('*').order('nombre'),
        supabase.from('equipos').select('id, marca_id, modelo_id, proveedor_compra_id, proveedor_instalacion_id'),
        supabase.from('camaras').select('id, marca_id, modelo_id, proveedor_compra_id, proveedor_instalacion_id, codigo'),
      ]);

      const loadedMarcas = marcasData || [];
      const loadedModelos = modelosData || [];
      const loadedProvs = provData || [];
      const eqs = allEquipos || [];
      const cams = allCamaras || [];

      setMarcas(loadedMarcas);
      setModelos(loadedModelos);
      setProveedores(loadedProvs);

      // Compute usage map
      const stats: Record<string, { total: number; text: string }> = {};

      // 1. Marcas usage
      loadedMarcas.forEach(m => {
        const modCount = loadedModelos.filter(mod => mod.marca_id === m.id).length;
        const eqCount = eqs.filter(e => e.marca_id === m.id).length;
        const camCount = cams.filter(c => c.marca_id === m.id).length;
        const total = modCount + eqCount + camCount;

        const parts: string[] = [];
        if (modCount > 0) parts.push(`${modCount} ${modCount === 1 ? 'modelo' : 'modelos'}`);
        if (eqCount > 0) parts.push(`${eqCount} ${eqCount === 1 ? 'equipo' : 'equipos'}`);
        if (camCount > 0) parts.push(`${camCount} ${camCount === 1 ? 'cámara' : 'cámaras'}`);

        stats[`marca-${m.id}`] = {
          total,
          text: parts.length > 0 ? parts.join(', ') : 'Sin registros asociados',
        };
      });

      // 2. Modelos usage
      loadedModelos.forEach(mod => {
        const eqCount = eqs.filter(e => e.modelo_id === mod.id).length;
        const camCount = cams.filter(c => c.modelo_id === mod.id).length;
        const total = eqCount + camCount;

        const parts: string[] = [];
        if (eqCount > 0) parts.push(`${eqCount} ${eqCount === 1 ? 'equipo' : 'equipos'}`);
        if (camCount > 0) parts.push(`${camCount} ${camCount === 1 ? 'cámara' : 'cámaras'}`);

        stats[`modelo-${mod.id}`] = {
          total,
          text: parts.length > 0 ? parts.join(', ') : 'Sin registros asociados',
        };
      });

      // 3. Proveedores usage
      loadedProvs.forEach(p => {
        const eqCount = eqs.filter(e => e.proveedor_compra_id === p.id || e.proveedor_instalacion_id === p.id).length;
        const camList = cams.filter(c => c.proveedor_compra_id === p.id || c.proveedor_instalacion_id === p.id);
        const camCount = camList.length;
        const total = eqCount + camCount;

        const parts: string[] = [];
        if (eqCount > 0) parts.push(`${eqCount} ${eqCount === 1 ? 'equipo' : 'equipos'}`);
        if (camCount > 0) {
          const camNames = camList.map(c => c.codigo).slice(0, 3).join(', ');
          const extra = camList.length > 3 ? ` y ${camList.length - 3} más` : '';
          parts.push(`${camCount} ${camCount === 1 ? 'cámara' : 'cámaras'} (${camNames}${extra})`);
        }

        stats[`prov-${p.id}`] = {
          total,
          text: parts.length > 0 ? parts.join(', ') : 'Sin registros asociados',
        };
      });

      setUsageStats(stats);
    } catch (err) {
      console.error('Error loading catalogs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalogs();
  }, []);

  const triggerToast = (msg: string, isError = false) => {
    if (isError) {
      setErrorToast(msg);
      setTimeout(() => setErrorToast(null), 5000);
    } else {
      setSuccessToast(msg);
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  // ==========================================
  // MARCA ACTIONS
  // ==========================================
  const handleOpenMarcaModal = (mode: 'create' | 'edit', item?: Marca) => {
    setBrandFormName(mode === 'edit' && item ? item.nombre : '');
    setMarcaModal({ isOpen: true, mode, item });
  };

  const handleSaveMarca = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = brandFormName.trim();
    if (!clean) return;

    try {
      setActionLoading(true);
      if (marcaModal?.mode === 'create') {
        const { error } = await supabase.from('marcas').insert([{ nombre: clean }]);
        if (error) throw error;
        triggerToast(`Marca "${clean}" creada correctamente.`);
      } else if (marcaModal?.mode === 'edit' && marcaModal.item) {
        const { error } = await supabase.from('marcas').update({ nombre: clean }).eq('id', marcaModal.item.id);
        if (error) throw error;
        triggerToast(`Marca renombrada a "${clean}".`);
      }
      setMarcaModal(null);
      await loadCatalogs();
    } catch (err: any) {
      console.error('Error saving brand:', err);
      triggerToast(err.message || 'Error al guardar la marca', true);
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // MODELO ACTIONS
  // ==========================================
  const handleOpenModeloModal = (mode: 'create' | 'edit', item?: Modelo) => {
    if (mode === 'edit' && item) {
      setModelForm({
        marca_id: item.marca_id,
        nombre: item.nombre,
        tipo_equipo: item.tipo_equipo,
        puertos_default: item.puertos_default ? String(item.puertos_default) : '',
        canales_default: item.canales_default ? String(item.canales_default) : '',
        capacidad_va_default: item.capacidad_va_default ? String(item.capacidad_va_default) : '',
        tipo_camara_default: item.tipo_camara_default || 'domo',
        lente_default: item.lente_default || '',
        resolucion_mp_default: item.resolucion_mp_default ? String(item.resolucion_mp_default) : '4',
        apertura_fov_default: item.apertura_fov_default ? String(item.apertura_fov_default) : '',
        zoom_optico_default: item.zoom_optico_default ? String(item.zoom_optico_default) : '',
      });
    } else {
      setModelForm({
        marca_id: marcas[0]?.id || '',
        nombre: '',
        tipo_equipo: 'switch',
        puertos_default: '',
        canales_default: '',
        capacidad_va_default: '',
        tipo_camara_default: 'domo',
        lente_default: '2.8mm',
        resolucion_mp_default: '4',
        apertura_fov_default: '103',
        zoom_optico_default: '',
      });
    }
    setModeloModal({ isOpen: true, mode, item });
  };

  const handleSaveModelo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNombre = modelForm.nombre.trim();
    if (!cleanNombre || !modelForm.marca_id) return;

    try {
      setActionLoading(true);
      const payload: any = {
        marca_id: modelForm.marca_id,
        nombre: cleanNombre,
        tipo_equipo: modelForm.tipo_equipo,
        puertos_default: modelForm.puertos_default ? parseInt(modelForm.puertos_default) : null,
        canales_default: modelForm.canales_default ? parseInt(modelForm.canales_default) : null,
        capacidad_va_default: modelForm.capacidad_va_default ? parseInt(modelForm.capacidad_va_default) : null,
      };

      if (modelForm.tipo_equipo === 'camara') {
        payload.tipo_camara_default = modelForm.tipo_camara_default || null;
        payload.lente_default = modelForm.lente_default.trim() || null;
        payload.resolucion_mp_default = modelForm.resolucion_mp_default ? parseFloat(modelForm.resolucion_mp_default) : null;
        payload.apertura_fov_default = modelForm.apertura_fov_default ? parseInt(modelForm.apertura_fov_default) : null;
        payload.zoom_optico_default = modelForm.zoom_optico_default.trim() || null;
      }

      if (modeloModal?.mode === 'create') {
        const { error } = await supabase.from('modelos').insert([payload]);
        if (error) throw error;
        triggerToast(`Modelo "${cleanNombre}" creado correctamente.`);
      } else if (modeloModal?.mode === 'edit' && modeloModal.item) {
        const { error } = await supabase.from('modelos').update(payload).eq('id', modeloModal.item.id);
        if (error) throw error;
        triggerToast(`Modelo "${cleanNombre}" actualizado.`);
      }
      setModeloModal(null);
      await loadCatalogs();
    } catch (err: any) {
      console.error('Error saving model:', err);
      triggerToast(err.message || 'Error al guardar el modelo', true);
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // PROVEEDOR ACTIONS
  // ==========================================
  const handleOpenProveedorModal = (mode: 'create' | 'edit', item?: Proveedor) => {
    if (mode === 'edit' && item) {
      setProvForm({
        nombre: item.nombre,
        rubro: item.rubro,
        contacto: item.contacto || '',
      });
    } else {
      setProvForm({
        nombre: '',
        rubro: 'ambos',
        contacto: '',
      });
    }
    setProveedorModal({ isOpen: true, mode, item });
  };

  const handleSaveProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNombre = provForm.nombre.trim();
    if (!cleanNombre) return;

    try {
      setActionLoading(true);
      const payload = {
        nombre: cleanNombre,
        rubro: provForm.rubro,
        contacto: provForm.contacto.trim() || null,
      };

      if (proveedorModal?.mode === 'create') {
        const { error } = await supabase.from('proveedores').insert([payload]);
        if (error) throw error;
        triggerToast(`Proveedor "${cleanNombre}" registrado.`);
      } else if (proveedorModal?.mode === 'edit' && proveedorModal.item) {
        const { error } = await supabase.from('proveedores').update(payload).eq('id', proveedorModal.item.id);
        if (error) throw error;
        triggerToast(`Proveedor "${cleanNombre}" actualizado.`);
      }
      setProveedorModal(null);
      await loadCatalogs();
    } catch (err: any) {
      console.error('Error saving provider:', err);
      triggerToast(err.message || 'Error al guardar el proveedor', true);
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // DELETE & UNLINK SAFETY FLOW
  // ==========================================
  const handleRequestDelete = (type: 'marca' | 'modelo' | 'proveedor', id: string, nombre: string) => {
    const key = `${type === 'marca' ? 'marca' : type === 'modelo' ? 'modelo' : 'prov'}-${id}`;
    const stat = usageStats[key] || { total: 0, text: 'Sin uso' };

    setDeleteDialog({
      isOpen: true,
      type,
      id,
      nombre,
      usageCount: stat.total,
      usageDetails: stat.text,
    });
  };

  const handleExecuteDelete = async (forceUnlink = false) => {
    if (!deleteDialog) return;
    try {
      setActionLoading(true);
      const { type, id, nombre, usageCount } = deleteDialog;

      if (usageCount > 0 && !forceUnlink) {
        triggerToast('No se puede eliminar directamente un ítem en uso.', true);
        return;
      }

      // If user accepted unlinking or it's a provider like _TEMP_PROV_:
      if (usageCount > 0 && forceUnlink) {
        if (type === 'proveedor') {
          // Unassign from equipos
          await supabase.from('equipos').update({ proveedor_compra_id: null }).eq('proveedor_compra_id', id);
          await supabase.from('equipos').update({ proveedor_instalacion_id: null }).eq('proveedor_instalacion_id', id);
          // Unassign from camaras
          await supabase.from('camaras').update({ proveedor_compra_id: null }).eq('proveedor_compra_id', id);
          await supabase.from('camaras').update({ proveedor_instalacion_id: null }).eq('proveedor_instalacion_id', id);
        } else if (type === 'modelo') {
          await supabase.from('equipos').update({ modelo_id: null }).eq('modelo_id', id);
          await supabase.from('camaras').update({ modelo_id: null }).eq('modelo_id', id);
        } else if (type === 'marca') {
          // Unlink modelos, equipos, camaras
          await supabase.from('modelos').delete().eq('marca_id', id);
          await supabase.from('equipos').update({ marca_id: null, modelo_id: null }).eq('marca_id', id);
          await supabase.from('camaras').update({ marca_id: null, modelo_id: null }).eq('marca_id', id);
        }
      }

      // Now delete the record
      const tableName = type === 'marca' ? 'marcas' : type === 'modelo' ? 'modelos' : 'proveedores';
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;

      triggerToast(`"${nombre}" eliminado con éxito.`);
      setDeleteDialog(null);
      await loadCatalogs();
    } catch (err: any) {
      console.error('Error deleting item:', err);
      triggerToast(err.message || 'Error al eliminar el ítem', true);
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered items based on search query
  const q = searchQuery.toLowerCase().trim();

  const filteredMarcas = marcas.filter(m => !q || m.nombre.toLowerCase().includes(q));

  const filteredModelos = modelos.filter(mod => {
    if (!q) return true;
    const matchName = mod.nombre.toLowerCase().includes(q);
    const matchBrand = mod.marca?.nombre?.toLowerCase().includes(q);
    const matchType = mod.tipo_equipo.toLowerCase().includes(q);
    return matchName || matchBrand || matchType;
  });

  const filteredProveedores = proveedores.filter(p => {
    if (!q) return true;
    const matchName = p.nombre.toLowerCase().includes(q);
    const matchContact = p.contacto?.toLowerCase().includes(q);
    const matchRubro = p.rubro.toLowerCase().includes(q);
    return matchName || matchContact || matchRubro;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] font-mono border-b border-slate-200 pb-2 text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span>Configuración &gt; <strong className="text-slate-800">Catálogos de Hardware y Proveedores</strong></span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-700 font-semibold flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-blue-600" />
            <span>Tablas Relacionales Activas</span>
          </span>
          <span>•</span>
          <button 
            onClick={loadCatalogs}
            className="hover:text-blue-600 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            <span className="text-[10px] font-mono uppercase text-blue-700 font-bold tracking-wider">
              GESTIÓN CENTRALIZADA DE CATÁLOGOS TÉCNICOS
            </span>
          </div>
          <h1 className="text-xl font-bold font-mono text-slate-900 tracking-tight flex items-center gap-2">
            <span>Catálogos Maestros</span>
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl">
            Administre las marcas comerciales, modelos certificados y empresas proveedoras del sistema. Las modificaciones se reflejan en tiempo real en los montajes de rack y fichas de cámaras.
          </p>
        </div>

        {/* Global Action Button */}
        <div className="flex items-center gap-2">
          {activeTab === 'marcas' && (
            <button
              onClick={() => handleOpenMarcaModal('create')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold font-mono shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Nueva Marca</span>
            </button>
          )}
          {activeTab === 'modelos' && (
            <button
              onClick={() => handleOpenModeloModal('create')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold font-mono shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Nuevo Modelo</span>
            </button>
          )}
          {activeTab === 'proveedores' && (
            <button
              onClick={() => handleOpenProveedorModal('create')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold font-mono shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Nuevo Proveedor</span>
            </button>
          )}
        </div>
      </div>

      {/* Toast Notifications */}
      {successToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between font-mono animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorToast && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between font-mono animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorToast}</span>
          </div>
          <button onClick={() => setErrorToast(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setActiveTab('marcas'); setSearchQuery(''); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded transition-all ${
              activeTab === 'marcas'
                ? 'bg-slate-900 text-white font-semibold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Marcas ({marcas.length})</span>
          </button>
          <button
            onClick={() => { setActiveTab('modelos'); setSearchQuery(''); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded transition-all ${
              activeTab === 'modelos'
                ? 'bg-blue-600 text-white font-semibold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Modelos ({modelos.length})</span>
          </button>
          <button
            onClick={() => { setActiveTab('proveedores'); setSearchQuery(''); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded transition-all ${
              activeTab === 'proveedores'
                ? 'bg-purple-600 text-white font-semibold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Proveedores ({proveedores.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Buscar en ${activeTab}...`}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 font-mono flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <span>Cargando catálogos desde Supabase...</span>
          </div>
        ) : (
          <>
            {/* TAB: MARCAS */}
            {activeTab === 'marcas' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Marca Comercial</th>
                      <th className="py-3 px-4">Modelos Vinculados</th>
                      <th className="py-3 px-4">Uso en Infraestructura</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMarcas.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No se encontraron marcas registradas.
                        </td>
                      </tr>
                    ) : (
                      filteredMarcas.map(m => {
                        const stat = usageStats[`marca-${m.id}`] || { total: 0, text: 'Sin uso' };
                        const isInUse = stat.total > 0;
                        const relatedModels = modelos.filter(mod => mod.marca_id === m.id);

                        return (
                          <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                              <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{m.nombre}</span>
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              <span className="font-semibold">{relatedModels.length}</span> modelos
                              {relatedModels.length > 0 && (
                                <span className="text-[10px] text-slate-400 block truncate max-w-xs">
                                  {relatedModels.slice(0, 3).map(rm => rm.nombre).join(', ')}
                                  {relatedModels.length > 3 ? '...' : ''}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-600 text-[11px]">
                              {stat.text}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                isInUse
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}>
                                {isInUse ? `${stat.total} en uso` : 'Disponible'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleOpenMarcaModal('edit', m)}
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded"
                                  title="Renombrar marca"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleRequestDelete('marca', m.id, m.nombre)}
                                  className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="Eliminar marca"
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
            )}

            {/* TAB: MODELOS */}
            {activeTab === 'modelos' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Modelo</th>
                      <th className="py-3 px-4">Marca Fabricante</th>
                      <th className="py-3 px-4">Tipo de Dispositivo</th>
                      <th className="py-3 px-4">Valores por Defecto</th>
                      <th className="py-3 px-4">Uso</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredModelos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No se encontraron modelos registrados.
                        </td>
                      </tr>
                    ) : (
                      filteredModelos.map(mod => {
                        const stat = usageStats[`modelo-${mod.id}`] || { total: 0, text: 'Sin uso' };
                        const isInUse = stat.total > 0;

                        return (
                          <tr key={mod.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {mod.nombre}
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              {mod.marca?.nombre || 'Marca sin asignar'}
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                                {mod.tipo_equipo.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600 text-[11px]">
                              {mod.puertos_default && <span>{mod.puertos_default} Puertos RJ45</span>}
                              {mod.canales_default && <span>{mod.canales_default} Canales NVR</span>}
                              {mod.capacidad_va_default && <span>{mod.capacidad_va_default} VA</span>}
                              {mod.tipo_camara_default && <span>Tipo {mod.tipo_camara_default} ({mod.resolucion_mp_default || 4}MP)</span>}
                              {!mod.puertos_default && !mod.canales_default && !mod.capacidad_va_default && !mod.tipo_camara_default && (
                                <span className="text-slate-400 italic">Estándar</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                isInUse
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}>
                                {stat.text}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleOpenModeloModal('edit', mod)}
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded"
                                  title="Editar modelo"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleRequestDelete('modelo', mod.id, mod.nombre)}
                                  className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="Eliminar modelo"
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
            )}

            {/* TAB: PROVEEDORES */}
            {activeTab === 'proveedores' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Razón Social / Proveedor</th>
                      <th className="py-3 px-4">Rubro Comercial</th>
                      <th className="py-3 px-4">Contacto Directo</th>
                      <th className="py-3 px-4">Asignaciones en Sistema</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProveedores.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">
                          No se encontraron proveedores registrados.
                        </td>
                      </tr>
                    ) : (
                      filteredProveedores.map(p => {
                        const stat = usageStats[`prov-${p.id}`] || { total: 0, text: 'Sin uso' };
                        const isInUse = stat.total > 0;
                        const isTemp = p.nombre === '_TEMP_PROV_';

                        return (
                          <tr key={p.id} className={`hover:bg-slate-50/80 transition-colors ${
                            isTemp ? 'bg-amber-50/50' : ''
                          }`}>
                            <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                              <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{p.nombre}</span>
                              {isTemp && (
                                <span className="text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-bold border border-amber-300">
                                  REGISTRO TEMPORAL
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${
                                p.rubro === 'venta' 
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : p.rubro === 'instalacion'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}>
                                {p.rubro}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600 text-[11px]">
                              {p.contacto || <span className="text-slate-400 italic">Sin datos de contacto</span>}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                isInUse
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}>
                                {stat.text}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleOpenProveedorModal('edit', p)}
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded"
                                  title="Editar proveedor"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleRequestDelete('proveedor', p.id, p.nombre)}
                                  className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                                  title={isTemp ? 'Eliminar registro temporal' : 'Eliminar proveedor'}
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
            )}
          </>
        )}
      </div>

      {/* ========================================== */}
      {/* MODAL: MARCA CREATE / EDIT */}
      {/* ========================================== */}
      {marcaModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between font-mono">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-600" />
                <span>{marcaModal.mode === 'create' ? 'Crear Nueva Marca' : 'Renombrar Marca'}</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setMarcaModal(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMarca} className="p-4 space-y-4 text-xs font-mono">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Nombre Comercial de la Marca *</label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={brandFormName}
                  onChange={(e) => setBrandFormName(e.target.value)}
                  placeholder="ej. Cisco, Hikvision, Panduit"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMarcaModal(null)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !brandFormName.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Guardando...' : (marcaModal.mode === 'create' ? 'Crear Marca' : 'Guardar Cambios')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: MODELO CREATE / EDIT */}
      {/* ========================================== */}
      {modeloModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between font-mono">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-600" />
                <span>{modeloModal.mode === 'create' ? 'Crear Nuevo Modelo' : 'Editar Modelo'}</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setModeloModal(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModelo} className="p-5 space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Marca *</label>
                  <select
                    required
                    value={modelForm.marca_id}
                    onChange={(e) => setModelForm({ ...modelForm, marca_id: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  >
                    <option value="" disabled>Seleccione marca...</option>
                    {marcas.map(m => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Tipo de Equipo *</label>
                  <select
                    required
                    value={modelForm.tipo_equipo}
                    onChange={(e) => setModelForm({ ...modelForm, tipo_equipo: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  >
                    <option value="switch">Switch</option>
                    <option value="patch_panel">Patch Panel</option>
                    <option value="nvr">Grabador NVR</option>
                    <option value="ups">Sistema UPS</option>
                    <option value="organizador">Organizador Pasacables</option>
                    <option value="mufa">Mufa de Fibra Óptica</option>
                    <option value="camara">Cámara de Seguridad</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Nombre / Identificador del Modelo *</label>
                <input
                  type="text"
                  required
                  value={modelForm.nombre}
                  onChange={(e) => setModelForm({ ...modelForm, nombre: e.target.value })}
                  placeholder="ej. CBS350-24P-4G"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                />
              </div>

              {/* Dynamic Optional Defaults */}
              {(modelForm.tipo_equipo === 'switch' || modelForm.tipo_equipo === 'patch_panel') && (
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Puertos RJ45 por Defecto
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="96"
                    value={modelForm.puertos_default}
                    onChange={(e) => setModelForm({ ...modelForm, puertos_default: e.target.value })}
                    placeholder="24"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Al seleccionar este modelo en el montaje, se autocompletará este campo automáticamente.
                  </p>
                </div>
              )}

              {modelForm.tipo_equipo === 'nvr' && (
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Canales de Video por Defecto
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="128"
                    value={modelForm.canales_default}
                    onChange={(e) => setModelForm({ ...modelForm, canales_default: e.target.value })}
                    placeholder="32"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>
              )}

              {modelForm.tipo_equipo === 'ups' && (
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Capacidad (VA) por Defecto
                  </label>
                  <input
                    type="number"
                    min="100"
                    max="50000"
                    value={modelForm.capacidad_va_default}
                    onChange={(e) => setModelForm({ ...modelForm, capacidad_va_default: e.target.value })}
                    placeholder="1500"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>
              )}

              {modelForm.tipo_equipo === 'camara' && (
                <div className="space-y-3 bg-blue-50/50 p-3 rounded-lg border border-blue-200">
                  <span className="text-[10px] uppercase font-bold text-blue-800 tracking-wider block">
                    Valores por Defecto de Cámara (Opcionales)
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Tipo de Cámara</label>
                      <select
                        value={modelForm.tipo_camara_default}
                        onChange={(e) => setModelForm({ ...modelForm, tipo_camara_default: e.target.value })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      >
                        <option value="domo">Domo</option>
                        <option value="bullet">Bullet</option>
                        <option value="ptz">PTZ</option>
                        <option value="fisheye">Fisheye</option>
                        <option value="multisensor">Multisensor</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Resolución (MP)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={modelForm.resolucion_mp_default}
                        onChange={(e) => setModelForm({ ...modelForm, resolucion_mp_default: e.target.value })}
                        placeholder="4"
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Lente</label>
                      <input
                        type="text"
                        value={modelForm.lente_default}
                        onChange={(e) => setModelForm({ ...modelForm, lente_default: e.target.value })}
                        placeholder="ej. 2.8mm"
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Apertura FOV (°)</label>
                      <input
                        type="number"
                        min="30"
                        max="360"
                        value={modelForm.apertura_fov_default}
                        onChange={(e) => setModelForm({ ...modelForm, apertura_fov_default: e.target.value })}
                        placeholder="103"
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Zoom Óptico</label>
                      <input
                        type="text"
                        value={modelForm.zoom_optico_default}
                        onChange={(e) => setModelForm({ ...modelForm, zoom_optico_default: e.target.value })}
                        placeholder="ej. 25x"
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModeloModal(null)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !modelForm.nombre.trim() || !modelForm.marca_id}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Guardando...' : (modeloModal.mode === 'create' ? 'Crear Modelo' : 'Guardar Cambios')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: PROVEEDOR CREATE / EDIT */}
      {/* ========================================== */}
      {proveedorModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between font-mono">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Building className="w-4 h-4 text-blue-600" />
                <span>{proveedorModal.mode === 'create' ? 'Registrar Proveedor' : 'Editar Proveedor'}</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setProveedorModal(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProveedor} className="p-5 space-y-4 text-xs font-mono">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Razón Social o Nombre Comercial *</label>
                <input
                  type="text"
                  required
                  value={provForm.nombre}
                  onChange={(e) => setProvForm({ ...provForm, nombre: e.target.value })}
                  placeholder="ej. Telecom Distribuciones SpA"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Rubro Comercial *</label>
                <select
                  value={provForm.rubro}
                  onChange={(e) => setProvForm({ ...provForm, rubro: e.target.value as any })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs"
                >
                  <option value="venta">Venta / Distribución de Hardware</option>
                  <option value="instalacion">Instalación / Integrador en Terreno</option>
                  <option value="ambos">Ambos (Suministro e Integración)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Contacto Directo (Email / Teléfono / Ejecutivo)</label>
                <input
                  type="text"
                  value={provForm.contacto}
                  onChange={(e) => setProvForm({ ...provForm, contacto: e.target.value })}
                  placeholder="ej. ventas@telecom.cl / +56 9 8888 7777"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setProveedorModal(null)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !provForm.nombre.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Guardando...' : (proveedorModal.mode === 'create' ? 'Registrar' : 'Guardar Cambios')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL: DELETE & SAFETY VALIDATION */}
      {/* ========================================== */}
      {deleteDialog?.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 bg-rose-50/50 flex items-center justify-between font-mono">
              <div className="flex items-center gap-2 text-rose-700 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Confirmar Eliminación</span>
              </div>
              <button 
                type="button" 
                onClick={() => setDeleteDialog(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs font-mono">
              <div className="text-slate-700">
                ¿Está seguro de eliminar {deleteDialog.type} <strong className="text-slate-900">"{deleteDialog.nombre}"</strong>?
              </div>

              {deleteDialog.usageCount > 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>Elemento en Uso ({deleteDialog.usageCount} referencias)</span>
                  </div>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Este ítem está actualmente asignado a: <strong>{deleteDialog.usageDetails}</strong>.
                  </p>
                  <p className="text-[11px] text-slate-600 pt-1 border-t border-amber-200/60">
                    Para eliminarlo definitivamente, puede desvincular estas referencias (estableciéndolas en <em>null / Sin Asignar</em>) y proceder con el borrado.
                  </p>
                </div>
              ) : (
                <p className="text-slate-500 text-[11px]">
                  Este registro no tiene elementos asociados activos y se eliminará permanentemente.
                </p>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setDeleteDialog(null)}
                  className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancelar
                </button>

                {deleteDialog.usageCount > 0 ? (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleExecuteDelete(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-semibold transition-colors"
                  >
                    <Link2Off className="w-3.5 h-3.5" />
                    <span>{actionLoading ? 'Procesando...' : 'Desvincular y Eliminar'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleExecuteDelete(false)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded font-semibold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{actionLoading ? 'Eliminando...' : 'Eliminar Registro'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
