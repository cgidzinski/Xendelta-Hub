/**
 * Pure Pachinko board geometry - shared by the physics sim (pachinkoPhysics.ts, server-only)
 * and the odds math (pachinkoOdds.ts), and mirrored to the client via the /odds response so
 * it draws the exact same board the simulation ran against. No matter-js import here - keeps
 * this (and anything that only needs the geometry, like pachinkoOdds.ts) trivially
 * unit-testable without a physics engine in the loop.
 */

export const CANVAS_WIDTH = 440;
export const CANVAS_HEIGHT = 560;

export const BOARD_TOP = 40; // y where the pin field starts
export const BOARD_BOTTOM = 460; // y where the pin field ends and the pocket dividers begin
export const POCKET_FLOOR_Y = 490; // y a ball has "landed" at - the sim stops once it crosses this. Kept close to
// BOARD_BOTTOM on purpose: the pocket dividers already constrain the ball laterally once it's below the pin
// field, so a wide gap here would just be empty space for residual momentum to keep carrying it sideways before
// the sim stops watching, skewing outcomes toward whichever pocket a ball's *exit velocity* favors rather than
// its actual landing lane.

export const PIN_ROWS = 14;
export const PIN_COLS = 9; // pins on a full (even) row; odd rows are offset by half spacing with one fewer pin
export const PIN_RADIUS = 4;
export const BALL_RADIUS = 7;

export const WALL_THICKNESS = 10; // side walls and pocket dividers
export const LAUNCH_Y = BOARD_TOP - 20; // ball spawn height, just above the pin field

export type PocketType = "miss" | "small" | "start" | "jackpot";

export interface PocketConfig {
    index: number;
    xStart: number;
    xEnd: number;
    type: PocketType;
    multiplier?: number; // fixed-multiplier pockets ("small", "jackpot"); "start" pays the jackpot pool instead, "miss" pays nothing
}

// 11 pockets, left to right. Mirrors real pachinko: the field is mostly "miss" gutters, with
// rare scoring pockets - a jackpot pocket at each extreme edge (hardest for a ball to reach
// off a center launch), symmetric small-win pockets, and one center "start" (tulip) pocket
// that feeds the progressive jackpot pool rather than paying a fixed amount itself. See
// pachinko.ts's file header for the probability/RTP derivation.
export const POCKETS: PocketConfig[] = buildPockets();

function buildPockets(): PocketConfig[] {
    const types: { type: PocketType; multiplier?: number }[] = [
        { type: "jackpot", multiplier: 25 },
        { type: "miss" },
        { type: "miss" },
        { type: "small", multiplier: 1.5 },
        { type: "miss" },
        { type: "start" },
        { type: "miss" },
        { type: "small", multiplier: 1.5 },
        { type: "miss" },
        { type: "miss" },
        { type: "jackpot", multiplier: 25 },
    ];
    const width = CANVAS_WIDTH / types.length;
    return types.map((t, index) => ({
        index,
        xStart: index * width,
        xEnd: (index + 1) * width,
        type: t.type,
        multiplier: t.multiplier,
    }));
}

export function pocketCenterX(pocket: PocketConfig): number {
    return (pocket.xStart + pocket.xEnd) / 2;
}

export function pocketAt(x: number): PocketConfig {
    const clamped = Math.min(Math.max(x, 0), CANVAS_WIDTH - 0.001);
    return POCKETS.find((p) => clamped >= p.xStart && clamped < p.xEnd) ?? POCKETS[clamped < CANVAS_WIDTH / 2 ? 0 : POCKETS.length - 1];
}

export interface PinPosition {
    x: number;
    y: number;
}

// A staggered grid (like a real pachinko field's dense, offset pin rows - not a binary
// Galton triangle), deterministic so the physics sim and any debug rendering agree without
// shipping pin coordinates over the wire on every request - the client already knows this
// layout (it's a fixed constant, not per-round state).
export function generatePins(): PinPosition[] {
    const pins: PinPosition[] = [];
    const rowSpacing = (BOARD_BOTTOM - BOARD_TOP) / (PIN_ROWS - 1);
    const colSpacing = CANVAS_WIDTH / (PIN_COLS + 1);
    for (let row = 0; row < PIN_ROWS; row++) {
        const y = BOARD_TOP + row * rowSpacing;
        const offsetRow = row % 2 === 1;
        const cols = offsetRow ? PIN_COLS - 1 : PIN_COLS;
        const offset = offsetRow ? colSpacing / 2 : 0;
        for (let col = 0; col < cols; col++) {
            const x = colSpacing + col * colSpacing + offset;
            if (x > WALL_THICKNESS + PIN_RADIUS && x < CANVAS_WIDTH - WALL_THICKNESS - PIN_RADIUS) {
                pins.push({ x, y });
            }
        }
    }
    return pins;
}
