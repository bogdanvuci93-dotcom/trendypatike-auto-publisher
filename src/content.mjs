import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "./config.mjs";
import { structuredWebResponse } from "./openai.mjs";
import { postSchema, verifierSchema, freshSeedSchema } from "./schemas.mjs";

const GLOBAL_TRUSTED_DOMAINS = [
  "about.nike.com",
  "nike.com",
  "nba.com",
  "news.adidas.com",
  "adidas-group.com",
  "adidas.com",
  "about.puma.com",
  "puma.com",
  "converse.com",
  "vans.com",
  "newbalance.com",
  "newbalance.newsmarket.com",
  "asics.com",
  "reebok.com",
  "olympics.com",
  "smithsonianmag.com",
  "moma.org",
  "britannica.com",
  "gq.com"
];

export async function loadTopics() {
  return JSON.parse(await fs.readFile(path.resolve("data/topics.json"), "utf8"));
}

export async function loadState() {
  return JSON.parse(await fs.readFile(path.resolve("data/state.json"), "utf8"));
}

export async function saveState(state) {
  await fs.writeFile(path.resolve("data/state.json"), JSON.stringify(state, null, 2) + "\n");
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
  const used = new Set(state.posted.map(x => x.topic_id));
  return topics.filter(t => !used.has(t.id));
}

export async function chooseTopic(topics, state) {
  const available = notPostedTopics(topics, state);
  if (available.length) return available[0];
  return discoverFreshTopic(state);
}

async function discoverFreshTopic(state) {
  const previous = state.posted.slice(-80).map(x => x.topic_title).filter(Boolean);
  const prompt = `
You are choosing ONE fresh daily topic for TrendyPatike, a Serbian sneaker culture Instagram account.
Use web search before choosing. Topic must be factual, visually strong and suitable for a 3-slide carousel.
Do NOT repeat these previous topics:\n${previous.map(x => `- ${x}`).join("\n")}

Prefer: sneaker history, iconic models, athletes, musicians, sports moments, technology, design, cultural impact.
Avoid gossip, rumors, resale-price speculation and unverified anecdotes.
Choose preferred_domains only from this trusted list:\n${GLOBAL_TRUSTED_DOMAINS.join(", ")}
Return a stable lowercase ASCII id with hyphens.
`;

  const result = await structuredWebResponse({
    model: cfg.textModel,
    prompt,
    schema: freshSeedSchema,
    schemaName: "trendypatike_fresh_seed",
    allowedDomains: GLOBAL_TRUSTED_DOMAINS
  });
  return result.value;
}

function writerPrompt(seed) {
  return `
You are the senior Serbian editor for TrendyPatike. BEFORE writing, actively use web search and verify the topic from the supplied domains.

TOPIC: ${seed.topic}
CATEGORY: ${seed.category}
VISUAL SUBJECT: ${seed.visual_subject}

HARD FACT-CHECK RULES:
- Write ONLY facts directly supported by sources you found now on the web.
- Never rely on memory when a fact can be searched.
- Use at least 2 source URLs. Prefer primary/official sources; use reputable secondary sources only as cross-checks.
- If a popular sneaker story is a myth or oversimplification, correct it instead of repeating it.
- Specific warning: never say “Air Jordan 1 was banned by the NBA” unless a source explicitly proves that exact shoe; distinguish Nike Air Ship from Air Jordan 1 when relevant.
- Dates, names, model names, records, prices and quotations must be especially conservative.
- Do not invent direct quotes.
- If evidence is weak, omit the claim.

LANGUAGE & STYLE:
- Serbian language, LATIN script only.
- Natural Serbian; no awkward translated English.
- Short, direct and interesting. No walls of text.
- Slide 1: powerful hook, 2-5 headline lines + one short subheadline.
- Slide 2: exactly 3 fast facts. Each fact: a short green tag (year/number/2-3 words) + ONE short sentence, max ~75 characters.
- Slide 3: exactly 2 strongest/most surprising facts, each max ~75 characters + one short question.
- Headline lines should usually be 1-3 words and must stay visually short.
- Caption: max ~650 characters including hashtags; do not duplicate every slide sentence.
- 4-8 hashtags.
- Make it educational, not fake-clickbait.

EDITORIAL / PUBLIC FIGURE RULE:
If the topic involves a famous real person, it is an editorial/history post. Never imply that person endorses, works with, recommends or shops at TrendyPatike unless a source explicitly says so.

IMAGE PROMPTS:
Return 3 image prompts in English. The base AI image must contain NO text, NO TrendyPatike logo, NO watermarks.
Use a premium dark sneaker-editorial aesthetic. Compose important subjects mostly on the RIGHT so our fixed text layout can occupy the LEFT.
When a real public figure is central, an editorial depiction can use the person's name, but the image must not imply endorsement of TrendyPatike.

SOURCES:
List the exact pages used, with real URLs and publishers. Every claim must point to one or more of those URLs.
`;
}

function verifierPrompt(seed, draft) {
  return `
You are a second, independent fact-checker for a Serbian sneaker publication. Use web search AGAIN; do not merely trust the draft or its listed sources.

TOPIC: ${seed.topic}
DRAFT JSON:\n${JSON.stringify(draft, null, 2)}

VERIFY EVERYTHING:
- Every factual claim must be supported by current pages from the allowed domains.
- Check names, dates, model names, chronology and causal wording.
- Remove or rewrite anything that overstates evidence.
- Correct Serbian grammar and phrasing.
- Keep the copy ultra-short and direct.
- If you cannot confidently verify the important claims, set publish_ok=false.
- If sources conflict materially, set publish_ok=false.
- Do not publish urban legends as fact.
- Special warning: the “banned Jordan” story is commonly simplified; verify the exact shoe and event.
- Famous people must be treated editorially, never as TrendyPatike endorsers.

Return a corrected final post even if publish_ok=false, but explain the blocking reason.
`;
}

function normalizedUrlKey(raw) {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}`;
  } catch {
    return "";
  }
}

function validatePost(post, seed, searchedUrls = []) {
  const sourceUrls = new Set(post.sources.map(s => s.url));
  if (sourceUrls.size < 2) throw new Error("Fact-check guard: fewer than 2 source URLs");
  if (post.cover.subheadline.length > 110) throw new Error("Copy guard: cover subheadline too long");
  if (post.caption.length > 1100) throw new Error("Copy guard: caption too long");
  for (const f of [...post.slide2.facts, ...post.slide3.facts]) {
    if (f.text.length > 82) throw new Error(`Copy guard: fact too long: ${f.text}`);
  }
  for (const c of post.claims) {
    if (!c.source_urls.length) throw new Error(`Source guard: unsourced claim: ${c.claim}`);
    for (const u of c.source_urls) {
      if (!sourceUrls.has(u)) throw new Error(`Source guard: claim references unknown source URL ${u}`);
    }
  }
  const searched = new Set(searchedUrls.map(normalizedUrlKey).filter(Boolean));

  for (const src of post.sources) {
    let host;
    try { host = new URL(src.url).hostname.replace(/^www\./, ""); }
    catch { throw new Error(`Invalid source URL: ${src.url}`); }
    const allowed = seed.preferred_domains.some(d => host === d || host.endsWith(`.${d}`));
    if (!allowed) throw new Error(`Source outside approved domains: ${host}`);

    if (searched.size && !searched.has(normalizedUrlKey(src.url))) {
      throw new Error(`Source guard: cited URL was not present in web-search evidence: ${src.url}`);
    }
  }
  return post;
}

export async function researchWriteVerify(seed) {
  const domains = [...new Set(seed.preferred_domains)];

  const draftResult = await structuredWebResponse({
    model: cfg.textModel,
    prompt: writerPrompt(seed),
    schema: postSchema,
    schemaName: "trendypatike_post",
    allowedDomains: domains
  });

  const draft = draftResult.value;

  const checkedResult = await structuredWebResponse({
    model: cfg.verifyModel,
    prompt: verifierPrompt(seed, draft),
    schema: verifierSchema,
    schemaName: "trendypatike_verified_post",
    allowedDomains: domains
  });

  const checked = checkedResult.value;

  if (!checked.publish_ok) {
    throw new Error(`Verifier rejected topic: ${checked.reason}`);
  }

  return validatePost(checked.post, seed, [...draftResult.searchUrls, ...checkedResult.searchUrls]);
}
