import User from "../models/User.js";
import { getPlanCredits, getNextPeriodEnd } from "../utils/planCredits.js";

/**
 * Get the logged-in user's info
 */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Update the logged-in user's details
 */
export const updateMe = async (req, res) => {
  try {
    const updates = { ...req.body };
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Handle plan change explicitly
    if (typeof updates.plan === "string") {
      const normalized =
        updates.plan === "basic" || updates.plan === "pro"
          ? updates.plan
          : "free";
      if (normalized !== user.plan) {
        user.plan = normalized;
        user.creditsTotal = getPlanCredits(normalized);
        user.creditsUsed = 0;
        user.periodStart = new Date();
        user.periodEnd = getNextPeriodEnd(user.periodStart);
      }
      delete updates.plan;
    }

    // Apply other updates (except protected fields)
    delete updates.role;
    delete updates.password;
    Object.assign(user, updates);

    await user.save();
    const safeUser = user.toObject();
    delete safeUser.password;

    res.json({ user: safeUser });
  } catch (err) {
    res.status(400).json({ error: "Failed to update user" });
  }
};

/**
 * Admin: Get all users
 */
export const getAllUsers = async (_req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

/**
 * Admin: Delete a user by ID
 */
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user" });
  }
};
