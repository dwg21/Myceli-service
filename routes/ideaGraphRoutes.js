import { Router } from "express";
import {
  saveGraph,
  getUserGraphs,
  getGraphById,
} from "../controllers/ideaGraphController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.post("/save", saveGraph);
router.get("/", getUserGraphs);
router.get("/:id", getGraphById);

export default router;
