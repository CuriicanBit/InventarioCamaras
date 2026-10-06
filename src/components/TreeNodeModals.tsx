import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  MapPin, 
  Server, 
  Layers, 
  AlertTriangle, 
  Trash2, 
  Upload, 
  Image as ImageIcon, 
  X, 
  Check, 
  RefreshCw,
  FileText,
  Globe,
  Link2,
  ExternalLink
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Sede, Campus, Edificio, Piso, Rack } from '../types/database';
import { 
  NodeLevel, 
  HierarchyDescendants, 
  fetchHierarchyDescendants, 
  executeCascadedDelete 
} from '../utils/treeHierarchy';

function formatErrorMessage(err: unknown): string {
  if (!err) return 'Error desconocido';
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const e = err as Record<string, any>;
    if (e.message && typeof e.message === 'string') {
      return e.details ? `${e.message} (${e.details})` : e.message;
    }
    if (e.error_description) return String(e.error_description);
    if (e.details) return String(e.details);
    if (e.hint) return `${e.message || 'Error'}: ${e.hint}`;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Error al procesar la solicitud';
    }
  }
  return String(err);
}

interface NodeFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  level: NodeLevel;
  initialData?: any;
  parentId?: string; // Pre-selected parent ID when creating a child
  sedes: Sede[];
  campusList: Campus[];
  edificios: Edificio[];
  pisos: Piso[];
  onClose: () => void;
  onSuccess: () => void;
}

export const NodeFormModal: React.FC<NodeFormModalProps> = ({
  isOpen,
  mode,
  level,
  initialData,
  parentId,
  sedes,
  campusList,
  edificios,
  pisos,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);

    if (mode === 'edit' && initialData) {
      if (level === 'rack') {
        setFormData({
          codigo: initialData.codigo || '',
          piso_id: initialData.piso_id || '',
          altura_u: initialData.altura_u || 42,
          formato: initialData.formato || '',
          ubicacion_especifica: initialData.ubicacion_especifica || '',
          custodia_llave: initialData.custodia_llave || '',
          tecnico_responsable: initialData.tecnico_responsable || '',
          ultima_inspeccion: initialData.ultima_inspeccion || '',
          anotaciones: initialData.anotaciones || '',
        });
      } else if (level === 'piso') {
        setFormData({
          nombre: initialData.nombre || '',
          edificio_id: initialData.edificio_id || '',
          plano_url: initialData.plano_url || '',
          plano_escala: initialData.plano_escala || '',
        });
      } else if (level === 'edificio') {
        setFormData({
          nombre: initialData.nombre || '',
          campus_id: initialData.campus_id || '',
        });
      } else if (level === 'campus') {
        setFormData({
          nombre: initialData.nombre || '',
          sede_id: initialData.sede_id || '',
        });
      } else {
        setFormData({
          nombre: initialData.nombre || '',
        });
      }
    } else {
      // Create defaults per level
      if (level === 'rack') {
        setFormData({
          codigo: '',
          piso_id: parentId || pisos[0]?.id || '',
          altura_u: 42,
          formato: '42U Gabinete Cerrado Mural/Piso (EIA-310-D)',
          ubicacion_especifica: '',
          custodia_llave: '',
          tecnico_responsable: '',
          ultima_inspeccion: new Date().toISOString().split('T')[0],
          anotaciones: '',
        });
      } else if (level === 'piso') {
        setFormData({
          nombre: '',
          edificio_id: parentId || edificios[0]?.id || '',
          plano_url: '',
          plano_escala: '1m = 32px',
        });
      } else if (level === 'edificio') {
        setFormData({
          nombre: '',
          campus_id: parentId || campusList[0]?.id || '',
        });
      } else if (level === 'campus') {
        setFormData({
          nombre: '',
          sede_id: parentId || sedes[0]?.id || '',
        });
      } else {
        setFormData({
          nombre: '',
        });
      }
    }
  }, [isOpen, mode, level, initialData, parentId, sedes, campusList, edificios, pisos]);

  if (!isOpen) return null;

  // Handle plan file upload for Piso
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('El archivo es demasiado grande (máximo 5MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      setFormData((prev: any) => ({
        ...prev,
        plano_url: result,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    try {
      const tableName = 
        level === 'sede' ? 'sedes' :
        level === 'campus' ? 'campus' :
        level === 'edificio' ? 'edificios' :
        level === 'piso' ? 'pisos' : 'racks';

      // Build clean, type-safe payload with only actual database columns
      let payload: Record<string, any> = {};

      if (level === 'sede') {
        payload = {
          nombre: formData.nombre?.trim(),
        };
      } else if (level === 'campus') {
        if (!formData.sede_id) {
          throw new Error('Primero debes crear y seleccionar una Sede.');
        }
        payload = {
          sede_id: formData.sede_id,
          nombre: formData.nombre?.trim(),
        };
      } else if (level === 'edificio') {
        if (!formData.campus_id) {
          throw new Error('Primero debes crear y seleccionar un Campus.');
        }
        payload = {
          campus_id: formData.campus_id,
          nombre: formData.nombre?.trim(),
        };
      } else if (level === 'piso') {
        if (!formData.edificio_id) {
          throw new Error('Primero debes crear y seleccionar un Edificio.');
        }
        payload = {
          edificio_id: formData.edificio_id,
          nombre: formData.nombre?.trim(),
          plano_url: formData.plano_url?.trim() || null,
          plano_escala: formData.plano_escala?.trim() || null,
        };
      } else if (level === 'rack') {
        if (!formData.piso_id) {
          throw new Error('Primero debes crear y seleccionar un Piso.');
        }
        payload = {
          codigo: formData.codigo?.trim(),
          piso_id: formData.piso_id,
          altura_u: parseInt(formData.altura_u, 10) || 42,
          formato: formData.formato?.trim() || null,
          ubicacion_especifica: formData.ubicacion_especifica?.trim() || null,
          custodia_llave: formData.custodia_llave?.trim() || null,
          tecnico_responsable: formData.tecnico_responsable?.trim() || null,
          ultima_inspeccion: formData.ultima_inspeccion?.trim() ? formData.ultima_inspeccion.trim() : null,
          anotaciones: formData.anotaciones?.trim() || null,
        };
      }

      if (mode === 'create') {
        const { error } = await supabase.from(tableName).insert([payload]);
        if (error) throw error;
      } else {
        const id = initialData?.id;
        const { error } = await supabase.from(tableName).update(payload).eq('id', id);
        if (error) throw error;
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = formatErrorMessage(err);
      console.error('Error saving node:', err);
      setErrorMsg(message || 'Error al guardar el registro');
    } finally {
      setSaving(false);
    }
  };

  const levelTitles: Record<NodeLevel, string> = {
    sede: 'Sede',
    campus: 'Campus',
    edificio: 'Edificio',
    piso: 'Piso',
    rack: 'Rack / Gabinete',
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {level === 'sede' && <Building2 className="w-4 h-4 text-blue-600" />}
            {level === 'campus' && <MapPin className="w-4 h-4 text-blue-600" />}
            {level === 'edificio' && <Building2 className="w-4 h-4 text-blue-600" />}
            {level === 'piso' && <Layers className="w-4 h-4 text-blue-600" />}
            {level === 'rack' && <Server className="w-4 h-4 text-blue-600" />}
            <h3 className="text-sm font-bold text-slate-900 font-mono">
              {mode === 'create' ? `Agregar ${levelTitles[level]}` : `Editar ${levelTitles[level]}`}
            </h3>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs font-sans">
          {/* LEVEL 1: SEDE */}
          {level === 'sede' && (
            <div>
              <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                Nombre de la Sede *
              </label>
              <input
                type="text"
                required
                value={formData.nombre || ''}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="ej. Sede Central, Sede Oriente, Sede Norte"
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-sans focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
          )}

          {/* LEVEL 2: CAMPUS */}
          {level === 'campus' && (
            <>
              <div>
                <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                  Sede Perteneciente *
                </label>
                <select
                  required
                  disabled={sedes.length === 0}
                  value={formData.sede_id || ''}
                  onChange={(e) => setFormData({ ...formData, sede_id: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="" disabled>
                    {sedes.length === 0 ? 'Primero crea una Sede' : 'Seleccione una sede...'}
                  </option>
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
                {sedes.length === 0 && (
                  <p className="text-[10px] text-amber-700 mt-1">Primero crea una Sede para poder registrar un Campus.</p>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                  Nombre del Campus *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nombre || ''}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="ej. Campus Central, Campus Clínico"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
            </>
          )}

          {/* LEVEL 3: EDIFICIO */}
          {level === 'edificio' && (
            <>
              <div>
                <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                  Campus Perteneciente *
                </label>
                <select
                  required
                  disabled={campusList.length === 0}
                  value={formData.campus_id || ''}
                  onChange={(e) => setFormData({ ...formData, campus_id: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="" disabled>
                    {campusList.length === 0 ? 'Primero crea un Campus' : 'Seleccione un campus...'}
                  </option>
                  {campusList.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
                {campusList.length === 0 && (
                  <p className="text-[10px] text-amber-700 mt-1">Primero crea un Campus para poder registrar un Edificio.</p>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                  Nombre del Edificio *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nombre || ''}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="ej. Edificio A - Ingeniería, Edificio B - Biblioteca"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
            </>
          )}

          {/* LEVEL 4: PISO */}
          {level === 'piso' && (
            <>
              <div>
                <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                  Edificio Perteneciente *
                </label>
                <select
                  required
                  disabled={edificios.length === 0}
                  value={formData.edificio_id || ''}
                  onChange={(e) => setFormData({ ...formData, edificio_id: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="" disabled>
                    {edificios.length === 0 ? 'Primero crea un Edificio' : 'Seleccione un edificio...'}
                  </option>
                  {edificios.map((ed) => (
                    <option key={ed.id} value={ed.id}>{ed.nombre}</option>
                  ))}
                </select>
                {edificios.length === 0 && (
                  <p className="text-[10px] text-amber-700 mt-1">Primero crea un Edificio para poder registrar un Piso.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                    Nombre del Piso *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nombre || ''}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="ej. Piso 1, Piso 2, Subsuelo"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                    Escala de Plano
                  </label>
                  <input
                    type="text"
                    value={formData.plano_escala || ''}
                    onChange={(e) => setFormData({ ...formData, plano_escala: e.target.value })}
                    placeholder="ej. 1m = 32px"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Requirement 4: Upload or attach floor plan (Cloudinary / S3 / Base64) */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-mono font-semibold text-slate-800 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-600" />
                    <span>Plano de Planta (Cloudinary, URL Web o Archivo)</span>
                  </label>
                  {formData.plano_url && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, plano_url: '' })}
                      className="text-[10px] text-red-600 hover:underline flex items-center gap-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Quitar plano</span>
                    </button>
                  )}
                </div>

                <p className="text-[10px] text-slate-500 font-sans">
                  Pega un enlace directo de servicios en la nube como <strong className="font-semibold text-blue-700">Cloudinary</strong>, Imgur, AWS S3 o sube un archivo de imagen/SVG local.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.plano_url || ''}
                    onChange={(e) => setFormData({ ...formData, plano_url: e.target.value })}
                    placeholder="https://res.cloudinary.com/.../plano.png o data:image..."
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded font-mono text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[11px] font-semibold transition-colors shrink-0 font-mono"
                    title="Subir archivo desde el equipo"
                  >
                    <Upload className="w-3.5 h-3.5 text-blue-600" />
                    <span>Examinar...</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>Admite PNG, JPG, WebP, SVG</span>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, plano_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' })}
                    className="text-blue-600 hover:underline"
                  >
                    + Pegar ejemplo Cloudinary
                  </button>
                </div>

                {/* Preview Box */}
                {formData.plano_url && (
                  <div className="mt-2 border border-slate-200 bg-white rounded-lg p-2.5 flex items-center gap-3 shadow-2xs">
                    <div className="w-20 h-14 bg-slate-100 rounded border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                      {formData.plano_url.startsWith('data:image') || formData.plano_url.startsWith('http') ? (
                        <img 
                          src={formData.plano_url} 
                          alt="Vista previa plano" 
                          crossOrigin="anonymous"
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <FileText className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div className="overflow-hidden text-[10px] font-mono text-slate-600 flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>
                          {formData.plano_url.includes('cloudinary') 
                            ? 'Cloudinary CDN' 
                            : (formData.plano_url.startsWith('http') ? 'Enlace Web Cloud' : 'Archivo Local (Base64)')}
                        </span>
                      </p>
                      <p className="text-slate-400 text-[9px] mt-0.5 truncate">
                        {formData.plano_url}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* LEVEL 5: RACK */}
          {level === 'rack' && (
            <>
              <div>
                <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                  Piso Perteneciente *
                </label>
                <select
                  required
                  disabled={pisos.length === 0}
                  value={formData.piso_id || ''}
                  onChange={(e) => setFormData({ ...formData, piso_id: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="" disabled>
                    {pisos.length === 0 ? 'Primero crea un Piso' : 'Seleccione un piso...'}
                  </option>
                  {pisos.map((p) => {
                    const ed = edificios.find(e => e.id === p.edificio_id);
                    return (
                      <option key={p.id} value={p.id}>
                        {ed ? `${ed.nombre} - ${p.nombre}` : p.nombre}
                      </option>
                    );
                  })}
                </select>
                {pisos.length === 0 && (
                  <p className="text-[10px] text-amber-700 mt-1">Primero crea un Piso para poder registrar un Rack.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                    Código de Rack *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.codigo || ''}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                    placeholder="ej. RCK-ENG-P2-01"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                    Altura Total (U) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={formData.altura_u ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') setFormData({ ...formData, altura_u: '' as any });
                      else {
                        const n = parseInt(val, 10);
                        if (!isNaN(n)) setFormData({ ...formData, altura_u: n });
                      }
                    }}
                    placeholder="42"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                  Formato y Especificación
                </label>
                <input
                  type="text"
                  value={formData.formato || ''}
                  onChange={(e) => setFormData({ ...formData, formato: e.target.value })}
                  placeholder="ej. 42U Gabinete Cerrado mural/piso (EIA-310-D)"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                  Ubicación Física Específica
                </label>
                <input
                  type="text"
                  value={formData.ubicacion_especifica || ''}
                  onChange={(e) => setFormData({ ...formData, ubicacion_especifica: e.target.value })}
                  placeholder="ej. Cuarto de Comunicaciones 204, pared norte"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                    Técnico Responsable
                  </label>
                  <input
                    type="text"
                    value={formData.tecnico_responsable || ''}
                    onChange={(e) => setFormData({ ...formData, tecnico_responsable: e.target.value })}
                    placeholder="ej. Carlos Mendoza"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                    Fecha Última Inspección
                  </label>
                  <input
                    type="date"
                    value={formData.ultima_inspeccion || ''}
                    onChange={(e) => setFormData({ ...formData, ultima_inspeccion: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                  Custodia / Llave de Acceso
                </label>
                <input
                  type="text"
                  value={formData.custodia_llave || ''}
                  onChange={(e) => setFormData({ ...formData, custodia_llave: e.target.value })}
                  placeholder="ej. Llavero de Telecomunicaciones Gabinete T-04"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                  Anotaciones de Terreno
                </label>
                <textarea
                  rows={2}
                  value={formData.anotaciones || ''}
                  onChange={(e) => setFormData({ ...formData, anotaciones: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
            </>
          )}

          {/* Form Actions */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3.5 py-1.5 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 text-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-2xs"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>{mode === 'create' ? 'Crear Registro' : 'Guardar Cambios'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface DeleteSafetyModalProps {
  isOpen: boolean;
  level: NodeLevel;
  nodeId: string;
  nodeName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeleteSafetyModal: React.FC<DeleteSafetyModalProps> = ({
  isOpen,
  level,
  nodeId,
  nodeName,
  onClose,
  onSuccess,
}) => {
  const [loadingDescendants, setLoadingDescendants] = useState(true);
  const [descendants, setDescendants] = useState<HierarchyDescendants | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setConfirmInput('');
      setDeleteError(null);
      setDescendants(null);
      return;
    }

    const checkChildren = async () => {
      setLoadingDescendants(true);
      setDeleteError(null);
      setConfirmInput('');
      try {
        const result = await fetchHierarchyDescendants(level, nodeId);
        setDescendants(result);
      } catch (err) {
        console.error('Error fetching descendants for delete:', err);
      } finally {
        setLoadingDescendants(false);
      }
    };

    checkChildren();
  }, [isOpen, level, nodeId]);

  if (!isOpen) return null;

  const levelLabels: Record<NodeLevel, string> = {
    sede: 'Sede',
    campus: 'Campus',
    edificio: 'Edificio',
    piso: 'Piso',
    rack: 'Rack',
  };

  const hasChildren = (descendants?.totalChildren ?? 0) > 0;
  // Match confirmation input ignoring leading/trailing whitespaces
  const isNameConfirmed = confirmInput.trim() === nodeName.trim();
  const canProceed = !hasChildren || isNameConfirmed;

  const handleDelete = async () => {
    if (!canProceed || !descendants) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await executeCascadedDelete(level, nodeId, descendants);
      if (!res.success) {
        throw new Error(res.error || 'Error al eliminar el registro');
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = formatErrorMessage(err);
      console.error('Delete error:', err);
      setDeleteError(message || 'No fue posible completar la eliminación');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-rose-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-700">
            <Trash2 className="w-4 h-4 shrink-0" />
            <h3 className="text-sm font-bold font-mono">
              Eliminar {levelLabels[level]}: {nodeName}
            </h3>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            disabled={isDeleting}
            className="text-slate-400 hover:text-slate-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {deleteError && (
          <div className="p-3 bg-red-100 border-b border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{deleteError}</span>
          </div>
        )}

        <div className="p-5 space-y-4 text-xs font-sans">
          {loadingDescendants ? (
            <div className="py-6 text-center text-slate-500 font-mono flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
              <span>Verificando dependencias jerárquicas...</span>
            </div>
          ) : !hasChildren ? (
            /* Simple confirmation when 0 children */
            <div className="space-y-3">
              <p className="text-slate-700 leading-relaxed">
                ¿Eliminar <strong className="font-semibold text-slate-900 font-mono">{nodeName}</strong>?
              </p>
              <p className="text-slate-500 text-[11px]">
                Este elemento no posee registros subordinados en la jerarquía. Esta acción lo eliminará de forma permanente de la base de datos.
              </p>
            </div>
          ) : (
            /* Explicit Warning with Exact Counts & Exact Name Confirmation */
            <div className="space-y-4">
              <div className="border border-red-200 bg-red-50/70 rounded-md p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="font-semibold text-red-900 text-xs leading-snug">
                    {descendants?.summaryText}
                  </p>
                </div>

                {/* Subordinate count badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {descendants?.campus.length ? (
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 font-mono text-[10px] rounded border border-red-200">
                      {descendants.campus.length} Campus
                    </span>
                  ) : null}
                  {descendants?.edificios.length ? (
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 font-mono text-[10px] rounded border border-red-200">
                      {descendants.edificios.length} Edificios
                    </span>
                  ) : null}
                  {descendants?.pisos.length ? (
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 font-mono text-[10px] rounded border border-red-200">
                      {descendants.pisos.length} Pisos
                    </span>
                  ) : null}
                  {descendants?.racks.length ? (
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 font-mono text-[10px] rounded border border-red-200">
                      {descendants.racks.length} Racks
                    </span>
                  ) : null}
                  {descendants?.equipos.length ? (
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 font-mono text-[10px] rounded border border-red-200">
                      {descendants.equipos.length} Equipos
                    </span>
                  ) : null}
                  {descendants?.camaras.length ? (
                    <span className="px-2 py-0.5 bg-red-100 text-red-800 font-mono text-[10px] rounded border border-red-200">
                      {descendants.camaras.length} Cámaras
                    </span>
                  ) : null}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-medium text-slate-700 mb-1">
                  Para confirmar, escribe el nombre exacto (<span className="text-slate-900 font-bold select-all">{nodeName}</span>):
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={`Escribe "${nodeName}" para desbloquear`}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-xs focus:outline-none focus:ring-1 focus:ring-red-600 focus:border-red-600"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-3.5 py-1.5 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50 text-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canProceed || isDeleting || loadingDescendants}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded transition-all shadow-2xs ${
                canProceed && !loadingDescendants
                  ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300/50'
              }`}
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Eliminando registros...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{hasChildren ? 'Eliminar Definitivamente' : 'Eliminar'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
