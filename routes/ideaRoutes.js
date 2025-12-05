import { Router } from "express";
import {
  generateMainIdeas,
  expandIdea,
  generateIdeaImage,
} from "../controllers/ideaController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// POST /api/generate-main-ideas
router.post("/generate-main-ideas", requireAuth, generateMainIdeas);

// POST /api/expand-idea
router.post("/expand-idea", requireAuth, expandIdea);

// POST /api/generate-image
router.post("/generate-image", requireAuth, generateIdeaImage);

export default router;
