import jwt from "jsonwebtoken";
import ms from "ms";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import { sha256 } from "../utils/crypto.js";
import { env } from "../config/env.js";

/* ---------------- Helper functions ---------------- */

const signAccessToken = (payload) =>
  jwt.sign(payload, env.accessSecret, { expiresIn: env.accessTtl });

const signRefreshToken = (payload) =>
  jwt.sign(payload, env.refreshSecret, { expiresIn: env.refreshTtl });

const setRefreshCookie = (res, token) => {
  res.cookie("rt", token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: ms(env.refreshTtl),
  });
};

/* ---------------- Signup ---------------- */
export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ error: "Email already registered" });

    const user = await User.create({ name, email, password });

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id, role: user.role });

    await RefreshToken.create({
      user: user._id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + ms(env.refreshTtl)),
    });

    setRefreshCookie(res, refreshToken);
    res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
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

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id, role: user.role });

    await RefreshToken.create({
      user: user._id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + ms(env.refreshTtl)),
    });

    setRefreshCookie(res, refreshToken);
    res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
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
    const tokenDoc = await RefreshToken.findOne({
      user: decoded.sub,
      tokenHash: sha256(rt),
      revokedAt: null,
    });

    if (!tokenDoc || tokenDoc.expiresAt < new Date()) {
      return res
        .status(401)
        .json({ error: "Invalid or expired refresh token" });
    }

    // Rotate
    tokenDoc.revokedAt = new Date();
    const newRt = signRefreshToken({ sub: decoded.sub, role: decoded.role });
    tokenDoc.replacedByTokenHash = sha256(newRt);
    await tokenDoc.save();

    await RefreshToken.create({
      user: decoded.sub,
      tokenHash: sha256(newRt),
      expiresAt: new Date(Date.now() + ms(env.refreshTtl)),
    });

    setRefreshCookie(res, newRt);
    const newAt = signAccessToken({ sub: decoded.sub, role: decoded.role });
    res.json({ accessToken: newAt });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(401).json({ error: "Refresh failed" });
  }
};

/* ---------------- Logout ---------------- */
export const logout = async (req, res) => {
  const rt = req.cookies?.rt;
  if (rt) {
    try {
      const decoded = jwt.verify(rt, env.refreshSecret);
      await RefreshToken.updateOne(
        { user: decoded.sub, tokenHash: sha256(rt) },
        { revokedAt: new Date() }
      );
    } catch {
      /* ignore invalid token */
    }
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
    const user = await User.findById(req.user.id).select("name email role");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Fetch current user error:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
};
