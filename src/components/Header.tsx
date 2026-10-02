import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, 
  Layers, 
  Cpu, 
  Camera, 
  PlusCircle, 
  Wrench, 
  ListFilter,
  MapPin,
  Inbox,
  Tag,
  Archive,
  Menu,
  X,
  ChevronRight,
  BarChart3
} from 'lucide-react';

export type NavView = 
  | 'explorador' 
  | 'elevacion' 
  | 'puertos' 
  | 'camara' 
  | 'registro' 
  | 'mantenimiento' 
  | 'inventario' 
  | 'planimetria'
  | 'reportes'
  | 'bodega_bajas'
  | 'sin_asignar'
  | 'catalogos';

interface HeaderProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  selectedRackCode?: string;
  selectedCameraCode?: string;
  unassignedCount?: number;
  warehouseCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  selectedRackCode,
  selectedCameraCode,
  unassignedCount = 0,
  warehouseCount = 0,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [headerWidth, setHeaderWidth] = useState<number>(1200);

  // Measure container width dynamically to adapt without fixed window breakpoints
  useEffect(() => {
    if (!headerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeaderWidth(entry.contentRect.width);
      }
    });
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

  // Close menu on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Do not close if clicking inside the hamburger button OR inside the drawer itself!
      if (menuContainerRef.current?.contains(target) || drawerRef.current?.contains(target)) {
        return;
      }
      setMobileMenuOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const navItems: { id: NavView; label: string; icon: React.ReactNode; badge?: number; badgeColor?: string }[] = [
    { id: 'explorador', label: 'Explorador Físico', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'elevacion', label: 'Diagrama de Rack', icon: <Server className="w-3.5 h-3.5" /> },
    { id: 'puertos', label: 'Mapeo de Puertos', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'camara', label: 'Ficha de Cámara', icon: <Camera className="w-3.5 h-3.5" /> },
    { id: 'registro', label: 'Registro Terreno', icon: <PlusCircle className="w-3.5 h-3.5" /> },
    { id: 'mantenimiento', label: 'Bitácora / Mantención', icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'inventario', label: 'Inventario General', icon: <ListFilter className="w-3.5 h-3.5" /> },
    { id: 'reportes', label: 'Reportes & Ocupación', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'planimetria', label: 'Planimetría FOV', icon: <MapPin className="w-3.5 h-3.5" /> },
    { 
      id: 'bodega_bajas', 
      label: 'Bodega / Bajas', 
      icon: <Archive className="w-3.5 h-3.5" />, 
      badge: warehouseCount, 
      badgeColor: 'amber' 
    },
    { 
      id: 'sin_asignar', 
      label: 'Sin Asignar', 
      icon: <Inbox className="w-3.5 h-3.5" />, 
      badge: unassignedCount, 
      badgeColor: 'blue' 
    },
    { id: 'catalogos', label: 'Catálogos', icon: <Tag className="w-3.5 h-3.5" /> },
  ];

  // Determine how many items fit in the horizontal bar without overflowing:
  // All 11 items need approx 1550px of header width.
  const allFit = headerWidth >= 1550;
  // If not all fit, how many primary shortcuts can we comfortably show?
  const visibleShortcutCount = allFit 
    ? 11 
    : headerWidth >= 1250 
    ? 5 
    : headerWidth >= 950 
    ? 3 
    : headerWidth >= 780 
    ? 2 
    : 0;

  const visibleNavItems = navItems.slice(0, visibleShortcutCount);
  const showHamburger = !allFit;

  const handleNavClick = (viewId: NavView) => {
    onNavigate(viewId);
    setMobileMenuOpen(false);
  };

  const getBreadcrumbTitle = () => {
    switch (currentView) {
      case 'explorador': return 'Explorador de Jerarquía Física (Sede > Campus > Edificio > Piso > Rack)';
      case 'elevacion': return `Elevación de Bastidor Rack ${selectedRackCode ? `(${selectedRackCode})` : ''}`;
      case 'puertos': return 'Matriz y Mapeo Físico de Puertos (Patch Panels & Switches)';
      case 'camara': return `Ficha Técnica de Cámara ${selectedCameraCode ? `(${selectedCameraCode})` : ''}`;
      case 'registro': return 'Levantamiento y Registro Rápido en Terreno (Norma TIA-606-C)';
      case 'mantenimiento': return 'Bitácora Técnica e Historial de Intervenciones';
      case 'inventario': return 'Inventario General Centralizado de Equipamiento';
      case 'reportes': return 'Módulo de Reportes · Capacidad, Ocupación y Expansión de Inventario (Norma 75%)';
      case 'planimetria': return 'Planimetría CAD y Análisis Geométrico de Cobertura';
      case 'bodega_bajas': return 'Bodega / Bajas (Equipos y Cámaras Retirados de Servicio)';
      case 'sin_asignar': return 'Bandeja de Dispositivos Sin Asignación Jerárquica';
      case 'catalogos': return 'Gestor de Catálogos (Marcas, Modelos y Proveedores)';
      default: return 'Sistema de Infraestructura CCTV';
    }
  };

  return (
    <header ref={headerRef} className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs relative">
      <div className="w-full px-3 sm:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-3">
          {/* Brand Identity */}
          <div 
            onClick={() => handleNavClick('explorador')}
            className="flex items-center gap-2.5 cursor-pointer group shrink-0"
            title="Ir al Explorador Físico"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-slate-900 text-white rounded flex items-center justify-center font-mono font-bold text-xs sm:text-sm tracking-wider shadow-xs group-hover:bg-blue-700 transition-colors shrink-0">
              <Server className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
            </div>
            <div>
              <div className="font-bold text-slate-900 tracking-tight text-xs sm:text-base flex items-center gap-1.5 leading-none">
                <span className="truncate">CCTV InfraRegistro</span>
                <span className="hidden xs:inline-block text-[9px] sm:text-[10px] font-mono font-normal uppercase text-slate-500 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                  v2.4
                </span>
              </div>
              <div className="hidden sm:block text-[9px] sm:text-[10px] font-mono tracking-wider text-slate-500 uppercase mt-0.5">
                Planta Física · Infraestructura CCTV
              </div>
            </div>
          </div>

          {/* Horizontal Navigation Bar (items that fit comfortably) */}
          {visibleNavItems.length > 0 && (
            <nav className="flex items-center gap-1 py-1 px-1 overflow-hidden min-w-0">
              {visibleNavItems.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded transition-all whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.id === 'elevacion' && selectedRackCode && (
                      <span className={`text-[10px] font-mono px-1 rounded ${isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600'}`}>
                        {selectedRackCode}
                      </span>
                    )}
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                        isActive ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Standard Hamburger Menu Button - Always visible whenever not all items fit */}
          {showHamburger && (
            <div ref={menuContainerRef} className="flex items-center shrink-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all shadow-2xs shrink-0 ${
                  mobileMenuOpen 
                    ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200' 
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400'
                }`}
                aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú de navegación'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X className="w-4 h-4 text-white" /> : <Menu className="w-4 h-4 text-slate-700" />}
                <span className="font-mono text-xs">
                  {mobileMenuOpen ? 'Cerrar' : 'Menú'}
                </span>
                {(warehouseCount > 0 || unassignedCount > 0) && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Collapsible Full Modules Menu Drawer */}
        {mobileMenuOpen && (
          <div 
            ref={drawerRef}
            className="border-t border-slate-200 py-3.5 bg-white animate-in slide-in-from-top-2 duration-150 shadow-lg -mx-3 sm:-mx-6 px-3 sm:px-6"
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-mono uppercase text-slate-400 font-bold tracking-wider">
                Módulos de Sistema
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                12 Vistas disponibles
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {navItems.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleNavClick(item.id);
                    }}
                    className={`flex items-center justify-between p-2.5 text-xs rounded-lg transition-all text-left cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/90'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className={isActive ? 'text-white' : 'text-blue-600 shrink-0'}>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold shrink-0 ${
                        isActive ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Subheader technical breadcrumb strip */}
      <div className="bg-[#f0f2f7] border-t border-slate-200/80 px-3 sm:px-6 py-1.5 text-[11px] font-mono text-slate-600 flex flex-wrap items-center justify-between gap-y-1 gap-x-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-blue-600 font-semibold shrink-0">⚡ Módulo:</span>
          <span className="text-slate-800 font-medium truncate">{getBreadcrumbTitle()}</span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-slate-500 text-[10px] shrink-0">
          <span>Norma ANSI/TIA-606-C</span>
          <span>•</span>
          <span>Supabase PostgreSQL</span>
        </div>
      </div>
    </header>
  );
};
