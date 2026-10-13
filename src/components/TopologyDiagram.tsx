import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  useReactFlow,
  ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Server,
  Zap,
  Shield,
  Layers,
  Radio,
  MapPin,
  ExternalLink,
  Unlink,
  X,
  Maximize2,
  RefreshCw,
  Eye,
  Calendar,
  AlertTriangle,
  HelpCircle,
  Edit2,
  Check,
  ChevronRight,
  List
} from 'lucide-react';

import { TopologiaSwitchVista, EnlaceTroncalVista } from '../types/database';
import { SwitchNode, SwitchNodeData } from './SwitchNode';
import { TrunkEdge } from './TrunkEdge';
import { supabase } from '../lib/supabase';

// Custom node and edge types registration for React Flow
const nodeTypes = {
  switchNode: SwitchNode
};

const edgeTypes = {
  trunkEdge: TrunkEdge
};

interface TopologyDiagramProps {
  switches: TopologiaSwitchVista[];
  enlaces: EnlaceTroncalVista[];
  selectedEnlaceIdFromList?: string | null;
  onClearSelectedEnlaceFromList?: () => void;
  onDisconnectEnlace: (enlace: EnlaceTroncalVista) => void;
  onOpenSwitchFicha?: (switchObj: TopologiaSwitchVista) => void;
  onSwitchRoleUpdated?: () => void;
  onNavigateToListadoWithEnlace?: (enlaceId: string) => void;
}

// Hierarchical ranks
const ROLE_RANK: Record<string, number> = {
  core: 0,
  distribucion: 1,
  acceso: 2,
  sin_rol: 3
};

const normalizeRole = (role?: string | null): 'core' | 'distribucion' | 'acceso' | 'sin_rol' => {
  if (!role) return 'sin_rol';
  const clean = role.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (clean === 'core') return 'core';
  if (clean === 'distribucion') return 'distribucion';
  if (clean === 'acceso') return 'acceso';
  return 'sin_rol';
};

const renderRoleBadge = (rol?: string | null) => {
  const norm = normalizeRole(rol);
  let bg = 'bg-slate-100 text-slate-700 border-slate-300';
  let label = 'Sin rol';
  if (norm === 'core') {
    bg = 'bg-purple-100 text-purple-800 border-purple-300';
    label = 'Core';
  } else if (norm === 'distribucion') {
    bg = 'bg-blue-100 text-blue-800 border-blue-300';
    label = 'Distribución';
  } else if (norm === 'acceso') {
    bg = 'bg-emerald-100 text-emerald-800 border-emerald-300';
    label = 'Acceso';
  }
  return (
    <span className={`inline-flex items-center text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${bg}`}>
      {label}
    </span>
  );
};

// Internal diagram component wrapped by ReactFlowProvider
const DiagramInner: React.FC<TopologyDiagramProps> = ({
  switches,
  enlaces,
  selectedEnlaceIdFromList,
  onClearSelectedEnlaceFromList,
  onDisconnectEnlace,
  onOpenSwitchFicha,
  onSwitchRoleUpdated,
  onNavigateToListadoWithEnlace
}) => {
  const reactFlowInstance = useReactFlow();

  // Visible Level Selector state: 'core' | 'core_dist' | 'all'
  const [levelFilter, setLevelFilter] = useState<'core' | 'core_dist' | 'all'>('all');

  // Collapsed branches state (set of switch IDs whose children are hidden)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  // Selected item in sidebar
  const [selectedSwitchId, setSelectedSwitchId] = useState<string | null>(null);
  const [selectedEnlaceId, setSelectedEnlaceId] = useState<string | null>(null);

  // Role editing state in sidebar
  const [editingRole, setEditingRole] = useState<boolean>(false);
  const [newRoleValue, setNewRoleValue] = useState<string>('');
  const [savingRole, setSavingRole] = useState<boolean>(false);

  // Node & Edge state for React Flow
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Toggle collapse callback
  const handleToggleCollapse = useCallback((nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Selection callback for node
  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedSwitchId(nodeId);
    setSelectedEnlaceId(null);
    setEditingRole(false);
  }, []);

  // Adjacency graph computation for parent/child hierarchies and paths to Core
  const graphData = useMemo(() => {
    const parentMap: Map<string, Set<string>> = new Map(); // node -> parents (higher rank/closer to core)
    const childrenMap: Map<string, Set<string>> = new Map(); // node -> children (lower rank)
    const neighborsMap: Map<string, Set<string>> = new Map(); // node -> all connected nodes
    const nodeRoleMap: Map<string, 'core' | 'distribucion' | 'acceso' | 'sin_rol'> = new Map();

    switches.forEach((s) => {
      parentMap.set(s.id, new Set());
      childrenMap.set(s.id, new Set());
      neighborsMap.set(s.id, new Set());
      nodeRoleMap.set(s.id, normalizeRole(s.rol_red));
    });

    // Enlaces analysis: hierarchy is governed exclusively by switch role (ROLE_RANK)
    enlaces.forEach((e) => {
      const u = e.superior_id;
      const v = e.inferior_id;
      if (!nodeRoleMap.has(u) || !nodeRoleMap.has(v)) return;

      neighborsMap.get(u)?.add(v);
      neighborsMap.get(v)?.add(u);

      const rankU = ROLE_RANK[nodeRoleMap.get(u)!];
      const rankV = ROLE_RANK[nodeRoleMap.get(v)!];

      if (rankU < rankV) {
        // U is parent of V (U higher rank)
        parentMap.get(v)?.add(u);
        childrenMap.get(u)?.add(v);
      } else if (rankV < rankU) {
        // V is parent of U (V higher rank)
        parentMap.get(u)?.add(v);
        childrenMap.get(v)?.add(u);
      }
    });

    return { parentMap, childrenMap, neighborsMap, nodeRoleMap };
  }, [switches, enlaces]);

  // Compute hidden nodes due to collapse:
  // "al contraer, se ocultan los vecinos inferiores que no tengan otro vecino superior visible"
  const hiddenByCollapse = useMemo(() => {
    const hidden = new Set<string>();
    if (collapsedNodes.size === 0) return hidden;

    // We process levels top-down (Core -> Dist -> Acceso)
    // For each node, if all its parents are collapsed or hidden, it becomes hidden
    const roleMap = graphData.nodeRoleMap;
    const parentMap = graphData.parentMap;

    // Sorted switches from higher rank to lower rank
    const sorted = [...switches].sort(
      (a, b) => ROLE_RANK[roleMap.get(a.id)!] - ROLE_RANK[roleMap.get(b.id)!]
    );

    sorted.forEach((sw) => {
      const parents = parentMap.get(sw.id) || new Set();
      if (parents.size > 0) {
        // Check if ANY parent is visible and NOT collapsed
        const hasVisibleActiveParent = Array.from(parents).some(
          (parentId) => !hidden.has(parentId) && !collapsedNodes.has(parentId)
        );
        if (!hasVisibleActiveParent) {
          hidden.add(sw.id);
        }
      }
    });

    return hidden;
  }, [collapsedNodes, graphData, switches]);

  // Determine path to Core for selected switch (Highlight path to Core)
  const highlightedElements = useMemo(() => {
    if (!selectedSwitchId && !selectedEnlaceId) {
      return { nodeIds: new Set<string>(), edgeIds: new Set<string>() };
    }

    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();

    if (selectedEnlaceId) {
      edgeIds.add(selectedEnlaceId);
      const en = enlaces.find((e) => e.enlace_id === selectedEnlaceId);
      if (en) {
        nodeIds.add(en.superior_id);
        nodeIds.add(en.inferior_id);
      }
      return { nodeIds, edgeIds };
    }

    if (selectedSwitchId) {
      nodeIds.add(selectedSwitchId);

      // Traverse upwards to Core using BFS
      const queue = [selectedSwitchId];
      const visited = new Set<string>([selectedSwitchId]);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const parents = graphData.parentMap.get(curr) || new Set();

        parents.forEach((pId) => {
          nodeIds.add(pId);

          // Find trunk edge between curr and pId
          enlaces.forEach((e) => {
            if (
              (e.superior_id === curr && e.inferior_id === pId) ||
              (e.superior_id === pId && e.inferior_id === curr)
            ) {
              edgeIds.add(e.enlace_id);
            }
          });

          if (!visited.has(pId)) {
            visited.add(pId);
            queue.push(pId);
          }
        });
      }
    }

    return { nodeIds, edgeIds };
  }, [selectedSwitchId, selectedEnlaceId, graphData, enlaces]);

  // Node positions map: switchId -> { x, y }
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [positionsLoaded, setPositionsLoaded] = useState<boolean>(false);

  // Debounced DB persistence queue
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const pendingSavesRef = React.useRef<Map<string, { x: number; y: number }>>(new Map());

  // Debounced flush to topologia_posiciones table (vista = 'general')
  const queueSavePosition = useCallback((equipoId: string, x: number, y: number) => {
    pendingSavesRef.current.set(equipoId, { x, y });
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      const entriesToSave = Array.from(pendingSavesRef.current.entries());
      pendingSavesRef.current.clear();
      if (entriesToSave.length === 0) return;

      try {
        const rows = entriesToSave.map(([eqId, pos]) => ({
          vista: 'general',
          equipo_id: eqId,
          x: Math.round(pos.x),
          y: Math.round(pos.y),
          updated_at: new Date().toISOString()
        }));

        const { error } = await supabase
          .from('topologia_posiciones')
          .upsert(rows, { onConflict: 'vista,equipo_id' });

        if (error) {
          console.error('Error al guardar posiciones en topologia_posiciones:', error);
        }
      } catch (err) {
        console.error('Error inesperado al persistir posiciones:', err);
      }
    }, 400); // 400ms debounce
  }, []);

  // Compute Auto-Layout positions for a given list of switches
  const computeAutoLayout = useCallback(
    (swList: TopologiaSwitchVista[]): Map<string, { x: number; y: number }> => {
      const { parentMap, nodeRoleMap } = graphData;

      const coreSwitches: TopologiaSwitchVista[] = [];
      const distSwitches: TopologiaSwitchVista[] = [];
      const accesoSwitches: TopologiaSwitchVista[] = [];
      const sinRolSwitches: TopologiaSwitchVista[] = [];

      swList.forEach((s) => {
        const r = nodeRoleMap.get(s.id) || 'sin_rol';
        if (r === 'core') coreSwitches.push(s);
        else if (r === 'distribucion') distSwitches.push(s);
        else if (r === 'acceso') accesoSwitches.push(s);
        else sinRolSwitches.push(s);
      });

      const sortLevelByParents = (
        currentLevel: TopologiaSwitchVista[],
        previousLevel: TopologiaSwitchVista[]
      ) => {
        const prevIndexMap = new Map<string, number>();
        previousLevel.forEach((p, idx) => prevIndexMap.set(p.id, idx));

        return [...currentLevel].sort((a, b) => {
          const parentsA = Array.from(parentMap.get(a.id) || []);
          const parentsB = Array.from(parentMap.get(b.id) || []);

          const avgIndexA =
            parentsA.length > 0
              ? parentsA.reduce((sum, id) => sum + (prevIndexMap.get(id) ?? 999), 0) /
                parentsA.length
              : 999;
          const avgIndexB =
            parentsB.length > 0
              ? parentsB.reduce((sum, id) => sum + (prevIndexMap.get(id) ?? 999), 0) /
                parentsB.length
              : 999;

          if (avgIndexA !== avgIndexB) return avgIndexA - avgIndexB;
          return a.codigo.localeCompare(b.codigo);
        });
      };

      coreSwitches.sort((a, b) => a.codigo.localeCompare(b.codigo));
      const sortedDist = sortLevelByParents(distSwitches, coreSwitches);
      const sortedAcceso = sortLevelByParents(accesoSwitches, sortedDist);
      sinRolSwitches.sort((a, b) => a.codigo.localeCompare(b.codigo));

      const NODE_WIDTH = 270;
      const NODE_GAP_X = 70;
      const LEVEL_HEIGHT = 230;

      const maxRowNodes = Math.max(
        coreSwitches.length,
        sortedDist.length,
        sortedAcceso.length,
        sinRolSwitches.length,
        1
      );
      const canvasCenterX = ((maxRowNodes - 1) * (NODE_WIDTH + NODE_GAP_X)) / 2 + 100;

      const resultMap = new Map<string, { x: number; y: number }>();

      const placeRow = (items: TopologiaSwitchVista[], y: number) => {
        const rowWidth = (items.length - 1) * (NODE_WIDTH + NODE_GAP_X);
        const startX = canvasCenterX - rowWidth / 2;

        items.forEach((sw, idx) => {
          const x = startX + idx * (NODE_WIDTH + NODE_GAP_X);
          resultMap.set(sw.id, { x, y });
        });
      };

      let currentY = 50;
      if (coreSwitches.length > 0) {
        placeRow(coreSwitches, currentY);
        currentY += LEVEL_HEIGHT;
      }
      if (sortedDist.length > 0) {
        placeRow(sortedDist, currentY);
        currentY += LEVEL_HEIGHT;
      }
      if (sortedAcceso.length > 0) {
        placeRow(sortedAcceso, currentY);
        currentY += LEVEL_HEIGHT;
      }
      if (sinRolSwitches.length > 0) {
        currentY += 40;
        placeRow(sinRolSwitches, currentY);
      }

      return resultMap;
    },
    [graphData]
  );

  // 1. Initial Load: fetch saved positions from topologia_posiciones table (vista = 'general')
  useEffect(() => {
    let isCancelled = false;
    const loadSavedPositions = async () => {
      try {
        const { data, error } = await supabase
          .from('topologia_posiciones')
          .select('equipo_id, x, y')
          .eq('vista', 'general');

        if (error) {
          console.error('Error fetching topologia_posiciones:', error);
        }

        if (isCancelled) return;

        const savedMap = new Map<string, { x: number; y: number }>();
        (data || []).forEach((row) => {
          if (row.equipo_id && row.x !== null && row.y !== null) {
            savedMap.set(row.equipo_id, { x: Number(row.x), y: Number(row.y) });
          }
        });

        // Compute auto layout for switches that don't have a saved position
        const autoMap = computeAutoLayout(switches);
        const mergedMap = new Map<string, { x: number; y: number }>();

        switches.forEach((sw) => {
          if (savedMap.has(sw.id)) {
            mergedMap.set(sw.id, savedMap.get(sw.id)!);
          } else if (autoMap.has(sw.id)) {
            mergedMap.set(sw.id, autoMap.get(sw.id)!);
          }
        });

        setNodePositions(mergedMap);
        setPositionsLoaded(true);
      } catch (err) {
        console.error('Error loading positions:', err);
        if (!isCancelled) {
          const autoMap = computeAutoLayout(switches);
          setNodePositions(autoMap);
          setPositionsLoaded(true);
        }
      }
    };

    loadSavedPositions();

    return () => {
      isCancelled = true;
    };
  }, [switches, computeAutoLayout]);

  // Handle new switches that appeared and don't have position yet
  useEffect(() => {
    if (!positionsLoaded) return;
    setNodePositions((prev) => {
      let changed = false;
      const next = new Map(prev);
      const missingSwitches: TopologiaSwitchVista[] = [];

      switches.forEach((sw) => {
        if (!next.has(sw.id)) {
          missingSwitches.push(sw);
        }
      });

      if (missingSwitches.length > 0) {
        const auto = computeAutoLayout(switches);
        missingSwitches.forEach((sw) => {
          if (auto.has(sw.id)) {
            next.set(sw.id, auto.get(sw.id)!);
            changed = true;
          }
        });
      }

      return changed ? next : prev;
    });
  }, [switches, positionsLoaded, computeAutoLayout]);

  // Compute which switches are currently visible based on levelFilter & collapse
  const visibleSwitches = useMemo(() => {
    const isLevelVisible = (role: string) => {
      if (levelFilter === 'core') return role === 'core';
      if (levelFilter === 'core_dist') return role === 'core' || role === 'distribucion';
      return true; // 'all'
    };

    return switches.filter((s) => {
      const r = graphData.nodeRoleMap.get(s.id) || 'sin_rol';
      if (!isLevelVisible(r)) return false;
      if (hiddenByCollapse.has(s.id)) return false;
      return true;
    });
  }, [switches, levelFilter, hiddenByCollapse, graphData.nodeRoleMap]);

  // Synchronize React Flow nodes WITHOUT changing their positions upon selection / collapse
  useEffect(() => {
    if (!positionsLoaded) return;

    const visibleNodeIds = new Set(visibleSwitches.map((s) => s.id));
    const { childrenMap } = graphData;

    setNodes((prevNodes) => {
      // Map existing nodes by id to preserve their live dragged positions in React Flow
      const prevNodeMap = new Map(prevNodes.map((n) => [n.id, n]));

      return visibleSwitches.map((sw) => {
        const existingNode = prevNodeMap.get(sw.id);
        const pos =
          existingNode?.position ??
          nodePositions.get(sw.id) ?? { x: 100, y: 100 };

        const children = childrenMap.get(sw.id) || new Set();
        const hasChildren = children.size > 0;
        const isCollapsed = collapsedNodes.has(sw.id);

        const isHighlighted = highlightedElements.nodeIds.has(sw.id);
        const isSelected = selectedSwitchId === sw.id;
        const isDimmed =
          (selectedSwitchId !== null || selectedEnlaceId !== null) &&
          !isHighlighted &&
          !isSelected;

        const nodeData: SwitchNodeData = {
          switchData: sw,
          isHighlighted,
          isDimmed,
          isSelected,
          hasChildren,
          isCollapsed,
          onToggleCollapse: handleToggleCollapse,
          onSelectNode: handleSelectNode
        };

        return {
          id: sw.id,
          type: 'switchNode',
          position: pos,
          data: nodeData
        };
      });
    });

    // Synchronize Edges
    const pairCountMap: Map<string, number> = new Map();
    const pairTotalMap: Map<string, number> = new Map();

    enlaces.forEach((e) => {
      if (!visibleNodeIds.has(e.superior_id) || !visibleNodeIds.has(e.inferior_id)) return;
      const pairKey = [e.superior_id, e.inferior_id].sort().join('___');
      pairTotalMap.set(pairKey, (pairTotalMap.get(pairKey) || 0) + 1);
    });

    const rfEdges: Edge[] = [];

    enlaces.forEach((e) => {
      if (!visibleNodeIds.has(e.superior_id) || !visibleNodeIds.has(e.inferior_id)) return;

      const pairKey = [e.superior_id, e.inferior_id].sort().join('___');
      const totalPairs = pairTotalMap.get(pairKey) || 1;
      const currentIdx = pairCountMap.get(pairKey) || 0;
      pairCountMap.set(pairKey, currentIdx + 1);

      const rolSup = normalizeRole(e.superior_rol);
      const rolInf = normalizeRole(e.inferior_rol);

      // Requirement 2:
      // "Los enlaces entre switches del mismo nivel, o donde algún extremo no tiene rol, se dibujan horizontales:
      // agrega puntos de conexión laterales (izquierdo y derecho) a los nodos y úsalos para esos casos."
      const isHorizontal = rolSup === 'sin_rol' || rolInf === 'sin_rol' || rolSup === rolInf;

      const sourceId = e.superior_id;
      const targetId = e.inferior_id;

      let sourceHandle = 'bottom';
      let targetHandle = 'top';

      if (isHorizontal) {
        // Compare horizontal positions
        const posSup = nodePositions.get(e.superior_id);
        const posInf = nodePositions.get(e.inferior_id);
        const xSup = posSup?.x ?? 0;
        const xInf = posInf?.x ?? 0;

        if (xSup <= xInf) {
          sourceHandle = 'right-source';
          targetHandle = 'left-target';
        } else {
          sourceHandle = 'left-source';
          targetHandle = 'right-target';
        }
      } else {
        // Hierarchical vertical link:
        // "de modo que cada enlace salga del punto inferior del nodo superior y llegue al punto superior del nodo inferior"
        sourceHandle = 'bottom';
        targetHandle = 'top';
      }

      let curveOffset = 0;
      if (totalPairs > 1) {
        curveOffset = currentIdx === 0 ? -45 : 45;
      }

      const isHighlighted = highlightedElements.edgeIds.has(e.enlace_id);
      const isDimmed =
        (selectedSwitchId !== null || selectedEnlaceId !== null) && !isHighlighted;

      rfEdges.push({
        id: e.enlace_id,
        type: 'trunkEdge',
        source: sourceId,
        target: targetId,
        sourceHandle,
        targetHandle,
        data: {
          enlaceId: e.enlace_id,
          esPrincipal: e.es_principal,
          saltaJerarquia: Boolean(e.salta_jerarquia),
          superiorPuerto: e.superior_puerto,
          inferiorPuerto: e.inferior_puerto,
          curveOffset,
          isHighlighted,
          isDimmed
        }
      });
    });

    setEdges(rfEdges);
  }, [
    positionsLoaded,
    visibleSwitches,
    nodePositions,
    enlaces,
    graphData,
    highlightedElements,
    selectedSwitchId,
    selectedEnlaceId,
    collapsedNodes,
    handleToggleCollapse,
    handleSelectNode,
    setNodes,
    setEdges
  ]);

  // Handle Drag Stop: persist to state and queue DB upsert
  const handleNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      const { id, position } = node;
      setNodePositions((prev) => {
        const next = new Map(prev);
        next.set(id, { x: position.x, y: position.y });
        return next;
      });
      queueSavePosition(id, position.x, position.y);
    },
    [queueSavePosition]
  );

  // If selectedEnlaceIdFromList is passed from Listado, select it and focus
  useEffect(() => {
    if (selectedEnlaceIdFromList) {
      setSelectedEnlaceId(selectedEnlaceIdFromList);
      setSelectedSwitchId(null);
      onClearSelectedEnlaceFromList?.();
    }
  }, [selectedEnlaceIdFromList, onClearSelectedEnlaceFromList]);

  // Handler for Edge Click
  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEnlaceId(edge.id);
    setSelectedSwitchId(null);
    setEditingRole(false);
  }, []);

  // Handler for clicking empty canvas
  const handlePaneClick = useCallback(() => {
    setSelectedSwitchId(null);
    setSelectedEnlaceId(null);
    setEditingRole(false);
  }, []);

  // Reset / Reorganize: delete saved positions from DB and reset to auto-layout
  const handleReorganize = useCallback(async () => {
    try {
      // 1. Delete saved positions for this view from topologia_posiciones
      const { error } = await supabase
        .from('topologia_posiciones')
        .delete()
        .eq('vista', 'general');

      if (error) {
        console.error('Error al limpiar topologia_posiciones:', error);
      }

      // 2. Compute fresh auto-layout
      const autoMap = computeAutoLayout(switches);
      setNodePositions(autoMap);

      // 3. Immediately update nodes in React Flow with auto positions
      setNodes((prevNodes) =>
        prevNodes.map((n) => {
          const autoPos = autoMap.get(n.id) ?? n.position;
          return {
            ...n,
            position: autoPos
          };
        })
      );

      // 4. Fit view
      setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
      }, 50);
    } catch (err) {
      console.error('Error during reorganize:', err);
    }
  }, [computeAutoLayout, switches, setNodes, reactFlowInstance]);

  // Fit view button handler
  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.15, duration: 300 });
  }, [reactFlowInstance]);

  // Selected Switch Object
  const selectedSwitchObj = useMemo(() => {
    if (!selectedSwitchId) return null;
    return switches.find((s) => s.id === selectedSwitchId) || null;
  }, [selectedSwitchId, switches]);

  // Selected Enlace Object
  const selectedEnlaceObj = useMemo(() => {
    if (!selectedEnlaceId) return null;
    return enlaces.find((e) => e.enlace_id === selectedEnlaceId) || null;
  }, [selectedEnlaceId, enlaces]);

  // Switch Links list for sidebar
  const selectedSwitchEnlaces = useMemo(() => {
    if (!selectedSwitchId) return [];
    return enlaces.filter(
      (e) => e.superior_id === selectedSwitchId || e.inferior_id === selectedSwitchId
    );
  }, [selectedSwitchId, enlaces]);

  // Role update handler for switch
  const handleSaveRole = async () => {
    if (!selectedSwitchObj || !newRoleValue) return;
    try {
      setSavingRole(true);
      const roleToSave = newRoleValue === 'sin_rol' ? null : newRoleValue;
      const { error } = await supabase
        .from('equipos')
        .update({ rol_red: roleToSave })
        .eq('id', selectedSwitchObj.id);

      if (error) throw error;

      setEditingRole(false);
      onSwitchRoleUpdated?.();
    } catch (err: any) {
      console.error('Error al actualizar rol de red:', err);
      alert('Error al actualizar rol de red: ' + (err.message || String(err)));
    } finally {
      setSavingRole(false);
    }
  };

  return (
    <div className="relative w-full h-[750px] bg-slate-50 rounded-xl border border-slate-200 overflow-hidden shadow-xs flex">
      {/* Top Controls Bar */}
      <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur-xs p-2 rounded-xl border border-slate-200 shadow-sm font-mono text-xs">
        {/* Nivel Visible Selector */}
        <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
          <Eye className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[11px] font-bold text-slate-700">Nivel visible:</span>
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
            <button
              type="button"
              onClick={() => setLevelFilter('core')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                levelFilter === 'core'
                  ? 'bg-purple-600 text-white font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Solo Core
            </button>
            <button
              type="button"
              onClick={() => setLevelFilter('core_dist')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                levelFilter === 'core_dist'
                  ? 'bg-blue-600 text-white font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Core + Dist.
            </button>
            <button
              type="button"
              onClick={() => setLevelFilter('all')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                levelFilter === 'all'
                  ? 'bg-slate-800 text-white font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({switches.length})
            </button>
          </div>
        </div>

        {/* Action: Reorganizar */}
        <button
          type="button"
          onClick={handleReorganize}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-semibold text-[11px] transition-colors shadow-2xs cursor-pointer"
          title="Reorganizar switches jerárquicamente por niveles"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
          <span>Reorganizar</span>
        </button>

        {/* Action: Ajustar a pantalla */}
        <button
          type="button"
          onClick={handleFitView}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-semibold text-[11px] transition-colors shadow-2xs cursor-pointer"
          title="Ajustar diagrama a la pantalla"
        >
          <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
          <span>Ajustar a pantalla</span>
        </button>
      </div>

      {/* Legend Box (Bottom Left) */}
      <div className="absolute bottom-3 left-3 z-20 bg-white/95 backdrop-blur-xs p-3 rounded-xl border border-slate-200 shadow-sm font-mono text-[11px] space-y-2 pointer-events-auto max-w-xs">
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
          Leyenda del Esquema
        </span>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-1 bg-purple-600 rounded"></span>
            <span className="text-purple-900 font-bold">Core</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-1 bg-blue-600 rounded"></span>
            <span className="text-blue-900 font-bold">Distribución</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-1 bg-emerald-600 rounded"></span>
            <span className="text-emerald-900 font-bold">Acceso</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-1 bg-slate-400 rounded"></span>
            <span className="text-slate-600">Sin Rol</span>
          </div>
        </div>

        <div className="pt-1.5 border-t border-slate-100 space-y-1 text-[10px]">
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 bg-blue-600"></span>
            <span className="text-slate-700 font-medium">Troncal Principal (sólida)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 border-b-2 border-dashed border-amber-600"></span>
            <span className="text-amber-800 font-medium">Troncal Respaldo (punteada)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 bg-rose-600"></span>
            <span className="text-rose-700 font-medium">Salta Distribución (rosa/rojo)</span>
          </div>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStop}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.2}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} color="#cbd5e1" />
          <Controls showInteractive={false} position="bottom-right" className="!mr-3 !mb-3" />
          <MiniMap
            position="top-right"
            className="!mt-3 !mr-3 !border !border-slate-200 !rounded-xl !overflow-hidden !shadow-md"
            nodeColor={(n) => {
              const sw = (n.data as SwitchNodeData)?.switchData;
              const r = normalizeRole(sw?.rol_red);
              if (r === 'core') return '#9333ea';
              if (r === 'distribucion') return '#2563eb';
              if (r === 'acceso') return '#10b981';
              return '#94a3b8';
            }}
            maskColor="rgba(241, 245, 249, 0.7)"
          />
        </ReactFlow>
      </div>

      {/* SIDEBAR DETAILS PANEL (Switch or Enlace selected) */}
      {(selectedSwitchObj || selectedEnlaceObj) && (
        <div className="w-80 md:w-96 bg-white border-l border-slate-200 shadow-xl z-30 flex flex-col h-full animate-in slide-in-from-right duration-200 font-mono text-xs overflow-y-auto">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              {selectedSwitchObj ? (
                <>
                  <div className="p-1.5 rounded-lg bg-blue-100 text-blue-800">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      {selectedSwitchObj.codigo}
                    </h3>
                    <span className="text-[10px] text-slate-500 font-sans block">
                      Detalle de Conmutador
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 pr-1">
                    <h3
                      className="font-bold text-slate-900 text-sm flex items-center gap-1.5 truncate"
                      title={`${selectedEnlaceObj?.superior_codigo || 'Superior'} → ${selectedEnlaceObj?.inferior_codigo || 'Inferior'}`}
                    >
                      <span className="truncate">{selectedEnlaceObj?.superior_codigo}</span>
                      <span className="text-slate-400 font-normal shrink-0">→</span>
                      <span className="truncate">{selectedEnlaceObj?.inferior_codigo}</span>
                    </h3>
                    <span className="text-[10px] text-slate-500 font-sans block truncate">
                      Enlace Troncal {selectedEnlaceObj?.es_principal ? 'Principal' : 'de Respaldo'}
                    </span>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedSwitchId(null);
                setSelectedEnlaceId(null);
                setEditingRole(false);
              }}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Panel Content for Selected SWITCH */}
          {selectedSwitchObj && (
            <div className="p-4 space-y-4">
              {/* Resumen General */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[11px]">Modelo:</span>
                  <span className="font-semibold text-slate-900 text-right">
                    {selectedSwitchObj.marca ? `${selectedSwitchObj.marca} ` : ''}
                    {selectedSwitchObj.modelo || 'Sin modelo'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[11px]">Ubicación:</span>
                  <span className="font-semibold text-slate-800 text-right text-[11px]">
                    {selectedSwitchObj.ubicacion || 'Sin ubicación'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[11px]">Puertos SFP:</span>
                  <span className="font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[11px]">
                    {selectedSwitchObj.sfp_conectados ?? 0} conectados / {selectedSwitchObj.puertos_sfp ?? 0} totales
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-[11px]">Puertos RJ45:</span>
                  <span className="font-semibold text-slate-700 text-[11px]">
                    {selectedSwitchObj.puertos_rj45 ?? 0} puertos
                  </span>
                </div>
              </div>

              {/* Selector Editable: Rol en la Red */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wide">
                    Rol en la Red:
                  </span>
                  {!editingRole && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRole(true);
                        setNewRoleValue(normalizeRole(selectedSwitchObj.rol_red));
                      }}
                      className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Cambiar rol</span>
                    </button>
                  )}
                </div>

                {editingRole ? (
                  <div className="space-y-2 pt-1">
                    <select
                      value={newRoleValue}
                      onChange={(e) => setNewRoleValue(e.target.value)}
                      className="w-full py-1.5 px-2 border border-blue-400 rounded-lg text-xs bg-white font-mono focus:ring-1 focus:ring-blue-600 focus:outline-none"
                    >
                      <option value="core">Core (Troncal principal)</option>
                      <option value="distribucion">Distribución (Agregación)</option>
                      <option value="acceso">Acceso (Borde)</option>
                      <option value="sin_rol">Sin rol asignado</option>
                    </select>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingRole(false)}
                        disabled={savingRole}
                        className="px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100 rounded border border-slate-300 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveRole}
                        disabled={savingRole}
                        className="px-3 py-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        {savingRole ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        <span>Guardar y reubicar</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900 capitalize">
                      {normalizeRole(selectedSwitchObj.rol_red)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-sans">
                      (Nivel jerárquico actual)
                    </span>
                  </div>
                )}
              </div>

              {/* Lista de Enlaces Troncales del Switch */}
              <div className="space-y-2">
                <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wide block">
                  Troncales Conectados ({selectedSwitchEnlaces.length}):
                </span>

                {selectedSwitchEnlaces.length === 0 ? (
                  <div className="p-3 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-xs">
                    Este switch no tiene enlaces troncales activos.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedSwitchEnlaces.map((e) => {
                      const isSuperior = e.superior_id === selectedSwitchObj.id;
                      const neighborCode = isSuperior ? e.inferior_codigo : e.superior_codigo;
                      const neighborPort = isSuperior ? e.inferior_puerto : e.superior_puerto;
                      const localPort = isSuperior ? e.superior_puerto : e.inferior_puerto;

                      return (
                        <div
                          key={e.enlace_id}
                          onClick={() => {
                            setSelectedEnlaceId(e.enlace_id);
                            setSelectedSwitchId(null);
                          }}
                          className="p-2.5 bg-slate-50 hover:bg-blue-50/60 rounded-xl border border-slate-200 hover:border-blue-300 transition-all cursor-pointer space-y-1 group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-blue-700 group-hover:underline">
                              ↔ {neighborCode}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                e.es_principal
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-indigo-100 text-indigo-900 border-indigo-300'
                              }`}
                            >
                              {e.es_principal ? 'Principal' : 'Respaldo'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            Local: SFP {localPort} ↔ Remoto: SFP {neighborPort}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action: Abrir ficha del equipo */}
              <div className="pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => onOpenSwitchFicha?.(selectedSwitchObj)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold font-mono text-xs transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir Ficha del Equipo</span>
                </button>
              </div>
            </div>
          )}

          {/* Panel Content for Selected ENLACE */}
          {selectedEnlaceObj && (
            <div className="p-4 space-y-4">
              {/* Tipo badge */}
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-[11px]">Tipo de Enlace:</span>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      selectedEnlaceObj.es_principal
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-indigo-100 text-indigo-900 border-indigo-300'
                    }`}
                  >
                    {selectedEnlaceObj.es_principal ? (
                      <Zap className="w-3 h-3 text-amber-700" />
                    ) : (
                      <Shield className="w-3 h-3 text-indigo-700" />
                    )}
                    <span>{selectedEnlaceObj.es_principal ? 'Principal' : 'Respaldo'}</span>
                  </span>
                  {selectedEnlaceObj.salta_jerarquia && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                      Salta Distribución
                    </span>
                  )}
                </div>
              </div>

              {/* Extremo Superior */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-500">
                    Superior
                  </span>
                  <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[11px] border border-amber-300">
                    SFP {selectedEnlaceObj.superior_puerto}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-900 text-sm">
                    {selectedEnlaceObj.superior_codigo}
                  </span>
                  {renderRoleBadge(selectedEnlaceObj.superior_rol)}
                </div>
                {selectedEnlaceObj.superior_modelo && (
                  <div className="text-[11px] text-slate-500 font-sans">
                    {selectedEnlaceObj.superior_modelo}
                  </div>
                )}
                <div className="text-[10px] text-slate-600 font-mono bg-white p-1.5 rounded border border-slate-200 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {[
                      selectedEnlaceObj.superior_edificio,
                      selectedEnlaceObj.superior_piso,
                      selectedEnlaceObj.superior_rack
                    ].filter(Boolean).join(' · ') || selectedEnlaceObj.superior_ubicacion || 'Sin ubicación'}
                  </span>
                </div>
              </div>

              {/* Extremo Inferior */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-500">
                    Inferior
                  </span>
                  <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[11px] border border-amber-300">
                    SFP {selectedEnlaceObj.inferior_puerto}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-900 text-sm">
                    {selectedEnlaceObj.inferior_codigo}
                  </span>
                  {renderRoleBadge(selectedEnlaceObj.inferior_rol)}
                </div>
                {selectedEnlaceObj.inferior_modelo && (
                  <div className="text-[11px] text-slate-500 font-sans">
                    {selectedEnlaceObj.inferior_modelo}
                  </div>
                )}
                <div className="text-[10px] text-slate-600 font-mono bg-white p-1.5 rounded border border-slate-200 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {[
                      selectedEnlaceObj.inferior_edificio,
                      selectedEnlaceObj.inferior_piso,
                      selectedEnlaceObj.inferior_rack
                    ].filter(Boolean).join(' · ') || selectedEnlaceObj.inferior_ubicacion || 'Sin ubicación'}
                  </span>
                </div>
              </div>

              {/* Fecha de Registro */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Registrado:</span>
                </span>
                <span className="font-semibold text-slate-800">
                  {selectedEnlaceObj.created_at
                    ? new Date(selectedEnlaceObj.created_at).toLocaleDateString()
                    : '—'}
                </span>
              </div>

              {/* Botones de acción del enlace */}
              <div className="pt-2 border-t border-slate-200 space-y-2">
                {/* Ver en listado */}
                <button
                  type="button"
                  onClick={() => onNavigateToListadoWithEnlace?.(selectedEnlaceObj.enlace_id)}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold font-mono text-xs transition-colors shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <List className="w-3.5 h-3.5 text-slate-600" />
                  <span>Ver en Listado</span>
                </button>

                {/* Desconectar con confirmación */}
                <button
                  type="button"
                  onClick={() => onDisconnectEnlace(selectedEnlaceObj)}
                  className="w-full py-2 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-rose-600 rounded-xl font-bold font-mono text-xs transition-colors shadow-2xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Desconectar Enlace</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Export wrapper with ReactFlowProvider
export const TopologyDiagram: React.FC<TopologyDiagramProps> = (props) => {
  return (
    <ReactFlowProvider>
      <DiagramInner {...props} />
    </ReactFlowProvider>
  );
};
