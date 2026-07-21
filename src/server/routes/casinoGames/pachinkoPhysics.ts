/**
 * Server-only Pachinko physics sim (matter-js). Never imported from src/client - the client
 * only replays the trajectory this produces, it never runs its own simulation.
 *
 * There's no pre-selected target outcome here (unlike Plinko). The player's launch power is a
 * genuine physics input - it's converted to an initial rail speed, the ball is driven along the
 * scripted rail path (see pachinkoLayout.ts's RAIL_CLIMB_PATH for why that phase is scripted
 * rather than simulated: a fast body against thin curved rail geometry is exactly the kind of
 * thing that can tunnel through under normal discrete collision detection), and once it reaches
 * the release point it becomes a real, unmodified free body - gravity, nail clusters with
 * per-shot restitution jitter, windmill bumpers, and every scoring pocket, which is a real
 * three-sided physical cup (open top only - see buildPocketWalls), not just an invisible
 * detection zone. Whatever the ball actually falls into is the outcome; a ball that clips a
 * pocket's side wall bounces off it like anything else in the field, it doesn't "catch" from
 * the side. Priming/timer state (tulip open/closed, jackpot primed, attacker's open window)
 * never changes what's physically reachable - see pachinkoLayout.ts's own comment on that -
 * it's resolved entirely by the caller (pachinko.ts) from the outcome this returns, not by this
 * module. A small amount of honest per-shot randomness (nail jitter, a touch of launch noise)
 * means a fixed power value doesn't deterministically reproduce the same outcome.
 */
import Matter = require("matter-js");
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

// A pocket is a real three-sided cup, not just a detection zone: left/right walls plus a floor,
// open only at the top (pocket.position.y, the same y the hit-test below uses as the catch
// window's center). A ball can only ever fall in through that open top - hitting a side wall
// bounces it away like any other obstacle, it can't "jump in" sideways or up through the floor.
function buildPocketWalls(pocket: FixedPocket): Matter.Body[] {
    const top = pocket.position.y - POCKET_DEPTH / 2;
    const bottom = pocket.position.y + POCKET_DEPTH / 2;
    const left = pocket.position.x - pocket.halfWidth;
    const right = pocket.position.x + pocket.halfWidth;
    const wallOptions = { isStatic: true, restitution: 0.55, friction: 0.05, label: "pocket-wall" };
    return [
        Matter.Bodies.rectangle(left, (top + bottom) / 2, 2, POCKET_DEPTH, wallOptions),
        Matter.Bodies.rectangle(right, (top + bottom) / 2, 2, POCKET_DEPTH, wallOptions),
        Matter.Bodies.rectangle((left + right) / 2, bottom, right - left, 2, wallOptions),
    ];
}

// The chucker while inactive (attacker already open from an earlier catch), the attacker while
// closed (no chucker catch has opened it yet), and the jackpot while unprimed (tulips not both
// open) all work the same way: not just unlit, literally not there - no walls, so a ball flies
// straight through that space instead of bouncing off an obstacle that isn't currently doing
// anything. pocketsInPlay is every pocket except whichever of those three is presently inactive.
function pocketsInPlay(chuckerActive: boolean, attackerActive: boolean, jackpotActive: boolean): FixedPocket[] {
    return ALL_POCKETS.filter((p) => {
        if (p.id === "chucker") return chuckerActive;
        if (p.id === "attacker") return attackerActive;
        if (p.id === "jackpot") return jackpotActive;
        return true;
    });
}

function buildAttemptWorld(chuckerActive: boolean, attackerActive: boolean, jackpotActive: boolean): { engine: Matter.Engine; ball: Matter.Body; spinnerBodies: Matter.Body[] } {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 }, positionIterations: 12, velocityIterations: 10 });

    const bodies: Matter.Body[] = [
        ...buildWallSegments(BOUNDARY_RIGHT_POINTS),
        ...buildWallSegments(BOUNDARY_LEFT_POINTS),
        ...pocketsInPlay(chuckerActive, attackerActive, jackpotActive).flatMap(buildPocketWalls),
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
                restitution: isDeflector ? 0.02 + Math.random() * 0.04 : 0.3 + Math.random() * 0.3, // per-shot jitter - what makes repeat drops look distinct
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
        Matter.Body.setAngularVelocity(spinner, (Math.random() > 0.5 ? 1 : -1) * (0.03 + Math.random() * 0.04));
        bodies.push(spinner);
        spinnerBodies.push(spinner);
        Matter.Composite.add(engine.world, constraint);
    }

    // 0.25, not a higher value - matter-js resolves a collision's restitution as
    // max(bodyA.restitution, bodyB.restitution), so the ball's own value is a floor under every
    // collision in the field regardless of what it hits. Kept under the deflector's own low
    // restitution above (0.02-0.06) so that nail's dampening actually takes effect, while every
    // other nail in the field (0.3-0.6) still wins that max() comparison exactly as before.
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

// The real "catch" check - now that every pocket has physical walls (buildPocketWalls), a ball
// can only ever be within this x/y window by having actually fallen in through the open top, so
// this can just be a plain window check, no velocity-direction heuristic needed.
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

// chuckerActive defaults true (the chucker is a real obstacle/target most of the time), the
// caller only passes false while the attacker it opens is still counting down from an earlier
// catch. attackerActive and jackpotActive both default false (mirror image - the attacker
// starts every round closed until a chucker catch opens it, and the jackpot starts every round
// unprimed until both tulips are open). In every case, "inactive" means no walls at all (see
// buildAttemptWorld) and no catch (see checkPocketHit) - a ball flies straight through that
// space like the pocket was never there, not just an unlit/non-scoring target.
export function simulateShot(launchPower: number, chuckerActive = true, attackerActive = false, jackpotActive = false): ShotResult {
    const { samples: railSamples } = railTrajectory(launchPower);
    const exitVelocity = launchPowerToExitVelocity(launchPower);

    const { engine, ball, spinnerBodies } = buildAttemptWorld(chuckerActive, attackerActive, jackpotActive);
    // Velocity direction is RELEASE_TANGENT - tangent to the boundary curve at the release
    // point - not a fixed straight-up vector, so the ball leaves the rail already riding the
    // same arc as the glass (see launchPowerToExitVelocity's own comment for the magnitude
    // tuning target). A small perpendicular jitter is layered on top for per-shot variety, same
    // spirit as the original board's own small x-jitter.
    const jitter = (Math.random() - 0.5) * 1.2;
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

    for (let step = 0; step < MAX_STEPS; step++) {
        // Several smaller updates instead of one big one - matter-js does discrete (not
        // continuous) collision detection, so a fast-moving ball can cross a thin wall segment
        // entirely within a single update and never register the collision at all. Splitting
        // each step into SUBSTEPS finer updates shrinks how far the ball can move per collision
        // check, without changing the sampling rate or the total simulated time.
        for (let sub = 0; sub < SUBSTEPS; sub++) {
            Matter.Engine.update(engine, FIXED_TIMESTEP_MS / SUBSTEPS);
        }

        const hit = checkPocketHit(ball, chuckerActive, attackerActive, jackpotActive);
        if (hit) {
            outcome = hit;
            pushSample();
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
