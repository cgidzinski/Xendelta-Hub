require("dotenv").config({ quiet: true });

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
app.use(cors());
// Increase body size limits for file uploads (100MB to accommodate blog/recipaint assets and xenbox chunks (xenbox uses 10MB chunks, ~13-14MB base64 encoded))
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: false, limit: '100mb' }));
// app.use(logger("dev"));
app.use(cookieParser());
app.use(passport.initialize());
app.use("/avatars", express.static("src/server/public/avatars"));
if (process.env.NODE_ENV === "production") {
  ViteExpress.config({ mode: "production" });
}

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
    const { registerXenSplitRecurringHandler, migrateEmbeddedRecurringSeries } = require("./utils/xensplitRecurringHandler");
    const { cleanupOldSessions } = require("./utils/xenboxUtils");

    registerXenSplitRecurringHandler();
    // Must finish before the dispatcher's first tick so migrated tasks aren't missed.
    // A migration failure must not stop the scheduler (or the unrelated xenbox job)
    // from starting — unmigrated series simply don't generate until repaired.
    try {
      await migrateEmbeddedRecurringSeries();
    } catch (e) {
      console.error(">>> Recurring series migration failed (scheduler will still start):", e);
    }

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
require("./routes/messages.ts")(app);
require("./routes/blog.ts")(app);
require("./routes/admin/blog.ts")(app);
require("./routes/admin/users.ts")(app);
require("./routes/admin/messages.ts")(app);
require("./routes/recipaint.ts")(app);
require("./routes/xenbox.ts")(app);
require("./routes/xenlink.ts")(app);
require("./routes/xensplit")(app);
require("./routes/casino.ts")(app);
require("./routes/casinoGames/slots.ts")(app);
require("./routes/casinoGames/spinmania.ts")(app);
require("./routes/casinoGames/kittyScratch.ts")(app);
require("./routes/casinoGames/crossword.ts")(app);
require("./routes/casinoGames/plinko.ts")(app);
require("./routes/casinoGames/pachinko.ts")(app);