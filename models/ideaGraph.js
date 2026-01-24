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
    // These can be omitted when graph-level meta is present
    originalPrompt: { type: String, default: "" },
    originalContext: { type: String, default: "" },
    ancestors: { type: [historyItemSchema], default: [] },
  },
  { _id: false }
);

const ideaSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, default: "idea" },
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
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
    meta: {
      originalPrompt: { type: String, default: "" },
      originalContext: { type: String, default: "" },
    },
    nodes: [ideaSchema],
    edges: [edgeSchema],
  },
  { timestamps: true }
);

export const IdeaGraph = mongoose.model("IdeaGraph", ideaGraphSchema);
