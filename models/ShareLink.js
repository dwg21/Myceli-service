import mongoose from "mongoose";

const shareLinkSchema = new mongoose.Schema(
  {
    shareId: { type: String, required: true, unique: true },
    graph: { type: mongoose.Schema.Types.ObjectId, ref: "IdeaGraph", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    snapshot: {
      type: Object,
      required: true,
    },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);
shareLinkSchema.index({ createdBy: 1, graph: 1 });

export const ShareLink = mongoose.model("ShareLink", shareLinkSchema);
