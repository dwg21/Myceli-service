import { getOpenAIClient } from "../utils/openaiClient.js";
import { Chat } from "../models/Chat.js";
import { IdeaGraph } from "../models/ideaGraph.js";

/**
 * Starts a new reflection chat for a specific idea.
 * Builds context from ancestors, generates system message, and automatically
 * asks the model to "explain this idea" to provide an initial thoughtful response.
 */
export async function createIdeaChat(req, res, next) {
  try {
    const { ideaTitle, ancestors = [], graphId, ideaId } = req.body;
    const userId = req.user.id;

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

    if (!graphId || !ideaId) {
      return res
        .status(400)
        .json({ error: "Missing required fields: graphId and ideaId" });
    }

    // --- Check if chat already exists ---
    const existingChat = await Chat.findOne({
      createdBy: userId,
      graphId,
      ideaId,
    });

    if (existingChat) {
      console.warn(
        `⚠️ Chat already exists for user:${userId}, graph:${graphId}, idea:${ideaId}`
      );
      return res.status(409).json({
        error: "A chat for this idea already exists.",
        chatId: existingChat._id,
      });
    }

    const client = getOpenAIClient();

    // --- Build hierarchical context string ---
    const ancestorsContext = ancestors
      .map(
        (anc, idx) =>
          `${idx === 0 ? "Root question" : `Level ${idx} idea`}: ${anc.title}${
            anc.summary ? `\nSummary: ${anc.summary}` : ""
          }`
      )
      .join("\n\n");

    // --- System message for LLM behavior ---
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

    // --- Automatically add a starting user message ---
    const startingMessage = {
      role: "user",
      content: "Please explain this idea in detail.",
    };

    const chatMessages = [systemMessage, startingMessage];

    // --- Generate first response from OpenAI ---
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: chatMessages,
      text: { format: { type: "text" } },
      temperature: 0.7,
    });

    const reply = response.output_text?.trim() || "No response generated.";

    // --- Create new Chat record in Mongo ---
    const chat = await Chat.create({
      createdBy: userId,
      graphId,
      ideaId,
      title: ideaTitle,
      ancestors,
      systemMessage,
      messages: [startingMessage, { role: "assistant", content: reply }],
    });

    // --- Attach chatId to IdeaGraph node ---
    if (graphId && ideaId) {
      console.log("🔗 [createIdeaChat] Attaching chatId to IdeaGraph node...");
      const result = await IdeaGraph.updateOne(
        { _id: graphId, "nodes.id": ideaId },
        { $set: { "nodes.$.chatId": chat._id } }
      );

      if (result.modifiedCount === 0) {
        console.warn(
          "⚠️ [createIdeaChat] No matching node found or no changes applied!"
        );
      }
    } else {
      console.warn(
        "⚠️ [createIdeaChat] Missing graphId or ideaId — skipping node update."
      );
    }

    // --- Respond with chat and first reply ---
    return res.status(201).json({ chat, reply });
  } catch (err) {
    console.error("💥 Error in createIdeaChat:", err);
    next(err);
  }
}

/**
 * Create or update a chat for the authenticated user.
 * If a chat exists for the same user + graph + idea, update it; otherwise create a new one.
 */
export const saveChat = async (req, res) => {
  try {
    const { chatId, messages, title, ancestors } = req.body;
    const userId = req.user.id;

    // --- Validate input ---
    if (!chatId) {
      return res.status(400).json({ error: "Missing required field: chatId" });
    }

    // --- Find existing chat for this user ---
    const chat = await Chat.findOne({ _id: chatId, createdBy: userId });
    if (!chat) {
      return res
        .status(404)
        .json({ error: "Chat not found or not owned by user" });
    }

    // --- Apply updates ---
    if (title) chat.title = title;
    if (Array.isArray(messages) && messages.length > 0) {
      chat.messages = messages;
    }
    if (Array.isArray(ancestors) && ancestors.length > 0) {
      chat.ancestors = ancestors;
    }

    chat.updatedAt = new Date();
    await chat.save();

    return res.status(200).json({ message: "Chat updated successfully", chat });
  } catch (err) {
    console.error("Error updating chat:", err);
    return res.status(500).json({ error: "Failed to update chat" });
  }
};

/**
 * Get all chats for the authenticated user.
 */
export const getUserChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const chats = await Chat.find({ createdBy: userId })
      .sort({ updatedAt: -1 })
      .select("title graphId ideaId updatedAt");

    res.status(200).json({ chats });
  } catch (err) {
    console.error("Error fetching user chats:", err);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
};

/**
 * Get all chats for a specific graph (owned by user).
 */
export const getChatsByGraph = async (req, res) => {
  try {
    const { graphId } = req.params;
    const userId = req.user.id;

    const chats = await Chat.find({ createdBy: userId, graphId }).sort({
      updatedAt: -1,
    });

    res.status(200).json({ chats });
  } catch (err) {
    console.error("Error fetching graph chats:", err);
    res.status(500).json({ error: "Failed to fetch chats for graph" });
  }
};

/**
 * Get a single chat by ID.
 */
export const getChatById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const chat = await Chat.findOne({ _id: id, createdBy: userId });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    res.status(200).json(chat);
  } catch (err) {
    console.error("Error loading chat:", err);
    res.status(500).json({ error: "Failed to load chat" });
  }
};

/**
 * Delete a chat (user can only delete their own, admin can delete any).
 */
export const deleteChat = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    const chat = await Chat.findById(id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    // Check permissions
    if (chat.createdBy.toString() !== userId && role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    await chat.deleteOne();
    res.status(200).json({ message: "Chat deleted" });
  } catch (err) {
    console.error("Error deleting chat:", err);
    res.status(500).json({ error: "Failed to delete chat" });
  }
};

export const sendChatMessage = async (req, res) => {
  try {
    const { chatId, content } = req.body;
    const userId = req.user.id;

    if (!chatId) return res.status(400).json({ error: "Missing chatId" });
    if (!content?.trim())
      return res.status(400).json({ error: "Missing message content" });

    // Load chat
    const chat = await Chat.findOne({ _id: chatId, createdBy: userId });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    // Append user message
    chat.messages.push({ role: "user", content });
    chat.updatedAt = new Date();

    // Reuse the stored system message + conversation so far
    const messages = [chat.systemMessage, ...chat.messages];

    const cleanMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Send to OpenAI
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: cleanMessages,
      text: { format: { type: "text" } },
      temperature: 0.7,
    });

    const reply = response.output_text?.trim() || "No response generated.";

    // Append assistant reply
    chat.messages.push({ role: "assistant", content: reply });
    await chat.save();

    res.status(200).json({ reply, chat });
  } catch (err) {
    console.error("Error in sendChatMessage:", err);
    res.status(500).json({ error: "Failed to send chat message" });
  }
};
