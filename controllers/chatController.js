import { getOpenAIClient } from "../utils/openaiClient.js";
import { Chat } from "../models/Chat.js";
import { IdeaGraph } from "../models/ideaGraph.js";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

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

    // --- Prevent duplicate chats ---
    const existingChat = await Chat.findOne({
      createdBy: userId,
      graphId,
      ideaId,
    });

    if (existingChat) {
      // Ensure the graph node is tagged with the chatId (idempotent)
      await IdeaGraph.updateOne(
        { _id: graphId, user: userId, "nodes.id": ideaId },
        { $set: { "nodes.$.chatId": existingChat._id } }
      );

      return res
        .status(200)
        .json({ chat: existingChat, node: { id: ideaId, chatId: existingChat._id } });
    }

    console.log("Contiuning");

    // --- Generate system message (saved, but no assistant call yet) ---
    const ancestorsContext = ancestors
      .map(
        (anc, idx) =>
          `${idx === 0 ? "Root question" : `Level ${idx} idea`}: ${anc.title}${
            anc.summary ? `\nSummary: ${anc.summary}` : ""
          }`
      )
      .join("\n\n");

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

    // --- Create empty chat (frontend will start first message) ---
    const chat = await Chat.create({
      createdBy: userId,
      graphId,
      ideaId,
      title: ideaTitle,
      ancestors,
      systemMessage,
      messages: [],
    });

    // --- Attach chatId to the graph node ---
    await IdeaGraph.updateOne(
      { _id: graphId, user: userId, "nodes.id": ideaId },
      { $set: { "nodes.$.chatId": chat._id } }
    );

    return res
      .status(201)
      .json({ chat, node: { id: ideaId, chatId: chat._id } });
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

export async function sendChatMessageStream(req, res) {
  try {
    const { chatId, content } = req.body;
    const userId = req.user.id;

    // 1. Load chat
    const chat = await Chat.findOne({ _id: chatId, createdBy: userId });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    // 2. Save the user message
    chat.messages.push({ role: "user", content });
    chat.updatedAt = new Date();
    await chat.save();

    // 3. Build conversation history
    const messages = [
      chat.systemMessage,
      ...chat.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    // 4. Start Vercel AI streaming
    const result = streamText({
      model: openai("gpt-4o-mini"),
      messages,
    });

    // IMPORTANT: set SSE headers manually
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // 5. Pipe streaming chunks into SSE response (frontend expects this format)
    await result.pipeTextStreamToResponse(res);

    // 6. Capture full message for DB once streaming completes
    const fullReply = await result.text;

    chat.messages.push({ role: "assistant", content: fullReply });
    chat.updatedAt = new Date();
    await chat.save();
  } catch (err) {
    console.error("STREAM ERROR:", err);
    res.write(`event: error\ndata: Streaming error\n\n`);
    res.end();
  }
}
