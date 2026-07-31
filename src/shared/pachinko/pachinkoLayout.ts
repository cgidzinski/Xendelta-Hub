/**
 * Pure Pachinko board geometry - shared by the physics sim (pachinkoPhysics.ts, now isomorphic:
 * runs on both the client and the server, see that file's own header) and mirrored to the
 * client's rendering via the /odds response, so both draw and simulate against the exact same
 * board. No matter-js import here - keeps this trivially unit-testable without a physics engine
 * in the loop.
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

export const BALL_RADIUS = 2.5;
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
// simulateShot and pachinkoReachability.ts) against this board's geometry: minimum power should
// only just carry the ball clear of the release point before gravity pulls it back down into the
// release-deflector nails right below; maximum power should carry it up over the top and down the
// left side of the field with speed to spare.
//
// Eased at the top rather than linear, and the reason is measured. The curve used to run straight
// from 1.4 to 13, but the board's ceiling is at y=44 (FIELD_CY - FIELD_RY) and an exit velocity
// above ~8.1 pins the ball's apex against it - so powers 58 through 100 traced an *identical*
// path, to within half a pixel. Two fifths of the player's only control did nothing whatsoever.
// Below the knee the curve is deliberately unchanged, so every launch power that already behaved
// well still produces exactly the velocity it always did (the tulip band around power 25 in
// particular is tuned against these numbers); above it, the range is compressed so the upper half
// of the slider spreads across the left field instead of collapsing onto one ceiling-scraping arc.
const EXIT_VELOCITY_MIN = 1.4;
const EXIT_VELOCITY_KNEE_POWER = 45; // below this, identical to the original linear curve
const EXIT_VELOCITY_KNEE = 6.62; // 1.4 + (45/100) * 11.6, i.e. exactly where the old curve was here
const EXIT_VELOCITY_MAX = 7.8; // measured: the apex starts pinning against the ceiling around 8.1, so stay under it across the whole slider
export function launchPowerToExitVelocity(power: number): number {
    const clamped = Math.min(MAX_LAUNCH_POWER, Math.max(MIN_LAUNCH_POWER, power));
    if (clamped <= EXIT_VELOCITY_KNEE_POWER) {
        return EXIT_VELOCITY_MIN + (clamped / MAX_LAUNCH_POWER) * 11.6;
    }
    const t = (clamped - EXIT_VELOCITY_KNEE_POWER) / (MAX_LAUNCH_POWER - EXIT_VELOCITY_KNEE_POWER);
    return EXIT_VELOCITY_KNEE + t * (EXIT_VELOCITY_MAX - EXIT_VELOCITY_KNEE);
}

// --- Scoring pockets ------------------------------------------------------------------------

export interface FixedPocket {
    id: string;
    position: Point;
    halfWidth: number;
}

// Every scoring pocket on this board is the SAME shape of thing: a fixed-width physical cup (see
// POCKET_DEPTH/buildPocketWalls in pachinkoPhysics.ts - real side walls, so a ball can only ever
// enter through the open top and bounces off if it hits a side, it never "jumps in" sideways)
// that never changes size. Open/closed state (tulips toggling, the jackpot needing both tulips
// open, the attacker's window) only ever changes what a catch there PAYS and what it visually
// looks like - never whether it's physically reachable, and never the board's geometry, so it can
// never change where a ball goes. The three gated pockets are built without a floor precisely to
// guarantee that (see buildPocketWalls); every other pocket has one. That's a deliberate
// simplification from an earlier draft where some of these gates literally shrank - or vanished
// outright - when "closed"; a real pachinko pocket's opening doesn't change size, only whether
// it's lit.

// Side tulips - catching one toggles it open/closed and awards SIDE_TULIP_BALLS unconditionally
// (see pachinkoPayouts.ts). Both open at once opens the jackpot pocket below for a timed window
// (JACKPOT_OPEN_SHOTS balls - see pachinkoRules.ts) and immediately resets both back to closed -
// see economy.ts's applyShot, which owns every gate transition on this board.
// Moved inward from 172/288 (58px either side of centre) to 196/264 (34px), and the reason is
// measured rather than aesthetic. Priming the jackpot needs BOTH tulips open at once, and they
// toggle - so what matters is the weaker side's rate at a SINGLE launch power, not the total. The
// ball's lateral position is essentially fixed by the time it leaves the release deflector at
// y=145 and barely drifts afterwards, and the spread of that stream at any one power is only
// ~30-70px wide. At 116px apart, no single power could put meaningful mass on both tulips: low
// power fed only the right one, power 35-45 only the left, and a power that feeds one side just
// opens and shuts the same tulip over and over. At 68px apart both sit inside the stream's own
// spread, and the weaker side's rate at the best power measured 3x better.
//
// That extra reach costs RTP, so SIDE_TULIP_BALLS came down to compensate (see pachinkoPayouts.ts)
// - the catch rate is what makes the jackpot reachable, and the payout per catch is what pays for
// it. Widening the pockets instead was measured and rejected: it scales both sides but doesn't
// widen the usable power band at all, because the stream still never arrives.
export const TULIPS: FixedPocket[] = [
    { id: "left", position: { x: 196, y: 250 }, halfWidth: 8 },
    { id: "right", position: { x: 264, y: 250 }, halfWidth: 8 },
];

// Jackpot pocket - a real "just fits one ball" target, barely wider than the ball itself
// (BALL_RADIUS*2 = 5px across; this pocket is 7px), always this same tiny width.
// Physically catchable at any time, but only actually PAYS (and visually lights up, vs. sitting
// grey) while primed - see economy.ts's applyShot and JACKPOT_OPEN_SHOTS in pachinkoRules.ts for
// that window, which is counted in balls rather than seconds.
export const JACKPOT: FixedPocket = { id: "jackpot", position: { x: 230, y: 372 }, halfWidth: 3.5 };

// True the instant both tulips are simultaneously open - pachinko.ts uses this to detect the
// priming *moment*, which starts the jackpot's timed window. Both tulips are then HELD open for
// the rest of that window (a catch on either side pays out but no longer toggles the gate) -
// see pachinko.ts's own "tulipLeft"/"tulipRight" branch, the only caller.
export function isJackpotPrimed(leftOpen: boolean, rightOpen: boolean): boolean {
    return leftOpen && rightOpen;
}

// (The old shouldCloseLapsedTulips helper lived here. It took two wall-clock timestamps and a
// `now`, which is exactly the shape that no longer exists: gate windows are counted in balls, not
// milliseconds - see pachinkoRules.ts's header. The rule it encoded, "a jackpot window that was
// running and has now run out takes both tulips shut with it", now lives inline in economy.ts's
// applyShot alongside every other transition, where it reads as one line against the shot counter.)

// Bonus pockets - frequent, small top-ups. Sized bigger than the tulips (18px wide vs 16px)
// since they pay less - pocket width scales inversely with payout throughout this board, the
// same logic the jackpot's own tiny pocket follows at the other end.
export const BONUS_POCKETS: FixedPocket[] = [
    { id: "left", position: { x: 105, y: 285 }, halfWidth: 9 },
    { id: "right", position: { x: 355, y: 285 }, halfWidth: 9 },
];

// Chucker (heso) - small, always-open trigger, sitting directly below the stage/life-nails (see
// STAGE_BOX/LIFE_NAILS below) - the real anatomy this board now follows. Catching it doesn't pay
// anything on its own; it's what opens the attacker gate below for ATTACKER_OPEN_SHOTS balls (see
// pachinkoRules.ts), and only on a reel three-of-a-kind.
export const CHUCKER: FixedPocket = { id: "chucker", position: { x: 230, y: 248 }, halfWidth: 5 };

// Attacker - a wide gate, always this same width, directly below the chucker in the classic
// column real machines use. Whether a catch here pays ATTACKER_BALLS or nothing is entirely a
// gate-state decision (attackerShotsRemaining, via economy.ts's gateFlagsFor) - this module
// doesn't need to know the window state at all.
export const ATTACKER: FixedPocket = { id: "attacker", position: { x: 230, y: 284 }, halfWidth: 32 };

// Every pocket's physical depth (and the y-tolerance the hit test uses) - the "cup" a ball has
// to actually drop into, top open, walls on the other three sides. Shared by pachinkoPhysics.ts
// (real collision geometry) and the client (matching visual height), so what you see is what
// you collide with.
export const POCKET_DEPTH = 18;

export interface WindmillConfig {
    position: Point;
    radius: number;
}

// Static bumper obstacles flanking the stage/reel - real "kazaguruma," diverting whatever misses
// the warp funnels back toward center instead of sitting isolated up near the top corners.
export const WINDMILLS: WindmillConfig[] = [
    { position: { x: 155, y: 210 }, radius: 12 },
    { position: { x: 305, y: 210 }, radius: 12 },
];

// The stage - a deliberately nail-free ledge directly under the LCD reel (see the client's
// REEL_BOX, centered at the same x=230), where the ball visibly rolls before dropping toward the
// chucker below - real players call this the single biggest factor in whether a ball actually
// reaches the heso. Every generated candidate nail landing in this box is dropped (see
// conflictsWithStage below), same as the exclusion pockets/windmills already get.
export const STAGE_BOX = { xMin: 165, xMax: 295, yMin: 205, yMax: 232 };

// Life-nails ("inochi-kugi") - a real machine's own most important nails: a fixed pair flanking
// the chucker's approach, just outside the chucker's own pocket-clearance zone so they survive
// the generic pocket-clearance filter below. They don't block the chucker's mouth outright (that
// hitbox is still governed entirely by the chucker's own pocket walls) - they just mean the
// field right above it isn't wide open the way the rest of the stage corridor is, catching balls
// that come in too far off-center and knocking them back toward the middle.
export const LIFE_NAILS: Point[] = [
    { x: 212, y: 233 },
    { x: 248, y: 233 },
];

// --- Nail field: Branching Roads ------------------------------------------------------------
// Instead of rings or grids, the nail field is 5 sweeping curved "roads" that branch from the
// release area. Each road is a chain of closely-spaced nails — balls thread through the gaps
// between them, and power determines which road a ball enters. Roads are visual guides, not
// solid walls — balls can cross between them. Roads 2 and 4 curl inward as "warp funnels" that
// feed the stage from either side (real "road nails"/"warp" anatomy); roads 1 and 5 stay wider
// and outer, feeding the two bonus pockets; road 3 is the center column running from the stage
// down through the chucker/attacker/jackpot corridor (the STAGE_BOX/LIFE_NAILS exclusions above
// carve the actual stage and life-nail gap out of it - see conflictsWithStage below).

export interface PinPosition {
    x: number;
    y: number;
}

// Five branching roads. The chucker sits on Road 3 — that's the skill-shot lane.
const ROAD_PATHS: Point[][] = [
    [{ x: 178, y: 146 }, { x: 160, y: 168 }, { x: 145, y: 192 }, { x: 130, y: 218 }, { x: 118, y: 246 }, { x: 110, y: 272 }, { x: 106, y: 296 }],
    [{ x: 206, y: 143 }, { x: 192, y: 160 }, { x: 180, y: 178 }, { x: 170, y: 198 }, { x: 163, y: 218 }, { x: 163, y: 236 }, { x: 168, y: 252 }, { x: 176, y: 266 }],
    [{ x: 230, y: 128 }, { x: 230, y: 148 }, { x: 230, y: 168 }, { x: 230, y: 188 }, { x: 230, y: 208 }, { x: 230, y: 270 }],
    [{ x: 254, y: 143 }, { x: 268, y: 160 }, { x: 280, y: 178 }, { x: 290, y: 198 }, { x: 297, y: 218 }, { x: 297, y: 236 }, { x: 292, y: 252 }, { x: 284, y: 266 }],
    [{ x: 282, y: 146 }, { x: 300, y: 168 }, { x: 315, y: 192 }, { x: 330, y: 218 }, { x: 342, y: 246 }, { x: 350, y: 272 }, { x: 354, y: 296 }],
];

const ROAD_NAIL_SPACING = 10;

function sampleRoadNails(road: Point[]): Point[] {
    const nails: Point[] = [];
    for (let i = 0; i < road.length - 1; i++) {
        const a = road[i], b = road[i + 1];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.round(segLen / ROAD_NAIL_SPACING));
        // Skip s=0 after the first segment - it's the same point as the previous segment's
        // s=steps, so without this every joint between consecutive points in a road produces
        // the same pin twice.
        const startS = i === 0 ? 0 : 1;
        for (let s = startS; s <= steps; s++) {
            const t = s / steps;
            nails.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    return nails;
}

function generateRoadNails(): Point[] { return ROAD_PATHS.flatMap(sampleRoadNails); }
export const ROADS = ROAD_PATHS;

// --- Funnel rows (lower field density) -------------------------------
const FUNNEL_ROWS: { y: number; halfWidth: number }[] = [
    { y: 302, halfWidth: 100 }, { y: 322, halfWidth: 80 }, { y: 340, halfWidth: 58 },
];

// Gathering nails ("yori-kugi") - two explicit diagonal guide lines converging from just below
// the attacker down to the jackpot's mouth, same road/polyline mechanism as the warp funnels
// above. A real machine leans on angled nails like this, not a plain grid, to actually gather a
// ball toward a tiny target instead of relying on chance alignment through staggered rows. Given
// the full run from just under the attacker to the jackpot's mouth to actually do their job.
const JACKPOT_GUIDES: Point[][] = [
    [{ x: 125, y: 300 }, { x: 148, y: 316 }, { x: 170, y: 332 }, { x: 190, y: 346 }, { x: 206, y: 358 }, { x: 218, y: 366 }],
    [{ x: 335, y: 300 }, { x: 312, y: 316 }, { x: 290, y: 332 }, { x: 270, y: 346 }, { x: 254, y: 358 }, { x: 242, y: 366 }],
];
function generateJackpotGuideNails(): Point[] { return JACKPOT_GUIDES.flatMap(sampleRoadNails); }
const FUNNEL_COL_SPACING = 22;

// Every row uses the SAME non-zero offset (not alternating by row index) - alternating would
// place a pin dead-center on every other row, which stacks into a checkerboard that blocks the
// direct approach to the jackpot below far more than a real funnel would. A constant offset
// instead leaves a permanent, un-blocked channel straight down the centerline at every row, the
// halfWidth taper alone doing the converging.
function funnelRowPoints(row: { y: number; halfWidth: number }): Point[] {
    const offset = FUNNEL_COL_SPACING / 2;
    const pts: Point[] = [];
    for (let x = FIELD_CX + offset; x <= FIELD_CX + row.halfWidth; x += FUNNEL_COL_SPACING) pts.push({ x, y: row.y });
    for (let x = FIELD_CX + offset - FUNNEL_COL_SPACING; x >= FIELD_CX - row.halfWidth; x -= FUNNEL_COL_SPACING) pts.push({ x, y: row.y });
    return pts;
}
function generateFunnelRows(): Point[] { return FUNNEL_ROWS.flatMap(funnelRowPoints); }

// Top nails ("tenkugi") - a few extra fixed pins right at the very top of the glass, above the
// release deflector, so the ball gets an extra scatter point immediately after it becomes a free
// body (RELEASE_POINT sits around y~89) rather than the deflector row being the first thing it
// can hit.
export const TOP_NAILS: Point[] = [
    { x: 190, y: 78 }, { x: 215, y: 70 }, { x: 245, y: 70 }, { x: 270, y: 78 }, { x: 200, y: 92 }, { x: 260, y: 92 },
];

// --- Release deflector & second road --------------------------------
// Both densified the same way ROAD_PATHS is (sampleRoadNails, ROAD_NAIL_SPACING) rather than left
// as their own raw anchor points - the raw spacing here (18-28px) was more than double a real
// ball+pin contact zone (~7.2px, see POCKET_PIN_CLEARANCE below), wide enough for a ball to slip
// through un-deflected on its very first chance to interact with anything (RELEASE_DEFLECTOR is
// literally the row whose whole job is catching the ball right as it leaves the launcher - see
// its own header) and pass most of the rest of the field untouched. The raw anchor points below
// still define each road's actual shape/curve; sampleRoadNails just fills the line between them.
const RELEASE_DEFLECTOR_PATH: Point[] = [
    { x: 322, y: 100 }, { x: 308, y: 112 }, { x: 288, y: 121 }, { x: 264, y: 128 },
    { x: 238, y: 132 }, { x: 210, y: 135 }, { x: 182, y: 137 }, { x: 156, y: 140 },
];
const SECOND_ROAD_PATH: Point[] = [
    { x: 130, y: 160 }, { x: 142, y: 172 }, { x: 152, y: 184 }, { x: 162, y: 194 }, { x: 172, y: 200 },
];
export const RELEASE_DEFLECTOR: Point[] = sampleRoadNails(RELEASE_DEFLECTOR_PATH);
export const SECOND_ROAD: Point[] = sampleRoadNails(SECOND_ROAD_PATH);

// --- Left field -----------------------------------------------------
// The board's left return lane. Everything else on this board is a right-and-centre structure:
// nothing at all used to exist west of x=130 between y=100 and y=227, and no nail anywhere had
// x < 110. That void is where a hard shot actually lands - the release tangent throws the ball up
// and left, so above roughly half power it arcs clean over TOP_NAILS and comes down against the
// left glass, crossing y=150 around x=80 and y=200 around x=66. Measured, its closest approach to
// any nail on that entire descent was 39-41px, where contact needs 3.6px. It wasn't being deflected
// badly; there was simply nothing there. It slid down the glass, accelerating the whole way, and
// drained - every time, for the entire upper half of the launch range.
//
// So: a real left field across exactly that descent. Derived from the boundary formula rather than
// hardcoded (same approach RAIL_CLIMB_PATH takes) so it stays correct if the board is ever
// re-proportioned - the whole point is that it tracks the wall the ball is sliding down, and a
// hand-typed polyline would silently stop doing that.
//
// Deliberately a separate structure rather than an extension of RELEASE_DEFLECTOR, even though
// that row's left terminus is nearby: the deflector is what sets a LOW-power ball's lateral
// position, which measurement shows is the single most sensitive parameter on this board (a ball's
// x is essentially decided by y=145 and barely drifts afterwards). Extending it would have
// perturbed every working low-power shot to fix a high-power problem. This only ever touches balls
// that enter the void.
//
// Angles follow this file's own convention: 0 = rightmost, -90 = straight up, so the upper-left
// quadrant runs from -90 down to -180, and continuing past -180 wraps into the lower left. This
// span covers y~121 at the top, through the glass's widest point at y=230, down to y~288 where it
// hands off to road 1 and the left bonus pocket. Theta DECREASING is downhill along the glass.
const LEFT_FIELD_THETA_START = -147;
const LEFT_FIELD_SEGMENT_SPAN = 11; // degrees of arc per kicker, ~33px
const LEFT_FIELD_SEGMENT_GAP = 3; // open degrees between kickers, ~9px
const LEFT_FIELD_SEGMENTS = 4;

// ## Why this is four short ramps and not one line parallel to the glass
//
// It WAS one line, at a constant 7px inset, and that shape wedged balls: measured across the power
// range, roughly 30% of shots at powers 64-100 came to a dead stop against the left glass. (Flight
// duration doesn't show this - simulateShot's stall detector gives up on a stationary ball and
// glides it to the drain, so a jam reports an ordinary-length trajectory. What shows it is a run of
// near-stationary samples; pachinkoReachability.ts measures exactly that, and should be re-run after
// any edit here.)
//
// The arithmetic of the trap, all of it forced by three numbers - the wall is 3px thick so its
// inner face is 1.5px inboard of the boundary centreline, PIN_RADIUS is 1.1, and the ball is 5px
// across:
//
//   clear gap between glass and a pin at inset d  =  (d - PIN_RADIUS) - 1.5  =  d - 2.6
//
// At d=7 that is 4.4px against a 5px ball. The ball cannot pass - which was the intent - but it
// misses by only 0.6px, and a 0.6px interference is a squeeze the solver has to grind the ball out
// of, not a clean deflection. Worse, consecutive pins at ROAD_NAIL_SPACING=10 leave 7.8px between
// their edges, comfortably more than the ball, so the ball could slip sideways INTO that channel and
// then sit in a pocket bounded by glass, pin and pin with every exit fractionally too small.
//
// So two rules, chosen to make the wedge unrepresentable rather than merely rarer:
//
//   1. **No pin sits in the trap band.** A pin is either sealing (d small enough that the gap is far
//      under a ball width, so there is no space to enter) or open (d large enough that the gap
//      comfortably exceeds one, so the ball passes cleanly). Nothing in between. Sealing pins sit at
//      4.5 - a 1.9px gap, unenterable, while still leaving the pin 1.9px clear of the glass so it is
//      never buried in wall geometry. Open pins start at 11 (an 8.4px gap).
//   2. **No pin line ever runs parallel to the glass.** Each kicker's inset grows monotonically as it
//      descends, so any space the ball is in is already widening ahead of it and there is no closed
//      pocket to come to rest in. At most one sealing pin per kicker, with nothing near the glass
//      below it, so there is never a second near-wall pin to close a pocket underneath the ball.
//
// A ball sliding down the glass meets a kicker's sealing pin, cannot get past it on the wall side,
// and is guided down the ramp and released into open field 16px off the glass. That is the same
// shape RELEASE_DEFLECTOR has on the right, and why that structure redirects without ever jamming
// despite also hugging the boundary. The open gaps between kickers exist so a ball that does return
// to the glass gets caught again by the next one rather than riding a continuous rail all the way
// down.
//
// Result, measured the same way as the baseline above: the worst power's left-glass stall rate went
// from 48% to 3.5%, with no power band failing, while the dead-zone and both-tulips checks this
// structure exists to satisfy still pass. The few percent that remain are not wedges - see
// LEFT_CORRIDOR_X in pachinkoReachability.ts for what they are and why chasing them is a mistake.
//
// The insets are a real constraint, not taste: raising the sealing pins past ~7.6 (a 5px gap) lets
// wall-hugging balls thread through and brings back the dead launch band this whole structure was
// added to fix, and lowering them under ~2.6 buries them in the wall.
const LEFT_FIELD_SEAL_INSET = 4.5;
const LEFT_FIELD_OPEN_INSET = 11;
const LEFT_FIELD_END_INSET = 16;

// Only the kickers on the sloping upper glass get a sealing pin; the lower ones are ramp-only.
//
// A sealing pin works by standing in the way of a ball that is being pressed INTO the glass as it
// descends, which is what the wall's own slope does above this angle - the ball arrives at the pin
// off-centre and on a slope, and runs off it inboard. Below roughly -170 the glass is within 10
// degrees of vertical, and past -180 it undercuts and curves back inboard, so a ball there is
// already being carried away from the wall by the wall itself. A pin in that stretch isn't a kicker,
// it's a shelf: the ball comes down almost vertically, lands square on top of it with no lateral
// component to shed, and balances.
//
// That is not a guess. With sealing pins on all four kickers, the two below this line produced 84 of
// 129 left-corridor stalls on their own - the single worst site being the lowest seal, with 72 - while
// the two above produced 2 between them. Same inset, same spacing, same construction; the only
// difference is the angle of the glass behind them.
const LEFT_FIELD_SEAL_ABOVE_THETA = -170;
// Degrees between the sealing pin and the first open one. Kept short deliberately: sampleRoadNails
// only subdivides a leg longer than ROAD_NAIL_SPACING, so at this spacing the seal-to-open leg emits
// its two endpoints and nothing between them - which is what keeps rule 1 true, since any pin
// interpolated along that leg would land squarely in the 2.6-7.6 trap band it jumps over.
const LEFT_FIELD_SEAL_RUN = 2.5;

// Same ellipse-above / circle-below hybrid the boundary itself uses (above centre means
// sin(theta) < 0 with y pointing down), so an inset is a true constant gap from the glass rather
// than one that drifts open as it passes the widest point.
function leftFieldPoint(thetaDeg: number, inset: number): Point {
    const theta = thetaDeg * DEG;
    const rx = FIELD_RX - inset;
    const ry = Math.sin(theta) < 0 ? FIELD_RY - inset : rx;
    return { x: FIELD_CX + rx * Math.cos(theta), y: FIELD_CY + ry * Math.sin(theta) };
}

const LEFT_FIELD_KICKERS: Point[][] = Array.from({ length: LEFT_FIELD_SEGMENTS }, (_, i) => {
    const start = LEFT_FIELD_THETA_START - i * (LEFT_FIELD_SEGMENT_SPAN + LEFT_FIELD_SEGMENT_GAP);
    const ramp = [leftFieldPoint(start - LEFT_FIELD_SEAL_RUN, LEFT_FIELD_OPEN_INSET), leftFieldPoint(start - LEFT_FIELD_SEGMENT_SPAN, LEFT_FIELD_END_INSET)];
    return start > LEFT_FIELD_SEAL_ABOVE_THETA ? [leftFieldPoint(start, LEFT_FIELD_SEAL_INSET), ...ramp] : ramp;
});
export const LEFT_FIELD: Point[] = LEFT_FIELD_KICKERS.flatMap(sampleRoadNails);

// --- Pin conflicts & assembly ---------------------------------------
const ALL_POCKETS_FOR_CLEARANCE: FixedPocket[] = [...TULIPS, JACKPOT, ATTACKER, ...BONUS_POCKETS, CHUCKER];
const POCKET_PIN_CLEARANCE = PIN_RADIUS + BALL_RADIUS;

function conflictsWithPocket(p: Point): boolean {
    return ALL_POCKETS_FOR_CLEARANCE.some(pkt => Math.abs(p.x - pkt.position.x) <= pkt.halfWidth + POCKET_PIN_CLEARANCE && Math.abs(p.y - pkt.position.y) <= POCKET_DEPTH / 2 + POCKET_PIN_CLEARANCE);
}
function conflictsWithWindmill(p: Point): boolean { return WINDMILLS.some(w => Math.hypot(p.x - w.position.x, p.y - w.position.y) < w.radius + PIN_RADIUS + BALL_RADIUS + 2); }
function conflictsWithLauncher(p: Point): boolean { return Math.hypot(p.x - LAUNCHER_POSITION.x, p.y - LAUNCHER_POSITION.y) < RAIL_WIDTH + PIN_RADIUS + BALL_RADIUS + 2; }
function conflictsWithRoads(p: Point): boolean { return [...RELEASE_DEFLECTOR, ...SECOND_ROAD].some(r => Math.hypot(p.x - r.x, p.y - r.y) < FUNNEL_COL_SPACING * 0.6); }
function conflictsWithStage(p: Point): boolean {
    return p.x >= STAGE_BOX.xMin && p.x <= STAGE_BOX.xMax && p.y >= STAGE_BOX.yMin && p.y <= STAGE_BOX.yMax;
}
function conflictsWithAny(p: Point): boolean {
    return conflictsWithPocket(p) || conflictsWithWindmill(p) || conflictsWithLauncher(p) || conflictsWithRoads(p) || conflictsWithStage(p);
}

export function generateNailField(): PinPosition[] {
    const pins: PinPosition[] = [];
    for (const fixedPin of [...TOP_NAILS, ...RELEASE_DEFLECTOR, ...SECOND_ROAD, ...LEFT_FIELD, ...LIFE_NAILS]) pins.push({ x: fixedPin.x, y: fixedPin.y });
    for (const candidate of [...generateRoadNails(), ...generateFunnelRows(), ...generateJackpotGuideNails()]) {
        if (conflictsWithAny(candidate)) continue;
        pins.push({ x: candidate.x, y: candidate.y });
    }
    return pins;
}
