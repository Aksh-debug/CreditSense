// Groq-backed LLM client (drop-in replacement for the Anthropic client).
// Groq uses the OpenAI-compatible API, so we use the openai SDK pointed at Groq.
// Install: npm install openai   (remove @anthropic-ai/sdk if you want to clean up)

import OpenAI from "openai";

if (!process.env.GROQ_API_KEY) {
  console.warn("[creditsense] GROQ_API_KEY is not set — AI calls will fail.");
}

export const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY ?? "",
  baseURL: "https://api.groq.com/openai/v1",
});

// llama-3.3-70b-versatile: best free Groq model for tool-use + reasoning.
export const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
