import { getOpenAIClient } from "../utils/openaiClient.js";

export async function ideaChat(req, res, next) {
  try {
    const { ideaTitle, ancestors = [], messages = [] } = req.body;

    // Basic validation
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

    const client = getOpenAIClient();

    // Build hierarchical context string
    const ancestorsContext = ancestors
      .map(
        (anc, idx) =>
          `${idx === 0 ? "Root question" : `Level ${idx} idea`}: ${anc.title}${
            anc.summary ? `\nSummary: ${anc.summary}` : ""
          }`
      )
      .join("\n\n");

    // Prepare the system message for model guidance
    const systemMessage = {
      role: "system",
      content: [
        "You are Myceli, an expert ideation companion for a visual mind-map app.",
        "You are currently focusing on ONE idea node within a hierarchical map.",
        "Your role is to help the user explore, question, and deepen this idea.",
        "Be thoughtful, structured, and concise but conversational.",
        "Do not output JSON — respond in natural text.",
        "Context below gives you the full ancestry leading to this idea:",
        ancestorsContext,
        `\nCurrent idea: ${ideaTitle}`,
      ].join("\n\n"),
    };

    // Merge messages (system + conversation so far)
    const chatMessages = [systemMessage, ...messages];

    // Call the model
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: chatMessages,
      text: { format: { type: "text" } },
      temperature: 0.7,
    });

    const reply = response.output_text?.trim() || "No response generated.";

    return res.json({ reply });
  } catch (err) {
    console.error("Error in ideaChat:", err);
    next(err);
  }
}
