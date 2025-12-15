require("dotenv").config();
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

// Serve static files for avatars
app.use('/avatars', express.static('src/server/public/avatars'));

// Serve static files for blog images
app.use('/blog-images', express.static('src/server/public/blog-images'));

const port = process.env.PORT || "3000";
// Explicitly configure ViteExpress for production mode when NODE_ENV is production
// process.cwd() returns the project root (where package.json is) when run from npm scripts
if (process.env.NODE_ENV === "production") {
  ViteExpress.config({ mode: "production", root: process.cwd() });
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