require("dotenv").config({ quiet: true });
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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
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
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log(">>> Starting Xendelta Hub in", process.env.NODE_ENV, "mode");
console.log(">>> ------------------");
console.log(">>> Initializing Mongo...");
const mongoConnection = Mongo.getConnection();

mongoConnection.on("connected", async () => {
  console.log(">>> MongoDB connected");
  // await initializeDefaultUsers();
});

console.log(">>> Initializing Socket...");
const socketManager = SocketManager.getInstance();
socketManager.initialize(io);

require("./routes/auth.ts")(app);
require("./routes/users.ts")(app);
require("./routes/notifications.ts")(app);
require("./routes/messages.ts")(app);
require("./routes/blog.ts")(app);
require("./routes/admin/blog.ts")(app);
require("./routes/admin/users.ts")(app);
require("./routes/admin/messages.ts")(app);
