import ForceGraph2D from "react-force-graph-2d";
import type { GraphCanvasProps } from "./graphCanvas";

export default function GraphCanvas2D({ width, height, select, background, edge, graph }: GraphCanvasProps) {
  return (
    <ForceGraph2D
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
