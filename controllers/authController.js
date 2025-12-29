import User from "../models/User.js";
import { env } from "../config/env.js";
import {
  issueTokensForUser,
  rotateRefreshToken,
  revokeRefreshToken,
  setRefreshCookie,
} from "../services/tokenService.js";
import jwt from "jsonwebtoken";

/* ---------------- Signup ---------------- */
export const signup = async (req, res) => {
  try {
    const { name, email, password, plan } = req.body;
    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ error: "Email already registered" });

    const normalizedPlan =
      plan === "pro" || plan === "basic" ? plan : "free";

    const user = await User.create({
      name,
      email,
      password,
      plan: normalizedPlan,
      creditsTotal: undefined, // use schema default per plan
      creditsUsed: 0,
      periodStart: undefined,
      periodEnd: undefined,
    });

    const { accessToken, refreshToken } = await issueTokensForUser(
      user,
      req
    );
    setRefreshCookie(res, refreshToken);
    res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        creditsTotal: user.creditsTotal,
        creditsUsed: user.creditsUsed,
        periodEnd: user.periodEnd,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
};

/* ---------------- Login ---------------- */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { accessToken, refreshToken } = await issueTokensForUser(
      user,
      req
    );
    setRefreshCookie(res, refreshToken);
    res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan || "free",
        creditsTotal: user.creditsTotal,
        creditsUsed: user.creditsUsed,
        periodEnd: user.periodEnd,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
};

/* ---------------- Refresh ---------------- */
export const refresh = async (req, res) => {
  const rt = req.cookies?.rt;
  if (!rt) return res.sendStatus(401);

  try {
    const decoded = jwt.verify(rt, env.refreshSecret);
    const rotated = await rotateRefreshToken(rt, decoded, req);
    if (!rotated) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }
    setRefreshCookie(res, rotated.refreshToken);
    res.json({ accessToken: rotated.accessToken });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(401).json({ error: "Refresh failed" });
  }
};

/* ---------------- Logout ---------------- */
export const logout = async (req, res) => {
  const rt = req.cookies?.rt;
  if (rt) {
    await revokeRefreshToken(rt);
  }
  res.clearCookie("rt", { path: "/api/auth" });
  res.json({ message: "Logged out successfully" });
};

/* ---------------- Get current user ---------------- */
export const me = async (req, res) => {
  // requireAuth middleware populates req.user
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await User.findById(req.user.id).select("name email role plan creditsTotal creditsUsed periodEnd");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan || "free",
        creditsTotal: user.creditsTotal,
        creditsUsed: user.creditsUsed,
        periodEnd: user.periodEnd,
      },
    });
  } catch (err) {
    console.error("Fetch current user error:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
};
