// server.js
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { Server } from "socket.io";
import authRoute from "./rout/authRout.js";
import userRoute from "./rout/userRout.js";
import dbConnection from "./db/dbConnect.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Build whitelist from env / defaults
const FRONTEND_URL = process.env.FRONTEND_URL || "https://kaleidoscopic-piroshki-d93d39.netlify.app";
const whitelist = [
  FRONTEND_URL,
  // add other explicit domains if needed, e.g. local dev:
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);

// optionally allow ngrok-like hostnames via regex
const allowedRegex = /\.ngrok-free\.app$/;

console.log("[CORS] Whitelist:", whitelist);

// -- CORS middleware (manual, robust) --
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // If no origin (curl, mobile, same-origin server-side) allow it
  if (!origin) return next();

  // Check whitelist or regex
  const isWhitelisted = whitelist.includes(origin) || allowedRegex.test(origin);

  if (isWhitelisted) {
    // MUST echo the origin when using credentials
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization,Origin,X-Requested-With,Content-Type,Accept"
    );

    // Respond to preflight immediately
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    return next();
  } else {
    // Explicitly forbid
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return res.status(403).json({ message: "CORS Forbidden" });
  }
});

// Body + cookie parsers
app.use(express.json());
app.use(cookieParser());

// Your routes
app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);

app.get("/", (req, res) => res.send("Server is running!"));
app.get("/ok", (req, res) => res.json({ message: "Server is running!" }));

// Create HTTP server
const server = createServer(app);

// Socket.io with a function-based origin check
const io = new Server(server, {
  pingTimeout: 60000,
  cors: {
    origin: (origin, callback) => {
      // origin may be undefined for non-browser clients; allow it
      if (!origin) return callback(null, true);
      if (whitelist.includes(origin) || allowedRegex.test(origin)) {
        return callback(null, true);
      } else {
        console.warn("[Socket.IO] Blocked origin:", origin);
        return callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log("[SUCCESS] Socket.io initialized with CORS");

// socket.io logic (your original code)
let onlineUsers = [];
const activeCalls = new Map();

io.on("connection", (socket) => {
  console.log(`[INFO] New connection: ${socket.id}`);
  socket.emit("me", socket.id);

  // join
  socket.on("join", (user) => {
    if (!user || !user.id) return;
    socket.join(user.id);

    const existingUser = onlineUsers.find((u) => u.userId === user.id);
    if (existingUser) existingUser.socketId = socket.id;
    else onlineUsers.push({ userId: user.id, name: user?.name, socketId: socket.id });

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

// Start server after DB connect
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
