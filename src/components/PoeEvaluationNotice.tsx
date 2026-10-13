import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getPoeEstandarLabel } from '../utils/poeUtils';

export type PoeEvaluationStatus = 
  | 'ok' 
  | 'sin_poe' 
  | 'estandar_insuficiente' 
  | 'estandar_sin_datos' 
  | 'sin_definir';

export interface PoeEvaluationNoticeProps {
  puertoSwitchId?: string | null;
  switchId?: string | null;
  numeroPuerto?: number | null;
  poeRequerido?: string | null;
  alimentacion?: string | null;
  switchPoeEstandar?: string | null;
  className?: string;
}

export const PoeEvaluationNotice: React.FC<PoeEvaluationNoticeProps> = ({
  puertoSwitchId,
  switchId,
  numeroPuerto,
  poeRequerido,
  alimentacion,
  switchPoeEstandar,
  className = '',
}) => {
  const [evalStatus, setEvalStatus] = useState<PoeEvaluationStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [detectedSwitchEstandar, setDetectedSwitchEstandar] = useState<string | null>(switchPoeEstandar || null);

  useEffect(() => {
    if (switchPoeEstandar !== undefined && switchPoeEstandar !== null) {
      setDetectedSwitchEstandar(switchPoeEstandar);
    }
  }, [switchPoeEstandar]);

  useEffect(() => {
    let isMounted = true;

    const evaluate = async () => {
      let targetPortId = puertoSwitchId || null;

      // Si no tenemos puertoSwitchId pero sí switchId y numeroPuerto, buscar el id del puerto
      if (!targetPortId && switchId && numeroPuerto) {
        try {
          const { data: portRow } = await supabase
            .from('puertos_switch')
            .select('id, switch:equipos(poe_estandar)')
            .eq('switch_id', switchId)
            .eq('numero_puerto', numeroPuerto)
            .maybeSingle();

          if (portRow?.id) {
            targetPortId = portRow.id;
            const sw: any = portRow.switch;
            if (sw?.poe_estandar && isMounted) {
              setDetectedSwitchEstandar(sw.poe_estandar);
            }
          }
        } catch (e) {
          console.error('Error resolving switch port id in PoeEvaluationNotice:', e);
        }
      }

      if (!targetPortId) {
        if (isMounted) {
          setEvalStatus(null);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);

        // Si no tenemos el estándar del switch, lo consultamos en el switch del puerto
        if (!detectedSwitchEstandar) {
          const { data: portData } = await supabase
            .from('puertos_switch')
            .select('switch:equipos(poe_estandar)')
            .eq('id', targetPortId)
            .maybeSingle();

          if (isMounted && portData?.switch) {
            const sw: any = portData.switch;
            if (sw?.poe_estandar) {
              setDetectedSwitchEstandar(sw.poe_estandar);
            }
          }
        }

        const { data, error } = await supabase.rpc('fn_evaluar_poe', {
          p_puerto: targetPortId,
          p_requerido: poeRequerido || null,
        });

        if (error) throw error;

        if (isMounted) {
          setEvalStatus(data as PoeEvaluationStatus);
        }
      } catch (err) {
        console.error('Error evaluating PoE with fn_evaluar_poe:', err);
        if (isMounted) {
          setEvalStatus('sin_definir');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    evaluate();

    return () => {
      isMounted = false;
    };
  }, [puertoSwitchId, switchId, numeroPuerto, poeRequerido]);

  // Si no hay puerto seleccionado, no renderizar nada
  if (!puertoSwitchId && (!switchId || !numeroPuerto)) return null;

  if (loading && !evalStatus) {
    return (
      <div className={`p-2 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-500 flex items-center gap-2 mt-1.5 font-sans animate-pulse ${className}`}>
        <Zap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>Evaluando compatibilidad PoE del puerto...</span>
      </div>
    );
  }

  // REGLA 3: Si la alimentación declarada es inyector o fuente propia,
  // no mostrar avisos ámbar de sin_poe ni de estandar_insuficiente;
  // en su lugar mostrar nota gris "Alimentación declarada: {inyector / fuente propia}"
  const isAlimentacionExterna = alimentacion === 'inyector' || alimentacion === 'fuente_propia';

  if (isAlimentacionExterna && (evalStatus === 'sin_poe' || evalStatus === 'estandar_insuficiente')) {
    const textoAlimentacion = alimentacion === 'inyector' ? 'inyector' : 'fuente propia';
    return (
      <div className={`p-2 bg-slate-100 border border-slate-300 rounded text-[11px] text-slate-600 flex items-center gap-1.5 mt-1.5 font-sans ${className}`}>
        <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span>Alimentación declarada: <strong>{textoAlimentacion}</strong></span>
      </div>
    );
  }

  const switchLabel = detectedSwitchEstandar ? getPoeEstandarLabel(detectedSwitchEstandar) : '';
  const requeridoLabel = poeRequerido ? getPoeEstandarLabel(poeRequerido) : '';

  switch (evalStatus) {
    case 'ok':
      return (
        <div className={`p-2 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-800 flex items-center gap-1.5 mt-1.5 font-sans ${className}`}>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>
            Puerto con PoE compatible{switchLabel ? ` (${switchLabel})` : ''}
          </span>
        </div>
      );

    case 'sin_poe':
      return (
        <div className={`p-2.5 bg-amber-50 border border-amber-300 rounded text-[11px] text-amber-900 flex items-center gap-1.5 mt-1.5 font-sans ${className}`}>
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Este puerto no entrega PoE. El dispositivo necesitará inyector PoE o fuente propia.</span>
        </div>
      );

    case 'estandar_insuficiente':
      return (
        <div className={`p-2.5 bg-amber-50 border border-amber-300 rounded text-[11px] text-amber-900 flex items-center gap-1.5 mt-1.5 font-sans ${className}`}>
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            El switch entrega {switchLabel || 'estándar menor'} y este dispositivo requiere {requeridoLabel || 'estándar mayor'}.
          </span>
        </div>
      );

    case 'estandar_sin_datos':
      return (
        <div className={`p-2 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600 flex items-center gap-1.5 mt-1.5 font-sans ${className}`}>
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>No se pudo verificar el estándar: falta el estándar del switch o el PoE requerido del modelo.</span>
        </div>
      );

    case 'sin_definir':
      return (
        <div className={`p-2 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-500 flex items-center gap-1.5 mt-1.5 font-sans ${className}`}>
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Este switch aún no tiene sus puertos PoE definidos.</span>
        </div>
      );

    default:
      return null;
  }
};
