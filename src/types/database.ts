export interface Sede {
  id: string;
  nombre: string;
  created_at: string;
}

export interface Campus {
  id: string;
  sede_id: string;
  nombre: string;
  created_at: string;
  sede?: Sede;
}

export interface Edificio {
  id: string;
  campus_id: string;
  nombre: string;
  created_at: string;
  campus?: Campus;
}

export interface Piso {
  id: string;
  edificio_id: string;
  nombre: string;
  plano_url: string | null;
  plano_escala: string | null;
  created_at: string;
  edificio?: Edificio;
}

export interface Rack {
  id: string;
  piso_id: string;
  codigo: string;
  ubicacion_especifica: string | null;
  formato: string | null;
  altura_u: number;
  custodia_llave: string | null;
  tecnico_responsable: string | null;
  ultima_inspeccion: string | null;
  anotaciones: string | null;
  created_at: string;
  piso?: Piso;
}

export interface Proveedor {
  id: string;
  nombre: string;
  rubro: 'venta' | 'instalacion' | 'ambos';
  contacto: string | null;
  created_at: string;
}

export interface Marca {
  id: string;
  nombre: string;
  created_at: string;
}

export interface Modelo {
  id: string;
  marca_id: string;
  nombre: string;
  tipo_equipo: string;
  puertos_default: number | null;
  puertos_sfp_default?: number | null;
  canales_default: number | null;
  capacidad_va_default: number | null;
  tipo_camara_default?: string | null;
  lente_default?: string | null;
  resolucion_mp_default?: number | null;
  apertura_fov_default?: number | null;
  zoom_optico_default?: string | boolean | null;
  poe_puertos_default?: string | null;
  poe_estandar_default?: string | null;
  poe_presupuesto_w_default?: number | null;
  poe_requerido?: string | null;
  wifi_generacion?: string | null;
  alcance_m_default?: number | null;
  created_at: string;
  marca?: Marca;
}

export type EstadoCicloVida = 
  | 'instalado' 
  | 'retirado_pendiente_bodega' 
  | 'en_bodega' 
  | 'dado_de_baja';

export type TipoEquipo = 'switch' | 'patch_panel' | 'nvr' | 'ups' | 'organizador' | 'mufa' | 'access_point' | 'otro';

export interface Equipo {
  id: string;
  rack_id: string | null;
  tipo: TipoEquipo;
  codigo: string;
  marca_id?: string | null;
  modelo_id?: string | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  posicion_u_inicio: number | null;
  posicion_u_fin: number | null;
  ip_gestion: string | null;
  vlan: number | null;
  puertos_totales: number | null;
  puertos_sfp_totales?: number | null;
  poe_puertos?: string | null;
  poe_estandar?: string | null;
  poe_presupuesto_w?: number | null;
  canales_totales: number | null;
  capacidad_va: number | null;
  fecha_compra: string | null;
  proveedor_compra_id: string | null;
  fecha_instalacion: string | null;
  proveedor_instalacion_id: string | null;
  estado_ciclo_vida?: EstadoCicloVida | string;
  rol_red?: 'acceso' | 'distribucion' | 'core' | string | null;
  u_range?: string | null;
  created_at: string;
  rack?: Rack;
  marca_rel?: Marca;
  modelo_rel?: Modelo;
  proveedor_compra?: Proveedor;
  proveedor_instalacion?: Proveedor;
}

export type RolRedSwitch = 'acceso' | 'distribucion' | 'core';

export const formatRolRed = (rol?: string | null): string => {
  if (!rol) return '';
  const clean = rol.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (clean === 'acceso') return 'Acceso';
  if (clean === 'distribucion') return 'Distribución';
  if (clean === 'core') return 'Core';
  return rol;
};

export const normalizeRolRedForDb = (rol?: string | null): 'acceso' | 'distribucion' | 'core' | null => {
  if (!rol) return null;
  const clean = rol.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (clean === 'acceso') return 'acceso';
  if (clean === 'distribucion') return 'distribucion';
  if (clean === 'core') return 'core';
  return null;
};

/**
 * Format switch port quantities according to system view specification:
 * e.g. "24 RJ45 + 4 SFP", "48 SFP" o "24 RJ45"
 */
export const formatSwitchPorts = (
  puertosRj45?: number | null, 
  puertosSfp?: number | null
): string => {
  const rj45 = puertosRj45 !== null && puertosRj45 !== undefined ? Number(puertosRj45) : null;
  const sfp = puertosSfp !== null && puertosSfp !== undefined ? Number(puertosSfp) : 0;

  if (rj45 === null) {
    if (sfp > 0) return `${sfp} SFP`;
    return 'Switch';
  }

  if (rj45 > 0 && sfp > 0) {
    return `${rj45} RJ45 + ${sfp} SFP`;
  }
  if (rj45 === 0 && sfp > 0) {
    return `${sfp} SFP`;
  }
  if (rj45 > 0) {
    return `${rj45} RJ45`;
  }
  if (sfp > 0) {
    return `${sfp} SFP`;
  }
  return '0 Puertos';
};

export type TipoCamara = 'domo' | 'bullet' | 'ptz' | 'fisheye' | 'multisensor';

export type TipoDispositivoCamara = 
  | 'domo' 
  | 'bullet' 
  | 'ptz' 
  | 'turret' 
  | 'fisheye' 
  | 'box' 
  | 'termica' 
  | 'panoramica' 
  | 'multisensor'
  | 'otro';

export interface Camara {
  id: string;
  codigo: string;
  piso_id: string;
  ubicacion_especifica: string | null;
  marca_id?: string | null;
  modelo_id?: string | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  direccion_mac: string | null;
  direccion_ip: string | null;
  tipo_camara?: TipoCamara | string | null;
  tipo_dispositivo: TipoDispositivoCamara | string | null;
  ambiente?: 'interior' | 'exterior' | string | null;
  antivandalico?: boolean | null;
  resolucion_mp?: number | null;
  altura_montaje_m?: number | null;
  lente?: string | null;
  zoom_optico?: string | null;
  num_sensores?: number | null;
  rack_id: string | null;
  patch_panel_id: string | null;
  puerto_patch: number | null;
  switch_id: string | null;
  puerto_switch: string | null;
  nvr_id: string | null;
  canal_nvr: number | null;
  posicion_x: number | null;
  posicion_y: number | null;
  azimut: number | null;
  apertura_fov: number | null;
  alcance_metros: number | null;
  fecha_compra: string | null;
  proveedor_compra_id: string | null;
  fecha_instalacion: string | null;
  proveedor_instalacion_id: string | null;
  estado_ciclo_vida?: EstadoCicloVida | string;
  alimentacion?: 'poe' | 'inyector' | 'fuente_propia' | string | null;
  created_at: string;
  piso?: Piso;
  rack?: Rack;
  patch_panel?: Equipo;
  switch?: Equipo;
  nvr?: Equipo;
  marca_rel?: Marca;
  modelo_rel?: Modelo;
  proveedor_compra?: Proveedor;
  proveedor_instalacion?: Proveedor;
}

export type TipoIntervencion = 
  | 'instalacion' 
  | 'mantenimiento_preventivo' 
  | 'reparacion' 
  | 'recambio';

export interface HistorialMantenimiento {
  id: string;
  entidad_tipo: 'equipo' | 'camara' | 'rack' | 'punto_red';
  entidad_id: string;
  tipo_intervencion: TipoIntervencion;
  fecha: string;
  tecnico_responsable: string;
  descripcion: string | null;
  repuestos_insumos: string | null;
  ticket_referencia?: string | null;
  created_at: string;
}

export interface Vlan {
  id: string;
  numero: number;
  nombre: string;
  color: string;
  descripcion?: string | null;
  uso?: string | null;
  created_at: string;
}

export interface EnlaceSwitch {
  id: string;
  puerto_origen_id: string;
  puerto_destino_id: string;
  switch_origen_id: string;
  switch_destino_id: string;
  es_principal?: boolean | null;
  categoria_cable?: string | null;
  created_at: string;
  switch_origen?: Equipo;
  switch_destino?: Equipo;
  puerto_origen?: PuertoSwitch;
  puerto_destino?: PuertoSwitch;
}

export type TipoPuntoRed = 'datos_funcionario' | 'datos_alumno' | 'wifi_ap';
export type CategoriaCable = 'cat6' | 'cat6a';

export interface PuertoSwitch {
  id: string;
  switch_id: string;
  numero_puerto: number;
  tipo_puerto?: 'rj45' | 'sfp' | string;
  vlan: number | null;
  vlan_id?: string | null;
  uso: string | null;
  descripcion: string | null;
  categoria_cable: string | null;
  created_at: string;
  vlan_rel?: Vlan;
}

export interface PuertoSwitchOcupacion {
  puerto_switch_id: string;
  switch_id: string;
  numero_puerto: number;
  tipo_puerto: 'rj45' | 'sfp' | string;
  vlan?: number | null;
  vlan_numero: number | null;
  vlan_nombre: string | null;
  vlan_color: string | null;
  uso: string | null;
  descripcion: string | null;
  ocupado_por_codigo: string | null;
  ocupado_por_tipo: string | null;
}

export interface PuntoRed {
  id: string;
  codigo: string;
  tipo_punto: TipoPuntoRed;
  piso_id: string | null;
  ubicacion_especifica: string | null;
  rack_id: string | null;
  patch_panel_id: string | null;
  puerto_patch: number | null;
  switch_id: string | null;
  puerto_switch_id: string | null;
  categoria_cable: CategoriaCable | null;
  marca_id: string | null;
  modelo_id: string | null;
  numero_serie: string | null;
  direccion_mac: string | null;
  direccion_ip: string | null;
  fecha_compra: string | null;
  proveedor_compra_id: string | null;
  fecha_instalacion: string | null;
  proveedor_instalacion_id: string | null;
  estado_ciclo_vida?: EstadoCicloVida | string;
  posicion_x?: number | null;
  posicion_y?: number | null;
  azimut?: number | null;
  apertura_fov?: number | null;
  alcance_metros?: number | null;
  alimentacion?: 'poe' | 'inyector' | 'fuente_propia' | string | null;
  created_at: string;
  // Relational joins
  piso?: Piso;
  rack?: Rack;
  patch_panel?: Equipo;
  switch?: Equipo;
  puerto_switch?: PuertoSwitch;
  marca_rel?: Marca;
  modelo_rel?: Modelo;
  proveedor_compra?: Proveedor;
  proveedor_instalacion?: Proveedor;
}

export interface EnlaceTroncalVista {
  enlace_id: string;
  es_principal: boolean;
  created_at: string;
  activo: boolean;
  origen_id: string;
  origen_codigo: string;
  origen_rol: string | null;
  origen_modelo: string | null;
  origen_puerto: number;
  origen_campus: string | null;
  origen_edificio: string | null;
  origen_piso: string | null;
  origen_rack: string | null;
  origen_ubicacion: string | null;
  destino_id: string;
  destino_codigo: string;
  destino_rol: string | null;
  destino_modelo: string | null;
  destino_puerto: number;
  destino_campus: string | null;
  destino_edificio: string | null;
  destino_piso: string | null;
  destino_rack: string | null;
  destino_ubicacion: string | null;
  salta_jerarquia?: boolean | null;
  invertido?: boolean;
  superior_id: string;
  superior_codigo: string;
  superior_rol: string | null;
  superior_modelo: string | null;
  superior_puerto: number;
  superior_campus: string | null;
  superior_edificio: string | null;
  superior_piso: string | null;
  superior_rack: string | null;
  superior_ubicacion: string | null;
  inferior_id: string;
  inferior_codigo: string;
  inferior_rol: string | null;
  inferior_modelo: string | null;
  inferior_puerto: number;
  inferior_campus: string | null;
  inferior_edificio: string | null;
  inferior_piso: string | null;
  inferior_rack: string | null;
  inferior_ubicacion: string | null;
}

export interface TopologiaPosicion {
  vista: string;
  equipo_id: string;
  x: number;
  y: number;
  updated_at?: string;
}

export interface TopologiaSwitchVista {
  id: string;
  codigo: string;
  marca: string | null;
  modelo: string | null;
  rol_red: string | null;
  puertos_rj45: number | null;
  puertos_sfp: number | null;
  campus: string | null;
  edificio: string | null;
  piso: string | null;
  rack: string | null;
  ubicacion: string;
  enlaces: number;
  sfp_conectados: number;
}

export interface PuertoSwitchPoe {
  puerto_switch_id: string;
  switch_id: string;
  numero_puerto: number;
  tipo_puerto: 'rj45' | 'sfp' | string;
  poe: boolean | null; // true: delivers PoE, false: no PoE, null: undefined
}

export interface ConexionSinPoe {
  tipo_dispositivo: 'camara' | 'wifi_ap';
  codigo: string;
  switch_codigo: string;
  numero_puerto: number;
  edificio: string | null;
  piso: string | null;
  dispositivo_id?: string;
  switch_id?: string;
}

export interface RevisionPoeItem {
  tipo_dispositivo: 'camara' | 'wifi_ap';
  dispositivo_id: string;
  codigo: string;
  modelo: string | null;
  edificio: string | null;
  piso: string | null;
  switch_id: string;
  switch_codigo: string;
  puerto_switch_id: string;
  numero_puerto: number;
  estandar_switch: string | null;
  estandar_requerido: string | null;
  alimentacion: string | null;
  estado_poe: 'ok' | 'sin_poe' | 'estandar_insuficiente' | 'estandar_sin_datos' | 'sin_definir';
  resuelto: boolean;
}

export type EstadoVisualPuerto = 'ocupado_con_dispositivo' | 'enlace_vacio' | 'puerto_libre';

export interface MapeoPuertoCompleto {
  switch_codigo: string;
  puerto_switch_id: string;
  switch_puerto_numero: number;
  switch_puerto_tipo: string;
  vlan_id: string | null;
  vlan_nombre: string | null;
  vlan_color: string | null;
  tramo_cross_connect_id: string | null;
  cross_connect_estado: string | null;
  cross_connect_verificacion: string | null;
  patch_panel_codigo: string | null;
  puerto_patch_panel_id: string | null;
  patch_panel_puerto_numero: number | null;
  tramo_horizontal_id: string | null;
  horizontal_verificacion: string | null;
  roseta_codigo: string | null;
  roseta_ubicacion: string | null;
  conexion_logica_id: string | null;
  dispositivo_tipo: 'camara' | 'usuario' | 'access_point' | string | null;
  dispositivo_codigo: string | null;
  dispositivo_estado: string | null;
  estado_visual_puerto: EstadoVisualPuerto;
}

