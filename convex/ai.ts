"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

export const askLlama = action({
  args: {
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("🚀 Sending to Ollama:", args.prompt);

    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "codellama",
        prompt: args.prompt,
        stream: false,
      }),
    });

    const data = await res.json();

    console.log("✅ Ollama response received");

    return data.response;
  },
});
