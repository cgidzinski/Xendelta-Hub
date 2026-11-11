// The route modules load each other with extensionless CommonJS require() of .ts files, which
// only tsx (what production runs under) can resolve. Register its hook before anything loads.
import "tsx/cjs";
import { createRequire } from "module";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Integration-test harness: a real Express app and real Mongoose models against an
// in-memory MongoDB, with only the routes under test registered. Nothing is mocked, so a
// test here exercises the same validation, middleware and queries as production.

export interface TestApp {
  app: express.Express;
  stop: () => Promise<void>;
}

/** Env the route modules read at import time. Must be set before they are imported. */
export function setTestEnv(): void {
  process.env.JWT_SECRET = "test-secret";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.PUBLIC_URL = "http://localhost:3000";
  process.env.GCS_PUBLIC_BUCKET_NAME = "test-public";
  process.env.GCS_PRIVATE_BUCKET_NAME = "test-private";
}

/**
 * Start the in-memory database and an app with the given route modules registered.
 * `routes` are dynamic imports of modules exporting `function (app)` (CommonJS style).
 */
export async function startTestApp(routes: Array<() => Promise<any>>): Promise<TestApp> {
  setTestEnv();
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Routes push realtime events through the SocketManager singleton, which production wires
  // up at boot. Give the same (CommonJS-loaded) instance a silent stand-in for Socket.IO.
  // Route files mix `import` and `require()`, which land in two separate module registries
  // under vitest, so stub both copies of the singleton.
  const silentIo = { to: () => ({ emit: () => undefined }), emit: () => undefined };
  const cjs = createRequire(__filename);
  (cjs("../infrastructure/SocketManager").SocketManager.getInstance() as any).io = silentIo;
  ((await import("../infrastructure/SocketManager.js")).SocketManager.getInstance() as any).io = silentIo;

  const app = express();
  app.use(express.json());
  for (const load of routes) {
    const mod = await load();
    (mod.default ?? mod)(app);
  }

  // Mirror production's last-resort handler, but surface the message so a failing test says why.
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.status || 500).json({ message: err.message, stack: String(err.stack).split(String.fromCharCode(10)).slice(0, 4) });
  });

  return {
    app,
    stop: async () => {
      await mongoose.disconnect();
      await mongod.stop();
    },
  };
}

/** Create a user straight through the model, returning it and a valid bearer token. */
export async function createUser(overrides: Record<string, unknown> = {}) {
  // The routes register the model through CommonJS require(); take it from mongoose rather
  // than importing the file again, which would register it a second time.
  const User = mongoose.model("User");
  const { generateToken } = await import("../utils/tokenUtils.js");
  const suffix = Math.random().toString(36).slice(2, 8);
  const user = new (User as any)({
    username: `user${suffix}`,
    email: `u${suffix}@example.com`,
    password: "unused",
    ...overrides,
  });
  await user.save();
  const token = generateToken({ _id: user._id.toString(), username: user.username, email: user.email });
  return { user, token };
}
