import mongoose from "mongoose";

export async function connectDB() {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("Missing MONGO_URI in environment variables");

    await mongoose.connect(uri); // ✅ modern default connection

    console.log("✅ Connected to MongoDB Atlas");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}
