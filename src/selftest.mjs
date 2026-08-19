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

async function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  assert(Number.isFinite(nodeMajor) && nodeMajor >= 22, `Node 22+ required, got ${process.versions.node}`);

  // Import every runtime module. Imports themselves make no external requests.
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

  const state = await readJson("data/state.json");
  assert(state && typeof state === "object", "state.json must be an object");
  assert(Array.isArray(state.posted), "state.posted must be an array");
  assert(state.last_publish_date === null || /^\d{4}-\d{2}-\d{2}$/.test(state.last_publish_date), "state.last_publish_date invalid");

  const pending = await readJson("data/pending-post.json");
  assert(pending && typeof pending === "object" && !Array.isArray(pending), "pending-post.json must be an object");
  if (Object.keys(pending).length) {
    assert(["verified", "ready"].includes(pending.stage), `unsupported pending stage: ${pending.stage}`);
    assert(typeof pending.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pending.date), "pending date invalid");
    assert(pending.seed && pending.post, "pending checkpoint must contain seed and post");
    if (pending.stage === "ready") {
      assert(Array.isArray(pending.image_paths) && pending.image_paths.length === 3, "ready checkpoint needs three image paths");
    }
  }

  const cache = await readJson("data/openai-cache.json");
  assert(cache && typeof cache === "object" && !Array.isArray(cache), "openai-cache.json must be an object");

  assert(cfg.textModel === "gpt-5-mini-2025-08-07" || cfg.textModel === "gpt-5-mini",
    `unexpected text model: ${cfg.textModel}`);
  assert(cfg.verifyModel === "gpt-5-mini-2025-08-07" || cfg.verifyModel === "gpt-5-mini",
    `unexpected verifier model: ${cfg.verifyModel}`);
  assert(cfg.imageModel === "gpt-image-1-mini", `unexpected image model: ${cfg.imageModel}`);
  assert(["low", "medium", "high", "auto"].includes(cfg.imageQuality), `invalid image quality: ${cfg.imageQuality}`);
  assert(Number.isFinite(cfg.maxOpenAICalls) && cfg.maxOpenAICalls >= 6 && cfg.maxOpenAICalls <= 10,
    `MAX_OPENAI_CALLS must stay between 6 and 10, got ${cfg.maxOpenAICalls}`);
  assert(Number.isFinite(cfg.maxTopicAttempts) && cfg.maxTopicAttempts >= 1 && cfg.maxTopicAttempts <= 2,
    `MAX_TOPIC_ATTEMPTS must stay between 1 and 2, got ${cfg.maxTopicAttempts}`);

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

  // Full local carousel render test: SVG, font, Serbian glyphs, Sharp composites,
  // logo tinting and all three layouts, with zero network/API calls.
  await runRenderSelfTest();

  const date = dateInBelgrade();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), `Belgrade date formatter returned ${date}`);

  if (process.env.GITHUB_ACTIONS === "true") {
    assert(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY missing in Actions");
    assert(process.env.GITHUB_REF_NAME, "GITHUB_REF_NAME missing in Actions");
    const testUrl = publicUrlFor(probeImage);
    assert(testUrl.startsWith("https://raw.githubusercontent.com/"), `unexpected public URL: ${testUrl}`);
  }

  console.log(`[selftest] OK: ${topics.length} topics, JSON state, Meta JPEG and full 3-slide render all passed.`);
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
