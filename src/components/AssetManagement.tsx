import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Archive,
  Trash2,
  Upload,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  RefreshCw,
  Download,
  X,
  AlertCircle,
  HelpCircle,
  ArrowUpDown,
  Camera,
  Wifi,
  Server,
  Cable,
  Cpu,
  Check,
  ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ImportDevicesModal } from './ImportDevicesModal';

export interface InventarioGlobalItem {
  id: string;
  codigo: string;
  origen: 'equipo' | 'camara' | 'punto_red' | string;
  categoria: string;
  marca: string | null;
  modelo: string | null;
  direccion_mac: string | null;
  direccion_ip: string | null;
  estado_ciclo_vida: string | null;
  rack_id?: string | null;
  patch_panel_id?: string | null;
  puerto_patch?: number | null;
  created_at?: string;
  ubicacion_especifica?: string | null;
}

export type AssetTab = 'limbo' | 'bodega' | 'baja';

interface AssetManagementProps {
  onSelectCamera?: (cameraId: string) => void;
  onNavigateToPorts?: (equipmentId?: string) => void;
}

export const AssetManagement: React.FC<AssetManagementProps> = ({
  onSelectCamera,
  onNavigateToPorts
}) => {
  const [activeTab, setActiveTab] = useState<AssetTab>('limbo');
  const [items, setItems] = useState<InventarioGlobalItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Sorting
  const [sortField, setSortField] = useState<'codigo' | 'categoria' | 'marca' | 'mac' | 'ip'>('codigo');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Multi-selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);

  // Manual Creation Form State
  const [manualForm, setManualForm] = useState({
    codigo: '',
    origen: 'punto_red',
    categoria: 'wifi_ap',
    marca: '',
    modelo: '',
    mac: '',
    ip: '',
    ubicacion: '',
    estado_ciclo_vida: 'en_bodega'
  });
  const [isSavingManual, setIsSavingManual] = useState<boolean>(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Action feedback timeout
  useEffect(() => {
    if (actionSuccessMsg) {
      const timer = setTimeout(() => setActionSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccessMsg]);

  // Fetch data from Supabase view `v_inventario_global`
  const fetchInventory = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('v_inventario_global')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems((data as InventarioGlobalItem[]) || []);
    } catch (err: any) {
      console.error('Error al consultar v_inventario_global:', err);
      setErrorMsg(err.message || 'Error al conectar con la base de datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Compute counts per tab
  const limboItems = useMemo(() => {
    return items.filter(
      item => item.estado_ciclo_vida === 'limbo' || !item.estado_ciclo_vida
    );
  }, [items]);

  const bodegaItems = useMemo(() => {
    return items.filter(
      item =>
        item.estado_ciclo_vida === 'en_bodega' ||
        item.estado_ciclo_vida === 'retirado_pendiente_bodega'
    );
  }, [items]);

  const bajaItems = useMemo(() => {
    return items.filter(item => item.estado_ciclo_vida === 'dado_de_baja');
  }, [items]);

  const currentTabBaseItems = useMemo(() => {
    switch (activeTab) {
      case 'limbo':
        return limboItems;
      case 'bodega':
        return bodegaItems;
      case 'baja':
        return bajaItems;
      default:
        return [];
    }
  }, [activeTab, limboItems, bodegaItems, bajaItems]);

  // Filtered & Sorted items for current tab
  const filteredAndSortedItems = useMemo(() => {
    let result = currentTabBaseItems;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => {
        return (
          item.codigo?.toLowerCase().includes(q) ||
          item.marca?.toLowerCase().includes(q) ||
          item.modelo?.toLowerCase().includes(q) ||
          item.direccion_mac?.toLowerCase().includes(q) ||
          item.direccion_ip?.toLowerCase().includes(q) ||
          item.categoria?.toLowerCase().includes(q)
        );
      });
    }

    // Category filter
    if (selectedCategory !== 'all') {
      result = result.filter(item => item.categoria === selectedCategory);
    }

    // Sorting
    return [...result].sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortField === 'codigo') {
        valA = a.codigo || '';
        valB = b.codigo || '';
      } else if (sortField === 'categoria') {
        valA = a.categoria || '';
        valB = b.categoria || '';
      } else if (sortField === 'marca') {
        valA = `${a.marca || ''} ${a.modelo || ''}`;
        valB = `${b.marca || ''} ${b.modelo || ''}`;
      } else if (sortField === 'mac') {
        valA = a.direccion_mac || '';
        valB = b.direccion_mac || '';
      } else if (sortField === 'ip') {
        valA = a.direccion_ip || '';
        valB = b.direccion_ip || '';
      }

      const comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      return sortAsc ? comparison : -comparison;
    });
  }, [currentTabBaseItems, searchQuery, selectedCategory, sortField, sortAsc]);

  // Clear selection when changing tabs
  useEffect(() => {
    setSelectedIds([]);
  }, [activeTab]);

  // Multi-selection handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredAndSortedItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAndSortedItems.map(i => i.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Helper to resolve underlying table
  const getTableName = (origen: string): 'camaras' | 'puntos_red' | 'equipos' => {
    if (origen === 'camara') return 'camaras';
    if (origen === 'punto_red') return 'puntos_red';
    return 'equipos';
  };

  // Batch Update Status Action
  const handleBatchUpdateStatus = async (targetState: 'en_bodega' | 'dado_de_baja') => {
    if (selectedIds.length === 0) return;

    const selectedItems = items.filter(i => selectedIds.includes(i.id));
    try {
      const camarasIds = selectedItems.filter(i => i.origen === 'camara').map(i => i.id);
      const puntosIds = selectedItems.filter(i => i.origen === 'punto_red').map(i => i.id);
      const equiposIds = selectedItems.filter(i => i.origen === 'equipo').map(i => i.id);

      const updates: Promise<any>[] = [];
      if (camarasIds.length > 0) {
        updates.push(supabase.from('camaras').update({ estado_ciclo_vida: targetState }).in('id', camarasIds));
      }
      if (puntosIds.length > 0) {
        updates.push(supabase.from('puntos_red').update({ estado_ciclo_vida: targetState }).in('id', puntosIds));
      }
      if (equiposIds.length > 0) {
        updates.push(supabase.from('equipos').update({ estado_ciclo_vida: targetState }).in('id', equiposIds));
      }

      await Promise.all(updates);
      setActionSuccessMsg(
        `Se han actualizado ${selectedIds.length} activo(s) al estado "${
          targetState === 'en_bodega' ? 'En Bodega' : 'Dado de Baja'
        }" con éxito.`
      );
      setSelectedIds([]);
      await fetchInventory();
    } catch (err: any) {
      console.error('Error al actualizar estado en lote:', err);
      alert('Hubo un error al actualizar los activos: ' + (err.message || 'Error desconocido'));
    }
  };

  // Individual Update Status Action
  const handleSingleUpdateStatus = async (item: InventarioGlobalItem, targetState: string) => {
    try {
      const table = getTableName(item.origen);
      const { error } = await supabase
        .from(table)
        .update({ estado_ciclo_vida: targetState })
        .eq('id', item.id);

      if (error) throw error;
      setActionSuccessMsg(`Activo ${item.codigo} actualizado a "${targetState}".`);
      await fetchInventory();
    } catch (err: any) {
      console.error('Error al actualizar estado individual:', err);
      alert('Error: ' + (err.message || 'Error al actualizar el activo'));
    }
  };

  // Export Selected CSV
  const handleExportSelected = () => {
    const selectedItems = currentTabBaseItems.filter(i => selectedIds.includes(i.id));
    if (selectedItems.length === 0) return;

    const headers = 'Código,Origen,Categoría,Marca,Modelo,Dirección MAC,Dirección IP,Estado';
    const rows = selectedItems.map(i => [
      `"${i.codigo || ''}"`,
      `"${i.origen || ''}"`,
      `"${i.categoria || ''}"`,
      `"${(i.marca || '').replace(/"/g, '""')}"`,
      `"${(i.modelo || '').replace(/"/g, '""')}"`,
      `"${i.direccion_mac || ''}"`,
      `"${i.direccion_ip || ''}"`,
      `"${i.estado_ciclo_vida || 'en_limbo'}"`
    ].join(',')).join('\n');

    const content = `${headers}\n${rows}\n`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `activos_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle Manual Device Creation
  const handleSaveManualDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.codigo.trim()) return;

    setIsSavingManual(true);
    try {
      if (manualForm.origen === 'camara') {
        const payload: any = {
          codigo: manualForm.codigo.trim(),
          tipo_dispositivo: manualForm.categoria || 'domo',
          marca: manualForm.marca ? manualForm.marca.trim() : null,
          modelo: manualForm.modelo ? manualForm.modelo.trim() : null,
          direccion_mac: manualForm.mac ? manualForm.mac.trim() : null,
          direccion_ip: manualForm.ip ? manualForm.ip.trim() : null,
          ubicacion_especifica: manualForm.ubicacion ? manualForm.ubicacion.trim() : null,
          estado_ciclo_vida: manualForm.estado_ciclo_vida
        };
        const { error } = await supabase.from('camaras').insert([payload]);
        if (error) throw error;
      } else if (manualForm.origen === 'punto_red') {
        const payload: any = {
          codigo: manualForm.codigo.trim(),
          tipo_punto: manualForm.categoria || 'wifi_ap',
          direccion_mac: manualForm.mac ? manualForm.mac.trim() : null,
          direccion_ip: manualForm.ip ? manualForm.ip.trim() : null,
          ubicacion_especifica: manualForm.ubicacion ? manualForm.ubicacion.trim() : null,
          estado_ciclo_vida: manualForm.estado_ciclo_vida
        };
        const { error } = await supabase.from('puntos_red').insert([payload]);
        if (error) throw error;
      } else {
        const payload: any = {
          codigo: manualForm.codigo.trim(),
          tipo: manualForm.categoria || 'switch',
          marca: manualForm.marca ? manualForm.marca.trim() : null,
          modelo: manualForm.modelo ? manualForm.modelo.trim() : null,
          ip_gestion: manualForm.ip ? manualForm.ip.trim() : null,
          estado_ciclo_vida: manualForm.estado_ciclo_vida
        };
        const { error } = await supabase.from('equipos').insert([payload]);
        if (error) throw error;
      }

      setActionSuccessMsg(`Activo ${manualForm.codigo} registrado exitosamente.`);
      setIsManualModalOpen(false);
      setManualForm({
        codigo: '',
        origen: 'punto_red',
        categoria: 'wifi_ap',
        marca: '',
        modelo: '',
        mac: '',
        ip: '',
        ubicacion: '',
        estado_ciclo_vida: 'en_bodega'
      });
      await fetchInventory();
    } catch (err: any) {
      console.error('Error al registrar activo manual:', err);
      alert('Error al guardar activo: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsSavingManual(false);
    }
  };

  // Toggle sorting on column click
  const handleSort = (field: 'codigo' | 'categoria' | 'marca' | 'mac' | 'ip') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Category Icon & Badge renderer
  const renderCategoryBadge = (categoria: string, origen: string) => {
    const cleanCat = categoria?.toLowerCase() || '';
    if (cleanCat.includes('camara') || origen === 'camara') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          <Camera className="w-3 h-3 text-purple-600" />
          Cámara
        </span>
      );
    }
    if (cleanCat.includes('wifi') || cleanCat.includes('ap')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <Wifi className="w-3 h-3 text-blue-600" />
          WiFi AP
        </span>
      );
    }
    if (cleanCat.includes('switch')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Cpu className="w-3 h-3 text-emerald-600" />
          Switch
        </span>
      );
    }
    if (cleanCat.includes('patch')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <Cable className="w-3 h-3 text-amber-600" />
          Patch Panel
        </span>
      );
    }
    if (cleanCat.includes('funcionario') || cleanCat.includes('alumno')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
          <Cable className="w-3 h-3 text-cyan-600" />
          Punto Red
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-sans font-semibold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
        <Server className="w-3 h-3 text-slate-500" />
        {categoria || 'Equipo'}
      </span>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 font-sans">
      
      {actionSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs font-semibold text-emerald-800 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button onClick={() => setActionSuccessMsg(null)} className="p-1 hover:bg-emerald-100 rounded text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center border border-blue-500/20 shadow-xs">
            <Box className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Gestión de Activos
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Unificación centralizada del ciclo de vida de inventario: Limbo, Bodega y Dados de Baja
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchInventory}
            disabled={loading}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Recargar inventario global"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer"
          >
            <Upload className="w-4 h-4 text-slate-600" />
            <span>Importar CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer hover:shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>+ Agregar Manual</span>
          </button>
        </div>
      </div>

      <div className="flex border-b border-slate-200 gap-2 sm:gap-4 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('limbo')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'limbo'
              ? 'border-amber-500 text-amber-700 bg-amber-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <AlertCircle className={`w-4 h-4 ${activeTab === 'limbo' ? 'text-amber-600' : 'text-slate-400'}`} />
          <span>Nuevos / Sin Ubicar</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'limbo'
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {limboItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bodega')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'bodega'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <Archive className={`w-4 h-4 ${activeTab === 'bodega' ? 'text-blue-600' : 'text-slate-400'}`} />
          <span>En Bodega</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'bodega'
                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {bodegaItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('baja')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'baja'
              ? 'border-rose-500 text-rose-700 bg-rose-50/50 rounded-t-lg'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <Trash2 className={`w-4 h-4 ${activeTab === 'baja' ? 'text-rose-600' : 'text-slate-400'}`} />
          <span>Dados de Baja</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              activeTab === 'baja'
                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {bajaItems.length}
          </span>
        </button>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
          <span>
            {activeTab === 'limbo' && 'Dispositivos cargados recientemente al sistema que requieren asignación o configuración inicial.'}
            {activeTab === 'bodega' && 'Dispositivos almacenados en stock listos para ser desplegados o conectados a un puerto/bastidor.'}
            {activeTab === 'baja' && 'Historial de activos retirados definitivamente de servicio para control y trazabilidad.'}
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-500 font-medium">
          Mostrando {filteredAndSortedItems.length} de {currentTabBaseItems.length} registros
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código, marca, modelo, MAC o IP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>Categoría:</span>
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white font-medium text-slate-700 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Todas las categorías</option>
            <option value="wifi_ap">WiFi Access Points</option>
            <option value="camara">Cámaras CCTV</option>
            <option value="switch">Switches</option>
            <option value="patch_panel">Patch Panels</option>
            <option value="datos_funcionario">Puntos Datos</option>
            <option value="otro">Otros</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Cargando inventario global desde Supabase...</p>
          </div>
        ) : errorMsg ? (
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">Error al consultar datos</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{errorMsg}</p>
            <button
              onClick={fetchInventory}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        ) : filteredAndSortedItems.length === 0 ? (
          <div className="p-16 text-center space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto border border-slate-200">
              {activeTab === 'limbo' ? (
                <Box className="w-8 h-8" />
              ) : activeTab === 'bodega' ? (
                <Archive className="w-8 h-8" />
              ) : (
                <Trash2 className="w-8 h-8" />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">
                {searchQuery || selectedCategory !== 'all'
                  ? 'No se encontraron resultados para los filtros'
                  : activeTab === 'limbo'
                  ? 'No hay activos en el Limbo'
                  : activeTab === 'bodega'
                  ? 'No hay activos en Bodega'
                  : 'No hay activos dados de baja'}
              </h3>
              <p className="text-xs text-slate-500">
                {searchQuery || selectedCategory !== 'all'
                  ? 'Intenta restablecer los términos de búsqueda o cambiar el filtro de categoría.'
                  : activeTab === 'limbo'
                  ? 'Todos los equipos han sido configurados o asignados correctamente a bodega/instalación.'
                  : activeTab === 'bodega'
                  ? 'Puedes importar nuevos equipos masivamente desde un archivo CSV o agregar uno de forma manual.'
                  : 'No se han registrado equipos dados de baja en este periodo.'}
              </p>
            </div>
            {(searchQuery || selectedCategory !== 'all') ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Limpiar Filtros
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-600" />
                  <span>Importar CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(true)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Manual</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-mono sticky top-0">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredAndSortedItems.length && filteredAndSortedItems.length > 0}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                      title="Seleccionar todos"
                    />
                  </th>
                  <th
                    onClick={() => handleSort('codigo')}
                    className="py-3 px-4 font-bold cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Código</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('categoria')}
                    className="py-3 px-4 font-bold cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Categoría / Tipo</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('marca')}
                    className="py-3 px-4 font-bold cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Marca / Modelo</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('mac')}
                    className="py-3 px-4 font-bold cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Dirección MAC</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('ip')}
                    className="py-3 px-4 font-bold cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Dirección IP</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right font-bold">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {filteredAndSortedItems.map(item => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(item.id)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                        />
                      </td>

                      <td className="py-3 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{item.codigo}</span>
                          {item.ubicacion_especifica && (
                            <span className="text-[10px] text-slate-400 font-sans truncate max-w-[120px]" title={item.ubicacion_especifica}>
                              ({item.ubicacion_especifica})
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {renderCategoryBadge(item.categoria, item.origen)}
                      </td>

                      <td className="py-3 px-4 text-slate-700">
                        {[item.marca, item.modelo].filter(Boolean).join(' / ') || (
                          <span className="text-slate-400 italic">No especificado</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                        {item.direccion_mac ? (
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {item.direccion_mac}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                        {item.direccion_ip ? (
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {item.direccion_ip}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {activeTab === 'limbo' && (
                            <button
                              type="button"
                              onClick={() => handleSingleUpdateStatus(item, 'en_bodega')}
                              className="px-2.5 py-1 text-[11px] font-sans font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                              title="Mover a Bodega"
                            >
                              A Bodega
                            </button>
                          )}

                          {activeTab === 'bodega' && (
                            <button
                              type="button"
                              onClick={() => handleSingleUpdateStatus(item, 'dado_de_baja')}
                              className="px-2.5 py-1 text-[11px] font-sans font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                              title="Dar de Baja este equipo"
                            >
                              Dar de Baja
                            </button>
                          )}

                          {activeTab === 'baja' && (
                            <button
                              type="button"
                              onClick={() => handleSingleUpdateStatus(item, 'en_bodega')}
                              className="px-2.5 py-1 text-[11px] font-sans font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors cursor-pointer"
                              title="Reactivar y enviar a Bodega"
                            >
                              Reactivar
                            </button>
                          )}

                          {item.origen === 'camara' && onSelectCamera && (
                            <button
                              type="button"
                              onClick={() => onSelectCamera(item.id)}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                              title="Ver ficha de cámara"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-4 sm:gap-6 animate-in slide-in-from-bottom-4 duration-150">
          <div className="flex items-center gap-2 pr-2 border-r border-slate-700">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold font-mono">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold text-slate-200 whitespace-nowrap">
              {selectedIds.length === 1 ? 'Activo seleccionado' : 'Activos seleccionados'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {activeTab === 'limbo' && (
              <button
                type="button"
                onClick={() => handleBatchUpdateStatus('en_bodega')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Enviar a Bodega</span>
              </button>
            )}

            {activeTab === 'bodega' && (
              <button
                type="button"
                onClick={() => handleBatchUpdateStatus('dado_de_baja')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Dar de Baja</span>
              </button>
            )}

            {activeTab === 'baja' && (
              <button
                type="button"
                onClick={() => handleBatchUpdateStatus('en_bodega')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Reactivar a Bodega</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Seleccionados (.CSV)</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Deseleccionar todo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <ImportDevicesModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onRefresh={() => {
          fetchInventory();
          setActionSuccessMsg('Importación completada. Inventario global sincronizado.');
        }}
      />

      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/30 text-blue-400 rounded-xl border border-blue-500/30">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Agregar Activo Manual</h3>
                  <p className="text-xs text-slate-400">Registra un dispositivo individual en el inventario</p>
                </div>
              </div>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualDevice} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Origen / Tipo Principal</label>
                  <select
                    value={manualForm.origen}
                    onChange={(e) => {
                      const val = e.target.value;
                      setManualForm(prev => ({
                        ...prev,
                        origen: val,
                        categoria: val === 'camara' ? 'camara' : val === 'punto_red' ? 'wifi_ap' : 'switch'
                      }));
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium text-slate-800 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="punto_red">Punto de Red / AP</option>
                    <option value="camara">Cámara CCTV</option>
                    <option value="equipo">Equipo de Bastidor (Switch / UPS)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Categoría Específica</label>
                  <select
                    value={manualForm.categoria}
                    onChange={(e) => setManualForm(prev => ({ ...prev, categoria: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium text-slate-800 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    {manualForm.origen === 'punto_red' && (
                      <>
                        <option value="wifi_ap">WiFi Access Point</option>
                        <option value="datos_funcionario">Punto Funcionario</option>
                        <option value="datos_alumno">Punto Alumno / Laboratorio</option>
                      </>
                    )}
                    {manualForm.origen === 'camara' && (
                      <>
                        <option value="domo">Cámara Domo</option>
                        <option value="bullet">Cámara Bullet</option>
                        <option value="ptz">Cámara PTZ</option>
                        <option value="turret">Cámara Turret</option>
                      </>
                    )}
                    {manualForm.origen === 'equipo' && (
                      <>
                        <option value="switch">Switch de Red</option>
                        <option value="patch_panel">Patch Panel</option>
                        <option value="ups">UPS / Respaldo</option>
                        <option value="nvr">Grabador NVR</option>
                        <option value="otro">Otro Bastidor</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Código de Identificación <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: AP-WIFI-SALA102, CAM-ACCESO-01"
                  value={manualForm.codigo}
                  onChange={(e) => setManualForm(prev => ({ ...prev, codigo: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:ring-2 focus:ring-blue-500 uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Marca</label>
                  <input
                    type="text"
                    placeholder="Ej: Ubiquiti, Hikvision, Cisco"
                    value={manualForm.marca}
                    onChange={(e) => setManualForm(prev => ({ ...prev, marca: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Modelo</label>
                  <input
                    type="text"
                    placeholder="Ej: UniFi 6 Pro, Catalyst 9115"
                    value={manualForm.modelo}
                    onChange={(e) => setManualForm(prev => ({ ...prev, modelo: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Dirección MAC</label>
                  <input
                    type="text"
                    placeholder="AA:BB:CC:DD:EE:FF"
                    value={manualForm.mac}
                    onChange={(e) => setManualForm(prev => ({ ...prev, mac: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Dirección IP</label>
                  <input
                    type="text"
                    placeholder="192.168.1.100"
                    value={manualForm.ip}
                    onChange={(e) => setManualForm(prev => ({ ...prev, ip: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Ubicación / Referencia</label>
                <input
                  type="text"
                  placeholder="Ej: Piso 2, Pasillo Norte, Bodega Central"
                  value={manualForm.ubicacion}
                  onChange={(e) => setManualForm(prev => ({ ...prev, ubicacion: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Estado Inicial</label>
                <select
                  value={manualForm.estado_ciclo_vida}
                  onChange={(e) => setManualForm(prev => ({ ...prev, estado_ciclo_vida: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium text-slate-800 bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="en_bodega">En Bodega (Listo para usar)</option>
                  <option value="limbo">En Limbo (Pendiente de configuración)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingManual || !manualForm.codigo.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingManual ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Guardar Activo</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};