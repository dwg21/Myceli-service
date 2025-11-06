/**
 * Global error-handling middleware
 * Catches thrown errors or unhandled rejections in async routes
 */
export const errorHandler = (err, req, res, next) => {
  console.error("🔥 Error:", err);

  // Known error types
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token" });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Token expired" });
  }

  const status = err.statusCode || 500;
  const message = err.message || "Internal server error";

  res.status(status).json({ error: message });
};
