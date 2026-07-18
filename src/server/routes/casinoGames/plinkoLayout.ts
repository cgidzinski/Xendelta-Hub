/**
 * Pure Plinko board geometry - shared by the physics sim (plinkoPhysics.ts, server-only)
 * and mirrored to the client via the /odds response so it draws the exact same board the
 * simulation ran against. No matter-js import here - keeps this trivially unit-testable
 * without a physics engine in the loop. Same split as pachinkoLayout.ts/pachinkoPhysics.ts.
 *
 * What changed from the original coin-flip build is how a drop is decided: instead of the
 * server picking an abstract left/right path, the player aims a drop position (`dropX`,
 * captured from a marker that glides back and forth above the board) and a real ball actually
 * falls through the pegs from there.
 *
 * The peg field itself is a rectangular (quincunx) grid, not a triangular pyramid - a triangle
 * only has pegs out near the walls on its bottom-most rows, so a ball dropped at either extreme
 * of the drop range fell through open space along the wall for most of the board's height and
 * landed in the edge slot every time (no peg field to deflect it off the wall until it was
 * already almost at the floor). A rectangular grid puts pegs at every column of x across every
 * row - including right where the marker can spawn - so an edge drop still has to run the same
 * gauntlet a center drop does. The outer walls then zigzag to sit tangent to each row's actual
 * outer peg (see the comment above outerWallPoints) so there's no gap next to the wall either -
 * narrow enough to trap the ball, wide enough to let it slip past untouched.
 */

export interface Point {
    x: number;
    y: number;
}

export const CANVAS_WIDTH = 440;
export const CANVAS_HEIGHT = 460;

export const ROWS = 12;
export const SLOT_COUNT = ROWS + 1;

const BASE_BOARD_TOP = 30;
const BASE_BOARD_BOTTOM = 360;
const BASE_SLOT_FLOOR_Y = 400;

const ROW_HEIGHT = (BASE_BOARD_BOTTOM - BASE_BOARD_TOP) / ROWS;

// The whole peg field (and everything below it) is shifted down by one row-height, reusing
// the canvas's existing bottom slack (SLOT_FLOOR_Y to CANVAS_HEIGHT was already a 60px margin,
// comfortably more than one row) rather than resizing the canvas. DROP_Y deliberately does NOT
// shift with it - it's what actually gives the ball more room to build real fall speed before
// meeting row 0, rather than everything moving in lockstep and leaving the gap unchanged.
const BOARD_SHIFT = ROW_HEIGHT;

export const BOARD_TOP = BASE_BOARD_TOP + BOARD_SHIFT;
export const BOARD_BOTTOM = BASE_BOARD_BOTTOM + BOARD_SHIFT;
export const SLOT_FLOOR_Y = BASE_SLOT_FLOOR_Y + BOARD_SHIFT; // the ball is considered landed once it reaches this depth
export const DROP_Y = BASE_BOARD_TOP - 15; // where a dropped ball first appears - fixed, not shifted (see BOARD_SHIFT)

export const PEG_RADIUS = 3.5;
export const BALL_RADIUS = 8;

const PEG_SPACING = CANVAS_WIDTH / (ROWS + 2);
const CENTER_X = CANVAS_WIDTH / 2;

// A ball's horizontal position after `bounces` rows, `rights` of which went right, expressed
// in half-peg-spacing units relative to center - the same Galton-board offset formula the
// original coin-flip build used for its (then purely cosmetic) path replay. Still exactly
// right here: it's what places the slot centers/boundaries the board's bottom is carved into,
// real physics or not (the peg field itself no longer uses this - see generatePegPositions).
export function xFor(rights: number, bounces: number): number {
    return CENTER_X + (2 * rights - bounces) * (PEG_SPACING / 2);
}

// A rectangular (quincunx) grid: every row spans the same full width - SLOT_COUNT pegs on
// "full" rows, ROWS pegs on the inset rows between them, offset by half a peg-spacing so each
// row's gaps line up with the row above's pegs. A full row's outer columns land exactly on
// DROP_MIN_X/DROP_MAX_X, which is deliberate at depth (it's what stops an edge drop from
// sliding down an untouched lane) but dangerous at row 0 specifically: a ball spawns just
// above there with barely any fall speed yet, and a peg sitting exactly under the drop point
// let it settle into a near-motionless balance on top of the peg instead of falling - visible
// as the ball freezing right at the start. Starting with an inset row instead means row 0 has
// no peg directly under either DROP_MIN_X or DROP_MAX_X, so an edge-aimed ball free-falls one
// full row before it can meet a peg head-on, arriving with real velocity instead of none.
function colsForRow(row: number): number {
    return row % 2 === 0 ? ROWS : SLOT_COUNT;
}

function rowPegXs(cols: number): number[] {
    const start = CENTER_X - ((cols - 1) * PEG_SPACING) / 2;
    return Array.from({ length: cols }, (_, col) => start + col * PEG_SPACING);
}

export function generatePegPositions(): Point[] {
    const pegs: Point[] = [];
    for (let row = 0; row < ROWS; row++) {
        const y = BOARD_TOP + row * ROW_HEIGHT;
        for (const x of rowPegXs(colsForRow(row))) {
            pegs.push({ x, y });
        }
    }
    return pegs;
}

// The outermost peg's x on a given row, before the +/-PEG_RADIUS nudge that makes a wall
// segment sit tangent to it - shared by generatePegPositions (via rowPegXs) and the wall
// builder below, which needs to know exactly where each row's real outer peg is.
function outerPegOffset(row: number): number {
    return ((colsForRow(row) - 1) * PEG_SPACING) / 2;
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

// The walls used to be a single straight vertical line at the slot span's own outer edge.
// Every full row's outer peg sits at the exact same x, right at that line (see
// generatePegPositions/DROP_MIN_X), so a straight wall there left the same gap next to every
// full row's peg for the entire height of the board - too narrow for the ball to pass through
// but wide enough to nose into, so it could get pinned between the wall and a peg instead of
// bouncing back into the field. Zigzagging the wall to sit tangent to each FULL row's peg
// closes that gap completely - wall and peg touch, so there's no pocket to enter. Inset rows
// are left at the original wide position instead of also being hugged: their pegs sit a half
// peg-spacing further from the wall than a full row's do, which was always a wide enough gap
// to pass through safely (that's the point of the inset - see colsForRow), and hugging them
// too would pull the wall in past DROP_MIN_X/DROP_MAX_X, sealing off part of the drop range.
const outerBoundaries = slotBoundaries();

// Always above DROP_Y (not BOARD_TOP - 20, which no longer tracks the marker's spawn height
// now that BOARD_TOP is shifted down by BOARD_SHIFT) - the wall has to cover the marker's
// whole spawn area regardless of how far row 0 has been pushed down.
const WALL_TOP_Y = DROP_Y - 5;

function outerWallPoints(side: -1 | 1): Point[] {
    const wideX = side === -1 ? outerBoundaries[0] : outerBoundaries[SLOT_COUNT];
    const points: Point[] = [{ x: wideX, y: WALL_TOP_Y }];
    for (let row = 0; row < ROWS; row++) {
        const isFullRow = colsForRow(row) === SLOT_COUNT;
        const x = isFullRow ? CENTER_X + side * (outerPegOffset(row) + PEG_RADIUS) : wideX;
        points.push({ x, y: BOARD_TOP + row * ROW_HEIGHT });
    }
    points.push({ x: wideX, y: SLOT_FLOOR_Y });
    return points;
}

export const BOUNDARY_LEFT_POINTS: Point[] = outerWallPoints(-1);
export const BOUNDARY_RIGHT_POINTS: Point[] = outerWallPoints(1);

// Index = landing slot (0..12). Symmetric. The two extreme edge slots pay 0x - even with the
// rectangular peg field (see generatePegPositions) an edge drop still lands there far more
// reliably than any other slot, so a payout there would still be a near-guaranteed win rather
// than a rare one; everything one slot in from the edge onward is a real (decreasing-toward-
// the-crowded-middle) payout.
//
// There's no closed-form probability model here - dropX is a continuous, player-chosen
// physics input, not a draw from a fixed weighted table (contrast prizeWeights.ts/slots.ts's
// targetRtp, which are simple weighted averages over a discrete outcome table) - so these
// values come from a one-off Monte Carlo analysis instead of a derivation: simulated the real
// simulateDrop() 3000x at each of 25 dropX values spanning the full drop range, tabulated the
// empirical landing distribution per dropX, then scored candidate multiplier shapes against
// that table to find EV(dropX) = Σ_slot P(slot|dropX) * multiplier[slot] for every dropX and
// took the max across all of them - the worst case for the house, i.e. the return a player
// aiming optimally for EV (not just casually dropping center) would actually get long-run.
// The previous placeholder values (carried over unsolved from the coin-flip build) turned out
// to have a 120% worst-case RTP - a real, exploitable house-losing edge, not just an untuned
// number. These are scaled so the worst case (empirically, aiming a little inside the right
// edge) lands on a 95% RTP target instead - PLINKO_WORST_CASE_RTP below is that measured
// figure, not a target restated. Center-aim RTP works out to ~86.4%. Re-run the same style of
// analysis if the board geometry (ROWS, peg layout, gravity, wall shape) changes again - none
// of this is derivable by hand from the geometry alone.
export const MULTIPLIERS = [0, 2.48, 1.24, 0.74, 0.5, 0.31, 0.19, 0.31, 0.5, 0.74, 1.24, 2.48, 0];

// The measured worst-case RTP for the MULTIPLIERS table above (see its comment) - surfaced
// through /odds so the client can show players the real, honest figure instead of nothing.
export const PLINKO_WORST_CASE_RTP = 0.951;
