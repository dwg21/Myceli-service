import rateLimit from "express-rate-limit";

// Limit repeated requests to auth endpoints like /login or /signup
export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per window
  message: {
    error: "Too many login/signup attempts. Please try again later.",
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable the old X-RateLimit headers
});
