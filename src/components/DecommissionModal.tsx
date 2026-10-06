import React, { useState } from 'react';
import { Archive, AlertCircle, CheckCircle, X, Wrench, Tag, FileText, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { EstadoCicloVida } from '../types/database';

interface DecommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: 'camara' | 'equipo' | 'punto_red';
  itemId: string;
  itemCode: string;
  onSuccess: (nuevoEstado: EstadoCicloVida) => void;
}

export const DecommissionModal: React.FC<DecommissionModalProps> = ({
  isOpen,
  onClose,
  itemType,
  itemId,
  itemCode,
  onSuccess,
}) => {
  const [nuevoEstado, setNuevoEstado] = useState<EstadoCicloVida>('retirado_pendiente_bodega');
  const [motivo, setMotivo] = useState<string>('mantenimiento');
  const [ticketReferencia, setTicketReferencia] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  const [tecnico, setTecnico] = useState<string>('Cuadrilla Terreno');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRetirar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErrorMsg(null);

      // 1. Update device: set estado_ciclo_vida and if not 'instalado', clear physical connection fields
      if (itemType === 'camara') {
        const payload: any = {
          estado_ciclo_vida: nuevoEstado,
        };
        if (nuevoEstado !== 'instalado') {
          payload.rack_id = null;
          payload.patch_panel_id = null;
          payload.puerto_patch = null;
          payload.switch_id = null;
          payload.puerto_switch = null;
          payload.nvr_id = null;
          payload.canal_nvr = null;
        }

        const { error: camErr } = await supabase
          .from('camaras')
          .update(payload)
          .eq('id', itemId);

        if (camErr) throw camErr;
      } else if (itemType === 'punto_red') {
        const payload: any = {
          estado_ciclo_vida: nuevoEstado,
        };
        if (nuevoEstado !== 'instalado') {
          payload.rack_id = null;
          payload.patch_panel_id = null;
          payload.puerto_patch = null;
          payload.switch_id = null;
          payload.puerto_switch_id = null;
        }

        const { error: prErr } = await supabase
          .from('puntos_red')
          .update(payload)
          .eq('id', itemId);

        if (prErr) throw prErr;
      } else {
        const payload: any = {
          estado_ciclo_vida: nuevoEstado,
        };
        if (nuevoEstado !== 'instalado') {
          payload.rack_id = null;
          payload.posicion_u_inicio = null;
          payload.posicion_u_fin = null;
        }

        const { error: eqErr } = await supabase
          .from('equipos')
          .update(payload)
          .eq('id', itemId);

        if (eqErr) throw eqErr;
      }

      // 2. Create history record in historial_mantenimiento
      const motivoLabelMap: Record<string, string> = {
        reemplazo: 'Reemplazo tecnológico / nuevo equipo',
        mantenimiento: 'Retiro para mantenimiento / taller',
        cambio_de_cableado: 'Cambio de cableado / reubicación física',
        baja_definitiva: 'Falla irreparable / obsolescencia',
        otro: 'Otro motivo operativo',
      };

      const estadoLabelMap: Record<string, string> = {
        retirado_pendiente_bodega: 'Retirado - Pendiente de bodega',
        en_bodega: 'En Bodega / Almacén central',
        dado_de_baja: 'Dado de Baja definitiva',
      };

      const desc = `[RETIRO DE INSTALACIÓN] Dispositivo ${itemCode} desinstalado. ` +
        `Nuevo estado: ${estadoLabelMap[nuevoEstado] || nuevoEstado}. ` +
        `Motivo: ${motivoLabelMap[motivo] || motivo}. ` +
        (observaciones.trim() ? `Observaciones: ${observaciones.trim()}` : '');

      const { error: histErr } = await supabase
        .from('historial_mantenimiento')
        .insert([{
          entidad_tipo: itemType,
          entidad_id: itemId,
          tipo_intervencion: 'recambio',
          fecha: new Date().toISOString(),
          tecnico_responsable: tecnico.trim() || 'Cuadrilla Terreno',
          descripcion: desc,
          ticket_referencia: ticketReferencia.trim() || null,
        }]);

      if (histErr) {
        console.warn('Warning inserting history entry:', histErr);
      }

      onSuccess(nuevoEstado);
      onClose();
    } catch (err: any) {
      console.error('Error in decommission:', err);
      setErrorMsg(err.message || 'Error al retirar el dispositivo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-mono text-xs"
      >
        <div className="p-4 border-b border-amber-200 bg-amber-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-900 font-bold">
            <Archive className="w-4 h-4 text-amber-600" />
            <span>Retirar de Instalación (Salida de Servicio)</span>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-sm font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleRetirar} className="p-5 space-y-4">
          <div className="bg-amber-50/70 p-3 rounded border border-amber-200 text-amber-900 space-y-1">
            <p className="font-semibold text-[11px]">
              Dispositivo: <span className="font-mono text-blue-700 font-bold">{itemCode}</span> ({itemType === 'camara' ? 'Cámara' : 'Equipo Rack'})
            </p>
            <p className="text-[10px] text-amber-800 leading-relaxed font-sans">
              Esta acción libera los puertos, patch panels y/o unidades de rack asociados. El dispositivo pasará a Bodega/Baja y quedará registrado en la bitácora técnica con su número de ticket.
            </p>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded text-xs flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-slate-700 font-bold mb-1">
              Nuevo Estado del Ciclo de Vida *
            </label>
            <select
              value={nuevoEstado}
              onChange={(e) => setNuevoEstado(e.target.value as EstadoCicloVida)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-semibold text-slate-800"
            >
              <option value="retirado_pendiente_bodega">Retirado — Pendiente de ingreso a bodega</option>
              <option value="en_bodega">En Bodega — Almacén central de repuestos</option>
              <option value="dado_de_baja">Dado de Baja — Falla definitiva o desecho</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-700 font-bold mb-1">
              Motivo del Retiro *
            </label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-slate-800"
            >
              <option value="reemplazo">Reemplazo tecnológico / upgrade de modelo</option>
              <option value="mantenimiento">Mantenimiento preventivo / correctivo en taller</option>
              <option value="cambio_de_cableado">Cambio de cableado / reubicación física de sala</option>
              <option value="baja_definitiva">Baja definitiva / daño irreparable</option>
              <option value="otro">Otro motivo operativo</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-700 font-bold mb-1">
              Número de Ticket / OT de Referencia (Opcional)
            </label>
            <input
              type="text"
              value={ticketReferencia}
              onChange={(e) => setTicketReferencia(e.target.value)}
              placeholder="ej. OT-2024-8841 o TKT-9921"
              className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-amber-600 bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-700 font-bold mb-1">
              Técnico / Cuadrilla Responsable
            </label>
            <input
              type="text"
              value={tecnico}
              onChange={(e) => setTecnico(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-700 font-bold mb-1">
              Observaciones del Desmontaje
            </label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Detalle de estado físico, cables desconectados o destino físico..."
              className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-amber-600 bg-white text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-xs shadow-xs disabled:opacity-50"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{loading ? 'Procesando...' : 'Confirmar Retiro'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
