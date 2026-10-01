import React, { useState } from 'react';
import { 
  Archive, 
  Search, 
  RefreshCw, 
  GripVertical, 
  Server, 
  Cpu, 
  HardDrive, 
  Zap, 
  Network, 
  Layers, 
  ChevronRight, 
  ChevronLeft,
  ArrowDownToLine,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Equipo, TipoEquipo } from '../types/database';
import { inferUHeight, findFirstAvailableUSlot } from '../utils/rackUnits';

interface RackBodegaDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  bodegaEquipos: Equipo[];
  loadingBodega: boolean;
  onRefreshBodega: () => void;
  onMountEquipo: (equipo: Equipo, targetUSuperior: number, uHeight: number) => void;
  occupiedSlotsMap: Record<number, Equipo>;
  totalU: number;
  onDragStartBodegaItem: (equipo: Equipo, uHeight: number) => void;
  onDragEndBodegaItem: () => void;
  isDraggingFromRack: boolean;
  onDropToBodega: () => void;
}

export const RackBodegaDrawer: React.FC<RackBodegaDrawerProps> = ({
  isOpen,
  onToggle,
  bodegaEquipos,
  loadingBodega,
  onRefreshBodega,
  onMountEquipo,
  occupiedSlotsMap,
  totalU,
  onDragStartBodegaItem,
  onDragEndBodegaItem,
  isDraggingFromRack,
  onDropToBodega,
}) => {
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [bodegaDragOver, setBodegaDragOver] = useState(false);

  const getTipoIcon = (tipo: TipoEquipo | string) => {
    switch (tipo) {
      case 'switch':
        return <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />;
      case 'patch_panel':
        return <Cpu className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
      case 'nvr':
        return <HardDrive className="w-3.5 h-3.5 text-indigo-500 shrink-0" />;
      case 'ups':
        return <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
      case 'mufa':
        return <Network className="w-3.5 h-3.5 text-cyan-500 shrink-0" />;
      default:
        return <Server className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
    }
  };

  const filteredEquipos = bodegaEquipos.filter(eq => {
    const matchesSearch = 
      (eq.codigo && eq.codigo.toLowerCase().includes(search.toLowerCase())) ||
      (eq.marca && eq.marca.toLowerCase().includes(search.toLowerCase())) ||
      (eq.modelo && eq.modelo.toLowerCase().includes(search.toLowerCase())) ||
      (eq.numero_serie && eq.numero_serie.toLowerCase().includes(search.toLowerCase()));

    const matchesTipo = filterTipo === 'all' || eq.tipo === filterTipo;
    return matchesSearch && matchesTipo;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden flex flex-col font-mono text-xs">
      {/* Top Header */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-100 text-amber-800 rounded">
            <Archive className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-900 text-xs">Cajón de Bodega</span>
              <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-amber-300">
                {bodegaEquipos.length}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-sans">
              Equipos disponibles para montar en rack
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onRefreshBodega}
            disabled={loadingBodega}
            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition-colors"
            title="Refrescar Bodega"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingBodega ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dropzone de Desmontaje (Visible cuando se arrastra un equipo desde el Rack) */}
      {isDraggingFromRack && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setBodegaDragOver(true);
          }}
          onDragLeave={() => setBodegaDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setBodegaDragOver(false);
            onDropToBodega();
          }}
          className={`p-4 m-3 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center transition-all animate-pulse ${
            bodegaDragOver
              ? 'border-amber-500 bg-amber-100/90 text-amber-900 scale-102 shadow-md'
              : 'border-amber-400 bg-amber-50 text-amber-800'
          }`}
        >
          <Archive className="w-6 h-6 mb-1 text-amber-600 animate-bounce" />
          <span className="font-bold text-xs uppercase tracking-wide">
            Soltar aquí para Desmontar
          </span>
          <span className="text-[10px] text-amber-700 font-sans mt-0.5">
            El equipo pasará de estado "instalado" a "en_bodega"
          </span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="p-3 border-b border-slate-100 space-y-2 bg-slate-50/50">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código, marca, modelo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Quick Type Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] scrollbar-thin">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'switch', label: 'Switches' },
            { id: 'patch_panel', label: 'Patch Panels' },
            { id: 'organizador', label: 'Organizadores' },
            { id: 'nvr', label: 'NVRs' },
            { id: 'ups', label: 'UPS' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterTipo(f.id)}
              className={`px-2 py-0.5 rounded whitespace-nowrap border transition-colors ${
                filterTipo === f.id
                  ? 'bg-blue-600 text-white border-blue-600 font-bold'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Equipment List */}
      <div className="p-3 space-y-2 max-h-[440px] overflow-y-auto">
        {loadingBodega ? (
          <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
            <span className="text-xs">Cargando equipos de bodega...</span>
          </div>
        ) : filteredEquipos.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs px-4">
            <Archive className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
            {search ? (
              <p>No se encontraron equipos en bodega con "{search}".</p>
            ) : (
              <p>No hay equipos disponibles en bodega en este momento.</p>
            )}
          </div>
        ) : (
          filteredEquipos.map(eq => {
            const uHeight = inferUHeight(eq.modelo_rel?.nombre || eq.modelo, eq.tipo);
            const firstAvailableSlot = findFirstAvailableUSlot(totalU, uHeight, occupiedSlotsMap);

            return (
              <div
                key={eq.id}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', JSON.stringify({
                    id: eq.id,
                    source: 'bodega',
                    codigo: eq.codigo,
                    tipo: eq.tipo,
                    uHeight: uHeight
                  }));
                  onDragStartBodegaItem(eq, uHeight);
                }}
                onDragEnd={() => {
                  onDragEndBodegaItem();
                }}
                className="group border border-slate-200 hover:border-blue-400 rounded-lg p-2.5 bg-white hover:bg-blue-50/30 transition-all shadow-xs cursor-grab active:cursor-grabbing hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <div className="text-slate-400 group-hover:text-blue-500 cursor-grab shrink-0" title="Arrastrar al rack">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    {getTipoIcon(eq.tipo)}
                    <div className="truncate">
                      <span className="font-bold text-slate-900 group-hover:text-blue-700">
                        {eq.codigo}
                      </span>
                      <span className="ml-1.5 text-[10px] text-slate-500 uppercase font-sans">
                        {eq.tipo}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                      {uHeight}U
                    </span>
                  </div>
                </div>

                <div className="mt-1.5 pl-5 text-[11px] text-slate-600 font-sans flex items-center justify-between">
                  <span className="truncate">
                    {eq.marca_rel?.nombre || eq.marca || ''} {eq.modelo_rel?.nombre || eq.modelo || 'Sin Modelo'}
                  </span>
                </div>

                {/* Bottom Action Footer */}
                <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 font-sans italic flex items-center gap-1">
                    Arrastra hacia el bastidor
                  </span>

                  {firstAvailableSlot ? (
                    <button
                      type="button"
                      onClick={() => onMountEquipo(eq, firstAvailableSlot, uHeight)}
                      className="px-2 py-0.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white rounded border border-blue-200 hover:border-blue-600 transition-colors flex items-center gap-1 font-semibold"
                      title={`Montar automáticamente en U${firstAvailableSlot - uHeight + 1} - U${firstAvailableSlot}`}
                    >
                      <ArrowDownToLine className="w-3 h-3" />
                      <span>Montar en U{firstAvailableSlot}</span>
                    </button>
                  ) : (
                    <span className="text-amber-600 flex items-center gap-0.5 text-[9px]">
                      <AlertCircle className="w-3 h-3" /> Sin espacio
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Footer Info */}
      <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 font-sans flex items-center justify-between">
        <span>💡 Arrastra hacia una U libre del rack</span>
        <span>{filteredEquipos.length} equipos</span>
      </div>
    </div>
  );
};
