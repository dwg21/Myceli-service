// routes/chatRoutes.js
import express from "express";
import {
  createIdeaChat,
  createStandaloneChat,
  saveChat,
  getUserChats,
  getChatsByGraph,
  getChatById,
  deleteChat,
  sendChatMessage,
  sendChatMessageStream,
} from "../controllers/chatController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCredits } from "../middleware/credits.js";
import { requireFreeLimit } from "../middleware/usageLimits.js";
import { chatLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

router.use(requireAuth);

router.post("/save", saveChat);
router.post("/create", requireFreeLimit("chatCreate"), createIdeaChat);
router.post(
  "/create-standalone",
  requireFreeLimit("chatCreate"),
  createStandaloneChat
);
router.get("/", getUserChats);
router.get("/graph/:graphId", getChatsByGraph);
router.get("/:id", getChatById);
router.post(
  "/message",
  chatLimiter,
  requireCredits("chatMessage"),
  sendChatMessage
);
router.post(
  "/send-stream",
  chatLimiter,
  requireCredits("chatStream"),
  sendChatMessageStream
);
router.delete("/:id", deleteChat);

export default router;
