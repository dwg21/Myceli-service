import { IdeaGraph } from "../models/ideaGraph.js";
import { getOpenAIClient } from "../utils/openaiClient.js";
import crypto from "crypto";

/* -------------------------------------------------------------------------- */
/*                               ID GENERATORS                                */
/* -------------------------------------------------------------------------- */

// Deterministic hash-based ID (same label + ancestry → same ID)
function makeIdeaId(label, ancestors = []) {
  const key = `${label}-${ancestors.map((a) => a.title).join("-")}`;
  return crypto.createHash("md5").update(key).digest("hex").slice(0, 10);
}

// Unique fallback (rarely used now)
function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* -------------------------------------------------------------------------- */
/*                           SHAPE / VALIDATION HELPERS                       */
/* -------------------------------------------------------------------------- */

function coerceIdeasShape(raw, ancestors = []) {
  const ideas = Array.isArray(raw?.ideas) ? raw.ideas : [];
  return ideas.map((idea, i) => {
    const label = String(idea?.label || "").trim();
    const summary = String(idea?.summary || "").trim();

    // 🚫 Ignore model-provided IDs and generate deterministic ones instead
    const id = makeIdeaId(label || `idea-${i}`, ancestors);

    // Normalize details (sub-ideas)
    let details = idea?.details;
    if (Array.isArray(details)) {
      details = details
        .map((d, j) => {
          if (!d) return null;
          const dLabel =
            typeof d === "string" ? d.trim() : d.label?.trim() || "";
          const dId = makeIdeaId(
            dLabel || `sub-${j}`,
            ancestors.concat({ title: label })
          );
          return dLabel ? { id: dId, label: dLabel } : null;
        })
        .filter(Boolean);
    } else {
      details = [];
    }

    return { id, label, summary, details };
  });
}

function validateRequired(body, field, res) {
  if (!body || typeof body[field] !== "string" || !body[field].trim()) {
    res.status(400).json({ error: `Missing required field: ${field}` });
    return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/*                          GENERATE MAIN IDEAS                               */
/* -------------------------------------------------------------------------- */

export async function generateMainIdeas(req, res, next) {
  try {
    if (!validateRequired(req.body, "prompt", res)) return;
    const { prompt } = req.body;
    const userId = req.user?.id;
    console.log(req.user);

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated !!!" });
    }

    const client = getOpenAIClient();

    const system = [
      "You are Myceli, an expert ideation assistant for a visual mind-map app.",
      "Return concise, practical ideas with brief summaries (50–80 words).",
      "Always return a strict JSON object matching this schema:",
      '{ "ideas": [ { "id": "string", "label": "string", "summary": "string", "details": [ { "id": "string", "label": "string" } ] } ] }',
      "Generate 4–6 top-level ideas. For details, return 4–6 sub-ideas as label-only nodes (no summaries).",
      "Do not include Markdown or commentary outside the JSON.",
    ].join(" ");

    const user = `User question (respond in JSON): ${prompt}`;
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

    // 🧠 Generate deterministic IDs using the root prompt as ancestry
    let ideas = coerceIdeasShape(raw, [{ title: prompt }]);

    // Enforce 4–6 ideas if model under/over-produces
    if (ideas.length < 4 || ideas.length > 6) {
      ideas = ideas.slice(0, 6);
      while (ideas.length < 4) {
        ideas.push({ id: createId(), label: "Idea", summary: "", details: [] });
      }
    }

    // Ensure each idea has at least 4 sub-ideas
    ideas = ideas.map((idea) => {
      const details = Array.isArray(idea.details)
        ? idea.details.slice(0, 6)
        : [];
      return {
        ...idea,
        details:
          details.length >= 4
            ? details
            : details.concat(
                Array.from({ length: Math.max(0, 4 - details.length) }).map(
                  (_, j) => ({
                    id: makeIdeaId(`Sub-${j}`, [{ title: idea.label }]),
                    label: "Sub-idea",
                  })
                )
              ),
      };
    });

    const valid = ideas.every(
      (i) => i.id && i.label && i.summary && Array.isArray(i.details)
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

    // 🧩 Return ideas + graph metadata
    return res.status(200).json({
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
    console.log("Raw request body:", req.body);

    const { ideaTitle, ancestors } = req.body;

    // Validate required fields
    if (!ideaTitle?.trim()) {
      console.error("Error: Missing ideaTitle");
      return res
        .status(400)
        .json({ error: "Missing required field: ideaTitle" });
    }

    if (!Array.isArray(ancestors) || ancestors.length < 1) {
      console.error("Error: Ancestors array missing or empty", ancestors);
      return res.status(400).json({
        error:
          "Missing required field: ancestors (must be an array with at least 1 item)",
      });
    }

    if (!ancestors.every((a) => a.title && a.summary)) {
      console.error("Error: Ancestors missing title or summary", ancestors);
      return res.status(400).json({
        error: "Each ancestor must have 'title' and 'summary' fields",
      });
    }

    console.log("ideaTitle:", ideaTitle);
    console.log("ancestors:", ancestors);

    const client = getOpenAIClient();

    // Build context for model
    const ancestorsContext = ancestors
      .map(
        (anc, idx) =>
          `${idx === 0 ? "Root question" : `Level ${idx} idea`}: ${anc.title}${
            anc.summary ? `\nSummary: ${anc.summary}` : ""
          }`
      )
      .join("\n\n");

    const system = [
      "You are Myceli, an expert ideation assistant for a visual mind-map app.",
      "The ancestors array below shows the hierarchical path from the root question down to this idea's parent.",
      "Use this full context to generate sub-ideas that are relevant to the entire hierarchy.",
      "Return concise, practical sub-ideas with brief summaries (50–80 words).",
      "Always return a strict JSON object matching this schema:",
      '{ "ideas": [ { "id": "string", "label": "string", "summary": "string", "details": [] } ] }',
      "Return 4–6 sub-ideas as fully shaped objects. Do not include Markdown or commentary outside the JSON.",
    ].join(" ");

    const user = `Expand on the idea title (respond in JSON): ${ideaTitle}\n\nAncestors (hierarchical path from root to parent):\n${ancestorsContext}`;

    console.log("Sending request to OpenAI model...");
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: { format: { type: "json_object" } },
      temperature: 0.7,
    });

    console.log("Raw model output text:", response.output_text);

    const jsonText = response.output_text || "{}";
    let raw;
    try {
      raw = JSON.parse(jsonText);
      console.log("Parsed JSON from model:", raw);
    } catch (parseErr) {
      console.error("Failed to parse model output JSON:", jsonText, parseErr);
      raw = { ideas: [] };
    }

    // 🧠 Generate deterministic IDs using the full ancestor chain
    let ideas = coerceIdeasShape(raw, ancestors).map((i) => ({
      ...i,
      details: [],
    }));

    console.log("Ideas after coercion:", ideas);

    // Enforce 4–6 ideas for structure consistency
    if (ideas.length < 4 || ideas.length > 6) {
      ideas = ideas.slice(0, 6);
      while (ideas.length < 4) {
        ideas.push({
          id: makeIdeaId(`Fallback-${ideas.length}`, ancestors),
          label: "Sub-idea",
          summary: "",
          details: [],
        });
      }
      console.log("Ideas after enforcing 4–6 count:", ideas);
    }

    const valid = ideas.every(
      (i) => i.id && i.label && i.summary && Array.isArray(i.details)
    );

    if (!valid) {
      console.error("Invalid model response format:", ideas);
      return res.status(502).json({ error: "Invalid model response format" });
    }

    console.log("Returning ideas to client:", ideas);
    return res.json({ ideas });
  } catch (err) {
    console.error("Unexpected error in expandIdea:", err);
    return next(err);
  }
}
