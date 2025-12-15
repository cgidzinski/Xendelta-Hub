require("dotenv").config({ quiet: true });
import express from "express";
var passport = require("passport");
var cors = require("cors");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
var logger = require("morgan");
import ViteExpress from "vite-express";
import { SocketManager } from "./infrastructure/SocketManager.js";
var Mongo = require("./infrastructure/MongoDB.js");

// Import Passport configuration AFTER dotenv has loaded
require("./config/passport");

const { Server: SocketIOServer } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());
// app.use(logger("dev"));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Initialize Passport
app.use(passport.initialize());

// Serve static files for default avatar only (local file)
app.use('/avatars', express.static('src/server/public/avatars'));

// Note: Blog images are now served through proxy endpoints, not static files

const port = process.env.PORT || "3000";

// Explicitly configure ViteExpress for production mode when NODE_ENV is production
// ViteExpress doesn't automatically detect NODE_ENV - it requires explicit configuration
// to switch from development mode (using Vite's dev server) to production mode (serving pre-built static files)
if (process.env.NODE_ENV === "production") {
  ViteExpress.config({ mode: "production" });
}

const server = ViteExpress.listen(app, Number(port), () => console.log(`>>> Server is listening on port ${port}...`));
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log(">>> Starting Ark Stash in", process.env.NODE_ENV, "mode");
console.log(">>> ------------------");
console.log(">>> Initializing Mongo...");
const mongoConnection = Mongo.getConnection();

// Initialize default users after MongoDB connection
import { initializeDefaultUsers } from "./utils/defaultUsers";

mongoConnection.on("connected", async () => {
  console.log(">>> MongoDB connected");
  await initializeDefaultUsers();
});

console.log(">>> Initializing Socket...");
const socketManager = SocketManager.getInstance();
socketManager.initialize(io);

require("./routes/users.ts")(app);
require("./routes/notifications.ts")(app);
require("./routes/messages.ts")(app);
require("./routes/blog.ts")(app);
require("./routes/media.ts")(app);
require("./routes/admin/blog.ts")(app);
require("./routes/admin/users.ts")(app);
require("./routes/admin/messages.ts")(app);