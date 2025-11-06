import crypto from "crypto";

/**
 * Hash a string (like a refresh token) using SHA-256.
 * This ensures the actual token value is never stored in plaintext.
 *
 * @param {string} input - The token or value to hash
 * @returns {string} A hex-encoded SHA-256 hash
 */
export const sha256 = (input) => {
  return crypto.createHash("sha256").update(input).digest("hex");
};
