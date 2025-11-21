// routes/chatRoutes.js
import express from "express";
import {
  createIdeaChat,
  saveChat,
  getUserChats,
  getChatsByGraph,
  getChatById,
  deleteChat,
  sendChatMessage,
  sendChatMessageStream,
} from "../controllers/chatController.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

router.post("/save", saveChat);
router.post("/create", createIdeaChat);
router.get("/", getUserChats);
router.get("/graph/:graphId", getChatsByGraph);
router.get("/:id", getChatById);
router.post("/message", sendChatMessage);
router.post("/send-stream", sendChatMessageStream);
router.delete("/:id", deleteChat);

export default router;
