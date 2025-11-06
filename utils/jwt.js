import jwt from "jsonwebtoken";

export const signAccessToken = () =>
  jwt.sign(payload, env.accessSecret, { expiresIn: env.accessTtl });

export const signRefreshToken = () =>
  jwt.sign(payload, env.refreshSecret, { expiresIn: env.refreshTtl });

export const verifyAccess = () => jwt.verify(token, env.accessSecret);

export const verifyRefresh = () => jwt.verify(token, env.refreshSecret);
