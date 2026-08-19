import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { assertBaseConfig, cfg } from "./config.mjs";
import {
  dateInBelgrade,
  loadState,
  loadTopics,
  researchWriteVerify,
  saveState
} from "./content.mjs";
import { choosePriorityTopic, isDuplicateTopic } from "./news.mjs";
import { generateAndRender } from "./render.mjs";
import { commitAndPush, publicUrlFor, waitUntilPublic } from "./git.mjs";
import { publishCarousel, verifyInstagramConnection } from "./instagram.mjs";
import { isFatalOpenAIError } from "./openai.mjs";
import { clearPending, loadPending, savePending } from "./pending.mjs";

function cleanVisibleText(value = "") {
  return String(value)
    .replaceAll("—", ",")
    .replace(/\s+,/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeVisiblePost(post) {
  post.cover.subheadline = cleanVisibleText(post.cover.subheadline);
  post.cover.headline_lines = post.cover.headline_lines.map(line => ({
    ...line,
    text: cleanVisibleText(line.text)
  }));

  post.slide2.headline_lines = post.slide2.headline_lines.map(line => ({
    ...line,
    text: cleanVisibleText(line.text)
  }));
  post.slide2.facts = post.slide2.facts.map(fact => ({
    ...fact,
    tag: cleanVisibleText(fact.tag),
    text: cleanVisibleText(fact.text)
  }));

  post.slide3.headline_lines = post.slide3.headline_lines.map(line => ({
    ...line,
    text: cleanVisibleText(line.text)
  }));
  post.slide3.facts = post.slide3.facts.map(fact => ({
    ...fact,
    tag: cleanVisibleText(fact.tag),
    text: cleanVisibleText(fact.text)
  }));
  post.slide3.question = cleanVisibleText(post.slide3.question);
  post.caption = cleanVisibleText(post.caption);
  post.hashtags = post.hashtags.map(cleanVisibleText);

  return post;
}

function captionFor(post) {
  const publishers = [...new Set(post.sources.map(s => s.publisher))].slice(0, 4);
  const tags = post.hashtags.map(x => x.startsWith("#") ? x : `#${x}`).join(" ");
  const caption = cleanVisibleText(post.caption).slice(0, 550);
  return `${caption}\n\nIzvori: ${publishers.join(" / ")}\n\n${tags}`.slice(0, 2100);
}

function postFingerprint(post) {
  return createHash("sha256")
    .update(JSON.stringify(post))
    .digest("hex")
    .slice(0, 12);
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
  const meta = {
    generated_at: new Date().toISOString(),
    fingerprint: postFingerprint(post),
    seed,
    post
  };
  const file = path.join(dir, "metadata.json");
  await fs.writeFile(file, JSON.stringify(meta, null, 2) + "\n");
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

async function main() {
  assertBaseConfig();
  const today = dateInBelgrade();
  const topics = await loadTopics();
  const state = await loadState();

  if (!cfg.forceRun && state.last_publish_date === today) {
    console.log(`Already published for ${today}; exiting.`);
    return;
  }

  if (!cfg.dryRun) {
    // Fail before any OpenAI spending if the Instagram token/account is invalid.
    await verifyInstagramConnection();
  }

  const pending = cfg.dryRun ? null : await loadPending();
  let chosenSeed = null;
  let post = null;
  let resumed = false;
  let workDate = today;

  if (recentCheckpoint(pending, today)) {
    chosenSeed = pending.seed;
    post = pending.post;
    resumed = true;
    workDate = pending.date;
    console.log(`[resume] Reusing ${pending.stage} checkpoint from ${pending.date}: ${chosenSeed.topic}`);
    console.log("[resume] Skipping breaking-news scan, research and verifier.");
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
        console.error(lastError.message);
        continue;
      }

      console.log(`[${attempt}/${cfg.maxTopicAttempts}] Researching: ${seed.topic}`);

      try {
        const candidatePost = sanitizeVisiblePost(await researchWriteVerify(seed));

        if (isDuplicateTopic({ id: seed.id, topic: candidatePost.topic_title }, state)) {
          throw new Error(`Duplicate topic blocked after writing: ${candidatePost.topic_title}`);
        }

        post = candidatePost;
        chosenSeed = seed;
        break;
      } catch (err) {
        if (isFatalOpenAIError(err)) throw err;
        lastError = err;
        console.error(`Topic rejected: ${err.message}`);
      }
    }

    if (!post || !chosenSeed) {
      throw new Error(`No topic passed verification. Last error: ${lastError?.message || "unknown"}`);
    }

    if (!cfg.dryRun) {
      // Persist the expensive part FIRST. If images/Git/Meta fail afterwards,
      // the next run resumes here and does not pay for research again.
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
  if (pending?.fingerprint && resumed && pending.fingerprint !== fingerprint) {
    throw new Error("Checkpoint fingerprint mismatch; refusing to mix assets from different post content");
  }

  const safeId = chosenSeed.id.replace(/[^a-z0-9-]+/g, "-");
  const outDir = path.resolve("public/posts", `${workDate}-${safeId}-${fingerprint}`);
  const expectedImages = expectedImagePaths(outDir);

  let images;
  const canReuseImages =
    resumed &&
    pending?.stage === "ready" &&
    (await Promise.all(expectedImages.map(usableFile))).every(Boolean);

  if (canReuseImages) {
    images = expectedImages;
    console.log("[resume] Reusing 3 already-generated carousel images. No image API calls needed.");
  } else {
    // generateAndRender also reuses any individually checkpointed slide in this
    // fingerprinted directory, so a failure on slide 3 never repays slides 1-2.
    images = await generateAndRender(post, outDir);
  }

  const metadataFile = await saveMetadata(outDir, chosenSeed, post);
  let pendingFile = null;

  if (!cfg.dryRun) {
    pendingFile = await savePending({
      date: workDate,
      stage: "ready",
      fingerprint,
      seed: chosenSeed,
      post,
      image_paths: images.map(file => path.relative(process.cwd(), file).split(path.sep).join("/"))
    });
  }

  const publicFiles = images.map(publicUrlFor);

  if (process.env.GITHUB_ACTIONS === "true") {
    const filesToCommit = pendingFile
      ? [...images, metadataFile, pendingFile]
      : [...images, metadataFile];

    // Persist final assets before asking Meta to ingest them. A Meta/API failure
    // can then be retried later with zero OpenAI cost.
    commitAndPush(filesToCommit, `Checkpoint TrendyPatike assets ${workDate}`, 6);
    for (const url of publicFiles) await waitUntilPublic(url);
  } else if (!cfg.publicBaseUrl) {
    console.log("Local mode without PUBLIC_BASE_URL: skipping URL availability check.");
  }

  console.log("Generated slides:");
  images.forEach(x => console.log(` - ${x}`));
  console.log("Sources:");
  post.sources.forEach(s => console.log(` - ${s.publisher}: ${s.url}`));

  if (cfg.dryRun) {
    console.log("DRY_RUN=true: generated and fact-checked, but Instagram publish was skipped.");
    return;
  }

  const published = await publishCarousel(publicFiles, captionFor(post));
  console.log(`Published Instagram media ID: ${published.id}`);

  // commitAndPush may have reset the checkout to a newer main, so reload the
  // latest state before recording the successful publication.
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
    // This is the one post-publish write. Retry harder because state persistence
    // prevents the next scheduled run from creating a duplicate post.
    commitAndPush(
      ["data/state.json", clearedPending],
      `Mark TrendyPatike post published ${today}`,
      8
    );
  }
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
