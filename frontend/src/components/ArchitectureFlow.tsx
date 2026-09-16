"use client";

import React, { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  Node,
  Edge,
  Connection,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Monitor, 
  Server, 
  Database, 
  BrainCircuit, 
  HardDriveDownload,
  TerminalSquare,
  Globe,
  Cloud,
  Code2
} from 'lucide-react';
import dagre from 'dagre';
import apiClient from '@/utils/apiClient';
import { useChatStore } from '@/store/chatStore';

const iconMap: Record<string, React.ElementType> = {
  Monitor,
  Server,
  Database,
  BrainCircuit,
  HardDriveDownload,
  TerminalSquare,
  Globe,
  Cloud
};

// Custom Node Component
const CustomNode = ({ data }: { data: Record<string, string> }) => {
  const Icon = iconMap[data.icon] || Code2;
  
  return (
    <div className="px-4 py-3 shadow-lg rounded-xl bg-gray-900 border border-gray-700 min-w-[200px] text-white">
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-blue-400" />
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${data.iconBg || 'bg-blue-500/20 text-blue-400'}`}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        <div>
          <div className="text-sm font-bold">{data.label}</div>
          {data.description && (
            <div className="text-xs text-gray-400 mt-1 max-w-[150px] leading-tight">
              {data.description}
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-blue-400" />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 250;
const nodeHeight = 80;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const newNode = {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
    return newNode;
  });

  return { nodes: newNodes, edges };
};

export function ArchitectureFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const { repoName, repos } = useChatStore();

  const activeRepo = repos.find(r => r.name === repoName);

  useEffect(() => {
    async function fetchArchitecture() {
      if (!activeRepo) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        const response = await apiClient.get(`/repos/${activeRepo.id}/architecture`);
        const { nodes: rawNodes, edges: rawEdges } = response.data;

        // Map raw nodes to React Flow format
        const formattedNodes: Node[] = rawNodes.map((n: Record<string, string>) => ({
          id: n.id,
          type: 'custom',
          position: { x: 0, y: 0 },
          data: {
            label: n.label,
            description: n.description,
            icon: n.icon,
            iconBg: n.iconBg
          }
        }));

        // Map raw edges
        const formattedEdges: Edge[] = rawEdges.map((e: Record<string, string>) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          animated: true,
          style: { stroke: '#9ca3af', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af' }
        }));

        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          formattedNodes,
          formattedEdges
        );

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      } catch (error) {
        console.error("Failed to fetch architecture", error);
      } finally {
        setLoading(false);
      }
    }

    fetchArchitecture();
  }, [activeRepo, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  if (loading) {
    return (
      <div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 text-sm">Analyzing repository architecture...</p>
        </div>
      </div>
    );
  }

  if (!nodes.length) {
    return (
      <div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-gray-500 text-sm">No architecture data available for this repository.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#0a0a0a]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        colorMode="dark"
      >
        <Controls className="bg-gray-800 border-gray-700 text-white fill-white" />
        <MiniMap 
          nodeColor={() => {
            return '#374151'; // gray-700
          }}
          maskColor="rgba(0, 0, 0, 0.7)"
          className="bg-gray-900 border border-gray-800 rounded-lg"
        />
        <Background color="#374151" gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}
