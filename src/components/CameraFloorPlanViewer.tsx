import React, { useRef, useState } from 'react';
import { 
  VIEWBOX_WIDTH, 
  VIEWBOX_HEIGHT, 
  percentToCanvas, 
  getEventPercentage, 
  calculateCoverageRadius, 
  getCoveragePath 
} from '../utils/floorPlanUtils';
import { Piso, TipoCamara } from '../types/database';

export interface CameraPlanNode {
  id?: string;
  codigo: string;
  posicion_x: number;
  posicion_y: number;
  azimut?: number | null;
  apertura_fov?: number | null;
  alcance_metros?: number | null;
  tipo_camara?: TipoCamara | string | null;
  tipo_dispositivo?: string | null;
}

interface CameraFloorPlanViewerProps {
  piso?: Piso | null;
  edificioNombre?: string;
  activeCamera?: CameraPlanNode | null;
  otherCameras?: CameraPlanNode[];
  editable?: boolean;
  onPositionChange?: (posicionX: number, posicionY: number) => void;
  onSelectCamera?: (camera: CameraPlanNode) => void;
  showFovCones?: boolean;
  showBlindSpots?: boolean;
  showLabels?: boolean;
  containerClassName?: string;
  aspectRatioClass?: string;
}

export const CameraFloorPlanViewer: React.FC<CameraFloorPlanViewerProps> = ({
  piso,
  edificioNombre,
  activeCamera,
  otherCameras = [],
  editable = false,
  onPositionChange,
  onSelectCamera,
  showFovCones = true,
  showBlindSpots = true,
  showLabels = true,
  containerClassName = '',
  aspectRatioClass = 'aspect-[1000/600]',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Determinar posición porcentual actual del pin activo
  const activeX = activeCamera?.posicion_x ?? 50;
  const activeY = activeCamera?.posicion_y ?? 50;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || !onPositionChange || !containerRef.current) return;
    
    // Captura del puntero para mantener el seguimiento incluso si el cursor sale del contenedor
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignorar si el navegador no permite captura en ese elemento
    }

    setIsDragging(true);
    const rect = containerRef.current.getBoundingClientRect();
    const { pctX, pctY } = getEventPercentage(e.clientX, e.clientY, rect);
    onPositionChange(pctX, pctY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !editable || !onPositionChange || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { pctX, pctY } = getEventPercentage(e.clientX, e.clientY, rect);
    onPositionChange(pctX, pctY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignorar
      }
    }
  };

  const isCustomImage = Boolean(piso?.plano_url && piso.plano_url.trim().length > 5);

  // Proyectar coordenadas de cámara activa en lienzo SVG 1000x600
  const activeCanvas = percentToCanvas(activeX, activeY);
  const activeRadius = calculateCoverageRadius(activeCamera?.alcance_metros);
  const activeFov = activeCamera?.tipo_camara === 'ptz'
    ? 360
    : (activeCamera?.apertura_fov ?? (activeCamera?.tipo_camara === 'fisheye' ? 360 : 103));
  const activeAz = activeCamera?.tipo_camara === 'ptz'
    ? null
    : (activeCamera?.tipo_camara === 'fisheye' && activeFov >= 360 ? null : (activeCamera?.azimut ?? 90));
  const activePath = getCoveragePath(activeCanvas.cx, activeCanvas.cy, activeAz, activeFov, activeRadius);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative w-full ${aspectRatioClass} bg-[#f8fafc] border-2 border-slate-300 rounded-lg overflow-hidden select-none ${
        editable ? (isDragging ? 'cursor-grabbing' : 'cursor-crosshair') : ''
      } ${containerClassName}`}
      style={{ touchAction: editable ? 'none' : 'auto' }}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full h-full block"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="cadGridShared" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
          </pattern>
          <pattern id="diagonalHatchShared" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="16" stroke="#f87171" strokeWidth="2" />
          </pattern>
        </defs>

        {/* Fondo de cuadrícula milimetrada CAD */}
        <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="url(#cadGridShared)" />

        {/* Capa de imagen de plano arquitectónico oficial si existe */}
        {isCustomImage && piso?.plano_url ? (
          <image
            href={piso.plano_url}
            xlinkHref={piso.plano_url}
            x="0"
            y="0"
            width={VIEWBOX_WIDTH}
            height={VIEWBOX_HEIGHT}
            preserveAspectRatio="none"
            opacity="0.95"
          />
        ) : (
          /* Geometría CAD Vectorial estándar de respaldo */
          <g>
            {/* Aula 201 */}
            <rect x="40" y="40" width="180" height="150" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
            <text x="130" y="110" fontSize="14" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">
              {piso?.nombre || 'PISO'} - AULA 201
            </text>
            <text x="130" y="132" fontSize="11" fontFamily="monospace" fill="#94a3b8" textAnchor="middle">
              Capacidad: 35 Est.
            </text>

            {/* Lab Redes 202 */}
            <rect x="235" y="40" width="240" height="150" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
            <text x="355" y="110" fontSize="14" fontFamily="monospace" fill="#475569" textAnchor="middle" fontWeight="bold">
              LAB DE REDES Y TELECOM 202
            </text>
            <text x="355" y="132" fontSize="11" fontFamily="monospace" fill="#3b82f6" textAnchor="middle">
              Área de Alta Seguridad IP
            </text>

            {/* Sala Técnica IDF 204 */}
            <rect x="490" y="40" width="120" height="150" fill="#eff6ff" stroke="#3b82f6" strokeWidth="2" />
            <text x="550" y="105" fontSize="13" fontFamily="monospace" fill="#1e40af" textAnchor="middle" fontWeight="bold">
              SALA IDF
            </text>
            <text x="550" y="128" fontSize="11" fontFamily="monospace" fill="#60a5fa" textAnchor="middle">
              RCK-ENG-P2
            </text>

            {/* Aula 203 */}
            <rect x="625" y="40" width="180" height="150" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
            <text x="715" y="110" fontSize="14" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">
              AULA 203
            </text>
            <text x="715" y="132" fontSize="11" fontFamily="monospace" fill="#94a3b8" textAnchor="middle">
              Capacidad: 40 Est.
            </text>

            {/* Escalera Norte */}
            <rect x="820" y="40" width="140" height="150" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2" />
            <text x="890" y="115" fontSize="13" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">
              ESCALERA NORTE
            </text>

            {/* Pasillo Central Distribuidor */}
            <rect x="40" y="210" width="920" height="90" fill="#f0f7ff" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="6,4" />
            <text x="500" y="260" fontSize="15" fontFamily="monospace" fill="#2563eb" fontWeight="bold" textAnchor="middle">
              PASILLO CENTRAL DISTRIBUIDOR · {piso?.nombre?.toUpperCase() || 'PISO'} {edificioNombre ? `— ${edificioNombre.toUpperCase()}` : ''}
            </text>

            {/* Aula Multimedia 204 */}
            <rect x="40" y="320" width="220" height="240" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
            <text x="150" y="435" fontSize="14" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">
              AULA MULTIMEDIA 204
            </text>

            {/* Escalera Emergencia B (Punto Ciego #1) */}
            <rect x="275" y="320" width="160" height="240" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
            {showBlindSpots && (
              <rect x="280" y="330" width="150" height="100" fill="url(#diagonalHatchShared)" stroke="#ef4444" strokeWidth="1.5" />
            )}
            <text x="355" y="480" fontSize="13" fontFamily="monospace" fill="#dc2626" textAnchor="middle" fontWeight="bold">
              ESCALERA EMERGENCIA B
            </text>
            {showBlindSpots && (
              <text x="355" y="385" fontSize="12" fontFamily="monospace" fill="#b91c1c" textAnchor="middle" fontWeight="bold">
                P. CIEGO #1
              </text>
            )}

            {/* Hall Estudiantes */}
            <rect x="450" y="320" width="250" height="240" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
            <text x="575" y="435" fontSize="14" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">
              HALL ESTUDIANTES & CO-WORK
            </text>

            {/* Depto. Investigación */}
            <rect x="715" y="320" width="245" height="240" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
            <text x="837" y="435" fontSize="14" fontFamily="monospace" fill="#64748b" textAnchor="middle" fontWeight="bold">
              DEPTO. INVESTIGACIÓN
            </text>
          </g>
        )}

        {/* Proyección de Conos FOV de Otras Cámaras en el Piso */}
        {showFovCones && otherCameras.map(cam => {
          const pt = percentToCanvas(cam.posicion_x, cam.posicion_y);
          const r = calculateCoverageRadius(cam.alcance_metros);
          const isPtz = cam.tipo_camara === 'ptz';
          const isFisheye = cam.tipo_camara === 'fisheye';
          const fov = isPtz ? 360 : (cam.apertura_fov ?? (isFisheye ? 360 : 103));
          const az = isPtz ? null : (isFisheye && fov >= 360 ? null : (cam.azimut ?? null));
          const path = getCoveragePath(pt.cx, pt.cy, az, fov, r);

          return (
            <path
              key={`fov-${cam.codigo || cam.id}`}
              d={path}
              fill="rgba(96, 165, 250, 0.18)"
              stroke="#3b82f6"
              strokeWidth="1.2"
              strokeDasharray={fov >= 360 ? 'none' : '3,3'}
            />
          );
        })}

        {/* Proyección de Cono FOV de Cámara Activa / Editada */}
        {showFovCones && activeCamera && (
          <path
            key="fov-active"
            d={activePath}
            fill="rgba(37, 99, 235, 0.32)"
            stroke="#1d4ed8"
            strokeWidth="2"
            strokeDasharray={activeFov >= 360 ? 'none' : '4,3'}
          />
        )}

        {/* Nodos de Otras Cámaras */}
        {otherCameras.map(cam => {
          const pt = percentToCanvas(cam.posicion_x, cam.posicion_y);
          return (
            <g
              key={`node-${cam.codigo || cam.id}`}
              className={onSelectCamera ? 'cursor-pointer' : ''}
              onClick={(e) => {
                if (onSelectCamera) {
                  e.stopPropagation();
                  onSelectCamera(cam);
                }
              }}
            >
              <circle
                cx={pt.cx}
                cy={pt.cy}
                r="11"
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth="2.5"
              />
              <circle cx={pt.cx} cy={pt.cy} r="4" fill="#ffffff" />
              {showLabels && (
                <g>
                  <rect
                    x={pt.cx - 50}
                    y={pt.cy - 30}
                    width="100"
                    height="18"
                    fill="rgba(255, 255, 255, 0.95)"
                    stroke="#94a3b8"
                    strokeWidth="1"
                    rx="3"
                  />
                  <text
                    x={pt.cx}
                    y={pt.cy - 17}
                    fontSize="10"
                    fontFamily="monospace"
                    fill="#1e293b"
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    {cam.codigo}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Nodo de Cámara Activa (con indicador interactivo y halo de arrastre) */}
        {activeCamera && (
          <g key="node-active" className={editable ? 'cursor-grab active:cursor-grabbing' : ''}>
            {/* Halo pulsante al editar o seleccionar */}
            <circle
              cx={activeCanvas.cx}
              cy={activeCanvas.cy}
              r="22"
              fill="rgba(37, 99, 235, 0.2)"
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeDasharray="3,3"
            />
            {/* Cuerpo del pin activo */}
            <circle
              cx={activeCanvas.cx}
              cy={activeCanvas.cy}
              r="13"
              fill="#1d4ed8"
              stroke="#ffffff"
              strokeWidth="3"
            />
            <circle cx={activeCanvas.cx} cy={activeCanvas.cy} r="5" fill="#ffffff" />

            {/* Flecha o marca de orientación azimut si aplica */}
            {activeAz !== null && activeFov < 360 && (
              <line
                x1={activeCanvas.cx}
                y1={activeCanvas.cy}
                x2={activeCanvas.cx + Math.cos(((activeAz - 90) * Math.PI) / 180) * 26}
                y2={activeCanvas.cy + Math.sin(((activeAz - 90) * Math.PI) / 180) * 26}
                stroke="#1d4ed8"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}

            {/* Etiqueta identificadora */}
            {showLabels && (
              <g>
                <rect
                  x={activeCanvas.cx - 55}
                  y={activeCanvas.cy - 34}
                  width="110"
                  height="20"
                  fill="rgba(30, 64, 175, 0.95)"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  rx="3"
                />
                <text
                  x={activeCanvas.cx}
                  y={activeCanvas.cy - 20}
                  fontSize="11"
                  fontFamily="monospace"
                  fill="#ffffff"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {activeCamera.codigo}
                </text>
              </g>
            )}
          </g>
        )}
      </svg>

      {/* Indicador flotante en modo edición */}
      {editable && (
        <div className="absolute top-2 left-2 bg-slate-900/90 text-white font-mono text-[10px] px-2.5 py-1 rounded shadow-md pointer-events-none flex items-center gap-2 z-10">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span>Posición: X={activeX}%, Y={activeY}%</span>
          <span className="text-slate-400">·</span>
          <span className="text-blue-300">Arrastre o haga clic para reubicar</span>
        </div>
      )}

      {/* Leyenda de simbología */}
      <div className="absolute bottom-2 left-2 bg-slate-900/85 text-white font-mono text-[9px] px-2 py-0.8 rounded pointer-events-none flex items-center gap-2.5 z-10">
        <span className="flex items-center gap-1 text-blue-300">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Cámara
        </span>
        <span className="flex items-center gap-1 text-indigo-300">
          <span className="w-1.5 h-1.5 bg-blue-400/50 border border-blue-400" /> Cobertura FOV
        </span>
        {showBlindSpots && (
          <span className="flex items-center gap-1 text-red-300">
            <span className="w-1.5 h-1.5 bg-red-400/50 border border-red-400" /> Punto Ciego
          </span>
        )}
      </div>
    </div>
  );
};
