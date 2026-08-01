/**
 * Isomorphic Pachinko physics sim (matter-js) - runs identically on the client (instant local
 * preview, see PachinkoBoard.tsx's sim worker) and the server (the authoritative replay, see
 * pachinko.ts's /launch/confirm). Both sides call this exact same function with the exact same
 * seed, so both must get the exact same result - see prng.ts's own header for why a seeded RNG
 * is threaded through instead of bare Math.random(), and matter-js itself has no other source of
 * internal randomness in its collision-solving pipeline (Common.random/shuffle/choose exist but
 * are only ever used for its own default renderer's body fill colors, never physics).
 *
 * The server is always the one source of truth for what a shot actually paid - the client's own
 * run of this function is only ever a preview so the ball can start flying the instant it's
 * fired, never something the server trusts. If the two ever disagree (engine-level floating
 * point drift between environments is the one known risk this can't fully rule out), the
 * server's own replay wins outright.
 *
 * There's no pre-selected target outcome here (unlike Plinko). The player's launch power is a
 * genuine physics input - it's converted to an initial rail speed, the ball is driven along the
 * scripted rail path (see pachinkoLayout.ts's RAIL_CLIMB_PATH for why that phase is scripted
 * rather than simulated: a fast body against thin curved rail geometry is exactly the kind of
 * thing that can tunnel through under normal discrete collision detection), and once it reaches
 * the release point it becomes a real, unmodified free body - gravity, nail clusters with
 * per-shot restitution jitter, windmill bumpers, and every scoring pocket, which is a real
 * physical cup (open top only - see buildPocketWalls), not just an invisible detection zone.
 * Whatever the ball actually falls into is the outcome; a ball that clips a pocket's side wall
 * bounces off it like anything else in the field, it doesn't "catch" from the side. Gate state
 * (chucker/attacker/jackpot open or closed) never changes the board's physical geometry, so it
 * never changes where a ball goes - it only decides whether entering one of those three pockets
 * SCORES. See simulateShot's own header for why that separation matters so much.
 * A small amount of honest per-shot randomness (nail jitter, a touch of launch noise),
 * drawn from the shot's own seeded RNG, means a fixed power value doesn't deterministically
 * reproduce the same outcome shot to shot - but the SAME seed always does, which is the whole
 * point.
 */
// Plain ESM-style import (not `import X = require(...)`) so this file compiles cleanly under
// both the server's CommonJS-interop build and the client's pure-ESM Vite bundle - matter-js
// ships a UMD build, so this works in both a browser bundle and Node either way.
import * as Matter from "matter-js";
import { Rng } from "./prng";
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    BOUNDARY_RIGHT_POINTS,
    BOUNDARY_LEFT_POINTS,
    RAIL_CLIMB_PATH,
    RELEASE_POINT,
    RELEASE_TANGENT,
    BALL_RADIUS,
    PIN_RADIUS,
    WINDMILLS,
    TULIPS,
    JACKPOT,
    ATTACKER,
    BONUS_POCKETS,
    CHUCKER,
    FixedPocket,
    POCKET_DEPTH,
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
    // Spinner angles per windmill, snapped each sample for client-side replay.
    // Index matches WINDMILLS order. Only present when there's at least one spinner.
    spinnerAngles?: number[];
}

export type PachinkoOutcome = "gutter" | "tulipLeft" | "tulipRight" | "jackpot" | "bonusLeft" | "bonusRight" | "chucker" | "attacker";

export interface ShotResult {
    trajectory: TrajectorySample[];
    outcome: PachinkoOutcome;
}

const FIXED_TIMESTEP_MS = 1000 / 60;
const SUBSTEPS = 4; // engine updates per "step" below, at 1/4 the timestep each - see the tunneling comment on the update loop in simulateShot
const SAMPLE_EVERY_N_STEPS = 2; // ~30fps trajectory

// How much real flight time one trajectory sample represents once the client replays it (see
// PachinkoBoard.tsx's own FRAME_MS, which plays trajectories back at this same ~30fps rate).
// Exported so pachinko.ts can work out how long a ball's flight will actually take to play out
// client-side, from nothing but the length of the trajectory this file already returns it.
export const TRAJECTORY_SAMPLE_MS = FIXED_TIMESTEP_MS * SAMPLE_EVERY_N_STEPS;
const MAX_STEPS = 500; // generous upper bound for the free-body phase
const STALL_CHECK_INTERVAL = 20; // steps between displacement checkpoints
const STALL_DISTANCE = 12; // px - net movement below this since the last checkpoint means "not making progress," regardless of instantaneous speed
const STALL_MIN_Y = 95; // only treat a stall as "settled" below this - excludes the apex of a strong launch's rise (release point sits at y~89, top boundary at y~40 - this covers that whole zone with a little margin, same reasoning as the original board, just rescaled to the new geometry)
const nailPositions = generateNailField(); // plain data, rebuilt into fresh Bodies every shot
const deflectorKeys = new Set(RELEASE_DEFLECTOR.map((p) => `${p.x},${p.y}`)); // for the restitution branch below
// Bonus pockets and tulips both use "left"/"right" ids (matching the client's own short-form
// usage) - ALL_POCKETS exists only for buildPocketWalls below, which doesn't care about outcome
// mapping. checkPocketHit deliberately checks each category in its own explicit loop/branch
// instead of flattening into one generic id lookup, so "left" is never ambiguous between a
// bonus pocket and a tulip.
const ALL_POCKETS: FixedPocket[] = [...BONUS_POCKETS, CHUCKER, ATTACKER, ...TULIPS, JACKPOT];

// One thin static rectangle per consecutive point pair - the boundary's collision geometry.
// Built once per shot (fresh bodies, same reasoning as the pins below) from the exact polylines
// the client draws, split into two separate point lists so the gutter cutout at the bottom is a
// genuine gap: no segment connects BOUNDARY_RIGHT_POINTS' last point to BOUNDARY_LEFT_POINTS'
// first point. Thickness is 3 - thin enough that a fast free body can cross it within a single
// collision check and tunnel straight through undetected without the SUBSTEPS splitting below,
// but thick enough to clear the nail field's own collision geometry without burying any pin
// inside solid wall (the generated grid keeps a real, derived-from-the-boundary-formula gap from
// the glass on both halves of this board - see pachinkoLayout.ts's generateNailField).
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

// The three pockets whose scoring is gated by round state - the chucker (closed while the
// attacker it opens is still running), the attacker (closed until a chucker catch opens it), and
// the jackpot (unprimed until both tulips are open). Every other pocket always both exists and
// scores. See buildPocketWalls for why these three are built without a floor.
const GATED_POCKET_IDS = new Set(["chucker", "attacker", "jackpot"]);

// A pocket is a real physical cup, not just a detection zone: left/right walls, plus a floor for
// the ungated pockets. A ball can only ever be inside one by having fallen in through the open
// top - hitting a side wall bounces it away like any other obstacle, it can't "jump in" sideways.
//
// The three GATED pockets deliberately get NO floor, whatever their current state, which is what
// makes a ball's whole trajectory independent of gate state (see simulateShot's own header). They
// still get their side walls, so the field's geometry - and therefore every ball's path - is
// exactly the same on every shot, no matter which gates happen to be open. A gated pocket that's
// currently CLOSED behaves as it always has: the ball falls through the empty mouth and carries
// on down the board. A gated pocket that's currently OPEN catches the ball the moment it enters
// the mouth (see checkPocketHit), and the trajectory is truncated right there - so the floor that
// would have stopped it is never reached and never needed. Only a floor could make the path
// itself depend on a gate, so not building one is the whole trick.
function buildPocketWalls(pocket: FixedPocket): Matter.Body[] {
    const top = pocket.position.y - POCKET_DEPTH / 2;
    const bottom = pocket.position.y + POCKET_DEPTH / 2;
    const left = pocket.position.x - pocket.halfWidth;
    const right = pocket.position.x + pocket.halfWidth;
    const wallOptions = { isStatic: true, restitution: 0.55, friction: 0.05, label: "pocket-wall" };
    const walls = [
        Matter.Bodies.rectangle(left, (top + bottom) / 2, 2, POCKET_DEPTH, wallOptions),
        Matter.Bodies.rectangle(right, (top + bottom) / 2, 2, POCKET_DEPTH, wallOptions),
    ];
    if (!GATED_POCKET_IDS.has(pocket.id)) {
        walls.push(Matter.Bodies.rectangle((left + right) / 2, bottom, right - left, 2, wallOptions));
    }
    return walls;
}

// Takes no gate flags at all - that's the point. Every shot builds the identical world, so the
// ball's path is a pure function of (seed, launchPower). See simulateShot's own header.
function buildAttemptWorld(rng: Rng): { engine: Matter.Engine; ball: Matter.Body; spinnerBodies: Matter.Body[] } {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 }, positionIterations: 12, velocityIterations: 10 });

    const bodies: Matter.Body[] = [
        ...buildWallSegments(BOUNDARY_RIGHT_POINTS),
        ...buildWallSegments(BOUNDARY_LEFT_POINTS),
        ...ALL_POCKETS.flatMap(buildPocketWalls),
    ];

    for (const pin of nailPositions) {
        // The release deflector's job is redirection, not bounce - it's meant to nudge a
        // falling ball leftward toward the tulip field, not fling it back upward. Deliberately
        // less bouncy/more grabby than the rest of the nail field so it does that job cleanly
        // regardless of how a shot arrives, without contributing its own extra "bounce" on top
        // of whatever the shot's own strength already produced.
        const isDeflector = deflectorKeys.has(`${pin.x},${pin.y}`);
        bodies.push(
            Matter.Bodies.circle(pin.x, pin.y, PIN_RADIUS, {
                isStatic: true,
                restitution: isDeflector ? 0.02 + rng() * 0.04 : 0.3 + rng() * 0.3, // per-shot jitter - what makes repeat drops look distinct
                friction: isDeflector ? 0.3 : 0.05,
                label: "pin",
            })
        );
    }

    // Spinners: dynamic rotating bodies pinned at center. Each spinner is a circle that
    // rotates freely, deflecting balls unpredictably - a real machine's roulette wheels.
    const spinnerBodies: Matter.Body[] = [];
    for (const windmill of WINDMILLS) {
        const spinner = Matter.Bodies.circle(windmill.position.x, windmill.position.y, windmill.radius, {
            restitution: 0.5,
            friction: 0.02,
            frictionAir: 0,
            inertia: Infinity, // never slows down
            label: "spinner",
        });
        // Pin at center so it rotates in place without drifting
        const constraint = Matter.Constraint.create({
            pointA: { x: windmill.position.x, y: windmill.position.y },
            bodyB: spinner,
            pointB: { x: 0, y: 0 },
            length: 0,
            stiffness: 1,
        });
        // Give it an initial spin - random direction so each shot feels different
        Matter.Body.setAngularVelocity(spinner, (rng() > 0.5 ? 1 : -1) * (0.03 + rng() * 0.04));
        bodies.push(spinner);
        spinnerBodies.push(spinner);
        Matter.Composite.add(engine.world, constraint);
    }

    // 0.25, not a higher value - matter-js resolves a collision's restitution as
    // max(bodyA.restitution, bodyB.restitution) and its friction as min(bodyA, bodyB) (Pair.js:69-71),
    // so the ball's own values are a floor under the bounce and a ceiling under the grip of every
    // collision in the field, regardless of what it hits.
    //
    // Which means the release deflector's special-casing above is currently INERT, and the comment
    // here used to claim the opposite. 0.25 is 4-12x ABOVE the deflector's 0.02-0.06, so it wins
    // that max() and the deflector bounces exactly like an ordinary pin; its friction 0.3 loses the
    // min() to the ball's 0.02 just the same. The ordinary nails (0.3-0.6) do win their max(), so
    // the general field behaves as written - only the deflector's "less bouncy, more grabby"
    // characterisation does nothing.
    //
    // Left as-is deliberately rather than quietly repaired: a static pin can never dampen a
    // bouncier ball under max(), so making the deflector's intent real means lowering the BALL's
    // restitution, which moves every trajectory on the board and forces a full re-tune of both
    // pachinkoPayoutTuning.ts and pachinkoReachability.ts. That's a real decision worth making on
    // its own, not a rider on an unrelated fix. Flagged here so the next person reaching for "just
    // tune the pin material" knows that lever is disconnected before they pull it.
    const ball = Matter.Bodies.circle(RELEASE_POINT.x, RELEASE_POINT.y, BALL_RADIUS, {
        restitution: 0.25,
        friction: 0.02,
        frictionAir: 0.001,
        label: "ball",
    });
    bodies.push(ball);

    Matter.Composite.add(engine.world, bodies);
    return { engine, ball, spinnerBodies };
}

// The rail phase is scripted, not simulated - see the file header. Walks RAIL_CLIMB_PATH (a
// curved polyline now, not a straight vertical line) by arc length, using the same
// power-independent climb speed the original straight-rail board used.
function railTrajectory(launchPower: number): { samples: TrajectorySample[] } {
    const speed = launchPowerToRailSpeed(launchPower);

    let totalLength = 0;
    const segLengths: number[] = [];
    for (let i = 0; i < RAIL_CLIMB_PATH.length - 1; i++) {
        const len = Math.hypot(RAIL_CLIMB_PATH[i + 1].x - RAIL_CLIMB_PATH[i].x, RAIL_CLIMB_PATH[i + 1].y - RAIL_CLIMB_PATH[i].y);
        segLengths.push(len);
        totalLength += len;
    }

    const totalSteps = Math.max(1, Math.round(totalLength / speed));
    const samples: TrajectorySample[] = [];
    for (let step = 0; step <= totalSteps; step += SAMPLE_EVERY_N_STEPS) {
        const targetDistance = (step / totalSteps) * totalLength;
        let travelled = 0;
        let point = RAIL_CLIMB_PATH[0];
        for (let i = 0; i < segLengths.length; i++) {
            if (travelled + segLengths[i] >= targetDistance || i === segLengths.length - 1) {
                const remaining = segLengths[i] > 0 ? (targetDistance - travelled) / segLengths[i] : 0;
                const a = RAIL_CLIMB_PATH[i];
                const b = RAIL_CLIMB_PATH[i + 1];
                point = { x: a.x + (b.x - a.x) * Math.min(1, remaining), y: a.y + (b.y - a.y) * Math.min(1, remaining) };
                break;
            }
            travelled += segLengths[i];
        }
        samples.push({ x: point.x, y: point.y, r: (targetDistance * speed) / BALL_RADIUS });
    }
    return { samples };
}

// The real "catch" check - every pocket has physical side walls (buildPocketWalls), so a ball can
// only ever be within this x/y window by having actually entered through the open top, so this
// can just be a plain window check, no velocity-direction heuristic needed.
//
// This is now the ONLY place gate state has any effect at all (via checkPocketHit's flags below).
// A gated pocket has no floor, so the ball passes right through its mouth window - which means
// this window has to be sampled finely enough that a fast ball can't skip clean over it between
// two checks. That's why the simulation loop calls checkPocketHit once per SUBSTEP rather than
// once per step: per-substep displacement is already well under the 3px boundary-wall thickness
// (that's what SUBSTEPS exists for), so an 18px-deep pocket window gets sampled several times
// over, and a catch can't be missed.
function withinPocket(ball: Matter.Body, pocket: FixedPocket): boolean {
    return Math.abs(ball.position.x - pocket.position.x) <= pocket.halfWidth && Math.abs(ball.position.y - pocket.position.y) <= POCKET_DEPTH / 2;
}

function checkPocketHit(ball: Matter.Body, chuckerActive: boolean, attackerActive: boolean, jackpotActive: boolean): PachinkoOutcome | null {
    for (const pocket of BONUS_POCKETS) {
        if (withinPocket(ball, pocket)) {
            return pocket.id === "left" ? "bonusLeft" : "bonusRight";
        }
    }
    if (chuckerActive && withinPocket(ball, CHUCKER)) {
        return "chucker";
    }
    if (attackerActive && withinPocket(ball, ATTACKER)) {
        return "attacker";
    }
    for (const tulip of TULIPS) {
        if (withinPocket(ball, tulip)) {
            return tulip.id === "left" ? "tulipLeft" : "tulipRight";
        }
    }
    if (jackpotActive && withinPocket(ball, JACKPOT)) {
        return "jackpot";
    }
    return null;
}

// Scripted glide from wherever the ball actually ended up down to the drain, for visual
// continuity - purely cosmetic, the outcome is already decided by the time this runs. Step
// count scales with distance so it always plays back as "rolling" at roughly the same speed
// regardless of how far the glide has to cover.
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

// The ball's PATH is a pure function of (launchPower, rng) - the gate flags do not affect it at
// all, and deliberately so. Every shot simulates the identical board (see buildAttemptWorld /
// buildPocketWalls); the flags only decide whether entering one of the three gated pockets counts
// as a catch (see checkPocketHit). That's what makes the client's local preview and the server's
// authoritative replay physically identical even if the two ever disagree about a gate: the ball
// always visibly goes exactly where the server scores it, and at worst they'd differ over whether
// a landing paid - never over where the ball went. An earlier design removed a closed pocket's
// walls entirely, which meant one boolean could relocate a ball to a completely different pocket
// (measured: ~9% of all shots, and 24-34% in the low-power band, purely from the attacker's 64px
// mouth appearing or vanishing) - that was the cause of pockets seeming to fire at random.
//
// chuckerActive defaults true (the chucker scores most of the time), the caller only passes false
// while the attacker it opens is still running. attackerActive and jackpotActive both default
// false (mirror image - the attacker starts every round closed until a chucker catch opens it,
// and the jackpot starts every round unprimed until both tulips are open).
//
// `rng` defaults to Math.random for every caller that doesn't care about reproducing a shot
// (the RTP tuning script, the payout tests) - the seeded batch-replay flow (pachinko.ts,
// the client sim worker) is the only caller that ever passes a real seeded one in, via
// mulberry32(seed) (see prng.ts).
export function simulateShot(launchPower: number, chuckerActive = true, attackerActive = false, jackpotActive = false, rng: Rng = Math.random): ShotResult {
    const { samples: railSamples } = railTrajectory(launchPower);
    const exitVelocity = launchPowerToExitVelocity(launchPower);

    const { engine, ball, spinnerBodies } = buildAttemptWorld(rng);
    // Velocity direction is RELEASE_TANGENT - tangent to the boundary curve at the release
    // point - not a fixed straight-up vector, so the ball leaves the rail already riding the
    // same arc as the glass (see launchPowerToExitVelocity's own comment for the magnitude
    // tuning target). A small perpendicular jitter is layered on top for per-shot variety, same
    // spirit as the original board's own small x-jitter.
    const jitter = (rng() - 0.5) * 1.2;
    const perpX = -RELEASE_TANGENT.y;
    const perpY = RELEASE_TANGENT.x;
    Matter.Body.setVelocity(ball, {
        x: RELEASE_TANGENT.x * exitVelocity + perpX * jitter,
        y: RELEASE_TANGENT.y * exitVelocity + perpY * jitter,
    });

    const freeBodySamples: TrajectorySample[] = [];
    let outcome: PachinkoOutcome | null = null;
    let stallCheckpoint = { x: ball.position.x, y: ball.position.y };
    let stepsSinceCheckpoint = 0;

    const sampleSpinnerAngles = (): number[] | undefined =>
        spinnerBodies.length > 0 ? spinnerBodies.map((s) => s.angle) : undefined;

    const pushSample = () => {
        freeBodySamples.push({ x: ball.position.x, y: ball.position.y, r: ball.angle, spinnerAngles: sampleSpinnerAngles() });
    };

    for (let step = 0; step < MAX_STEPS && !outcome; step++) {
        // Several smaller updates instead of one big one - matter-js does discrete (not
        // continuous) collision detection, so a fast-moving ball can cross a thin wall segment
        // entirely within a single update and never register the collision at all. Splitting
        // each step into SUBSTEPS finer updates shrinks how far the ball can move per collision
        // check, without changing the sampling rate or the total simulated time.
        for (let sub = 0; sub < SUBSTEPS; sub++) {
            Matter.Engine.update(engine, FIXED_TIMESTEP_MS / SUBSTEPS);
            // Checked per SUBSTEP, not per step - a gated pocket has no floor to stop the ball,
            // so its mouth window has to be sampled finely enough that a fast ball can't skip
            // clean over it between checks. See withinPocket's own comment.
            const hit = checkPocketHit(ball, chuckerActive, attackerActive, jackpotActive);
            if (hit) {
                outcome = hit;
                pushSample();
                break;
            }
        }
        if (outcome) {
            break;
        }
        if (ball.position.y > GUTTER_CUTOUT_Y + 10) {
            outcome = "gutter";
            pushSample();
            break;
        }

        // A weak/settled ball in the lower field can get stuck without ever actually crossing
        // the y-threshold above - checking net displacement over a whole window catches both a
        // genuinely-at-rest ball and one rattling in a small pocket with just enough residual
        // bounce to never look "at rest" from instantaneous speed alone. Short of a pocket
        // catch, that's always eventually a miss, but waiting for MAX_STEPS to force the issue
        // would let it sit there for several real seconds first. STALL_MIN_Y keeps this from
        // misfiring on a ball that's legitimately hanging near the top of its arc after a
        // strong launch, which isn't stuck at all.
        stepsSinceCheckpoint++;
        if (stepsSinceCheckpoint >= STALL_CHECK_INTERVAL) {
            const moved = Math.hypot(ball.position.x - stallCheckpoint.x, ball.position.y - stallCheckpoint.y);
            if (ball.position.y > STALL_MIN_Y && moved < STALL_DISTANCE) {
                outcome = "gutter";
                pushSample();
                break;
            }
            stallCheckpoint = { x: ball.position.x, y: ball.position.y };
            stepsSinceCheckpoint = 0;
        }

        if (step % SAMPLE_EVERY_N_STEPS === 0) {
            pushSample();
        }
    }

    // The ball never resolved within the step cap - treat it as a gutter rather than looping
    // forever.
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
