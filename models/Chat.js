import mongoose from "mongoose";

const ancestorSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    summary: { type: String, default: "" },
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
    ancestors: {
      type: [ancestorSchema],
      default: [],
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
  },
  { timestamps: true }
);

chatSchema.index({ createdBy: 1, graphId: 1, ideaId: 1 }, { unique: true });

export const Chat = mongoose.model("Chat", chatSchema);
