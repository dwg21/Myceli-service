import { Router } from "express";
import {
  generateMainIdeas,
  expandIdea,
  generateIdeaImage,
  regenerateIdeaImage,
} from "../controllers/ideaController.js";
import { requireAuth } from "../middleware/auth.js";
import { requireCredits } from "../middleware/credits.js";
import { requirePlan } from "../middleware/plan.js";

const router = Router();

// POST /api/generate-main-ideas
router.post(
  "/generate-main-ideas",
  requireAuth,
  requireCredits("generateMainIdeas"),
  generateMainIdeas
);

// POST /api/expand-idea
router.post(
  "/expand-idea",
  requireAuth,
  requireCredits("expandIdea"),
  expandIdea
);

// POST /api/generate-image
router.post(
  "/generate-image",
  requireAuth,
  requirePlan(["basic", "pro"]),
  requireCredits("imageGenerate"),
  generateIdeaImage
);
router.post(
  "/regenerate-image",
  requireAuth,
  requirePlan(["basic", "pro"]),
  requireCredits("imageRegenerate"),
  regenerateIdeaImage
);

export default router;
