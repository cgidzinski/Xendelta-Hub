/**
 * Server-only Pachinko physics sim (matter-js). Never imported from src/client - the client
 * only replays the trajectory this produces, it never runs its own simulation, so there's no
 * cross-environment float-determinism risk to reason about (see pachinko.ts's file header
 * for the fuller "why" of this split).
 *
 * The board's actual pocket odds are decided by pachinkoOdds.pickTargetPocket() before any
 * of this runs - simulateDrop's job is only to produce a physically real trajectory that
 * happens to end in that pre-chosen pocket, via rejection sampling: run a real sim with
 * randomized launch position, launch spin, and per-pin bounciness, keep the attempt if it
 * lands in the target pocket, otherwise throw it away and try again with fresh randomness.
 * Every kept trajectory is an unmodified physics simulation - nothing is scripted or steered
 * into place. Bounded by both an attempt cap and a wall-clock cap so a request can never
 * hang; the rare case both are exhausted falls back to a short glide into the target pocket
 * (logged, so board/jitter tuning can be revisited if that ever fires more than negligibly).
 *
 * Every attempt builds fresh Matter bodies and its own Engine rather than reusing bodies
 * across attempts/requests - simulateDrop() runs fully synchronously (no `await` anywhere in
 * the loop), so within Node's single-threaded event loop no two requests' simulations can
 * ever interleave, but keeping each attempt's bodies self-contained avoids relying on that
 * property to stay correct if this is ever moved off the main thread.
 */
import Matter = require("matter-js");
import { BOARD_TOP, BOARD_BOTTOM, POCKET_FLOOR_Y, CANVAS_WIDTH, CANVAS_HEIGHT, PIN_RADIUS, BALL_RADIUS, WALL_THICKNESS, LAUNCH_Y, generatePins, pocketAt, pocketCenterX, POCKETS, PocketConfig } from "./pachinkoLayout";

export interface TrajectorySample {
    x: number;
    y: number;
    r: number; // ball rotation, radians - purely cosmetic on the client
}

export interface SimResult {
    trajectory: TrajectorySample[];
    landedPocketIndex: number;
}

const FIXED_TIMESTEP_MS = 1000 / 60;
const SAMPLE_EVERY_N_STEPS = 2; // ~30fps trajectory, half the physics step rate
const MAX_STEPS = 500; // generous upper bound - real boards settle well before this
// Pockets right next to a jackpot edge are empirically much harder for a real physics
// attempt to land in than the edge itself (a ball that gets close to a wall tends to slide
// the rest of the way to it) - measured hit rates as low as ~5% per attempt even with the
// launch bias below. 120 attempts keeps the exhausted-glide fallback rare (<1%) even for
// those pockets; each attempt is cheap (~10-15ms), so this still comfortably fits under
// MAX_WALL_CLOCK_MS in the overwhelming majority of cases.
const MAX_SIM_ATTEMPTS = 120;
const MAX_WALL_CLOCK_MS = 2000;

const pinPositions = generatePins(); // plain data, safe to share - rebuilt into Bodies fresh per attempt

// A pure "launch dead center every time, hope randomness eventually wanders into whatever
// pocket was picked" rejection sampler is impractically slow for pockets a centered launch
// rarely reaches on its own (the far edges) - MAX_SIM_ATTEMPTS would need to be huge to keep
// the exhausted-glide fallback rare for every pocket, not just the popular ones. Instead,
// each attempt's launch position is nudged toward the target pocket's side of the board
// before gravity and the pins take over - this doesn't script or fake anything about how the
// ball actually falls (every attempt is still a full, unmodified simulation, and can still
// miss the target and get rejected same as before), it's just choosing where a real launcher
// would aim for that lane, the same way a player would aim for one side of a real board.
const LAUNCH_BIAS_WEIGHT = 0.85;

function buildAttemptWorld(target: PocketConfig): { engine: Matter.Engine; ball: Matter.Body } {
    // Higher position/velocity iterations than matter-js's default (6/4) - a fast ball
    // against a thin divider is exactly the kind of fast-body/thin-wall pair standard
    // discrete collision detection can tunnel through if under-resolved, and a divider
    // failing to stop a ball is a correctness bug here (it'd land in the wrong pocket), not
    // just a visual glitch.
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 }, positionIterations: 12, velocityIterations: 10 });

    const bodies: Matter.Body[] = pinPositions.map((pin) =>
        Matter.Bodies.circle(pin.x, pin.y, PIN_RADIUS, {
            isStatic: true,
            restitution: 0.25 + Math.random() * 0.3, // per-attempt jitter - what makes repeat drops to the same pocket look distinct
            friction: 0.05,
            label: "pin",
        })
    );
    bodies.push(Matter.Bodies.rectangle(-WALL_THICKNESS / 2, CANVAS_HEIGHT / 2, WALL_THICKNESS, CANVAS_HEIGHT, { isStatic: true, label: "wall" }));
    bodies.push(Matter.Bodies.rectangle(CANVAS_WIDTH + WALL_THICKNESS / 2, CANVAS_HEIGHT / 2, WALL_THICKNESS, CANVAS_HEIGHT, { isStatic: true, label: "wall" }));
    // Pocket dividers - walls between adjacent pockets from the bottom of the pin field past
    // the floor line, so the ball settles into exactly one pocket instead of sliding along
    // the bottom. Full WALL_THICKNESS (not a thinner rail) for the same tunneling reason as
    // the higher iteration counts above.
    for (let i = 1; i < POCKETS.length; i++) {
        const x = POCKETS[i].xStart;
        bodies.push(Matter.Bodies.rectangle(x, (BOARD_BOTTOM + CANVAS_HEIGHT) / 2, WALL_THICKNESS, CANVAS_HEIGHT - BOARD_BOTTOM, { isStatic: true, label: "divider" }));
    }

    const targetX = pocketCenterX(target);
    const biasedCenter = CANVAS_WIDTH / 2 + (targetX - CANVAS_WIDTH / 2) * LAUNCH_BIAS_WEIGHT;
    const launchX = biasedCenter + (Math.random() - 0.5) * 25;
    const ball = Matter.Bodies.circle(launchX, LAUNCH_Y, BALL_RADIUS, {
        restitution: 0.4,
        friction: 0.02,
        frictionAir: 0.001,
        label: "ball",
    });
    // A small velocity nudge toward the target, on top of the position bias - keeps the
    // ball's initial motion from immediately fighting the lane it launched into.
    const launchVx = (targetX - CANVAS_WIDTH / 2) * 0.01 + (Math.random() - 0.5) * 1;
    Matter.Body.setVelocity(ball, { x: launchVx, y: 0 });
    bodies.push(ball);

    Matter.Composite.add(engine.world, bodies);
    return { engine, ball };
}

// landedPocket is null when the ball never actually reached the floor within MAX_STEPS
// (rare - e.g. wedged in a stable bounce between two pins). That's a real "this attempt
// didn't produce a result" case, not "wherever it happened to be counts" - a stuck ball's
// x could coincidentally overlap any pocket's range at that height, so crediting it there
// would be crediting a pocket the ball never actually fell into. simulateDrop's rejection
// loop treats null the same as "landed in the wrong pocket": discard and retry.
function runOneAttempt(target: PocketConfig): { trajectory: TrajectorySample[]; landedPocket: PocketConfig | null } {
    const { engine, ball } = buildAttemptWorld(target);

    const trajectory: TrajectorySample[] = [];
    let landedPocket: PocketConfig | null = null;
    for (let step = 0; step < MAX_STEPS; step++) {
        Matter.Engine.update(engine, FIXED_TIMESTEP_MS);
        if (step % SAMPLE_EVERY_N_STEPS === 0) {
            trajectory.push({ x: ball.position.x, y: ball.position.y, r: ball.angle });
        }
        if (ball.position.y >= POCKET_FLOOR_Y) {
            landedPocket = pocketAt(ball.position.x);
            trajectory.push({ x: ball.position.x, y: POCKET_FLOOR_Y, r: ball.angle });
            break;
        }
    }

    return { trajectory, landedPocket };
}

// Appends a short, smooth glide from the last real sample into the target pocket's center -
// only used on the rare exhausted-retries fallback (see file header).
function glideInto(trajectory: TrajectorySample[], target: PocketConfig): TrajectorySample[] {
    const last = trajectory[trajectory.length - 1] ?? { x: CANVAS_WIDTH / 2, y: BOARD_TOP, r: 0 };
    const targetX = (target.xStart + target.xEnd) / 2;
    const glideSteps = 10;
    const glided = [...trajectory];
    for (let i = 1; i <= glideSteps; i++) {
        const t = i / glideSteps;
        glided.push({
            x: last.x + (targetX - last.x) * t,
            y: last.y + (POCKET_FLOOR_Y - last.y) * t,
            r: last.r + t * Math.PI,
        });
    }
    return glided;
}

export function simulateDrop(targetPocketIndex: number): SimResult {
    const target = POCKETS[targetPocketIndex];
    const start = Date.now();
    for (let attempt = 0; attempt < MAX_SIM_ATTEMPTS && Date.now() - start < MAX_WALL_CLOCK_MS; attempt++) {
        const { trajectory, landedPocket } = runOneAttempt(target);
        if (landedPocket?.index === targetPocketIndex) {
            return { trajectory, landedPocketIndex: targetPocketIndex };
        }
    }

    console.warn(`pachinko: exhausted ${MAX_SIM_ATTEMPTS} sim attempts / ${MAX_WALL_CLOCK_MS}ms targeting pocket ${targetPocketIndex} - falling back to a guided glide`);
    const { trajectory } = runOneAttempt(target);
    return { trajectory: glideInto(trajectory, target), landedPocketIndex: targetPocketIndex };
}
