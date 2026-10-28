# AdPilot Content Agent Build Plan

Team Gamma, AI FDE Fellowship Week 1. Client AdPilot Media (fictional performance-marketing agency, Ahmedabad).
Client site httpsfde-client-company-demos.aaryanptl.chatgpt.siteadpilot-media.html
Time budget prototype must run end to end in about 75 minutes. Optimize for a working demo, not polish.

## Goal

A Next.js app that takes a topic (plain text; news-link input is optional and last) and produces a reviewed content pack for AdPilot Media

- 1 blog post
- 1 LinkedIn post
- 1 X thread
- 1 Instagram caption
- 3 Meta ad variations
- 3 Google ad variations
- 1 image concept and 1 generated image (suited to the client and channel)

Rules a human reviews every draft. Nothing is auto-published or sent. Content is proof-led use AdPilot's real results and never invent stats or claims.

## Stack

- Next.js (App Router), TypeScript, Tailwind
- Vercel AI SDK (`ai`, `@ai-sdkopenai`) with `generateObject` and Zod schemas
- Text model from env var `TEXT_MODEL` (default `gpt-4o-mini`)
- Image OpenAI image API (`gpt-image-1`) in a separate call; fallback is to show the image prompt only
- Env `OPENAI_API_KEY` in `.env.local` (never commit)
- No database and no vector store. The client site is small, so a JSON fact bank is enough.

## Architecture (linear pipeline)

```
Topic input
  - 1. Retrieve select relevant facts from the fact bank (each fact has an id)
  - 2. Generate one structured call returns the whole pack, every claim cites fact ids
  - 3. Validate deterministic checks (limits, counts, numbers must exist in the fact bank)
  - 4. Image image concept - image prompt - image API
  - 5. Review UI cards per asset, facts used, validation flags, Regenerate  Approve
```

Approve only marks a draft as approved in UI state. There is no publishing.

## File layout

```
dataadpilot-facts.json        fact bank (below)
libschema.ts                  Zod schema for the content pack
libprompts.ts                 system prompt and generation instructions
libvalidate.ts                deterministic checks
appapigenerateroute.ts      retrieve + generate + validate
appapiimageroute.ts         image generation
apppage.tsx                   topic box, results cards, review controls
```

## Fact bank (dataadpilot-facts.json) each entry has `id`, `text`

- f1 AdPilot Media is a performance marketing agency in Ahmedabad, India running paid ads for D2C brands and local businesses.
- f2 Runs Meta (Facebook and Instagram) and Google ads; Google Partner; running performance ads since 2019 (7 years).
- f3 35 active client accounts; Rs 1.2 crore in ad spend managed monthly; team of 20.
- f4 Weekly reporting and no long lock-in contracts; client owns the ad account.
- f5 Skincare D2C brand ROAS rose from 2.1 to 3.4 in 90 days by restructuring the Meta account around three audiences and weekly creatives.
- f6 Dental clinic chain cost per lead fell from Rs 420 to Rs 260 using locality-based Google Search, call tracking and a faster booking page.
- f7 Coaching centre tripled monthly enquiries on the same budget by shifting from boosted posts to lead-form campaigns with WhatsApp follow-up.
- f8 Meta ads management from Rs 35,000month or 10% of spend.
- f9 Google Ads (Search, Performance Max, Shopping) from Rs 35,000month or 10% of spend.
- f10 Creative production (static ads, UGC-style videos, landing page fixes) from Rs 20,000month.
- f11 Process audit the account, agree one monthly target, launch campaigns within 10 working days, report weekly by WhatsApp with a monthly call.
- f12 CTA free 30-minute ad account audit with a written report.

## Schema (libschema.ts) requirements

Each asset includes `factIds string[]`.

- `blog` title, body (about 300 to 400 words)
- `linkedin` post (about 150 words)
- `xThread` array of 4 to 6 posts, each at most 280 characters
- `instagram` caption plus hashtags
- `metaAds` exactly 3 items primaryText, headline, description, angle (proof-led  offer-led  pain-led)
- `googleAds` exactly 3 items 3 to 5 headlines (each = 30 chars), 2 descriptions (each = 90 chars)
- `image` concept, prompt, aspectRatio, channel
- `factsUsed` array of fact ids

## Validation (libvalidate.ts), deterministic, no LLM

- Counts exactly 3 Meta ads, exactly 3 Google ads
- Google headlines = 30 chars, descriptions = 90 chars; each X post = 280 chars
- Every number or percentage in the output must appear in the fact bank, otherwise flag unsupported claim
- Every `factIds` entry must exist in the fact bank
- Return a list of flags shown in the UI. Do not silently fix; the human decides.

## Prompting rules

- Use ONLY facts from the provided fact bank for claims about AdPilot. If the topic needs a claim not in the bank, leave it out.
- Tone confident, practical, proof-led, no hype words, no guarantees of results.
- Meta ads three different angles (proof-led, offer-led using the free audit, pain-led).
- Image prompt describe subject, style, setting, aspect ratio; say no text in the image.
- Output language English.

## UI

- Topic textarea and Generate button, loading state
- Cards for each asset, editable text, character counters
- Side panel facts used (with ids and text) and validation flags
- Image section shows concept, prompt and generated image; Regenerate button
- Approve checkbox per asset (UI state only)

## Build order and time

1. (15 min) Scaffold project, fact bank, schema
2. (25 min) `apigenerate` working, test with curl or a simple page
3. (15 min) Review UI with cards, facts panel, flags
4. (15 min) Image route and display; validation checks
5. (10 min) Test 2 to 3 topics and write down notes for the demo

If short on time, cut in this order news-link ingestion, revise loop, eval harness, deployment (localhost is fine).

## Demo talking points

- Flow topic - retrieved facts - generated pack - image - human review
- Evaluation validator checks that every number in the output exists in the fact bank (state the pass rate over your test runs)
- One failure record a real one (for example a headline over 30 chars or an unsupported stat)
- One limitation facts come from one static page, so claims cannot be verified beyond it; the image model is weak at text and may produce generic visuals
- Next steps news-link ingestion, auto-revise loop, an eval set of 10 topics, an LLM judge for tone

## Out of scope for now

Auto-publishing, auth, database, multi-agent frameworks, analytics.