import User from "../models/User.js";

/**
 * Require the user to have one of the allowed plans.
 * Usage: router.post("/generate-image", requireAuth, requirePlan(["basic", "pro"]), handler)
 */
export const requirePlan = (allowedPlans = []) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await User.findById(userId).select("plan");
      const plan = user?.plan || "free";

      if (!allowedPlans.includes(plan)) {
        return res.status(403).json({
          error: "Plan not permitted for this action",
          code: "plan_forbidden",
          plan,
          required: allowedPlans,
        });
      }

      next();
    } catch (err) {
      console.error("requirePlan error:", err);
      res.status(500).json({ error: "Failed to validate plan" });
    }
  };
};
