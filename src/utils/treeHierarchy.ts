import { supabase } from '../lib/supabase';
import { Sede, Campus, Edificio, Piso, Rack, Equipo, Camara } from '../types/database';

export type NodeLevel = 'sede' | 'campus' | 'edificio' | 'piso' | 'rack';

export interface HierarchyDescendants {
  campus: Campus[];
  edificios: Edificio[];
  pisos: Piso[];
  racks: Rack[];
  equipos: Equipo[];
  camaras: Camara[];
  totalChildren: number;
  summaryText: string;
}

const levelLabels: Record<NodeLevel, { singular: string; article: string }> = {
  sede: { singular: 'Sede', article: 'Esta' },
  campus: { singular: 'Campus', article: 'Este' },
  edificio: { singular: 'Edificio', article: 'Este' },
  piso: { singular: 'Piso', article: 'Este' },
  rack: { singular: 'Rack', article: 'Este' },
};

/**
 * Traverses and queries all children and deep descendants of a node in the physical hierarchy.
 */
export async function fetchHierarchyDescendants(
  level: NodeLevel,
  nodeId: string
): Promise<HierarchyDescendants> {
  let foundCampus: Campus[] = [];
  let foundEdificios: Edificio[] = [];
  let foundPisos: Piso[] = [];
  let foundRacks: Rack[] = [];
  let foundEquipos: Equipo[] = [];
  let foundCamaras: Camara[] = [];

  try {
    if (level === 'sede') {
      const { data: cData } = await supabase.from('campus').select('*').eq('sede_id', nodeId);
      foundCampus = cData || [];
      const campusIds = foundCampus.map(c => c.id);

      if (campusIds.length > 0) {
        const { data: eData } = await supabase.from('edificios').select('*').in('campus_id', campusIds);
        foundEdificios = eData || [];
        const edifIds = foundEdificios.map(e => e.id);

        if (edifIds.length > 0) {
          const { data: pData } = await supabase.from('pisos').select('*').in('edificio_id', edifIds);
          foundPisos = pData || [];
          const pisoIds = foundPisos.map(p => p.id);

          if (pisoIds.length > 0) {
            const { data: rData } = await supabase.from('racks').select('*').in('piso_id', pisoIds);
            foundRacks = rData || [];
            const rackIds = foundRacks.map(r => r.id);

            const [eqRes, camPisoRes, camRackRes] = await Promise.all([
              rackIds.length > 0 ? supabase.from('equipos').select('*').in('rack_id', rackIds) : Promise.resolve({ data: [] }),
              supabase.from('camaras').select('*').in('piso_id', pisoIds),
              rackIds.length > 0 ? supabase.from('camaras').select('*').in('rack_id', rackIds) : Promise.resolve({ data: [] }),
            ]);

            foundEquipos = eqRes.data || [];
            const camMap = new Map<string, Camara>();
            (camPisoRes.data || []).forEach(c => camMap.set(c.id, c));
            (camRackRes.data || []).forEach(c => camMap.set(c.id, c));
            foundCamaras = Array.from(camMap.values());
          }
        }
      }
    } else if (level === 'campus') {
      const { data: eData } = await supabase.from('edificios').select('*').eq('campus_id', nodeId);
      foundEdificios = eData || [];
      const edifIds = foundEdificios.map(e => e.id);

      if (edifIds.length > 0) {
        const { data: pData } = await supabase.from('pisos').select('*').in('edificio_id', edifIds);
        foundPisos = pData || [];
        const pisoIds = foundPisos.map(p => p.id);

        if (pisoIds.length > 0) {
          const { data: rData } = await supabase.from('racks').select('*').in('piso_id', pisoIds);
          foundRacks = rData || [];
          const rackIds = foundRacks.map(r => r.id);

          const [eqRes, camPisoRes, camRackRes] = await Promise.all([
            rackIds.length > 0 ? supabase.from('equipos').select('*').in('rack_id', rackIds) : Promise.resolve({ data: [] }),
            supabase.from('camaras').select('*').in('piso_id', pisoIds),
            rackIds.length > 0 ? supabase.from('camaras').select('*').in('rack_id', rackIds) : Promise.resolve({ data: [] }),
          ]);

          foundEquipos = eqRes.data || [];
          const camMap = new Map<string, Camara>();
          (camPisoRes.data || []).forEach(c => camMap.set(c.id, c));
          (camRackRes.data || []).forEach(c => camMap.set(c.id, c));
          foundCamaras = Array.from(camMap.values());
        }
      }
    } else if (level === 'edificio') {
      const { data: pData } = await supabase.from('pisos').select('*').eq('edificio_id', nodeId);
      foundPisos = pData || [];
      const pisoIds = foundPisos.map(p => p.id);

      if (pisoIds.length > 0) {
        const { data: rData } = await supabase.from('racks').select('*').in('piso_id', pisoIds);
        foundRacks = rData || [];
        const rackIds = foundRacks.map(r => r.id);

        const [eqRes, camPisoRes, camRackRes] = await Promise.all([
          rackIds.length > 0 ? supabase.from('equipos').select('*').in('rack_id', rackIds) : Promise.resolve({ data: [] }),
          supabase.from('camaras').select('*').in('piso_id', pisoIds),
          rackIds.length > 0 ? supabase.from('camaras').select('*').in('rack_id', rackIds) : Promise.resolve({ data: [] }),
        ]);

        foundEquipos = eqRes.data || [];
        const camMap = new Map<string, Camara>();
        (camPisoRes.data || []).forEach(c => camMap.set(c.id, c));
        (camRackRes.data || []).forEach(c => camMap.set(c.id, c));
        foundCamaras = Array.from(camMap.values());
      }
    } else if (level === 'piso') {
      const { data: rData } = await supabase.from('racks').select('*').eq('piso_id', nodeId);
      foundRacks = rData || [];
      const rackIds = foundRacks.map(r => r.id);

      const [eqRes, camPisoRes, camRackRes] = await Promise.all([
        rackIds.length > 0 ? supabase.from('equipos').select('*').in('rack_id', rackIds) : Promise.resolve({ data: [] }),
        supabase.from('camaras').select('*').eq('piso_id', nodeId),
        rackIds.length > 0 ? supabase.from('camaras').select('*').in('rack_id', rackIds) : Promise.resolve({ data: [] }),
      ]);

      foundEquipos = eqRes.data || [];
      const camMap = new Map<string, Camara>();
      (camPisoRes.data || []).forEach(c => camMap.set(c.id, c));
      (camRackRes.data || []).forEach(c => camMap.set(c.id, c));
      foundCamaras = Array.from(camMap.values());
    } else if (level === 'rack') {
      const [eqRes, camRes] = await Promise.all([
        supabase.from('equipos').select('*').eq('rack_id', nodeId),
        supabase.from('camaras').select('*').eq('rack_id', nodeId),
      ]);
      foundEquipos = eqRes.data || [];
      foundCamaras = camRes.data || [];
    }
  } catch (err) {
    console.error('Error fetching hierarchy descendants:', err);
  }

  const parts: string[] = [];
  if (foundCampus.length > 0) parts.push(`${foundCampus.length} ${foundCampus.length === 1 ? 'Campus' : 'Campus'}`);
  if (foundEdificios.length > 0) parts.push(`${foundEdificios.length} ${foundEdificios.length === 1 ? 'Edificio' : 'Edificios'}`);
  if (foundPisos.length > 0) parts.push(`${foundPisos.length} ${foundPisos.length === 1 ? 'Piso' : 'Pisos'}`);
  if (foundRacks.length > 0) parts.push(`${foundRacks.length} ${foundRacks.length === 1 ? 'Rack' : 'Racks'}`);
  if (foundEquipos.length > 0) parts.push(`${foundEquipos.length} ${foundEquipos.length === 1 ? 'Equipo' : 'Equipos'}`);
  if (foundCamaras.length > 0) parts.push(`${foundCamaras.length} ${foundCamaras.length === 1 ? 'Cámara' : 'Cámaras'}`);

  const totalChildren = 
    foundCampus.length +
    foundEdificios.length +
    foundPisos.length +
    foundRacks.length +
    foundEquipos.length +
    foundCamaras.length;

  let summaryPartsText = '';
  if (parts.length === 1) {
    summaryPartsText = parts[0];
  } else if (parts.length > 1) {
    const last = parts[parts.length - 1];
    const prev = parts.slice(0, parts.length - 1).join(', ');
    summaryPartsText = `${prev} y ${last}`;
  }

  const label = levelLabels[level];
  const summaryText = totalChildren > 0
    ? `${label.article} ${label.singular} contiene ${summaryPartsText}. Al eliminar esta ubicación, los Racks, Equipos y Cámaras contenidos NO se borrarán: su ubicación quedará en null y pasarán a la sección "Sin Asignar" para ser reasignados.`
    : '';

  return {
    campus: foundCampus,
    edificios: foundEdificios,
    pisos: foundPisos,
    racks: foundRacks,
    equipos: foundEquipos,
    camaras: foundCamaras,
    totalChildren,
    summaryText,
  };
}

/**
 * Executes safe deletion of a location node or rack:
 * Instead of deleting devices, sets their location FK (piso_id or rack_id) to NULL
 * so they are safely preserved in "Sin Asignar" (v_sin_asignar) for subsequent reassignment.
 */
export async function executeCascadedDelete(
  level: NodeLevel,
  nodeId: string,
  descendants: HierarchyDescendants
): Promise<{ success: boolean; error?: string }> {
  try {
    const camaraIds = descendants.camaras.map(c => c.id);
    const equipoIds = descendants.equipos.map(e => e.id);
    const rackIds = descendants.racks.map(r => r.id);
    const pisoIds = descendants.pisos.map(p => p.id);
    const edificioIds = descendants.edificios.map(e => e.id);
    const campusIds = descendants.campus.map(c => c.id);

    if (level === 'rack') {
      // 1. Unassign equipment from this rack (set rack_id = null)
      if (equipoIds.length > 0) {
        const { error } = await supabase.from('equipos').update({ rack_id: null }).eq('rack_id', nodeId);
        if (error) throw error;
      }
      // 2. Unassign cameras connected to this rack
      if (camaraIds.length > 0) {
        const { error } = await supabase.from('camaras').update({
          rack_id: null,
          patch_panel_id: null,
          switch_id: null,
          nvr_id: null,
        }).eq('rack_id', nodeId);
        if (error) throw error;
      }
      // 3. Delete the rack
      const { error } = await supabase.from('racks').delete().eq('id', nodeId);
      if (error) throw error;
      return { success: true };
    }

    if (level === 'piso') {
      // 1. Unassign cameras on this piso (set piso_id = null)
      const { error: cErr } = await supabase.from('camaras').update({ piso_id: null }).eq('piso_id', nodeId);
      if (cErr) throw cErr;

      // 2. Unassign racks on this piso (set piso_id = null)
      const { error: rErr } = await supabase.from('racks').update({ piso_id: null }).eq('piso_id', nodeId);
      if (rErr) throw rErr;

      // 3. Delete the piso itself
      const { error } = await supabase.from('pisos').delete().eq('id', nodeId);
      if (error) throw error;
      return { success: true };
    }

    if (level === 'edificio') {
      // Find all pisos in this edificio
      if (pisoIds.length > 0) {
        // Unassign cameras and racks in those pisos
        await supabase.from('camaras').update({ piso_id: null }).in('piso_id', pisoIds);
        await supabase.from('racks').update({ piso_id: null }).in('piso_id', pisoIds);
        // Delete the pisos
        const { error: pErr } = await supabase.from('pisos').delete().in('id', pisoIds);
        if (pErr) throw pErr;
      }

      // Delete the edificio
      const { error } = await supabase.from('edificios').delete().eq('id', nodeId);
      if (error) throw error;
      return { success: true };
    }

    if (level === 'campus') {
      if (pisoIds.length > 0) {
        await supabase.from('camaras').update({ piso_id: null }).in('piso_id', pisoIds);
        await supabase.from('racks').update({ piso_id: null }).in('piso_id', pisoIds);
        const { error: pErr } = await supabase.from('pisos').delete().in('id', pisoIds);
        if (pErr) throw pErr;
      }
      if (edificioIds.length > 0) {
        const { error: eErr } = await supabase.from('edificios').delete().in('id', edificioIds);
        if (eErr) throw eErr;
      }
      // Delete the campus
      const { error } = await supabase.from('campus').delete().eq('id', nodeId);
      if (error) throw error;
      return { success: true };
    }

    if (level === 'sede') {
      if (pisoIds.length > 0) {
        await supabase.from('camaras').update({ piso_id: null }).in('piso_id', pisoIds);
        await supabase.from('racks').update({ piso_id: null }).in('piso_id', pisoIds);
        const { error: pErr } = await supabase.from('pisos').delete().in('id', pisoIds);
        if (pErr) throw pErr;
      }
      if (edificioIds.length > 0) {
        await supabase.from('edificios').delete().in('id', edificioIds);
      }
      if (campusIds.length > 0) {
        await supabase.from('campus').delete().in('id', campusIds);
      }
      // Delete the sede
      const { error } = await supabase.from('sedes').delete().eq('id', nodeId);
      if (error) throw error;
      return { success: true };
    }

    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Safe unassign/delete error:', err);
    return { success: false, error: errorMsg };
  }
}
