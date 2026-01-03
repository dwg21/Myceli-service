import { Router } from "express";
import {
  createShareLink,
  getSharedGraph,
  getSharedChat,
  getShareLinkForGraph,
} from "../controllers/shareController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Authenticated creation of a share link
router.post("/", requireAuth, createShareLink);
router.get("/graph/:graphId", requireAuth, getShareLinkForGraph);

// Public fetch of a shared graph snapshot
router.get("/:shareId", getSharedGraph);

// Public fetch of a read-only chat tied to a shared graph
router.get("/:shareId/chat/:chatId", getSharedChat);

export default router;
