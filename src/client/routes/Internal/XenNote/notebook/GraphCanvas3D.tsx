import ForceGraph3D from "react-force-graph-3d";
import type { GraphCanvasProps } from "./graphCanvas";

export default function GraphCanvas3D({ width, height, select, background, edge, graph }: GraphCanvasProps) {
  return (
    <ForceGraph3D
      width={width}
      height={height}
      graphData={graph}
      backgroundColor={background}
      linkColor={() => edge}
      nodeColor={(node) => node.color}
      nodeVal={(node) => (node.kind === "page" ? 5 : 3)}
      nodeLabel={() => ""}
      onNodeClick={(node) => select(node.id)}
      cooldownTicks={140}
    />
  );
}
