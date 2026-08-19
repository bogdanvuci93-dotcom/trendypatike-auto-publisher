import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { cfg } from "./config.mjs";
import { dateInBelgrade } from "./content.mjs";
import { publicUrlFor } from "./git.mjs";

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

  // Import every runtime module without making external requests. This catches
  // broken imports/exports and module initialization problems before paid work.
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

  const pending = await readJson("data/pending-post.json");
  assert(pending && typeof pending === "object" && !Array.isArray(pending), "pending-post.json must be an object");
  if (Object.keys(pending).length) {
    assert(["verified", "ready"].includes(pending.stage), `unsupported pending stage: ${pending.stage}`);
    assert(typeof pending.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(pending.date), "pending date invalid");
    assert(pending.seed && pending.post, "pending checkpoint must contain seed and post");
  }

  assert(typeof cfg.textModel === "string" && cfg.textModel.length > 0, "TEXT_MODEL missing");
  assert(typeof cfg.verifyModel === "string" && cfg.verifyModel.length > 0, "VERIFY_MODEL missing");
  assert(typeof cfg.imageModel === "string" && cfg.imageModel.length > 0, "IMAGE_MODEL missing");
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
  const probe = await sharp(logo).resize({ width: 32 }).png().toBuffer();
  assert(probe.length > 100, "Sharp render probe failed");

  const date = dateInBelgrade();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), `Belgrade date formatter returned ${date}`);

  if (process.env.GITHUB_ACTIONS === "true") {
    assert(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY missing in Actions");
    assert(process.env.GITHUB_REF_NAME, "GITHUB_REF_NAME missing in Actions");
    const testUrl = publicUrlFor(path.resolve("public/posts/selftest/01.jpg"));
    assert(testUrl.startsWith("https://raw.githubusercontent.com/"), `unexpected public URL: ${testUrl}`);
  }

  console.log(`[selftest] OK: ${topics.length} topics, Sharp OK, modules OK, budget guards OK.`);
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
