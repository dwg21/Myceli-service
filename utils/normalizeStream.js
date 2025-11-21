export function normalizeDelta(prev, delta) {
  // delta may contain full tokens, spaces, newlines, or punctuation
  // DO NOT add formatting artificially — only reconstruct safe spaces

  if (!delta) return "";

  let out = "";

  const prevLast = prev.slice(-1);
  const startsWithWord = /^[A-Za-z0-9]/.test(delta);
  const prevEndsWithWord = /[A-Za-z0-9]/.test(prevLast);

  // Insert a space ONLY when both sides are alphanumeric
  if (prevEndsWithWord && startsWithWord) {
    out += " ";
  }

  // Preserve markdown raw
  out += delta;

  return out;
}
