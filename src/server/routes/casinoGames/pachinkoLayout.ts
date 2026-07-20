/**
 * Pure Pachinko board geometry - shared by the physics sim (pachinkoPhysics.ts, server-only)
 * and mirrored to the client via the /odds response so it draws the exact same board the
 * simulation ran against. No matter-js import here - keeps this trivially unit-testable
 * without a physics engine in the loop.
 *
 * The boundary is a true circle/ellipse hybrid, not the elongated capsule this board started
 * as: the top half is a genuine ellipse (a "slightly stretched egg, just longer than round"),
 * but the bottom half is a true half-circle (same radius as the field's own half-width)
 * instead of continuing the wider ellipse down - a proper rounded-off bottom rim, not a
 * stretched oval floor. Both halves meet exactly at the widest point on either side, where the
 * two formulas agree.
 *
 * The launch rail lives entirely INSIDE that curve now (not below the field, not a separate
 * straight channel bolted onto the outside) - a channel flush against the inside of the glass,
 * running from a launcher slot at the bottom right up to a release point at the top right. Its
 * walls are concentric with the boundary at every point along the run, so a ball leaving the
 * rail is already moving tangent to the glass - a full-power shot can keep riding that same
 * curve on its own momentum instead of bouncing off an angled seam.
 */

export interface Point {
    x: number;
    y: number;
}

export interface BezierSegment {
    p0: Point;
    c1: Point;
    c2: Point;
    p1: Point;
}

export const CANVAS_WIDTH = 460;
export const CANVAS_HEIGHT = 460;

const DEG = Math.PI / 180;

// Field center/radii: 340px wide (unchanged from the original board), top half a genuine
// ellipse (FIELD_RY=190, "just slightly longer than round"), bottom half a true circle of
// radius FIELD_RX. Angle convention throughout this file: 0 = the rightmost point, +90deg =
// straight down (matching canvas y-down), -90deg = straight up.
export const FIELD_CX = 230;
export const FIELD_CY = 230;
export const FIELD_RX = 170;
export const FIELD_RY = 190;

function ellipsePoint(theta: number, rx: number, ry: number): Point {
    return { x: FIELD_CX + rx * Math.cos(theta), y: FIELD_CY + ry * Math.sin(theta) };
}

// True cubic-bezier approximation of an elliptical arc from theta0 to theta1, using the
// standard kappa = 4/3*tan(dTheta/4) construction, split into <=maxStepDeg chunks so the
// approximation stays accurate over a wide sweep. Passing rx=ry draws a circular arc (used for
// the bottom half of the boundary, and for both halves of the rail's inner wall, which needs to
// shrink in x too, not just y - a circle is just an ellipse with equal radii, so this is one
// function either way, not two unrelated hand-fitted curves.
function ellipseArcSegments(theta0: number, theta1: number, rx: number, ry: number, maxStepDeg = 95): BezierSegment[] {
    const totalDeg = ((theta1 - theta0) * 180) / Math.PI;
    const steps = Math.max(1, Math.ceil(Math.abs(totalDeg) / maxStepDeg));
    const segments: BezierSegment[] = [];
    const step = (theta1 - theta0) / steps;
    for (let i = 0; i < steps; i++) {
        const t0 = theta0 + i * step;
        const t1 = theta0 + (i + 1) * step;
        const kappa = (4 / 3) * Math.tan((t1 - t0) / 4);
        const p0 = ellipsePoint(t0, rx, ry);
        const p1 = ellipsePoint(t1, rx, ry);
        const c1 = { x: p0.x - kappa * rx * Math.sin(t0), y: p0.y + kappa * ry * Math.cos(t0) };
        const c2 = { x: p1.x + kappa * rx * Math.sin(t1), y: p1.y - kappa * ry * Math.cos(t1) };
        segments.push({ p0, c1, c2, p1 });
    }
    return segments;
}

export function sampleBezier(seg: BezierSegment, steps: number): Point[] {
    const points: Point[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        const x = mt * mt * mt * seg.p0.x + 3 * mt * mt * t * seg.c1.x + 3 * mt * t * t * seg.c2.x + t * t * t * seg.p1.x;
        const y = mt * mt * mt * seg.p0.y + 3 * mt * mt * t * seg.c1.y + 3 * mt * t * t * seg.c2.y + t * t * t * seg.p1.y;
        points.push({ x, y });
    }
    return points;
}

// Flattens a run of connected bezier segments into one polyline, without duplicating the point
// shared by consecutive segments' start/end.
export function sampleArc(arc: BezierSegment[], stepsPerSegment = 32): Point[] {
    const points: Point[] = [];
    arc.forEach((seg, i) => {
        const segPoints = sampleBezier(seg, stepsPerSegment);
        points.push(...(i === 0 ? segPoints : segPoints.slice(1)));
    });
    return points;
}

// Gutter cutout: a genuine gap in the boundary's own outline at the bottom, sized by x-extent
// (176 to 284) same as the original board - solved for the matching angle on the true circle.
export const GUTTER_CUTOUT_X_START = 176;
export const GUTTER_CUTOUT_X_END = 284;
const GUTTER_THETA = Math.acos((GUTTER_CUTOUT_X_END - FIELD_CX) / FIELD_RX); // ~71.48deg

// Right arc: top (-90deg) -> widest point (0deg) -> gutter-right (+GUTTER_THETA). Left arc
// mirrors it. Both are fully continuous - no notch or gap anywhere near the rail; a real
// machine's round glass is one unbroken piece. What forms the rail (see RAIL_* below) is a
// separate inner guide that runs alongside this same curve, not a cut into it.
export const BOUNDARY_RIGHT_ARC: BezierSegment[] = [
    ...ellipseArcSegments(-90 * DEG, 0, FIELD_RX, FIELD_RY), // top: ellipse
    ...ellipseArcSegments(0, GUTTER_THETA, FIELD_RX, FIELD_RX), // bottom: true circle
];
export const BOUNDARY_LEFT_ARC: BezierSegment[] = [
    ...ellipseArcSegments(Math.PI - GUTTER_THETA, Math.PI, FIELD_RX, FIELD_RX), // bottom: true circle
    ...ellipseArcSegments(Math.PI, 270 * DEG, FIELD_RX, FIELD_RY), // top: ellipse
];

export const BOUNDARY_RIGHT_POINTS = sampleArc(BOUNDARY_RIGHT_ARC);
export const BOUNDARY_LEFT_POINTS = sampleArc(BOUNDARY_LEFT_ARC);

export const BALL_RADIUS = 3.5;
export const PIN_RADIUS = 1.1; // down from 1.6 (originally 2.2) - smaller, more delicate pins to match a real modern board's dense nail field; matched here and in the client's own rendering so what you see is what you collide with

// Gutter: a real gap in the boundary itself, with a pocket hanging below it that narrows down
// to a drain - same construction the original board used, just recomputed for the new circular
// bottom (GUTTER_CUTOUT_Y moved up from 710 to ~391 as a result).
export const GUTTER_CUTOUT_Y = FIELD_CY + FIELD_RX * Math.sin(GUTTER_THETA); // ~391.2
export const GUTTER_POCKET: Point[] = [
    { x: GUTTER_CUTOUT_X_END, y: GUTTER_CUTOUT_Y },
    { x: 258, y: GUTTER_CUTOUT_Y + 38 },
    { x: 202, y: GUTTER_CUTOUT_Y + 38 },
    { x: GUTTER_CUTOUT_X_START, y: GUTTER_CUTOUT_Y },
];
export const GUTTER_DRAIN_Y = GUTTER_CUTOUT_Y + 35; // once the ball crosses this, it's gone

// --- Rail ---------------------------------------------------------------------------------
// The rail sits just inside the glass, flush against it (zero gap - its outer wall IS the
// boundary curve over the same span), from a launch point at the bottom right (LAUNCH_THETA)
// up to a release point at the top right (RELEASE_THETA). Both ends are inside the curve; the
// launcher is not a separate mechanism bolted below the field the way the original board's was.
export const RAIL_WIDTH = 13;
export const RELEASE_THETA = -50 * DEG;
export const LAUNCH_THETA = 55 * DEG;

// The rail's centerline radius is FIELD_RX/RY minus half the rail width - hybrid the same way
// the boundary itself is: ellipse above the widest point (theta<0), true circle at/below it.
function centerlinePoint(theta: number): Point {
    const r = FIELD_RX - RAIL_WIDTH / 2;
    const ry = theta < 0 ? FIELD_RY - RAIL_WIDTH / 2 : r;
    return { x: FIELD_CX + r * Math.cos(theta), y: FIELD_CY + ry * Math.sin(theta) };
}

export const RELEASE_POINT: Point = centerlinePoint(RELEASE_THETA); // where the ball becomes a free body
export const LAUNCHER_POSITION: Point = centerlinePoint(LAUNCH_THETA); // where the ball sits before firing - inside the field, not below it

// Rail walls, purely for the client's own rendering - the physics sim never collides against
// these, only the true boundary (see pachinkoPhysics.ts's buildWallSegments). Outer wall is
// flush with the boundary itself over the RELEASE_THETA-to-LAUNCH_THETA span; inner wall is the
// same hybrid curve offset in by RAIL_WIDTH.
export const RAIL_OUTER_ARC: BezierSegment[] = [
    ...ellipseArcSegments(RELEASE_THETA, 0, FIELD_RX, FIELD_RY),
    ...ellipseArcSegments(0, LAUNCH_THETA, FIELD_RX, FIELD_RX),
];
export const RAIL_INNER_ARC: BezierSegment[] = [
    ...ellipseArcSegments(RELEASE_THETA, 0, FIELD_RX - RAIL_WIDTH, FIELD_RY - RAIL_WIDTH),
    ...ellipseArcSegments(0, LAUNCH_THETA, FIELD_RX - RAIL_WIDTH, FIELD_RX - RAIL_WIDTH),
];

// The rail's launcher-end cap - a half circle bulging in the direction of travel, not a flat
// line, so the launcher reads as the rail's own rounded terminus rather than a separate
// free-floating shape. Center is exactly LAUNCHER_POSITION (the midpoint between the two walls
// at LAUNCH_THETA); sent as plain center/radius/angles so the client can draw it with a single
// ctx.arc call without needing to know anything about the underlying ellipse math.
export const RAIL_CAP = {
    center: LAUNCHER_POSITION,
    radius: RAIL_WIDTH / 2,
    startAngle: LAUNCH_THETA,
    endAngle: LAUNCH_THETA + Math.PI,
};

// Scripted rail-climb path (LAUNCHER_POSITION up to RELEASE_POINT), following the rail's own
// centerline curve. Unlike the boundary/rail-wall arcs above (bezier, built for drawing), this
// is a plain polyline - pachinkoPhysics's railTrajectory just walks it step by step, and
// nothing ever collides against it, so bezier fidelity buys nothing here.
const RAIL_CLIMB_STEPS = 48;
export const RAIL_CLIMB_PATH: Point[] = Array.from({ length: RAIL_CLIMB_STEPS + 1 }, (_, i) => {
    const t = i / RAIL_CLIMB_STEPS;
    const theta = LAUNCH_THETA + t * (RELEASE_THETA - LAUNCH_THETA);
    return centerlinePoint(theta);
});

// The free body's initial velocity direction at RELEASE_POINT - tangent to the boundary curve
// there (ball travels in the direction of decreasing theta, i.e. the reverse of the curve's own
// "increasing theta" tangent). This is what makes a full-power shot able to keep riding the
// glass past the release point instead of launching straight up into it: the ball leaves the
// rail already moving parallel to the wall, not at some unrelated fixed angle.
function releaseTangentUnit(): Point {
    const dx = FIELD_RX * Math.sin(RELEASE_THETA);
    const dy = -FIELD_RY * Math.cos(RELEASE_THETA); // RELEASE_THETA < 0, always in the ellipse region
    const mag = Math.hypot(dx, dy);
    return { x: dx / mag, y: dy / mag };
}
export const RELEASE_TANGENT: Point = releaseTangentUnit();

export const MIN_LAUNCH_POWER = 0;
export const MAX_LAUNCH_POWER = 100;

// The scripted rail-climb speed - deliberately not scaled by power (see the original board's
// own reasoning, unchanged here): a weak pull should still be a fast, immediate mechanical
// action once released, not a slow crawl. Only paces the climb animation; the free body's exit
// speed (launchPowerToExitVelocity below) is what actually differentiates a shot's power.
export function launchPowerToRailSpeed(power: number): number {
    void power;
    return 22; // px per physics step
}

// The free body's exit speed along RELEASE_TANGENT. Empirically tuned (see pachinkoPhysics.ts's
// simulateShot and its own verification script) against this board's geometry: minimum power
// should only just carry the ball clear of the release point before gravity pulls it back down
// into the release-deflector nails right below; maximum power should carry it up near the top
// boundary with speed left to ride the curve across, not just arc weakly and fall straight back.
export function launchPowerToExitVelocity(power: number): number {
    const clamped = Math.min(MAX_LAUNCH_POWER, Math.max(MIN_LAUNCH_POWER, power));
    const t = clamped / MAX_LAUNCH_POWER;
    return 1.4 + t * 11.6; // 1.4 to 13
}

// --- Scoring pockets ------------------------------------------------------------------------

export interface FixedPocket {
    id: string;
    position: Point;
    halfWidth: number;
}

// Every scoring pocket on this board is now the SAME shape of thing: a fixed-width physical cup
// (see POCKET_DEPTH/buildPocketWalls in pachinkoPhysics.ts - real side/bottom walls, so a ball
// can only ever enter through the open top and bounces off if it hits a side, it never "jumps
// in" sideways) that never changes size. Priming/open-closed state (tulips toggling, the
// jackpot needing both tulips open, the attacker's timed window) only ever changes what a catch
// there PAYS or what it visually looks like - never whether it's physically reachable. That's a
// deliberate simplification from an earlier draft where some of these gates literally shrank
// when "closed" - a real pachinko pocket's opening doesn't change size, only whether it's lit.

// Side tulips - catching one toggles it open/closed and awards SIDE_TULIP_BALLS unconditionally
// (see pachinkoPayouts.ts). Both open at once is what primes the jackpot pocket below.
export const TULIPS: FixedPocket[] = [
    { id: "left", position: { x: 144, y: 315 }, halfWidth: 12 },
    { id: "right", position: { x: 316, y: 315 }, halfWidth: 12 },
];

// Jackpot pocket - a real "just fits one ball" target, always this same tiny width. Physically
// catchable at any time, but only actually PAYS (and visually lights up, vs. sitting grey) once
// both side tulips are open - see pachinko.ts's own "jackpot" branch for that gating.
export const JACKPOT: FixedPocket = { id: "jackpot", position: { x: 230, y: 360 }, halfWidth: 7 };

export function isJackpotPrimed(leftOpen: boolean, rightOpen: boolean): boolean {
    return leftOpen && rightOpen;
}

// Bonus pockets - frequent, small top-ups. Sized bigger than the tulips (30px wide vs 24px)
// since they pay less - pocket width scales inversely with payout throughout this board, the
// same logic the jackpot's own tiny pocket follows at the other end.
export const BONUS_POCKETS: FixedPocket[] = [
    { id: "left", position: { x: 130, y: 258 }, halfWidth: 15 },
    { id: "right", position: { x: 330, y: 258 }, halfWidth: 15 },
];

// Chucker - small, always-open trigger. Catching it doesn't pay anything on its own; it's what
// opens the attacker gate below for ATTACKER_OPEN_MS (see pachinkoPayouts.ts).
export const CHUCKER: FixedPocket = { id: "chucker", position: { x: 230, y: 185 }, halfWidth: 8 };

// Attacker - a wide gate, always this same width. Whether a catch here pays ATTACKER_BALLS or
// nothing is entirely a route-level decision (conditions.attackerOpenUntil vs. the clock, see
// pachinko.ts) - this module doesn't need to know the timer state at all.
//
// Moved from y=185's immediate neighbor (225) down to 250 - it used to sit on what was, under
// an earlier hand-placed nail field, a totally pin-free vertical lane just below the chucker.
// Same size, same payout, just deeper into the field - now backed by the generated nail lattice
// (see generateNailField below) and its own dedicated ATTACKER_WALL gate.
export const ATTACKER: FixedPocket = { id: "attacker", position: { x: 230, y: 250 }, halfWidth: 32 };

// Every pocket's physical depth (and the y-tolerance the hit test uses) - the "cup" a ball has
// to actually drop into, top open, walls on the other three sides. Shared by pachinkoPhysics.ts
// (real collision geometry) and the client (matching visual height), so what you see is what
// you collide with.
export const POCKET_DEPTH = 18;

export interface WindmillConfig {
    position: Point;
    radius: number;
}

// Static bumper obstacles flanking the release area, upper-mid field.
export const WINDMILLS: WindmillConfig[] = [
    { position: { x: 110, y: 150 }, radius: 12 },
    { position: { x: 350, y: 150 }, radius: 12 },
];

// --- Nail field -----------------------------------------------------------------------------
// A genuinely dense staggered lattice (100+ small pins) covering nearly the whole playfield -
// what an actual modern machine's board looks like: nails nearly everywhere, not a handful of
// widely-spaced rows. Generated from the board's own boundary formula (a pin can't drift outside
// the glass by construction) rather than hand-placed, same as every version before this one.
//
// This is the third design this field has gone through:
//   1. Hand-placed 8-pin blob clusters. Left the centerline entirely empty (a ball drifting to
//      center had a clear lane through the chucker and the wide attacker pocket), and one
//      cluster's offsets pushed several pins physically outside the boundary curve.
//   2. A handful of short nail rows, capped to just the center corridor, leaving both flanks
//      deliberately empty. Fixed the difficulty regression a full lattice caused (see below) at
//      the cost of looking sparse and patchy on the outer two-thirds of the board - correct
//      simulated numbers, but nothing like a real machine's own density.
// Going back to full density (per direct request, prioritizing "look at a real board" over the
// difficulty-tuning result) reproduces the same tension noted in (2)'s own history, and smaller
// pins don't meaningfully offset it: simulated against the real matter-js engine, every pocket
// got measurably easier than the original board, including the attacker (4.68% -> 6.60% catch
// rate when open, worse than where this started, despite its own dedicated gate wall - see
// ATTACKER_WALL below). A first pass at this density (19px spacing, 209 pins) was far worse still
// (attacker at 12.13%); backing off to 24px spacing (140 pins) recovered some of that but not all
// of it. This board's own layout is the reason: nearly every scoring pocket sits in the same
// center column the field's main traffic already funnels through, so any density increase there
// mostly means more chances to be knocked into a nearby pocket instead of past it - unlike a real
// machine, where the dense field mostly surrounds a much smaller, more isolated scoring area.
// RELEASE_DEFLECTOR (a real diagonal ramp) and ATTACKER_WALL (a dedicated gate over the
// attacker's mouth) stay as their own denser, purposeful structures layered on top of the general
// lattice, same as a real board's gimmick housings sit inside its own nail field rather than
// replacing it - they just aren't strong enough on their own to fully counteract this board's
// own geometry once the surrounding field gets this dense.

export interface PinPosition {
    x: number;
    y: number;
}

const GRID_ROW_SPACING = 24;
const GRID_COL_SPACING = 24;
const GRID_TOP_Y = 60; // just below the crown of the boundary
const GRID_BOTTOM_Y = 380; // just above the gutter cutout/drain
const GRID_GLASS_CLEARANCE = PIN_RADIUS + BALL_RADIUS + 3; // normal margin off the boundary curve
// The rail hugs the *inside* of the glass on the right side over almost this whole y-range (see
// RAIL_WIDTH/RELEASE_THETA/LAUNCH_THETA above) - rows there need a bigger right-side margin so a
// grid pin never lands inside the rail channel itself, not just inside the canvas rectangle.
const GRID_RAIL_CLEARANCE = RAIL_WIDTH + PIN_RADIUS + BALL_RADIUS + 5;

// The half-width, at a given y, of the boundary shrunk inward by `inset` on every side (a
// properly inset ellipse/circle - same hybrid the boundary curve itself uses, see the file
// header - not the boundary's own half-width minus a flat x-offset). Subtracting a flat x-offset
// from the *unshrunk* half-width looks equivalent at the very widest point but under-delivers
// real clearance everywhere else: for a point away from center, the boundary's own inward normal
// isn't purely horizontal, so a flat x-margin doesn't correspond to the same radial distance from
// the true curve. Shrinking the ellipse/circle's own radii first keeps genuine clearance at every
// y, not just at y=FIELD_CY.
function insetHalfWidthAtY(y: number, inset: number): number {
    const rx = FIELD_RX - inset;
    if (y <= FIELD_CY) {
        const ry = FIELD_RY - inset;
        if (ry <= 0) return 0;
        const t = (y - FIELD_CY) / ry;
        if (Math.abs(t) > 1) return 0;
        return rx * Math.sqrt(Math.max(0, 1 - t * t));
    }
    const dy = y - FIELD_CY;
    return Math.sqrt(Math.max(0, rx * rx - dy * dy));
}

// Whether the rail channel occupies the right edge of the boundary at this y - inverts the same
// theta-from-y relationship the (unshrunk) boundary curve itself uses, since y is monotonic in
// theta along the right half of the boundary over this board's whole vertical range.
function railActiveAtY(y: number): boolean {
    const ratio = y <= FIELD_CY ? (y - FIELD_CY) / FIELD_RY : (y - FIELD_CY) / FIELD_RX;
    const theta = Math.asin(Math.max(-1, Math.min(1, ratio)));
    return theta >= RELEASE_THETA && theta <= LAUNCH_THETA;
}

function gridRowXs(y: number, rowIndex: number): number[] {
    const rightHalfWidth = insetHalfWidthAtY(y, railActiveAtY(y) ? GRID_RAIL_CLEARANCE : GRID_GLASS_CLEARANCE);
    const leftHalfWidth = insetHalfWidthAtY(y, GRID_GLASS_CLEARANCE);
    const rightLimit = FIELD_CX + rightHalfWidth;
    const leftLimit = FIELD_CX - leftHalfWidth;
    const offset = rowIndex % 2 === 0 ? 0 : GRID_COL_SPACING / 2;
    const xs: number[] = [];
    for (let x = FIELD_CX + offset; x <= rightLimit; x += GRID_COL_SPACING) xs.push(x);
    for (let x = FIELD_CX + offset - GRID_COL_SPACING; x >= leftLimit; x -= GRID_COL_SPACING) xs.push(x);
    return xs;
}

function generateGridPins(): Point[] {
    const pins: Point[] = [];
    let rowIndex = 0;
    for (let y = GRID_TOP_Y; y <= GRID_BOTTOM_Y; y += GRID_ROW_SPACING, rowIndex++) {
        for (const x of gridRowXs(y, rowIndex)) {
            pins.push({ x, y });
        }
    }
    return pins;
}

// A short diagonal line of nails right where the ball first lands after release, redirecting it
// leftward toward the tulip field - without something directly in that initial path, the ball
// would just ride the boundary curve (or drop) with no meaningful deflection. Sits above the
// topmost nail row (no overlap with it) and is exported (unlike the rows) so pachinkoPhysics.ts
// can give just this chain a lower restitution than the rest of the field.
export const RELEASE_DEFLECTOR: Point[] = [
    { x: 322, y: 100 },
    { x: 308, y: 112 },
    { x: 288, y: 121 },
    { x: 264, y: 128 },
    { x: 238, y: 132 },
    { x: 210, y: 135 },
    { x: 182, y: 137 },
    { x: 156, y: 140 },
];

// A real gate wall over the attacker's mouth, not a floating pair of flanking dots - a tightly
// spaced run of nails with one deliberate center gap, the same idiom a real machine's attacker
// (yakumono) gate uses: the pocket underneath is wide, but the way in is a narrow door. An
// earlier pass used two widely-spaced flanking pins instead (a ball could drift in almost
// anywhere along the mouth); this is meant to actually be harder, not just visually busier.
const ATTACKER_WALL_Y = 230; // well clear of the pocket's own +-9px depth window at y=250
const ATTACKER_WALL_SPACING = 5;
const ATTACKER_WALL_HALF_SPAN = 30;
const ATTACKER_WALL_GAP_HALF = 9; // ~18px door - wider than the ball, narrow next to the mouth's 64px
function generateAttackerWall(): Point[] {
    const wall: Point[] = [];
    for (let dx = -ATTACKER_WALL_HALF_SPAN; dx <= ATTACKER_WALL_HALF_SPAN; dx += ATTACKER_WALL_SPACING) {
        if (Math.abs(dx) < ATTACKER_WALL_GAP_HALF) continue;
        wall.push({ x: ATTACKER.position.x + dx, y: ATTACKER_WALL_Y });
    }
    return wall;
}
export const ATTACKER_WALL: Point[] = generateAttackerWall();

const ALL_POCKETS_FOR_CLEARANCE: FixedPocket[] = [...TULIPS, JACKPOT, ATTACKER, ...BONUS_POCKETS, CHUCKER];
const POCKET_PIN_CLEARANCE = PIN_RADIUS + BALL_RADIUS; // beyond the pocket's own halfWidth/depth, so a grid pin never sits flush against a pocket wall

function conflictsWithPocket(p: Point): boolean {
    return ALL_POCKETS_FOR_CLEARANCE.some(
        (pocket) => Math.abs(p.x - pocket.position.x) <= pocket.halfWidth + POCKET_PIN_CLEARANCE && Math.abs(p.y - pocket.position.y) <= POCKET_DEPTH / 2 + POCKET_PIN_CLEARANCE
    );
}

function conflictsWithWindmill(p: Point): boolean {
    return WINDMILLS.some((w) => Math.hypot(p.x - w.position.x, p.y - w.position.y) < w.radius + PIN_RADIUS + BALL_RADIUS + 2);
}

function conflictsWithLauncher(p: Point): boolean {
    return Math.hypot(p.x - LAUNCHER_POSITION.x, p.y - LAUNCHER_POSITION.y) < RAIL_WIDTH + PIN_RADIUS + BALL_RADIUS + 2;
}

function conflictsWithAttackerWall(p: Point): boolean {
    return ATTACKER_WALL.some((w) => Math.hypot(p.x - w.x, p.y - w.y) < GRID_COL_SPACING * 0.6);
}

// The grid now reaches up into the deflector's own y-range (see GRID_TOP_Y) - without this, some
// grid points would land right on top of that chain instead of respecting it as its own
// dedicated (lower-restitution, see pachinkoPhysics.ts) structure.
function conflictsWithDeflector(p: Point): boolean {
    return RELEASE_DEFLECTOR.some((d) => Math.hypot(p.x - d.x, p.y - d.y) < GRID_COL_SPACING * 0.6);
}

export function generateNailField(): PinPosition[] {
    const pins: PinPosition[] = [];
    for (const deflector of RELEASE_DEFLECTOR) {
        pins.push({ x: deflector.x, y: deflector.y });
    }
    for (const wall of ATTACKER_WALL) {
        pins.push({ x: wall.x, y: wall.y });
    }
    for (const grid of generateGridPins()) {
        if (conflictsWithPocket(grid) || conflictsWithWindmill(grid) || conflictsWithLauncher(grid) || conflictsWithAttackerWall(grid) || conflictsWithDeflector(grid)) continue;
        pins.push({ x: grid.x, y: grid.y });
    }
    return pins;
}
