import fs from "node:fs/promises";
import path from "node:path";
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

async function saveMetadata(dir, seed, post) {
  const meta = {
    generated_at: new Date().toISOString(),
    seed,
    post
  };
  const file = path.join(dir, "metadata.json");
  await fs.writeFile(file, JSON.stringify(meta, null, 2) + "\n");
  return file;
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
    await verifyInstagramConnection();
  }

  let chosenSeed = null;
  let post = null;
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
      lastError = err;
      console.error(`Topic rejected: ${err.message}`);
    }
  }

  if (!post || !chosenSeed) {
    throw new Error(`No topic passed verification. Last error: ${lastError?.message || "unknown"}`);
  }

  const safeId = chosenSeed.id.replace(/[^a-z0-9-]+/g, "-");
  const outDir = path.resolve("public/posts", `${today}-${safeId}`);
  const images = await generateAndRender(post, outDir);
  await saveMetadata(outDir, chosenSeed, post);

  const publicFiles = images.map(publicUrlFor);

  if (process.env.GITHUB_ACTIONS === "true") {
    commitAndPush(["public"], `Generate TrendyPatike post ${today}`);
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

  state.posted.push({
    date: today,
    topic_id: chosenSeed.id,
    seed_topic: chosenSeed.topic,
    topic_title: post.topic_title,
    media_id: published.id,
    sources: post.sources.map(s => s.url)
  });
  state.last_publish_date = today;
  state.last_media_id = published.id;
  await saveState(state);

  if (process.env.GITHUB_ACTIONS === "true") {
    commitAndPush(["data/state.json"], `Mark TrendyPatike post published ${today}`);
  }
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
