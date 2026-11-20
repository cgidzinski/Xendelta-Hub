import type { GraphNode, GraphEdge } from "@shared/xennote/graph";

export interface GraphCanvasProps {
  graph: { nodes: Array<GraphNode & { color: string }>; links: GraphEdge[] };
  width: number;
  height: number;
  background: string;
  edge: string;
  select: (id: string) => void;
}
