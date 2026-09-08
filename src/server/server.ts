require("dotenv").config({ quiet: true });
const Bugsnag = require("./config/bugsnag").default;

if (process.env.MOCK_WEEABETS === "true" && process.env.NODE_ENV !== "production") {
  require("./mocks/node").startWeeabetsMock();
}

const express = require("express");
const passport = require("passport");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const { initializeDefaultUsers } = require("./utils/defaultUsers");
const ViteExpress = require("vite-express");
const { SocketManager } = require("./infrastructure/SocketManager.js");
const Mongo = require("./infrastructure/MongoDB.js");

require("./config/passport");

const { Server: SocketIOServer } = require("socket.io");

const app = express();
if (Bugsnag.getPlugin("express")) {
  app.use(Bugsnag.getPlugin("express").requestHandler);
}
app.use(cors());
// Increase body size limits for file uploads (100MB to accommodate blog/recipaint assets and xenbox chunks (xenbox uses 10MB chunks, ~13-14MB base64 encoded))
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: false, limit: '100mb' }));
// app.use(logger("dev"));
app.use(cookieParser());
app.use(passport.initialize());
app.use("/avatars", express.static("src/server/public/avatars"));

// The transformer runs on every SPA HTML response; it passes everything but a public
// /recipaint/:id share link straight through, so OG crawlers get a real preview without
// putting a Mongo read in front of any other page. Spread the mode rather than passing
// `undefined`, which would clobber vite-express's own default in development.
const { recipaintHtmlTransformer } = require("./utils/recipaintOgMeta");
ViteExpress.config({
  ...(process.env.NODE_ENV === "production" ? { mode: "production" as const } : {}),
  transformer: recipaintHtmlTransformer,
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
  // await initializeDefaultUsers();
  if (schedulingInitialized) return;
  schedulingInitialized = true;
  try {
    const { Scheduler } = require("./infrastructure/Scheduler");
    const { runDueTasks, TICK_INTERVAL_MS } = require("./infrastructure/TaskDispatcher");
    const { registerXenSplitRecurringHandler } = require("./utils/xensplitRecurringHandler");
    const { cleanupOldSessions } = require("./utils/xenboxUtils");
    const { runPendingMigrations } = require("./infrastructure/migrations");

    // Safety net for a deploy that skipped `npm run db:migrate`. Runs before the
    // scheduler so any reshape a migration performs lands before the first
    // dispatcher tick. Never throws — a failure is logged and the server still starts.
    await runPendingMigrations();

    registerXenSplitRecurringHandler();

    const scheduler = Scheduler.getInstance();
    scheduler.register({ name: "scheduled-task-dispatcher", everyMs: TICK_INTERVAL_MS, runOnStart: true, handler: runDueTasks });
    scheduler.register({ name: "xenbox-session-cleanup", everyMs: 30 * 60 * 1000, handler: cleanupOldSessions });
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

require("./routes/auth.ts")(app);
require("./routes/users.ts")(app);
require("./routes/points.ts")(app);
require("./routes/notifications.ts")(app);
require("./routes/push.ts")(app);
require("./routes/messages.ts")(app);
require("./routes/blog.ts")(app);
require("./routes/admin/blog.ts")(app);
require("./routes/admin/users.ts")(app);
require("./routes/admin/messages.ts")(app);
require("./routes/admin/casino.ts")(app);
require("./routes/admin/debug.ts")(app);
require("./routes/recipaint.ts")(app);
require("./routes/paints.ts")(app);
require("./routes/paintCatalogue.ts")(app);
require("./routes/xenbox.ts")(app);
require("./routes/xenlink.ts")(app);
require("./routes/xensplit")(app);
require("./routes/xenbudget.ts")(app);
require("./routes/casino.ts")(app);
require("./routes/casinoGames/slots.ts")(app);
require("./routes/casinoGames/spinmania.ts")(app);
require("./routes/casinoGames/kittyScratch.ts")(app);
require("./routes/casinoGames/crossword.ts")(app);
require("./routes/casinoGames/memory.ts")(app);
require("./routes/casinoGames/plinko.ts")(app);
require("./routes/casinoGames/pachinko.ts")(app);
require("./routes/casinoPrinter.ts")(app);
require("./routes/casinoRanch.ts")(app);

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
  })
);

if (Bugsnag.getPlugin("express")) {
  app.use(Bugsnag.getPlugin("express").errorHandler);
}
app.use((err: any, req: any, res: any, next: any) => {
  console.error(">>> Unhandled error:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});