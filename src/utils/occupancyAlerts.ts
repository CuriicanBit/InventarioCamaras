import { Equipo, Camara, PuntoRed } from '../types/database';
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
 * Calculates equipment capacity, occupancy, connected devices/uplinks, and alert status.
 * CRITERIO ESTRICTO DE "OCUPADO" FÍSICO:
 * - Switch: Sólo cuenta si existe una cámara (camaras con switch_id+puerto) O un punto de red
 *   (puntos_red con puerto_switch_id o switch_id) conectado. La configuración de VLAN o Uso NO cuenta como ocupado.
 * - Patch Panel: Conexión física con cámara (patch_panel_id+puerto) o punto de red (patch_panel_id+puerto).
 * - NVR: Canales con cámaras asignadas.
 */
export function calculateEquipmentOccupancy(
  equipo: Equipo,
  camaras: Camara[],
  nvrUplinks?: Record<string, any>,
  puntosRed?: PuntoRed[],
  switchPortsOccupancy?: any[] // Filas de v_puertos_switch_ocupacion
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

  if (isSwitch) {
    // Si disponemos de filas de v_puertos_switch_ocupacion para este switch, usamos directamente esa vista
    const portsForThisSwitch = switchPortsOccupancy?.filter(p => p.switch_id === equipo.id) || [];
    if (portsForThisSwitch.length > 0) {
      const rj45Ports = portsForThisSwitch.filter(p => p.tipo_puerto === 'rj45');
      if (rj45Ports.length > 0) {
        totalCapacity = rj45Ports.length;
      }

      rj45Ports.forEach(port => {
        // Criterio exacto: sólo ocupado si tiene ocupado_por_tipo u ocupado_por_codigo
        const isOccupied = Boolean(port.ocupado_por_tipo || port.ocupado_por_codigo);
        if (isOccupied) {
          occupiedPortSet.add(String(port.numero_puerto));
          const isCam = port.ocupado_por_tipo === 'camara';
          connectedCameras.push({
            camera: {
              id: port.puerto_switch_id,
              codigo: port.ocupado_por_codigo || `Pto ${port.numero_puerto}`,
              modelo: isCam ? 'CCTV' : 'Punto de Red',
              tipo_dispositivo: isCam ? 'camara' : 'punto_red',
            } as any,
            portOrChannel: `P${port.numero_puerto}`,
            details: isCam
              ? `Cámara ${port.ocupado_por_codigo} (CCTV)`
              : `Punto de Red ${port.ocupado_por_codigo} (${port.uso || 'Datos'})`
          });
        }
      });
    } else {
      // Cálculo directo cruzando camaras y puntos_red
      camaras.forEach(cam => {
        if (cam.switch_id === equipo.id) {
          const portNum = parseSwitchPortNumber(cam.puerto_switch);
          const portLabel = cam.puerto_switch || (portNum ? `P${portNum}` : 'P?');
          occupiedPortSet.add(String(portNum ?? portLabel));
          connectedCameras.push({
            camera: cam,
            portOrChannel: portLabel,
            details: `Cámara ${cam.codigo} (${cam.modelo || cam.tipo_dispositivo || 'CCTV'})${cam.direccion_ip ? ` · IP ${cam.direccion_ip}` : ''}`
          });
        }
      });

      puntosRed?.forEach(pr => {
        if (pr.switch_id === equipo.id || pr.puerto_switch_id) {
          const portKey = pr.puerto_switch_id || pr.codigo;
          occupiedPortSet.add(String(portKey));
          connectedCameras.push({
            camera: {
              id: pr.id,
              codigo: pr.codigo,
              modelo: pr.tipo_punto,
              tipo_dispositivo: 'punto_red',
            } as any,
            portOrChannel: pr.codigo,
            details: `Punto de Red ${pr.codigo} (${pr.tipo_punto || 'Datos'})`
          });
        }
      });
    }
  } else if (isPatchPanel) {
    camaras.forEach(cam => {
      if (cam.patch_panel_id === equipo.id) {
        const portNum = cam.puerto_patch;
        if (portNum) {
          occupiedPortSet.add(String(portNum));
        }
        connectedCameras.push({
          camera: cam,
          portOrChannel: portNum ? `P${portNum}` : 'P?',
          details: `Cámara ${cam.codigo} (${cam.modelo || 'CCTV'})${cam.switch_id ? ' · Cruzada a Switch' : ''}`
        });
      }
    });

    puntosRed?.forEach(pr => {
      if (pr.patch_panel_id === equipo.id && pr.puerto_patch) {
        occupiedPortSet.add(String(pr.puerto_patch));
        connectedCameras.push({
          camera: {
            id: pr.id,
            codigo: pr.codigo,
            modelo: pr.tipo_punto,
            tipo_dispositivo: 'punto_red',
          } as any,
          portOrChannel: `P${pr.puerto_patch}`,
          details: `Punto de Red ${pr.codigo} (${pr.tipo_punto || 'Datos'})`
        });
      }
    });
  } else if (isNvr) {
    camaras.forEach(cam => {
      if (cam.nvr_id === equipo.id) {
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
  }

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
