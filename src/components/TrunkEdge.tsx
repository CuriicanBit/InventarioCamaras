import React, { memo } from 'react';
import { BaseEdge, EdgeProps, getBezierPath, Position } from '@xyflow/react';

export interface TrunkEdgeData {
  enlaceId: string;
  esPrincipal: boolean;
  saltaJerarquia?: boolean;
  superiorPuerto?: number;
  inferiorPuerto?: number;
  origenPuerto?: number;
  destinoPuerto?: number;
  curveOffset?: number;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  [key: string]: unknown;
}

export const TrunkEdge: React.FC<EdgeProps> = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected
}) => {
  const edgeData = (data || {}) as TrunkEdgeData;
  const esPrincipal = edgeData.esPrincipal ?? true;
  const saltaJerarquia = edgeData.saltaJerarquia ?? false;
  const isHighlighted = edgeData.isHighlighted || selected;
  const isDimmed = edgeData.isDimmed && !isHighlighted;
  const curveOffset = edgeData.curveOffset || 0;
  const superiorPuerto = edgeData.superiorPuerto ?? edgeData.origenPuerto ?? 0;
  const inferiorPuerto = edgeData.inferiorPuerto ?? edgeData.destinoPuerto ?? 0;

  const isHorizontal = sourcePosition === Position.Left || sourcePosition === Position.Right;

  // Compute Bezier path, adjusting control points if curveOffset is set
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY: sourceY + (!isHorizontal ? (curveOffset ? curveOffset * 0.2 : 0) : (curveOffset ? curveOffset * 0.4 : 0)),
    targetX,
    targetY: targetY - (!isHorizontal ? (curveOffset ? curveOffset * 0.2 : 0) : (curveOffset ? curveOffset * -0.4 : 0)),
    sourcePosition,
    targetPosition,
    curvature: 0.35 + (curveOffset ? Math.abs(curveOffset) * 0.005 : 0)
  });

  // Base styling for Principal vs Respaldo vs Salta Jerarquía
  // "dibuja los enlaces con salta_jerarquia = true en color rosa/rojo (manteniendo sólido para Principal y punteado para Respaldo) con una pequeña etiqueta 'Salta Distribución'"
  let strokeColor = saltaJerarquia
    ? (esPrincipal ? '#e11d48' : '#f43f5e') // rose-600 / rose-500
    : (esPrincipal ? '#2563eb' : '#d97706'); // blue-600 vs amber-600
  let strokeDasharray = esPrincipal ? undefined : '5,5';
  let strokeWidth = esPrincipal ? 2.5 : 2;

  if (isHighlighted) {
    strokeColor = saltaJerarquia
      ? (esPrincipal ? '#be123c' : '#e11d48') // darker rose
      : (esPrincipal ? '#1d4ed8' : '#b45309');
    strokeWidth = 3.5;
  }

  return (
    <g className={`transition-opacity duration-200 ${isDimmed ? 'opacity-20' : 'opacity-100'}`}>
      {/* Invisible wider path for easier clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="cursor-pointer"
      />
      {/* Actual visible edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
          filter: isHighlighted
            ? (saltaJerarquia ? 'drop-shadow(0 0 4px rgba(225,29,72,0.5))' : 'drop-shadow(0 0 4px rgba(37,99,235,0.4))')
            : undefined
        }}
      />
      {/* Salta Distribución permanent small badge along edge */}
      {saltaJerarquia && (
        <foreignObject
          width={130}
          height={24}
          x={labelX - 65}
          y={labelY - (isHighlighted || selected ? 24 : 12)}
          className="pointer-events-none"
        >
          <div className="flex items-center justify-center h-full">
            <span className="px-1.5 py-0.5 rounded text-[8.5px] font-sans font-bold bg-rose-50 text-rose-700 shadow-2xs border border-rose-300">
              Salta Distribución
            </span>
          </div>
        </foreignObject>
      )}
      {/* SFP Ports mini badges at center if highlighted or selected */}
      {(isHighlighted || selected) && (
        <foreignObject
          width={130}
          height={26}
          x={labelX - 65}
          y={labelY + (saltaJerarquia ? 4 : -13)}
          className="pointer-events-none"
        >
          <div className="flex items-center justify-center h-full">
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-white/95 text-slate-800 shadow-sm border border-slate-300">
              SFP {superiorPuerto} ↔ {inferiorPuerto}
            </span>
          </div>
        </foreignObject>
      )}
    </g>
  );
});

TrunkEdge.displayName = 'TrunkEdge';
