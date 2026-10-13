import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { 
  Server, 
  MapPin, 
  Radio, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  Network
} from 'lucide-react';
import { TopologiaSwitchVista } from '../types/database';

export interface SwitchNodeData {
  switchData: TopologiaSwitchVista;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  isSelected?: boolean;
  hasChildren?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (nodeId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  [key: string]: unknown;
}

export const SwitchNode: React.FC<{ data: SwitchNodeData; selected?: boolean }> = memo(({ data, selected }) => {
  const sw = data.switchData;
  const isSelected = selected || data.isSelected;
  const isDimmed = data.isDimmed && !isSelected && !data.isHighlighted;
  const isHighlighted = data.isHighlighted;
  const hasChildren = data.hasChildren;
  const isCollapsed = data.isCollapsed;

  // Normalized role color bar and styling
  const rawRole = (sw.rol_red || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  
  let roleBadge = {
    label: 'Sin rol',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-300',
    stripeBg: 'bg-slate-400',
    cardBorder: 'border-slate-300'
  };

  if (rawRole === 'core') {
    roleBadge = {
      label: 'Core',
      bg: 'bg-purple-100',
      text: 'text-purple-800',
      border: 'border-purple-300',
      stripeBg: 'bg-purple-600',
      cardBorder: 'border-purple-400'
    };
  } else if (rawRole === 'distribucion') {
    roleBadge = {
      label: 'Distribución',
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      border: 'border-blue-300',
      stripeBg: 'bg-blue-600',
      cardBorder: 'border-blue-400'
    };
  } else if (rawRole === 'acceso') {
    roleBadge = {
      label: 'Acceso',
      bg: 'bg-emerald-100',
      text: 'text-emerald-800',
      border: 'border-emerald-300',
      stripeBg: 'bg-emerald-600',
      cardBorder: 'border-emerald-400'
    };
  }

  const sfpConectados = sw.sfp_conectados ?? 0;
  const puertosSfp = sw.puertos_sfp ?? 0;
  const sinEnlaces = (sw.enlaces ?? 0) === 0;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        data.onSelectNode?.(sw.id);
      }}
      className={`relative w-64 rounded-xl bg-white text-slate-800 shadow-md transition-all duration-200 select-none cursor-pointer border ${
        isSelected
          ? 'ring-2 ring-blue-600 ring-offset-2 border-blue-600 shadow-xl scale-[1.02] z-30'
          : isHighlighted
          ? 'ring-2 ring-amber-500 ring-offset-1 border-amber-500 shadow-lg scale-[1.01] z-20'
          : roleBadge.cardBorder
      } ${isDimmed ? 'opacity-25 grayscale-[30%] pointer-events-auto' : 'opacity-100'}`}
    >
      {/* Top color stripe by role */}
      <div className={`h-2 w-full rounded-t-xl ${roleBadge.stripeBg}`} />

      {/* Card Content */}
      <div className="p-3 space-y-2">
        {/* Header: Icon, Code & Role Badge */}
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-1.5 rounded-lg ${roleBadge.bg} ${roleBadge.text} border ${roleBadge.border} shrink-0`}>
              <Server className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="font-mono font-bold text-xs text-slate-900 block truncate" title={sw.codigo}>
                {sw.codigo}
              </span>
              <span className="font-mono text-[10px] text-slate-400 block truncate" title={`${sw.marca ? sw.marca + ' ' : ''}${sw.modelo || 'Sin modelo'}`}>
                {sw.marca ? `${sw.marca} ` : ''}{sw.modelo || 'Switch'}
              </span>
            </div>
          </div>

          <span className={`inline-flex items-center text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${roleBadge.bg} ${roleBadge.text} ${roleBadge.border}`}>
            {roleBadge.label}
          </span>
        </div>

        {/* Location row with Pin Icon */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-mono bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate" title={sw.ubicacion || 'Sin ubicación'}>
            {sw.ubicacion || 'Sin ubicación'}
          </span>
        </div>

        {/* Footer: SFP Counter & Sin Enlaces warning */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 font-mono text-[10px]">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 font-medium">
            <Radio className="w-2.5 h-2.5 text-amber-600" />
            <span>SFP {sfpConectados}/{puertosSfp}</span>
          </span>

          {sinEnlaces ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-medium" title="Este switch no tiene enlaces troncales configurados">
              <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
              <span>Sin enlace</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-slate-500 font-mono text-[10px]">
              <Network className="w-2.5 h-2.5 text-slate-400" />
              <span>{sw.enlaces} troncal{sw.enlaces !== 1 ? 'es' : ''}</span>
            </span>
          )}
        </div>
      </div>

      {/* Collapse / Expand Button for branch (mind map style) */}
      {hasChildren && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onToggleCollapse?.(sw.id);
          }}
          className={`absolute -bottom-3.5 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border border-slate-300 shadow-sm flex items-center justify-center text-slate-600 hover:text-blue-600 hover:border-blue-400 transition-colors z-20 cursor-pointer ${
            isCollapsed ? 'bg-amber-50 text-amber-700 border-amber-300' : ''
          }`}
          title={isCollapsed ? 'Expandir rama' : 'Contraer rama'}
        >
          {isCollapsed ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      {/* Top Connection Handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-3 !h-3 !bg-slate-500 hover:!bg-blue-600 !border-2 !border-white !rounded-full transition-colors"
      />

      {/* Left Connection Handles (source & target) */}
      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        className="!w-3 !h-3 !bg-slate-500 hover:!bg-blue-600 !border-2 !border-white !rounded-full transition-colors"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className="!w-3 !h-3 !bg-slate-500 hover:!bg-blue-600 !border-2 !border-white !rounded-full transition-colors"
      />

      {/* Right Connection Handles (source & target) */}
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className="!w-3 !h-3 !bg-slate-500 hover:!bg-blue-600 !border-2 !border-white !rounded-full transition-colors"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        className="!w-3 !h-3 !bg-slate-500 hover:!bg-blue-600 !border-2 !border-white !rounded-full transition-colors"
      />

      {/* Bottom Connection Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-3 !h-3 !bg-slate-500 hover:!bg-blue-600 !border-2 !border-white !rounded-full transition-colors"
      />
    </div>
  );
});

SwitchNode.displayName = 'SwitchNode';
