import jwt from "jsonwebtoken";
import ms from "ms";
import { randomUUID, createHash } from "crypto";
import RefreshToken from "../models/RefreshToken.js";
import { sha256 } from "../utils/crypto.js";
import { env } from "../config/env.js";

const signAccessToken = (payload) =>
  jwt.sign(payload, env.accessSecret, { expiresIn: env.accessTtl });

const signRefreshToken = (payload) =>
  jwt.sign(payload, env.refreshSecret, { expiresIn: env.refreshTtl });

const fingerprintFromRequest = (req) => {
  const ua = req.headers["user-agent"] || "unknown";
  const ip =
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.connection?.remoteAddress ||
    "unknown";
  // Keep the fingerprint stable but opaque
  return createHash("sha256").update(`${ua}|${ip}`).digest("hex");
};

export const setRefreshCookie = (res, token) => {
  res.cookie("rt", token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: ms(env.refreshTtl),
  });
};

export const issueTokensForUser = async (user, req) => {
  const refreshJti = randomUUID();
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    jti: randomUUID(),
  });
  const refreshToken = signRefreshToken({
    sub: user.id,
    role: user.role,
    jti: refreshJti,
  });

  await RefreshToken.create({
    user: user._id,
    tokenHash: sha256(refreshToken),
    fingerprintHash: fingerprintFromRequest(req),
    userAgent: req.headers["user-agent"] || "unknown",
    ip: req.ip || req.connection?.remoteAddress,
    expiresAt: new Date(Date.now() + ms(env.refreshTtl)),
  });

  return { accessToken, refreshToken };
};

export const rotateRefreshToken = async (oldToken, decoded, req) => {
  const fingerprintHash = fingerprintFromRequest(req);
  const tokenDoc = await RefreshToken.findOne({
    user: decoded.sub,
    tokenHash: sha256(oldToken),
    revokedAt: null,
  });

  if (!tokenDoc || tokenDoc.expiresAt < new Date()) return null;
  if (tokenDoc.fingerprintHash && tokenDoc.fingerprintHash !== fingerprintHash)
    return null;

  tokenDoc.revokedAt = new Date();
  const newRefreshToken = signRefreshToken({
    sub: decoded.sub,
    role: decoded.role,
    jti: randomUUID(),
  });
  tokenDoc.replacedByTokenHash = sha256(newRefreshToken);
  await tokenDoc.save();

  await RefreshToken.create({
    user: decoded.sub,
    tokenHash: sha256(newRefreshToken),
    fingerprintHash,
    userAgent: req.headers["user-agent"] || "unknown",
    ip: req.ip || req.connection?.remoteAddress,
    expiresAt: new Date(Date.now() + ms(env.refreshTtl)),
  });

  const newAccessToken = signAccessToken({
    sub: decoded.sub,
    role: decoded.role,
    jti: randomUUID(),
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

export const revokeRefreshToken = async (token) => {
  try {
    const decoded = jwt.verify(token, env.refreshSecret);
    await RefreshToken.updateOne(
      { user: decoded.sub, tokenHash: sha256(token) },
      { revokedAt: new Date() }
    );
  } catch {
    // ignore invalid token
  }
};
