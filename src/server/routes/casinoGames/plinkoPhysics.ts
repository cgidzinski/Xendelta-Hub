/**
 * Server-only Plinko physics sim (matter-js). Never imported from src/client - the client
 * only replays the trajectory this produces, it never runs its own simulation. Same pattern
 * as pachinkoPhysics.ts, minus the tulip/gutter outcome variety - Plinko only ever has one
 * kind of outcome (a landing slot), just decided for real now instead of by coin flip.
 *
 * `dropX` (where the player's aim marker was when they clicked) is a genuine physics input:
 * the ball spawns there and falls through the real peg field - gravity, pegs with per-shot
 * restitution jitter, real collisions - rather than the server picking an abstract left/right
 * path and the client just replaying it. Whatever slot the ball actually settles in is the
 * outcome; there's no rejection-sampling toward a pre-chosen target.
 */
import Matter = require("matter-js");
import {
    CANVAS_WIDTH,
    BOARD_BOTTOM,
    SLOT_FLOOR_Y,
    DROP_Y,
    DROP_MIN_X,
    DROP_MAX_X,
    PEG_RADIUS,
    BALL_RADIUS,
    SLOT_COUNT,
    BOUNDARY_LEFT_POINTS,
    BOUNDARY_RIGHT_POINTS,
    Point,
    generatePegPositions,
    slotBoundaries,
    slotForX,
} from "./plinkoLayout";

export interface TrajectorySample {
    x: number;
    y: number;
    r: number; // ball rotation, radians - purely cosmetic on the client
}

export interface DropResult {
    trajectory: TrajectorySample[];
    slot: number;
}

const FIXED_TIMESTEP_MS = 1000 / 60;
const SAMPLE_EVERY_N_STEPS = 2; // ~30fps trajectory
const MAX_STEPS = 400; // generous upper bound - the board is short, this rarely gets close
const pegPositions = generatePegPositions(); // plain data, turned into the persistent peg Bodies once below
const boundaries = slotBoundaries();

// One thin static rectangle per point pair - same construction pachinkoPhysics.ts uses for
// its oval boundary, just a two-point straight line here (apex to bottom corner) instead of
// a flattened curve.
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

// The whole board (walls, floor, dividers, pegs) plus one persistent ball body, built once at
// module load and reused for every drop instead of reconstructed per-request - with the
// current board size that's ~190 matter-js bodies, and constructing all of them synchronously
// on every single `/drop` request was the dominant chunk of that endpoint's latency. Safe to
// share across concurrent requests: simulateDrop below is fully synchronous (never `await`s
// mid-loop), so Node's single-threaded event loop guarantees two calls can never interleave -
// one always fully completes (spawn through landing) before the next one can start, no matter
// how many HTTP requests are concurrently in flight around it.
const engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.0018 }, positionIterations: 12, velocityIterations: 10 });

// Kept as its own array (not just merged into the world) so simulateDrop can re-roll each
// peg's restitution before every drop - that per-shot jitter is what makes repeat drops off
// the same dropX look distinct (see "identical dropX still produces non-identical
// trajectories" in plinkoPhysics.test.ts), and now that the bodies themselves are reused
// rather than recreated, the jitter has to be re-rolled per call instead of baked in at
// construction time.
const pegBodies: Matter.Body[] = pegPositions.map((peg) =>
    Matter.Bodies.circle(peg.x, peg.y, PEG_RADIUS, {
        isStatic: true,
        restitution: 0.45 + Math.random() * 0.25,
        friction: 0.01,
        label: "peg",
    })
);

const dividerBodies: Matter.Body[] = [];
// Interior slot dividers, below the peg field - forces the ball to settle into one discrete
// pocket instead of drifting sideways once it's past the last peg row, same as a real
// Plinko board's physical slot walls.
for (let i = 1; i < SLOT_COUNT; i++) {
    const x = boundaries[i];
    dividerBodies.push(Matter.Bodies.rectangle(x, (BOARD_BOTTOM + SLOT_FLOOR_Y) / 2, 2, SLOT_FLOOR_Y - BOARD_BOTTOM + 20, { isStatic: true, label: "divider" }));
}

const ball = Matter.Bodies.circle(0, 0, BALL_RADIUS, {
    restitution: 0.4,
    friction: 0.01,
    frictionAir: 0.002,
    label: "ball",
});

Matter.Composite.add(engine.world, [
    ...buildWallSegments(BOUNDARY_LEFT_POINTS),
    ...buildWallSegments(BOUNDARY_RIGHT_POINTS),
    Matter.Bodies.rectangle(CANVAS_WIDTH / 2, SLOT_FLOOR_Y + 10, CANVAS_WIDTH * 2, 10, { isStatic: true, label: "floor" }),
    ...pegBodies,
    ...dividerBodies,
    ball,
]);

export function simulateDrop(dropX: number): DropResult {
    const startX = Math.min(DROP_MAX_X, Math.max(DROP_MIN_X, dropX));

    for (const peg of pegBodies) {
        peg.restitution = 0.45 + Math.random() * 0.25;
    }

    // A hairline-precise drop straight onto a peg's centerline is a genuinely unstable
    // contact (which way it deflects is a coin flip on floating-point noise) - a few pixels
    // of honest spawn jitter is closer to how an aim marker would behave anyway, and keeps
    // that single degenerate first contact from dominating the whole fall.
    Matter.Body.setPosition(ball, { x: startX + (Math.random() - 0.5) * 8, y: DROP_Y });
    Matter.Body.setAngle(ball, 0);
    Matter.Body.setVelocity(ball, { x: (Math.random() - 0.5) * 0.6, y: 0 });
    Matter.Body.setAngularVelocity(ball, 0);

    const trajectory: TrajectorySample[] = [];
    let landed = false;

    for (let step = 0; step < MAX_STEPS; step++) {
        Matter.Engine.update(engine, FIXED_TIMESTEP_MS);

        if (step % SAMPLE_EVERY_N_STEPS === 0) {
            trajectory.push({ x: ball.position.x, y: ball.position.y, r: ball.angle });
        }

        if (ball.position.y + BALL_RADIUS >= SLOT_FLOOR_Y) {
            landed = true;
            trajectory.push({ x: ball.position.x, y: ball.position.y, r: ball.angle });
            break;
        }
    }

    // Never fully settled within the step cap (rare - e.g. wedged between two pegs) - read
    // off wherever it ended up rather than looping forever.
    if (!landed) {
        trajectory.push({ x: ball.position.x, y: ball.position.y, r: ball.angle });
    }

    const slot = slotForX(ball.position.x);
    return { trajectory, slot };
}
