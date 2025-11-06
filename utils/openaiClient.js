import OpenAI from "openai";
import dotenv from "dotenv";

// Load env in case this module is imported before server.js
dotenv.config();

let singletonClient;

export function getOpenAIClient() {
  if (singletonClient) return singletonClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("Missing OPENAI_API_KEY"), { status: 500 });
  }
  singletonClient = new OpenAI({ apiKey });
  return singletonClient;
}
