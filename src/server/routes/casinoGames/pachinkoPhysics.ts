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
    launchPowerToRailSpeed,
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
const SAMPLE_EVERY_N_STEPS = 2; // ~30fps trajectory
const MAX_STEPS = 500; // generous upper bound for the free-body phase
const nailPositions = generateNailField(); // plain data, rebuilt into fresh Bodies every shot

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
        bodies.push(
            Matter.Bodies.circle(pin.x, pin.y, PIN_RADIUS, {
                isStatic: true,
                restitution: 0.3 + Math.random() * 0.3, // per-shot jitter - what makes repeat drops look distinct
                friction: 0.05,
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

    const ball = Matter.Bodies.circle(RELEASE_POINT.x, RELEASE_POINT.y, BALL_RADIUS, {
        restitution: 0.45,
        friction: 0.02,
        frictionAir: 0.001,
        label: "ball",
    });
    bodies.push(ball);

    Matter.Composite.add(engine.world, bodies);
    return { engine, ball };
}

// The rail phase is scripted, not simulated - see the file header. Returns the sample points
// (already at the ~30fps sampling rate) and the exit velocity to hand off to the free body.
function railTrajectory(launchPower: number): { samples: TrajectorySample[]; exitSpeed: number } {
    const speed = launchPowerToRailSpeed(launchPower);
    const distance = LAUNCHER_POSITION.y - RELEASE_POINT.y;
    const totalSteps = Math.max(1, Math.round(distance / speed));
    const samples: TrajectorySample[] = [];
    for (let step = 0; step <= totalSteps; step += SAMPLE_EVERY_N_STEPS) {
        const t = step / totalSteps;
        const y = LAUNCHER_POSITION.y - t * distance;
        samples.push({ x: RAIL_PATH[0].x, y, r: (step * speed) / BALL_RADIUS });
    }
    return { samples, exitSpeed: speed };
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

// Short scripted glide from wherever the ball fell through the gutter cutout down to the
// drain, for visual continuity - purely cosmetic, the outcome is already decided by the time
// this runs.
function gutterPocketTrajectory(lastSample: TrajectorySample): TrajectorySample[] {
    const drain = GUTTER_POCKET[Math.floor(GUTTER_POCKET.length / 2)] ?? { x: lastSample.x, y: GUTTER_DRAIN_Y };
    const steps = 6;
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
    const { samples: railSamples, exitSpeed } = railTrajectory(launchPower);

    const { engine, ball } = buildAttemptWorld(tulipState);
    Matter.Body.setVelocity(ball, { x: (Math.random() - 0.5) * 1.2, y: -exitSpeed * 0.2 });

    const freeBodySamples: TrajectorySample[] = [];
    let outcome: PachinkoOutcome | null = null;

    for (let step = 0; step < MAX_STEPS; step++) {
        Matter.Engine.update(engine, FIXED_TIMESTEP_MS);

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
        if (step % SAMPLE_EVERY_N_STEPS === 0) {
            freeBodySamples.push({ x: ball.position.x, y: ball.position.y, r: ball.angle });
        }
    }

    // The ball never resolved within the step cap (rare - e.g. wedged in a stable bounce) -
    // treat it as a gutter rather than looping forever.
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
