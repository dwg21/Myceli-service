import User from "../models/User.js";
import {
  PLAN_CREDITS,
  getPlanCredits,
  getNextPeriodEnd,
} from "../utils/planCredits.js";

export const ACTION_COSTS = {
  chatMessage: 1,
  chatStream: 1,
  generateMainIdeas: 3,
  expandIdea: 2,
  imageGenerate: 8,
  imageRegenerate: 8,
};

/**
 * Middleware factory to enforce and deduct credits for a given action key.
 * Usage: router.post("/message", requireCredits("chatMessage"), handler)
 */
export const requireCredits = (actionKey) => {
  const cost = ACTION_COSTS[actionKey] ?? 1;

  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Reset period if expired or missing
      const now = new Date();
      if (!user.periodEnd || now > user.periodEnd) {
        user.periodStart = now;
        user.periodEnd = getNextPeriodEnd(now);
        user.creditsTotal = getPlanCredits(user.plan);
        user.creditsUsed = 0;
      }

      if (user.creditsUsed + cost > user.creditsTotal) {
        return res.status(402).json({
          error: "Credits exhausted",
          code: "credits_exhausted",
          creditsRemaining: Math.max(user.creditsTotal - user.creditsUsed, 0),
          creditsTotal: user.creditsTotal,
          periodEnd: user.periodEnd,
        });
      }

      user.creditsUsed += cost;
      await user.save();

      req.userCredits = {
        remaining: user.creditsTotal - user.creditsUsed,
        total: user.creditsTotal,
        periodEnd: user.periodEnd,
      };

      next();
    } catch (err) {
      console.error("Credits middleware error:", err);
      res.status(500).json({ error: "Failed to process credits" });
    }
  };
};
