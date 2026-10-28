import { NextResponse } from "next/server";
import OpenAI from "openai";

import { buildImagePrompt } from "@/lib/prompts";

/** gpt-image-1 only accepts a fixed set of sizes, so map the aspect ratio onto them. */
function sizeFor(aspectRatio: string): "1024x1024" | "1024x1536" | "1536x1024" {
  const ratio = (aspectRatio || "").replace(/\s/g, "");
  if (["4:5", "2:3", "9:16", "3:4"].includes(ratio)) return "1024x1536";
  if (["16:9", "1.91:1", "3:2", "4:3"].includes(ratio)) return "1536x1024";
  return "1024x1024";
}

export async function POST(request: Request) {
  let prompt = "";
  let aspectRatio = "1:1";

  try {
    const body = await request.json();
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (typeof body?.aspectRatio === "string" && body.aspectRatio.trim()) {
      aspectRatio = body.aspectRatio.trim();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ ok: false, error: "An image prompt is required." }, { status: 400 });
  }

  const fullPrompt = buildImagePrompt(prompt, aspectRatio);

  if (!process.env.OPENAI_API_KEY) {
    // Fallback: hand the prompt back so the UI can still show the concept.
    return NextResponse.json({
      ok: false,
      error: "OPENAI_API_KEY is not set. Showing the image prompt only.",
      prompt: fullPrompt,
    });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt: fullPrompt,
      size: sizeFor(aspectRatio),
      n: 1,
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error("The image API returned no image data.");

    return NextResponse.json({
      ok: true,
      image: `data:image/png;base64,${b64}`,
      prompt: fullPrompt,
      size: sizeFor(aspectRatio),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed.";
    // Fallback per the plan: no image, but the prompt is still returned.
    return NextResponse.json({ ok: false, error: message, prompt: fullPrompt });
  }
}
