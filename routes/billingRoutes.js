import { Router } from "express";
import { z } from "zod";
import {
  createCheckoutSession,
  createPortalSession,
} from "../controllers/billingController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const checkoutSchema = z.object({
  plan: z.enum(["basic", "pro"]),
  billingInterval: z.enum(["monthly", "annual"]).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

router.post(
  "/create-checkout-session",
  requireAuth,
  validate({ body: checkoutSchema }),
  createCheckoutSession
);

router.post(
  "/create-portal-session",
  requireAuth,
  validate({
    body: z.object({
      returnUrl: z.string().url().optional(),
    }),
  }),
  createPortalSession
);

export default router;
