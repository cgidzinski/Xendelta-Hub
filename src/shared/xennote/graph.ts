export interface GraphNode {
  id: string;
  kind: "page" | "tag";
  label: string;
  notebook_id: string | null;
  notebook_name: string | null;
  tag?: string;
}
export interface GraphEdge {
  source: string;
  target: string;
  kind: "link" | "tag";
}
export interface NotebookGraph {
  nodes: GraphNode[];
  links: GraphEdge[];
  notebook_name: string | null;
  truncated: boolean;
}
