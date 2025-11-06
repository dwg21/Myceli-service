import { Router } from "express";
import {
  generateMainIdeas,
  expandIdea,
} from "../controllers/ideaController.js";
import { ideaChat } from "../controllers/chatController.js";

const router = Router();

// POST /api/generate-main-ideas
router.post("/generate-main-ideas", generateMainIdeas);

// POST /api/expand-idea
router.post("/expand-idea", expandIdea);

router.post("/idea-chat", ideaChat);

export default router;
