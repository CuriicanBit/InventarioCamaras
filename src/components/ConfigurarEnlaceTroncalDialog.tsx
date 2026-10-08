import React, { useState, useEffect } from 'react';
import {
  X,
  Radio,
  Network,
  ArrowRightLeft,
  ShieldCheck,
  Zap,
  Server,
  AlertTriangle,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Equipo, PuertoSwitchOcupacion, formatRolRed } from '../types/database';

interface DestinationSwitchOption {
  id: string;
  codigo: string;
  modelo: string | null;
  rol_red: string | null;
  rack_id: string | null;
  rack?: {
    id: string;
    codigo: string;
    ubicacion_especifica: string | null;
  } | null;
}

interface SfpPortOption {
  id: string;
  numero_puerto: number;
  tipo_puerto: string;
  uso: string | null;
  descripcion: string | null;
}

interface ConfigurarEnlaceTroncalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  switchOrigen: Equipo;
  puertoOrigen: PuertoSwitchOcupacion;
  onEnlaceCreated: () => void;
}

export const ConfigurarEnlaceTroncalDialog: React.FC<ConfigurarEnlaceTroncalDialogProps> = ({
  isOpen,
  onClose,
  switchOrigen,
  puertoOrigen,
  onEnlaceCreated,
}) => {
  const [loadingSwitches, setLoadingSwitches] = useState(true);
  const [loadingPorts, setLoadingPorts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [availableSwitches, setAvailableSwitches] = useState<DestinationSwitchOption[]>([]);
  const [selectedDestSwitchId, setSelectedDestSwitchId] = useState<string>('');
  
  const [destSfpPorts, setDestSfpPorts] = useState<SfpPortOption[]>([]);
  const [selectedDestPortId, setSelectedDestPortId] = useState<string>('');
  
  const [esPrincipal, setEsPrincipal] = useState<boolean>(true);

  // Load destination switches (excluding switchOrigen)
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchDestSwitches = async () => {
      try {
        setLoadingSwitches(true);
        setErrorMessage(null);

        const { data, error } = await supabase
          .from('equipos')
          .select('id, codigo, modelo, rol_red, rack_id, rack:racks(id, codigo, ubicacion_especifica)')
          .eq('tipo', 'switch')
          .neq('id', switchOrigen.id)
          .order('codigo', { ascending: true });

        if (error) throw error;

        if (isMounted) {
          const list = (data as any[]) || [];
          setAvailableSwitches(list);
          if (list.length > 0) {
            setSelectedDestSwitchId(list[0].id);
          } else {
            setSelectedDestSwitchId('');
          }
        }
      } catch (err: any) {
        console.error('Error fetching switches for trunk link:', err);
        if (isMounted) {
          setErrorMessage('Error al cargar switches disponibles: ' + (err.message || String(err)));
        }
      } finally {
        if (isMounted) setLoadingSwitches(false);
      }
    };

    fetchDestSwitches();

    return () => {
      isMounted = false;
    };
  }, [isOpen, switchOrigen.id]);

  // When selected destination switch changes, fetch its free SFP ports
  useEffect(() => {
    if (!isOpen || !selectedDestSwitchId) {
      setDestSfpPorts([]);
      setSelectedDestPortId('');
      return;
    }

    let isMounted = true;
    const fetchFreeSfpPorts = async () => {
      try {
        setLoadingPorts(true);
        setErrorMessage(null);

        // 1. Fetch SFP ports for this destination switch
        const { data: portsData, error: portsErr } = await supabase
          .from('puertos_switch')
          .select('id, numero_puerto, tipo_puerto, uso, descripcion')
          .eq('switch_id', selectedDestSwitchId)
          .eq('tipo_puerto', 'sfp')
          .order('numero_puerto', { ascending: true });

        if (portsErr) throw portsErr;

        // 2. Fetch allEnlaces in enlaces_switch to find which ports are occupied
        const { data: enlacesData, error: enlacesErr } = await supabase
          .from('enlaces_switch')
          .select('puerto_origen_id, puerto_destino_id');

        if (enlacesErr) throw enlacesErr;

        // Set of occupied port IDs
        const occupiedSet = new Set<string>();
        (enlacesData || []).forEach(e => {
          if (e.puerto_origen_id) occupiedSet.add(e.puerto_origen_id);
          if (e.puerto_destino_id) occupiedSet.add(e.puerto_destino_id);
        });

        // Filter destination SFP ports that are free
        const freePorts = (portsData || []).filter(p => !occupiedSet.has(p.id));

        if (isMounted) {
          setDestSfpPorts(freePorts);
          if (freePorts.length > 0) {
            setSelectedDestPortId(freePorts[0].id);
          } else {
            setSelectedDestPortId('');
          }
        }
      } catch (err: any) {
        console.error('Error fetching destination SFP ports:', err);
        if (isMounted) {
          setErrorMessage('Error al verificar puertos SFP del switch destino: ' + (err.message || String(err)));
        }
      } finally {
        if (isMounted) setLoadingPorts(false);
      }
    };

    fetchFreeSfpPorts();

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedDestSwitchId]);

  if (!isOpen) return null;

  const selectedDestSwitch = availableSwitches.find(s => s.id === selectedDestSwitchId);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedDestSwitchId) {
      setErrorMessage('Seleccione un switch de destino.');
      return;
    }

    if (selectedDestSwitchId === switchOrigen.id) {
      setErrorMessage('El switch de origen y de destino deben ser diferentes.');
      return;
    }

    if (!selectedDestPortId) {
      setErrorMessage('Seleccione un puerto SFP libre en el switch destino.');
      return;
    }

    try {
      setSubmitting(true);

      // Insert trunk link into enlaces_switch
      // Note: ONLY use switch_origen_id, switch_destino_id, puerto_origen_id, puerto_destino_id, es_principal
      const { error } = await supabase
        .from('enlaces_switch')
        .insert({
          switch_origen_id: switchOrigen.id,
          switch_destino_id: selectedDestSwitchId,
          puerto_origen_id: puertoOrigen.puerto_switch_id,
          puerto_destino_id: selectedDestPortId,
          es_principal: esPrincipal,
        });

      if (error) {
        // Map database error codes or constraints to clear human messages
        if (error.code === '23514' || error.message.includes('enlaces_switch_switches_distintos_chk')) {
          throw new Error('El switch de origen y el switch de destino deben ser diferentes.');
        }
        if (error.code === '23505' || error.message.includes('duplicate key') || error.message.includes('uidx')) {
          throw new Error('El puerto seleccionado ya se encuentra en uso por otro enlace troncal.');
        }
        throw error;
      }

      onEnlaceCreated();
      onClose();
    } catch (err: any) {
      console.error('Error inserting trunk link:', err);
      setErrorMessage(err.message || 'Error al crear el enlace troncal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-180 ease-out">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-amber-200/80 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-white rounded-lg shadow-sm">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 font-sans tracking-tight">
                Configurar Enlace Troncal
              </h2>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Interconexión de fibra óptica SFP entre switches de red
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-sans leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* 1. Puerto SFP de este switch (Solo lectura) */}
          <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[10px] uppercase font-bold text-amber-900 tracking-wider">
                Switch de Origen (Local)
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-200 text-amber-950 rounded font-bold text-[10px] border border-amber-300">
                <Radio className="w-3 h-3 text-amber-800" />
                Puerto SFP #{puertoOrigen.numero_puerto}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-amber-700" />
                <span className="text-sm font-bold font-mono text-slate-900">
                  {switchOrigen.codigo}
                </span>
                {switchOrigen.rol_red && (
                  <span className="text-[10px] font-sans font-semibold px-2 py-0.2 rounded bg-amber-200/80 text-amber-900 border border-amber-300">
                    {formatRolRed(switchOrigen.rol_red)}
                  </span>
                )}
                {switchOrigen.modelo && (
                  <span className="text-xs text-slate-500 font-sans">
                    ({switchOrigen.modelo})
                  </span>
                )}
              </div>
              <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                SFP Libre
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center -my-2 relative z-10">
            <div className="p-1.5 bg-white border border-slate-300 rounded-full text-slate-500 shadow-2xs">
              <ArrowRightLeft className="w-4 h-4 text-blue-600" />
            </div>
          </div>

          {/* 2. Switch Destino */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 font-sans">
              Switch Destino <span className="text-rose-500">*</span>
            </label>
            {loadingSwitches ? (
              <div className="flex items-center gap-2 p-2.5 text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200 font-sans">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span>Cargando switches disponibles...</span>
              </div>
            ) : availableSwitches.length === 0 ? (
              <div className="p-3 text-xs text-amber-800 bg-amber-50 rounded-lg border border-amber-200 font-sans">
                No hay otros switches registrados en el sistema para interconectar.
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  value={selectedDestSwitchId}
                  onChange={(e) => setSelectedDestSwitchId(e.target.value)}
                  disabled={submitting}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                >
                  {availableSwitches.map((sw) => {
                    const rackStr = sw.rack?.codigo ? `Rack: ${sw.rack.codigo}` : 'Sin Rack';
                    const rolStr = sw.rol_red ? `[${formatRolRed(sw.rol_red)}]` : '';
                    return (
                      <option key={sw.id} value={sw.id}>
                        {sw.codigo} {rolStr} · {rackStr} {sw.modelo ? `(${sw.modelo})` : ''}
                      </option>
                    );
                  })}
                </select>

                {/* Selected Switch Info Preview */}
                {selectedDestSwitch && (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Server className="w-3.5 h-3.5 text-slate-500" />
                      <span className="font-bold text-slate-800">{selectedDestSwitch.codigo}</span>
                      {selectedDestSwitch.rol_red ? (
                        <span className="text-[10px] font-sans font-semibold px-2 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200">
                          {formatRolRed(selectedDestSwitch.rol_red)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-sans italic">
                          Sin rol asignado
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 font-sans">
                      {selectedDestSwitch.rack?.codigo ? (
                        <span>
                          📍 {selectedDestSwitch.rack.codigo}{' '}
                          {selectedDestSwitch.rack.ubicacion_especifica ? `(${selectedDestSwitch.rack.ubicacion_especifica})` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Sin ubicación de rack</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Puerto SFP Destino */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 font-sans">
              Puerto SFP Destino Libre <span className="text-rose-500">*</span>
            </label>
            {loadingPorts ? (
              <div className="flex items-center gap-2 p-2.5 text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200 font-sans">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                <span>Buscando puertos SFP libres en el switch destino...</span>
              </div>
            ) : destSfpPorts.length === 0 ? (
              <div className="p-3 text-xs text-amber-900 bg-amber-50 rounded-lg border border-amber-300 font-sans flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>No hay puertos SFP libres</strong> en {selectedDestSwitch?.codigo || 'el switch seleccionado'}. 
                  Todos los puertos de fibra óptica están ocupados o configurados en otros enlaces troncales.
                </div>
              </div>
            ) : (
              <select
                value={selectedDestPortId}
                onChange={(e) => setSelectedDestPortId(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-2xs"
              >
                {destSfpPorts.map((p) => (
                  <option key={p.id} value={p.id}>
                    Puerto SFP #{p.numero_puerto} {p.descripcion ? `— ${p.descripcion}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 4. Tipo de Enlace: Principal o Respaldo */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-bold text-slate-700 font-sans">
              Tipo de Enlace Troncal
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  esPrincipal
                    ? 'bg-amber-50/70 border-amber-500 ring-2 ring-amber-500/20'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="tipo_enlace"
                  checked={esPrincipal}
                  onChange={() => setEsPrincipal(true)}
                  disabled={submitting}
                  className="mt-1 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 font-mono">
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                    <span>Enlace Principal</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-sans mt-0.5 leading-relaxed">
                    Ruta primaria y preferente para el tráfico troncal entre switches.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  !esPrincipal
                    ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/20'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="tipo_enlace"
                  checked={!esPrincipal}
                  onChange={() => setEsPrincipal(false)}
                  disabled={submitting}
                  className="mt-1 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 font-mono">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Enlace de Respaldo</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-sans mt-0.5 leading-relaxed">
                    Vía redundante para conmutación por falla (STP / failover).
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedDestPortId || destSfpPorts.length === 0}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                submitting || !selectedDestPortId || destSfpPorts.length === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-700 text-white hover:shadow-md'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Conectando Enlace...</span>
                </>
              ) : (
                <>
                  <Radio className="w-3.5 h-3.5" />
                  <span>Establecer Enlace Troncal</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
