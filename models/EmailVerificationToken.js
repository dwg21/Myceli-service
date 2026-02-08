import mongoose from "mongoose";

const emailVerificationTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  used: { type: Boolean, default: false },
  usedAt: { type: Date },
});

// TTL index for automatic cleanup after expiry
emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("EmailVerificationToken", emailVerificationTokenSchema);
