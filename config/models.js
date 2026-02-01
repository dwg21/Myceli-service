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
  // ----------------------- IMAGE MODELS -------------------------------------
  "openai/gpt-image-1": {
    id: "openai/gpt-image-1",
    provider: "openai",
    type: "image",
    capabilities: ["image"],
    unitCost: {
      inputPer1k: 0.000004, // placeholder
      outputPer1k: 0.000016,
    },
    displayName: "DALL·E (OpenAI)",
    default: false,
  },
  // ----------------------- IMAGE MODELS (Google Imagen) ----------------------
  "google/imagen-4.0-generate-001": {
    id: "google/imagen-4.0-generate-001",
    provider: "google",
    type: "image",
    capabilities: ["image"],
    unitCost: {
      inputPer1k: 0.000002, // placeholder; adjust when pricing is finalized
      outputPer1k: 0.000012,
    },
    displayName: "Imagen 4",
    default: true, // balanced/standard default
  },
  "google/imagen-4.0-fast-generate-001": {
    id: "google/imagen-4.0-fast-generate-001",
    provider: "google",
    type: "image",
    capabilities: ["image"],
    unitCost: {
      inputPer1k: 0.0000012,
      outputPer1k: 0.000006,
    },
    displayName: "Imagen 4 Fast",
    default: false,
  },
  "google/imagen-4.0-ultra-generate-001": {
    id: "google/imagen-4.0-ultra-generate-001",
    provider: "google",
    type: "image",
    capabilities: ["image"],
    unitCost: {
      inputPer1k: 0.000004,
      outputPer1k: 0.00002,
    },
    displayName: "Imagen 4 Ultra",
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
