import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box, IconButton, useTheme } from "@mui/material";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import {
    forceSimulation,
    forceManyBody,
    forceLink,
    forceCenter,
    forceCollide,
    forceX,
    forceY,
    type Simulation,
    type SimulationNodeDatum,
} from "d3-force";
import type { XenSplitMember } from "../../../../hooks/xensplit/types";
import { formatCurrency } from "../../../../utils/currencyUtils";

export interface DebtEdge {
    from: string;
    to: string;
    amount: number;
}

interface SimNode extends SimulationNodeDatum {
    id: string;
    member: XenSplitMember;
}

interface SimLink {
    source: string | SimNode;
    target: string | SimNode;
    from: string;
    to: string;
    amount: number;
}

interface View {
    x: number;
    y: number;
    k: number;
}

interface Props {
    members: XenSplitMember[];
    edges: DebtEdge[];
    currency: string;
    currentUserId: string;
    selectedNodeId: string | null;
    onNodeClick: (userId: string) => void;
    onEdgeClick: (edge: DebtEdge) => void;
    minHeight?: number;
    fitNonce?: number; // bump to re-fit the view (e.g. after a mode switch)
}

const NODE_R = 22;
const CLICK_THRESHOLD = 8; // px of movement below which a press counts as a tap/click

export default function DebtWebChart({
    members,
    edges,
    currency,
    currentUserId,
    selectedNodeId,
    onNodeClick,
    onEdgeClick,
    minHeight = 320,
    fitNonce,
}: Props) {
    const theme = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    // The chart fills its parent; we measure both dimensions.
    const [size, setSize] = useState({ w: 0, h: 0 });
    const sizeRef = useRef({ w: 0, h: 0 });

    // Live simulation data, mutated in place by d3; render reads from these refs
    // and re-renders on each tick via the `tick` counter.
    const nodesRef = useRef<SimNode[]>([]);
    const linksRef = useRef<SimLink[]>([]);
    const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
    const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
    const [, setTick] = useState(0);

    // Pan / zoom. viewRef mirrors state so pointer handlers read fresh values.
    const [view, setViewState] = useState<View>({ x: 0, y: 0, k: 1 });
    const viewRef = useRef(view);
    const setView = useCallback((updater: (v: View) => View) => {
        setViewState((prev) => {
            const next = updater(prev);
            viewRef.current = next;
            return next;
        });
    }, []);

    // Track container size so the svg + force layout fill the available space.
    useLayoutEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        const apply = (w: number, h: number) => {
            if (sizeRef.current.w === w && sizeRef.current.h === h) return;
            sizeRef.current = { w, h };
            setSize({ w, h });
        };
        apply(el.clientWidth, el.clientHeight);
        const ro = new ResizeObserver((entries) => {
            for (const e of entries) apply(e.contentRect.width, e.contentRect.height);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const edgeColor = useMemo(
        () => (e: DebtEdge) =>
            e.from === currentUserId
                ? theme.palette.error.main
                : e.to === currentUserId
                    ? theme.palette.success.main
                    : theme.palette.text.disabled,
        [currentUserId, theme],
    );

    // Frame all nodes within the viewport with padding (pan + zoom to fit).
    const fitView = useCallback(() => {
        const ns = nodesRef.current.filter((n) => n.x != null && n.y != null);
        const { w, h } = sizeRef.current;
        if (ns.length === 0 || w === 0 || h === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of ns) {
            minX = Math.min(minX, n.x!);
            maxX = Math.max(maxX, n.x!);
            minY = Math.min(minY, n.y!);
            maxY = Math.max(maxY, n.y!);
        }
        const pad = NODE_R + 28;
        const contentW = maxX - minX + pad * 2;
        const contentH = maxY - minY + pad * 2;
        const k = Math.max(0.25, Math.min(w / contentW, h / contentH, 1.4));
        const gx = (minX + maxX) / 2;
        const gy = (minY + maxY) / 2;
        setView(() => ({ k, x: w / 2 - gx * k, y: h / 2 - gy * k }));
    }, [setView]);

    // (Re)build and run the simulation when the graph or size changes. Previous
    // node positions are preserved by id so toggling modes doesn't jump around.
    useEffect(() => {
        const { w: width, h: height } = size;
        if (width === 0 || height === 0) return;

        const nodes: SimNode[] = members.map((m) => {
            const prev = positionsRef.current.get(m.user_id);
            return {
                id: m.user_id,
                member: m,
                x: prev?.x ?? width / 2 + (Math.random() - 0.5) * 80,
                y: prev?.y ?? height / 2 + (Math.random() - 0.5) * 80,
            };
        });
        const nodeById = new Map(nodes.map((n) => [n.id, n]));
        const links: SimLink[] = edges
            .filter((e) => nodeById.has(e.from) && nodeById.has(e.to))
            .map((e) => ({ source: e.from, target: e.to, from: e.from, to: e.to, amount: e.amount }));

        nodesRef.current = nodes;
        linksRef.current = links;

        const sim = forceSimulation<SimNode, SimLink>(nodes)
            .force("charge", forceManyBody().strength(-650).distanceMax(420))
            .force(
                "link",
                forceLink<SimNode, SimLink>(links)
                    .id((d) => d.id)
                    .distance(140)
                    .strength(0.35),
            )
            .force("center", forceCenter(width / 2, height / 2))
            // Gently pull every node toward center so isolated people (no debts)
            // don't drift off — the link force only reins in connected nodes.
            .force("x", forceX(width / 2).strength(0.08))
            .force("y", forceY(height / 2).strength(0.08))
            .force("collide", forceCollide(NODE_R + 30))
            .on("tick", () => {
                for (const n of nodes) {
                    if (n.x != null && n.y != null) positionsRef.current.set(n.id, { x: n.x, y: n.y });
                }
                setTick((t) => t + 1);
            });

        // Pre-settle the layout synchronously (no paint), then halt the auto-run
        // timer. This avoids the fly-in animation and lets us frame the graph from
        // its final positions immediately — a deterministic auto-fit with no timer.
        // Dragging later calls alphaTarget().restart() to reheat for interaction.
        sim.tick(300);
        sim.stop();
        for (const n of nodes) {
            if (n.x != null && n.y != null) positionsRef.current.set(n.id, { x: n.x, y: n.y });
        }
        simRef.current = sim;
        setTick((t) => t + 1);
        fitView();

        return () => {
            sim.stop();
        };
    }, [members, edges, size, fitView]);

    // Re-fit on demand (e.g. when the parent switches Simplified/Direct). rAF so
    // it runs after the rebuilt simulation has placed the current nodes.
    useEffect(() => {
        if (fitNonce === undefined) return;
        const id = requestAnimationFrame(() => fitView());
        return () => cancelAnimationFrame(id);
    }, [fitNonce, fitView]);

    // Convert a pointer's client position into graph (pre-transform) coordinates.
    const clientToGraph = useCallback((clientX: number, clientY: number) => {
        const rect = svgRef.current?.getBoundingClientRect();
        const v = viewRef.current;
        const sx = clientX - (rect?.left ?? 0);
        const sy = clientY - (rect?.top ?? 0);
        return { x: (sx - v.x) / v.k, y: (sy - v.y) / v.k };
    }, []);

    // Interaction state: dragging a node, panning, or pinch-zooming.
    const dragId = useRef<string | null>(null);
    const downClient = useRef<{ x: number; y: number } | null>(null);
    const moved = useRef(false);
    const panLast = useRef<{ x: number; y: number } | null>(null);
    // All active pointers (by id) so we can detect a two-finger pinch.
    const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
    const pinchDist = useRef<number | null>(null);

    const twoPointers = () => {
        const pts = [...pointers.current.values()];
        return { a: pts[0], b: pts[1] };
    };
    const isPinching = () => pointers.current.size >= 2 && pinchDist.current != null;

    // Capture-phase: records every pointer (even ones starting on a node/edge) so
    // a pinch is detected wherever the two fingers land.
    const onPointerDownCapture = (evt: React.PointerEvent) => {
        pointers.current.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
        if (pointers.current.size >= 2) {
            // Entering a pinch — cancel any in-progress node drag / pan and capture
            // both pointers so we keep getting their moves.
            if (dragId.current) {
                const node = nodesRef.current.find((n) => n.id === dragId.current);
                if (node) { node.fx = null; node.fy = null; }
                simRef.current?.alphaTarget(0);
                dragId.current = null;
                moved.current = false;
            }
            panLast.current = null;
            for (const pid of pointers.current.keys()) {
                try { svgRef.current?.setPointerCapture(pid); } catch { /* ignore */ }
            }
            const { a, b } = twoPointers();
            pinchDist.current = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
        }
    };

    const onNodePointerDown = (id: string) => (evt: React.PointerEvent) => {
        evt.stopPropagation();
        if (pointers.current.size >= 2) return; // pinch in progress
        // Don't capture or start a drag yet — wait until the finger actually
        // moves. A press that never moves is treated as a tap (selection), which
        // is essential for touch where a tap always jitters a few pixels.
        dragId.current = id;
        downClient.current = { x: evt.clientX, y: evt.clientY };
        moved.current = false;
    };

    const onBackgroundPointerDown = (evt: React.PointerEvent) => {
        if (pointers.current.size >= 2) return; // pinch in progress
        // No pointer capture here: capturing on the svg would steal the `click`
        // event from edges. Node dragging captures separately once it moves.
        panLast.current = { x: evt.clientX, y: evt.clientY };
    };

    const onPointerMove = (evt: React.PointerEvent) => {
        if (pointers.current.has(evt.pointerId)) {
            pointers.current.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
        }

        if (isPinching()) {
            const { a, b } = twoPointers();
            if (!a || !b || pinchDist.current == null) return;
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist <= 0) return;
            const rect = svgRef.current?.getBoundingClientRect();
            const mx = (a.x + b.x) / 2 - (rect?.left ?? 0);
            const my = (a.y + b.y) / 2 - (rect?.top ?? 0);
            const factor = dist / pinchDist.current;
            pinchDist.current = dist;
            setView((v) => {
                const k = Math.min(3, Math.max(0.3, v.k * factor));
                const gx = (mx - v.x) / v.k;
                const gy = (my - v.y) / v.k;
                return { k, x: mx - gx * k, y: my - gy * k };
            });
            return;
        }

        if (dragId.current) {
            // Promote to an actual drag only once the finger crosses the threshold.
            if (!moved.current) {
                const start = downClient.current;
                if (!start) return;
                if (Math.hypot(evt.clientX - start.x, evt.clientY - start.y) <= CLICK_THRESHOLD) return;
                moved.current = true;
                svgRef.current?.setPointerCapture(evt.pointerId);
                simRef.current?.alphaTarget(0.3).restart();
            }
            const node = nodesRef.current.find((n) => n.id === dragId.current);
            if (node) {
                const p = clientToGraph(evt.clientX, evt.clientY);
                node.fx = p.x;
                node.fy = p.y;
            }
        } else if (panLast.current) {
            const dx = evt.clientX - panLast.current.x;
            const dy = evt.clientY - panLast.current.y;
            panLast.current = { x: evt.clientX, y: evt.clientY };
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }
    };

    const onPointerUp = (evt: React.PointerEvent) => {
        pointers.current.delete(evt.pointerId);
        if (pointers.current.size < 2) {
            pinchDist.current = null;
            // If one finger remains, continue panning from it without a jump.
            const remaining = [...pointers.current.values()][0];
            panLast.current = remaining ? { x: remaining.x, y: remaining.y } : null;
        }
        if (dragId.current && moved.current) {
            // End of a drag: release the pinned node back to the simulation.
            const node = nodesRef.current.find((n) => n.id === dragId.current);
            if (node) {
                node.fx = null;
                node.fy = null;
            }
            simRef.current?.alphaTarget(0);
        }
        // A tap (no movement) selects via the node's onClick handler instead of
        // here — opening on pointerup lets the trailing compat-click hit the
        // drawer backdrop and immediately close it (flicker).
        dragId.current = null;
        downClient.current = null;
    };

    // Wheel zoom, anchored at the cursor. Native listener so we can preventDefault.
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = svg.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            setView((v) => {
                const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
                const k = Math.min(3, Math.max(0.4, v.k * factor));
                const gx = (mx - v.x) / v.k;
                const gy = (my - v.y) / v.k;
                return { k, x: mx - gx * k, y: my - gy * k };
            });
        };
        svg.addEventListener("wheel", onWheel, { passive: false });
        return () => svg.removeEventListener("wheel", onWheel);
    }, [setView]);

    const nodes = nodesRef.current;
    const links = linksRef.current;

    // Color markers for arrowheads (one per distinct edge color).
    const markerColors = useMemo(() => {
        const set = new Set(edges.map((e) => edgeColor(e)));
        return [...set];
    }, [edges, edgeColor]);
    const markerId = (color: string) => `arrow-${color.replace(/[^a-z0-9]/gi, "")}`;

    return (
        <Box ref={containerRef} sx={{ position: "relative", width: "100%", height: "100%", minHeight, bgcolor: "action.hover", borderRadius: 2, overflow: "hidden", userSelect: "none" }}>
            <IconButton
                size="small"
                onClick={fitView}
                aria-label="Fit to view"
                sx={{ position: "absolute", top: 8, right: 8, zIndex: 1, bgcolor: "background.paper", "&:hover": { bgcolor: "background.paper" } }}
            >
                <CenterFocusStrongIcon sx={{ fontSize: 18 }} />
            </IconButton>
            {size.w > 0 && size.h > 0 && (
                <svg
                    ref={svgRef}
                    width={size.w}
                    height={size.h}
                    onPointerDownCapture={onPointerDownCapture}
                    onPointerDown={onBackgroundPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    style={{ display: "block", touchAction: "none", cursor: "grab", userSelect: "none", WebkitUserSelect: "none" }}
                >
                    <defs>
                        {markerColors.map((color) => (
                            <marker
                                key={color}
                                id={markerId(color)}
                                viewBox="0 0 10 10"
                                refX={9}
                                refY={5}
                                markerWidth={7}
                                markerHeight={7}
                                orient="auto-start-reverse"
                            >
                                <path d="M0,0 L10,5 L0,10 z" fill={color} />
                            </marker>
                        ))}
                        {nodes.map((n) =>
                            n.member.avatar ? (
                                <clipPath key={n.id} id={`clip-${n.id}`}>
                                    <circle r={NODE_R} cx={0} cy={0} />
                                </clipPath>
                            ) : null,
                        )}
                    </defs>

                    <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
                        {/* Edges */}
                        {links.map((l, i) => {
                            const s = l.source as SimNode;
                            const t = l.target as SimNode;
                            if (s.x == null || s.y == null || t.x == null || t.y == null) return null;
                            const color = edgeColor({ from: l.from, to: l.to, amount: l.amount });
                            // Shorten the line so the arrowhead lands on the node edge.
                            const dx = t.x - s.x;
                            const dy = t.y - s.y;
                            const dist = Math.hypot(dx, dy) || 1;
                            const ux = dx / dist;
                            const uy = dy / dist;
                            const sx = s.x + ux * NODE_R;
                            const sy = s.y + uy * NODE_R;
                            const tx = t.x - ux * (NODE_R + 8);
                            const ty = t.y - uy * (NODE_R + 8);
                            // Curve perpendicular to the line for a "web" feel.
                            const mx = (sx + tx) / 2 + uy * 18;
                            const my = (sy + ty) / 2 - ux * 18;
                            // Size the badge to the formatted amount so it never clips.
                            const label = formatCurrency(l.amount, currency);
                            const badgeW = Math.max(36, label.length * 6.3 + 12);
                            return (
                                <g
                                    key={i}
                                    style={{ cursor: "pointer" }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={() => onEdgeClick({ from: l.from, to: l.to, amount: l.amount })}
                                >
                                    <path
                                        d={`M${sx},${sy} Q${mx},${my} ${tx},${ty}`}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={2}
                                        markerEnd={`url(#${markerId(color)})`}
                                        opacity={0.85}
                                    />
                                    {/* Wider invisible hit area */}
                                    <path d={`M${sx},${sy} Q${mx},${my} ${tx},${ty}`} fill="none" stroke="transparent" strokeWidth={14} />
                                    <rect
                                        x={mx - badgeW / 2}
                                        y={my - 9}
                                        width={badgeW}
                                        height={18}
                                        rx={9}
                                        fill={theme.palette.background.paper}
                                        opacity={0.9}
                                    />
                                    <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill={color}>
                                        {label}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Nodes */}
                        {nodes.map((n) => {
                            if (n.x == null || n.y == null) return null;
                            const selected = n.id === selectedNodeId;
                            const isMe = n.id === currentUserId;
                            return (
                                <g
                                    key={n.id}
                                    transform={`translate(${n.x},${n.y})`}
                                    style={{ cursor: "pointer" }}
                                    onPointerDown={onNodePointerDown(n.id)}
                                    onClick={() => { if (!moved.current) onNodeClick(n.id); }}
                                >
                                    <circle
                                        r={NODE_R + 3}
                                        fill="none"
                                        stroke={selected ? theme.palette.primary.main : isMe ? theme.palette.primary.light : "transparent"}
                                        strokeWidth={selected ? 3 : 2}
                                    />
                                    {n.member.avatar ? (
                                        <image
                                            href={n.member.avatar}
                                            x={-NODE_R}
                                            y={-NODE_R}
                                            width={NODE_R * 2}
                                            height={NODE_R * 2}
                                            clipPath={`url(#clip-${n.id})`}
                                            preserveAspectRatio="xMidYMid slice"
                                        />
                                    ) : (
                                        <>
                                            <circle r={NODE_R} fill={theme.palette.primary.dark} />
                                            <text textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={700} fill="#fff">
                                                {n.member.username[0]?.toUpperCase()}
                                            </text>
                                        </>
                                    )}
                                    <text
                                        y={NODE_R + 14}
                                        textAnchor="middle"
                                        fontSize={11}
                                        fontWeight={600}
                                        fill={theme.palette.text.secondary}
                                        style={{ textTransform: "capitalize", pointerEvents: "none" }}
                                    >
                                        {n.member.username}
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                </svg>
            )}
        </Box>
    );
}
