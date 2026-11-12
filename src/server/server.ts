require("dotenv").config({ quiet: true });
// Refuse to boot without the secrets the server cannot run safely without.
require("./config/env").validateEnv();
const Bugsnag = require("./config/bugsnag").default;

const express = require("express");
const passport = require("passport");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const ViteExpress = require("vite-express");
const { SocketManager } = require("./infrastructure/SocketManager.js");
const Mongo = require("./infrastructure/MongoDB.js");

require("./config/passport");
import { errorHandler } from "./utils/http";

const { Server: SocketIOServer } = require("socket.io");

const app = express();
if (Bugsnag.getPlugin("express")) {
  app.use(Bugsnag.getPlugin("express").requestHandler);
}
// Security headers. CSP stays off (the SPA ships inline styles and loads GCS images from
// another origin); the cross-origin policies would block those images.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));

// The app is served from the same origin as its API, so CORS only matters for other
// origins. In production allow just PUBLIC_URL; in development stay open.
const allowedOrigin = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, "") : undefined;
app.use(cors({ origin: allowedOrigin ?? (process.env.NODE_ENV === "production" ? false : true) }));

// Body limits: 1MB for everything, with the big limit scoped to the routes that really
// post large JSON (xendrive base64 chunks are ~13-14MB; XenBudget imports/backups and
// admin tools can be large). The scoped parsers run first and mark the body as parsed, so
// the global 1MB parser skips those requests. File uploads go through multer, not here.
const BIG_JSON = express.json({ limit: "100mb" });
app.use("/api/xendrive/chunk", BIG_JSON);
app.use("/api/xenbudget", BIG_JSON);
app.use("/api/admin", BIG_JSON);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(passport.initialize());
app.use("/avatars", express.static("src/server/public/avatars"));

// The transformer runs on every SPA HTML response; it passes everything but a public
// /recipaint/:id share link straight through, so OG crawlers get a real preview without
// putting a Mongo read in front of any other page. Spread the mode rather than passing
// `undefined`, which would clobber vite-express's own default in development.
// XenKitchen's /k/:token share links get the same treatment.
const { recipaintHtmlTransformer } = require("./utils/recipaintOgMeta");
const { kitchenHtmlTransformer, composeTransformers } = require("./utils/xenKitchenOgMeta");
ViteExpress.config({
  ...(process.env.NODE_ENV === "production" ? { mode: "production" as const } : {}),
  transformer: composeTransformers(recipaintHtmlTransformer, kitchenHtmlTransformer),
});

const port = process.env.PORT || "3000";

const server = ViteExpress.listen(app, Number(port), () => console.log(`>>> Server is listening on port ${port}...`));
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || "3000"}`,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log(">>> Starting Xendelta Hub in", process.env.NODE_ENV, "mode");
console.log(">>> ------------------");
console.log(">>> Initializing Mongo...");
const mongoConnection = Mongo.getConnection();

// The "connected" event fires on every reconnect (Atlas idle drops, sleep, network
// blips), so the scheduling bootstrap must run exactly once per process.
let schedulingInitialized = false;
mongoConnection.on("connected", async () => {
  console.log(">>> MongoDB connected");
  if (schedulingInitialized) return;
  schedulingInitialized = true;
  try {
    const { Scheduler } = require("./infrastructure/Scheduler");
    const { runDueTasks, TICK_INTERVAL_MS } = require("./infrastructure/TaskDispatcher");
    const { registerXenSplitRecurringHandler } = require("./utils/xensplitRecurringHandler");
    const { cleanupOldSessions } = require("./utils/xendriveUtils");
    const { runRoutineReminders } = require("./utils/xenRoutineReminders");
    const { runPendingMigrations } = require("./infrastructure/migrations");

    // Safety net for a deploy that skipped `npm run db:migrate`. Runs before the
    // scheduler so any reshape a migration performs lands before the first
    // dispatcher tick. Never throws — a failure is logged and the server still starts.
    await runPendingMigrations();

    registerXenSplitRecurringHandler();

    const scheduler = Scheduler.getInstance();
    scheduler.register({
      name: "scheduled-task-dispatcher",
      everyMs: TICK_INTERVAL_MS,
      runOnStart: true,
      handler: runDueTasks,
    });
    scheduler.register({ name: "xendrive-session-cleanup", everyMs: 30 * 60 * 1000, handler: cleanupOldSessions });
    scheduler.register({
      name: "xenroutine-reminders",
      everyMs: 60 * 60 * 1000,
      runOnStart: true,
      handler: () => runRoutineReminders(),
    });
    scheduler.start();
  } catch (e) {
    // An error thrown from an event handler would crash the process as an
    // unhandled rejection — log loudly instead
    console.error(">>> Failed to initialize scheduling:", e);
  }
});

console.log(">>> Initializing Socket...");
const socketManager = SocketManager.getInstance();
socketManager.initialize(io);

// Traffic arrives via Cloudflare, so the socket address is the proxy: key on the
// client IP Cloudflare reports instead, or everyone shares one bucket.
const clientKey = (req: any) => ipKeyGenerator(String(req.headers["cf-connecting-ip"] || req.ip));
const tooMany = { status: false, message: "Too many attempts. Please wait a few minutes and try again." };
// Only the unauthenticated, abuse-prone routes: /verify and /roles/verify run on ordinary page
// loads and must not be throttled.
app.use(
  ["/api/auth/login", "/api/auth/signup", "/api/auth/verify-reset-token", "/api/auth/reset-password"],
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    keyGenerator: clientKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany,
  }),
);
app.use(
  "/api/auth/forgot-password",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    keyGenerator: clientKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany,
  }),
);

// API keys (Authorization: Bearer xd_...) get their own bucket per key, since many keys can share one IP (a Home
// Assistant box, a CI runner). Session traffic is unaffected.
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    skip: (req: any) => !String(req.headers.authorization || "").startsWith("Bearer xd_"),
    keyGenerator: (req: any) => require("./utils/tokens").hashToken(String(req.headers.authorization)),
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: false, message: "Too many requests. Slow down and try again shortly." },
  }),
);

// Paused with a 503 while an admin restores the database from a backup (routes/admin/backups.ts).
const { restoreMaintenance } = require("./middleware/restoreMaintenance");
app.use(restoreMaintenance);

// Liveness/readiness for the process manager and uptime checks.
app.get("/api/health", (_req: any, res: any) => {
  const connected = Mongo.getConnection().readyState === 1;
  res.status(connected ? 200 : 503).json({ status: connected, uptime: Math.round(process.uptime()) });
});

require("./routes/auth.ts")(app);
require("./routes/users.ts")(app);
require("./routes/people.ts")(app);
require("./routes/apiKeys.ts")(app);
require("./routes/shop.ts")(app);
require("./routes/notifications.ts")(app);
require("./routes/push.ts")(app);
require("./routes/chat")(app);
require("./routes/blog.ts")(app);
require("./routes/admin")(app);
require("./routes/recipaint.ts")(app);
require("./routes/paints.ts")(app);
require("./routes/paintCatalogue.ts")(app);
require("./routes/xendrive.ts")(app);
require("./routes/xenlink.ts")(app);
require("./routes/xensplit")(app);
require("./routes/xenbudget")(app);
require("./routes/xenroutine.ts")(app);
require("./routes/xenkitchen.ts")(app);
require("./routes/xennote")(app);
require("./routes/feed")(app);

// vite-express appends its static handler at listen() time - after this module has
// finished running - so today it lands after every route registered above.
// ViteExpress.static() returns a positional sentinel that the real static layer is moved
// onto, which lets us keep that ordering while owning the response headers.
//
// setHeaders is the only hook that works for this: serve-static writes its own
// Cache-Control while sending, so a header set by an upstream middleware is silently
// overwritten. Note that staticOptions REPLACES vite-express's defaults rather than
// merging, so redirect: false has to be repeated here.
const nodePath = require("path");
const distDir = nodePath.resolve(process.cwd(), "dist");
app.use(
  ViteExpress.static({
    index: false,
    serveStatic: {
      redirect: false,
      setHeaders(res: any, filePath: string) {
        const rel = nodePath.relative(distDir, filePath).split(nodePath.sep).join("/");
        if (rel === "sw.js" || rel.endsWith(".html")) {
          // The service worker is the update signal for the whole PWA: if any cache can
          // hand back a stale sw.js, a client can install an older worker than the one it
          // is already running and end up stuck showing the update banner.
          res.setHeader("Cache-Control", "no-cache");
        } else if (rel.startsWith("assets/")) {
          // Vite content-hashes these filenames, so a copy held forever is still correct.
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    },
  }),
);

if (Bugsnag.getPlugin("express")) {
  app.use(Bugsnag.getPlugin("express").errorHandler);
}
app.use(errorHandler);

// Graceful shutdown: stop taking work, let in-flight requests finish, close sockets and
// the database, then exit. pm2 sends SIGINT on restart and SIGTERM on stop.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`>>> ${signal} received, shutting down...`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    require("./infrastructure/Scheduler").Scheduler.getInstance().stop();
  } catch {
    // The scheduler may not have started yet.
  }
  io.close();
  server.close(async () => {
    try {
      await mongoConnection.close();
    } finally {
      process.exit(0);
    }
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// A rejected promise nobody awaited would otherwise be a silent log line (or, in newer
// Node, a crash). Report it and keep serving.
process.on("unhandledRejection", (reason) => {
  console.error(">>> Unhandled rejection:", reason);
  Bugsnag.notify(reason instanceof Error ? reason : new Error(String(reason)));
});
