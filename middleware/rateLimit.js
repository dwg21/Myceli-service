import rateLimit from "express-rate-limit";

const rateLimitMessage = (message) => ({
  error: message,
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 180, // broad baseline per IP
  message: rateLimitMessage("Too many requests. Please slow down."),
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit repeated requests to auth endpoints like /login or /signup
export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per window
  message: rateLimitMessage(
    "Too many login/signup attempts. Please try again later.",
  ),
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable the old X-RateLimit headers
});

export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // AI chat endpoints are expensive and abuse-prone
  message: rateLimitMessage(
    "Chat rate limit reached. Please wait a minute and try again.",
  ),
  standardHeaders: true,
  legacyHeaders: false,
});
