/**
 * Pure Pachinko board geometry - shared by the physics sim (pachinkoPhysics.ts, server-only)
 * and mirrored to the client via the /odds response so it draws the exact same board the
 * simulation ran against. No matter-js import here - keeps this trivially unit-testable
 * without a physics engine in the loop.
 *
 * The shape was worked out against a reference diagram before any of this was written (see
 * the plan doc) - a single symmetric oval boundary with a genuine gap cut into its own edge
 * at the bottom (the gutter), and a separate straight channel below/alongside the one part
 * of the boundary that's itself a straight vertical line (the right wall). Both the boundary
 * and the channel are expressed as raw bezier control points here so the client can draw
 * smooth curves with them directly, plus a sampler that flattens them into polylines for the
 * physics module's static collision segments.
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
export const CANVAS_HEIGHT = 780;

// The boundary is split into two arcs, not one closed loop - the gutter cutout at the bottom
// (between the two arcs' endpoints) is a genuine gap, not a shape drawn over an intact edge.
// Segment index 1 of the right arc is the one part of the whole boundary that's a straight
// vertical line (constant x=400) - that's what the rail/channel runs alongside.
export const BOUNDARY_RIGHT_ARC: BezierSegment[] = [
    { p0: { x: 230, y: 34 }, c1: { x: 344, y: 34 }, c2: { x: 400, y: 100 }, p1: { x: 400, y: 260 } },
    { p0: { x: 400, y: 260 }, c1: { x: 400, y: 460 }, c2: { x: 400, y: 560 }, p1: { x: 400, y: 620 } },
    { p0: { x: 400, y: 620 }, c1: { x: 400, y: 690 }, c2: { x: 352, y: 710 }, p1: { x: 284, y: 710 } },
];
export const BOUNDARY_LEFT_ARC: BezierSegment[] = [
    { p0: { x: 176, y: 710 }, c1: { x: 108, y: 710 }, c2: { x: 60, y: 690 }, p1: { x: 60, y: 620 } },
    { p0: { x: 60, y: 620 }, c1: { x: 60, y: 560 }, c2: { x: 60, y: 460 }, p1: { x: 60, y: 260 } },
    { p0: { x: 60, y: 260 }, c1: { x: 60, y: 100 }, c2: { x: 116, y: 34 }, p1: { x: 230, y: 34 } },
];

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

// Flattens a run of connected bezier segments into one polyline, without duplicating the
// point shared by consecutive segments' start/end. 32, not the original 14 - even though
// consecutive segments' tangents match exactly at their shared endpoint (verified: the top
// curve's end tangent and the straight rail segment's own direction are both purely
// vertical), each individual straight chord is still only an approximation of the curve
// between its two sampled points, not the true tangent line. With only 14 chords per segment,
// the last chord approaching that joint was long enough to visibly deviate from vertical,
// so a fast ball riding up near the wall picked up a small unwanted sideways kick right where
// the straight rail met the curve, instead of a clean transition. Doubling the resolution
// halves each chord's own angular error there.
export function sampleArc(arc: BezierSegment[], stepsPerSegment = 32): Point[] {
    const points: Point[] = [];
    arc.forEach((seg, i) => {
        const segPoints = sampleBezier(seg, stepsPerSegment);
        points.push(...(i === 0 ? segPoints : segPoints.slice(1)));
    });
    return points;
}

export const BOUNDARY_RIGHT_POINTS = sampleArc(BOUNDARY_RIGHT_ARC);
export const BOUNDARY_LEFT_POINTS = sampleArc(BOUNDARY_LEFT_ARC);

// The rail/channel: thin (about one ball-width), starting below the field entirely at the
// launcher and running straight up alongside the boundary's one straight vertical segment
// (BOUNDARY_RIGHT_ARC[1], x=400 from y=260 to y=620), ending exactly where that segment ends
// and the boundary starts curving again - that point is the release point, where the ball
// leaves the scripted rail phase and becomes a free body in the open field.
export const CHANNEL_OUTER_X = 400; // = the boundary's own straight segment; no separate outer wall
// 12, not exactly one ball-width (8) - the release point/ball spawn sits at this channel's
// center, and with only 8px it landed close enough to the wall's own collision geometry
// (which has some real thickness, not a zero-width line) that the ball spawned slightly
// embedded in it - confirmed empirically as a strong, velocity-independent "kick" masking any
// power tuning at the low end. The extra clearance here is what actually fixes that, not
// anything in the physics module itself.
export const CHANNEL_WIDTH = 12;
export const CHANNEL_INNER_X = CHANNEL_OUTER_X - CHANNEL_WIDTH;
export const CHANNEL_TOP_Y = 260; // top of the straight segment = release point's y
export const CHANNEL_BOTTOM_Y = 620; // bottom of the straight segment, where the channel meets the field's own boundary

const CHANNEL_CENTER_X = (CHANNEL_OUTER_X + CHANNEL_INNER_X) / 2;
export const RELEASE_POINT: Point = { x: CHANNEL_CENTER_X, y: CHANNEL_TOP_Y };
export const LAUNCHER_POSITION: Point = { x: CHANNEL_CENTER_X, y: 746 }; // below the field entirely, not touching its edge

// The ball's scripted position while it's still "on the rail" - a straight line from the
// launcher up to the release point. Only two points are needed since the whole run is a
// straight line; the physics module interpolates along it.
export const RAIL_PATH: Point[] = [LAUNCHER_POSITION, RELEASE_POINT];

export const BALL_RADIUS = 3.5; // small relative to both nail spacing and the channel width
export const PIN_RADIUS = 2.2;

// Gutter: a real gap in the boundary itself (between the two arcs above), with a pocket
// hanging below it that narrows down to a drain - the ball falls through the cutout, into
// the pocket, and out through the drain, the same construction pattern the launcher uses to
// poke below the field.
export const GUTTER_CUTOUT_X_START = 176;
export const GUTTER_CUTOUT_X_END = 284;
export const GUTTER_CUTOUT_Y = 710;
export const GUTTER_POCKET: Point[] = [
    { x: 284, y: 710 },
    { x: 258, y: 748 },
    { x: 202, y: 748 },
    { x: 176, y: 710 },
];
export const GUTTER_DRAIN_Y = 745; // once the ball crosses this, it's gone

export interface WindmillConfig {
    position: Point;
    radius: number;
}

// Flanking the release area, upper-mid field - static bumper obstacles (higher restitution
// than a plain pin) rather than modeled as rotating blades for now; real rotation is a later
// visual/physics polish pass, not needed to make the board playable.
export const WINDMILLS: WindmillConfig[] = [
    { position: { x: 112, y: 280 }, radius: 12 },
    { position: { x: 348, y: 280 }, radius: 12 },
];

export type TulipId = "left" | "right" | "center";

export interface TulipConfig {
    id: TulipId;
    position: Point;
    closedHalfWidth: number;
    openHalfWidth: number; // for "center", this is the primed (both side tulips open) width
}

// Two side tulips flanking center, one larger center tulip ("start chucker") below them. The
// center tulip is narrow/hard to catch unless both side tulips are open - see
// tulipCatcherHalfWidth below, which is what actually turns "state" into a physics input.
export const TULIPS: TulipConfig[] = [
    { id: "left", position: { x: 144, y: 460 }, closedHalfWidth: 11, openHalfWidth: 20 },
    { id: "right", position: { x: 316, y: 460 }, closedHalfWidth: 11, openHalfWidth: 20 },
    { id: "center", position: { x: 222, y: 563 }, closedHalfWidth: 6, openHalfWidth: 55 },
];

export function tulipCatcherHalfWidth(tulip: TulipConfig, isOpenOrPrimed: boolean): number {
    return isOpenOrPrimed ? tulip.openHalfWidth : tulip.closedHalfWidth;
}

export interface PinPosition {
    x: number;
    y: number;
}

// Nail field: built from distinct clusters (not a uniform lattice, not a sparse grid), each
// placed at a functional point - spreading the ball off the release point, guarding the
// center tulip, funneling toward each side tulip/windmill - with real open gaps between
// clusters, plus a handful of sparse stray nails in those open lanes. Deterministic (no
// randomness) so the client and physics agree without shipping coordinates over the wire.
const CLUSTER_LOCAL_OFFSETS: Point[] = [
    { x: -15, y: -5 },
    { x: -6, y: -15 },
    { x: 7, y: -12 },
    { x: 15, y: 0 },
    { x: 9, y: 13 },
    { x: -4, y: 14 },
    { x: -15, y: 6 },
    { x: 0, y: -1 },
];

// Positioned along the ball's actual downward path from the release point (396, 260) toward
// the tulip band (~460-563) and on to the gutter - each cluster gives the falling ball a
// real leftward/rightward deflection rather than just being scattered decoration.
const CLUSTER_CENTERS: Point[] = [
    { x: 368, y: 305 }, // first deflection, right below the release point
    { x: 300, y: 345 }, // feeds toward the right windmill
    { x: 150, y: 330 }, // feeds toward the left windmill
    { x: 235, y: 385 }, // splits the field toward either side tulip
    { x: 150, y: 425 }, // funnels toward the left tulip
    { x: 305, y: 420 }, // funnels toward the right tulip
    { x: 222, y: 495 }, // guards the center tulip's approach
    { x: 98, y: 550 },
    { x: 362, y: 550 },
];

const STRAY_NAILS: Point[] = [
    { x: 230, y: 240 },
    { x: 195, y: 270 },
    { x: 265, y: 270 },
    { x: 230, y: 480 },
    { x: 185, y: 520 },
    { x: 275, y: 520 },
];

// A short diagonal line of nails right where the ball first lands after release (396, 260) -
// without something directly in that initial fall line, the ball just drops straight down
// along the right wall and never gets meaningfully deflected toward the tulip field. Exported
// (unlike the other nail groups) so pachinkoPhysics.ts can give just this cluster a lower
// restitution than the rest of the nail field - see the comment there for why.
export const RELEASE_DEFLECTOR: Point[] = [
    { x: 387, y: 274 },
    { x: 380, y: 283 },
    { x: 364, y: 292 },
    { x: 346, y: 300 },
    { x: 326, y: 306 },
    { x: 300, y: 312 },
    { x: 270, y: 316 },
    { x: 236, y: 318 },
    { x: 200, y: 320 },
];

export function generateNailField(): PinPosition[] {
    const pins: PinPosition[] = [];
    for (const deflector of RELEASE_DEFLECTOR) {
        pins.push({ x: deflector.x, y: deflector.y });
    }
    for (const center of CLUSTER_CENTERS) {
        for (const offset of CLUSTER_LOCAL_OFFSETS) {
            pins.push({ x: center.x + offset.x, y: center.y + offset.y });
        }
    }
    for (const stray of STRAY_NAILS) {
        pins.push({ x: stray.x, y: stray.y });
    }
    return pins;
}

export const MIN_LAUNCH_POWER = 0;
export const MAX_LAUNCH_POWER = 100;

// The scripted rail-climb speed - deliberately NOT scaled by power anymore. It used to be
// (4 + t*10), which made a low-power shot crawl slowly up the launcher for ~2 real seconds
// before ever reaching the field - that read as broken/laggy, not "weak," since a weak *pull*
// should still be a fast, immediate mechanical action (like a real plunger - you can pull it
// back gently or hard, but releasing it is always quick either way). All of the actual power
// differentiation now lives in launchPowerToExitVelocity below; this only paces the climb
// animation. Still takes `power` (unused) so its own call sites/tests don't need to change if
// this ever needs to vary again.
export function launchPowerToRailSpeed(power: number): number {
    void power;
    return 22; // px per physics step - tuned so the rail-climb is quick at any power
}

// The free body's actual exit velocity magnitude once it leaves the rail - this is the real
// "how hard was this shot" input, independent of the rail-climb pacing above. Tuned
// empirically (see pachinkoPhysics.ts's simulateShot, and the plan doc) against this board's
// actual geometry: minimum power should only just barely crest over the release point edge
// before gravity takes it back down (a couple dozen px of rise, immediately falling into the
// release deflector nails right below); maximum power should carry the ball all the way up to
// the top boundary with enough speed left to ride along its curve rather than just bonking
// into it - a real "loop" across the top of the field before it comes back down the other
// side, not just a taller version of the same weak arc.
export function launchPowerToExitVelocity(power: number): number {
    const clamped = Math.min(MAX_LAUNCH_POWER, Math.max(MIN_LAUNCH_POWER, power));
    const t = clamped / MAX_LAUNCH_POWER;
    // 1 to 16.8 - measured empirically against buildAttemptWorld's actual gravity/wall setup.
    // The low end matters more than it looks: a test harness bug (testing raw velocities
    // below the old 3.5 floor by feeding this function a negative `power` - which the clamp
    // above silently snaps back to 0) made it look like the minimum rise was stuck at a fixed
    // value no matter what this constant was set to, when the real explanation was just that
    // power=0 always evaluates to this exact y-intercept - there's no way to get a *weaker*
    // shot than whatever this is set to, so it has to be genuinely small on its own, not tuned
    // relative to some lower baseline that doesn't actually exist. The high end caps out
    // around ~218px of rise (near the very top of the field) once velocity passes ~12, so
    // anything past that mostly shows up as more speed/energy at the top (a harder hit
    // against the boundary, more sideways travel riding its curve) rather than more rise.
    return 1 + t * 15.8;
}
