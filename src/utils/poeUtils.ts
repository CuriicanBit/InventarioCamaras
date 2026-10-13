/**
 * Utilidades para parsing, validación y formateo de puertos PoE en conmutadores y modelos.
 *
 * Formato aceptado:
 * - "todos": todos los puertos RJ45 entregan PoE
 * - "ninguno": ningún puerto entrega PoE (0 puertos)
 * - rangos o puertos individuales: "1-8,17-24" o "1, 3-5"
 * - vacío / null / undefined: sin definir (NO es lo mismo que ninguno)
 *
 * Solo aplica a puertos RJ45.
 */

export interface PoeParseResult {
  isDefined: boolean;
  isAll: boolean;
  isNone: boolean;
  valid: boolean;
  error?: string;
  count: number;
  portSet: Set<number>;
  summaryText: string;
}

/**
 * Parsea y valida el texto de configuración PoE.
 * @param text Valor textual ("todos", "ninguno", "1-8,17-24", etc.)
 * @param totalRj45 Cantidad de puertos RJ45 del switch o modelo (si se conoce)
 */
export function parsePoePorts(
  text: string | null | undefined,
  totalRj45?: number | null
): PoeParseResult {
  const clean = (text ?? '').trim();

  // Caso: Sin definir
  if (!clean) {
    return {
      isDefined: false,
      isAll: false,
      isNone: false,
      valid: true,
      count: 0,
      portSet: new Set<number>(),
      summaryText: 'PoE sin definir'
    };
  }

  const lower = clean.toLowerCase();

  // Caso: Todos
  if (lower === 'todos') {
    const total = totalRj45 && totalRj45 > 0 ? totalRj45 : 0;
    const set = new Set<number>();
    for (let i = 1; i <= total; i++) {
      set.add(i);
    }
    return {
      isDefined: true,
      isAll: true,
      isNone: false,
      valid: true,
      count: total,
      portSet: set,
      summaryText: total > 0 ? `PoE: ${total} de ${total} puertos` : 'PoE: todos los puertos'
    };
  }

  // Caso: Ninguno
  if (lower === 'ninguno') {
    const total = totalRj45 && totalRj45 > 0 ? totalRj45 : 0;
    return {
      isDefined: true,
      isAll: false,
      isNone: true,
      valid: true,
      count: 0,
      portSet: new Set<number>(),
      summaryText: total > 0 ? `PoE: 0 de ${total} puertos` : 'PoE: 0 puertos (ninguno)'
    };
  }

  // Caso: Rangos y puertos sueltos ("1-8,17-24", "1, 3-5", etc.)
  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return {
      isDefined: false,
      isAll: false,
      isNone: false,
      valid: true,
      count: 0,
      portSet: new Set<number>(),
      summaryText: 'PoE sin definir'
    };
  }

  const portSet = new Set<number>();
  const maxRj45 = totalRj45 && totalRj45 > 0 ? totalRj45 : null;

  for (const part of parts) {
    // Rango tipo "1-8" o " 1 - 8 "
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0) {
        return {
          isDefined: true,
          isAll: false,
          isNone: false,
          valid: false,
          error: `Rango inválido: "${part}"`,
          count: 0,
          portSet: new Set<number>(),
          summaryText: 'Formato PoE inválido'
        };
      }
      if (start > end) {
        return {
          isDefined: true,
          isAll: false,
          isNone: false,
          valid: false,
          error: `Rango invertido "${part}": el inicio (${start}) no puede ser mayor al fin (${end})`,
          count: 0,
          portSet: new Set<number>(),
          summaryText: 'Formato PoE inválido'
        };
      }
      if (maxRj45 !== null && end > maxRj45) {
        return {
          isDefined: true,
          isAll: false,
          isNone: false,
          valid: false,
          error: `El puerto ${end} supera la cantidad de puertos RJ45 del switch (${maxRj45})`,
          count: 0,
          portSet: new Set<number>(),
          summaryText: 'Supera puertos RJ45'
        };
      }
      for (let p = start; p <= end; p++) {
        portSet.add(p);
      }
      continue;
    }

    // Puerto único tipo "1" o "17"
    const singleMatch = part.match(/^(\d+)$/);
    if (singleMatch) {
      const p = parseInt(singleMatch[1], 10);
      if (isNaN(p) || p <= 0) {
        return {
          isDefined: true,
          isAll: false,
          isNone: false,
          valid: false,
          error: `Puerto inválido: "${part}"`,
          count: 0,
          portSet: new Set<number>(),
          summaryText: 'Formato PoE inválido'
        };
      }
      if (maxRj45 !== null && p > maxRj45) {
        return {
          isDefined: true,
          isAll: false,
          isNone: false,
          valid: false,
          error: `El puerto ${p} supera la cantidad de puertos RJ45 del switch (${maxRj45})`,
          count: 0,
          portSet: new Set<number>(),
          summaryText: 'Supera puertos RJ45'
        };
      }
      portSet.add(p);
      continue;
    }

    // Formato no reconocido
    return {
      isDefined: true,
      isAll: false,
      isNone: false,
      valid: false,
      error: `Formato no reconocido: "${part}". Use "todos", "ninguno" o rangos como "1-8,17-24"`,
      count: 0,
      portSet: new Set<number>(),
      summaryText: 'Formato PoE inválido'
    };
  }

  const count = portSet.size;
  const summaryText =
    maxRj45 !== null
      ? `PoE: ${count} de ${maxRj45} puertos`
      : `PoE: ${count} puertos`;

  return {
    isDefined: true,
    isAll: false,
    isNone: false,
    valid: true,
    count,
    portSet,
    summaryText
  };
}

/**
 * Retorna el modo activo del selector rápido: 'todos' | 'ninguno' | 'rangos' | 'sin_definir'
 */
export function getPoeSelectorMode(text: string | null | undefined): 'todos' | 'ninguno' | 'rangos' | 'sin_definir' {
  const clean = (text ?? '').trim().toLowerCase();
  if (!clean) return 'sin_definir';
  if (clean === 'todos') return 'todos';
  if (clean === 'ninguno') return 'ninguno';
  return 'rangos';
}

/**
 * Estándares PoE
 * 'af' = 802.3af (15,4 W)
 * 'at' = 802.3at (30 W)
 * 'bt3' = 802.3bt tipo 3 (60 W)
 * 'bt4' = 802.3bt tipo 4 (100 W)
 */
export type PoeEstandar = 'af' | 'at' | 'bt3' | 'bt4';

export const POE_ESTANDAR_OPTIONS: { value: PoeEstandar; label: string; watts: number }[] = [
  { value: 'af', label: '802.3af (15,4 W)', watts: 15.4 },
  { value: 'at', label: '802.3at (30 W)', watts: 30 },
  { value: 'bt3', label: '802.3bt tipo 3 (60 W)', watts: 60 },
  { value: 'bt4', label: '802.3bt tipo 4 (100 W)', watts: 100 },
];

export function getPoeEstandarLabel(val?: string | null): string {
  if (!val) return '';
  const opt = POE_ESTANDAR_OPTIONS.find(o => o.value === val);
  return opt ? opt.label : val;
}

/**
 * Generaciones Wi-Fi
 * 'wifi4' = "Wi-Fi 4 (802.11n)"
 * 'wifi5' = "Wi-Fi 5 (802.11ac)"
 * 'wifi6' = "Wi-Fi 6 (802.11ax)"
 * 'wifi6e' = "Wi-Fi 6E"
 * 'wifi7' = "Wi-Fi 7 (802.11be)"
 */
export type WifiGeneracion = 'wifi4' | 'wifi5' | 'wifi6' | 'wifi6e' | 'wifi7';

export const WIFI_GENERACION_OPTIONS: { value: WifiGeneracion; label: string }[] = [
  { value: 'wifi4', label: 'Wi-Fi 4 (802.11n)' },
  { value: 'wifi5', label: 'Wi-Fi 5 (802.11ac)' },
  { value: 'wifi6', label: 'Wi-Fi 6 (802.11ax)' },
  { value: 'wifi6e', label: 'Wi-Fi 6E' },
  { value: 'wifi7', label: 'Wi-Fi 7 (802.11be)' },
];

export function getWifiGeneracionLabel(val?: string | null): string {
  if (!val) return '';
  const opt = WIFI_GENERACION_OPTIONS.find(o => o.value === val);
  return opt ? opt.label : val;
}

/**
 * Tipos de Alimentación
 * 'poe' = "PoE del switch"
 * 'inyector' = "Inyector PoE"
 * 'fuente_propia' = "Fuente propia"
 * vacío / null = "Sin informar"
 */
export type TipoAlimentacion = 'poe' | 'inyector' | 'fuente_propia';

export const ALIMENTACION_OPTIONS: { value: TipoAlimentacion; label: string }[] = [
  { value: 'poe', label: 'PoE del switch' },
  { value: 'inyector', label: 'Inyector PoE' },
  { value: 'fuente_propia', label: 'Fuente propia' },
];

export function getAlimentacionLabel(val?: string | null): string {
  if (!val) return 'Sin informar';
  const opt = ALIMENTACION_OPTIONS.find(o => o.value === val);
  return opt ? opt.label : val;
}

