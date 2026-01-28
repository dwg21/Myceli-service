import User from "../models/User.js";
import { env } from "../config/env.js";
import {
  issueTokensForUser,
  rotateRefreshToken,
  revokeRefreshToken,
  setRefreshCookie,
} from "../services/tokenService.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import PasswordResetToken from "../models/PasswordResetToken.js";
import {
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from "../services/emailService.js";

const RESET_TOKEN_TTL_MINUTES = 60;

const buildResetToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  return { token, tokenHash, expiresAt };
};

/* ---------------- Signup ---------------- */
export const signup = async (req, res) => {
  try {
    const { name, email, password, plan, acceptedTerms, marketingOptIn } = req.body;

    if (!acceptedTerms) {
      return res.status(400).json({ error: "Terms must be accepted to sign up" });
    }

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ error: "Email already registered" });

    const normalizedPlan =
      plan === "pro" || plan === "basic" ? plan : "free";
    const startPlan = normalizedPlan === "free" ? "free" : "free"; // paid plans activate after Stripe webhook

    const user = await User.create({
      name,
      email,
      password,
      plan: startPlan,
      creditsTotal: undefined, // use schema default per plan
      creditsUsed: 0,
      periodStart: undefined,
      periodEnd: undefined,
      acceptedTermsAt: new Date(),
      termsVersion: env.termsVersion,
      marketingOptIn: Boolean(marketingOptIn),
      marketingOptInAt: marketingOptIn ? new Date() : undefined,
    });

    const { accessToken, refreshToken } = await issueTokensForUser(
      user,
      req
    );
    setRefreshCookie(res, refreshToken);

    // Fire-and-forget welcome email; don't block signup if email fails
    sendWelcomeEmail({ to: user.email, name: user.name, plan: user.plan }).catch(
      (err) => console.error("Welcome email error:", err)
    );

    res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        marketingOptIn: user.marketingOptIn,
        acceptedTermsAt: user.acceptedTermsAt,
        termsVersion: user.termsVersion,
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
        marketingOptIn: user.marketingOptIn,
        acceptedTermsAt: user.acceptedTermsAt,
        termsVersion: user.termsVersion,
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
    const user = await User.findById(req.user.id).select("name email role plan planInterval creditsTotal creditsUsed periodEnd marketingOptIn acceptedTermsAt termsVersion");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan || "free",
        planInterval: user.planInterval || "monthly",
        marketingOptIn: user.marketingOptIn,
        acceptedTermsAt: user.acceptedTermsAt,
        termsVersion: user.termsVersion,
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

/* ---------------- Request password reset ---------------- */
export const requestPasswordReset = async (req, res) => {
  const { email } = req.body;
  const genericResponse = {
    message: "If an account exists for that email, we'll send reset instructions.",
  };

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.json(genericResponse);
    }

    const { token, tokenHash, expiresAt } = buildResetToken();
    await PasswordResetToken.deleteMany({ user: user._id });
    await PasswordResetToken.create({
      user: user._id,
      tokenHash,
      expiresAt,
      used: false,
    });

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      token,
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
    });

    res.json(genericResponse);
  } catch (err) {
    console.error("Password reset request error:", err);
    res.json(genericResponse);
  }
};

/* ---------------- Complete password reset ---------------- */
export const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  try {
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const reset = await PasswordResetToken.findOne({
      tokenHash,
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!reset) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const user = await User.findById(reset.user);
    if (!user) {
      await PasswordResetToken.deleteOne({ _id: reset._id });
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    user.password = password;
    await user.save();

    reset.used = true;
    reset.usedAt = new Date();
    await reset.save();
    // Remove any other reset tokens for this user now that this one is consumed
    await PasswordResetToken.deleteMany({ user: user._id, _id: { $ne: reset._id } });

    res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
};
