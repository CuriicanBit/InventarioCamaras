export const VIEWBOX_WIDTH = 1000;
export const VIEWBOX_HEIGHT = 600;

/**
 * Converts percentage coordinates (0-100) to SVG canvas coordinates (1000x600).
 */
export function percentToCanvas(pctX: number, pctY: number): { cx: number; cy: number } {
  return {
    cx: (pctX / 100) * VIEWBOX_WIDTH,
    cy: (pctY / 100) * VIEWBOX_HEIGHT
  };
}

/**
 * Calculates percentage coordinates from a mouse/pointer event relative to a bounding client rect.
 */
export function getEventPercentage(clientX: number, clientY: number, rect: DOMRect): { pctX: number; pctY: number } {
  if (rect.width <= 0 || rect.height <= 0) {
    return { pctX: 50, pctY: 50 };
  }
  const rawX = ((clientX - rect.left) / rect.width) * 100;
  const rawY = ((clientY - rect.top) / rect.height) * 100;
  const pctX = Math.max(0, Math.min(100, Math.round(rawX * 10) / 10));
  const pctY = Math.max(0, Math.min(100, Math.round(rawY * 10) / 10));
  return { pctX, pctY };
}

/**
 * Calculates the visual coverage radius in SVG units from distance in meters.
 */
export function calculateCoverageRadius(alcanceMetros?: number | null): number {
  if (!alcanceMetros || alcanceMetros <= 0) {
    return 80;
  }
  return Math.min(140, Math.max(40, alcanceMetros * 4.5));
}

/**
 * Generates an SVG path for camera field of view coverage.
 * - Circle path when fov >= 360 (PTZ or ceiling fisheye)
 * - Arc sector oriented by azimuth and fov for directional cameras
 */
export function getCoveragePath(
  cx: number,
  cy: number,
  az: number | null,
  fov: number,
  r: number
): string {
  if (fov >= 360) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
  }

  const safeAz = az ?? 90;
  const radStart = ((safeAz - fov / 2 - 90) * Math.PI) / 180;
  const radEnd = ((safeAz + fov / 2 - 90) * Math.PI) / 180;

  const x2 = cx + Math.cos(radStart) * r;
  const y2 = cy + Math.sin(radStart) * r;
  const x3 = cx + Math.cos(radEnd) * r;
  const y3 = cy + Math.sin(radEnd) * r;

  const largeArcFlag = fov > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x2} ${y2} A ${r} ${r} 0 ${largeArcFlag} 1 ${x3} ${y3} Z`;
}
