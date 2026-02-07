import { MODEL_CATALOG, getDefaultModelId } from "../config/models.js";

export const CREDITS_PER_USD = 1000;

const AVG_CHARS_PER_TOKEN = 4;

const TEXT_ACTION_DEFAULTS = {
  chatMessage: { outputTokens: 220, systemChars: 700 },
  chatStream: { outputTokens: 220, systemChars: 700 },
  generateMainIdeas: { outputTokens: 1200, systemChars: 1000 },
  expandIdea: { outputTokens: 900, systemChars: 1200 },
};

const PRESET_IMAGE_DEFAULTS = {
  standard: "google/imagen-4.0-fast-generate-001",
  balanced: "google/imagen-4.0-generate-001",
  "high-detail": "google/imagen-4.0-ultra-generate-001",
};

function toTokens(chars) {
  const safeChars = Number.isFinite(chars) ? Math.max(0, chars) : 0;
  return Math.ceil(safeChars / AVG_CHARS_PER_TOKEN);
}

export function usdToCredits(usd, minimum = 1) {
  const raw = Math.ceil(Math.max(0, usd || 0) * CREDITS_PER_USD);
  return Math.max(minimum, raw);
}

function resolveModel(modelId, type = "text") {
  if (modelId && MODEL_CATALOG[modelId]) return MODEL_CATALOG[modelId];
  const fallbackId = getDefaultModelId(type);
  if (fallbackId && MODEL_CATALOG[fallbackId]) return MODEL_CATALOG[fallbackId];
  return null;
}

function estimateTextUsd({
  actionKey,
  modelId,
  inputChars = 0,
  historyChars = 0,
}) {
  const model = resolveModel(modelId, "text");
  if (!model?.unitCost) return 0;

  const defaults =
    TEXT_ACTION_DEFAULTS[actionKey] || TEXT_ACTION_DEFAULTS.chatMessage;
  const inputTokens =
    toTokens(inputChars) +
    toTokens(historyChars) +
    toTokens(defaults.systemChars);
  const outputTokens = defaults.outputTokens;

  const inputUsd = (inputTokens / 1000) * (model.unitCost.inputPer1k || 0);
  const outputUsd = (outputTokens / 1000) * (model.unitCost.outputPer1k || 0);

  return inputUsd + outputUsd;
}

function getImageModelUsd(modelId, quality = "medium") {
  const model = resolveModel(modelId, "image");
  if (!model) return 0;

  if (model.perImageUsdByQuality) {
    if (model.perImageUsdByQuality[quality] != null) {
      return model.perImageUsdByQuality[quality];
    }
    if (model.perImageUsdByQuality.medium != null) {
      return model.perImageUsdByQuality.medium;
    }
  }

  return model.perImageUsd || 0;
}

export function estimateActionCreditCost({
  actionKey,
  modelId,
  modelIds,
  inputChars,
  historyChars,
  imageCount,
  imageQuality,
  imagePreset,
}) {
  if (actionKey === "imageGenerate" || actionKey === "imageRegenerate") {
    const requestedModelIds = Array.isArray(modelIds)
      ? modelIds.filter((id) => typeof id === "string" && id.trim())
      : [];

    const activeModelIds =
      requestedModelIds.length > 0
        ? requestedModelIds
        : [
            modelId ||
              PRESET_IMAGE_DEFAULTS[imagePreset] ||
              getDefaultModelId("image") ||
              "openai/gpt-image-1",
          ];

    const count = Number.isFinite(imageCount)
      ? Math.max(1, Math.floor(imageCount))
      : 1;

    const quality =
      imageQuality ||
      (imagePreset === "standard"
        ? "low"
        : imagePreset === "high-detail"
          ? "high"
          : "medium");

    const totalUsd = activeModelIds.reduce((sum, mid) => {
      return sum + getImageModelUsd(mid, quality);
    }, 0);

    return usdToCredits(totalUsd * count);
  }

  const usd = estimateTextUsd({
    actionKey,
    modelId,
    inputChars,
    historyChars,
  });

  return usdToCredits(usd);
}

export function getTextActionDefaults() {
  return { ...TEXT_ACTION_DEFAULTS };
}
