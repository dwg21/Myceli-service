import dotenv from "dotenv";
dotenv.config();

function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing environment variable: ${name}`);
  return val;
}

export const env = {
  isProd: process.env.NODE_ENV === "production",
  accessSecret: requireEnv("JWT_ACCESS_SECRET"),
  refreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  accessTtl: process.env.ACCESS_TOKEN_TTL || "15m",
  refreshTtl: process.env.REFRESH_TOKEN_TTL || "30d",
};
