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
          const dId = makeIdeaId(
            dLabel || `sub-${j}`,
            ancestors.concat({ title: label })
          );
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
      "For each top-level idea, also suggest 3–5 short, natural-language follow-up questions the user could ask to go deeper on that idea.",
      "The follow-up questions should be specific to the idea, not generic (e.g. prefer 'What types of waves are there?' over 'Tell me more about this idea.').",
      "Always return a strict JSON object matching this schema:",
      '{ "ideas": [ { "id": "string", "label": "string", "summary": "string", "followUps": ["string"], "details": [ { "id": "string", "label": "string" } ] } ] }',
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
        const fallbackId = createId();
        ideas.push({
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
        });
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
                  const subId = makeIdeaId(`Sub-${j}`, [{ title: idea.label }]);
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
    const { ideaTitle, ancestors, prompt } = req.body;

    // --- Validation ---
    if (!ideaTitle?.trim()) {
      return res
        .status(400)
        .json({ error: "Missing required field: ideaTitle" });
    }

    if (!Array.isArray(ancestors) || ancestors.length < 1) {
      return res.status(400).json({
        error:
          "Missing required field: ancestors (must be an array with at least 1 item)",
      });
    }

    const missingTitle = ancestors.some((a) => !a?.title);
    const missingSummaryBeyondRoot = ancestors
      .slice(1)
      .some((a) => !a?.summary);

    if (missingTitle || missingSummaryBeyondRoot) {
      return res.status(400).json({
        error:
          "Each ancestor needs a title, and all but the first must include a summary",
      });
    }

    const client = getOpenAIClient();

    // --- Context formatting ---
    const ancestorsContext = ancestors
      .map(
        (anc, idx) =>
          `${idx === 0 ? "Root question" : `Level ${idx} idea`}: ${anc.title}${
            anc.summary ? `\nSummary: ${anc.summary}` : ""
          }`
      )
      .join("\n\n");

    // --- System prompt ---
    const systemPrompt = [
      "You are Myceli, an expert ideation assistant for a visual mind-map app.",
      "You expand ideas into clear, creative sub-ideas.",
      "Use the provided ancestry for context and maintain thematic coherence.",
      "For each sub-idea, also propose 3–7 concise follow-up questions that a curious thinker might ask next.",
      "Return ONLY valid JSON using this schema:",
      '{ "ideas": [ { "id": "string", "label": "string", "summary": "string", "details": [], "followUps": ["string", ...] } ] }',
      "Summaries should be 50–80 words. Do NOT include commentary or markdown outside the JSON.",
    ].join(" ");

    // --- Dynamic user instruction ---
    const focus = prompt
      ? `The user wants to focus on this specific question or angle: "${prompt}".`
      : "No user prompt was given. Expand naturally with relevant sub-ideas.";

    const userPrompt = [
      `Expand on the idea titled "${ideaTitle}".`,
      focus,
      "\n\nAncestors (hierarchical path from root to parent):",
      ancestorsContext,
    ].join("\n\n");

    console.log("🧠 Sending prompt to model...", { hasCustomPrompt: !!prompt });

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
    let ideas = coerceIdeasShape(raw, ancestors).map((i) => ({
      ...i,
      nodeId: i.nodeId || i.id,
      details: [], // we don’t expand sub-ideas further here
      followUps:
        Array.isArray(i.followUps) && i.followUps.length >= 3
          ? i.followUps.slice(0, 7)
          : [
              "What assumptions does this idea rely on?",
              "How could we prototype this quickly?",
              "Who would benefit most from this idea?",
              "What are the key risks or trade-offs?",
              "What resources would this require?",
            ].slice(0, Math.floor(Math.random() * 5) + 3), // fallback 3–7
    }));

    // --- Enforce 4–6 sub-ideas ---
    if (ideas.length < 4 || ideas.length > 6) {
      ideas = ideas.slice(0, 6);
      while (ideas.length < 4) {
        const fallbackId = makeIdeaId(`Fallback-${ideas.length}`, ancestors);
        ideas.push({
          id: fallbackId,
          nodeId: fallbackId,
          label: "Sub-idea",
          summary: "",
          details: [],
          followUps: [
            "What could make this idea more impactful?",
            "Who might oppose this idea and why?",
            "What’s an example use case?",
          ],
        });
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
