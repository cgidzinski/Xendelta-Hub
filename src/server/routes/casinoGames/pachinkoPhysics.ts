/**
 * Server-only Pachinko physics sim (matter-js). Never imported from src/client - the client
 * only replays the trajectory this produces, it never runs its own simulation.
 *
 * There's no pre-selected target outcome here (unlike Plinko, and unlike this game's own
 * first draft). The player's launch power is a genuine physics input - it's converted to an
 * initial rail speed, the ball is driven along the scripted rail path (see pachinkoLayout.ts
 * for why that phase is scripted rather than simulated: a fast body against thin curved rail
 * geometry is exactly the kind of thing that can tunnel through under normal discrete
 * collision detection), and once it reaches the release point it becomes a real, unmodified
 * free body - gravity, nail clusters with per-shot restitution jitter, windmill bumpers,
 * tulip catchers sized by whatever state the caller passed in. Whatever it actually hits is
 * the outcome. A small amount of honest per-shot randomness (nail jitter, a touch of launch
 * noise) means a fixed power value doesn't deterministically reproduce the same outcome.
 */
import Matter = require("matter-js");
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    BOUNDARY_RIGHT_POINTS,
    BOUNDARY_LEFT_POINTS,
    RAIL_PATH,
    RELEASE_POINT,
    LAUNCHER_POSITION,
    BALL_RADIUS,
    PIN_RADIUS,
    WINDMILLS,
    TULIPS,
    TulipConfig,
    tulipCatcherHalfWidth,
    generateNailField,
    RELEASE_DEFLECTOR,
    launchPowerToRailSpeed,
    launchPowerToExitVelocity,
    GUTTER_POCKET,
    GUTTER_DRAIN_Y,
    GUTTER_CUTOUT_Y,
    Point,
} from "./pachinkoLayout";

export interface TrajectorySample {
    x: number;
    y: number;
    r: number; // ball rotation, radians - purely cosmetic on the client
}

export type PachinkoOutcome = "gutter" | "tulipLeft" | "tulipRight" | "tulipCenter";

export interface TulipState {
    leftOpen: boolean;
    rightOpen: boolean;
}

export interface ShotResult {
    trajectory: TrajectorySample[];
    outcome: PachinkoOutcome;
}

const FIXED_TIMESTEP_MS = 1000 / 60;
const SUBSTEPS = 4; // engine updates per "step" below, at 1/4 the timestep each - see the tunneling comment on the update loop in simulateShot
const SAMPLE_EVERY_N_STEPS = 2; // ~30fps trajectory
const MAX_STEPS = 500; // generous upper bound for the free-body phase
const STALL_CHECK_INTERVAL = 20; // steps between displacement checkpoints
const STALL_DISTANCE = 12; // px - net movement below this since the last checkpoint means "not making progress," regardless of instantaneous speed
const STALL_MIN_Y = 150; // only treat a stall as "settled" below this - excludes just the apex of a strong launch's rise (a brief, expected near-zero-net-movement moment right at the top of the arc), not the whole rest of the field the way a higher cutoff did
const nailPositions = generateNailField(); // plain data, rebuilt into fresh Bodies every shot
const deflectorKeys = new Set(RELEASE_DEFLECTOR.map((p) => `${p.x},${p.y}`)); // for the restitution branch below

function outcomeForTulip(id: TulipConfig["id"]): PachinkoOutcome {
    return id === "left" ? "tulipLeft" : id === "right" ? "tulipRight" : "tulipCenter";
}

function isTulipOpen(tulip: TulipConfig, state: TulipState): boolean {
    if (tulip.id === "left") return state.leftOpen;
    if (tulip.id === "right") return state.rightOpen;
    return state.leftOpen && state.rightOpen; // center is "open" (primed) only when both sides are
}

// One thin static rectangle per consecutive point pair - the boundary's collision geometry.
// Built once per shot (fresh bodies, same reasoning as the pins below) from the exact
// polylines the client draws, split into two separate point lists so the gutter cutout at
// the bottom is a genuine gap: no segment connects BOUNDARY_RIGHT_POINTS' last point to
// BOUNDARY_LEFT_POINTS' first point.
function buildWallSegments(points: Point[]): Matter.Body[] {
    const segments: Matter.Body[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        // 8, not the original 3 - thin enough that a fast free body can cross it within a
        // single collision check and tunnel straight through undetected (confirmed
        // empirically, pre-dates any of today's tuning). 8 still clears the nail field: the
        // closest nail to this wall (the release deflector's first pin, x=393) sits just
        // outside this thickness's ~396 inner edge - a much thicker wall (24 was tried) pulls
        // that inner edge past x=393 entirely and buries the nail inside solid wall geometry,
        // which is worse than the tunneling it was meant to fix.
        segments.push(Matter.Bodies.rectangle(midX, midY, length, 3, { isStatic: true, angle, label: "wall" }));
    }
    return segments;
}

function buildAttemptWorld(tulipState: TulipState): { engine: Matter.Engine; ball: Matter.Body } {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 }, positionIterations: 12, velocityIterations: 10 });

    const bodies: Matter.Body[] = [
        ...buildWallSegments(BOUNDARY_RIGHT_POINTS),
        ...buildWallSegments(BOUNDARY_LEFT_POINTS),
    ];

    for (const pin of nailPositions) {
        // The release deflector's job is redirection (see its own comment in
        // pachinkoLayout.ts), not bounce - it's meant to nudge a falling ball left toward the
        // tulip field, not fling it back upward. Deliberately less bouncy/more grabby than the
        // rest of the nail field so it does that job cleanly regardless of how a shot arrives,
        // without contributing its own extra "bounce" on top of whatever the shot's own
        // strength already produced.
        const isDeflector = deflectorKeys.has(`${pin.x},${pin.y}`);
        bodies.push(
            Matter.Bodies.circle(pin.x, pin.y, PIN_RADIUS, {
                isStatic: true,
                restitution: isDeflector ? 0.02 + Math.random() * 0.04 : 0.3 + Math.random() * 0.3, // per-shot jitter - what makes repeat drops look distinct
                friction: isDeflector ? 0.3 : 0.05,
                label: "pin",
            })
        );
    }

    for (const windmill of WINDMILLS) {
        bodies.push(
            Matter.Bodies.circle(windmill.position.x, windmill.position.y, windmill.radius, {
                isStatic: true,
                restitution: 0.6,
                friction: 0.02,
                label: "windmill",
            })
        );
    }

    // 0.18, not the original 0.45 - matter-js resolves a collision's restitution as
    // max(bodyA.restitution, bodyB.restitution), so the ball's own value is a floor under
    // every collision in the field regardless of what it hits. Lowered to stay under the
    // deflector's own low restitution above (0.02-0.06) so that nail's dampening actually
    // takes effect, while every other nail in the field (0.3-0.6) still wins that max()
    // comparison exactly as before - this doesn't change how bouncy the rest of the field, or
    // a strong shot's behavior in it, feels.
    const ball = Matter.Bodies.circle(RELEASE_POINT.x, RELEASE_POINT.y, BALL_RADIUS, {
        restitution: 0.18,
        friction: 0.02,
        frictionAir: 0.001,
        label: "ball",
    });
    bodies.push(ball);

    Matter.Composite.add(engine.world, bodies);
    return { engine, ball };
}

// The rail phase is scripted, not simulated - see the file header. Its speed no longer
// depends on launchPower (see launchPowerToRailSpeed) - only the sample points are returned
// now, not an exit speed; the free body's actual exit velocity is a separate, independently
// tuned value (launchPowerToExitVelocity), not derived from how fast this climb animates.
function railTrajectory(launchPower: number): { samples: TrajectorySample[] } {
    const speed = launchPowerToRailSpeed(launchPower);
    const distance = LAUNCHER_POSITION.y - RELEASE_POINT.y;
    const totalSteps = Math.max(1, Math.round(distance / speed));
    const samples: TrajectorySample[] = [];
    for (let step = 0; step <= totalSteps; step += SAMPLE_EVERY_N_STEPS) {
        const t = step / totalSteps;
        const y = LAUNCHER_POSITION.y - t * distance;
        samples.push({ x: RAIL_PATH[0].x, y, r: (step * speed) / BALL_RADIUS });
    }
    return { samples };
}

function tulipHit(ball: Matter.Body, tulipState: TulipState): TulipConfig | null {
    for (const tulip of TULIPS) {
        const halfWidth = tulipCatcherHalfWidth(tulip, isTulipOpen(tulip, tulipState));
        const withinX = Math.abs(ball.position.x - tulip.position.x) <= halfWidth;
        const withinY = Math.abs(ball.position.y - tulip.position.y) <= 8;
        if (withinX && withinY) {
            return tulip;
        }
    }
    return null;
}

// Scripted glide from wherever the ball actually ended up (through the real cutout, or
// wherever the stall check above gave up on it - see simulateShot) down to the drain, for
// visual continuity - purely cosmetic, the outcome is already decided by the time this runs.
// Step count scales with distance (a fixed 6 steps regardless of how far the glide has to
// cover looked fine for a ball that fell right through the cutout, but read as an instant
// teleport/slide for a weak shot that stalled well away from it - see the stall check's own
// comment) so it always plays back as "rolling" at roughly the same speed instead.
function gutterPocketTrajectory(lastSample: TrajectorySample): TrajectorySample[] {
    const drain = GUTTER_POCKET[Math.floor(GUTTER_POCKET.length / 2)] ?? { x: lastSample.x, y: GUTTER_DRAIN_Y };
    const distance = Math.hypot(drain.x - lastSample.x, GUTTER_DRAIN_Y - lastSample.y);
    const steps = Math.max(6, Math.round(distance / 15));
    const samples: TrajectorySample[] = [];
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        samples.push({
            x: lastSample.x + (drain.x - lastSample.x) * t,
            y: lastSample.y + (GUTTER_DRAIN_Y - lastSample.y) * t,
            r: lastSample.r + t * Math.PI,
        });
    }
    return samples;
}

export function simulateShot(launchPower: number, tulipState: TulipState): ShotResult {
    const { samples: railSamples } = railTrajectory(launchPower);
    const exitVelocity = launchPowerToExitVelocity(launchPower);

    const { engine, ball } = buildAttemptWorld(tulipState);
    // See launchPowerToExitVelocity's own comment for the tuning target: min power should
    // only just crest the release point before gravity pulls it back; max power should carry
    // enough speed to ride the top boundary's curve across to the other side instead of just
    // arcing a bit higher and falling straight back.
    Matter.Body.setVelocity(ball, { x: (Math.random() - 0.5) * 1.2, y: -exitVelocity });

    const freeBodySamples: TrajectorySample[] = [];
    let outcome: PachinkoOutcome | null = null;
    let stallCheckpoint = { x: ball.position.x, y: ball.position.y };
    let stepsSinceCheckpoint = 0;

    for (let step = 0; step < MAX_STEPS; step++) {
        // Several smaller updates instead of one big one - matter-js does discrete (not
        // continuous) collision detection, so a fast-moving ball can cross a thin wall
        // segment entirely within a single update and never register the collision at all
        // (confirmed empirically: even before today's power changes, occasional shots could
        // already tunnel out of the field this way). Splitting each step into SUBSTEPS finer
        // updates shrinks how far the ball can move per collision check, without changing the
        // sampling rate or the total simulated time.
        for (let sub = 0; sub < SUBSTEPS; sub++) {
            Matter.Engine.update(engine, FIXED_TIMESTEP_MS / SUBSTEPS);
        }

        const hit = tulipHit(ball, tulipState);
        if (hit) {
            outcome = outcomeForTulip(hit.id);
            freeBodySamples.push({ x: ball.position.x, y: ball.position.y, r: ball.angle });
            break;
        }
        if (ball.position.y > GUTTER_CUTOUT_Y + 10) {
            outcome = "gutter";
            freeBodySamples.push({ x: ball.position.x, y: ball.position.y, r: ball.angle });
            break;
        }

        // A weak/settled ball in the lower field can get stuck without ever actually crossing
        // the y-threshold above - either genuinely at rest, or rattling in a small pocket
        // between nails with just enough residual bounce to never look "at rest" from
        // instantaneous speed alone (a pure velocity check missed this - it kept dipping low
        // enough to look stalled, then ticking back up on the next micro-bounce before the
        // stall counter ever finished). Checking net displacement over a whole window instead
        // catches both cases the same way: if it hasn't actually gone anywhere in
        // STALL_CHECK_INTERVAL steps, it isn't making progress toward a tulip or the gutter
        // line on its own. Short of a tulip catch, that's always eventually a miss, but
        // waiting for MAX_STEPS to force the issue meant it could sit there for several real
        // seconds before the gutter glide even started (confirmed empirically - disproportionately
        // common on weak launches, which have the least energy left by the time they reach the
        // lower field). STALL_MIN_Y keeps this from misfiring on a ball that's legitimately
        // hanging near the top of its arc after a strong launch, which isn't stuck at all.
        stepsSinceCheckpoint++;
        if (stepsSinceCheckpoint >= STALL_CHECK_INTERVAL) {
            const moved = Math.hypot(ball.position.x - stallCheckpoint.x, ball.position.y - stallCheckpoint.y);
            if (ball.position.y > STALL_MIN_Y && moved < STALL_DISTANCE) {
                outcome = "gutter";
                freeBodySamples.push({ x: ball.position.x, y: ball.position.y, r: ball.angle });
                break;
            }
            stallCheckpoint = { x: ball.position.x, y: ball.position.y };
            stepsSinceCheckpoint = 0;
        }

        if (step % SAMPLE_EVERY_N_STEPS === 0) {
            freeBodySamples.push({ x: ball.position.x, y: ball.position.y, r: ball.angle });
        }
    }

    // The ball never resolved within the step cap (rarer now that the stall check above
    // catches most of what used to end up here - e.g. wedged in a stable bounce well above
    // STALL_MIN_Y) - treat it as a gutter rather than looping forever.
    if (!outcome) {
        outcome = "gutter";
    }

    const trajectory = [...railSamples, ...freeBodySamples];
    if (outcome === "gutter") {
        const last = trajectory[trajectory.length - 1];
        trajectory.push(...gutterPocketTrajectory(last));
    }

    return { trajectory, outcome };
}

export { CANVAS_WIDTH, CANVAS_HEIGHT };
