import React, { useState } from 'react';
import { Trash2, AlertTriangle, AlertCircle, X, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: 'camara' | 'equipo';
  itemId: string;
  itemCode: string;
  onSuccess: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  itemType,
  itemId,
  itemCode,
  onSuccess,
}) => {
  const [typedCode, setTypedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isMatch = typedCode.trim() === itemCode.trim();

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatch) return;

    try {
      setLoading(true);
      setErrorMsg(null);

      const table = itemType === 'camara' ? 'camaras' : 'equipos';
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error deleting permanently:', err);
      setErrorMsg(err.message || 'Error al eliminar el registro permanentemente');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg border border-red-300 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-mono text-xs"
      >
        {/* Red header with alert */}
        <div className="p-4 border-b border-red-200 bg-red-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-900 font-bold">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <span className="text-sm">Eliminar Registro Definitivamente</span>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-sm font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleDelete} className="p-5 space-y-4">
          {/* Prominent warning */}
          <div className="p-3.5 bg-red-50 border-2 border-red-300 rounded-lg text-red-950 space-y-2">
            <div className="flex items-center gap-2 font-bold text-red-800 text-[11px] uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Acción Irreversible · Supresión Permanente</span>
            </div>
            <p className="text-[11px] text-red-900 leading-relaxed font-sans">
              Esta acción <strong>BORRA el registro por completo de la base de datos</strong> (operación DELETE física en tabla <code className="bg-red-100 px-1 py-0.5 rounded font-mono text-[10px]">{itemType === 'camara' ? 'camaras' : 'equipos'}</code>).
            </p>
            <p className="text-[11px] text-red-900 leading-relaxed font-sans">
              Úsela <strong>únicamente para registros de prueba, duplicados accidentales o errores de digitación</strong> que nunca debieron existir.
            </p>
            <div className="p-2 bg-white/80 rounded border border-red-200 font-semibold text-[10px] text-red-700">
              ⚠️ A diferencia de "Retirar de instalación", esta acción <u>NO se puede deshacer</u> y <u>NO queda registrada en ningún historial técnico</u>.
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-red-100 border border-red-300 text-red-800 rounded text-xs flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-slate-800 font-bold mb-1.5">
              Para confirmar, escriba el código exacto del dispositivo (<span className="text-red-700 select-all font-mono">{itemCode}</span>):
            </label>
            <input
              type="text"
              autoFocus
              value={typedCode}
              onChange={(e) => setTypedCode(e.target.value)}
              placeholder={`Escriba "${itemCode}" aquí`}
              className="w-full px-3 py-2 border-2 border-slate-300 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded bg-white text-xs font-bold text-slate-900"
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
              disabled={!isMatch || loading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{loading ? 'Eliminando...' : 'Eliminar Definitivamente'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
