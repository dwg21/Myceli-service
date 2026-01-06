import { Router } from "express";
import {
  saveGraph,
  getUserGraphs,
  getGraphById,
  deleteGraph,
} from "../controllers/ideaGraphController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.post("/save", saveGraph);
router.get("/", getUserGraphs);
router.get("/:id", getGraphById);
router.delete("/:id", deleteGraph);

export default router;
