import { NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

import factBank from "@/data/adpilot-facts.json";
import { contentPackSchema, type Fact } from "@/lib/schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/prompts";
import { validatePack } from "@/lib/validate";

const FACTS = factBank as Fact[];

/** Facts that establish who AdPilot is and what the CTA is - always in context. */
const ALWAYS_INCLUDE = ["f1", "f12"];
const MAX_FACTS = 8;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "why", "how", "what", "do", "does", "is", "are", "be", "that", "this", "it",
  "from", "at", "by", "as", "their", "they", "your", "you", "we", "our",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Step 1 of the pipeline: retrieve. Keyword overlap is enough here - the fact
 * bank is 12 entries from one client page, so no vector store is needed.
 */
function selectFacts(topic: string): Fact[] {
  const topicTokens = tokenize(topic);

  const scored = FACTS.map((fact) => {
    const factTokens = new Set(tokenize(fact.text));
    let score = 0;
    for (const token of topicTokens) {
      for (const factToken of factTokens) {
        if (factToken === token || factToken.startsWith(token) || token.startsWith(factToken)) {
          score += 1;
          break;
        }
      }
    }
    return { fact, score };
  });

  const relevant = scored
    .filter((s) => s.score > 0 || ALWAYS_INCLUDE.includes(s.fact.id))
    .sort((a, b) => {
      // keep the always-include facts at the top, then by score
      const aPinned = ALWAYS_INCLUDE.includes(a.fact.id) ? 1 : 0;
      const bPinned = ALWAYS_INCLUDE.includes(b.fact.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b.score - a.score;
    })
    .slice(0, MAX_FACTS)
    .map((s) => s.fact);

  // Nothing matched the topic - fall back to the whole bank rather than
  // generating with no proof points at all.
  if (relevant.length <= ALWAYS_INCLUDE.length) return FACTS;

  // Restore fact-bank order so the prompt reads f1, f2, f3...
  return FACTS.filter((f) => relevant.some((r) => r.id === f.id));
}

export async function POST(request: Request) {
  let topic = "";
  try {
    const body = await request.json();
    topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "A topic is required." }, { status: 400 });
  }

  const model = process.env.TEXT_MODEL || "gpt-4o-mini";
  const facts = selectFacts(topic);

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.",
        topic,
        model,
        facts,
      },
      { status: 500 },
    );
  }

  try {
    // Step 2: generate. One structured call returns the whole pack.
    const { object: pack, usage } = await generateObject({
      model: openai(model),
      schema: contentPackSchema,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(topic, facts),
      temperature: 0.7,
    });

    // Step 3: validate. Deterministic, and it never edits the pack.
    const validation = validatePack(pack, FACTS);

    return NextResponse.json({
      topic,
      model,
      pack,
      facts,
      validation,
      usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    return NextResponse.json({ error: message, topic, model, facts }, { status: 500 });
  }
}
