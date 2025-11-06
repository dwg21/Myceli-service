import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  replacedByTokenHash: String,
});

export default mongoose.model("RefreshToken", refreshTokenSchema);
