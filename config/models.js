export const MODEL_CATALOG = {
  "openai/gpt-4.1-mini": {
    id: "openai/gpt-4.1-mini",
    provider: "openai",
    type: "text",
    capabilities: ["chat", "graph"],
    // Prices are USD per 1K tokens.
    unitCost: {
      inputPer1k: 0.0004,
      outputPer1k: 0.0016,
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
      inputPer1k: 0.0001,
      outputPer1k: 0.0004,
    },
    displayName: "GPT-4.1 Nano",
    default: false,
  },
  "anthropic/claude-4.5-haiku": {
    id: "anthropic/claude-haiku-4-5",
    provider: "anthropic",
    type: "text",
    capabilities: ["chat", "graph"],
    unitCost: {
      inputPer1k: 0.001,
      outputPer1k: 0.005,
    },
    displayName: "Claude 4.5 Haiku",
    default: false,
  },
  "anthropic/claude-4.5-sonnet": {
    id: "anthropic/claude-sonnet-4-5",
    provider: "anthropic",
    type: "text",
    capabilities: ["chat", "graph"],
    unitCost: {
      inputPer1k: 0.003,
      outputPer1k: 0.015,
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
      inputPer1k: 0.0003,
      outputPer1k: 0.0025,
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
      // Gemini 2.5 Pro standard tier for prompts <= 200k tokens.
      inputPer1k: 0.000625,
      outputPer1k: 0.005,
    },
    displayName: "Gemini 2.5 Pro",
    default: false,
  },
  "openai/gpt-image-1": {
    id: "openai/gpt-image-1",
    provider: "openai",
    type: "image",
    capabilities: ["image"],
    // Approx output pricing for square generations (low/medium/high).
    perImageUsdByQuality: {
      low: 0.01,
      medium: 0.04,
      high: 0.17,
    },
    displayName: "DALL·E (OpenAI)",
    default: false,
  },
  "google/imagen-4.0-generate-001": {
    id: "google/imagen-4.0-generate-001",
    provider: "google",
    type: "image",
    capabilities: ["image"],
    perImageUsd: 0.04,
    displayName: "Imagen 4",
    default: true,
  },
  "google/imagen-4.0-fast-generate-001": {
    id: "google/imagen-4.0-fast-generate-001",
    provider: "google",
    type: "image",
    capabilities: ["image"],
    perImageUsd: 0.02,
    displayName: "Imagen 4 Fast",
    default: false,
  },
  "google/imagen-4.0-ultra-generate-001": {
    id: "google/imagen-4.0-ultra-generate-001",
    provider: "google",
    type: "image",
    capabilities: ["image"],
    perImageUsd: 0.06,
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
