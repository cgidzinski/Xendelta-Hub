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
    origin: `http://localhost:${process.env.PORT || "3000"}`,
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
require("./routes/recipaint.ts")(app);
