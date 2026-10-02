import React, { useState, useEffect } from 'react';
import { Header, NavView } from './components/Header';
import { PhysicalTree } from './components/PhysicalTree';
import { RackElevation } from './components/RackElevation';
import { PatchPanelPortMap } from './components/PatchPanelPortMap';
import { CameraDetail } from './components/CameraDetail';
import { FieldRegistrationForm } from './components/FieldRegistrationForm';
import { MaintenanceHistory } from './components/MaintenanceHistory';
import { InventoryList } from './components/InventoryList';
import { FloorPlanCoverage } from './components/FloorPlanCoverage';
import { UnassignedItems } from './components/UnassignedItems';
import { CatalogsView } from './components/CatalogsView';
import { WarehouseView } from './components/WarehouseView';
import { ReportsView } from './components/ReportsView';
import { supabase } from './lib/supabase';
import { Rack, Camara, Equipo } from './types/database';

export default function App() {
  const [currentView, setCurrentView] = useState<NavView>('explorador');
  const [selectedRack, setSelectedRack] = useState<Rack | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<Camara | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | undefined>(undefined);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [unassignedCount, setUnassignedCount] = useState<number>(0);
  const [warehouseCount, setWarehouseCount] = useState<number>(0);

  const fetchUnassignedCount = async () => {
    try {
      const { data } = await supabase.from('v_sin_asignar').select('id');
      setUnassignedCount(data?.length || 0);
    } catch (err) {
      console.error('Error fetching unassigned count:', err);
    }
  };

  const fetchWarehouseCount = async () => {
    try {
      const [{ data: cData }, { data: eData }] = await Promise.all([
        supabase.from('camaras').select('id').neq('estado_ciclo_vida', 'instalado'),
        supabase.from('equipos').select('id').neq('estado_ciclo_vida', 'instalado'),
      ]);
      setWarehouseCount((cData?.length || 0) + (eData?.length || 0));
    } catch (err) {
      console.error('Error fetching warehouse count:', err);
    }
  };

  // Load default rack, default camera, unassigned count and warehouse count on startup
  useEffect(() => {
    const bootstrapDefaultSelection = async () => {
      try {
        const [
          { data: rData },
          { data: cData },
          { data: uData },
          { data: whCams },
          { data: whEqs }
        ] = await Promise.all([
          supabase.from('racks').select('*').order('codigo').limit(1),
          supabase.from('camaras').select('*').order('codigo').limit(1),
          supabase.from('v_sin_asignar').select('id'),
          supabase.from('camaras').select('id').neq('estado_ciclo_vida', 'instalado'),
          supabase.from('equipos').select('id').neq('estado_ciclo_vida', 'instalado'),
        ]);

        if (rData && rData.length > 0) {
          setSelectedRack(rData[0]);
        }
        if (cData && cData.length > 0) {
          const found08 = cData.find(c => c.codigo === 'CAM-ENG-P2-08') || cData[0];
          setSelectedCamera(found08);
        }
        setUnassignedCount(uData?.length || 0);
        setWarehouseCount((whCams?.length || 0) + (whEqs?.length || 0));
      } catch (err) {
        console.error('Error bootstrapping app data:', err);
      } finally {
        setLoadingInitial(false);
      }
    };

    bootstrapDefaultSelection();
  }, []);

  // Handlers for navigation across screens
  const handleSelectRackFromTree = (rack: Rack) => {
    setSelectedRack(rack);
  };

  const handleNavigateToElevation = (rack: Rack) => {
    setSelectedRack(rack);
    setCurrentView('elevacion');
  };

  const handleNavigateToPorts = (rackOrEquipment?: Rack | string) => {
    if (typeof rackOrEquipment === 'string') {
      setSelectedEquipmentId(rackOrEquipment);
    } else if (rackOrEquipment) {
      setSelectedRack(rackOrEquipment);
    }
    setCurrentView('puertos');
  };

  const handleSelectCamera = (cam: Camara) => {
    setSelectedCamera(cam);
    setCurrentView('camara');
  };

  const handleNavigateToMaintenance = (cam: Camara) => {
    setSelectedCamera(cam);
    setCurrentView('mantenimiento');
  };

  const handleNavigateToRackById = async (rackId: string) => {
    try {
      const { data } = await supabase.from('racks').select('*').eq('id', rackId).single();
      if (data) {
        setSelectedRack(data);
        setCurrentView('elevacion');
      }
    } catch (err) {
      console.error('Error navigating to rack:', err);
    }
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center font-mono text-xs text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Iniciando Base de Datos CCTV InfraRegistro...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans text-slate-800">
      {/* Global Normalized Header */}
      <Header 
        currentView={currentView}
        onNavigate={(view) => {
          setCurrentView(view);
          fetchUnassignedCount();
          fetchWarehouseCount();
        }}
        selectedRackCode={selectedRack?.codigo}
        selectedCameraCode={selectedCamera?.codigo}
        unassignedCount={unassignedCount}
        warehouseCount={warehouseCount}
      />

      {/* Main View Router */}
      <main className="flex-1 pb-12">
        {currentView === 'explorador' && (
          <PhysicalTree
            onSelectRack={handleSelectRackFromTree}
            onSelectCamera={handleSelectCamera}
            onNavigateToElevation={handleNavigateToElevation}
            onNavigateToPorts={handleNavigateToPorts}
            selectedRackId={selectedRack?.id}
          />
        )}

        {currentView === 'elevacion' && (
          selectedRack ? (
            <RackElevation
              rack={selectedRack}
              onBackToTree={() => setCurrentView('explorador')}
              onNavigateToPorts={handleNavigateToPorts}
            />
          ) : (
            <PhysicalTree
              onSelectRack={handleSelectRackFromTree}
              onSelectCamera={handleSelectCamera}
              onNavigateToElevation={handleNavigateToElevation}
              onNavigateToPorts={handleNavigateToPorts}
            />
          )
        )}

        {currentView === 'puertos' && (
          <PatchPanelPortMap
            rack={selectedRack}
            onSelectRack={(r) => setSelectedRack(r)}
            initialEquipmentId={selectedEquipmentId}
            onSelectCamera={handleSelectCamera}
            onBackToRack={() => setCurrentView('elevacion')}
          />
        )}

        {currentView === 'camara' && (
          selectedCamera ? (
            <CameraDetail
              camera={selectedCamera}
              onBack={() => setCurrentView('inventario')}
              onNavigateToMaintenance={handleNavigateToMaintenance}
              onNavigateToRack={handleNavigateToRackById}
              onNavigateToPlanimetria={() => setCurrentView('planimetria')}
              onCameraUpdated={(updated) => {
                setSelectedCamera(updated);
                fetchWarehouseCount();
              }}
              onCameraDeleted={() => {
                setSelectedCamera(null);
                fetchWarehouseCount();
                setCurrentView('inventario');
              }}
            />
          ) : (
            <InventoryList
              onSelectCamera={handleSelectCamera}
              onSelectRack={handleNavigateToRackById}
              onNavigateToRegistration={() => setCurrentView('registro')}
              onNavigateToMaintenance={handleNavigateToMaintenance}
            />
          )
        )}

        {currentView === 'registro' && (
          <FieldRegistrationForm
            onSuccess={async (newCamId) => {
              if (newCamId) {
                const { data } = await supabase.from('camaras').select('*').eq('id', newCamId).single();
                if (data) setSelectedCamera(data);
              }
              fetchWarehouseCount();
              setCurrentView('inventario');
            }}
            onCancel={() => setCurrentView('explorador')}
          />
        )}

        {currentView === 'mantenimiento' && (
          <MaintenanceHistory
            entityType="camara"
            camera={selectedCamera || undefined}
            onBack={() => setCurrentView('camara')}
          />
        )}

        {currentView === 'inventario' && (
          <InventoryList
            onSelectCamera={handleSelectCamera}
            onSelectRack={handleNavigateToRackById}
            onNavigateToRegistration={() => setCurrentView('registro')}
            onNavigateToMaintenance={handleNavigateToMaintenance}
          />
        )}

        {currentView === 'reportes' && (
          <ReportsView
            onSelectRack={(rk) => {
              setSelectedRack(rk);
              setCurrentView('elevacion');
            }}
            onNavigateToPorts={(eqId) => {
              if (eqId) setSelectedEquipmentId(eqId);
              setCurrentView('puertos');
            }}
            onSelectCamera={(cam) => {
              setSelectedCamera(cam);
              setCurrentView('camara');
            }}
          />
        )}

        {currentView === 'planimetria' && (
          <FloorPlanCoverage
            initialPisoId={selectedCamera?.piso_id || undefined}
            initialCameraId={selectedCamera?.id || undefined}
            onSelectCamera={handleSelectCamera}
            onNavigateToRegistration={() => setCurrentView('registro')}
            onBack={() => setCurrentView('camara')}
          />
        )}

        {currentView === 'bodega_bajas' && (
          <WarehouseView
            onSelectCamera={(cam) => {
              setSelectedCamera(cam);
              setCurrentView('camara');
            }}
            onNavigateToMaintenance={(cam) => {
              setSelectedCamera(cam);
              setCurrentView('mantenimiento');
            }}
          />
        )}

        {currentView === 'sin_asignar' && (
          <UnassignedItems
            onNavigateToRack={(rack) => {
              setSelectedRack(rack);
              setCurrentView('elevacion');
            }}
            onNavigateToCamera={(cam) => {
              setSelectedCamera(cam);
              setCurrentView('camara');
            }}
            onNavigateToTree={() => setCurrentView('explorador')}
            onReassigned={() => {
              fetchUnassignedCount();
              fetchWarehouseCount();
            }}
          />
        )}

        {currentView === 'catalogos' && (
          <CatalogsView />
        )}
      </main>

      {/* Global Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 text-[11px] font-mono text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">CCTV InfraRegistro v2.4.2</span>
            <span className="text-slate-300">|</span>
            <span>Red Campus Central • Soporte Técnico Operativo</span>
          </div>
          <div>
            <span>© Infraestructura Universitaria. Uso exclusivo de cuadrilla autorizada.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
