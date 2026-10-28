"use client";

import { useCallback, useState } from "react";

import factBank from "@/data/adpilot-facts.json";
import { LIMITS, type ContentPack, type Fact } from "@/lib/schema";
import type { ValidationResult } from "@/lib/validate";

const FACTS = factBank as Fact[];

type GenerateResponse = {
  topic: string;
  model: string;
  pack: ContentPack;
  facts: Fact[];
  validation: ValidationResult;
};

type ImageState = {
  loading: boolean;
  ok: boolean;
  image?: string;
  prompt?: string;
  error?: string;
};

/** Flat map of editable text, keyed by path e.g. "metaAds.0.headline". */
type Edits = Record<string, string>;

function initialEdits(pack: ContentPack): Edits {
  const edits: Edits = {
    "blog.title": pack.blog.title,
    "blog.body": pack.blog.body,
    "linkedin.post": pack.linkedin.post,
    "instagram.caption": pack.instagram.caption,
    "instagram.hashtags": pack.instagram.hashtags.join(" "),
    "image.concept": pack.image.concept,
    "image.prompt": pack.image.prompt,
  };
  pack.xThread.posts.forEach((p, i) => {
    edits[`xThread.${i}`] = p;
  });
  pack.metaAds.forEach((ad, i) => {
    edits[`metaAds.${i}.primaryText`] = ad.primaryText;
    edits[`metaAds.${i}.headline`] = ad.headline;
    edits[`metaAds.${i}.description`] = ad.description;
  });
  pack.googleAds.forEach((ad, i) => {
    ad.headlines.forEach((h, j) => {
      edits[`googleAds.${i}.h.${j}`] = h;
    });
    ad.descriptions.forEach((d, j) => {
      edits[`googleAds.${i}.d.${j}`] = d;
    });
  });
  return edits;
}

export default function Home() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [image, setImage] = useState<ImageState>({ loading: false, ok: false });

  const setEdit = (key: string, value: string) =>
    setEdits((prev) => ({ ...prev, [key]: value }));

  const toggleApproved = (key: string) =>
    setApproved((prev) => ({ ...prev, [key]: !prev[key] }));

  const generateImage = useCallback(async (prompt: string, aspectRatio: string) => {
    setImage({ loading: true, ok: false });
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspectRatio }),
      });
      const data = await res.json();
      setImage({
        loading: false,
        ok: Boolean(data.ok),
        image: data.image,
        prompt: data.prompt,
        error: data.error,
      });
    } catch (e) {
      setImage({
        loading: false,
        ok: false,
        error: e instanceof Error ? e.message : "Image request failed.",
      });
    }
  }, []);

  async function handleGenerate() {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setApproved({});
    setImage({ loading: false, ok: false });

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed.");

      setResult(data as GenerateResponse);
      setEdits(initialEdits(data.pack));
      // Step 4 of the pipeline: image, from the concept the model just wrote.
      void generateImage(data.pack.image.prompt, data.pack.image.aspectRatio);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  const pack = result?.pack;
  const approvedCount = Object.values(approved).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-xl font-semibold">AdPilot Content Agent</h1>
          <p className="mt-1 text-sm text-slate-600">
            Topic in, reviewed content pack out. Every draft is human-reviewed. Nothing is
            published or sent.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Topic input */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <label htmlFor="topic" className="block text-sm font-medium">
            Topic
          </label>
          <textarea
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            placeholder="e.g. Why D2C brands waste ad spend on boosted posts"
            className="mt-2 w-full rounded-md border border-slate-300 bg-white p-3 text-sm outline-none focus:border-slate-900"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={loading || !topic.trim()}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {loading ? "Generating..." : "Generate"}
            </button>
            {result && (
              <span className="text-xs text-slate-500">
                model: {result.model} · {approvedCount} asset
                {approvedCount === 1 ? "" : "s"} approved
              </span>
            )}
          </div>
          {error && (
            <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}
        </section>

        {loading && (
          <p className="mt-6 text-sm text-slate-600">
            Retrieving facts, generating the pack, running validation...
          </p>
        )}

        {pack && result && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Assets */}
            <div className="space-y-6 lg:col-span-2">
              <AssetCard
                title="Blog post"
                factIds={pack.blog.factIds}
                approved={!!approved.blog}
                onApprove={() => toggleApproved("blog")}
              >
                <Field
                  label="Title"
                  value={edits["blog.title"] ?? ""}
                  onChange={(v) => setEdit("blog.title", v)}
                  rows={2}
                />
                <Field
                  label="Body"
                  value={edits["blog.body"] ?? ""}
                  onChange={(v) => setEdit("blog.body", v)}
                  rows={14}
                  showWords
                />
              </AssetCard>

              <AssetCard
                title="LinkedIn post"
                factIds={pack.linkedin.factIds}
                approved={!!approved.linkedin}
                onApprove={() => toggleApproved("linkedin")}
              >
                <Field
                  label="Post"
                  value={edits["linkedin.post"] ?? ""}
                  onChange={(v) => setEdit("linkedin.post", v)}
                  rows={8}
                  showWords
                />
              </AssetCard>

              <AssetCard
                title={`X thread (${pack.xThread.posts.length} posts)`}
                factIds={pack.xThread.factIds}
                approved={!!approved.xThread}
                onApprove={() => toggleApproved("xThread")}
              >
                {pack.xThread.posts.map((_, i) => (
                  <Field
                    key={i}
                    label={`Post ${i + 1}`}
                    value={edits[`xThread.${i}`] ?? ""}
                    onChange={(v) => setEdit(`xThread.${i}`, v)}
                    rows={3}
                    limit={LIMITS.xPostMax}
                  />
                ))}
              </AssetCard>

              <AssetCard
                title="Instagram caption"
                factIds={pack.instagram.factIds}
                approved={!!approved.instagram}
                onApprove={() => toggleApproved("instagram")}
              >
                <Field
                  label="Caption"
                  value={edits["instagram.caption"] ?? ""}
                  onChange={(v) => setEdit("instagram.caption", v)}
                  rows={6}
                />
                <Field
                  label="Hashtags"
                  value={edits["instagram.hashtags"] ?? ""}
                  onChange={(v) => setEdit("instagram.hashtags", v)}
                  rows={2}
                />
              </AssetCard>

              {pack.metaAds.map((ad, i) => (
                <AssetCard
                  key={`meta-${i}`}
                  title={`Meta ad ${i + 1}`}
                  badge={ad.angle}
                  factIds={ad.factIds}
                  approved={!!approved[`metaAds.${i}`]}
                  onApprove={() => toggleApproved(`metaAds.${i}`)}
                >
                  <Field
                    label="Primary text"
                    value={edits[`metaAds.${i}.primaryText`] ?? ""}
                    onChange={(v) => setEdit(`metaAds.${i}.primaryText`, v)}
                    rows={4}
                  />
                  <Field
                    label="Headline"
                    value={edits[`metaAds.${i}.headline`] ?? ""}
                    onChange={(v) => setEdit(`metaAds.${i}.headline`, v)}
                    rows={2}
                  />
                  <Field
                    label="Description"
                    value={edits[`metaAds.${i}.description`] ?? ""}
                    onChange={(v) => setEdit(`metaAds.${i}.description`, v)}
                    rows={2}
                  />
                </AssetCard>
              ))}

              {pack.googleAds.map((ad, i) => (
                <AssetCard
                  key={`google-${i}`}
                  title={`Google ad ${i + 1}`}
                  factIds={ad.factIds}
                  approved={!!approved[`googleAds.${i}`]}
                  onApprove={() => toggleApproved(`googleAds.${i}`)}
                >
                  {ad.headlines.map((_, j) => (
                    <Field
                      key={`h${j}`}
                      label={`Headline ${j + 1}`}
                      value={edits[`googleAds.${i}.h.${j}`] ?? ""}
                      onChange={(v) => setEdit(`googleAds.${i}.h.${j}`, v)}
                      rows={1}
                      limit={LIMITS.googleHeadlineMax}
                    />
                  ))}
                  {ad.descriptions.map((_, j) => (
                    <Field
                      key={`d${j}`}
                      label={`Description ${j + 1}`}
                      value={edits[`googleAds.${i}.d.${j}`] ?? ""}
                      onChange={(v) => setEdit(`googleAds.${i}.d.${j}`, v)}
                      rows={2}
                      limit={LIMITS.googleDescriptionMax}
                    />
                  ))}
                </AssetCard>
              ))}

              {/* Image */}
              <AssetCard
                title="Image"
                badge={`${pack.image.channel} · ${pack.image.aspectRatio}`}
                factIds={pack.image.factIds}
                approved={!!approved.image}
                onApprove={() => toggleApproved("image")}
              >
                <Field
                  label="Concept"
                  value={edits["image.concept"] ?? ""}
                  onChange={(v) => setEdit("image.concept", v)}
                  rows={2}
                />
                <Field
                  label="Image prompt"
                  value={edits["image.prompt"] ?? ""}
                  onChange={(v) => setEdit("image.prompt", v)}
                  rows={5}
                />
                <div className="mt-2">
                  <button
                    onClick={() =>
                      generateImage(
                        edits["image.prompt"] ?? pack.image.prompt,
                        pack.image.aspectRatio,
                      )
                    }
                    disabled={image.loading}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  >
                    {image.loading ? "Generating image..." : "Regenerate image"}
                  </button>
                </div>

                {image.loading && (
                  <p className="mt-3 text-xs text-slate-500">Calling gpt-image-1...</p>
                )}

                {!image.loading && image.ok && image.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image.image}
                    alt={pack.image.concept}
                    className="mt-3 w-full max-w-md rounded-md border border-slate-200"
                  />
                )}

                {!image.loading && !image.ok && image.error && (
                  <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="font-medium">No image generated. Showing the prompt only.</p>
                    <p className="mt-1">{image.error}</p>
                    {image.prompt && (
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-amber-900">
                        {image.prompt}
                      </pre>
                    )}
                  </div>
                )}
              </AssetCard>
            </div>

            {/* Side panel: flags + facts */}
            <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold">Validation</h2>
                <p
                  className={`mt-2 rounded-md px-3 py-2 text-sm font-medium ${
                    result.validation.passed
                      ? "bg-green-50 text-green-800"
                      : "bg-red-50 text-red-800"
                  }`}
                >
                  {result.validation.passed ? "Passed all checks" : "Needs review"}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {result.validation.numbersChecked} numbers checked against the fact bank.
                </p>
                {result.validation.flags.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">No flags.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {result.validation.flags.map((flag, i) => (
                      <li
                        key={i}
                        className={`rounded-md p-2 text-xs ${
                          flag.severity === "error"
                            ? "bg-red-50 text-red-800"
                            : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        <span className="font-mono font-medium">{flag.asset}</span>
                        <span className="mx-1">·</span>
                        {flag.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold">Facts used</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {result.facts.length} of {FACTS.length} facts retrieved for this topic.
                </p>
                <ul className="mt-3 space-y-2">
                  {pack.factsUsed.map((id) => {
                    const fact = FACTS.find((f) => f.id === id);
                    return (
                      <li key={id} className="text-xs text-slate-700">
                        <span className="font-mono font-medium text-slate-900">{id}</span>{" "}
                        {fact ? fact.text : <span className="text-red-700">unknown fact id</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <p className="px-1 text-xs text-slate-500">
                Approve marks a draft as reviewed in this session only. There is no publishing.
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function AssetCard({
  title,
  badge,
  factIds,
  approved,
  onApprove,
  children,
}: {
  title: string;
  badge?: string;
  factIds: string[];
  approved: boolean;
  onApprove: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-lg border bg-white p-5 ${
        approved ? "border-green-400" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {badge && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {badge}
            </span>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={approved}
            onChange={onApprove}
            className="h-4 w-4 accent-green-600"
          />
          Approve
        </label>
      </div>
      {factIds.length > 0 && (
        <p className="mt-1 font-mono text-xs text-slate-500">facts: {factIds.join(", ")}</p>
      )}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  rows = 3,
  limit,
  showWords,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  limit?: number;
  showWords?: boolean;
}) {
  const over = limit !== undefined && value.length > limit;
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <span className={`text-xs ${over ? "font-medium text-red-600" : "text-slate-400"}`}>
          {showWords ? `${words} words · ` : ""}
          {value.length}
          {limit !== undefined ? ` / ${limit}` : ""}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={`mt-1 w-full rounded-md border bg-white p-2 text-sm outline-none focus:border-slate-900 ${
          over ? "border-red-400" : "border-slate-300"
        }`}
      />
    </div>
  );
}
