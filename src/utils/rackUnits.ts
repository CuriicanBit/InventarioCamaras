import { Equipo, TipoEquipo } from '../types/database';

export interface SlotValidationResult {
  isValid: boolean;
  targetU: number;
  targetUSuperior: number;
  uInferior: number;
  uHeight: number;
  reason?: string;
  conflictingEquipo?: Equipo;
}

/**
 * Infers rack U height from equipment model name and type.
 */
export function inferUHeight(modeloName?: string | null, tipo?: TipoEquipo | string | null): number {
  if (modeloName) {
    const lower = modeloName.toLowerCase();
    // Check explicit patterns like 4u, 3u, 2u, 1u
    const match = lower.match(/\b([1-9]|1[0-2])\s*u\b/);
    if (match) {
      return parseInt(match[1], 10);
    }
    if (lower.includes('2u')) return 2;
    if (lower.includes('3u')) return 3;
    if (lower.includes('4u')) return 4;
  }

  switch (tipo) {
    case 'ups':
      return 2;
    case 'nvr':
      return 2;
    case 'organizador':
    case 'patch_panel':
    case 'switch':
    default:
      return 1;
  }
}

/**
 * Calculates the inferior (bottom) U position given the superior (top) U position and height in U.
 * Example: U superior 10 with height 2 spans U9 to U10 -> inferior is 9.
 */
export function calculateUInferior(uSuperior: number, uHeight: number): number {
  return Math.max(1, uSuperior - Math.max(1, uHeight) + 1);
}

/**
 * Validates whether a range of rack units [uInferior..targetUSuperior] is valid and free of collision.
 */
export function validateUSlotAvailability(
  targetUSuperior: number,
  uHeight: number,
  totalU: number,
  occupiedSlotsMap: Record<number, Equipo>,
  ignoreEquipoId?: string | null
): SlotValidationResult {
  const height = Math.max(1, uHeight || 1);
  const uInferior = calculateUInferior(targetUSuperior, height);

  const baseResult = {
    targetU: targetUSuperior,
    targetUSuperior,
    uInferior,
    uHeight: height
  };

  if (targetUSuperior > totalU) {
    return {
      ...baseResult,
      isValid: false,
      reason: `La posición superior U${targetUSuperior} supera el límite del rack (U${totalU})`
    };
  }

  if (uInferior < 1) {
    return {
      ...baseResult,
      isValid: false,
      reason: `La altura requerida (${height}U) excede la base del rack (U1)`
    };
  }

  // Check collision for each occupied slot
  for (let u = uInferior; u <= targetUSuperior; u++) {
    const occupant = occupiedSlotsMap[u];
    if (occupant && occupant.id !== ignoreEquipoId) {
      return {
        ...baseResult,
        isValid: false,
        reason: `El slot U${u} está ocupado por ${occupant.codigo || occupant.tipo}`,
        conflictingEquipo: occupant
      };
    }
  }

  return {
    ...baseResult,
    isValid: true
  };
}

/**
 * Finds the first available slot (targetUSuperior) that can accommodate the given uHeight.
 * Scans downwards from totalU to uHeight so equipment fills logically from top or bottom.
 */
export function findFirstAvailableUSlot(
  totalU: number,
  uHeight: number,
  occupiedSlotsMap: Record<number, Equipo>,
  ignoreEquipoId?: string | null
): number | null {
  const height = Math.max(1, uHeight || 1);

  // Search from top down
  for (let top = totalU; top >= height; top--) {
    const result = validateUSlotAvailability(top, height, totalU, occupiedSlotsMap, ignoreEquipoId);
    if (result.isValid) {
      return top;
    }
  }

  // If no slot found top down, check bottom up
  for (let top = height; top <= totalU; top++) {
    const result = validateUSlotAvailability(top, height, totalU, occupiedSlotsMap, ignoreEquipoId);
    if (result.isValid) {
      return top;
    }
  }

  return null;
}
