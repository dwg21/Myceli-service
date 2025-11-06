import { Router } from "express";
import {
  getMe,
  updateMe,
  getAllUsers,
  deleteUser,
} from "../controllers/userController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// GET /api/users/me
router.get("/me", requireAuth, getMe);

// PUT /api/users/me
router.put("/me", requireAuth, updateMe);

// GET /api/users (admin only)
router.get("/", requireAuth, requireRole("admin"), getAllUsers);

// DELETE /api/users/:id (admin only)
router.delete("/:id", requireAuth, requireRole("admin"), deleteUser);

export default router;
