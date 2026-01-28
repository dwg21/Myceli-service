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
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  githubRedirectUri: process.env.GITHUB_REDIRECT_URI,
  frontendUrl: process.env.FRONTEND_URL || process.env.CORS_ORIGIN,
  resendApiKey: process.env.RESEND_API_KEY,
  supportEmail: process.env.SUPPORT_EMAIL || "support@myceliapp.com",
  stripeSecretKey: requireEnv("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: requireEnv("STRIPE_WEBHOOK_SECRET"),
  stripePriceBasicMonthly: requireEnv("STRIPE_PRICE_BASIC_MONTHLY"),
  stripePriceProMonthly: requireEnv("STRIPE_PRICE_PRO_MONTHLY"),
  stripePriceBasicAnnual: requireEnv("STRIPE_PRICE_BASIC_ANNUAL"),
  stripePriceProAnnual: requireEnv("STRIPE_PRICE_PRO_ANNUAL"),
  termsVersion: process.env.TERMS_VERSION || "2026-01-28",
};
