export const normalizeEmail = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildEmailLookup = (value) => {
  const normalized = normalizeEmail(value);
  if (!normalized) return null;
  return new RegExp(`^${escapeRegExp(normalized)}$`, "i");
};
