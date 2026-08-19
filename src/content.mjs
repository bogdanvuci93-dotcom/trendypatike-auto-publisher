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
  const previous = state.posted
    .slice(-200)
    .map(x => x.seed_topic || x.topic_title)
    .filter(Boolean);

  const prompt = `
You are choosing ONE fresh daily topic for TrendyPatike, a Serbian sneaker culture Instagram account.
Use web search before choosing. The topic must be factual, visually strong and suitable for a 3-slide carousel.
It should be interesting even to a 10-13 year old who knows little about sneaker history.

Do NOT repeat or lightly rephrase any previous topic:
${previous.map(x => `- ${x}`).join("\n") || "- none yet"}

Prefer sneaker history, iconic models, athletes, musicians, sports moments, surprising inventions, technology, design and simple myths-vs-facts stories.
Avoid gossip, rumors, resale-price speculation, legal ambiguity and weakly sourced anecdotes.
Choose preferred_domains only from this trusted list:
${GLOBAL_TRUSTED_DOMAINS.join(", ")}
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
You are the senior Serbian editor and sneaker storyteller for TrendyPatike.
BEFORE writing, actively use web search and verify the topic from the supplied domains.

TOPIC: ${seed.topic}
CATEGORY: ${seed.category}
VISUAL SUBJECT: ${seed.visual_subject}

FACT CHECKING:
- Write ONLY facts directly supported by sources you found NOW on the web.
- Use at least 2 source URLs and prefer primary/official sources.
- Never invent quotes, dates, prices, records or causal claims.
- If evidence is weak, omit the claim.
- Correct popular sneaker myths instead of repeating them.
- Never say Air Jordan 1 was banned by the NBA unless a source proves that exact shoe; distinguish Nike Air Ship when relevant.
- Famous people are editorial/history subjects only. Never imply they endorse TrendyPatike.

VISIBLE COPY:
- Serbian, LATIN script only.
- Natural everyday Serbian used in Serbia.
- A 10-year-old should understand every sentence on first read.
- Every slide2.fact.text and slide3.fact.text MUST be one complete standalone sentence.
- Each fact should clearly say WHO/WHAT + WHAT HAPPENED.
- Do not use unexplained abbreviations such as AJ1; write Air Jordan 1.
- Do not use the English word banned in visible Serbian copy.
- Avoid formal marketing/journalistic phrases such as oblikovao kulturu, prelomni trenutak, kulturni fenomen, strateški pozicionirao.
- Facts should usually be 7-16 words and MUST be 92 characters or fewer in the final answer.
- IMPORTANT: never cut a sentence, word or thought to hit the character limit. If it does not fit, rewrite the whole sentence shorter.
- Every fact must end with normal punctuation.

SLIDE 1:
- 2-4 short headline lines.
- Subheadline must be one complete simple sentence, 92 characters or fewer.

SLIDE 2:
- Exactly 3 facts with short green tags.
- Each fact is one complete standalone sentence, max 92 characters.

SLIDE 3:
- Exactly 2 facts with short green tags.
- End with one easy question, max 8 words.

CAPTION:
- About 500 characters maximum before hashtags.
- Same natural Serbian style.
- Add one useful extra detail instead of copying all slide text.
- End with an easy question or Sačuvaj ako voliš ovakve priče.
- 4-8 hashtags.

IMAGE PROMPTS:
- Return 3 image prompts in English.
- Base images contain NO text, NO TrendyPatike logo and NO watermarks.
- Premium dark sneaker-editorial aesthetic, with important subjects mostly on the RIGHT.

SOURCES AND CLAIMS:
- List exact source pages actually used.
- Every claim.source_urls entry must be a real URL that appeared in your web research.
- Reuse the canonical source URL where possible instead of inventing URL variants.

FINAL SELF-CHECK:
1. Is every visible fact a complete sentence?
2. Is every fact 92 characters or fewer without being cut off?
3. Could a 10-year-old repeat it after one reading?
4. Is every factual claim supported by searched evidence?
5. Does any visible text contain unnecessary jargon or fake drama?
`;
}

function verifierPrompt(seed, draft) {
  return `
You are a second independent fact-checker and child-friendly Serbian copy editor for TrendyPatike.
Use web search AGAIN. Do not merely trust the draft or its listed sources.

TOPIC: ${seed.topic}
DRAFT JSON:
${JSON.stringify(draft, null, 2)}

FACT CHECK:
- Verify every important factual claim from current pages on the allowed domains.
- Check names, dates, model names, chronology, prices, records and causal wording.
- Remove or rewrite anything that overstates evidence.
- If important claims cannot be verified or reliable sources materially conflict, set publish_ok=false.
- Do not publish urban legends as fact.
- Treat famous people editorially, never as TrendyPatike endorsers.

COPY RULES:
- Serbian LATIN script, everyday Serbian from Serbia.
- Every slide2.fact.text and slide3.fact.text must be ONE complete standalone sentence.
- Each sentence itself must say who/what and what happened.
- A 10-year-old should understand it on first read.
- Never approve fragments or unexplained AJ1.
- Never use banned in visible Serbian copy.
- Facts should usually be 7-16 words and MUST be 92 characters or fewer.
- IMPORTANT: do not truncate text to satisfy a limit. Rewrite the entire sentence shorter and finish it with punctuation.
- Cover subheadline must be a complete sentence and 92 characters or fewer.
- Final question max 8 words.

SOURCE RULES:
- Every source and every claim URL must come from pages actually found during web search.
- Prefer canonical URLs and avoid creating a second spelling of the same URL only because www or a trailing slash differs.

Before approving, test EVERY visible fact without its tag or headline:
1. Does it still make complete sense?
2. Is it fully supported?
3. Is it 92 characters or fewer?
4. Does it end normally instead of being cut off?
If any answer is NO, rewrite it. If it cannot be fixed accurately and simply, set publish_ok=false.

Return a corrected final post even when you rewrite the draft.
`;
}

function normalizedUrlKey(raw) {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = decodeURIComponent(u.pathname)
      .replace(/\/+$/, "") || "/";
    return `${host}${path}`.toLowerCase();
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
  return seed.preferred_domains.some(domain => {
    const d = String(domain).replace(/^www\./, "").toLowerCase();
    return host === d || host.endsWith(`.${d}`);
  });
}

function wordCount(text = "") {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function isCompleteSentence(text = "") {
  const s = String(text).trim();
  return /^[A-ZČĆŽŠĐ0-9]/.test(s) && /[.!?]$/.test(s) && wordCount(s) >= 5;
}

const FORBIDDEN_VISIBLE_PHRASES = [
  "oblikovao kulturu",
  "oblikovale kulturu",
  "prelomni trenutak",
  "uniformisanje boja",
  "uniformisanju boja",
  "kulturni fenomen",
  "nacionalni zamah",
  "strateški pozicionirao",
  "zaseban brend unutar",
  "banned"
];

function assertSimpleVisibleCopy(text, label) {
  const lower = String(text).toLowerCase();
  for (const phrase of FORBIDDEN_VISIBLE_PHRASES) {
    if (lower.includes(phrase)) {
      throw new Error(`Copy guard: ${label} contains formal/unclear phrase: ${phrase}`);
    }
  }
  if (/\bAJ1\b/i.test(text)) {
    throw new Error(`Copy guard: ${label} uses unexplained AJ1 abbreviation`);
  }
}

function validatePost(post, seed, searchedUrls = []) {
  const sourceKeys = new Set(
    post.sources.map(source => normalizedUrlKey(source.url)).filter(Boolean)
  );
  if (sourceKeys.size < 2) {
    throw new Error("Fact-check guard: fewer than 2 distinct source URLs");
  }

  if (post.cover.subheadline.length > 92) {
    throw new Error("Copy guard: cover subheadline too long");
  }
  if (!isCompleteSentence(post.cover.subheadline)) {
    throw new Error("Copy guard: cover subheadline is not a complete sentence");
  }
  assertSimpleVisibleCopy(post.cover.subheadline, "cover subheadline");

  if (post.caption.length > 800) throw new Error("Copy guard: caption too long");
  if (post.slide3.question.length > 60 || wordCount(post.slide3.question) > 8) {
    throw new Error("Copy guard: final question too long");
  }

  for (const line of [
    ...post.cover.headline_lines,
    ...post.slide2.headline_lines,
    ...post.slide3.headline_lines
  ]) {
    if (line.text.length > 26) {
      throw new Error(`Copy guard: headline line too long: ${line.text}`);
    }
  }

  for (const fact of [...post.slide2.facts, ...post.slide3.facts]) {
    if (fact.text.length > 92) {
      throw new Error(`Copy guard: fact too long: ${fact.text}`);
    }
    if (wordCount(fact.text) > 18) {
      throw new Error(`Copy guard: fact has too many words: ${fact.text}`);
    }
    if (!isCompleteSentence(fact.text)) {
      throw new Error(`Copy guard: fact is not a complete sentence: ${fact.text}`);
    }
    if (fact.tag.length > 18) {
      throw new Error(`Copy guard: fact tag too long: ${fact.tag}`);
    }
    assertSimpleVisibleCopy(fact.text, "fact");
  }

  const searched = new Set(searchedUrls.map(normalizedUrlKey).filter(Boolean));

  // Sources shown in the final post must still be whitelisted and must come
  // from actual web-search evidence. URL normalization makes www/non-www,
  // query strings and trailing slashes equivalent for validation purposes.
  for (const source of post.sources) {
    if (!isAllowedUrl(source.url, seed)) {
      throw new Error(`Source outside approved domains: ${hostFor(source.url) || source.url}`);
    }

    const key = normalizedUrlKey(source.url);
    if (searched.size && !searched.has(key)) {
      throw new Error(`Source guard: cited URL was not present in web-search evidence: ${source.url}`);
    }
  }

  // Claims do not have to repeat the exact raw URL string from post.sources.
  // They must, however, point to a whitelisted URL that was actually found by
  // the web search. This keeps the fact-check strict without false failures
  // caused by www, trailing-slash or query-string variants.
  for (const claim of post.claims) {
    if (!claim.source_urls.length) {
      throw new Error(`Source guard: unsourced claim: ${claim.claim}`);
    }

    for (const url of claim.source_urls) {
      const key = normalizedUrlKey(url);
      if (!key || !isAllowedUrl(url, seed)) {
        throw new Error(`Source guard: invalid or unapproved claim URL ${url}`);
      }

      const knownFromSources = sourceKeys.has(key);
      const knownFromSearch = searched.has(key);
      if (!knownFromSources && !knownFromSearch) {
        throw new Error(`Source guard: claim URL was not found in evidence ${url}`);
      }
    }
  }

  return post;
}

async function researchWriteVerifyOnce(seed) {
  const domains = [...new Set(seed.preferred_domains)];

  const draftResult = await structuredWebResponse({
    model: cfg.textModel,
    prompt: writerPrompt(seed),
    schema: postSchema,
    schemaName: "trendypatike_post",
    allowedDomains: domains
  });

  const checkedResult = await structuredWebResponse({
    model: cfg.verifyModel,
    prompt: verifierPrompt(seed, draftResult.value),
    schema: verifierSchema,
    schemaName: "trendypatike_verified_post",
    allowedDomains: domains
  });

  const checked = checkedResult.value;
  if (!checked.publish_ok) {
    throw new Error(`Verifier rejected topic: ${checked.reason}`);
  }

  return validatePost(
    checked.post,
    seed,
    [...draftResult.searchUrls, ...checkedResult.searchUrls]
  );
}

export async function researchWriteVerify(seed) {
  let lastError = null;

  // One retry protects the daily workflow from a transient structured-output
  // formatting mistake without weakening any fact-check or copy guard.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await researchWriteVerifyOnce(seed);
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        console.warn(`[content] Verification attempt ${attempt}/2 failed: ${err.message}`);
        console.warn("[content] Retrying the same topic once with fresh research and generation.");
      }
    }
  }

  throw lastError || new Error("Unknown content verification failure");
}
