import User from "../models/User.js";
import { getPlanCredits, getNextPeriodEnd } from "../utils/planCredits.js";

/**
 * Reset credits for users whose period has expired (or missing).
 * - Sets a new periodStart/periodEnd (1 month from now)
 * - Resets creditsUsed to 0
 * - Sets creditsTotal based on current plan
 */
export async function resetExpiredCredits(now = new Date()) {
  const cursor = User.find({
    $or: [{ periodEnd: { $exists: false } }, { periodEnd: { $lte: now } }],
  }).cursor();

  let updated = 0;
  for await (const user of cursor) {
    user.periodStart = now;
    user.periodEnd = getNextPeriodEnd(now);
    user.creditsTotal = getPlanCredits(user.plan);
    user.creditsUsed = 0;
    await user.save();
    updated += 1;
  }
  return updated;
}

/**
 * Kick off a simple interval-based scheduler (runs every 6 hours).
 * Runs once on start, then on the interval.
 */
export function startCreditResetScheduler() {
  const run = async () => {
    try {
      const count = await resetExpiredCredits();
      if (count) {
        console.log(`🌀 Credits reset for ${count} user(s)`);
      }
    } catch (err) {
      console.error("Failed to reset credits:", err);
    }
  };

  // run once at startup
  run();
  // run every 6 hours
  const intervalMs = 6 * 60 * 60 * 1000;
  return setInterval(run, intervalMs);
}
