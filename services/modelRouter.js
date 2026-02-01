import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { MODEL_CATALOG, getDefaultModelId } from "../config/models.js";
import { getOpenAIClient } from "../utils/openaiClient.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const INVALID_MODEL_ERROR = (id, reason = "Unsupported model") =>
  Object.assign(new Error(`${reason}: ${id || "undefined"}`), { status: 400 });

function ensureModel(id, type) {
  // map legacy Google ids to current (latest) variants
  const aliasMap = {
    // Legacy → canonical Gemini 2.5 ids
    "google/gemini-1.5-flash": "google/gemini-2.5-flash",
    "google/gemini-1.5-flash-latest": "google/gemini-2.5-flash",
    "google/gemini-1.5-pro": "google/gemini-2.5-pro",
    "google/gemini-1.5-pro-latest": "google/gemini-2.5-pro",
    "google/gemini-flash-latest": "google/gemini-2.5-flash",
    "google/gemini-pro-latest": "google/gemini-2.5-pro",
    "google/gemini-2.0-flash": "google/gemini-2.0-flash", // keep for compatibility
  };
  const resolvedId = aliasMap[id] || id;

  const model =
    (resolvedId && MODEL_CATALOG[resolvedId]) ||
    (getDefaultModelId(type) && MODEL_CATALOG[getDefaultModelId(type)]);
  if (!model) throw INVALID_MODEL_ERROR(id, "No model available");
  if (model.type !== type) {
    throw INVALID_MODEL_ERROR(id, `Model type mismatch (expected ${type})`);
  }
  return model;
}

/**
 * Resolve a text model for chat/graph generation.
 * Returns both the ai-sdk model (for streaming) and the string name for OpenAI responses API.
 */
export function resolveTextModel(modelId) {
  const model = ensureModel(modelId, "text");
  if (model.provider === "openai") {
    return {
      ...model,
      aiModel: openai(model.id.replace("openai/", "")),
      modelName: model.id.replace("openai/", ""),
    };
  }
  if (model.provider === "anthropic") {
    return {
      ...model,
      aiModel: anthropic(model.id.replace("anthropic/", "")),
      modelName: model.id.replace("anthropic/", ""),
    };
  }
  if (model.provider === "google") {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw Object.assign(
        new Error("Missing GOOGLE_API_KEY for Google model"),
        { status: 500 }
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    return {
      ...model,
      aiModel: null, // google not using ai-sdk streamText directly
      modelName: model.id.replace("google/", ""),
      genAI,
    };
  }
  throw INVALID_MODEL_ERROR(modelId, "Unsupported provider");
}

/**
 * Placeholder for image models; today we keep existing OpenAI image flow.
 */
export function resolveImageModel(modelId) {
  const model =
    (modelId && MODEL_CATALOG[modelId]) ||
    (getDefaultModelId("image") && MODEL_CATALOG[getDefaultModelId("image")]);
  if (!model) {
    // Fall back to existing implicit OpenAI image model string
    return { id: "openai/gpt-image-1", provider: "openai", modelName: "gpt-image-1" };
  }
  if (model.provider === "openai") {
    return { ...model, modelName: model.id.replace("openai/", "") };
  }
  if (model.provider === "google") {
    return { ...model, modelName: model.id.replace("google/", "") };
  }
  return model;
}
