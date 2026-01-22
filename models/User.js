import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { getPlanCredits, getNextPeriodEnd } from "../utils/planCredits.js";

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  plan: { type: String, enum: ["free", "basic", "pro"], default: "free" },
  creditsTotal: {
    type: Number,
    default: function () {
      return getPlanCredits(this.plan);
    },
  },
  creditsUsed: { type: Number, default: 0 },
  periodStart: { type: Date, default: () => new Date() },
  periodEnd: {
    type: Date,
    default: () => getNextPeriodEnd(),
  },
  providers: [
    {
      provider: { type: String, enum: ["google", "github"], required: true },
      providerId: { type: String, required: true },
      email: String,
      avatar: String,
      displayName: String,
    },
  ],
  stripeCustomerId: { type: String },
  stripeSubscriptionId: { type: String },
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.index(
  { "providers.provider": 1, "providers.providerId": 1 },
  { unique: true, sparse: true }
);
userSchema.index({ stripeCustomerId: 1 }, { unique: true, sparse: true });

export default mongoose.model("User", userSchema);
