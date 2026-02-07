import User from "../models/User.js";
import { Chat } from "../models/Chat.js";
import { getPlanCredits, getNextPeriodEnd } from "../utils/planCredits.js";
import { estimateActionCreditCost } from "../utils/creditCosting.js";

export const ACTION_COSTS = {
  // Fallback costs only; runtime cost is model/action-aware.
  chatMessage: 1,
  chatStream: 1,
  generateMainIdeas: 1,
  expandIdea: 1,
  imageGenerate: 2,
  imageRegenerate: 2,
};

function extractHistoryChars(history) {
  if (!history) return 0;
  try {
    return JSON.stringify(history).length;
  } catch {
    return 0;
  }
}

function extractMessageChars(messages) {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce((sum, msg) => {
    return sum + String(msg?.content || "").length;
  }, 0);
}

async function resolveActionContext(actionKey, req) {
  const body = req.body || {};

  if (actionKey === "generateMainIdeas") {
    return {
      modelId: body.modelId,
      inputChars:
        String(body.prompt || "").length + String(body.context || "").length,
    };
  }

  if (actionKey === "expandIdea") {
    return {
      modelId: body.modelId,
      inputChars:
        String(body.ideaTitle || "").length + String(body.prompt || "").length,
      historyChars: extractHistoryChars(body.history),
    };
  }

  if (actionKey === "imageGenerate" || actionKey === "imageRegenerate") {
    return {
      modelIds: Array.isArray(body.modelIds) ? body.modelIds : [],
      imagePreset: body.generationPreset,
    };
  }

  if (actionKey === "chatMessage" || actionKey === "chatStream") {
    const chatId = body.chatId;
    const content = String(body.content || "");
    if (!chatId) {
      return { inputChars: content.length };
    }

    const chat = await Chat.findById(chatId).select("modelId messages");
    if (!chat) {
      return { inputChars: content.length };
    }

    return {
      modelId: chat.modelId,
      inputChars: content.length,
      historyChars: extractMessageChars(chat.messages),
    };
  }

  return {};
}

/**
 * Middleware factory to enforce and deduct credits for a given action key.
 * Usage: router.post("/message", requireCredits("chatMessage"), handler)
 */
export const requireCredits = (actionKey) => {
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

      const actionContext = await resolveActionContext(actionKey, req);
      const computedCost = estimateActionCreditCost({
        actionKey,
        ...actionContext,
      });
      const cost = Number.isFinite(computedCost)
        ? Math.max(1, computedCost)
        : ACTION_COSTS[actionKey] ?? 1;

      // Reset period if expired or missing
      const now = new Date();
      if (!user.periodEnd || now > user.periodEnd) {
        user.periodStart = now;
        user.periodEnd = getNextPeriodEnd(now);
        user.creditsTotal = getPlanCredits(user.plan);
        user.creditsUsed = 0;
      }

      const creditsAllowance = (user.creditsTotal || 0) + (user.creditsBonus || 0);
      const creditsRemainingBefore = Math.max(creditsAllowance - user.creditsUsed, 0);
      if (user.creditsUsed + cost > creditsAllowance) {
        console.info(
          "[credits] blocked",
          JSON.stringify({
            userId,
            actionKey,
            route: req.originalUrl || req.url,
            method: req.method,
            modelId: actionContext.modelId || null,
            modelIds: actionContext.modelIds || null,
            cost,
            creditsRemainingBefore,
            creditsAllowance,
            creditsUsed: user.creditsUsed || 0,
          }),
        );
        return res.status(402).json({
          error: "Credits exhausted",
          code: "credits_exhausted",
          creditsRemaining: creditsRemainingBefore,
          creditsTotal: user.creditsTotal,
          creditsBonus: user.creditsBonus || 0,
          creditsRequired: cost,
          periodEnd: user.periodEnd,
        });
      }

      user.creditsUsed += cost;
      await user.save();
      const creditsRemainingAfter = Math.max(creditsAllowance - user.creditsUsed, 0);

      console.info(
        "[credits] charged",
        JSON.stringify({
          userId,
          actionKey,
          route: req.originalUrl || req.url,
          method: req.method,
          modelId: actionContext.modelId || null,
          modelIds: actionContext.modelIds || null,
          cost,
          creditsRemainingBefore,
          creditsRemainingAfter,
          creditsAllowance,
          creditsUsed: user.creditsUsed || 0,
        }),
      );

      req.userCredits = {
        remaining: creditsRemainingAfter,
        total: user.creditsTotal,
        bonus: user.creditsBonus || 0,
        charged: cost,
        periodEnd: user.periodEnd,
      };

      next();
    } catch (err) {
      console.error("Credits middleware error:", err);
      res.status(500).json({ error: "Failed to process credits" });
    }
  };
};
