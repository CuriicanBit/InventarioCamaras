import React, { useState, useEffect } from 'react';
import { Archive, Search, Camera, Wifi, RefreshCw, X, GripVertical } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DeviceBodegaDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  onRefresh: () => void; // Para que el padre recargue datos si es necesario
}

export const DeviceBodegaDrawer: React.FC<DeviceBodegaDrawerProps> = ({ isOpen, onToggle, onRefresh }) => {
  const [dispositivos, setDispositivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchBodega = async () => {
    setLoading(true);
    try {
      // Consultamos la vista que creamos en Supabase
      const { data, error } = await supabase.from('v_cajon_bodega').select('*');
      if (error) throw error;
      setDispositivos(data || []);
    } catch (err) {
      console.error('Error cargando cajón de dispositivos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBodega();
    }
  }, [isOpen]);

  const filtered = dispositivos.filter(d => 
    d.codigo.toLowerCase().includes(search.toLowerCase()) ||
    (d.direccion_mac && d.direccion_mac.toLowerCase().includes(search.toLowerCase())) ||
    (d.categoria && d.categoria.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] bg-white shadow-2xl border-l border-slate-300 flex flex-col font-mono text-xs transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}>
      
      {/* Header */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-100 text-amber-800 rounded">
            <Archive className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-900 text-xs">Bodega de Dispositivos</span>
              <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-amber-300">
                {dispositivos.length}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-sans">APs y Cámaras pendientes de conexión</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={fetchBodega} disabled={loading} className="p-1.5 text-slate-500 hover:bg-slate-200 rounded cursor-pointer" title="Recargar bodega">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onToggle} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded cursor-pointer" title="Cerrar cajón">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-slate-100 bg-slate-50/50">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código, MAC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="p-3 space-y-2 flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center text-slate-400">Cargando dispositivos...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <Archive className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No hay dispositivos en bodega.
          </div>
        ) : (
          filtered.map(dev => (
            <div
              key={dev.id}
              draggable={true}
              onDragStart={(e) => {
                // Este es el "paquete" que viaja al Mapeo de Puertos
                e.dataTransfer.setData('application/json', JSON.stringify({
                  sourceType: 'dispositivo',
                  dispositivoId: dev.id,
                  codigo: dev.codigo,
                  tipo: dev.tipo_dispositivo
                }));
              }}
              className="group border border-slate-200 hover:border-blue-400 rounded-lg p-2.5 bg-white transition-all cursor-grab active:cursor-grabbing hover:shadow-sm"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                {dev.tipo_dispositivo === 'camara' ? (
                  <Camera className="w-4 h-4 text-blue-600" />
                ) : (
                  <Wifi className="w-4 h-4 text-indigo-600" />
                )}
                <div>
                  <span className="font-bold text-slate-900 block">{dev.codigo}</span>
                  <span className="text-[10px] text-slate-500 block">
                    {dev.categoria} {dev.marca ? `· ${dev.marca}` : ''}
                  </span>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-100 flex justify-between">
                <span>MAC: {dev.direccion_mac || 'N/A'}</span>
                <span>IP: {dev.direccion_ip || 'N/A'}</span>
              </div>
            </div>
          ))
        )}
      </div>
      
      <div className="p-3 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 text-center">
        Arrastra un dispositivo hacia un puerto del switch para conectarlo.
      </div>
    </div>
  );
};