import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "./config.mjs";
import { structuredWebResponse } from "./openai.mjs";
import { postSchema, verifierSchema, freshSeedSchema } from "./schemas.mjs";

const GLOBAL_TRUSTED_DOMAINS = [
  "about.nike.com", "nike.com", "nba.com", "news.adidas.com", "adidas-group.com",
  "adidas.com", "about.puma.com", "puma.com", "converse.com", "vans.com",
  "newbalance.com", "newbalance.newsmarket.com", "asics.com", "reebok.com",
  "olympics.com", "smithsonianmag.com", "moma.org", "britannica.com", "gq.com"
];

export class TopicRejectedError extends Error {
  constructor(message) {
    super(message);
    this.name = "TopicRejectedError";
  }
}

export function isTopicRejectedError(err) {
  return err instanceof TopicRejectedError;
}

async function atomicWriteJson(file, value) {
  const target = path.resolve(file);
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temp, target);
}

export async function loadTopics() {
  return JSON.parse(await fs.readFile(path.resolve("data/topics.json"), "utf8"));
}

export async function loadState() {
  return JSON.parse(await fs.readFile(path.resolve("data/state.json"), "utf8"));
}

export async function saveState(state) {
  await atomicWriteJson("data/state.json", state);
}

export function dateInBelgrade() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function notPostedTopics(topics, state) {
  const used = new Set((state.posted || []).map(x => x.topic_id));
  return topics.filter(t => !used.has(t.id));
}

export async function chooseTopic(topics, state) {
  const available = notPostedTopics(topics, state);
  if (available.length) return available[0];
  return discoverFreshTopic(state);
}

async function discoverFreshTopic(state) {
  const previous = (state.posted || [])
    .slice(-200)
    .map(x => x.seed_topic || x.topic_title)
    .filter(Boolean);

  const prompt = `Choose ONE fresh topic for TrendyPatike, a Serbian sneaker-culture Instagram account.
Use web search. Return a factual, visually strong topic for a 3-slide carousel, understandable to a 10-13 year old.
Do not repeat these topics:\n${previous.map(x => `- ${x}`).join("\n") || "- none"}
Prefer sneaker history, iconic models, athletes, music, sports moments, inventions, technology and myths-vs-facts.
Avoid rumors, resale speculation and weak anecdotes.
preferred_domains must come only from: ${GLOBAL_TRUSTED_DOMAINS.join(", ")}.
Return a lowercase ASCII hyphenated id.`;

  const result = await structuredWebResponse({
    model: cfg.textModel,
    prompt,
    schema: freshSeedSchema,
    schemaName: "trendypatike_fresh_seed",
    allowedDomains: GLOBAL_TRUSTED_DOMAINS,
    searchContextSize: "low",
    maxToolCalls: 1,
    maxOutputTokens: 3500
  });

  return result.value;
}

function writerPrompt(seed) {
  return `You are the senior Serbian editor for TrendyPatike.
Use web search BEFORE writing.
TOPIC: ${seed.topic}
CATEGORY: ${seed.category}
VISUAL: ${seed.visual_subject}

Rules:
- Serbian Latin script, everyday Serbian, understandable to a 10-year-old.
- Use only facts supported by pages you actually found now.
- Use at least 2 source URLs, preferably primary/official sources.
- Never invent dates, money, records, quotes or causal claims.
- Correct sneaker myths. Distinguish Nike Air Ship from Air Jordan 1 when relevant.
- Famous people are editorial subjects, never TrendyPatike endorsers.
- Cover: 2-4 short headline lines and one complete subheadline sentence.
- Slide 2: exactly 3 complete fact sentences with short tags.
- Slide 3: exactly 2 complete fact sentences and one easy question of max 8 words.
- Do not write AJ1; write Air Jordan 1. Do not use the English word banned in visible Serbian text.
- Caption should be natural, useful and concise, then 4-8 hashtags.
- Return exactly 3 English image prompts. No text, logo or watermark in base images. Subject mostly on the RIGHT.
- Every source URL and claim URL must be an exact page discovered in web search.
- Never cut a sentence or word to meet a length limit. Rewrite it shorter instead.`;
}

function verifierPrompt(seed, draft) {
  return `You are an independent fact-checker and Serbian copy editor for TrendyPatike.
Use web search AGAIN and do not trust the draft blindly.
TOPIC: ${seed.topic}
DRAFT:\n${JSON.stringify(draft)}

Verify every important factual claim, including names, dates, model names, chronology, prices and records.
Remove or rewrite anything not clearly supported. If material claims cannot be verified, set publish_ok=false.
Keep Serbian Latin script simple enough for a 10-year-old. Every visible fact must be a complete standalone sentence.
Do not use AJ1 or the English word banned in visible copy. Do not truncate words or sentences.
Every final source and claim URL must correspond to pages actually found in your web search.
Return a corrected final post even if you rewrote the draft.`;
}

function normalizedUrlKey(raw) {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = decodeURIComponent(u.pathname).replace(/\/+$/, "") || "/";
    return `${host}${pathname}`.toLowerCase();
  } catch {
    return "";
  }
}

function hostFor(raw) {
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isAllowedUrl(raw, seed) {
  const host = hostFor(raw);
  if (!host) return false;
  return (seed.preferred_domains || []).some(domain => {
    const d = String(domain).replace(/^www\./, "").toLowerCase();
    return host === d || host.endsWith(`.${d}`);
  });
}

function urlPathTokens(raw) {
  try {
    return new Set(
      decodeURIComponent(new URL(raw).pathname)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(x => x.length >= 3)
    );
  } catch {
    return new Set();
  }
}

function urlSimilarity(a, b) {
  const left = urlPathTokens(a);
  const right = urlPathTokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function matchEvidenceUrl(raw, evidence) {
  const key = normalizedUrlKey(raw);
  if (!key) return null;

  const exact = evidence.find(url => normalizedUrlKey(url) === key);
  if (exact) return exact;

  const host = hostFor(raw);
  const sameHost = evidence.filter(url => hostFor(url) === host);
  if (!sameHost.length) return null;
  if (sameHost.length === 1) return sameHost[0];

  return [...sameHost]
    .map(url => ({ url, score: urlSimilarity(raw, url) }))
    .sort((a, b) => b.score - a.score)[0]?.url || sameHost[0];
}

function cleanText(value = "") {
  return String(value)
    .replace(/[\u2010-\u2015]/g, ",")
    .replace(/\u00a0/g, " ")
    .replace(/\bAJ1\b/gi, "Air Jordan 1")
    .replace(/\bbanned\b/gi, "zabranjen")
    .replace(/\s+,/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function ensureSentence(value = "") {
  const text = cleanText(value);
  if (!text) return "Činjenica je potvrđena iz pouzdanih izvora.";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function shortenAtWordBoundary(text = "", maxChars = 18) {
  const value = cleanText(text);
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

function splitWordsIntoLines(text = "", maxChars = 32) {
  const words = cleanText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function normalizeHeadlineGroup(lines, maxLines) {
  const expanded = [];
  for (const source of lines || []) {
    const parts = splitWordsIntoLines(source.text, 32);
    for (const part of parts) expanded.push({ ...source, text: part });
  }

  if (!expanded.length) return [{ text: "SNEAKER PRIČA", accent: true }];
  if (expanded.length <= maxLines) return expanded;

  const kept = expanded.slice(0, maxLines);
  const overflow = expanded.slice(maxLines).map(x => x.text).join(" ");
  const last = cleanText(`${kept[maxLines - 1].text} ${overflow}`);
  kept[maxLines - 1] = {
    ...kept[maxLines - 1],
    text: shortenAtWordBoundary(last, 40)
  };
  console.warn(`[layout] Headline compacted locally to ${maxLines} lines without a new AI call.`);
  return kept;
}

function normalizeQuestion(text = "") {
  const words = cleanText(text)
    .replace(/[?!.,]+$/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  return `${(words.length ? words : ["Da", "li", "ste", "znali"]).join(" ")}?`;
}

function normalizeCaption(text = "") {
  const value = cleanText(text);
  if (value.length <= 780) return value;
  const shortened = shortenAtWordBoundary(value, 779).replace(/[,:;\-\s]+$/g, "");
  return /[.!?]$/.test(shortened) ? shortened : `${shortened}.`;
}

function normalizeHashtags(items = []) {
  const out = [];
  for (const item of items) {
    let tag = cleanText(item).replace(/\s+/g, "");
    if (!tag) continue;
    if (!tag.startsWith("#")) tag = `#${tag}`;
    if (!out.includes(tag)) out.push(tag.slice(0, 48));
  }
  for (const fallback of ["#TrendyPatike", "#Patike", "#SneakerKultura", "#IstorijaPatika"]) {
    if (out.length >= 4) break;
    if (!out.includes(fallback)) out.push(fallback);
  }
  return out.slice(0, 8);
}

function normalizePostForPublishing(post) {
  const value = JSON.parse(JSON.stringify(post));
  value.topic_title = cleanText(value.topic_title);
  value.cover.headline_lines = normalizeHeadlineGroup(value.cover.headline_lines, 4);
  value.cover.subheadline = ensureSentence(value.cover.subheadline);

  value.slide2.headline_lines = normalizeHeadlineGroup(value.slide2.headline_lines, 3);
  value.slide2.facts = value.slide2.facts.map(fact => ({
    ...fact,
    tag: shortenAtWordBoundary(fact.tag, 18),
    text: ensureSentence(fact.text)
  }));

  value.slide3.headline_lines = normalizeHeadlineGroup(value.slide3.headline_lines, 3);
  value.slide3.facts = value.slide3.facts.map(fact => ({
    ...fact,
    tag: shortenAtWordBoundary(fact.tag, 18),
    text: ensureSentence(fact.text)
  }));
  value.slide3.question = normalizeQuestion(value.slide3.question);
  value.caption = normalizeCaption(value.caption);
  value.hashtags = normalizeHashtags(value.hashtags);
  value.image_prompts = value.image_prompts.map(cleanText);
  return value;
}

function reconcileEvidence(post, seed, searchedUrls) {
  const evidence = [...new Set(
    (searchedUrls || [])
      .filter(url => isAllowedUrl(url, seed))
      .filter(url => normalizedUrlKey(url))
  )];

  if (evidence.length < 2) {
    throw new TopicRejectedError(`Fact-check evidence contained only ${evidence.length} approved source URL(s)`);
  }

  const reconciledSources = [];
  for (const source of post.sources || []) {
    const matched = matchEvidenceUrl(source.url, evidence);
    if (!matched) continue;
    if (reconciledSources.some(x => normalizedUrlKey(x.url) === normalizedUrlKey(matched))) continue;
    reconciledSources.push({
      ...source,
      url: matched,
      publisher: cleanText(source.publisher) || hostFor(matched),
      title: cleanText(source.title) || "Verified source"
    });
  }

  for (const url of evidence) {
    if (reconciledSources.length >= 2) break;
    if (reconciledSources.some(x => normalizedUrlKey(x.url) === normalizedUrlKey(url))) continue;
    reconciledSources.push({ title: "Verified source", publisher: hostFor(url), url });
  }

  if (reconciledSources.length < 2) {
    throw new TopicRejectedError("Fact-check could not reconcile two distinct approved source URLs");
  }

  post.sources = reconciledSources.slice(0, 6);

  const reconciledClaims = [];
  for (const claim of post.claims || []) {
    const urls = [...new Set(
      (claim.source_urls || [])
        .map(url => matchEvidenceUrl(url, evidence))
        .filter(Boolean)
    )];
    if (!urls.length) {
      throw new TopicRejectedError(`A verifier claim had no matching web evidence: ${cleanText(claim.claim)}`);
    }
    reconciledClaims.push({
      claim: cleanText(claim.claim),
      source_urls: urls.slice(0, 4)
    });
  }
  post.claims = reconciledClaims;

  return post;
}

async function researchWriteVerifyOnce(seed) {
  const domains = [...new Set(seed.preferred_domains || [])];
  if (!domains.length) throw new TopicRejectedError(`Topic ${seed.id} has no approved research domains`);

  const draftResult = await structuredWebResponse({
    model: cfg.textModel,
    prompt: writerPrompt(seed),
    schema: postSchema,
    schemaName: "trendypatike_post",
    allowedDomains: domains,
    searchContextSize: "medium",
    maxToolCalls: 2,
    maxOutputTokens: 12000
  });

  const checkedResult = await structuredWebResponse({
    model: cfg.verifyModel,
    prompt: verifierPrompt(seed, draftResult.value),
    schema: verifierSchema,
    schemaName: "trendypatike_verified_post",
    allowedDomains: domains,
    searchContextSize: "medium",
    maxToolCalls: 2,
    maxOutputTokens: 14000
  });

  const checked = checkedResult.value;
  if (!checked.publish_ok) {
    throw new TopicRejectedError(`Verifier rejected topic: ${cleanText(checked.reason)}`);
  }

  let post = normalizePostForPublishing(checked.post);
  post = reconcileEvidence(
    post,
    seed,
    [...draftResult.searchUrls, ...checkedResult.searchUrls]
  );

  return post;
}

export async function researchWriteVerify(seed) {
  return researchWriteVerifyOnce(seed);
}
