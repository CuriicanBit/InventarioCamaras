import React, { useState, useEffect, useMemo } from 'react';
import {
  Briefcase,
  Users,
  Wifi,
  Camera,
  Cable,
  HelpCircle,
  X,
  AlertTriangle,
  Search,
  Plus,
  ArrowLeftRight,
  CheckCircle2,
  Cpu,
  Layers,
  MapPin,
  Tag
} from 'lucide-react';
import { PuntoRed, Camara } from '../types/database';

export type ServicioKind =
  | 'datos_funcionario'
  | 'datos_alumno'
  | 'wifi_ap'
  | 'camara_cctv'
  | 'solo_cable'
  | 'otro';

export interface AsociarServicioDialogProps {
  isOpen: boolean;
  onClose: () => void;
  // Props de los puertos del enlace
  codigo_patch: string;
  puerto_patch: number;
  codigo_switch: string;
  puerto_switch: number;
  patchPanelId?: string;
  switchId?: string;
  // Props de VLAN (heredadas desde el puerto switch)
  vlan_id?: string | null;
  vlan_numero?: number | null;
  vlan_nombre?: string | null;
  color_vlan?: string | null;
  uso_vlan?: string | null;
  // Listas para asociar existentes
  puntosRed?: PuntoRed[];
  camaras?: Camara[];
  // Callbacks de guardado
  onCreateNuevoPunto?: (payload: {
    codigo: string;
    tipo_punto: ServicioKind;
    ubicacion?: string;
  }) => Promise<void> | void;
  onSelectExistentePunto?: (puntoId: string) => Promise<void> | void;
  onSelectExistenteCamara?: (camaraId: string) => Promise<void> | void;
  onConnectSoloCable?: () => Promise<void> | void;
  loading?: boolean;
}

interface KindOption {
  kind: ServicioKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  codePrefix: string;
}

const KIND_OPTIONS: KindOption[] = [
  {
    kind: 'datos_funcionario',
    label: 'Funcionario',
    icon: Briefcase,
    description: 'Puesto de trabajo / Administrativo',
    codePrefix: 'PR-FUNC',
  },
  {
    kind: 'datos_alumno',
    label: 'Punto de Sala',
    icon: Users,
    description: 'Sala de clases / Alumnos',
    codePrefix: 'PR-SALA',
  },
  {
    kind: 'wifi_ap',
    label: 'WiFi AP',
    icon: Wifi,
    description: 'Punto de acceso inalámbrico',
    codePrefix: 'AP-WIFI',
  },
  {
    kind: 'camara_cctv',
    label: 'Cámara CCTV',
    icon: Camera,
    description: 'Cámara de videovigilancia',
    codePrefix: 'CAM-CCTV',
  },
  {
    kind: 'solo_cable',
    label: 'Solo Cable',
    icon: Cable,
    description: 'Parcheo directo sin punto final',
    codePrefix: 'CABLE',
  },
  {
    kind: 'otro',
    label: 'Otro',
    icon: HelpCircle,
    description: 'Dispositivo genérico / Especial',
    codePrefix: 'PR-OTRO',
  },
];

/**
 * Deduce el kind preseleccionado según el campo uso de la VLAN
 */
const inferKindFromVlanUso = (uso?: string | null): ServicioKind | null => {
  if (!uso) return null;
  const normalized = uso.trim().toLowerCase();

  if (
    normalized.includes('administrativ') ||
    normalized.includes('admin') ||
    normalized.includes('funcionario') ||
    normalized === 'datos funcionario'
  ) {
    return 'datos_funcionario';
  }

  if (
    normalized.includes('alumno') ||
    normalized.includes('sala') ||
    normalized.includes('estudiant') ||
    normalized === 'datos alumno'
  ) {
    return 'datos_alumno';
  }

  if (
    normalized.includes('wifi') ||
    normalized.includes('ap') ||
    normalized.includes('inalambric') ||
    normalized.includes('access point')
  ) {
    return 'wifi_ap';
  }

  if (
    normalized.includes('cctv') ||
    normalized.includes('camara') ||
    normalized.includes('cámara') ||
    normalized.includes('video') ||
    normalized.includes('seguridad')
  ) {
    return 'camara_cctv';
  }

  return null;
};

export const AsociarServicioDialog: React.FC<AsociarServicioDialogProps> = ({
  isOpen,
  onClose,
  codigo_patch,
  puerto_patch,
  codigo_switch,
  puerto_switch,
  vlan_id,
  vlan_numero,
  vlan_nombre,
  color_vlan,
  uso_vlan,
  puntosRed = [],
  camaras = [],
  onCreateNuevoPunto,
  onSelectExistentePunto,
  onSelectExistenteCamara,
  onConnectSoloCable,
  loading = false,
}) => {
  const hasVlan = Boolean(vlan_numero || vlan_id);
  const vlanColor = color_vlan || '#3b82f6';

  // 1) Preselección inicial según vlans.uso
  const preselectedKind = useMemo(() => inferKindFromVlanUso(uso_vlan), [uso_vlan]);

  // Estados del diálogo
  const [selectedKind, setSelectedKind] = useState<ServicioKind | null>(preselectedKind);
  const [isPreselectedActive, setIsPreselectedActive] = useState<boolean>(Boolean(preselectedKind));
  const [confirmNoVlan, setConfirmNoVlan] = useState<boolean>(false);

  // Pestañas del registro del punto: 'nuevo' | 'existente'
  const [activeTab, setActiveTab] = useState<'nuevo' | 'existente'>('nuevo');

  // Formulario nuevo punto
  const [codigoPunto, setCodigoPunto] = useState<string>('');
  const [ubicacionPunto, setUbicacionPunto] = useState<string>('');
  const [isCodeManuallyEdited, setIsCodeManuallyEdited] = useState<boolean>(false);

  // Búsqueda en existentes
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedExistenteId, setSelectedExistenteId] = useState<string | null>(null);

  // Sincronizar preselección al abrir o cambiar props
  useEffect(() => {
    if (isOpen) {
      const initial = inferKindFromVlanUso(uso_vlan);
      setSelectedKind(initial);
      setIsPreselectedActive(Boolean(initial));
      setConfirmNoVlan(false);
      setActiveTab('nuevo');
      setUbicacionPunto('');
      setSearchQuery('');
      setSelectedExistenteId(null);
      setIsCodeManuallyEdited(false);

      if (initial && initial !== 'solo_cable') {
        const option = KIND_OPTIONS.find((k) => k.kind === initial);
        const prefix = option ? option.codePrefix : 'PR';
        const pNum = String(puerto_patch).padStart(2, '0');
        setCodigoPunto(`${prefix}-P${pNum}-01`);
      } else {
        setCodigoPunto('');
      }
    }
  }, [isOpen, uso_vlan, puerto_patch]);

  // Autogenerar código al cambiar de kind si no ha sido editado manualmente
  const handleSelectKind = (kind: ServicioKind) => {
    setSelectedKind(kind);
    setIsPreselectedActive(kind === preselectedKind);
    setSelectedExistenteId(null);

    if (kind === 'solo_cable') {
      setCodigoPunto('');
    } else if (!isCodeManuallyEdited || !codigoPunto.trim()) {
      const option = KIND_OPTIONS.find((k) => k.kind === kind);
      const prefix = option ? option.codePrefix : 'PR';
      const pNum = String(puerto_patch).padStart(2, '0');
      setCodigoPunto(`${prefix}-P${pNum}-01`);
    }
  };

  // Filtrado de elementos existentes según el kind seleccionado
  const isCctvKind = selectedKind === 'camara_cctv';

  const existingItemsCount = useMemo(() => {
    if (isCctvKind) {
      return camaras.length;
    }
    return puntosRed.length;
  }, [isCctvKind, camaras.length, puntosRed.length]);

  const filteredPuntos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return puntosRed.filter((p) => {
      // Filtrar por compatibilidad con el kind si aplica
      let matchesKind = true;
      if (selectedKind === 'datos_funcionario') {
        matchesKind = p.tipo_punto === 'datos_funcionario';
      } else if (selectedKind === 'datos_alumno') {
        matchesKind = p.tipo_punto === 'datos_alumno';
      } else if (selectedKind === 'wifi_ap') {
        matchesKind = p.tipo_punto === 'wifi_ap';
      }

      if (!matchesKind && searchQuery.trim() === '') {
        // Si no hay búsqueda, priorizar los del mismo tipo
        return false;
      }

      if (!q) return true;
      return (
        p.codigo.toLowerCase().includes(q) ||
        (p.ubicacion_especifica && p.ubicacion_especifica.toLowerCase().includes(q)) ||
        p.tipo_punto.toLowerCase().includes(q)
      );
    });
  }, [puntosRed, searchQuery, selectedKind]);

  const filteredCamaras = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return camaras;
    return camaras.filter((c) => {
      return (
        c.codigo.toLowerCase().includes(q) ||
        (c.marca && c.marca.toLowerCase().includes(q)) ||
        (c.modelo && c.modelo.toLowerCase().includes(q)) ||
        (c.direccion_ip && c.direccion_ip.toLowerCase().includes(q))
      );
    });
  }, [camaras, searchQuery]);

  // Validación para habilitar el botón primario del Footer
  const isFormValid = useMemo(() => {
    // Si no tiene VLAN, requiere confirmación explícita
    if (!hasVlan && !confirmNoVlan) {
      return false;
    }

    if (!selectedKind) {
      return false;
    }

    if (selectedKind === 'solo_cable') {
      return true;
    }

    if (activeTab === 'nuevo') {
      return Boolean(codigoPunto.trim());
    }

    if (activeTab === 'existente') {
      return Boolean(selectedExistenteId);
    }

    return false;
  }, [hasVlan, confirmNoVlan, selectedKind, activeTab, codigoPunto, selectedExistenteId]);

  // Handler de envío final
  const handleSubmit = async () => {
    if (!isFormValid || !selectedKind) return;

    if (selectedKind === 'solo_cable') {
      await onConnectSoloCable?.();
      onClose();
      return;
    }

    if (activeTab === 'nuevo') {
      await onCreateNuevoPunto?.({
        codigo: codigoPunto.trim().toUpperCase(),
        tipo_punto: selectedKind,
        ubicacion: ubicacionPunto.trim() || undefined,
      });
      onClose();
      return;
    }

    if (activeTab === 'existente' && selectedExistenteId) {
      if (isCctvKind) {
        await onSelectExistenteCamara?.(selectedExistenteId);
      } else {
        await onSelectExistentePunto?.(selectedExistenteId);
      }
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden transition-all duration-180 ease-out animate-in fade-in zoom-in-95 my-auto"
        style={{
          borderTopWidth: '4px',
          borderTopColor: hasVlan ? vlanColor : '#f59e0b',
        }}
      >
        {/* ======================================================== */}
        {/* 1) HEADER: Título y Preview del Enlace Cross-Connect     */}
        {/* ======================================================== */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div
                className="p-2 rounded-lg border shadow-2xs"
                style={{
                  backgroundColor: `${vlanColor}14`,
                  borderColor: `${vlanColor}35`,
                  color: vlanColor,
                }}
              >
                <Cable className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-mono font-bold text-sm sm:text-base text-slate-900 leading-tight">
                  Asociar Servicio al Enlace Cross-Connect
                </h3>
                <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                  Interconexión física entre bastidor y patch cord
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preview del enlace en franja */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 sm:p-3 shadow-2xs flex items-center justify-between gap-2 font-mono text-xs">
            {/* Extremo Patch Panel */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                <Layers className="w-4 h-4 text-slate-600" />
              </div>
              <div className="truncate">
                <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">
                  Patch Panel
                </span>
                <span className="font-bold text-slate-900">
                  {codigo_patch}
                </span>
                <span className="ml-1.5 px-1.5 py-0.2 rounded bg-slate-100 text-slate-800 border border-slate-300 font-bold text-[11px]">
                  P{String(puerto_patch).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Conexión Bidireccional */}
            <div className="flex flex-col items-center px-2 shrink-0 text-slate-400">
              <ArrowLeftRight className="w-4 h-4 text-blue-500" />
              <span className="text-[9px] font-sans font-semibold text-slate-400">Cat6</span>
            </div>

            {/* Extremo Switch */}
            <div className="flex items-center gap-2 justify-end text-right min-w-0">
              <div className="truncate">
                <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">
                  Switch
                </span>
                <span className="font-bold text-slate-900">
                  {codigo_switch}
                </span>
                <span className="ml-1.5 px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold text-[11px]">
                  P{String(puerto_switch).padStart(2, '0')}
                </span>
              </div>
              <div className="p-1.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                <Cpu className="w-4 h-4 text-blue-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* ======================================================== */}
          {/* 2) BLOQUE: VLAN DEL PUERTO SWITCH (Solo Lectura)         */}
          {/* ======================================================== */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                VLAN del Puerto Switch
              </label>
              <span className="text-[10px] text-slate-400 font-sans">
                Solo lectura · Heredado desde Diagrama de Rack
              </span>
            </div>

            {hasVlan ? (
              /* Chip grande con color y uso */
              <div
                className="p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono transition-all"
                style={{
                  backgroundColor: `${vlanColor}12`,
                  borderColor: `${vlanColor}40`,
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs ring-2 ring-white"
                    style={{ backgroundColor: vlanColor }}
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">
                      VLAN {vlan_numero} {vlan_nombre ? `· ${vlan_nombre}` : ''}
                    </div>
                    <div className="text-[11px] text-slate-600 font-sans mt-0.5 truncate">
                      Uso heredado:{' '}
                      <span className="font-semibold text-slate-800">
                        {uso_vlan || 'Sin uso especificado'}
                      </span>
                    </div>
                  </div>
                </div>

                <span
                  className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded border self-start sm:self-auto shrink-0 tracking-wider font-mono"
                  style={{
                    color: vlanColor,
                    borderColor: `${vlanColor}60`,
                    backgroundColor: `${vlanColor}18`,
                  }}
                >
                  <Tag className="w-3 h-3" />
                  <span>VLAN {vlan_numero}</span>
                </span>
              </div>
            ) : (
              /* Banner amarillo si no tiene VLAN */
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 font-sans leading-relaxed">
                    <span className="font-bold font-mono block mb-0.5 text-amber-950">
                      Puerto sin VLAN (Transparente)
                    </span>
                    Este puerto switch no tiene ninguna VLAN configurada. Este enlace no heredará
                    uso de red.
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 border-t border-amber-200/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmNoVlan}
                    onChange={(e) => setConfirmNoVlan(e.target.checked)}
                    className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="text-[11px] font-bold text-amber-900 font-sans">
                    Confirmo conectar sin VLAN
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* 3) BLOQUE: ¿QUÉ HAY AL OTRO EXTREMO? (Grid 3x2)          */}
          {/* ======================================================== */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                ¿Qué hay al otro extremo?
              </label>
              {isPreselectedActive && selectedKind && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 font-mono"
                  style={{
                    color: vlanColor,
                    borderColor: `${vlanColor}40`,
                    backgroundColor: `${vlanColor}14`,
                  }}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Preseleccionado por uso de VLAN</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {KIND_OPTIONS.map((opt) => {
                const IconComponent = opt.icon;
                const isSelected = selectedKind === opt.kind;
                const isThisAutoPreselected = isSelected && isPreselectedActive;

                return (
                  <button
                    key={opt.kind}
                    type="button"
                    onClick={() => handleSelectKind(opt.kind)}
                    className={`relative p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer group ${
                      isSelected
                        ? 'bg-white shadow-xs'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-700'
                    }`}
                    style={
                      isSelected
                        ? {
                            borderColor: vlanColor,
                            boxShadow: `0 0 0 2px ${vlanColor}25, 0 2px 8px rgba(0,0,0,0.05)`,
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-1 w-full mb-2">
                      <div
                        className={`p-2 rounded-lg transition-colors ${
                          isSelected
                            ? 'text-white shadow-2xs'
                            : 'bg-white text-slate-600 border border-slate-200 group-hover:text-slate-900'
                        }`}
                        style={isSelected ? { backgroundColor: vlanColor } : undefined}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>

                      {isThisAutoPreselected && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0 animate-pulse mt-1 mr-0.5"
                          style={{ backgroundColor: vlanColor }}
                          title="Preseleccionado automáticamente"
                        />
                      )}
                    </div>

                    <div>
                      <div
                        className={`text-xs font-bold font-mono transition-colors ${
                          isSelected ? 'text-slate-900' : 'text-slate-800'
                        }`}
                      >
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-slate-500 font-sans mt-0.5 leading-tight line-clamp-1">
                        {opt.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ======================================================== */}
          {/* 4) BLOQUE: REGISTRO DEL PUNTO (Oculto si "Solo Cable")    */}
          {/* ======================================================== */}
          {selectedKind && selectedKind !== 'solo_cable' && (
            <div className="pt-2 border-t border-slate-200/90 space-y-3">
              {/* Pestañas: Crear Nuevo Punto vs Usar Existente */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Registro del Punto
                </span>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab('nuevo')}
                    className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                      activeTab === 'nuevo'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Crear Nuevo Punto
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('existente')}
                    className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      activeTab === 'existente'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <span>Usar Existente</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-bold">
                      {existingItemsCount}
                    </span>
                  </button>
                </div>
              </div>

              {activeTab === 'nuevo' ? (
                /* TAB: CREAR NUEVO PUNTO */
                <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 space-y-3 font-mono text-xs">
                  {/* Código autogenerado editable */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-slate-700 uppercase">
                        Código Identificador del Punto *
                      </label>
                      <span className="text-[10px] text-slate-400 font-sans">
                        Patrón sugerido PR-P{String(puerto_patch).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={codigoPunto}
                        onChange={(e) => {
                          setCodigoPunto(e.target.value.toUpperCase());
                          setIsCodeManuallyEdited(true);
                        }}
                        placeholder="ej. PR-FUNC-P15-01"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 text-xs focus:ring-2 focus:outline-none uppercase tracking-wide"
                      />
                    </div>
                  </div>

                  {/* Ubicación específica opcional */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Ubicación Específica en Terreno (Opcional)
                    </label>
                    <div className="relative">
                      <MapPin className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={ubicacionPunto}
                        onChange={(e) => setUbicacionPunto(e.target.value)}
                        placeholder="ej. Oficina 204, Sala de Profesores, Puesto 03 Admisión..."
                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-sans text-slate-800 placeholder-slate-400 focus:ring-2 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* TAB: USAR EXISTENTE */
                <div className="space-y-2 font-mono text-xs">
                  {/* Buscador */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder={
                        isCctvKind
                          ? 'Buscar cámara por código, IP, modelo...'
                          : 'Buscar punto por código, ubicación, tipo...'
                      }
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-sans text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Lista de selección */}
                  <div className="max-h-52 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                    {isCctvKind ? (
                      /* Lista de Cámaras */
                      filteredCamaras.length === 0 ? (
                        <div className="py-6 text-center text-slate-400 font-sans text-xs">
                          No se encontraron cámaras disponibles para asociar.
                        </div>
                      ) : (
                        filteredCamaras.map((cam) => {
                          const isSelected = selectedExistenteId === cam.id;
                          const isAlreadyPatched = Boolean(
                            cam.patch_panel_id && cam.puerto_patch && cam.switch_id
                          );

                          return (
                            <button
                              key={cam.id}
                              type="button"
                              onClick={() => setSelectedExistenteId(cam.id)}
                              className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 text-xs truncate">
                                  {cam.codigo}
                                </div>
                                <div className="text-[10px] text-slate-500 font-sans truncate mt-0.5">
                                  {cam.marca_rel?.nombre || cam.marca || 'CCTV'}{' '}
                                  {cam.modelo_rel?.nombre || cam.modelo || ''}
                                  {cam.direccion_ip ? ` · IP ${cam.direccion_ip}` : ''}
                                </div>
                              </div>

                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold shrink-0 ${
                                  isSelected
                                    ? 'bg-blue-600 text-white'
                                    : isAlreadyPatched
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isSelected
                                  ? 'Seleccionado'
                                  : isAlreadyPatched
                                  ? 'Reasignar'
                                  : 'Disponible'}
                              </span>
                            </button>
                          );
                        })
                      )
                    ) : (
                      /* Lista de Puntos de Red */
                      filteredPuntos.length === 0 ? (
                        <div className="py-6 text-center text-slate-400 font-sans text-xs">
                          No se encontraron puntos de red disponibles.
                        </div>
                      ) : (
                        filteredPuntos.map((p) => {
                          const isSelected = selectedExistenteId === p.id;
                          const isAlreadyPatched = Boolean(
                            p.patch_panel_id && p.puerto_patch && p.switch_id
                          );

                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedExistenteId(p.id)}
                              className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                                  <span className="truncate">{p.codigo}</span>
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold border border-slate-200 shrink-0">
                                    {p.tipo_punto}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 font-sans truncate mt-0.5">
                                  {p.ubicacion_especifica || 'Sin ubicación registrada'}
                                </div>
                              </div>

                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold shrink-0 ${
                                  isSelected
                                    ? 'bg-blue-600 text-white'
                                    : isAlreadyPatched
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {isSelected
                                  ? 'Seleccionado'
                                  : isAlreadyPatched
                                  ? 'Reasignar'
                                  : 'Disponible'}
                              </span>
                            </button>
                          );
                        })
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mensaje descriptivo para "Solo Cable" */}
          {selectedKind === 'solo_cable' && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 font-mono text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <Cable className="w-4 h-4 text-slate-600" />
                <span>Interconexión Física Directa</span>
              </div>
              <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
                Este enlace registrará exclusivamente el parcheo físico entre el Patch Panel{' '}
                <strong>{codigo_patch}</strong> (P{puerto_patch}) y el Switch{' '}
                <strong>{codigo_switch}</strong> (P{puerto_switch}), sin crear ni asociar un punto
                de red. Podrás asociar un dispositivo posteriormente.
              </p>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* 5) FOOTER: [Cancelar] [Crear Punto y Conectar Enlace]    */}
        {/* ======================================================== */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 rounded-xl font-mono transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={!isFormValid || loading}
            onClick={handleSubmit}
            className={`px-5 py-2 text-xs font-bold font-mono rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              !isFormValid || loading
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                : 'text-white hover:brightness-105 active:scale-98 shadow-md'
            }`}
            style={
              isFormValid && !loading
                ? {
                    backgroundColor: vlanColor,
                    boxShadow: `0 4px 14px ${vlanColor}40`,
                  }
                : undefined
            }
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {loading
                ? 'Conectando...'
                : selectedKind === 'solo_cable'
                ? 'Fijar Enlace Físico'
                : activeTab === 'existente'
                ? 'Asociar Punto y Conectar'
                : 'Crear Punto y Conectar Enlace'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
