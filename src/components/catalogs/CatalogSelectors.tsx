import React, { useState } from 'react';
import { Plus, Check, X, Tag, Cpu, Building, AlertCircle, Info, Layers, Palette } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Marca, Modelo, Proveedor, TipoEquipo, Vlan } from '../../types/database';

// Helper to format Supabase error messages
function formatError(err: unknown): string {
  if (!err) return 'Error desconocido';
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const e = err as Record<string, any>;
    if (e.message) return e.details ? `${e.message} (${e.details})` : e.message;
    if (e.error_description) return String(e.error_description);
  }
  return String(err);
}

function isDuplicateError(err: any): boolean {
  if (!err) return false;
  if (err.code === '23505') return true;
  const msg = String(err.message || err.details || '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('already exists') || msg.includes('unique constraint');
}

// ==========================================
// 1. SELECTOR DE MARCA
// ==========================================
interface MarcaSelectProps {
  value?: string | null;
  onChange: (marcaId: string, marcaName: string) => void;
  marcas: Marca[];
  onMarcaCreated: (newMarca: Marca) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export const MarcaSelect: React.FC<MarcaSelectProps> = ({
  value,
  onChange,
  marcas,
  onMarcaCreated,
  className = '',
  disabled = false,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__NEW__') {
      setIsOpen(true);
      setErrorMsg(null);
      setInfoMsg(null);
      return;
    }
    const found = marcas.find(m => m.id === val);
    onChange(val, found?.nombre || '');
  };

  const handleCreate = async (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cleanNombre = newNombre.trim();
    if (!cleanNombre) return;

    // Check if already exists in local list
    const existingLocal = marcas.find(m => m.nombre.trim().toLowerCase() === cleanNombre.toLowerCase());
    if (existingLocal) {
      onChange(existingLocal.id, existingLocal.nombre);
      setInfoMsg('Ya existía, se seleccionó');
      setTimeout(() => {
        setIsOpen(false);
        setInfoMsg(null);
        setNewNombre('');
      }, 1200);
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);
      setInfoMsg(null);

      const { data, error } = await supabase
        .from('marcas')
        .insert([{ nombre: cleanNombre }])
        .select()
        .single();

      if (error) {
        if (isDuplicateError(error)) {
          const { data: existingDb } = await supabase
            .from('marcas')
            .select()
            .ilike('nombre', cleanNombre)
            .single();

          if (existingDb) {
            onMarcaCreated(existingDb);
            onChange(existingDb.id, existingDb.nombre);
            setInfoMsg('Ya existía, se seleccionó');
            setTimeout(() => {
              setIsOpen(false);
              setInfoMsg(null);
              setNewNombre('');
            }, 1200);
            return;
          }
        }
        throw error;
      }

      if (data) {
        onMarcaCreated(data);
        onChange(data.id, data.nombre);
        setIsOpen(false);
        setNewNombre('');
      }
    } catch (err) {
      console.error('Error creating brand:', err);
      setErrorMsg(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <div className="relative flex items-center gap-1">
        <select
          value={value || ''}
          onChange={handleSelectChange}
          disabled={disabled}
          required={required}
          className={`w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-blue-600 bg-white ${className}`}
        >
          <option value="">Seleccionar marca...</option>
          {marcas.map(m => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
          <option value="__NEW__" className="font-semibold text-blue-700 bg-blue-50">
            + Agregar nueva marca...
          </option>
        </select>
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
            setErrorMsg(null);
            setInfoMsg(null);
          }}
          title="Agregar nueva marca"
          className="p-1.5 border border-slate-300 rounded text-slate-600 hover:text-blue-600 hover:bg-slate-50 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {marcas.length === 0 && !isOpen && (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(true);
            setErrorMsg(null);
            setInfoMsg(null);
          }}
          className="mt-1 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded w-full flex items-center justify-between font-semibold hover:bg-blue-100 transition-colors"
        >
          <span>Sin marcas registradas</span>
          <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar nueva marca</span>
        </button>
      )}

      {isOpen && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="mt-2 p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono space-y-2.5 shadow-xs animate-in fade-in duration-100"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Tag className="w-3.5 h-3.5 text-blue-600" />
              <span>Nueva Marca Comercial</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className="text-slate-400 hover:text-slate-700 text-xs px-1"
            >
              ✕
            </button>
          </div>

          {infoMsg && (
            <div className="p-2 bg-blue-50 border border-blue-200 text-blue-700 rounded text-[11px] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Nombre de la Marca *</label>
            <input
              type="text"
              autoFocus
              value={newNombre}
              onChange={(e) => setNewNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreate(e);
                }
              }}
              placeholder="ej. Ubiquiti, Fortinet, Allied Telesis"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-slate-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className="px-2.5 py-1 text-slate-600 hover:bg-slate-200 rounded text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || !newNombre.trim()}
              onClick={(e) => handleCreate(e)}
              className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-xs disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar y Seleccionar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 2. SELECTOR DE MODELO
// ==========================================
interface ModeloSelectProps {
  value?: string | null;
  marcaId?: string | null;
  tipoEquipo: string; // TipoEquipo ('switch', 'nvr', 'patch_panel', 'ups', etc.) or 'camara'
  onChange: (modeloId: string, modeloName: string, defaults?: Partial<Modelo>) => void;
  modelos: Modelo[];
  marcas: Marca[];
  onModeloCreated: (newModelo: Modelo) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

export const ModeloSelect: React.FC<ModeloSelectProps> = ({
  value,
  marcaId,
  tipoEquipo,
  onChange,
  modelos,
  marcas,
  onModeloCreated,
  className = '',
  disabled = false,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [puertos, setPuertos] = useState<string>('');
  const [canales, setCanales] = useState<string>('');
  const [capacidadVa, setCapacidadVa] = useState<string>('');
  const [tipoCamara, setTipoCamara] = useState<string>('domo');
  const [lente, setLente] = useState<string>('2.8mm');
  const [resolucionMp, setResolucionMp] = useState<string>('4');
  const [aperturaFov, setAperturaFov] = useState<string>('103');
  const [zoomOptico, setZoomOptico] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Filter available models: match both marca_id and tipo_equipo (internal value)
  const availableModelos = modelos.filter(m => {
    const matchMarca = !marcaId || m.marca_id === marcaId;
    const matchTipo = m.tipo_equipo === tipoEquipo;
    return matchMarca && matchTipo;
  });

  const canAdd = Boolean(marcaId && tipoEquipo);
  const disabledReason = !marcaId && !tipoEquipo
    ? 'Seleccione marca y tipo de equipo primero'
    : !marcaId
    ? 'Seleccione una marca primero'
    : 'Seleccione un tipo de equipo primero';

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__NEW__') {
      if (!canAdd) return;
      setIsOpen(true);
      setErrorMsg(null);
      setInfoMsg(null);
      return;
    }
    const found = modelos.find(m => m.id === val);
    onChange(val, found?.nombre || '', found);
  };

  const handleCreate = async (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cleanNombre = newNombre.trim();
    if (!cleanNombre || !marcaId || !tipoEquipo) return;

    // Check local models
    const existingLocal = modelos.find(
      m => m.marca_id === marcaId && m.tipo_equipo === tipoEquipo && m.nombre.trim().toLowerCase() === cleanNombre.toLowerCase()
    );
    if (existingLocal) {
      onChange(existingLocal.id, existingLocal.nombre, existingLocal);
      setInfoMsg('Ya existía, se seleccionó');
      setTimeout(() => {
        setIsOpen(false);
        setInfoMsg(null);
        setNewNombre('');
      }, 1200);
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);
      setInfoMsg(null);

      const payload: any = {
        marca_id: marcaId,
        nombre: cleanNombre,
        tipo_equipo: tipoEquipo, // MUST be the internal value
        puertos_default: puertos ? parseInt(puertos) : null,
        canales_default: canales ? parseInt(canales) : null,
        capacidad_va_default: capacidadVa ? parseInt(capacidadVa) : null,
      };

      if (tipoEquipo === 'camara') {
        payload.tipo_camara_default = tipoCamara || null;
        payload.lente_default = lente.trim() || null;
        payload.resolucion_mp_default = resolucionMp ? parseFloat(resolucionMp) : null;
        payload.apertura_fov_default = aperturaFov ? parseInt(aperturaFov) : null;
        payload.zoom_optico_default = zoomOptico.trim() || null;
      }

      const { data, error } = await supabase
        .from('modelos')
        .insert([payload])
        .select()
        .single();

      if (error) {
        if (isDuplicateError(error)) {
          const { data: existingDb } = await supabase
            .from('modelos')
            .select()
            .eq('marca_id', marcaId)
            .ilike('nombre', cleanNombre)
            .single();

          if (existingDb) {
            onModeloCreated(existingDb);
            onChange(existingDb.id, existingDb.nombre, existingDb);
            setInfoMsg('Ya existía, se seleccionó');
            setTimeout(() => {
              setIsOpen(false);
              setInfoMsg(null);
              setNewNombre('');
            }, 1200);
            return;
          }
        }
        throw error;
      }

      if (data) {
        onModeloCreated(data);
        onChange(data.id, data.nombre, data);
        setIsOpen(false);
        setNewNombre('');
      }
    } catch (err) {
      console.error('Error creating model:', err);
      setErrorMsg(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <div className="relative flex items-center gap-1">
        <select
          value={value || ''}
          onChange={handleSelectChange}
          disabled={disabled || !marcaId}
          required={required}
          className={`w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-blue-600 bg-white ${
            !marcaId ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''
          } ${className}`}
        >
          {!marcaId ? (
            <option value="">Seleccione una marca primero</option>
          ) : (
            <>
              <option value="">Seleccionar modelo...</option>
              {availableModelos.map(m => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                  {m.puertos_default ? ` (${m.puertos_default}P)` : ''}
                  {m.canales_default ? ` (${m.canales_default}Ch)` : ''}
                  {m.tipo_camara_default ? ` [${m.tipo_camara_default}]` : ''}
                </option>
              ))}
              {availableModelos.length === 0 && (
                <option disabled value="">
                  (Sin modelos registrados para esta marca)
                </option>
              )}
              <option value="__NEW__" className="font-semibold text-blue-700 bg-blue-50">
                + Agregar nuevo modelo...
              </option>
            </>
          )}
        </select>
        <button
          type="button"
          disabled={disabled || !canAdd}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!canAdd) return;
            setIsOpen(!isOpen);
            setErrorMsg(null);
            setInfoMsg(null);
          }}
          title={!canAdd ? disabledReason : 'Agregar nuevo modelo'}
          className={`p-1.5 border border-slate-300 rounded text-slate-600 hover:text-blue-600 hover:bg-slate-50 shrink-0 ${
            !canAdd ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {marcaId && availableModelos.length === 0 && !isOpen && (
        <button
          type="button"
          disabled={disabled || !canAdd}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(true);
            setErrorMsg(null);
            setInfoMsg(null);
          }}
          className="mt-1 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded w-full flex items-center justify-between font-semibold hover:bg-blue-100 transition-colors"
        >
          <span>Sin modelos para esta marca</span>
          <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar nuevo modelo</span>
        </button>
      )}

      {isOpen && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="mt-2 p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono space-y-2.5 shadow-xs animate-in fade-in duration-100"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Cpu className="w-3.5 h-3.5 text-blue-600" />
              <span>Nuevo Modelo ({tipoEquipo.replace('_', ' ').toUpperCase()})</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className="text-slate-400 hover:text-slate-700 text-xs px-1"
            >
              ✕
            </button>
          </div>

          {infoMsg && (
            <div className="p-2 bg-blue-50 border border-blue-200 text-blue-700 rounded text-[11px] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Nombre / Código de Modelo *</label>
            <input
              type="text"
              autoFocus
              value={newNombre}
              onChange={(e) => setNewNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreate(e);
                }
              }}
              placeholder="ej. CBS350-48P-4G o DS-2CD2143G2-I"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs focus:ring-1 focus:ring-blue-600"
            />
          </div>

          {/* Dynamic equipment defaults */}
          {(tipoEquipo === 'switch' || tipoEquipo === 'patch_panel') && (
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Puertos RJ45 por Defecto (Opcional)</label>
              <input
                type="number"
                min="1"
                max="96"
                value={puertos}
                onChange={(e) => setPuertos(e.target.value)}
                placeholder="24 o 48"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
              />
            </div>
          )}

          {tipoEquipo === 'nvr' && (
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Canales de Video por Defecto (Opcional)</label>
              <input
                type="number"
                min="1"
                max="128"
                value={canales}
                onChange={(e) => setCanales(e.target.value)}
                placeholder="16 o 32"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
              />
            </div>
          )}

          {tipoEquipo === 'ups' && (
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">Capacidad VA por Defecto (Opcional)</label>
              <input
                type="number"
                min="100"
                max="50000"
                value={capacidadVa}
                onChange={(e) => setCapacidadVa(e.target.value)}
                placeholder="1500 o 3000"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
              />
            </div>
          )}

          {tipoEquipo === 'camara' && (
            <div className="space-y-2 pt-1 border-t border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Valores por Defecto de Cámara (Opcionales)</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-600 mb-1">Tipo de Cámara</label>
                  <select
                    value={tipoCamara}
                    onChange={(e) => setTipoCamara(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                  >
                    <option value="domo">Domo</option>
                    <option value="bullet">Bullet</option>
                    <option value="ptz">PTZ</option>
                    <option value="fisheye">Fisheye</option>
                    <option value="multisensor">Multisensor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-600 mb-1">Resolución (MP)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={resolucionMp}
                    onChange={(e) => setResolucionMp(e.target.value)}
                    placeholder="4"
                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-600 mb-1">Lente</label>
                  <input
                    type="text"
                    value={lente}
                    onChange={(e) => setLente(e.target.value)}
                    placeholder="2.8mm"
                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-600 mb-1">Apertura FOV (°)</label>
                  <input
                    type="number"
                    value={aperturaFov}
                    onChange={(e) => setAperturaFov(e.target.value)}
                    placeholder="103"
                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-600 mb-1">Zoom Óptico</label>
                  <input
                    type="text"
                    value={zoomOptico}
                    onChange={(e) => setZoomOptico(e.target.value)}
                    placeholder="ej. 25x"
                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1 border-t border-slate-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className="px-2.5 py-1 text-slate-600 hover:bg-slate-200 rounded text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || !newNombre.trim()}
              onClick={(e) => handleCreate(e)}
              className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-xs disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar y Seleccionar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 3. SELECTOR DE PROVEEDOR
// ==========================================
interface ProveedorSelectProps {
  value?: string | null;
  rubroFilter?: 'venta' | 'instalacion';
  onChange: (proveedorId: string, proveedorName: string) => void;
  proveedores: Proveedor[];
  onProveedorCreated: (newProv: Proveedor) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export const ProveedorSelect: React.FC<ProveedorSelectProps> = ({
  value,
  rubroFilter,
  onChange,
  proveedores,
  onProveedorCreated,
  className = '',
  disabled = false,
  placeholder = 'Seleccionar proveedor...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [rubro, setRubro] = useState<'venta' | 'instalacion' | 'ambos'>(rubroFilter || 'ambos');
  const [contacto, setContacto] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Filter based on rubro if specified, but always include currently selected value
  const availableProveedores = proveedores.filter(p => {
    if (p.id === value) return true;
    if (!rubroFilter) return true;
    if (rubroFilter === 'venta') return p.rubro === 'venta' || p.rubro === 'ambos';
    if (rubroFilter === 'instalacion') return p.rubro === 'instalacion' || p.rubro === 'ambos';
    return true;
  });

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__NEW__') {
      setNombre('');
      setContacto('');
      setRubro(rubroFilter || 'ambos');
      setIsOpen(true);
      setErrorMsg(null);
      setInfoMsg(null);
      return;
    }
    const found = proveedores.find(p => p.id === val);
    onChange(val, found?.nombre || '');
  };

  const handleCreate = async (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cleanNombre = nombre.trim();
    if (!cleanNombre) return;

    // Check local
    const existingLocal = proveedores.find(p => p.nombre.trim().toLowerCase() === cleanNombre.toLowerCase());
    if (existingLocal) {
      onChange(existingLocal.id, existingLocal.nombre);
      setInfoMsg('Ya existía, se seleccionó');
      setTimeout(() => {
        setIsOpen(false);
        setInfoMsg(null);
        setNombre('');
        setContacto('');
      }, 1200);
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);
      setInfoMsg(null);

      const payload: any = {
        nombre: cleanNombre,
        rubro: rubro || 'ambos',
      };
      if (contacto.trim()) {
        payload.contacto = contacto.trim();
      }

      const { data, error } = await supabase
        .from('proveedores')
        .insert([payload])
        .select()
        .single();

      if (error) {
        if (isDuplicateError(error)) {
          const { data: existingDb } = await supabase
            .from('proveedores')
            .select()
            .ilike('nombre', cleanNombre)
            .single();

          if (existingDb) {
            onProveedorCreated(existingDb);
            onChange(existingDb.id, existingDb.nombre);
            setInfoMsg('Ya existía, se seleccionó');
            setTimeout(() => {
              setIsOpen(false);
              setInfoMsg(null);
              setNombre('');
              setContacto('');
            }, 1200);
            return;
          }
        }
        throw error;
      }

      if (data) {
        onProveedorCreated(data);
        onChange(data.id, data.nombre);
        setIsOpen(false);
        setNombre('');
        setContacto('');
      }
    } catch (err) {
      console.error('Error creating provider:', err);
      setErrorMsg(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <div className="relative flex items-center gap-1">
        <select
          value={value || ''}
          onChange={handleSelectChange}
          disabled={disabled}
          className={`w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-blue-600 bg-white ${className}`}
        >
          <option value="">{placeholder}</option>
          {availableProveedores.map(p => (
            <option key={p.id} value={p.id}>
              {p.nombre} {p.rubro ? `[${p.rubro}]` : ''}
            </option>
          ))}
          <option value="__NEW__" className="font-semibold text-blue-700 bg-blue-50">
            + Agregar nuevo proveedor...
          </option>
        </select>
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setNombre('');
            setContacto('');
            setRubro(rubroFilter || 'ambos');
            setIsOpen(!isOpen);
            setErrorMsg(null);
            setInfoMsg(null);
          }}
          title="Agregar nuevo proveedor"
          className="p-1.5 border border-slate-300 rounded text-slate-600 hover:text-blue-600 hover:bg-slate-50 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {availableProveedores.length === 0 && !isOpen && (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setNombre('');
            setContacto('');
            setRubro(rubroFilter || 'ambos');
            setIsOpen(true);
            setErrorMsg(null);
            setInfoMsg(null);
          }}
          className="mt-1 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded w-full flex items-center justify-between font-semibold hover:bg-blue-100 transition-colors"
        >
          <span>Sin proveedores registrados</span>
          <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> Agregar nuevo proveedor</span>
        </button>
      )}

      {isOpen && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="mt-2 p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono space-y-2.5 shadow-xs animate-in fade-in duration-100"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Building className="w-3.5 h-3.5 text-blue-600" />
              <span>Nuevo Proveedor / Contratista</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className="text-slate-400 hover:text-slate-700 text-xs px-1"
            >
              ✕
            </button>
          </div>

          {infoMsg && (
            <div className="p-2 bg-blue-50 border border-blue-200 text-blue-700 rounded text-[11px] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Razón Social / Proveedor *</label>
            <input
              type="text"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreate(e);
                }
              }}
              placeholder="ej. Ingram Micro Chile"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Rubro Principal *</label>
            <select
              value={rubro}
              onChange={(e) => setRubro(e.target.value as any)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
            >
              <option value="venta">Venta / Distribuidor de Hardware</option>
              <option value="instalacion">Instalación / Integrador Técnico</option>
              <option value="ambos">Ambos (Suministro e Integración)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-slate-600 mb-1">Contacto / Email / Teléfono</label>
            <input
              type="text"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreate(e);
                }
              }}
              placeholder="ej. ventas@ingram.cl / +56 2 2400 1000"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-slate-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className="px-2.5 py-1 text-slate-600 hover:bg-slate-200 rounded text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || !nombre.trim()}
              onClick={(e) => handleCreate(e)}
              className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-xs disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar y Seleccionar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 4. SELECTOR DE VLAN CON "+ AGREGAR NUEVA..."
// ==========================================
export interface VlanSelectProps {
  value?: string | number | null; // Supports VLAN id (UUID) or numero (number/string)
  onChange: (vlanNumero: number | null, vlanId: string | null, vlanObj?: Vlan | null) => void;
  vlans: Vlan[];
  onVlanCreated?: (newVlan: Vlan) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
  compact?: boolean;
}

const PRESET_VLAN_COLORS = [
  '#2563EB', // Blue
  '#0891B2', // Cyan
  '#059669', // Emerald
  '#7C3AED', // Purple
  '#D97706', // Amber
  '#DC2626', // Red
  '#4F46E5', // Indigo
  '#DB2777', // Pink
  '#475569', // Slate
];

export const VlanSelect: React.FC<VlanSelectProps> = ({
  value,
  onChange,
  vlans,
  onVlanCreated,
  className = '',
  disabled = false,
  required = false,
  allowNone = true,
  noneLabel = '(Sin VLAN)',
  placeholder = 'Seleccione VLAN...',
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newNumero, setNewNumero] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newColor, setNewColor] = useState('#2563EB');
  const [newDescripcion, setNewDescripcion] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Match active VLAN by id or by number
  const selectedVlan = vlans.find(v => {
    if (value === null || value === undefined || value === '') return false;
    return v.id === value || String(v.numero) === String(value);
  });

  const selectValue = selectedVlan ? selectedVlan.id : '';

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__NEW__') {
      setIsOpen(true);
      setErrorMsg(null);
      setInfoMsg(null);
      return;
    }
    if (!val) {
      onChange(null, null, null);
      return;
    }
    const found = vlans.find(v => v.id === val);
    if (found) {
      onChange(found.numero, found.id, found);
    } else {
      onChange(null, null, null);
    }
  };

  const handleCreate = async (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const num = parseInt(newNumero.trim());
    const name = newNombre.trim();

    if (isNaN(num) || num < 1 || num > 4094) {
      setErrorMsg('El número de VLAN debe estar entre 1 y 4094');
      return;
    }
    if (!name) {
      setErrorMsg('Debe ingresar un nombre para la VLAN');
      return;
    }

    // Check if already in local list
    const existingNum = vlans.find(v => v.numero === num);
    if (existingNum) {
      onChange(existingNum.numero, existingNum.id, existingNum);
      setInfoMsg(`La VLAN ${num} ya existía (${existingNum.nombre}), se seleccionó`);
      setTimeout(() => {
        setIsOpen(false);
        setInfoMsg(null);
        setNewNumero('');
        setNewNombre('');
        setNewDescripcion('');
      }, 1200);
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);
      setInfoMsg(null);

      const { data, error } = await supabase
        .from('vlans')
        .insert([{
          numero: num,
          nombre: name,
          color: newColor || '#2563EB',
          descripcion: newDescripcion.trim() || null,
        }])
        .select()
        .single();

      if (error) {
        if (isDuplicateError(error)) {
          const { data: existingDb } = await supabase
            .from('vlans')
            .select()
            .eq('numero', num)
            .single();

          if (existingDb) {
            onVlanCreated?.(existingDb);
            onChange(existingDb.numero, existingDb.id, existingDb);
            setInfoMsg(`La VLAN ${num} ya existía en la base de datos, se seleccionó`);
            setTimeout(() => {
              setIsOpen(false);
              setInfoMsg(null);
              setNewNumero('');
              setNewNombre('');
              setNewDescripcion('');
            }, 1200);
            return;
          }
        }
        throw error;
      }

      if (data) {
        onVlanCreated?.(data);
        onChange(data.numero, data.id, data);
        setIsOpen(false);
        setNewNumero('');
        setNewNombre('');
        setNewDescripcion('');
      }
    } catch (err) {
      console.error('Error creating VLAN:', err);
      setErrorMsg(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center gap-1.5 w-full">
        {selectedVlan?.color && (
          <span
            className="w-3 h-3 rounded-full shrink-0 border border-black/20 shadow-2xs"
            style={{ backgroundColor: selectedVlan.color }}
            title={`VLAN ${selectedVlan.numero} (${selectedVlan.color})`}
          />
        )}
        <select
          value={selectValue}
          onChange={handleSelectChange}
          disabled={disabled}
          required={required}
          className={`w-full border border-slate-300 rounded bg-white font-mono focus:ring-1 focus:ring-blue-600 focus:outline-none transition-colors ${
            compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
          } ${disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'text-slate-800 font-semibold'}`}
        >
          {allowNone && (
            <option value="">{noneLabel}</option>
          )}
          {!allowNone && !selectValue && (
            <option value="" disabled>{placeholder}</option>
          )}
          {vlans.map((v) => (
            <option key={v.id} value={v.id}>
              VLAN {v.numero} - {v.nombre}
            </option>
          ))}
          <option value="__NEW__" className="text-blue-600 font-bold bg-blue-50">
            + Agregar nueva VLAN...
          </option>
        </select>
      </div>

      {/* Inline Quick Add VLAN Popover */}
      {isOpen && (
        <div 
          className="absolute z-50 left-0 right-0 sm:right-auto sm:w-80 top-full mt-1.5 bg-white border-2 border-blue-500 rounded-lg shadow-xl p-3 space-y-2.5 text-xs font-sans text-slate-800 animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
            <span className="font-bold text-blue-900 flex items-center gap-1.5 text-[11px] font-mono uppercase">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Nueva VLAN en Catálogo</span>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className="text-slate-400 hover:text-slate-600 text-xs p-0.5"
            >
              ✕
            </button>
          </div>

          {errorMsg && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-700 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-700 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-700 mb-0.5 font-mono uppercase">
                ID VLAN *
              </label>
              <input
                type="number"
                min={1}
                max={4094}
                value={newNumero}
                onChange={(e) => setNewNumero(e.target.value)}
                placeholder="10"
                className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs font-mono font-bold focus:ring-1 focus:ring-blue-600"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreate(e);
                  }
                }}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold text-slate-700 mb-0.5 font-mono uppercase">
                Nombre de Red *
              </label>
              <input
                type="text"
                value={newNombre}
                onChange={(e) => setNewNombre(e.target.value)}
                placeholder="ej. CCTV Seguridad"
                className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs focus:ring-1 focus:ring-blue-600"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreate(e);
                  }
                }}
              />
            </div>
          </div>

          {/* Color Selector */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-700 mb-1 font-mono uppercase flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Palette className="w-3 h-3 text-slate-500" />
                <span>Color Distintivo</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">{newColor}</span>
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRESET_VLAN_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                    newColor.toLowerCase() === c.toLowerCase()
                      ? 'scale-125 border-slate-900 ring-2 ring-blue-500/40'
                      : 'border-black/20 hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                title="Color personalizado"
                className="w-5 h-5 p-0 border border-slate-300 rounded cursor-pointer ml-1"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-700 mb-0.5 font-mono uppercase">
              Descripción (Opcional)
            </label>
            <input
              type="text"
              value={newDescripcion}
              onChange={(e) => setNewDescripcion(e.target.value)}
              placeholder="ej. Cámaras y servidores CCTV"
              className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreate(e);
                }
              }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-slate-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className="px-2.5 py-1 text-slate-600 hover:bg-slate-100 rounded text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || !newNumero.trim() || !newNombre.trim()}
              onClick={(e) => handleCreate(e)}
              className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-xs disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {saving ? 'Guardando...' : 'Guardar y Seleccionar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
