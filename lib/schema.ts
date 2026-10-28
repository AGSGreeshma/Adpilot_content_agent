import { z } from "zod";

/**
 * Zod schema for the AdPilot content pack.
 *
 * Note: length/count limits are expressed in .describe() text rather than as
 * zod .min()/.max()/.length() constraints. Those compile to JSON Schema
 * keywords (minLength, maxItems, ...) that OpenAI structured outputs rejects.
 * The hard limits are enforced deterministically in lib/validate.ts, which is
 * where the plan puts them anyway: the validator flags violations and a human
 * decides.
 */

const factIds = z
  .array(z.string())
  .describe("Fact bank ids (e.g. ['f5','f12']) supporting every claim in this asset.");

export const contentPackSchema = z.object({
  blog: z.object({
    title: z.string().describe("Blog post title."),
    body: z.string().describe("Blog body, about 300 to 400 words. Plain paragraphs."),
    factIds,
  }),
  linkedin: z.object({
    post: z.string().describe("LinkedIn post, about 150 words."),
    factIds,
  }),
  xThread: z.object({
    posts: z
      .array(z.string())
      .describe("4 to 6 posts. Each post MUST be at most 280 characters."),
    factIds,
  }),
  instagram: z.object({
    caption: z.string().describe("Instagram caption."),
    hashtags: z.array(z.string()).describe("Hashtags, each starting with #."),
    factIds,
  }),
  metaAds: z
    .array(
      z.object({
        primaryText: z.string().describe("Meta ad primary text."),
        headline: z.string().describe("Meta ad headline."),
        description: z.string().describe("Meta ad description."),
        angle: z
          .enum(["proof-led", "offer-led", "pain-led"])
          .describe("The angle of this variation."),
        factIds,
      }),
    )
    .describe("EXACTLY 3 Meta ad variations, one per angle: proof-led, offer-led, pain-led."),
  googleAds: z
    .array(
      z.object({
        headlines: z
          .array(z.string())
          .describe("3 to 5 headlines. Each MUST be at most 30 characters."),
        descriptions: z
          .array(z.string())
          .describe("Exactly 2 descriptions. Each MUST be at most 90 characters."),
        factIds,
      }),
    )
    .describe("EXACTLY 3 Google ad variations."),
  image: z.object({
    concept: z.string().describe("One-line description of the image idea."),
    prompt: z
      .string()
      .describe("Image generation prompt: subject, style, setting, aspect ratio. Must say no text in the image."),
    aspectRatio: z.string().describe("Aspect ratio, e.g. '1:1' or '4:5'."),
    channel: z.string().describe("Channel the image is suited to, e.g. 'Instagram' or 'LinkedIn'."),
    factIds,
  }),
  factsUsed: z
    .array(z.string())
    .describe("All fact bank ids used anywhere in this pack."),
});

export type ContentPack = z.infer<typeof contentPackSchema>;

export type Fact = { id: string; text: string };

/** Asset-level limits, shared by the schema descriptions, the prompt and the validator. */
export const LIMITS = {
  metaAdsCount: 3,
  googleAdsCount: 3,
  googleHeadlineMax: 30,
  googleHeadlinesMin: 3,
  googleHeadlinesMax: 5,
  googleDescriptionMax: 90,
  googleDescriptionsCount: 2,
  xPostMax: 280,
  xPostsMin: 4,
  xPostsMax: 6,
} as const;
