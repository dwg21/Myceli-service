import User from "../models/User.js";
import { getNextPeriodEnd, getPlanCredits } from "../utils/planCredits.js";

const LIMITS = {
  graphCreate: { field: "graphsStartedThisPeriod", limit: 5, limitType: "graphs" },
  chatCreate: { field: "chatsStartedThisPeriod", limit: 50, limitType: "chats" },
};

function resetPeriodIfNeeded(user, now = new Date()) {
  if (!user.periodEnd || now > user.periodEnd) {
    user.periodStart = now;
    user.periodEnd = getNextPeriodEnd(now);
    user.creditsTotal = getPlanCredits(user.plan);
    user.creditsUsed = 0;
    user.graphsStartedThisPeriod = 0;
    user.chatsStartedThisPeriod = 0;
    return true;
  }
  return false;
}

export const requireFreeLimit = (actionKey) => {
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

      const now = new Date();
      const periodReset = resetPeriodIfNeeded(user, now);

      const config = LIMITS[actionKey];
      if (config && user.plan === "free") {
        const current = Number(user[config.field]) || 0;
        if (current >= config.limit) {
          if (periodReset) await user.save();
          return res.status(403).json({
            error: "Free plan limit reached",
            code: "free_limit_reached",
            limitType: config.limitType,
            limit: config.limit,
            current,
            periodEnd: user.periodEnd,
          });
        }
      }

      req.limitUser = user;
      req.limitConfig = config;
      req.limitPeriodReset = periodReset;
      next();
    } catch (err) {
      console.error("usageLimits middleware error", err);
      res.status(500).json({ error: "Failed to check limits" });
    }
  };
};

export function incrementUsageCounter(user, actionKey) {
  const config = LIMITS[actionKey];
  if (!user || !config) return;
  const current = Number(user[config.field]) || 0;
  user[config.field] = current + 1;
}
