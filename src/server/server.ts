require("dotenv").config();
import express from "express";
var passport = require("passport");
var cors = require("cors");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
var logger = require("morgan");
import ViteExpress from "vite-express";
import { SocketManager } from "./infrastructure/SocketManager.js";
var Mongo = require("./infrastructure/mongoDB.js");

// Import Passport configuration AFTER dotenv has loaded
require("./config/passport");

const socket = require("socket.io");

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

const port = process.env.PORT || "3000";
const server = ViteExpress.listen(app, Number(port), () => console.log(`>>> Server is listening on port ${port}...`));
const io = socket(server);

console.log(">>> Starting Ark Stash in", process.env.NODE_ENV, "mode");
console.log(">>> ------------------");
console.log(">>> Initializing Mongo...");
Mongo.getConnection();
console.log(">>> Initializing Socket...");
const socketManager = SocketManager.getInstance();
socketManager.initialize(io);

require("./routes/users.ts")(app);
require("./routes/notifications.ts")(app);