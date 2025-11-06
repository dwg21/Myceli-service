import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Middleware: Require valid JWT access token
 */
export const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.accessSecret);
    // Attach user info to request object
    req.user = { id: decoded.sub, role: decoded.role };
    next();
  } catch (err) {
    console.log(err, "!!! err ");
    return res
      .status(401)
      .json({ error: "Unauthorized: Invalid or expired token" });
  }
};

/**
 * Middleware: Require user to have one of the given roles
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "Forbidden: Insufficient privileges" });
    }
    next();
  };
};

/**
 * Middleware: Require that user is editing their own resource
 * or has admin privileges.
 */
export const requireSelfOrAdmin = (paramKey = "id") => {
  return (req, res, next) => {
    const userId = req.user?.id;
    const role = req.user?.role;
    const targetId = req.params[paramKey] || req.body[paramKey];

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: Missing user" });
    }

    // Allow if admin
    if (role === "admin") return next();

    // Allow only if user is editing their own resource
    if (targetId && targetId.toString() === userId.toString()) {
      return next();
    }

    return res
      .status(403)
      .json({ error: "Forbidden: Cannot modify another user's data" });
  };
};
