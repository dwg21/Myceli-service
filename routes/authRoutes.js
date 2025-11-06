import { Router } from "express";
import { z } from "zod";
import {
  signup,
  login,
  refresh,
  logout,
} from "../controllers/authController.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";

const router = Router();

// -----------------------------
// Zod validation schemas
// -----------------------------

// Common credentials schema
const credentialsSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(64, "Password too long"),
});

// Signup schema extends credentials with optional name
const signupSchema = credentialsSchema.extend({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
});

// -----------------------------
// Routes
// -----------------------------

// POST /api/auth/signup
router.post("/signup", authLimiter, validate({ body: signupSchema }), signup);

// POST /api/auth/login
router.post(
  "/login",
  authLimiter,
  validate({ body: credentialsSchema }),
  login
);

// POST /api/auth/refresh
router.post("/refresh", refresh);

// POST /api/auth/logout
router.post("/logout", logout);

export default router;
