// Edge function: chat-ai (Google Gemini via @google/generative-ai)
// Accepts { messages: {role, content}[] } and returns { content }
// Uses GEMINI_API_KEY (falls back to gemini_api_key) secret.

import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const SYSTEM_INSTRUCTION =
  "You are Tangent, a thoughtful AI assistant. Be concise, warm, and precise.";

type IncomingMessage = { role: string; content: string };

function mapRole(role: string): "user" | "model" {
  if (role === "user") return "user";
  return "model";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    console.log("Checking API Key...");
    const apiKey =
      Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("gemini_api_key");
    console.log("API Key exists:", !!apiKey);
    if (!apiKey) {
      throw new Error("Missing API Key");
    }


    const { messages, model: requestedModel } = (await req.json()) as {
      messages: IncomingMessage[];
      model?: string;
    };
    const MODEL = requestedModel && requestedModel.trim() ? requestedModel : DEFAULT_MODEL;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Gemini requires the first content to be role=user. Drop any leading
    // model turns so the conversation starts correctly.
    const cleaned: IncomingMessage[] = [];
    let started = false;
    for (const m of messages) {
      if (!started && m.role !== "user") continue;
      started = true;
      cleaned.push(m);
    }
    if (cleaned.length === 0) cleaned.push(messages[messages.length - 1]);

    const contents = cleaned.map((m) => ({
      role: mapRole(m.role),
      parts: [{ text: String(m.content ?? "") }],
    }));

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        temperature: 0.7,
      },
    });

    const result = await model.generateContent({ contents });
    const response = await result.response;
    const content = response.text().trim();

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      },
    );
  }
});
