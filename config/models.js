export const MODEL_CATALOG = {
  "openai/gpt-4.1-mini": {
    id: "openai/gpt-4.1-mini",
    provider: "openai",
    type: "text",
    capabilities: ["chat", "graph"],
    // Costs are informational (credits per 1K tokens); real billing lives in Stripe.
    unitCost: {
      inputPer1k: 0.0000004,
      outputPer1k: 0.0000016,
    },
    displayName: "GPT-4.1 Mini",
    default: true,
  },
  "openai/gpt-4.1-nano": {
    id: "openai/gpt-4.1-nano",
    provider: "openai",
    type: "text",
    capabilities: ["chat", "graph"],
    unitCost: {
      inputPer1k: 0.0000001, // $0.10 / 1M input
      outputPer1k: 0.0000004, // $0.40 / 1M output
    },
    displayName: "GPT-4.1 Nano",
    default: false,
  },
  "anthropic/claude-4.5-haiku": {
    // Anthropic's current alias for Haiku 4.5 (API id: claude-haiku-4-5-20251001)
    id: "anthropic/claude-haiku-4-5",
    provider: "anthropic",
    type: "text",
    capabilities: ["chat", "graph"],
    unitCost: {
      inputPer1k: 0.000001, // $1 / 1M input
      outputPer1k: 0.000005, // $5 / 1M output
    },
    displayName: "Claude 4.5 Haiku",
    default: false,
  },
  "anthropic/claude-4.5-sonnet": {
    // Anthropic's current alias for Sonnet 4.5 (API id: claude-sonnet-4-5-20250929)
    id: "anthropic/claude-sonnet-4-5",
    provider: "anthropic",
    type: "text",
    capabilities: ["chat", "graph"],
    unitCost: {
      inputPer1k: 0.000003, // $3 / 1M input
      outputPer1k: 0.000015, // $15 / 1M output
    },
    displayName: "Claude 4.5 Sonnet",
    default: false,
  },
  "google/gemini-2.5-flash": {
    id: "google/gemini-2.5-flash",
    provider: "google",
    type: "text",
    capabilities: ["chat", "graph"],
    unitCost: {
      inputPer1k: 0.0000005, // placeholder costs; adjust when pricing finalized
      outputPer1k: 0.000003,
    },
    displayName: "Gemini 2.5 Flash",
    default: false,
  },
  "google/gemini-2.5-pro": {
    id: "google/gemini-2.5-pro",
    provider: "google",
    type: "text",
    capabilities: ["chat", "graph"],
    unitCost: {
      inputPer1k: 0.00000125,
      outputPer1k: 0.00001,
    },
    displayName: "Gemini 2.5 Pro",
    default: false,
  },
};

export function getDefaultModelId(type = "text") {
  const entry = Object.values(MODEL_CATALOG).find(
    (m) => m.type === type && m.default,
  );
  if (entry) return entry.id;
  const fallback = Object.values(MODEL_CATALOG).find((m) => m.type === type);
  if (fallback) return fallback.id;
  return null;
}
