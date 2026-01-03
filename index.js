import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import ideaRoutes from "./routes/ideaRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import ideaGraphRoutes from "./routes/ideaGraphRoutes.js";
import shareRoutes from "./routes/shareRoutes.js";
import { errorHandler } from "./middleware/error.js";
import { connectDB } from "./config/db.js"; // ✅ import your DB connector
import { startCreditResetScheduler } from "./services/creditResetService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 6501;

/* ---------------- Timing Logger ---------------- */
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(
      `${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`
    );
  });
  next();
});

/* ---------------- CORS ---------------- */
const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ---------------- Middleware ---------------- */
// Bump JSON limit so graph saves with embedded image data URIs don't blow up
app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());

/* ---------------- Routes ---------------- */
app.use("/api", ideaRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/graphs", ideaGraphRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/share", shareRoutes);

/* ---------------- Error Handler ---------------- */
app.use(errorHandler);

/* ---------------- Healthcheck ---------------- */
app.get("/health", (req, res) => res.json({ status: "ok" }));

/* ---------------- Catch-all error ---------------- */
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res
    .status(err.status || 500)
    .json({ error: err.message || "Internal Server Error" });
});

/* ---------------- Connect DB + Start Server ---------------- */
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Myceli backend listening on port ${PORT}`);
  });
  startCreditResetScheduler();
});
