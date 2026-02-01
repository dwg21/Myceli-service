import mongoose from "mongoose";

const historyItemSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["question", "idea"], required: true },
    title: { type: String, required: true },
    summary: { type: String, default: "" },
    nodeId: { type: String, default: null },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    originalPrompt: { type: String, required: true },
    originalContext: { type: String, default: "" },
    ancestors: { type: [historyItemSchema], default: [] },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const chatSchema = new mongoose.Schema(
  {
    graphId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Graph", // optional
    },
    ideaId: {
      type: String, // your idea.id string (not ObjectId)
    },
    title: {
      type: String,
      default: "Untitled Chat",
    },
    history: {
      type: historySchema,
      default: {
        originalPrompt: "",
        originalContext: "",
        ancestors: [],
      },
    },
    systemMessage: {
      role: { type: String, default: "system" },
      content: { type: String, required: true },
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    modelId: {
      type: String,
      default: "openai/gpt-4.1-mini",
    },
  },
  { timestamps: true }
);

chatSchema.index({ createdBy: 1, graphId: 1, ideaId: 1 }, { unique: true });

export const Chat = mongoose.model("Chat", chatSchema);
