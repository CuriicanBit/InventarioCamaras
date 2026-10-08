import React, { useState, useEffect, useMemo } from 'react';
import {
  Briefcase,
  GraduationCap,
  Wifi,
  Camera,
  Cpu,
  BookOpen,
  FlaskConical,
  Link,
  HelpCircle,
  X,
  Palette,
  Layers,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Vlan } from '../types/database';

export interface EditarVlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  vlan?: Vlan | null;
  mode?: 'create' | 'edit';
  onSaved?: (vlan: Vlan) => void;
}

const PRESET_COLORS = [
  '#2563EB', // Azul
  '#0891B2', // Cyan
  '#059669', // Esmeralda
  '#7C3AED', // Violeta
  '#D97706', // Ámbar
  '#DC2626', // Rojo
  '#4F46E5', // Índigo
  '#DB2777', // Rosa
];

const DEFAULT_USOS = [
  'Administrativa',
  'Alumnos',
  'CCTV',
  'Debriefing',
  'Investigación',
  'IOT',
  'Trunk',
  'WiFi'
];

export const normalizeUso = (str: string): string => {
  return (str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

export const renderIconoPorUso = (usoStr: string, className = 'w-4 h-4') => {
  const norm = normalizeUso(usoStr);

  switch (norm) {
    case 'administrativa':
      return <Briefcase className={className} />;
    case 'alumnos':
      return <GraduationCap className={className} />;
    case 'wifi':
      return <Wifi className={className} />;
    case 'cctv':
      return <Camera className={className} />;
    case 'iot':
      return <Cpu className={className} />;
    case 'debriefing':
      return <BookOpen className={className} />;
    case 'investigacion':
      return <FlaskConical className={className} />;
    case 'trunk':
      return <Link className={className} />;
    default:
      return <HelpCircle className={className} />;
  }
};

export const EditarVlanDialog: React.FC<EditarVlanDialogProps> = ({
  isOpen,
  onClose,
  vlan,
  mode,
  onSaved
}) => {
  const isEditMode = (mode ? mode === 'edit' : !!vlan);

  // Form states
  const [numero, setNumero] = useState<string>('');
  const [nombre, setNombre] = useState<string>('');
  const [uso, setUso] = useState<string>('');
  const [color, setColor] = useState<string>('#2563EB');
  const [descripcion, setDescripcion] = useState<string>('');

  // UI & Feedback states
  const [usosSugeridos, setUsosSugeridos] = useState<string[]>(DEFAULT_USOS);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset or initialize values when dialog opens or vlan prop changes
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      if (isEditMode && vlan) {
        setNumero(String(vlan.numero));
        setNombre(vlan.nombre || '');
        setUso(vlan.uso || '');
        setColor(vlan.color || '#2563EB');
        setDescripcion(vlan.descripcion || '');
      } else {
        setNumero('');
        setNombre('');
        setUso('');
        setColor('#2563EB');
        setDescripcion('');
      }

      // Query distinct existing 'uso' from database
      const fetchDistinctUsos = async () => {
        try {
          const { data, error } = await supabase
            .from('vlans')
            .select('uso')
            .not('uso', 'is', null)
            .order('uso');

          if (!error && data) {
            const dbUsos = (data as Array<{ uso: string | null }>)
              .map(item => item.uso?.trim())
              .filter((u): u is string => Boolean(u && u.length > 0));

            const combined = Array.from(new Set([...DEFAULT_USOS, ...dbUsos])).sort();
            setUsosSugeridos(combined);
          }
        } catch (err) {
          console.error('Error fetching distinct usos from vlans:', err);
        }
      };

      fetchDistinctUsos();
    }
  }, [isOpen, vlan, isEditMode]);

  // Active icon corresponding to current 'uso'
  const currentIcon = useMemo(() => {
    return renderIconoPorUso(uso, 'w-4 h-4 text-slate-700');
  }, [uso]);

  const previewIcon = useMemo(() => {
    return renderIconoPorUso(uso, 'w-3.5 h-3.5 text-slate-700');
  }, [uso]);

  // Color normalization / validation
  const effectiveColor = useMemo(() => {
    const trimmed = (color || '').trim();
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(trimmed)) {
      return trimmed;
    }
    return '#2563EB';
  }, [color]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const parsedNum = parseInt(numero.trim(), 10);
    const cleanNombre = nombre.trim();
    const cleanUso = uso.trim();
    const cleanDescripcion = descripcion.trim() || null;

    // 1. Validar número > 0
    if (isNaN(parsedNum) || parsedNum <= 0 || parsedNum > 4094) {
      setErrorMessage('El ID de VLAN debe ser un número entero entre 1 y 4094.');
      return;
    }

    // 2. Validar nombre no vacío
    if (!cleanNombre) {
      setErrorMessage('Debe ingresar un Nombre de Red para la VLAN.');
      return;
    }

    // 3. Validar uso no vacío
    if (!cleanUso) {
      setErrorMessage('Debe especificar o seleccionar el Uso de la VLAN.');
      return;
    }

    // 4. Validar color válido
    if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(effectiveColor)) {
      setErrorMessage('El color seleccionado no es un código hexadecimal válido.');
      return;
    }

    try {
      setIsSubmitting(true);

      // Si es modo nuevo, verificar unicidad de número en Supabase
      if (!isEditMode) {
        const { data: existing, error: checkError } = await supabase
          .from('vlans')
          .select('id, numero')
          .eq('numero', parsedNum)
          .maybeSingle();

        if (checkError) {
          throw checkError;
        }

        if (existing) {
          setErrorMessage(`La VLAN con ID ${parsedNum} ya existe en el catálogo.`);
          setIsSubmitting(false);
          return;
        }
      }

      // Preparar payload estricto (solo columnas requeridas, sin tocar columnas legacy)
      const payload = {
        numero: parsedNum,
        nombre: cleanNombre,
        uso: cleanUso,
        color: effectiveColor,
        descripcion: cleanDescripcion,
      };

      let savedRecord: Vlan;

      if (isEditMode && vlan) {
        const { data, error } = await supabase
          .from('vlans')
          .update(payload)
          .eq('id', vlan.id)
          .select('*')
          .single();

        if (error) throw error;
        savedRecord = data;
      } else {
        const { data, error } = await supabase
          .from('vlans')
          .insert([payload])
          .select('*')
          .single();

        if (error) throw error;
        savedRecord = data;
      }

      if (onSaved) {
        onSaved(savedRecord);
      }
      onClose();
    } catch (err: any) {
      console.error('Error al guardar la VLAN:', err);
      setErrorMessage(err.message || 'Ocurrió un error inesperado al guardar la VLAN.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-180 ease-out"
        style={{
          borderTopColor: effectiveColor,
          borderTopWidth: '3px'
        }}
      >
        {/* ========================================== */}
        {/* BLOQUE 1: HEADER DINÁMICO */}
        {/* ========================================== */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between font-mono">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>{isEditMode ? 'Editar VLAN' : 'Nueva VLAN'}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer disabled:opacity-50 p-1 rounded hover:bg-slate-200/50 transition-colors"
            title="Cerrar diálogo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ========================================== */}
        {/* FORMULARIO */}
        {/* ========================================== */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs font-mono">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-red-700 text-xs animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* ========================================== */}
          {/* BLOQUE 2: FILA 1 (grid 1:3) */}
          {/* ID VLAN + Nombre de Red */}
          {/* ========================================== */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-[11px] text-slate-600 mb-1 font-medium">
                ID VLAN *
              </label>
              <input
                type="number"
                min={1}
                max={4094}
                required
                disabled={isEditMode || isSubmitting}
                autoFocus={!isEditMode}
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="10"
                className={`w-full px-3 py-1.5 border border-slate-300 rounded font-bold text-xs transition-colors ${
                  isEditMode
                    ? 'bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200'
                    : 'bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600'
                }`}
              />
              {isEditMode && (
                <span className="text-[10px] text-slate-400 mt-0.5 block leading-tight">
                  No editable
                </span>
              )}
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] text-slate-600 mb-1 font-medium">
                Nombre de Red *
              </label>
              <input
                type="text"
                required
                disabled={isSubmitting}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="ej. Datos Funcionarios, WiFi Corporativo"
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
              />
            </div>
          </div>

          {/* ========================================== */}
          {/* BLOQUE 3: FILA 2 - CAMPO NUEVO "Uso" */}
          {/* Combobox editable con datalist nativo + Icono a la derecha */}
          {/* ========================================== */}
          <div>
            <label className="block text-[11px] text-slate-600 mb-1 font-medium">
              Uso *
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  list="vlans-uso-datalist"
                  required
                  disabled={isSubmitting}
                  value={uso}
                  onChange={(e) => setUso(e.target.value)}
                  placeholder="Selecciona o escribe un uso (ej. Administrativa, WiFi, CCTV...)"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
                />
                <datalist id="vlans-uso-datalist">
                  {usosSugeridos.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>

              {/* Icono a la derecha del input según mapa del frontend */}
              <div
                className="w-8 h-8 shrink-0 rounded border border-slate-300 bg-slate-50 flex items-center justify-center text-slate-700 shadow-2xs"
                title={`Icono asociado: ${uso.trim() || 'Sin asignar'}`}
              >
                {currentIcon}
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">
              Sugerencias del catálogo con autocompletado libre. El icono se actualiza en tiempo real.
            </p>
          </div>

          {/* ========================================== */}
          {/* BLOQUE 4: FILA 3 - COLOR IDENTIFICADOR & PREVIEW EN VIVO */}
          {/* Paleta 8 colores + Personalizado + Live Chip Preview */}
          {/* ========================================== */}
          <div>
            <label className="block text-[11px] text-slate-600 mb-1.5 font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-slate-500" />
                <span>Color Identificador</span>
              </span>
              <span className="text-[10px] text-slate-400 uppercase font-mono">
                {effectiveColor}
              </span>
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
              {/* Paleta de 8 colores + selector Personalizado */}
              <div className="p-2.5 border border-slate-200 rounded-lg bg-slate-50 flex flex-wrap items-center gap-2">
                {PRESET_COLORS.map((c) => {
                  const isSelected = effectiveColor.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setColor(c)}
                      className={`w-5.5 h-5.5 rounded-full border transition-all cursor-pointer ${
                        isSelected
                          ? 'scale-125 border-slate-900 ring-2 ring-indigo-500/50 shadow-xs'
                          : 'border-black/20 hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  );
                })}

                <div className="h-4 w-px bg-slate-300 mx-0.5" />

                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    disabled={isSubmitting}
                    value={effectiveColor}
                    onChange={(e) => setColor(e.target.value)}
                    title="Seleccionar color personalizado"
                    className="w-6 h-6 p-0 border border-slate-300 rounded cursor-pointer bg-white"
                  />
                  <span className="text-[10px] text-slate-500">Personalizado</span>
                </div>
              </div>

              {/* PREVIEW EN VIVO del chip tal como aparecerá en el mapa de puertos */}
              <div
                className="rounded-lg border px-3.5 py-2.5 transition-all flex flex-col justify-center min-h-[58px]"
                style={{
                  borderColor: `${effectiveColor}80`,
                  backgroundColor: `${effectiveColor}0D`,
                  boxShadow: `0 0 14px ${effectiveColor}33`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs ring-1 ring-white"
                    style={{ backgroundColor: effectiveColor }}
                  />
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 truncate">
                    <span className="shrink-0">{previewIcon}</span>
                    <span className="truncate">
                      VLAN {numero.trim() || '---'} · {nombre.trim() || 'Nombre de Red'}
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-slate-600 pl-4.5 flex items-center gap-1 truncate">
                  <span className="text-slate-400">Uso:</span>
                  <span className="font-semibold text-slate-800 truncate">
                    {uso.trim() || 'Sin asignar'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================== */}
          {/* BLOQUE 5: FILA 4 - DESCRIPCIÓN (OPCIONAL) */}
          {/* ========================================== */}
          <div>
            <label className="block text-[11px] text-slate-600 mb-1 font-medium">
              Descripción (opcional)
            </label>
            <textarea
              rows={2}
              disabled={isSubmitting}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Notas adicionales (opcional)"
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors resize-none"
            />
          </div>

          {/* ========================================== */}
          {/* BLOQUE 6: FOOTER */}
          {/* [Cancelar] [Guardar Cambios] */}
          {/* ========================================== */}
          <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded cursor-pointer disabled:opacity-50 transition-colors text-xs font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !numero.trim() || !nombre.trim() || !uso.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-white rounded font-semibold disabled:opacity-50 cursor-pointer shadow-xs transition-all text-xs"
              style={{
                backgroundColor: effectiveColor,
                boxShadow: `0 2px 10px ${effectiveColor}40`
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar Cambios</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditarVlanDialog;
