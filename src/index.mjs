import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { assertRuntimeConfig, assertOpenAIConfig, cfg } from "./config.mjs";
import {
  dateInBelgrade,
  loadState,
  loadTopics,
  researchWriteVerify,
  saveState,
  isTopicRejectedError
} from "./content.mjs";
import { choosePriorityTopic, isDuplicateTopic } from "./news.mjs";
import { generateAndRender } from "./render.mjs";
import { commitAndPush, publicUrlFor, waitUntilPublic, verifyGitWriteAccess } from "./git.mjs";
import { publishCarousel, verifyInstagramConnection } from "./instagram.mjs";
import { isFatalOpenAIError, verifyOpenAIModelAccess } from "./openai.mjs";
import { clearPending, loadPending, savePending } from "./pending.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const INSTAGRAM_PREFLIGHT_IMAGE = "public/posts/2026-08-19-air-jordan-start/01.jpg";
let instagramPreflightDone = false;
let gitPreflightDone = false;

function cleanVisibleText(value = "") {
  return String(value)
    .replace(/[\u2010-\u2015]/g, ",")
    .replace(/\u00a0/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeVisiblePost(post) {
  post.cover.subheadline = cleanVisibleText(post.cover.subheadline);
  post.cover.headline_lines = post.cover.headline_lines.map(line => ({ ...line, text: cleanVisibleText(line.text) }));
  post.slide2.headline_lines = post.slide2.headline_lines.map(line => ({ ...line, text: cleanVisibleText(line.text) }));
  post.slide2.facts = post.slide2.facts.map(fact => ({ ...fact, tag: cleanVisibleText(fact.tag), text: cleanVisibleText(fact.text) }));
  post.slide3.headline_lines = post.slide3.headline_lines.map(line => ({ ...line, text: cleanVisibleText(line.text) }));
  post.slide3.facts = post.slide3.facts.map(fact => ({ ...fact, tag: cleanVisibleText(fact.tag), text: cleanVisibleText(fact.text) }));
  post.slide3.question = cleanVisibleText(post.slide3.question);
  post.caption = cleanVisibleText(post.caption);
  post.hashtags = post.hashtags.map(cleanVisibleText);
  return post;
}

function shortenAtWordBoundary(text, maxChars) {
  const value = cleanVisibleText(text);
  if (value.length <= maxChars) return value;
  const words = value.split(/\s+/);
  let out = "";
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > maxChars) break;
    out = next;
  }
  return out || value.slice(0, maxChars).trim();
}

function captionFor(post) {
  const publishers = [...new Set(post.sources.map(s => cleanVisibleText(s.publisher)).filter(Boolean))].slice(0, 4);
  const tags = post.hashtags.map(x => x.startsWith("#") ? x : `#${x}`).join(" ");
  const caption = shortenAtWordBoundary(post.caption, 550);
  return `${caption}\n\nIzvori: ${publishers.join(" / ")}\n\n${tags}`.slice(0, 2100);
}

function postFingerprint(post) {
  return createHash("sha256").update(JSON.stringify(post)).digest("hex").slice(0, 12);
}

function recentCheckpoint(pending, today) {
  if (!pending?.date || !pending?.seed || !pending?.post) return false;
  if (!["verified", "ready"].includes(pending.stage)) return false;
  const pendingTime = Date.parse(`${pending.date}T12:00:00Z`);
  const todayTime = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(pendingTime) || !Number.isFinite(todayTime)) return false;
  const ageDays = Math.floor((todayTime - pendingTime) / 86400000);
  return ageDays >= 0 && ageDays <= 2;
}

async function saveMetadata(dir, seed, post) {
  const meta = { generated_at: new Date().toISOString(), fingerprint: postFingerprint(post), seed, post };
  const file = path.join(dir, "metadata.json");
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temp, JSON.stringify(meta, null, 2) + "\n");
  await fs.rename(temp, file);
  return file;
}

async function usableFile(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile() && stat.size > 10000;
  } catch {
    return false;
  }
}

function expectedImagePaths(outDir) {
  return ["01.jpg", "02.jpg", "03.jpg"].map(name => path.join(outDir, name));
}

async function saveCheckpoint(data, message, extraPaths = []) {
  const pendingFile = await savePending(data);
  if (process.env.GITHUB_ACTIONS === "true" && !cfg.dryRun) {
    commitAndPush([...extraPaths, pendingFile], message, 6);
  }
  return pendingFile;
}

function gitPreflight() {
  if (cfg.dryRun || gitPreflightDone) return;
  verifyGitWriteAccess();
  gitPreflightDone = true;
}

async function instagramPreflight() {
  if (cfg.dryRun || instagramPreflightDone) return;
  let probeImageUrl = "";
  if (process.env.GITHUB_ACTIONS === "true") {
    const probePath = path.resolve(INSTAGRAM_PREFLIGHT_IMAGE);
    probeImageUrl = publicUrlFor(probePath);
    await waitUntilPublic(probeImageUrl, 60000);
  }
  await verifyInstagramConnection({ probeImageUrl });
  instagramPreflightDone = true;
}

async function openAIPreflightForStage(stage) {
  if (stage === "ready") {
    console.log("[openai] Ready checkpoint found; no OpenAI access is required for final publish.");
    return;
  }
  if (stage === "verified") {
    console.log("[openai] Verified checkpoint found; image API is optional and cannot block publishing.");
    return;
  }
  assertOpenAIConfig();
  await verifyOpenAIModelAccess({ text: true, image: false });
}

async function persistPublishedState({ today, chosenSeed, post, published }) {
  try {
    const latestState = await loadState();
    if (!latestState.posted.some(entry => entry.media_id === published.id)) {
      latestState.posted.push({
        date: today,
        topic_id: chosenSeed.id,
        seed_topic: chosenSeed.topic,
        topic_title: post.topic_title,
        media_id: published.id,
        sources: post.sources.map(s => s.url)
      });
    }
    latestState.last_publish_date = today;
    latestState.last_media_id = published.id;
    await saveState(latestState);
    const clearedPending = await clearPending();

    if (process.env.GITHUB_ACTIONS === "true") {
      commitAndPush(
        ["data/state.json", clearedPending],
        `Mark TrendyPatike post published ${today}`,
        8
      );
    }
    console.log("[state] Published state persisted successfully.");
  } catch (err) {
    // The user-facing objective has already succeeded. Never convert a live
    // Instagram post into a failed workflow because bookkeeping is temporarily
    // unavailable. The remote ready checkpoint + caption guard repairs it later.
    console.error(`[state] Instagram is LIVE, but bookkeeping could not finish: ${err.message}`);
    console.log("[state] Treating publish as successful; next run will recover state without AI calls or duplicate posting.");
  }
}

async function main() {
  const today = dateInBelgrade();
  const topics = await loadTopics();
  const state = await loadState();
  const initialPending = cfg.dryRun ? null : await loadPending();

  if (!cfg.forceRun && state.last_publish_date === today) {
    console.log(`Already published for ${today}; exiting.`);
    return;
  }

  assertRuntimeConfig();
  gitPreflight();
  await instagramPreflight();

  const hasRecentPending = recentCheckpoint(initialPending, today);
  const initialStage = hasRecentPending ? initialPending.stage : "new";
  await openAIPreflightForStage(initialStage);

  let chosenSeed = null;
  let post = null;
  let resumed = false;
  let workDate = today;

  if (hasRecentPending) {
    chosenSeed = initialPending.seed;
    post = initialPending.post;
    resumed = true;
    workDate = initialPending.date;
    console.log(`[resume] Reusing ${initialPending.stage} checkpoint from ${initialPending.date}: ${chosenSeed.topic}`);
    console.log("[resume] Skipping all completed paid stages.");
  } else {
    let lastError = null;
    const attemptedIds = new Set();

    for (let attempt = 1; attempt <= cfg.maxTopicAttempts; attempt++) {
      const seed = await choosePriorityTopic(
        topics.filter(t => !attemptedIds.has(t.id)),
        state,
        { allowMajorNews: attempt === 1 }
      );

      attemptedIds.add(seed.id);
      if (isDuplicateTopic(seed, state)) {
        lastError = new Error(`Duplicate topic blocked before research: ${seed.topic}`);
        console.warn(lastError.message);
        continue;
      }

      console.log(`[${attempt}/${cfg.maxTopicAttempts}] Researching: ${seed.topic}`);
      try {
        const candidatePost = sanitizeVisiblePost(await researchWriteVerify(seed));
        if (isDuplicateTopic({ id: seed.id, topic: candidatePost.topic_title }, state)) {
          lastError = new Error(`Duplicate topic blocked after writing: ${candidatePost.topic_title}`);
          console.warn(lastError.message);
          continue;
        }
        post = candidatePost;
        chosenSeed = seed;
        break;
      } catch (err) {
        if (isFatalOpenAIError(err)) throw err;
        if (!isTopicRejectedError(err)) throw err;
        lastError = err;
        console.warn(`Topic genuinely rejected by fact-check: ${err.message}`);
      }
    }

    if (!post || !chosenSeed) {
      throw new Error(`No topic passed fact verification. Last reason: ${lastError?.message || "unknown"}`);
    }

    if (!cfg.dryRun) {
      await saveCheckpoint(
        {
          date: today,
          stage: "verified",
          fingerprint: postFingerprint(post),
          seed: chosenSeed,
          post
        },
        `Checkpoint verified TrendyPatike post ${today}`
      );
    }
  }

  const fingerprint = postFingerprint(post);
  if (initialPending?.fingerprint && resumed && initialPending.fingerprint !== fingerprint) {
    throw new Error("Checkpoint fingerprint mismatch; refusing to mix different post content");
  }

  const safeId = chosenSeed.id.replace(/[^a-z0-9-]+/g, "-");
  const outDir = path.resolve("public/posts", `${workDate}-${safeId}-${fingerprint}`);
  const expectedImages = expectedImagePaths(outDir);

  let images;
  const canReuseImages =
    resumed && initialPending?.stage === "ready" &&
    (await Promise.all(expectedImages.map(usableFile))).every(Boolean);

  if (canReuseImages) {
    images = expectedImages;
    console.log("[resume] Reusing all 3 rendered images; zero image API calls.");
  } else {
    images = await generateAndRender(post, outDir);
  }

  const metadataFile = await saveMetadata(outDir, chosenSeed, post);
  const readyCheckpoint = {
    date: workDate,
    stage: "ready",
    fingerprint,
    seed: chosenSeed,
    post,
    image_paths: images.map(file => path.relative(process.cwd(), file).split(path.sep).join("/")),
    instagram: initialPending?.stage === "ready" ? (initialPending.instagram || {}) : {}
  };

  let pendingFile = null;
  if (!cfg.dryRun) pendingFile = await savePending(readyCheckpoint);

  const publicFiles = images.map(publicUrlFor);
  if (process.env.GITHUB_ACTIONS === "true") {
    const filesToCommit = pendingFile ? [...images, metadataFile, pendingFile] : [...images, metadataFile];
    commitAndPush(filesToCommit, `Checkpoint TrendyPatike assets ${workDate}`, 6);
    for (const url of publicFiles) await waitUntilPublic(url);
  } else if (!cfg.publicBaseUrl) {
    console.log("Local mode without PUBLIC_BASE_URL: skipping public URL check.");
  }

  console.log("Generated slides:");
  images.forEach(x => console.log(` - ${x}`));
  console.log("Sources:");
  post.sources.forEach(s => console.log(` - ${s.publisher}: ${s.url}`));

  if (cfg.dryRun) {
    console.log("DRY_RUN=true: generated and fact-checked, Instagram publish skipped.");
    return;
  }

  const persistInstagramProgress = async instagram => {
    const file = await savePending({ ...readyCheckpoint, instagram });
    if (process.env.GITHUB_ACTIONS === "true") {
      commitAndPush([file], `Checkpoint TrendyPatike Instagram progress ${workDate}`, 6);
    }
  };

  const published = await publishCarousel(publicFiles, captionFor(post), {
    resumeState: readyCheckpoint.instagram,
    onProgress: persistInstagramProgress
  });
  console.log(`Published Instagram media ID: ${published.id}`);

  await persistPublishedState({ today, chosenSeed, post, published });
}

async function runWithRecovery(maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await main();
    } catch (err) {
      lastError = err;
      if (isFatalOpenAIError(err) || cfg.dryRun || attempt >= maxAttempts) throw err;

      let pending = null;
      try { pending = await loadPending(); } catch {}
      if (!pending?.seed || !pending?.post || !["verified", "ready"].includes(pending.stage)) throw err;

      const delay = 10000 * attempt;
      console.warn(`[recovery] Attempt ${attempt}/${maxAttempts} failed after checkpoint: ${err.message}. Retry in ${delay / 1000}s.`);
      await sleep(delay);
    }
  }
  throw lastError || new Error("Publisher recovery failed");
}

runWithRecovery().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
