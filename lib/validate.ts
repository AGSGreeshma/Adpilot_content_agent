import { LIMITS, type ContentPack, type Fact } from "./schema";

export type Flag = {
  asset: string;
  severity: "error" | "warning";
  message: string;
};

const NUMBER_RE = /\d+(?:,\d{3})*(?:\.\d+)?/g;
/** Thread counters like "1/5" are formatting, not claims. */
const THREAD_COUNTER_RE = /\b\d+\s*\/\s*\d+\b/g;

function parseNumbers(text: string): number[] {
  const matches = text.match(NUMBER_RE) ?? [];
  return matches.map((m) => Number.parseFloat(m.replace(/,/g, "")));
}

/** Every number that legitimately appears in the fact bank. */
function allowedNumbers(facts: Fact[]): Set<number> {
  const allowed = new Set<number>();
  for (const fact of facts) {
    for (const n of parseNumbers(fact.text)) allowed.add(n);
  }
  return allowed;
}

/** Flatten the pack into labelled text blocks so numbers can be traced to an asset. */
function textBlocks(pack: ContentPack): { asset: string; text: string }[] {
  const blocks: { asset: string; text: string }[] = [
    { asset: "blog", text: `${pack.blog.title}\n${pack.blog.body}` },
    { asset: "linkedin", text: pack.linkedin.post },
    {
      asset: "instagram",
      text: `${pack.instagram.caption}\n${pack.instagram.hashtags.join(" ")}`,
    },
    { asset: "image", text: `${pack.image.concept}\n${pack.image.prompt}` },
  ];

  pack.xThread.posts.forEach((post, i) => {
    blocks.push({ asset: `xThread[${i + 1}]`, text: post.replace(THREAD_COUNTER_RE, " ") });
  });

  pack.metaAds.forEach((ad, i) => {
    blocks.push({
      asset: `metaAds[${i + 1}]`,
      text: `${ad.primaryText}\n${ad.headline}\n${ad.description}`,
    });
  });

  pack.googleAds.forEach((ad, i) => {
    blocks.push({
      asset: `googleAds[${i + 1}]`,
      text: `${ad.headlines.join("\n")}\n${ad.descriptions.join("\n")}`,
    });
  });

  return blocks;
}

/** Collect every factIds array in the pack, with its asset label. */
function factIdRefs(pack: ContentPack): { asset: string; ids: string[] }[] {
  return [
    { asset: "blog", ids: pack.blog.factIds },
    { asset: "linkedin", ids: pack.linkedin.factIds },
    { asset: "xThread", ids: pack.xThread.factIds },
    { asset: "instagram", ids: pack.instagram.factIds },
    { asset: "image", ids: pack.image.factIds },
    ...pack.metaAds.map((ad, i) => ({ asset: `metaAds[${i + 1}]`, ids: ad.factIds })),
    ...pack.googleAds.map((ad, i) => ({ asset: `googleAds[${i + 1}]`, ids: ad.factIds })),
    { asset: "factsUsed", ids: pack.factsUsed },
  ];
}

export type ValidationResult = {
  flags: Flag[];
  passed: boolean;
  /** How many distinct numbers were checked against the fact bank. */
  numbersChecked: number;
};

/**
 * Deterministic checks only. No LLM, no silent fixing - every problem becomes a
 * flag and the human reviewer decides what to do about it.
 */
export function validatePack(pack: ContentPack, facts: Fact[]): ValidationResult {
  const flags: Flag[] = [];
  const knownIds = new Set(facts.map((f) => f.id));
  const allowed = allowedNumbers(facts);

  // --- counts ---
  if (pack.metaAds.length !== LIMITS.metaAdsCount) {
    flags.push({
      asset: "metaAds",
      severity: "error",
      message: `Expected exactly ${LIMITS.metaAdsCount} Meta ads, got ${pack.metaAds.length}.`,
    });
  }
  if (pack.googleAds.length !== LIMITS.googleAdsCount) {
    flags.push({
      asset: "googleAds",
      severity: "error",
      message: `Expected exactly ${LIMITS.googleAdsCount} Google ads, got ${pack.googleAds.length}.`,
    });
  }
  if (
    pack.xThread.posts.length < LIMITS.xPostsMin ||
    pack.xThread.posts.length > LIMITS.xPostsMax
  ) {
    flags.push({
      asset: "xThread",
      severity: "error",
      message: `Expected ${LIMITS.xPostsMin} to ${LIMITS.xPostsMax} posts, got ${pack.xThread.posts.length}.`,
    });
  }

  // --- character limits ---
  pack.xThread.posts.forEach((post, i) => {
    if (post.length > LIMITS.xPostMax) {
      flags.push({
        asset: `xThread[${i + 1}]`,
        severity: "error",
        message: `Post is ${post.length} characters, limit is ${LIMITS.xPostMax}.`,
      });
    }
  });

  pack.googleAds.forEach((ad, i) => {
    const label = `googleAds[${i + 1}]`;
    if (
      ad.headlines.length < LIMITS.googleHeadlinesMin ||
      ad.headlines.length > LIMITS.googleHeadlinesMax
    ) {
      flags.push({
        asset: label,
        severity: "error",
        message: `Expected ${LIMITS.googleHeadlinesMin} to ${LIMITS.googleHeadlinesMax} headlines, got ${ad.headlines.length}.`,
      });
    }
    if (ad.descriptions.length !== LIMITS.googleDescriptionsCount) {
      flags.push({
        asset: label,
        severity: "error",
        message: `Expected exactly ${LIMITS.googleDescriptionsCount} descriptions, got ${ad.descriptions.length}.`,
      });
    }
    ad.headlines.forEach((h, j) => {
      if (h.length > LIMITS.googleHeadlineMax) {
        flags.push({
          asset: label,
          severity: "error",
          message: `Headline ${j + 1} ("${h}") is ${h.length} characters, limit is ${LIMITS.googleHeadlineMax}.`,
        });
      }
    });
    ad.descriptions.forEach((d, j) => {
      if (d.length > LIMITS.googleDescriptionMax) {
        flags.push({
          asset: label,
          severity: "error",
          message: `Description ${j + 1} is ${d.length} characters, limit is ${LIMITS.googleDescriptionMax}.`,
        });
      }
    });
  });

  // --- meta ad angles ---
  const angles = new Set(pack.metaAds.map((ad) => ad.angle));
  if (pack.metaAds.length === LIMITS.metaAdsCount && angles.size !== LIMITS.metaAdsCount) {
    flags.push({
      asset: "metaAds",
      severity: "warning",
      message: `Expected three different angles, got: ${pack.metaAds.map((a) => a.angle).join(", ")}.`,
    });
  }

  // --- fact ids must exist ---
  for (const ref of factIdRefs(pack)) {
    for (const id of ref.ids) {
      if (!knownIds.has(id)) {
        flags.push({
          asset: ref.asset,
          severity: "error",
          message: `Cites unknown fact id "${id}".`,
        });
      }
    }
  }

  // --- every number in the output must exist in the fact bank ---
  let numbersChecked = 0;
  for (const block of textBlocks(pack)) {
    const seen = new Set<number>();
    for (const n of parseNumbers(block.text)) {
      if (seen.has(n)) continue;
      seen.add(n);
      numbersChecked += 1;
      if (!allowed.has(n)) {
        flags.push({
          asset: block.asset,
          severity: "error",
          message: `Unsupported claim: the number "${n}" does not appear in the fact bank.`,
        });
      }
    }
  }

  return {
    flags,
    passed: flags.every((f) => f.severity !== "error"),
    numbersChecked,
  };
}
