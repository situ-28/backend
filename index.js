// server.js

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server } from "socket.io";

// Import custom route files
import authRoute from "./rout/authRout.js";
import userRoute from "./rout/userRout.js";
import dbConnection from "./db/dbConnect.js";

// ✅ Load environment variables
dotenv.config();

// 🌍 Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// 📡 Allowed origins
const allowedOrigins = [
  process.env.FRONTEND_URL || "https://kaleidoscopic-piroshki-d93d39.netlify.app", 
  /\.ngrok-free\.app$/
];

console.log("✅ Allowed Origins:", allowedOrigins);

// 🔧 CORS middleware
app.use(
  cors({
    origin: function (origin, callback) {
      console.log("CORS origin:", origin);
      if (!origin) return callback(null, true); // allow mobile apps / curl / no-origin
      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.some((o) => o instanceof RegExp && o.test(origin))
      ) {
        return callback(null, true);
      } else {
        console.warn("❌ Blocked by CORS:", origin);
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

// ✅ Handle preflight OPTIONS requests
app.options("*", cors());

// 🛠 Middleware
app.use(express.json());
app.use(cookieParser());

// 🔗 API routes
app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);

// ✅ Test route
app.get("/", (req, res) => {
  res.send("Server is running!"); // returns text directly
});

app.get("/ok", (req, res) => {
  res.json({ message: "Server is running!" });
});

// 📡 Create HTTP server
const server = createServer(app);

// 🔥 Initialize Socket.io
const io = new Server(server, {
  pingTimeout: 60000,
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log("[SUCCESS] Socket.io initialized with CORS");

// 🟢 Store online users and active calls
let onlineUsers = [];
const activeCalls = new Map();

// 📞 Socket.io connections
io.on("connection", (socket) => {
  console.log(`[INFO] New connection: ${socket.id}`);
  socket.emit("me", socket.id);

  socket.on("join", (user) => {
    if (!user || !user.id) return;
    socket.join(user.id);

    const existingUser = onlineUsers.find((u) => u.userId === user.id);
    if (existingUser) existingUser.socketId = socket.id;
    else onlineUsers.push({ userId: user.id, name: user.name, socketId: socket.id });

    io.emit("online-users", onlineUsers);
  });

  socket.on("callToUser", (data) => {
    const callee = onlineUsers.find((u) => u.userId === data.callToUserId);
    if (!callee) return socket.emit("userUnavailable", { message: "User is offline." });

    if (activeCalls.has(data.callToUserId)) {
      socket.emit("userBusy", { message: "User is in another call." });
      io.to(callee.socketId).emit("incomingCallWhileBusy", data);
      return;
    }

    io.to(callee.socketId).emit("callToUser", data);
  });

  socket.on("answeredCall", (data) => {
    io.to(data.to).emit("callAccepted", { signal: data.signal, from: data.from });
    activeCalls.set(data.from, { with: data.to, socketId: socket.id });
    activeCalls.set(data.to, { with: data.from, socketId: data.to });
  });

  socket.on("reject-call", (data) => {
    io.to(data.to).emit("callRejected", data);
  });

  socket.on("call-ended", (data) => {
    io.to(data.to).emit("callEnded", data);
    activeCalls.delete(data.from);
    activeCalls.delete(data.to);
  });

  socket.on("disconnect", () => {
    const user = onlineUsers.find((u) => u.socketId === socket.id);
    if (user) {
      activeCalls.delete(user.userId);
      for (const [key, value] of activeCalls.entries()) {
        if (value.with === user.userId) activeCalls.delete(key);
      }
    }

    onlineUsers = onlineUsers.filter((u) => u.socketId !== socket.id);
    io.emit("online-users", onlineUsers);
    socket.broadcast.emit("disconnectUser", { disUser: socket.id });
    console.log(`[INFO] Disconnected: ${socket.id}`);
  });
});

// 🏁 Start server after DB connection
(async () => {
  try {
    await dbConnection();
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server is running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to connect to the database:", error);
    process.exit(1);
  }
})();
