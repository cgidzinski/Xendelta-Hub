import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Box, Typography, Avatar, IconButton, ToggleButtonGroup, ToggleButton, Divider, SwipeableDrawer } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EastIcon from "@mui/icons-material/East";
import type { GroupDetailContext } from "./GroupDetail";
import type { DirectDebt } from "../../../hooks/xensplit/types";
import { formatCurrency } from "../../../utils/currencyUtils";
import { computeDirectDebts, computeBalanceBreakdown, currenciesInGroup } from "../../../utils/xensplitExplain";
import DebtWebChart, { type DebtEdge } from "./components/DebtWebChart";

type Mode = "simplified" | "direct";

export default function GroupExplain() {
    const { group, balancesData, user } = useOutletContext<GroupDetailContext>();

    const currencies = useMemo(() => currenciesInGroup(group), [group]);
    const [currency, setCurrency] = useState(() => currencies[0]);
    const [mode, setMode] = useState<Mode>("simplified");
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdge, setSelectedEdge] = useState<DebtEdge | null>(null);
    const [fitNonce, setFitNonce] = useState(0);
    const refit = () => setFitNonce((n) => n + 1);

    const getMember = (userId: string) => group.members.find((m) => m.user_id === userId);

    const directDebts = useMemo<DirectDebt[]>(() => computeDirectDebts(group, currency), [group, currency]);

    const simplifiedEdges = useMemo<DebtEdge[]>(
        () =>
            (balancesData?.settlements ?? [])
                .filter((s) => s.currency === currency)
                .map((s) => ({ from: s.from, to: s.to, amount: s.amount })),
        [balancesData, currency],
    );

    const edges: DebtEdge[] = mode === "simplified" ? simplifiedEdges : directDebts.map((d) => ({ from: d.from, to: d.to, amount: d.amount }));

    const handleNodeClick = (id: string) => {
        setSelectedEdge(null);
        setSelectedNodeId((prev) => (prev === id ? null : id));
    };
    const handleEdgeClick = (edge: DebtEdge) => {
        setSelectedNodeId(null);
        setSelectedEdge(edge);
    };
    const closeDetail = () => {
        setSelectedNodeId(null);
        setSelectedEdge(null);
    };

    const cycleCurrency = (dir: 1 | -1) => {
        const idx = currencies.indexOf(currency);
        const next = currencies[(idx + dir + currencies.length) % currencies.length];
        setCurrency(next);
        setSelectedNodeId(null);
        setSelectedEdge(null);
        refit();
    };

    const hasData = group.members.length > 0 && (simplifiedEdges.length > 0 || directDebts.length > 0);

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* Header + currency switcher */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, minHeight: 40, flexShrink: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Debt Web</Typography>
                {currencies.length > 1 && (
                    <Box sx={{ display: "flex", alignItems: "center" }}>
                        <IconButton size="small" onClick={() => cycleCurrency(-1)}>
                            <ChevronLeftIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 36, textAlign: "center" }}>{currency}</Typography>
                        <IconButton size="small" onClick={() => cycleCurrency(1)}>
                            <ChevronRightIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Box>
                )}
            </Box>

            {/* Mode toggle */}
            <Box sx={{ display: "flex", justifyContent: "center", mb: 2, flexShrink: 0 }}>
                <ToggleButtonGroup size="small" value={mode} exclusive onChange={(_, v) => { if (v) { setMode(v); refit(); } }}>
                    <ToggleButton value="simplified" sx={{ px: 2, fontSize: "0.75rem", textTransform: "none" }}>Simplified</ToggleButton>
                    <ToggleButton value="direct" sx={{ px: 2, fontSize: "0.75rem", textTransform: "none" }}>Direct</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {!hasData ? (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography variant="body1" color="text.secondary">Nothing to show — everyone's settled up</Typography>
                </Box>
            ) : (
                <>
                    <Box sx={{ flex: 1, minHeight: 0 }}>
                        <DebtWebChart
                            members={group.members}
                            edges={edges}
                            currency={currency}
                            currentUserId={user.id}
                            selectedNodeId={selectedNodeId}
                            onNodeClick={handleNodeClick}
                            onEdgeClick={handleEdgeClick}
                            fitNonce={fitNonce}
                        />
                    </Box>

                    {/* Legend */}
                    <Box sx={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap", mt: 1.5, mb: 1, flexShrink: 0 }}>
                        <LegendDot color="error.main" label="You owe" />
                        <LegendDot color="success.main" label="Owed to you" />
                        <LegendDot color="text.disabled" label="Between others" />
                    </Box>

                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mb: 1, flexShrink: 0 }}>
                        {mode === "simplified"
                            ? `${directDebts.length} direct debt${directDebts.length === 1 ? "" : "s"} meshed into ${simplifiedEdges.length} payment${simplifiedEdges.length === 1 ? "" : "s"} to minimize transfers.`
                            : "Raw debts from shared expenses, before simplification."}
                    </Typography>
                </>
            )}

            {/* Detail bottom sheet — swipe down or tap the handle/backdrop to close. */}
            <SwipeableDrawer
                anchor="bottom"
                open={!!selectedNodeId || !!selectedEdge}
                onClose={closeDetail}
                onOpen={() => {}}
                disableSwipeToOpen
                PaperProps={{
                    sx: { borderRadius: "16px 16px 0 0", maxWidth: 560, mx: "auto", maxHeight: "85vh", px: 2, pb: 3, display: "flex", flexDirection: "column" },
                }}
            >
                {/* Tap the handle to close — reachable even when the list is long. */}
                <Box
                    onClick={closeDetail}
                    role="button"
                    aria-label="Close"
                    sx={{ display: "flex", justifyContent: "center", py: 1.25, cursor: "pointer", flexShrink: 0 }}
                >
                    <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: "text.disabled" }} />
                </Box>
                <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                    {selectedNodeId ? (
                        <NodeDetail
                            userId={selectedNodeId}
                            member={getMember(selectedNodeId)}
                            group={group}
                            currency={currency}
                            netBalance={balancesData?.balances[selectedNodeId]?.balances[currency] ?? 0}
                        />
                    ) : selectedEdge ? (
                        <EdgeDetail
                            edge={selectedEdge}
                            mode={mode}
                            group={group}
                            currency={currency}
                            getMember={getMember}
                            netFrom={balancesData?.balances[selectedEdge.from]?.balances[currency] ?? 0}
                            netTo={balancesData?.balances[selectedEdge.to]?.balances[currency] ?? 0}
                        />
                    ) : null}
                </Box>
            </SwipeableDrawer>
        </Box>
    );
}

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color }} />
            <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Box>
    );
}

function PersonRow({ avatar, name, sub }: { avatar?: string | null; name: string; sub?: string }) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
            <Avatar src={avatar || undefined} sx={{ width: 36, height: 36 }}>{name[0]?.toUpperCase()}</Avatar>
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, textTransform: "capitalize" }} noWrap>{name}</Typography>
                {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
            </Box>
        </Box>
    );
}

function NodeDetail({
    userId,
    member,
    group,
    currency,
    netBalance,
}: {
    userId: string;
    member: { username: string; avatar: string | null } | undefined;
    group: GroupDetailContext["group"];
    currency: string;
    netBalance: number;
}) {
    const lines = useMemo(() => computeBalanceBreakdown(group, userId, currency), [group, userId, currency]);
    const netColor = Math.abs(netBalance) < 0.01 ? "text.disabled" : netBalance > 0 ? "success.main" : "error.main";
    const netLabel = Math.abs(netBalance) < 0.01 ? "Settled up" : netBalance > 0 ? "Owed to them overall" : "They owe overall";

    return (
        <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5, gap: 1 }}>
                <PersonRow avatar={member?.avatar} name={member?.username ?? "?"} sub={netLabel} />
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: netColor, whiteSpace: "nowrap" }}>
                    {formatCurrency(Math.abs(netBalance), currency)}
                </Typography>
            </Box>
            <Divider sx={{ mb: 1 }} />
            {lines.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No activity in {currency}.</Typography>
            ) : (
                <>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {lines.map((l, i) => (
                            <Box key={i} sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{l.label}</Typography>
                                    {l.hint && (
                                        <Typography variant="caption" color="text.disabled" sx={{ display: "block", lineHeight: 1.25 }}>{l.hint}</Typography>
                                    )}
                                </Box>
                                <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap", color: l.amount >= 0 ? "success.main" : "error.main" }}>
                                    {l.amount >= 0 ? "+" : "-"}{formatCurrency(Math.abs(l.amount), currency)}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                </>
            )}
        </Box>
    );
}

function EdgeDetail({
    edge,
    mode,
    group,
    currency,
    getMember,
    netFrom,
    netTo,
}: {
    edge: DebtEdge;
    mode: Mode;
    group: GroupDetailContext["group"];
    currency: string;
    getMember: (userId: string) => { username: string; avatar: string | null } | undefined;
    netFrom: number;
    netTo: number;
}) {
    const from = getMember(edge.from);
    const to = getMember(edge.to);

    // Expenses directly connecting the two parties (one paid, the other shared).
    const sharedExpenses = useMemo(
        () =>
            group.expenses.filter(
                (e) =>
                    !e.on_hold &&
                    e.currency === currency &&
                    ((e.paid_by === edge.from && e.splits.some((s) => s.user_id === edge.to)) ||
                        (e.paid_by === edge.to && e.splits.some((s) => s.user_id === edge.from))),
            ),
        [group.expenses, currency, edge.from, edge.to],
    );

    return (
        <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, mb: 1.5 }}>
                <PersonRow avatar={from?.avatar} name={from?.username ?? "?"} />
                <Box sx={{ textAlign: "center", flexShrink: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{formatCurrency(edge.amount, currency)}</Typography>
                    <EastIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                </Box>
                <PersonRow avatar={to?.avatar} name={to?.username ?? "?"} />
            </Box>
            <Divider sx={{ mb: 1.5 }} />

            {mode === "simplified" ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        {sharedExpenses.length === 0 ? (
                            <>
                                This is a simplified payment. To keep settling-up simple, <strong style={{ textTransform: "capitalize" }}>{from?.username}</strong>'s
                                debt is routed straight to <strong style={{ textTransform: "capitalize" }}>{to?.username}</strong> — even if they never shared an expense directly.
                            </>
                        ) : (
                            <>
                                This payment is backed by an expense <strong style={{ textTransform: "capitalize" }}>{from?.username}</strong> and{" "}
                                <strong style={{ textTransform: "capitalize" }}>{to?.username}</strong> shared directly.
                            </>
                        )}
                    </Typography>
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "capitalize" }}>{from?.username} owes overall</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: "error.main" }}>{formatCurrency(Math.abs(netFrom), currency)}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "capitalize" }}>{to?.username} is owed overall</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: "success.main" }}>{formatCurrency(Math.abs(netTo), currency)}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.disabled">Switch to "Direct" to see the raw debts behind this.</Typography>
                </Box>
            ) : sharedExpenses.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    This nets out from settlements between the two — no outstanding shared expenses in {currency}.
                </Typography>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                    <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        From shared expenses
                    </Typography>
                    {sharedExpenses.map((e) => {
                        const split = e.splits.find((s) => s.user_id === (e.paid_by === edge.from ? edge.to : edge.from));
                        const share = split?.amount_owed !== undefined
                            ? split.amount_owed
                            : split?.percentage !== undefined
                                ? (e.amount * split.percentage) / 100
                                : e.amount / e.splits.length;
                        const payer = getMember(e.paid_by);
                        return (
                            <Box key={e._id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                                <Typography variant="body2" color="text.secondary" noWrap>
                                    {e.title} <Box component="span" sx={{ color: "text.disabled" }}>· {payer?.username} paid</Box>
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatCurrency(share, currency)}</Typography>
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
}
