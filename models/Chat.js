const mongoose = require("mongoose");

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
      ref: "Graph", // if you have a Graph model; otherwise use String
      required: false,
    },
    ideaId: {
      type: String, // reference the idea.id field
      required: false,
    },
    title: {
      type: String,
      default: "Untitled Chat",
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Chat", chatSchema);
