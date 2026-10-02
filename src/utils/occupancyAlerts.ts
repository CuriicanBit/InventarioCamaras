import { Equipo, Camara } from '../types/database';
import { parseSwitchPortNumber } from '../components/PatchPanelPortMap';

export type OccupancyStatus = 'optimo' | 'alerta' | 'critico';

export interface EquipmentOccupancyInfo {
  equipoId: string;
  equipoCodigo: string;
  tipo: string;
  totalCapacity: number;
  occupiedCount: number;
  availableCount: number;
  percentage: number;
  status: OccupancyStatus;
  statusLabel: string;
  badgeBgClass: string;
  badgeTextClass: string;
  badgeBorderClass: string;
  barColorClass: string;
  recommendation: string;
  needsExpansion: boolean;
  connectedCameras: {
    camera: Camara;
    portOrChannel: number | string;
    details: string;
  }[];
  connectedUplinks: {
    nvrId: string;
    nvrCodigo?: string;
    portNum: number;
  }[];
}

/**
 * Returns color-coded status based on user-defined standard threshold:
 * Target: ~75%
 * - < 73% (<= 73%): Verde (Holgura)
 * - 74% a 77%: Amarillo (Alerta límite)
 * - >= 78%: Rojo (Crítico / Sobrecapacidad - Ampliar inventario)
 */
export function getOccupancyStatus(percentage: number): {
  status: OccupancyStatus;
  label: string;
  badgeBgClass: string;
  badgeTextClass: string;
  badgeBorderClass: string;
  barColorClass: string;
  recommendation: string;
  needsExpansion: boolean;
} {
  if (percentage >= 78) {
    return {
      status: 'critico',
      label: 'Crítico (>=78%)',
      badgeBgClass: 'bg-rose-50 text-rose-800 border-rose-300',
      badgeTextClass: 'text-rose-700',
      badgeBorderClass: 'border-rose-400',
      barColorClass: 'bg-rose-600',
      recommendation: 'Sobrecapacidad detectada. Se recomienda prioritariamente ampliar inventario adquiriendo un nuevo dispositivo.',
      needsExpansion: true,
    };
  }

  if (percentage >= 74) {
    return {
      status: 'alerta',
      label: 'Alerta (74-77%)',
      badgeBgClass: 'bg-amber-50 text-amber-900 border-amber-300',
      badgeTextClass: 'text-amber-800',
      badgeBorderClass: 'border-amber-400',
      barColorClass: 'bg-amber-500',
      recommendation: 'Próximo al límite del 75%. Monitorear de cerca y cotizar ampliación preventiva en las próximas adiciones.',
      needsExpansion: false,
    };
  }

  return {
    status: 'optimo',
    label: 'Normal (<73%)',
    badgeBgClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    badgeTextClass: 'text-emerald-700',
    badgeBorderClass: 'border-emerald-400',
    barColorClass: 'bg-emerald-500',
    recommendation: 'Capacidad operativa holgada. No requiere ampliación de inventario en este momento.',
    needsExpansion: false,
  };
}

/**
 * Calculates equipment capacity, occupancy, connected cameras/uplinks, and alert status
 */
export function calculateEquipmentOccupancy(
  equipo: Equipo,
  camaras: Camara[],
  nvrUplinks?: Record<string, any>
): EquipmentOccupancyInfo {
  const isSwitch = equipo.tipo === 'switch';
  const isPatchPanel = equipo.tipo === 'patch_panel';
  const isNvr = equipo.tipo === 'nvr';

  let totalCapacity = 0;
  if (isSwitch || isPatchPanel) {
    totalCapacity = Number(equipo.puertos_totales ?? equipo.modelo_rel?.puertos_default ?? 24);
  } else if (isNvr) {
    totalCapacity = Number(equipo.canales_totales ?? equipo.modelo_rel?.canales_default ?? 16);
  } else {
    totalCapacity = Number(equipo.puertos_totales ?? equipo.canales_totales ?? 0);
  }

  const connectedCameras: {
    camera: Camara;
    portOrChannel: number | string;
    details: string;
  }[] = [];

  const occupiedPortSet = new Set<string>();

  camaras.forEach(cam => {
    if (isSwitch && cam.switch_id === equipo.id) {
      const portNum = parseSwitchPortNumber(cam.puerto_switch);
      const portLabel = cam.puerto_switch || (portNum ? `P${portNum}` : 'P?');
      occupiedPortSet.add(String(portNum ?? portLabel));
      connectedCameras.push({
        camera: cam,
        portOrChannel: portLabel,
        details: `Cámara ${cam.codigo} (${cam.modelo || cam.tipo_dispositivo || 'CCTV'})${cam.direccion_ip ? ` · IP ${cam.direccion_ip}` : ''}`
      });
    } else if (isPatchPanel && cam.patch_panel_id === equipo.id) {
      const portNum = cam.puerto_patch;
      if (portNum) {
        occupiedPortSet.add(String(portNum));
      }
      connectedCameras.push({
        camera: cam,
        portOrChannel: portNum ? `P${portNum}` : 'P?',
        details: `Cámara ${cam.codigo} (${cam.modelo || 'CCTV'})${cam.switch_id ? ' · Cruzada a Switch' : ''}`
      });
    } else if (isNvr && cam.nvr_id === equipo.id) {
      const chNum = cam.canal_nvr;
      if (chNum) {
        occupiedPortSet.add(String(chNum));
      }
      connectedCameras.push({
        camera: cam,
        portOrChannel: chNum ? `CH ${chNum}` : 'CH ?',
        details: `Cámara ${cam.codigo} (${cam.modelo || 'CCTV'})${cam.direccion_ip ? ` · ${cam.direccion_ip}` : ''}`
      });
    }
  });

  const connectedUplinks: {
    nvrId: string;
    nvrCodigo?: string;
    portNum: number;
  }[] = [];

  if (nvrUplinks && (isSwitch || isPatchPanel)) {
    Object.entries(nvrUplinks).forEach(([nvrId, conn]: [string, any]) => {
      if (conn?.targetEquipoId === equipo.id && conn?.targetPortNum) {
        occupiedPortSet.add(String(conn.targetPortNum));
        connectedUplinks.push({
          nvrId,
          portNum: conn.targetPortNum
        });
      }
    });
  }

  const occupiedCount = occupiedPortSet.size;
  const availableCount = Math.max(0, totalCapacity - occupiedCount);
  const percentage = totalCapacity > 0 ? Math.round((occupiedCount / totalCapacity) * 100) : 0;

  const statusInfo = getOccupancyStatus(percentage);

  return {
    equipoId: equipo.id,
    equipoCodigo: equipo.codigo,
    tipo: equipo.tipo,
    totalCapacity,
    occupiedCount,
    availableCount,
    percentage,
    status: statusInfo.status,
    statusLabel: statusInfo.label,
    badgeBgClass: statusInfo.badgeBgClass,
    badgeTextClass: statusInfo.badgeTextClass,
    badgeBorderClass: statusInfo.badgeBorderClass,
    barColorClass: statusInfo.barColorClass,
    recommendation: statusInfo.recommendation,
    needsExpansion: statusInfo.needsExpansion,
    connectedCameras: connectedCameras.sort((a, b) => {
      const numA = typeof a.portOrChannel === 'number' ? a.portOrChannel : parseInt(String(a.portOrChannel).replace(/\D/g, ''), 10) || 0;
      const numB = typeof b.portOrChannel === 'number' ? b.portOrChannel : parseInt(String(b.portOrChannel).replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    }),
    connectedUplinks
  };
}
