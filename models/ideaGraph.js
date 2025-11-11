import mongoose from "mongoose";

const ancestorSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    summary: { type: String, default: "" },
  },
  { _id: false }
);

const ideaSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, default: "idea" },
  label: { type: String, default: "" },
  summary: { type: String, default: "" },

  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
  },

  ancestors: {
    type: [ancestorSchema],
    default: [],
  },

  // 💬 Linked chat
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chat",
    required: false,
  },

  // 🔗 Parent graph reference (metadata only, for clarity / querying)
  graphId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "IdeaGraph",
    required: false,
  },

  // 🧠 Extra ReactFlow data props
  data: { type: Object, default: {} },
});

const edgeSchema = new mongoose.Schema({
  id: String,
  source: String,
  target: String,
  sourceHandle: String,
  style: Object,
});

const ideaGraphSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: "Untitled Graph" },
    nodes: [ideaSchema],
    edges: [edgeSchema],
  },
  { timestamps: true }
);

export const IdeaGraph = mongoose.model("IdeaGraph", ideaGraphSchema);
