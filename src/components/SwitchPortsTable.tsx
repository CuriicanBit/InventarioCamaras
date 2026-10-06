import React, { useState, useEffect, useMemo } from 'react';
import { 
  Cpu, 
  Tag, 
  Check, 
  X, 
  Edit2, 
  RefreshCw, 
  Search, 
  Camera, 
  Network, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  Layers, 
  ArrowUpDown,
  Filter,
  Sliders,
  ArrowRightLeft,
  Link2,
  AlertTriangle,
  Radio
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Equipo, PuertoSwitchOcupacion, Vlan, EnlaceSwitch } from '../types/database';
import { VlanSelect } from './catalogs/CatalogSelectors';

interface SwitchPortsTableProps {
  switchEquipo: Equipo;
  availableSwitches?: Equipo[];
  onSelectSwitch?: (eq: Equipo) => void;
  onPortsUpdated?: () => void;
}

const USO_OPTIONS = [
  'CCTV',
  'Datos Funcionario',
  'Datos Alumno',
  'WiFi AP',
  'Uplink',
  'Libre',
  'Otro'
] as const;

export const SwitchPortsTable: React.FC<SwitchPortsTableProps> = ({
  switchEquipo,
  availableSwitches,
  onSelectSwitch,
  onPortsUpdated,
}) => {
  const [ports, setPorts] = useState<PuertoSwitchOcupacion[]>([]);
  const [vlans, setVlans] = useState<Vlan[]>([]);
  const [enlaces, setEnlaces] = useState<EnlaceSwitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // In-line editing state
  const [editingPortId, setEditingPortId] = useState<string | null>(null);
  const [editVlanNumero, setEditVlanNumero] = useState<number | null>(null);
  const [editVlanId, setEditVlanId] = useState<string | null>(null);
  const [editUso, setEditUso] = useState<string>('');
  const [editDescripcion, setEditDescripcion] = useState<string>('');

  // Bulk VLAN assignment (free ports)
  const [showBulkVlan, setShowBulkVlan] = useState(false);
  const [bulkVlanNumero, setBulkVlanNumero] = useState<number | null>(null);
  const [bulkVlanId, setBulkVlanId] = useState<string | null>(null);
  const [applyingBulk, setApplyingBulk] = useState(false);

  // Range assignment state
  const [showRangeAssign, setShowRangeAssign] = useState(false);
  const [rangeDesde, setRangeDesde] = useState<number | ''>(1);
  const [rangeHasta, setRangeHasta] = useState<number | ''>(24);
  const [rangeVlanNumero, setRangeVlanNumero] = useState<number | null>(null);
  const [rangeVlanId, setRangeVlanId] = useState<string | null>(null);
  const [rangeUso, setRangeUso] = useState<string>('Datos Funcionario');
  const [applyingRange, setApplyingRange] = useState(false);
  const [rangeWarningModal, setRangeWarningModal] = useState<{
    isOpen: boolean;
    conflictingPorts: PuertoSwitchOcupacion[];
    targetPorts: PuertoSwitchOcupacion[];
  } | null>(null);

  // Quick search / filter
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'libres' | 'ocupados' | 'sin_vlan'>('all');

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast(null);
    }, 3500);
  };

  // Load switch ports from v_puertos_switch_ocupacion, vlans, and enlaces_switch
  const loadPorts = async () => {
    if (!switchEquipo.id) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      // Load VLANs catalogue
      const { data: vlansData } = await supabase
        .from('vlans')
        .select('*')
        .order('numero', { ascending: true });
      setVlans(vlansData || []);

      // Load trunk enlaces for this switch
      const { data: enlacesData } = await supabase
        .from('enlaces_switch')
        .select(`
          id,
          puerto_origen_id,
          puerto_destino_id,
          switch_origen_id,
          switch_destino_id,
          created_at,
          switch_origen:equipos!enlaces_switch_switch_origen_id_fkey(id, codigo, modelo),
          switch_destino:equipos!enlaces_switch_switch_destino_id_fkey(id, codigo, modelo),
          puerto_origen:puertos_switch!enlaces_switch_puerto_origen_id_fkey(id, numero_puerto, tipo_puerto),
          puerto_destino:puertos_switch!enlaces_switch_puerto_destino_id_fkey(id, numero_puerto, tipo_puerto)
        `)
        .or(`switch_origen_id.eq.${switchEquipo.id},switch_destino_id.eq.${switchEquipo.id}`);
      setEnlaces((enlacesData as any) || []);

      // Load ports from view
      const { data, error } = await supabase
        .from('v_puertos_switch_ocupacion')
        .select('*')
        .eq('switch_id', switchEquipo.id)
        .order('numero_puerto', { ascending: true });

      if (error) throw error;

      let portRows = data || [];

      // Auto-seed if switch has no ports at all
      if (portRows.length === 0) {
        const totalRj45 = switchEquipo.puertos_totales || 24;
        const seedRows = [];
        for (let i = 1; i <= totalRj45; i++) {
          seedRows.push({
            switch_id: switchEquipo.id,
            numero_puerto: i,
            tipo_puerto: 'rj45',
            vlan: switchEquipo.vlan || null,
            uso: null,
            descripcion: null,
          });
        }
        // Also seed 4 SFP trunk uplink ports
        for (let i = 1; i <= 4; i++) {
          seedRows.push({
            switch_id: switchEquipo.id,
            numero_puerto: totalRj45 + i,
            tipo_puerto: 'sfp',
            vlan: null,
            uso: 'Uplink',
            descripcion: `Puerto SFP Uplink ${i} (1000Base-X)`,
          });
        }

        const { error: seedErr } = await supabase.from('puertos_switch').insert(seedRows);
        if (seedErr) {
          console.warn('Could not auto-seed switch ports:', seedErr);
        } else {
          const { data: refetched } = await supabase
            .from('v_puertos_switch_ocupacion')
            .select('*')
            .eq('switch_id', switchEquipo.id)
            .order('numero_puerto', { ascending: true });
          portRows = refetched || [];
        }
      } else {
        // Check if switch has NO SFP ports yet; if so, add 4 SFP ports automatically
        const hasSfp = portRows.some(p => p.tipo_puerto === 'sfp');
        if (!hasSfp) {
          const maxNum = Math.max(...portRows.map(p => p.numero_puerto), 24);
          const sfpSeed = [];
          for (let i = 1; i <= 4; i++) {
            sfpSeed.push({
              switch_id: switchEquipo.id,
              numero_puerto: maxNum + i,
              tipo_puerto: 'sfp',
              vlan: null,
              uso: 'Uplink',
              descripcion: `Puerto SFP Uplink ${i} (1000Base-X)`,
            });
          }
          const { error: sfpErr } = await supabase.from('puertos_switch').insert(sfpSeed);
          if (!sfpErr) {
            const { data: refetched } = await supabase
              .from('v_puertos_switch_ocupacion')
              .select('*')
              .eq('switch_id', switchEquipo.id)
              .order('numero_puerto', { ascending: true });
            portRows = refetched || [];
          }
        }
      }

      setPorts(portRows);

      // Adjust default range bounds based on RJ45 ports
      const rj45List = portRows.filter(p => p.tipo_puerto !== 'sfp');
      if (rj45List.length > 0) {
        setRangeDesde(rj45List[0].numero_puerto);
        setRangeHasta(rj45List[rj45List.length - 1].numero_puerto);
      }
    } catch (err: any) {
      console.error('Error loading puertos_switch:', err);
      setErrorMsg('Error al cargar la tabla de puertos del switch: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPorts();
    setEditingPortId(null);
    setShowBulkVlan(false);
    setShowRangeAssign(false);
  }, [switchEquipo.id]);

  // Start inline editing
  const handleStartEdit = (port: PuertoSwitchOcupacion, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingPortId(port.puerto_switch_id);
    setEditVlanNumero(port.vlan_numero ?? port.vlan ?? null);
    // Find matching vlan id if available
    const matchedVlan = vlans.find(v => v.numero === (port.vlan_numero ?? port.vlan));
    setEditVlanId(matchedVlan?.id || null);
    setEditUso(port.uso || '');
    setEditDescripcion(port.descripcion || '');
  };

  // Cancel inline editing
  const handleCancelEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingPortId(null);
    setEditVlanNumero(null);
    setEditVlanId(null);
    setEditUso('');
    setEditDescripcion('');
  };

  // Save inline edit
  const handleSaveEdit = async (port: PuertoSwitchOcupacion, e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.stopPropagation();

    try {
      setSavingRowId(port.puerto_switch_id);
      setErrorMsg(null);

      const payload: any = {
        vlan: editVlanNumero,
        vlan_id: editVlanId || null,
        uso: port.tipo_puerto === 'sfp' ? (port.uso || 'Uplink') : (editUso.trim() || null),
        descripcion: editDescripcion.trim() || null,
      };

      const { error } = await supabase
        .from('puertos_switch')
        .update(payload)
        .eq('id', port.puerto_switch_id);

      if (error) throw error;

      // Update local state immediately
      const vlanObj = vlans.find(v => v.id === editVlanId || v.numero === editVlanNumero);
      setPorts(prev => prev.map(p => {
        if (p.puerto_switch_id === port.puerto_switch_id) {
          return {
            ...p,
            vlan: editVlanNumero,
            vlan_numero: editVlanNumero,
            vlan_nombre: vlanObj?.nombre || null,
            vlan_color: vlanObj?.color || null,
            uso: payload.uso,
            descripcion: payload.descripcion,
          };
        }
        return p;
      }));

      setEditingPortId(null);
      showToast(`Puerto ${port.numero_puerto} actualizado correctamente.`);
      onPortsUpdated?.();
    } catch (err: any) {
      console.error('Error saving switch port:', err);
      alert('Error al guardar el puerto: ' + (err.message || String(err)));
    } finally {
      setSavingRowId(null);
    }
  };

  // Filter free RJ45 ports that have no VLAN assigned
  const freeRj45PortsWithoutVlan = useMemo(() => {
    return ports.filter(p => p.tipo_puerto !== 'sfp' && !p.vlan_numero && !p.vlan);
  }, [ports]);

  // Bulk assign VLAN to all free RJ45 ports
  const handleApplyBulkVlan = async () => {
    if (!bulkVlanNumero) {
      alert('Por favor seleccione una VLAN del catálogo.');
      return;
    }

    if (freeRj45PortsWithoutVlan.length === 0) {
      alert('No hay puertos RJ45 disponibles sin VLAN asignada.');
      return;
    }

    try {
      setApplyingBulk(true);
      setErrorMsg(null);

      const targetIds = freeRj45PortsWithoutVlan.map(p => p.puerto_switch_id);
      const vlanObj = vlans.find(v => v.id === bulkVlanId || v.numero === bulkVlanNumero);

      const { error } = await supabase
        .from('puertos_switch')
        .update({
          vlan: bulkVlanNumero,
          vlan_id: bulkVlanId || vlanObj?.id || null,
        })
        .in('id', targetIds);

      if (error) throw error;

      // Update local state
      setPorts(prev => prev.map(p => {
        if (targetIds.includes(p.puerto_switch_id)) {
          return { 
            ...p, 
            vlan: bulkVlanNumero,
            vlan_numero: bulkVlanNumero,
            vlan_nombre: vlanObj?.nombre || null,
            vlan_color: vlanObj?.color || null,
          };
        }
        return p;
      }));

      setShowBulkVlan(false);
      setBulkVlanNumero(null);
      setBulkVlanId(null);
      showToast(`✓ Se asignó VLAN ${bulkVlanNumero} a ${targetIds.length} puertos RJ45 libres.`);
      onPortsUpdated?.();
    } catch (err: any) {
      console.error('Error applying bulk VLAN:', err);
      setErrorMsg('Error al aplicar VLAN masiva: ' + (err.message || String(err)));
    } finally {
      setApplyingBulk(false);
    }
  };

  // ==========================================
  // ASIGNACIÓN POR RANGO DE PUERTOS
  // ==========================================
  const handleStartApplyRange = () => {
    const start = Number(rangeDesde);
    const end = Number(rangeHasta);
    if (!start || !end || isNaN(start) || isNaN(end) || start < 1) {
      alert('Por favor especifique un rango de puertos válido.');
      return;
    }

    if (start > end) {
      alert('El "Puerto Desde" no puede ser mayor que el "Puerto Hasta".');
      return;
    }

    // Filter target ports: ONLY RJ45 ports in range! Never SFP.
    const targetPorts = ports.filter(
      p => p.tipo_puerto !== 'sfp' && p.numero_puerto >= start && p.numero_puerto <= end
    );

    if (targetPorts.length === 0) {
      alert(`No se encontraron puertos RJ45 en el rango del ${rangeDesde} al ${rangeHasta}.`);
      return;
    }

    // Check if any port already had a different VLAN assigned
    const conflictingPorts = targetPorts.filter(p => {
      const currentVlan = p.vlan_numero ?? p.vlan;
      return currentVlan !== null && currentVlan !== undefined && currentVlan !== rangeVlanNumero;
    });

    if (conflictingPorts.length > 0) {
      setRangeWarningModal({
        isOpen: true,
        conflictingPorts,
        targetPorts,
      });
      return;
    }

    // If no conflicts, execute immediately
    executeApplyRange(targetPorts);
  };

  const executeApplyRange = async (targetPorts: PuertoSwitchOcupacion[]) => {
    try {
      setApplyingRange(true);
      setErrorMsg(null);

      const targetIds = targetPorts.map(p => p.puerto_switch_id);
      const vlanObj = vlans.find(v => v.id === rangeVlanId || v.numero === rangeVlanNumero);

      const updatePayload: any = {
        vlan: rangeVlanNumero,
        vlan_id: rangeVlanId || vlanObj?.id || null,
        uso: rangeUso || null,
      };

      const { error } = await supabase
        .from('puertos_switch')
        .update(updatePayload)
        .in('id', targetIds);

      if (error) throw error;

      // Update local state
      setPorts(prev => prev.map(p => {
        if (targetIds.includes(p.puerto_switch_id)) {
          return {
            ...p,
            vlan: rangeVlanNumero,
            vlan_numero: rangeVlanNumero,
            vlan_nombre: vlanObj?.nombre || null,
            vlan_color: vlanObj?.color || null,
            uso: rangeUso,
          };
        }
        return p;
      }));

      setRangeWarningModal(null);
      setShowRangeAssign(false);
      showToast(
        `✓ Se asignó el rango de puertos ${rangeDesde} al ${rangeHasta} (${targetIds.length} puertos RJ45) con VLAN ${rangeVlanNumero || 'Sin VLAN'} y uso "${rangeUso}".`
      );
      onPortsUpdated?.();
    } catch (err: any) {
      console.error('Error applying range to ports:', err);
      setErrorMsg('Error al aplicar configuración por rango: ' + (err.message || String(err)));
    } finally {
      setApplyingRange(false);
    }
  };

  // Helper to find enlace details for an SFP port
  const getEnlaceInfo = (port: PuertoSwitchOcupacion) => {
    const enlace = enlaces.find(
      e => e.puerto_origen_id === port.puerto_switch_id || e.puerto_destino_id === port.puerto_switch_id
    );

    if (!enlace) return null;

    const isOrigin = enlace.puerto_origen_id === port.puerto_switch_id;
    const remoteSwitch = isOrigin ? enlace.switch_destino : enlace.switch_origen;
    const remotePort = isOrigin ? enlace.puerto_destino : enlace.puerto_origen;

    return {
      enlaceId: enlace.id,
      remoteSwitchCodigo: remoteSwitch?.codigo || 'Switch Remoto',
      remoteSwitchModelo: remoteSwitch?.modelo || '',
      remotePuertoNumero: remotePort?.numero_puerto || '?',
    };
  };

  // Filtered ports for display
  const filteredPorts = useMemo(() => {
    return ports.filter(p => {
      // Search
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase().trim();
        const portStr = `puerto ${p.numero_puerto}`;
        const vlanVal = p.vlan_numero ?? p.vlan;
        const vlanStr = vlanVal ? `vlan ${vlanVal} ${p.vlan_nombre || ''}`.toLowerCase() : '';
        const usoStr = (p.uso || '').toLowerCase();
        const descStr = (p.descripcion || '').toLowerCase();
        const occStr = (p.ocupado_por_codigo || '').toLowerCase();

        if (
          !portStr.includes(q) &&
          !vlanStr.includes(q) &&
          !usoStr.includes(q) &&
          !descStr.includes(q) &&
          !occStr.includes(q)
        ) {
          return false;
        }
      }

      // Status
      if (statusFilter === 'libres' && p.ocupado_por_codigo) return false;
      if (statusFilter === 'ocupados' && !p.ocupado_por_codigo) return false;
      if (statusFilter === 'sin_vlan' && (p.vlan_numero || p.vlan)) return false;

      return true;
    });
  }, [ports, searchFilter, statusFilter]);

  // Split into RJ45 and SFP sections
  const rj45Ports = useMemo(() => {
    return filteredPorts.filter(p => p.tipo_puerto !== 'sfp');
  }, [filteredPorts]);

  const sfpPorts = useMemo(() => {
    return filteredPorts.filter(p => p.tipo_puerto === 'sfp');
  }, [filteredPorts]);

  // Color helper for Uso
  const getUsoBadgeStyle = (uso: string | null) => {
    switch (uso) {
      case 'CCTV':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'Datos Funcionario':
        return 'bg-cyan-50 text-cyan-800 border-cyan-200';
      case 'Datos Alumno':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'WiFi AP':
        return 'bg-indigo-50 text-indigo-800 border-indigo-200';
      case 'Uplink':
        return 'bg-amber-50 text-amber-900 border-amber-300 font-bold';
      case 'Libre':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'Otro':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      default:
        return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3 font-mono text-xs">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 bg-blue-50 text-blue-700 rounded border border-blue-200">
              <Cpu className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-slate-900 text-sm tracking-tight uppercase">
              Puertos y VLANs · {switchEquipo.codigo} ({ports.length} Puertos: {ports.filter(p => p.tipo_puerto !== 'sfp').length} RJ45 + {ports.filter(p => p.tipo_puerto === 'sfp').length} SFP)
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 font-sans mt-0.5">
            Configuración y edición en línea de puertos, VLANs, etiquetas de uso y ocupación física
          </p>

          {/* Quick Switch Selector when multiple switches exist */}
          {availableSwitches && availableSwitches.length > 1 && (
            <div className="flex items-center gap-1.5 mt-2 pt-1 border-t border-slate-100 flex-wrap">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Switch en edición:</span>
              {availableSwitches.map((sw) => {
                const isActive = sw.id === switchEquipo.id;
                const uPos = sw.posicion_u_inicio ? `U${sw.posicion_u_inicio}` : '';
                return (
                  <button
                    key={sw.id}
                    type="button"
                    onClick={() => onSelectSwitch?.(sw)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all border cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-1 ring-blue-300'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {sw.codigo} {uPos && <span className="opacity-75 text-[9px]">({uPos})</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadPorts}
            title="Recargar puertos"
            className="p-1.5 border border-slate-300 rounded hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Botón: Asignar VLAN a puertos libres */}
          <button
            type="button"
            onClick={() => {
              setShowBulkVlan(!showBulkVlan);
              if (!showBulkVlan) setShowRangeAssign(false);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all shadow-2xs border cursor-pointer ${
              showBulkVlan
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
            }`}
            title="Asignar una misma VLAN del catálogo a todos los puertos RJ45 que aún no tienen ninguna"
          >
            <Zap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>Asignar VLAN a puertos libres</span>
            <span className="text-[10px] bg-indigo-200/70 text-indigo-900 px-1.5 py-0.2 rounded-full font-bold">
              {freeRj45PortsWithoutVlan.length}
            </span>
          </button>

          {/* Botón: Asignar Rango */}
          <button
            type="button"
            onClick={() => {
              setShowRangeAssign(!showRangeAssign);
              if (!showRangeAssign) setShowBulkVlan(false);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all shadow-2xs border cursor-pointer ${
              showRangeAssign
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
            }`}
            title="Configurar VLAN y Uso en un rango continuo de puertos RJ45"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Asignar Rango</span>
          </button>
        </div>
      </div>

      {/* Success Toast Notification */}
      {successToast && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-lg flex items-center justify-between text-[11px] font-sans animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-900 rounded-lg flex items-center gap-2 text-[11px]">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Quick Action: Asignar VLAN a puertos libres (Pop-in panel) */}
      {showBulkVlan && (
        <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-lg space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-950 font-bold">
              <Zap className="w-4 h-4 text-indigo-600" />
              <span>Asignar VLAN masiva a todos los puertos libres (RJ45)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowBulkVlan(false)}
              className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>

          <p className="text-[11px] text-indigo-900/80 font-sans leading-relaxed">
            Esta acción asignará la VLAN seleccionada del catálogo a los <strong className="font-bold">{freeRj45PortsWithoutVlan.length} puertos RJ45</strong> de este switch que no tienen ninguna VLAN asignada actualmente. Los puertos que ya poseen una VLAN o los puertos SFP no serán modificados.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <div className="w-64">
              <VlanSelect
                value={bulkVlanId || bulkVlanNumero}
                onChange={(num, id) => {
                  setBulkVlanNumero(num);
                  setBulkVlanId(id);
                }}
                vlans={vlans}
                onVlanCreated={(newVlan) => {
                  setVlans(prev => [...prev, newVlan].sort((a, b) => a.numero - b.numero));
                }}
                allowNone={false}
                placeholder="Seleccione VLAN del catálogo..."
              />
            </div>

            <button
              type="button"
              disabled={applyingBulk || !bulkVlanNumero || freeRj45PortsWithoutVlan.length === 0}
              onClick={handleApplyBulkVlan}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{applyingBulk ? 'Aplicando...' : `Aplicar a ${freeRj45PortsWithoutVlan.length} puertos RJ45 libres`}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowBulkVlan(false);
                setBulkVlanNumero(null);
                setBulkVlanId(null);
              }}
              className="px-2.5 py-1.5 border border-indigo-200 text-indigo-800 hover:bg-indigo-100 rounded text-xs font-medium transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Quick Action: Asignar por Rango de Puertos (Pop-in panel) */}
      {showRangeAssign && (
        <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-lg space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-950 font-bold">
              <Sliders className="w-4 h-4 text-blue-600" />
              <span>Asignación Masiva por Rango de Puertos RJ45</span>
            </div>
            <button
              type="button"
              onClick={() => setShowRangeAssign(false)}
              className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>

          <p className="text-[11px] text-blue-900/80 font-sans leading-relaxed">
            Configure de una sola vez la <strong>VLAN</strong> y el <strong>Uso</strong> para un bloque continuo de puertos. 
            <span className="text-amber-800 font-semibold block mt-0.5">
              ⚠️ Esta función opera exclusivamente sobre puertos de red RJ45. Los puertos SFP troncales nunca se modifican en esta operación.
            </span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {/* Puerto Desde */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-700 mb-1">
                Puerto Desde *
              </label>
              <input
                type="number"
                min={1}
                max={48}
                value={rangeDesde}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setRangeDesde('' as any);
                  } else {
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) setRangeDesde(num);
                  }
                }}
                className="w-full px-2.5 py-1.5 border border-blue-300 rounded bg-white text-xs font-bold text-slate-900 focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Puerto Hasta */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-700 mb-1">
                Puerto Hasta *
              </label>
              <input
                type="number"
                min={1}
                max={48}
                value={rangeHasta}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setRangeHasta('' as any);
                  } else {
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) setRangeHasta(num);
                  }
                }}
                className="w-full px-2.5 py-1.5 border border-blue-300 rounded bg-white text-xs font-bold text-slate-900 focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* VLAN Selector */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-700 mb-1">
                VLAN a Asignar *
              </label>
              <VlanSelect
                value={rangeVlanId || rangeVlanNumero}
                onChange={(num, id) => {
                  setRangeVlanNumero(num);
                  setRangeVlanId(id);
                }}
                vlans={vlans}
                onVlanCreated={(newVlan) => {
                  setVlans(prev => [...prev, newVlan].sort((a, b) => a.numero - b.numero));
                }}
                allowNone={true}
                noneLabel="(Sin VLAN)"
                placeholder="Seleccione VLAN..."
              />
            </div>

            {/* Uso Selector */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-700 mb-1">
                Uso *
              </label>
              <select
                value={rangeUso}
                onChange={(e) => setRangeUso(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-blue-300 rounded bg-white text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-blue-600"
              >
                {USO_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-blue-200/60">
            <button
              type="button"
              onClick={() => setShowRangeAssign(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={applyingRange}
              onClick={handleStartApplyRange}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{applyingRange ? 'Aplicando...' : `Aplicar Rango (Puertos ${rangeDesde} al ${rangeHasta})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de Sobrescritura de VLANs en Rango */}
      {rangeWarningModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 bg-amber-50 flex items-center justify-between font-mono">
              <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Advertencia: Puertos con VLAN Existente</span>
              </div>
              <button
                type="button"
                onClick={() => setRangeWarningModal(null)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs font-sans text-slate-700">
              <p className="leading-relaxed">
                Dentro del rango seleccionado (puertos <strong className="font-mono font-bold">#{rangeDesde} al #{rangeHasta}</strong>), 
                se detectaron <strong className="text-amber-900 font-bold">{rangeWarningModal.conflictingPorts.length} puertos</strong> que ya tenían una VLAN asignada distinta:
              </p>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded max-h-32 overflow-y-auto font-mono text-[11px] divide-y divide-slate-100">
                {rangeWarningModal.conflictingPorts.map(cp => (
                  <div key={cp.puerto_switch_id} className="py-1 flex items-center justify-between">
                    <span className="font-bold text-slate-800">Puerto #{cp.numero_puerto}</span>
                    <span className="text-slate-500">
                      Actual: <strong className="text-indigo-700">VLAN {cp.vlan_numero ?? cp.vlan}</strong> ({cp.vlan_nombre || cp.uso || 'Uso configurado'})
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-600 leading-relaxed">
                ¿Desea <strong>sobrescribir</strong> la configuración de estos puertos con la nueva 
                <strong> VLAN {rangeVlanNumero || 'Sin VLAN'}</strong> y uso <strong>"{rangeUso}"</strong>?
              </p>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 font-mono">
                <button
                  type="button"
                  onClick={() => setRangeWarningModal(null)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={applyingRange}
                  onClick={() => executeApplyRange(rangeWarningModal.targetPorts)}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{applyingRange ? 'Sobrescribiendo...' : 'Sí, Sobrescribir y Aplicar'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtrar por puerto, VLAN, uso..."
              className="w-full pl-8 pr-2.5 py-1 border border-slate-200 rounded bg-slate-50 text-[11px] focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2 py-1 border border-slate-200 rounded bg-slate-50 text-[11px] focus:bg-white focus:outline-none font-mono"
          >
            <option value="all">Ver: Todos ({ports.length})</option>
            <option value="libres">Solo Libres ({ports.filter(p => !p.ocupado_por_codigo).length})</option>
            <option value="ocupados">Solo Ocupados ({ports.filter(p => p.ocupado_por_codigo).length})</option>
            <option value="sin_vlan">Sin VLAN ({ports.filter(p => !p.vlan_numero && !p.vlan).length})</option>
          </select>
        </div>

        <div className="text-[10px] text-slate-500 flex items-center gap-2">
          <span>Haga clic en cualquier fila para editarla en línea</span>
        </div>
      </div>

      {/* ========================================== */}
      {/* SECCIÓN 1: TABLA DE PUERTOS RJ45 */}
      {/* ========================================== */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <span>Puertos de Cobre RJ45 ({rj45Ports.length} Puertos de Acceso)</span>
          </span>
          <span className="text-[10px] text-slate-400 font-normal">
            Destinados a dispositivos finales (Cámaras CCTV y Puntos de Red)
          </span>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-100 border-b border-slate-200 text-[10px] text-slate-600 uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3 w-16">Puerto</th>
                  <th className="py-2.5 px-3 w-48">VLAN</th>
                  <th className="py-2.5 px-3 w-36">Uso</th>
                  <th className="py-2.5 px-3">Descripción</th>
                  <th className="py-2.5 px-3 w-48">Ocupado por</th>
                  <th className="py-2.5 px-3 text-right w-20">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && ports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-blue-600" />
                      Cargando puertos RJ45...
                    </td>
                  </tr>
                ) : rj45Ports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      No se encontraron puertos RJ45 con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  rj45Ports.map((port) => {
                    const isEditingThisRow = editingPortId === port.puerto_switch_id;
                    const isOccupied = Boolean(port.ocupado_por_codigo);
                    const isCamara = port.ocupado_por_tipo === 'camara';
                    const activeVlanVal = port.vlan_numero ?? port.vlan;

                    if (isEditingThisRow) {
                      return (
                        <tr 
                          key={port.puerto_switch_id} 
                          className="bg-blue-50/80 border-2 border-blue-500 transition-colors"
                        >
                          {/* Puerto */}
                          <td className="py-2 px-3 font-bold text-blue-900 whitespace-nowrap">
                            <span className="px-1.5 py-0.5 bg-blue-200/80 text-blue-900 rounded font-bold">
                              #{port.numero_puerto}
                            </span>
                          </td>

                          {/* VLAN (Using VlanSelect from Catalogue!) */}
                          <td className="py-2 px-2">
                            <VlanSelect
                              value={editVlanId || editVlanNumero}
                              onChange={(num, id) => {
                                setEditVlanNumero(num);
                                setEditVlanId(id);
                              }}
                              vlans={vlans}
                              onVlanCreated={(newVlan) => {
                                setVlans(prev => [...prev, newVlan].sort((a, b) => a.numero - b.numero));
                              }}
                              allowNone={true}
                              noneLabel="(Sin VLAN)"
                              compact={true}
                            />
                          </td>

                          {/* Uso Select */}
                          <td className="py-2 px-2">
                            <select
                              value={editUso}
                              onChange={(e) => setEditUso(e.target.value)}
                              className="w-full px-2 py-1 border border-blue-400 rounded bg-white text-xs font-mono font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                            >
                              <option value="">(Sin definir)</option>
                              {USO_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Descripción Input */}
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={editDescripcion}
                              onChange={(e) => setEditDescripcion(e.target.value)}
                              placeholder="Descripción del puerto..."
                              className="w-full px-2.5 py-1 border border-blue-400 rounded bg-white text-xs font-mono text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveEdit(port);
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit();
                                }
                              }}
                            />
                          </td>

                          {/* Ocupado por (Read only info) */}
                          <td className="py-2 px-3 whitespace-nowrap text-[11px]">
                            {isOccupied ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                                {isCamara ? (
                                  <Camera className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                ) : (
                                  <Network className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                )}
                                <span>{port.ocupado_por_codigo}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[10px]">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Libre</span>
                              </span>
                            )}
                          </td>

                          {/* Acciones de Edición (Confirmar / Cancelar) */}
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                disabled={savingRowId === port.puerto_switch_id}
                                onClick={(e) => handleSaveEdit(port, e)}
                                title="Guardar cambios"
                                className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded shadow-2xs transition-colors cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                title="Cancelar edición"
                                className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    // Non-editing row
                    return (
                      <tr 
                        key={port.puerto_switch_id}
                        onClick={() => handleStartEdit(port)}
                        className="hover:bg-slate-50/90 transition-colors cursor-pointer group"
                        title="Clic para editar este puerto en línea"
                      >
                        {/* Puerto */}
                        <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 group-hover:bg-blue-50 group-hover:text-blue-700 group-hover:border-blue-200 transition-colors">
                            #{port.numero_puerto}
                          </span>
                        </td>

                        {/* VLAN Badge */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {activeVlanVal ? (
                            <span 
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border"
                              style={{
                                backgroundColor: port.vlan_color ? `${port.vlan_color}15` : '#EEF2FF',
                                borderColor: port.vlan_color ? `${port.vlan_color}40` : '#C7D2FE',
                                color: port.vlan_color || '#3730A3',
                              }}
                            >
                              <span 
                                className="w-2 h-2 rounded-full shrink-0" 
                                style={{ backgroundColor: port.vlan_color || '#4F46E5' }}
                              />
                              <span>VLAN {activeVlanVal}</span>
                              {port.vlan_nombre && (
                                <span className="text-[9px] opacity-75 font-normal truncate max-w-[100px]">
                                  ({port.vlan_nombre})
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">-</span>
                          )}
                        </td>

                        {/* Uso */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {port.uso ? (
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] border ${getUsoBadgeStyle(port.uso)}`}>
                              {port.uso}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">-</span>
                          )}
                        </td>

                        {/* Descripción */}
                        <td className="py-2.5 px-3 text-slate-700">
                          {port.descripcion ? (
                            <span className="truncate max-w-xs block font-sans text-[11px]" title={port.descripcion}>
                              {port.descripcion}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[10px]">-</span>
                          )}
                        </td>

                        {/* Ocupado por */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {isOccupied ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                              {isCamara ? (
                                <Camera className="w-3 h-3 text-blue-600 shrink-0" />
                              ) : (
                                <Network className="w-3 h-3 text-indigo-600 shrink-0" />
                              )}
                              <span className="truncate max-w-[140px]" title={port.ocupado_por_codigo || ''}>
                                {port.ocupado_por_codigo}
                              </span>
                              <span className="text-[9px] text-slate-500 font-normal">
                                ({isCamara ? 'CCTV' : 'Red'})
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>Libre</span>
                            </span>
                          )}
                        </td>

                        {/* Acción */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleStartEdit(port, e)}
                            title="Editar puerto en línea"
                            className="p-1 hover:text-blue-600 hover:bg-blue-50 text-slate-400 rounded transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* SECCIÓN 2: PUERTOS SFP (ENLACES TRONCALES) */}
      {/* ========================================== */}
      <div className="space-y-1.5 pt-3 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-bold text-amber-900 bg-amber-50/70 border border-amber-200 px-3 py-2 rounded-lg">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
            <span className="text-xs uppercase tracking-tight">
              Puertos SFP (Enlaces Troncales) — {sfpPorts.length} Puertos de Fibra
            </span>
          </div>
          <span className="text-[10px] text-amber-700/80 font-normal font-sans">
            Exclusivos para interconexión troncal entre switches (Backbone / Enlaces de Distribución y Core)
          </span>
        </div>

        <div className="border border-amber-200/80 rounded-lg overflow-hidden bg-amber-50/20">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-amber-100/60 border-b border-amber-200 text-[10px] text-amber-900 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 w-28">Puerto SFP</th>
                <th className="py-2.5 px-3 w-44">VLAN (Troncal)</th>
                <th className="py-2.5 px-3 w-64">Estado de Enlace Troncal</th>
                <th className="py-2.5 px-3">Descripción</th>
                <th className="py-2.5 px-3 text-right w-52">Acción de Enlace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100/60">
              {sfpPorts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No hay puertos SFP registrados en este switch.
                  </td>
                </tr>
              ) : (
                sfpPorts.map((port, idx) => {
                  const isEditingThisRow = editingPortId === port.puerto_switch_id;
                  const enlaceInfo = getEnlaceInfo(port);
                  const isConnected = Boolean(enlaceInfo);
                  const activeVlanVal = port.vlan_numero ?? port.vlan;

                  if (isEditingThisRow) {
                    return (
                      <tr 
                        key={port.puerto_switch_id} 
                        className="bg-amber-50/90 border-2 border-amber-500 transition-colors"
                      >
                        {/* Puerto SFP */}
                        <td className="py-2 px-3 font-bold text-amber-900 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-amber-200 text-amber-950 rounded font-bold border border-amber-300">
                            SFP #{port.numero_puerto}
                          </span>
                        </td>

                        {/* VLAN Selector */}
                        <td className="py-2 px-2">
                          <VlanSelect
                            value={editVlanId || editVlanNumero}
                            onChange={(num, id) => {
                              setEditVlanNumero(num);
                              setEditVlanId(id);
                            }}
                            vlans={vlans}
                            onVlanCreated={(newVlan) => {
                              setVlans(prev => [...prev, newVlan].sort((a, b) => a.numero - b.numero));
                            }}
                            allowNone={true}
                            noneLabel="(Troncal / Todas)"
                            compact={true}
                          />
                        </td>

                        {/* Estado Enlace (Read-only) */}
                        <td className="py-2 px-3 whitespace-nowrap">
                          {isConnected ? (
                            <span className="inline-flex items-center gap-1.5 text-blue-900 font-semibold text-[11px]">
                              <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>{enlaceInfo?.remoteSwitchCodigo} (Puerto #{enlaceInfo?.remotePuertoNumero})</span>
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-semibold text-[11px]">
                              Libre (Sin enlace)
                            </span>
                          )}
                        </td>

                        {/* Descripción */}
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={editDescripcion}
                            onChange={(e) => setEditDescripcion(e.target.value)}
                            placeholder="Descripción enlace SFP..."
                            className="w-full px-2.5 py-1 border border-amber-400 rounded bg-white text-xs font-mono text-slate-900 focus:ring-2 focus:ring-amber-600 focus:outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEdit(port);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                          />
                        </td>

                        {/* Guardar / Cancelar */}
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              disabled={savingRowId === port.puerto_switch_id}
                              onClick={(e) => handleSaveEdit(port, e)}
                              title="Guardar cambios"
                              className="p-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded shadow-2xs transition-colors cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              title="Cancelar edición"
                              className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr 
                      key={port.puerto_switch_id}
                      onClick={() => handleStartEdit(port)}
                      className="hover:bg-amber-100/50 transition-colors cursor-pointer group"
                      title="Clic para editar VLAN o descripción del puerto SFP"
                    >
                      {/* Puerto SFP */}
                      <td className="py-2.5 px-3 font-bold whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold group-hover:bg-amber-200 transition-colors">
                          <Radio className="w-3 h-3 text-amber-700" />
                          <span>SFP #{port.numero_puerto}</span>
                        </span>
                      </td>

                      {/* VLAN Troncal */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {activeVlanVal ? (
                          <span 
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border"
                            style={{
                              backgroundColor: port.vlan_color ? `${port.vlan_color}15` : '#FEF3C7',
                              borderColor: port.vlan_color ? `${port.vlan_color}40` : '#FDE68A',
                              color: port.vlan_color || '#92400E',
                            }}
                          >
                            <span>VLAN {activeVlanVal}</span>
                            {port.vlan_nombre && (
                              <span className="text-[9px] opacity-75 font-normal truncate max-w-[80px]">
                                ({port.vlan_nombre})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-semibold">
                            Troncal (Todas)
                          </span>
                        )}
                      </td>

                      {/* Estado de Enlace Troncal */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100/80 text-blue-900 border border-blue-300">
                            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                            <span>
                              Conectado a <strong>{enlaceInfo?.remoteSwitchCodigo}</strong> (Puerto #{enlaceInfo?.remotePuertoNumero})
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>Libre (Sin enlace configurado)</span>
                          </span>
                        )}
                      </td>

                      {/* Descripción */}
                      <td className="py-2.5 px-3 text-slate-700">
                        {port.descripcion ? (
                          <span className="truncate max-w-xs block font-sans text-[11px]" title={port.descripcion}>
                            {port.descripcion}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[10px] italic">Sin descripción</span>
                        )}
                      </td>

                      {/* Botón: Configurar Enlace Troncal (Deshabilitado Próximamente) */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-400 border border-slate-200 rounded text-[10px] font-semibold cursor-not-allowed shadow-2xs"
                            title="Esta función para conectar switches y crear enlaces troncales se construye en una etapa posterior"
                          >
                            <Link2 className="w-3 h-3 text-slate-400" />
                            <span>Configurar Enlace Troncal</span>
                            <span className="text-[9px] bg-slate-200 text-slate-600 px-1 py-0.2 rounded font-normal">
                              Próximamente
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleStartEdit(port, e)}
                            title="Editar VLAN o descripción de este puerto SFP"
                            className="p-1 hover:text-amber-700 hover:bg-amber-100 text-slate-400 rounded transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-3">
          <span>Total: <strong>{ports.length}</strong> puertos</span>
          <span>·</span>
          <span className="text-slate-700">
            RJ45: <strong>{rj45Ports.length}</strong>
          </span>
          <span>·</span>
          <span className="text-amber-800 font-semibold">
            SFP Troncales: <strong>{sfpPorts.length}</strong>
          </span>
          <span>·</span>
          <span className="text-emerald-700 font-semibold">
            Libres: <strong>{ports.filter(p => !p.ocupado_por_codigo).length}</strong>
          </span>
          <span>·</span>
          <span className="text-indigo-700 font-semibold">
            Sin VLAN: <strong>{ports.filter(p => !p.vlan_numero && !p.vlan).length}</strong>
          </span>
        </div>

        <span className="text-slate-400">
          Los cambios se guardan directamente en la tabla <code className="bg-slate-100 px-1 py-0.2 rounded">puertos_switch</code>
        </span>
      </div>
    </div>
  );
};
