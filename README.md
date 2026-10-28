# AdPilot Content Agent

A human-in-the-loop content generator for **AdPilot Media**, a performance-marketing agency in Ahmedabad.

Type in a topic. The app retrieves relevant facts from a curated fact bank, generates a full content pack in one structured model call, runs deterministic validation over the result, generates an image, and presents everything as editable cards for a human to review.

**Nothing is auto-published or sent.** The Approve checkbox marks a draft as reviewed in UI state only.

Built for Team Gamma, AI FDE Fellowship Week 1. The build plan lives in [docs/plan.md](docs/plan.md).

---

## What it produces

One topic in, one content pack out:

- 1 blog post (~300–400 words)
- 1 LinkedIn post (~150 words)
- 1 X thread (4–6 posts, each ≤ 280 chars)
- 1 Instagram caption + hashtags
- 3 Meta ad variations (proof-led, offer-led, pain-led)
- 3 Google ad variations (3–5 headlines ≤ 30 chars, 2 descriptions ≤ 90 chars)
- 1 image concept, 1 image prompt, 1 generated image

Every asset carries a `factIds` array citing the fact-bank entries that support its claims.

---

## The core constraint

All claims about AdPilot must come from the fact bank. The model is instructed never to invent a statistic, and the validator then **checks that instruction was followed** rather than trusting it:

> Every number in the generated output must also appear in the fact bank, or it is flagged as an unsupported claim.

The validator never edits the pack. It produces flags; the human decides.

---

## Stack

| Piece | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript, Tailwind v4 |
| Generation | Vercel AI SDK (`ai` v7, `@ai-sdk/openai` v4) via `generateObject` + a Zod schema |
| Text model | `TEXT_MODEL` env var, defaults to `gpt-4o-mini` |
| Image model | `gpt-image-1` through the `openai` SDK, in a separate call |
| Retrieval | Keyword overlap over a 12-entry JSON fact bank |

No database and no vector store. The source material is a single small client page, so a JSON file is enough.

---

## Setup

Requires Node 20+ (developed on Node 24).

```bash
npm install
cp .env.example .env.local   # then add your key
npm run dev
```

Open http://localhost:3000.

### Environment

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_API_KEY` | yes | — | Text and image generation |
| `TEXT_MODEL` | no | `gpt-4o-mini` | Model for the content pack |

`.env.local` is gitignored and must never be committed. `.env.example` is committed as the template.

Without a key the app still runs: `/api/generate` returns a clear error with the retrieved facts, and `/api/image` returns the image prompt so the concept is still reviewable.

---

## Pipeline

```
Topic
  │
  ├─ 1. Retrieve    keyword overlap over data/adpilot-facts.json
  │                 f1 (who they are) and f12 (the CTA) are always included
  │
  ├─ 2. Generate    one generateObject call returns the whole pack,
  │                 each asset citing its fact ids
  │
  ├─ 3. Validate    deterministic checks, no LLM — returns flags, fixes nothing
  │
  ├─ 4. Image       image concept → image prompt → gpt-image-1
  │                 on failure, the prompt is returned instead
  │
  └─ 5. Review      editable cards, character counters, facts-used panel,
                    validation flags, per-asset Approve
```

---

## Project structure

```
data/adpilot-facts.json     fact bank: 12 entries, each { id, text }
lib/schema.ts               Zod schema for the content pack + shared LIMITS
lib/prompts.ts              system prompt, user prompt builder, image prompt builder
lib/validate.ts             deterministic checks, returns flags
app/api/generate/route.ts   retrieve + generate + validate
app/api/image/route.ts      gpt-image-1 call with prompt fallback
app/page.tsx                review UI
docs/plan.md                the original build plan
```

---

## Validation checks

Run in [lib/validate.ts](lib/validate.ts). All deterministic — no model involved.

| Check | Severity |
|---|---|
| Exactly 3 Meta ads, exactly 3 Google ads | error |
| X thread has 4–6 posts, each ≤ 280 chars | error |
| Google ads have 3–5 headlines ≤ 30 chars, exactly 2 descriptions ≤ 90 chars | error |
| Every number in the output appears in the fact bank | error |
| Every cited `factIds` entry exists in the fact bank | error |
| The three Meta ads use three different angles | warning |

Thread counters like `1/5` are treated as formatting, not claims, and are exempt from the number check.

### A note on where the limits live

Character and count limits are expressed as `.describe()` guidance in the schema, not as Zod `.min()` / `.max()` / `.length()` constraints. Those compile to JSON Schema keywords (`minLength`, `maxItems`, …) that OpenAI structured outputs rejects, which would fail the call outright.

So the schema guides the model and the validator enforces the limits. This is a feature, not a workaround: because the model is not structurally forced into compliance, the validator does real work and genuinely catches model mistakes.

---

## API

### `POST /api/generate`

```json
{ "topic": "Why D2C brands waste ad spend on boosted posts" }
```

Returns `{ topic, model, pack, facts, validation, usage }`, where `facts` is the retrieved subset and `validation` is `{ flags, passed, numbersChecked }`.

### `POST /api/image`

```json
{ "prompt": "...", "aspectRatio": "4:5" }
```

Returns `{ ok: true, image, prompt, size }` with the image as a base64 data URL, or `{ ok: false, error, prompt }` on failure. The aspect ratio is mapped onto the three sizes `gpt-image-1` accepts (`1024x1024`, `1024x1536`, `1536x1024`).

---

## Known limitations

- **Facts come from one static page.** Claims cannot be verified beyond that page, and the fact bank is maintained by hand.
- **The number check is strict by design.** A legitimate new figure will be flagged until it is added to the fact bank. That is the intended behaviour — a false flag costs a human a glance, a missed invented statistic costs the client.
- **The image model is weak at text** and may produce generic visuals. The prompt explicitly forbids text in the image.
- **Edits are session-only.** Editing a card or ticking Approve does not persist anywhere.

## Out of scope

Auto-publishing, authentication, a database, multi-agent orchestration, analytics.

Deferred: news-link ingestion, an auto-revise loop, an eval set of 10 topics, an LLM judge for tone.
