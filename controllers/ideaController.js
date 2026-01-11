import { IdeaGraph } from "../models/ideaGraph.js";
import { getOpenAIClient } from "../utils/openaiClient.js";
import { storageAvailable, uploadIdeaImage } from "../services/storageService.js";
import crypto from "crypto";

const IMAGE_PRESETS = {
  // Map to provider-supported size/quality values
  standard: { size: "1024x1024", quality: "low" },
  balanced: { size: "1024x1024", quality: "medium" },
  "high-detail": { size: "1024x1024", quality: "high" },
};

const resolveImageSettings = (preset) => {
  if (typeof preset !== "string") return IMAGE_PRESETS.standard;
  return IMAGE_PRESETS[preset] || IMAGE_PRESETS.standard;
};

/* -------------------------------------------------------------------------- */
/*                               ID GENERATORS                                */
/* -------------------------------------------------------------------------- */

// Deterministic hash-based ID (same label + ancestry → same ID)
function makeIdeaId(label, ancestry = []) {
  const titles = Array.isArray(ancestry)
    ? ancestry
        .map((a) => (typeof a === "string" ? a : a?.title || ""))
        .filter(Boolean)
    : [];
  const key = `${label}-${titles.join("-")}`;
  return crypto.createHash("md5").update(key).digest("hex").slice(0, 10);
}

// Unique fallback (rarely used now)
function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* -------------------------------------------------------------------------- */
/*                           SHAPE / VALIDATION HELPERS                       */
/* -------------------------------------------------------------------------- */

function normalizeHistory(history, fallbackPrompt = "") {
  const originalPrompt =
    typeof history?.originalPrompt === "string" && history.originalPrompt.trim()
      ? history.originalPrompt.trim()
      : fallbackPrompt;
  const originalContext =
    typeof history?.originalContext === "string" ? history.originalContext : "";

  const ancestors = Array.isArray(history?.ancestors)
    ? history.ancestors
        .map((a) => ({
          kind: a?.kind === "question" ? "question" : "idea",
          title: typeof a?.title === "string" ? a.title.trim() : "",
          summary: typeof a?.summary === "string" ? a.summary : "",
          nodeId: typeof a?.nodeId === "string" ? a.nodeId : null,
        }))
        .filter((a) => a.title)
    : [];

  return {
    originalPrompt,
    originalContext,
    ancestors,
  };
}

const appendHistory = (history, item) => {
  const normalized = normalizeHistory(history, history?.originalPrompt || "");
  const nextAncestors = Array.isArray(normalized.ancestors)
    ? [...normalized.ancestors]
    : [];
  const last = nextAncestors[nextAncestors.length - 1];
  if (last && last.kind === item.kind && last.title === item.title) {
    return normalized;
  }
  nextAncestors.push(item);
  return { ...normalized, ancestors: nextAncestors };
};

const getLineageTitles = (history) => {
  const normalized = normalizeHistory(history, history?.originalPrompt || "");
  return [
    normalized.originalPrompt,
    ...normalized.ancestors.map((a) => a.title),
  ].filter(Boolean);
};

function coerceIdeasShape(raw, history) {
  const lineage = getLineageTitles(history);
  const ideas = Array.isArray(raw?.ideas) ? raw.ideas : [];

  return ideas.map((idea, i) => {
    const label = String(idea?.label || "").trim();
    const summary = String(idea?.summary || "").trim();

    // 🚫 Ignore model-provided IDs and generate deterministic ones instead
    const id = makeIdeaId(label || `idea-${i}`, lineage);

    // --- Normalize follow-up questions ---
    // Accept a couple of possible keys to be robust to model variations
    let followUpsRaw =
      idea?.followUps ||
      idea?.follow_ups ||
      idea?.follow_up_questions ||
      idea?.questions;

    let followUps = [];
    if (Array.isArray(followUpsRaw)) {
      followUps = followUpsRaw
        .map((q) => (typeof q === "string" ? q.trim() : ""))
        .filter(Boolean);
    }

    // Normalize details (sub-ideas)
    let details = idea?.details;
    if (Array.isArray(details)) {
      details = details
        .map((d, j) => {
          if (!d) return null;
          const dLabel =
            typeof d === "string" ? d.trim() : d.label?.trim() || "";
          const dId = makeIdeaId(dLabel || `sub-${j}`, lineage.concat(label));
          return dLabel ? { id: dId, nodeId: dId, label: dLabel } : null;
        })
        .filter(Boolean);
    } else {
      details = [];
    }

    return { id, nodeId: id, label, summary, details, followUps };
  });
}

function validateRequired(body, field, res) {
  if (!body || typeof body[field] !== "string" || !body[field].trim()) {
    res.status(400).json({ error: `Missing required field: ${field}` });
    return false;
  }
  return true;
}

async function getImageBuffer(imageData) {
  if (imageData?.b64_json) {
    return Buffer.from(imageData.b64_json, "base64");
  }
  if (imageData?.url) {
    try {
      const response = await fetch(imageData.url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      console.error("Failed to download image from URL", err);
      return null;
    }
  }
  return null;
}

async function persistGeneratedImage({ imageData, userId, ideaTitle }) {
  if (!storageAvailable) return null;
  try {
    const buffer = await getImageBuffer(imageData);
    if (!buffer) return null;
    const { url } = await uploadIdeaImage({
      buffer,
      userId,
      ideaTitle,
      contentType: "image/png",
    });
    return url;
  } catch (err) {
    console.error("Image upload failed, falling back to inline URL", err);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                          GENERATE MAIN IDEAS                               */
/* -------------------------------------------------------------------------- */

export async function generateMainIdeas(req, res, next) {
  try {
    if (!validateRequired(req.body, "prompt", res)) return;
    const { prompt } = req.body;
    const context =
      typeof req.body?.context === "string" ? req.body.context.trim() : "";
    const userId = req.user?.id;
    console.log(req.user);

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated !!!" });
    }

    const client = getOpenAIClient();

    const system = [
      "You are Myceli, an expert ideation assistant for a visual mind-map app.",
      "Return concise, practical ideas with brief summaries (50–80 words).",
      "For each top-level idea, also suggest 3–5 short, natural-language follow-up questions the user could ask to go deeper on that idea.",
      "The follow-up questions should be specific to the idea, not generic (e.g. prefer 'What types of waves are there?' over 'Tell me more about this idea.').",
      "When the user provides additional context, use it to tailor the ideas and avoid generic suggestions.",
      "Always return a strict JSON object matching this schema:",
      '{ "ideas": [ { "id": "string", "label": "string", "summary": "string", "followUps": ["string"], "details": [ { "id": "string", "label": "string" } ] } ] }',
      "Generate 4–6 top-level ideas. For details, return 4–6 sub-ideas as label-only nodes (no summaries).",
      "Do not include Markdown or commentary outside the JSON.",
    ].join(" ");

    const userParts = [`User question (respond in JSON): ${prompt}`];
    if (context) {
      userParts.push(`Additional context to honor: ${context}`);
    }

    const user = userParts.join("\n\n");

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: { format: { type: "json_object" } },
      temperature: 0.7,
    });

    const jsonText = response.output_text || "{}";
    let raw;
    try {
      raw = JSON.parse(jsonText);
    } catch {
      raw = { ideas: [] };
    }

    const baseHistory = normalizeHistory(
      {
        originalPrompt: prompt,
        originalContext: context,
        ancestors: [],
      },
      prompt
    );

    // 🧠 Generate deterministic IDs using the root prompt as ancestry
    let ideas = coerceIdeasShape(raw, baseHistory).map((idea) => ({
      ...idea,
      history: appendHistory(baseHistory, {
        kind: "idea",
        title: idea.label,
        summary: idea.summary,
        nodeId: idea.id,
      }),
    }));

    // Enforce 4–6 ideas if model under/over-produces
    if (ideas.length < 4 || ideas.length > 6) {
      ideas = ideas.slice(0, 6);
      while (ideas.length < 4) {
        const fallbackId = createId();
        const fallbackIdea = {
          id: fallbackId,
          nodeId: fallbackId,
          label: "Idea",
          summary: "",
          details: [],
          followUps: [
            "Explain this idea in simple terms.",
            "Why is this idea important?",
            "What are the main challenges with this idea?",
          ],
        };
        fallbackIdea.history = appendHistory(baseHistory, {
          kind: "idea",
          title: fallbackIdea.label,
          summary: fallbackIdea.summary,
          nodeId: fallbackId,
        });
        ideas.push(fallbackIdea);
      }
    }

    // Ensure each idea has at least 4 sub-ideas, but keep followUps as-is
    ideas = ideas.map((idea) => {
      const details = Array.isArray(idea.details)
        ? idea.details.slice(0, 6)
        : [];

      const paddedDetails =
        details.length >= 4
          ? details
          : details.concat(
              Array.from({ length: Math.max(0, 4 - details.length) }).map(
                (_, j) => {
                  const subId = makeIdeaId(
                    `Sub-${j}`,
                    getLineageTitles(idea.history || baseHistory).concat(
                      idea.label
                    )
                  );
                  return {
                    id: subId,
                    nodeId: subId,
                    label: "Sub-idea",
                  };
                }
              )
            );

      // Ensure followUps is always an array
      const followUps = Array.isArray(idea.followUps)
        ? idea.followUps
        : [
            "Explain this idea in simple terms.",
            "What are some common questions about this topic?",
            "What are the key subtopics within this idea?",
          ];

      return {
        ...idea,
        details: paddedDetails,
        followUps,
      };
    });

    const valid = ideas.every(
      (i) =>
        i.id &&
        i.label &&
        i.summary &&
        Array.isArray(i.details) &&
        Array.isArray(i.followUps)
    );

    if (!valid) {
      return res.status(502).json({ error: "Invalid model response format" });
    }

    // ✅ Create new IdeaGraph document when generating main ideas
    const graph = await IdeaGraph.create({
      user: userId,
      title: prompt,
      nodes: [],
      edges: [],
    });

    // 🧩 Return ideas + graph metadata (now with followUps)
    return res.status(200).json({
      graphId: graph._id,
      title: graph.title,
      ideas,
    });
  } catch (err) {
    return next(err);
  }
}

/* -------------------------------------------------------------------------- */
/*                              EXPAND AN IDEA                                */
/* -------------------------------------------------------------------------- */

export async function expandIdea(req, res, next) {
  try {
    console.log("=== expandIdea called ===");
    const { ideaTitle, history: rawHistory, prompt } = req.body;
    const rawMode = typeof req.body?.mode === "string" ? req.body.mode : "";
    const mode = rawMode === "ask" ? "ask" : "expand";

    // --- Validation ---
    if (!ideaTitle?.trim()) {
      return res
        .status(400)
        .json({ error: "Missing required field: ideaTitle" });
    }

    const incomingHistory = normalizeHistory(rawHistory, ideaTitle);
    if (!incomingHistory.originalPrompt) {
      return res.status(400).json({
        error: "Missing required field: history.originalPrompt",
      });
    }

    const modeConfig =
      mode === "ask"
        ? {
            minIdeas: 1,
            maxIdeas: 1,
            followUpsMin: 2,
            followUpsMax: 4,
            fallbackFollowUps: [
              "What detail would make this clearer?",
              "Which assumption should we verify first?",
              "What is the simplest next step?",
              "Who could quickly validate this?",
            ],
            countInstruction:
              "Provide one concise, strong answer (do not list multiple).",
            summaryHint:
              "Summaries should be 30–60 words and may directly answer the question.",
            fallbackLabel: "Answer",
            fallbackSummary: "A concise answer to the user's question.",
          }
        : {
            minIdeas: 4,
            maxIdeas: 6,
            followUpsMin: 3,
            followUpsMax: 7,
            fallbackFollowUps: [
              "What assumptions does this idea rely on?",
              "How could we prototype this quickly?",
              "Who would benefit most from this idea?",
              "What are the key risks or trade-offs?",
              "What resources would this require?",
            ],
            countInstruction:
              "Expand with 4–6 sub-ideas grounded in the original prompt/context and the full history above.",
            summaryHint: "Summaries should be 50–80 words.",
            fallbackLabel: "Sub-idea",
            fallbackSummary: "A concise sub-idea to extend this topic.",
          };

    const ensureFollowUps = (list) => {
      const cleaned = Array.isArray(list)
        ? list
            .map((q) => (typeof q === "string" ? q.trim() : ""))
            .filter(Boolean)
        : [];

      if (cleaned.length >= modeConfig.followUpsMin) {
        return cleaned.slice(0, modeConfig.followUpsMax);
      }

      return modeConfig.fallbackFollowUps.slice(
        0,
        Math.max(modeConfig.followUpsMin, modeConfig.followUpsMax)
      );
    };

    const client = getOpenAIClient();

    // --- History + context preparation ---
    const historyWithPrompt =
      prompt && prompt.trim()
        ? appendHistory(incomingHistory, {
            kind: "question",
            title: prompt.trim(),
            summary: "",
          })
        : incomingHistory;

    const historyLines = historyWithPrompt.ancestors.map((anc, idx) => {
      const label =
        anc.kind === "question" ? `Follow-up ${idx + 1}` : `Idea ${idx + 1}`;
      return `${label}: ${anc.title}${
        anc.summary ? `\nSummary: ${anc.summary}` : ""
      }`;
    });

    // --- System prompt ---
    const systemPrompt = [
      "You are Myceli, an expert ideation assistant for a visual mind-map app.",
      "You expand ideas into clear, creative sub-ideas, and you can also answer direct questions succinctly when asked.",
      "Use the provided ancestry for context and maintain thematic coherence.",
      `When in 'ask' mode, stay lean—do not fabricate extra branches. 1–3 focused items are enough if the question is narrow.`,
      `For each item, propose ${modeConfig.followUpsMin}–${modeConfig.followUpsMax} concise follow-up questions that a curious thinker might ask next.`,
      "Return ONLY valid JSON using this schema:",
      '{ "ideas": [ { "id": "string", "label": "string", "summary": "string", "details": [], "followUps": ["string", ...] } ] }',
      `${modeConfig.summaryHint} Do NOT include commentary or markdown outside the JSON.`,
    ].join(" ");

    // --- Dynamic user instruction ---
    const focus = prompt
      ? `The user wants to focus on this specific question or angle: "${prompt}".`
      : "No user prompt was given. Expand naturally with relevant sub-ideas.";

    const userPrompt = [
      `Original prompt: ${historyWithPrompt.originalPrompt}`,
      historyWithPrompt.originalContext
        ? `Original context to honor: ${historyWithPrompt.originalContext}`
        : null,
      historyLines.length
        ? `History (oldest → newest):\n${historyLines.join("\n\n")}`
        : "History: none recorded beyond the original prompt.",
      `Current idea to expand: "${ideaTitle}".`,
      `Mode: ${mode}.`,
      focus,
      modeConfig.countInstruction,
    ]
      .filter(Boolean)
      .join("\n\n");

    console.log("🧠 Sending prompt to model...", {
      hasCustomPrompt: !!prompt,
      mode,
    });

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      text: { format: { type: "json_object" } },
      temperature: 0.7,
    });

    const jsonText = response.output_text || "{}";
    let raw;
    try {
      raw = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error(
        "❌ Failed to parse model output JSON:",
        jsonText,
        parseErr
      );
      raw = { ideas: [] };
    }

    // --- Normalize and shape ideas (reusing the same logic) ---
    let ideas = coerceIdeasShape(raw, historyWithPrompt).map((i) => {
      const ideaHistory = appendHistory(historyWithPrompt, {
        kind: "idea",
        title: i.label,
        summary: i.summary,
        nodeId: i.id,
      });

      return {
        ...i,
        nodeId: i.nodeId || i.id,
        history: ideaHistory,
        details: [], // we don’t expand sub-ideas further here
        followUps: ensureFollowUps(i.followUps),
      };
    });

    // --- Enforce per-mode idea counts ---
    if (
      ideas.length < modeConfig.minIdeas ||
      ideas.length > modeConfig.maxIdeas
    ) {
      ideas = ideas.slice(0, modeConfig.maxIdeas);
      while (ideas.length < modeConfig.minIdeas) {
        const fallbackId = makeIdeaId(
          `Fallback-${ideas.length}`,
          getLineageTitles(historyWithPrompt)
        );
        const fallbackIdea = {
          id: fallbackId,
          nodeId: fallbackId,
          label: modeConfig.fallbackLabel,
          summary: modeConfig.fallbackSummary,
          details: [],
          followUps: ensureFollowUps(modeConfig.fallbackFollowUps),
        };
        fallbackIdea.history = appendHistory(historyWithPrompt, {
          kind: "idea",
          title: fallbackIdea.label,
          summary: fallbackIdea.summary,
          nodeId: fallbackId,
        });
        ideas.push(fallbackIdea);
      }
    }

    const valid = ideas.every(
      (i) =>
        i.id &&
        i.label &&
        i.summary &&
        Array.isArray(i.details) &&
        Array.isArray(i.followUps)
    );

    if (!valid) {
      console.error("Invalid model response format:", ideas);
      return res.status(502).json({ error: "Invalid model response format" });
    }

    // ✅ Return same consistent shape as generateMainIdeas
    return res.json({ ideas });
  } catch (err) {
    console.error("Unexpected error in expandIdea:", err);
    return next(err);
  }
}

/* -------------------------------------------------------------------------- */
/*                           GENERATE IDEA IMAGE                              */
/* -------------------------------------------------------------------------- */

export async function generateIdeaImage(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const ideaTitle =
      typeof req.body?.ideaTitle === "string" ? req.body.ideaTitle.trim() : "";
    const ideaSummary =
      typeof req.body?.ideaSummary === "string"
        ? req.body.ideaSummary.trim()
        : "";
    const extraContext =
      typeof req.body?.extraContext === "string"
        ? req.body.extraContext.trim()
        : "";
    const generationPreset =
      typeof req.body?.generationPreset === "string"
        ? req.body.generationPreset
        : "standard";
    const imageSettings = resolveImageSettings(generationPreset);
    const incomingHistory = normalizeHistory(
      typeof req.body?.history === "object" ? req.body.history : {},
      ideaTitle
    );

    if (!ideaTitle) {
      return res
        .status(400)
        .json({ error: "Missing required field: ideaTitle" });
    }

    const historyLines = incomingHistory.ancestors.map((anc, idx) => {
      const label =
        anc.kind === "question" ? `Follow-up ${idx + 1}` : `Idea ${idx + 1}`;
      const summary = anc.summary ? `\nSummary: ${anc.summary}` : "";
      return `${label}: ${anc.title}${summary}`;
    });

    const lineageText = historyLines.length
      ? `History (oldest → newest):\n${historyLines.join("\n\n")}`
      : "History: none recorded beyond this idea.";

    const promptParts = [
      `Create a single, high-quality illustrative image for the idea: "${ideaTitle}".`,
      incomingHistory.originalPrompt
        ? `Original prompt: ${incomingHistory.originalPrompt}`
        : null,
      incomingHistory.originalContext
        ? `Original context to honor: ${incomingHistory.originalContext}`
        : null,
      lineageText,
      ideaSummary ? `Key details: ${ideaSummary}` : null,
      extraContext ? `User-provided creative direction: ${extraContext}` : null,
      "Respect the lineage above so the visual stays coherent with how the idea evolved.",
      "Avoid adding any text in the image. Prefer a clean, modern style. Aspect ratio 1:1. Natural lighting. High detail.",
    ].filter(Boolean);

    const prompt = promptParts.join("\n");
    const client = getOpenAIClient();

    const response = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: imageSettings.size,
      quality: imageSettings.quality,
      n: 1,
    });

    const imageData = response?.data?.[0];
    if (!imageData?.b64_json && !imageData?.url) {
      return res.status(502).json({
        error: "Image generation failed: no image returned",
      });
    }

    const hostedUrl = await persistGeneratedImage({
      imageData,
      userId,
      ideaTitle,
    });

    if (!hostedUrl) {
      const reason = storageAvailable
        ? "upload_failed"
        : "storage_not_configured";
      return res.status(502).json({
        error: "Image upload failed. Storage may be misconfigured.",
        reason,
      });
    }

    return res.status(200).json({
      imageUrl: hostedUrl,
      promptUsed: prompt,
    });
  } catch (err) {
    console.error("Unexpected error in generateIdeaImage:", err);
    return next(err);
  }
}

/* -------------------------------------------------------------------------- */
/*                        REGENERATE / REFINE IDEA IMAGE                      */
/* -------------------------------------------------------------------------- */

export async function regenerateIdeaImage(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const ideaTitle =
      typeof req.body?.ideaTitle === "string" ? req.body.ideaTitle.trim() : "";
    const feedback =
      typeof req.body?.feedback === "string" ? req.body.feedback.trim() : "";
    const imageUrl =
      typeof req.body?.imageUrl === "string" ? req.body.imageUrl.trim() : "";
    const promptUsed =
      typeof req.body?.promptUsed === "string" ? req.body.promptUsed.trim() : "";
    const generationPreset =
      typeof req.body?.generationPreset === "string"
        ? req.body.generationPreset
        : "standard";
    const imageSettings = resolveImageSettings(generationPreset);
    const incomingHistory = normalizeHistory(
      typeof req.body?.history === "object" ? req.body.history : {},
      ideaTitle
    );

    if (!ideaTitle) {
      return res
        .status(400)
        .json({ error: "Missing required field: ideaTitle" });
    }
    if (!feedback) {
      return res
        .status(400)
        .json({ error: "Missing required field: feedback" });
    }

    const historyLines = incomingHistory.ancestors.map((anc, idx) => {
      const label =
        anc.kind === "question" ? `Follow-up ${idx + 1}` : `Idea ${idx + 1}`;
      const summary = anc.summary ? `\nSummary: ${anc.summary}` : "";
      return `${label}: ${anc.title}${summary}`;
    });

    const lineageText = historyLines.length
      ? `History (oldest → newest):\n${historyLines.join("\n\n")}`
      : "History: none recorded beyond this idea.";

    const promptParts = [
      `Create a revised image for: "${ideaTitle}".`,
      incomingHistory.originalPrompt
        ? `Original prompt: ${incomingHistory.originalPrompt}`
        : null,
      incomingHistory.originalContext
        ? `Original context to honor: ${incomingHistory.originalContext}`
        : null,
      lineageText,
      promptUsed
        ? `Prompt that produced the current image: ${promptUsed}`
        : null,
      imageUrl
        ? "An existing image is provided as a reference (base64 or URL). Preserve core subjects while applying the feedback."
        : null,
      `User feedback for the revision: ${feedback}`,
      "Respect the lineage above so the visual stays coherent with how the idea evolved.",
      "Avoid adding any text in the image. Prefer a clean, modern style. Aspect ratio 1:1. Natural lighting. High detail.",
    ].filter(Boolean);

    const prompt = promptParts.join("\n");
    const client = getOpenAIClient();

    const response = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: imageSettings.size,
      quality: imageSettings.quality,
      n: 1,
    });

    const imageData = response?.data?.[0];
    if (!imageData?.b64_json && !imageData?.url) {
      return res.status(502).json({
        error: "Image regeneration failed: no image returned",
      });
    }

    const hostedUrl = await persistGeneratedImage({
      imageData,
      userId,
      ideaTitle,
    });

    if (!hostedUrl) {
      const reason = storageAvailable
        ? "upload_failed"
        : "storage_not_configured";
      return res.status(502).json({
        error: "Image upload failed. Storage may be misconfigured.",
        reason,
      });
    }

    return res.status(200).json({
      imageUrl: hostedUrl,
      promptUsed: prompt,
    });
  } catch (err) {
    console.error("Unexpected error in regenerateIdeaImage:", err);
    return next(err);
  }
}
