import fs from "node:fs";
import { isDuplicateTopic } from "../src/news.mjs";

const state = JSON.parse(fs.readFileSync("data/state.json", "utf8"));
const batch = JSON.parse(fs.readFileSync("data/fallback-posts-batch.json", "utf8"));
if (!Array.isArray(batch) || batch.length !== 6) throw Error("Expected exactly six verified catch-up posts");
const ids = new Set();
for (const item of batch) {
  const { seed, post } = item;
  if (!seed?.id || !seed?.topic || !post) throw Error("Missing seed/post");
  if (ids.has(seed.id)) throw Error("Duplicate batch ID: " + seed.id);
  ids.add(seed.id);
  if (post.slide_count !== 3 || post.cover?.headline_lines?.length < 1 ||
      post.slide2?.facts?.length !== 3 || post.slide3?.facts?.length !== 2 ||
      post.image_prompts?.length !== 3 || post.sources?.length < 2 ||
      post.claims?.length < 3) throw Error("Incomplete carousel: " + seed.id);
  const sourceUrls = new Set(post.sources.map(s => s.url));
  if ([...sourceUrls].some(u => !/^https:\/\//.test(u))) throw Error("Invalid source URL: " + seed.id);
  for (const claim of post.claims) {
    if (!claim.source_urls?.length || claim.source_urls.some(u => !sourceUrls.has(u))) throw Error("Unreferenced claim: " + seed.id);
  }
  for (const prompt of post.image_prompts) if (prompt.length < 40) throw Error("Image prompt too short: " + seed.id);
}
const remaining = batch.filter(item => !isDuplicateTopic(item.seed, state));
if (process.argv.includes("--count")) console.log(remaining.length);
else console.log("[zero-cost preflight] PASS: six complete fact-sourced carousels; " + remaining.length + " unposted; no API calls or paid work.");
