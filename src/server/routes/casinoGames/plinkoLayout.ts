/**
 * Pure Plinko board geometry - shared by the physics sim (plinkoPhysics.ts, server-only)
 * and mirrored to the client via the /odds response so it draws the exact same board the
 * simulation ran against. No matter-js import here - keeps this trivially unit-testable
 * without a physics engine in the loop. Same split as pachinkoLayout.ts/pachinkoPhysics.ts.
 *
 * The peg triangle itself is unchanged from the original coin-flip build (12 rows, 13
 * landing slots) - what changed is how a drop is decided: instead of the server picking an
 * abstract left/right path, the player aims a drop position (`dropX`, captured from a
 * marker that glides back and forth above the board) and a real ball actually falls through
 * the pegs from there.
 */

export interface Point {
    x: number;
    y: number;
}

export const CANVAS_WIDTH = 440;
export const CANVAS_HEIGHT = 460;

export const ROWS = 12;
export const SLOT_COUNT = ROWS + 1;

export const BOARD_TOP = 30;
export const BOARD_BOTTOM = 360;
export const SLOT_FLOOR_Y = 400; // the ball is considered landed once it reaches this depth
export const DROP_Y = BOARD_TOP - 15; // where a dropped ball first appears, just above row 0's peg

export const PEG_RADIUS = 3.5;
export const BALL_RADIUS = 8;

const PEG_SPACING = CANVAS_WIDTH / (ROWS + 2);
const ROW_HEIGHT = (BOARD_BOTTOM - BOARD_TOP) / ROWS;
const CENTER_X = CANVAS_WIDTH / 2;

// A ball's horizontal position after `bounces` rows, `rights` of which went right, expressed
// in half-peg-spacing units relative to center - the same Galton-board offset formula the
// original coin-flip build used for its (then purely cosmetic) path replay. Still exactly
// right here: it's what places both the pegs themselves and the slot centers/boundaries they
// funnel into, real physics or not.
export function xFor(rights: number, bounces: number): number {
    return CENTER_X + (2 * rights - bounces) * (PEG_SPACING / 2);
}

// Row i (0-indexed) has i+1 pegs, matching every reachable offset at that depth.
export function generatePegPositions(): Point[] {
    const pegs: Point[] = [];
    for (let row = 0; row < ROWS; row++) {
        const y = BOARD_TOP + row * ROW_HEIGHT;
        for (let j = 0; j <= row; j++) {
            pegs.push({ x: xFor(j, row), y });
        }
    }
    return pegs;
}

export function slotCenterX(slot: number): number {
    return xFor(slot, ROWS);
}

// SLOT_COUNT+1 boundary lines (including the two outer walls) carving the bottom of the
// board into SLOT_COUNT pockets, one per landing slot - the halfway point between each pair
// of adjacent slot centers, extended half a slot further out on each end.
export function slotBoundaries(): number[] {
    const boundaries: number[] = [];
    for (let i = 0; i <= SLOT_COUNT; i++) {
        boundaries.push(xFor(i - 0.5, ROWS));
    }
    return boundaries;
}

export function slotForX(x: number): number {
    const boundaries = slotBoundaries();
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
        if (x < boundaries[slot + 1]) {
            return slot;
        }
    }
    return SLOT_COUNT - 1;
}

// The drop marker's roaming range, and thus the range `dropX` must fall in - one peg-spacing
// of margin in from each wall so a ball dropped at either extreme still has wall clearance.
export const DROP_MIN_X = PEG_SPACING;
export const DROP_MAX_X = CANVAS_WIDTH - PEG_SPACING;

// Straight vertical walls right at the slot span's own outer edge (not tapered in from a
// single apex point at the top - that funnel shape put the walls close enough to the drop
// marker's spawn height that most of the drop range spawned already pressed against one of
// them, sledding straight to an edge slot instead of ever reaching the peg field). Sitting
// at the slot boundaries means a ball deflected past the last peg in a row only has a short
// gap before it bounces back off a wall, rather than open space to escape into and coast the
// rest of the way to an edge slot untouched.
const outerBoundaries = slotBoundaries();
export const BOUNDARY_LEFT_POINTS: Point[] = [
    { x: outerBoundaries[0], y: BOARD_TOP - 20 },
    { x: outerBoundaries[0], y: SLOT_FLOOR_Y },
];
export const BOUNDARY_RIGHT_POINTS: Point[] = [
    { x: outerBoundaries[SLOT_COUNT], y: BOARD_TOP - 20 },
    { x: outerBoundaries[SLOT_COUNT], y: SLOT_FLOOR_Y },
];

// Index = landing slot (0..12). Symmetric - rare edges pay big, the crowded middle mostly
// breaks even or less. Carried over unchanged from the coin-flip build, but no longer a
// value solved for an exact RTP target: real physics plus a player-aimed drop position means
// there's no closed-form probability model to solve against anymore. Rough starting values,
// same "playable first, tune later" call made for Pachinko's payouts.
export const MULTIPLIERS = [18.6, 2, 1.5, 1.3, 1.0, 1, 0.5, 1, 1.0, 1.3, 1.5, 2, 18.6];
