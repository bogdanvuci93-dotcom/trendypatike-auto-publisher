import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { cfg } from "./config.mjs";
import { dateInBelgrade } from "./content.mjs";
import { publicUrlFor } from "./git.mjs";
import { runRenderSelfTest } from "./render.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(`Self-test failed: ${message}`);
}

async function readJson(file) {
  const raw = await fs.readFile(path.resolve(file), "utf8");
  return JSON.parse(raw);
}

function normalizedUrl(raw = "") {
  try {
    const u = new URL(raw);
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

function assertPostShape(post, label) {
  assert(post && typeof post === "object", `${label} post missing`);
  const effectiveSlideCount = post.slide_count ?? 3;
  assert(Number.isInteger(effectiveSlideCount) && effectiveSlideCount >= 1 && effectiveSlideCount <= 3, `${label} slide_count invalid`);
  assert(typeof post.topic_title === "string" && post.topic_title.length >= 8, `${label} topic_title invalid`);
  assert(Array.isArray(post.cover?.headline_lines) && post.cover.headline_lines.length >= 1, `${label} cover headlines invalid`);
  assert(typeof post.cover?.subheadline === "string" && post.cover.subheadline.length >= 20, `${label} subheadline invalid`);
  assert(Array.isArray(post.slide2?.facts) && post.slide2.facts.length === 3, `${label} slide2 facts invalid`);
  assert(Array.isArray(post.slide3?.facts) && post.slide3.facts.length === 2, `${label} slide3 facts invalid`);
  assert(typeof post.slide3?.question === "string" && post.slide3.question.length >= 3, `${label} question invalid`);
  assert(typeof post.caption === "string" && post.caption.length >= 80, `${label} caption invalid`);
  assert(Array.isArray(post.hashtags) && post.hashtags.length >= 4 && post.hashtags.length <= 8, `${label} hashtags invalid`);
  assert(Array.isArray(post.image_prompts) && post.image_prompts.length === 3, `${label} image prompts invalid`);
  assert(Array.isArray(post.sources) && post.sources.length >= 2, `${label} needs at least two sources`);
  assert(Array.isArray(post.claims) && post.claims.length >= 3, `${label} claims invalid`);

  const sourceUrls = new Set();
  for (const source of post.sources) {
    assert(/^https:\/\//.test(source.url || ""), `${label} source URL invalid`);
    const key = normalizedUrl(source.url);
    assert(key, `${label} source URL cannot be normalized`);
    assert(!sourceUrls.has(key), `${label} duplicate source URL`);
    sourceUrls.add(key);
  }

  for (const claim of post.claims) {
    assert(typeof claim?.claim === "string" && claim.claim.length >= 12, `${label} claim text invalid`);
    assert(Array.isArray(claim.source_urls) && claim.source_urls.length >= 1, `${label} claim source_urls invalid`);
    for (const url of claim.source_urls) {
      const key = normalizedUrl(url);
      assert(key && sourceUrls.has(key), `${label} claim references URL not present in sources: ${url}`);
    }
  }

  for (let i = 0; i < post.image_prompts.length; i++) {
    assert(typeof post.image_prompts[i] === "string" && post.image_prompts[i].length >= 40,
      `${label} image prompt ${i + 1} too weak/short`);
  }
}

async function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  assert(Number.isFinite(nodeMajor) && nodeMajor >= 22, `Node 22+ required, got ${process.versions.node}`);

  await Promise.all([
    import("./openai.mjs"),
    import("./news.mjs"),
    import("./schemas.mjs"),
    import("./render.mjs"),
    import("./instagram.mjs"),
    import("./pending.mjs")
  ]);

  const topics = await readJson("data/topics.json");
  assert(Array.isArray(topics) && topics.length >= 20, "topics.json must contain at least 20 curated topics");

  const ids = new Set();
  for (const topic of topics) {
    assert(topic && typeof topic === "object", "every topic must be an object");
    assert(typeof topic.id === "string" && /^[a-z0-9-]+$/.test(topic.id), `invalid topic id: ${topic?.id}`);
    assert(!ids.has(topic.id), `duplicate topic id: ${topic.id}`);
    ids.add(topic.id);
    assert(typeof topic.topic === "string" && topic.topic.length >= 12, `topic text missing for ${topic.id}`);
    assert(typeof topic.category === "string" && topic.category.length >= 3, `category missing for ${topic.id}`);
    assert(Array.isArray(topic.preferred_domains) && topic.preferred_domains.length >= 1, `domains missing for ${topic.id}`);
    assert(topic.preferred_domains.every(x => typeof x === "string" && !x.includes("://")), `invalid domain in ${topic.id}`);
    assert(typeof topic.visual_subject === "string" && topic.visual_subject.length >= 8, `visual subject missing for ${topic.id}`);
  }

  const fallbacks = await readJson("data/fallback-posts.json");
  assert(Array.isArray(fallbacks) && fallbacks.length >= 5, "fallback-posts.json needs at least five emergency posts");
  const fallbackIds = new Set();
  for (const entry of fallbacks) {
    assert(entry?.seed && entry?.post, "every fallback needs seed and post");
    assert(typeof entry.seed.id === "string" && /^[a-z0-9-]+$/.test(entry.seed.id), `invalid fallback id ${entry.seed.id}`);
    assert(!fallbackIds.has(entry.seed.id), `duplicate fallback id ${entry.seed.id}`);
    fallbackIds.add(entry.seed.id);
    assert(entry.seed.emergency_only === true, `${entry.seed.id} must be marked emergency_only`);
    assert(entry.post.force_local_images === true, `${entry.seed.id} must force zero-cost local images`);
    assertPostShape(entry.post, entry.seed.id);
  }

  const state = await readJson("data/state.json");
  assert(state && typeof state === "object", "state.json must be an object");
  assert(Array.isArray(state.posted), "state.posted must be an array");
  assert(state.last_publish_date === null || /^\d{4}-\d{2}-\d{2}$/.test(state.last_publish_date), "state.last_publish_date invalid");
  for (const entry of state.posted) {
    assert(typeof entry.topic_id === "string" && entry.topic_id.length >= 3, "state entry topic_id invalid");
    assert(typeof entry.media_id === "string" && entry.media_id.length >= 5, "state entry media_id invalid");
  }

  const pending = await readJson("data/pending-post.json");
  assert(pending && typeof pending === "object" && !Array.isArray(pending), "pending-post.json must be an object");
  if (Object.keys(pending).length) {
    assert(["verified", "ready"].includes(pending.stage), `unsupported pending stage: ${pending.stage}`);
    assert(typeof pending.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pending.date), "pending date invalid");
    assert(pending.seed && pending.post, "pending checkpoint must contain seed and post");
    assertPostShape(pending.post, "pending");
    if (pending.stage === "ready") {
      const needed = pending.post.slide_count ?? 3;
      assert(Array.isArray(pending.image_paths) && pending.image_paths.length >= needed,
        "ready checkpoint does not contain enough image paths for slide_count");
    }
  }

  const cache = await readJson("data/openai-cache.json");
  assert(cache && typeof cache === "object" && !Array.isArray(cache), "openai-cache.json must be an object");

  assert(cfg.textModel === "gpt-5-mini-2025-08-07" || cfg.textModel === "gpt-5-mini", `unexpected text model: ${cfg.textModel}`);
  assert(cfg.verifyModel === "gpt-5-mini-2025-08-07" || cfg.verifyModel === "gpt-5-mini", `unexpected verifier model: ${cfg.verifyModel}`);
  assert(cfg.imageModel === "gpt-image-1-mini", `unexpected image model: ${cfg.imageModel}`);
  assert(["low", "medium", "high", "auto"].includes(cfg.imageQuality), `invalid image quality: ${cfg.imageQuality}`);
  assert(Number.isFinite(cfg.maxOpenAICalls) && cfg.maxOpenAICalls >= 6 && cfg.maxOpenAICalls <= 8,
    `MAX_OPENAI_CALLS must stay between 6 and 8, got ${cfg.maxOpenAICalls}`);
  assert(cfg.maxTopicAttempts === 1, `MAX_TOPIC_ATTEMPTS must be exactly 1, got ${cfg.maxTopicAttempts}`);

  const logo = path.resolve("assets/logo-mark-white.png");
  const logoStat = await fs.stat(logo);
  assert(logoStat.isFile() && logoStat.size > 1000, "logo asset is missing or empty");
  const logoMeta = await sharp(logo).metadata();
  assert((logoMeta.width || 0) > 0 && (logoMeta.height || 0) > 0, "Sharp cannot decode logo asset");

  const probeImage = path.resolve("public/posts/2026-08-19-air-jordan-start/01.jpg");
  const probeStat = await fs.stat(probeImage);
  assert(probeStat.isFile() && probeStat.size > 10000, "Instagram preflight JPEG is missing");
  const probeMeta = await sharp(probeImage).metadata();
  assert(probeMeta.format === "jpeg" && (probeMeta.width || 0) > 0 && (probeMeta.height || 0) > 0,
    "Instagram preflight JPEG cannot be decoded");

  await runRenderSelfTest();

  const date = dateInBelgrade();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), `Belgrade date formatter returned ${date}`);

  if (process.env.GITHUB_ACTIONS === "true") {
    assert(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY missing in Actions");
    assert(process.env.GITHUB_REF_NAME, "GITHUB_REF_NAME missing in Actions");
    const testUrl = publicUrlFor(probeImage);
    assert(testUrl.startsWith("https://raw.githubusercontent.com/"), `unexpected public URL: ${testUrl}`);
  }

  console.log(`[selftest] OK: ${topics.length} curated topics, ${fallbacks.length} emergency posts, state, Meta JPEG and render contract passed.`);
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
