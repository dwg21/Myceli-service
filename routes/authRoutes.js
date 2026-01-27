import { Router } from "express";
import { z } from "zod";
import {
  signup,
  login,
  refresh,
  logout,
  me,
  requestPasswordReset,
  resetPassword,
} from "../controllers/authController.js";
import {
  googleAuth,
  googleCallback,
  githubAuth,
  githubCallback,
} from "../controllers/oauthController.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";

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

const forgotSchema = z.object({
  email: z.string().email("A valid email is required"),
});

const resetSchema = z.object({
  token: z.string().min(10, "Reset token is required"),
  password: credentialsSchema.shape.password,
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

// POST /api/auth/forgot
router.post(
  "/forgot",
  authLimiter,
  validate({ body: forgotSchema }),
  requestPasswordReset
);

// POST /api/auth/reset
router.post(
  "/reset",
  authLimiter,
  validate({ body: resetSchema }),
  resetPassword
);

// POST /api/auth/refresh
router.post("/refresh", refresh);

// POST /api/auth/logout
router.post("/logout", logout);

// GET /api/auth/me
router.get("/me", requireAuth, me);

// OAuth: Google
router.get("/google", googleAuth);
router.get("/google/callback", googleCallback);

// OAuth: GitHub
router.get("/github", githubAuth);
router.get("/github/callback", githubCallback);

export default router;
