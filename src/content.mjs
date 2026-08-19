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
The finished post must be interesting even to a 10-13 year old who knows almost nothing about sneaker history.
Do NOT repeat these previous topics:\n${previous.map(x => `- ${x}`).join("\n")}

Prefer: sneaker history, iconic models, athletes, musicians, sports moments, surprising inventions, technology, design and simple myths-vs-facts stories.
Prefer topics that contain one or more facts that can be explained as a COMPLETE, SIMPLE sentence.
Avoid gossip, rumors, resale-price speculation, legal ambiguity and weakly sourced anecdotes.
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
You are the senior Serbian editor and viral sneaker storyteller for TrendyPatike. BEFORE writing, actively use web search and verify the topic from the supplied domains.

TOPIC: ${seed.topic}
CATEGORY: ${seed.category}
VISUAL SUBJECT: ${seed.visual_subject}

HARD FACT-CHECK RULES — NEVER RELAX THESE:
- Write ONLY facts directly supported by sources you found NOW on the web.
- Never rely on memory when a fact can be searched.
- Use at least 2 source URLs. Prefer primary/official sources; use reputable secondary sources only as cross-checks.
- If a popular sneaker story is a myth or oversimplification, correct it instead of repeating it.
- Specific warning: never say “Air Jordan 1 was banned by the NBA” unless a source explicitly proves that exact shoe; distinguish Nike Air Ship from Air Jordan 1 when relevant.
- Dates, names, model names, records, prices and quotations must be especially conservative.
- Do not invent direct quotes.
- If evidence is weak, OMIT the claim. Excitement must come from the real fact, never from exaggeration.

THE MAIN COPY RULE:
The examples shown by the user are simple fact cards: one picture + one complete sentence that explains exactly what happened.
Write every visible FACT in that same spirit.
A child must be able to read ONE sentence by itself, without the title, tag, previous slide or any sneaker knowledge, and understand what happened.

VERY IMPORTANT — COMPLETE SENTENCES:
- Every slide2.fact.text and slide3.fact.text MUST be a COMPLETE Serbian sentence.
- The green tag is only decoration/context. The sentence must still make sense if the tag disappears.
- Name the person, shoe, company or event inside the sentence when needed.
- Do NOT write fragments such as “Stiže godinu kasnije.”, “Postaje poseban brend.” or “Priča se prvo vezuje za Air Ship.”
- Do NOT assume the reader knows abbreviations. Write “Air Jordan 1”, not “AJ1”.
- Avoid unexplained pronouns like “on”, “to”, “ovo”, “tada” when the subject is not obvious inside that same sentence.
- One sentence = one clear fact. A short “ali” comparison is allowed when it makes a myth easy to understand.
- End factual sentences with normal punctuation.

TARGET STYLE — THIS IS WHAT WE WANT:
- “Michael Jordan je 1984. prvo nosio Nike Air Ship, a ne Air Jordan 1.”
- “Air Jordan 1 se pojavio u prodaji 1985. godine.”
- “Jordan Brand je 1997. postao poseban Nike brend.”
- “Mnogi misle da je NBA zabranila Air Jordan 1, ali priča se odnosila na Nike Air Ship.”
- “Nike je ideju za Waffle đon dobio pomoću aparata za galete.”
These are complete, direct sentences that tell the whole mini-story immediately.

LANGUAGE:
- Serbian language, LATIN script only.
- Natural everyday Serbian used in Serbia.
- Write as if explaining a cool fact to a 10-year-old friend.
- Prefer normal everyday words over formal, academic or marketing words.
- NEVER use phrases like “oblikovao kulturu”, “prelomni trenutak”, “uniformisanje boja”, “kulturni fenomen”, “strateški pozicionirao”, “nacionalni zamah”, “zaseban brend unutar”.
- Do not use the English word “banned” in visible Serbian copy. Explain what happened in Serbian.
- Official names such as Nike Air Ship, Air Jordan 1 and All-Star may stay in their official form.
- If a fact needs a complicated explanation to be accurate, choose another verified fact that is easier to understand.

INSTAGRAM STYLE:
- Clear first, interesting second, short third.
- Do NOT shorten a sentence so much that it becomes a fragment.
- Facts should usually be 7-16 words and fit in about 1-3 lines.
- Every fact should answer: WHO/WHAT + WHAT HAPPENED.
- Remove background information that is not needed to understand the fact.
- Use active, concrete verbs: nosio, napravio, stigao, prodao, potpisao, osvojio, promenio, pokrenuo, postao.
- The reader should instantly think: “Čekaj, stvarno?” or “Ovo nisam znao.”
- Do NOT use fake clickbait, fake drama or unsupported superlatives.

SLIDE 1 — HOOK:
- 2-4 headline lines.
- Each line ideally 1-3 words.
- The headline may be a short hook/question, because it is a headline.
- The subheadline MUST be one complete, simple sentence that explains what the post is about without giving away everything.
- Good: “Michael Jordan nije odmah nosio Air Jordan 1.”
- Good: “Jedna Nike ideja je bukvalno počela u kuhinji.”
- Bad: “Mit i činjenice koje su oblikovale kulturu.”

SLIDE 2 — 3 COMPLETE FACTS:
- Exactly 3 facts.
- Each has a short green tag such as a year, number, PRVO, KASNIJE, ISTINA.
- Each fact.text MUST be one complete standalone sentence, roughly 7-16 words, maximum 92 characters.
- A year tag must NOT replace the year if the year is important to understanding the sentence; include it in the sentence when natural.
- Prefer the clearest and most surprising facts, not a dry timeline.

SLIDE 3 — 2 COMPLETE PAYOFF FACTS:
- Exactly 2 facts.
- Each fact.text MUST be one complete standalone sentence, roughly 7-16 words, maximum 92 characters.
- Explain myths as a normal sentence, not as jargon.
- End with one simple question, max 8 words.
- Good: “Mnogi misle da je NBA zabranila Air Jordan 1, ali radilo se o Nike Air Shipu.”
- Good question: “Da li si ovo već znao?”

CAPTION:
- Max ~500 characters before hashtags.
- Use the same child-friendly everyday Serbian.
- Give one small extra detail instead of copying every slide.
- End with one easy question or “Sačuvaj ako voliš ovakve priče.”
- 4-8 hashtags.

FINAL SELF-CHECK BEFORE RETURNING JSON:
1. Read each fact WITHOUT its green tag and WITHOUT its headline. Does it still explain who/what and what happened? If NO, rewrite it.
2. Is every fact a complete grammatical sentence? If NO, rewrite it.
3. Could a 10-year-old repeat the fact to a friend after one reading? If NO, simplify it.
4. Does any phrase sound like a textbook, press release or sneaker expert jargon? If YES, replace it with everyday Serbian.
5. Did simplification change the factual meaning? If YES, restore accuracy and find a different simple wording.

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
You are a second, independent fact-checker AND child-friendly Serbian copy editor for TrendyPatike. Use web search AGAIN; do not merely trust the draft or its listed sources.

TOPIC: ${seed.topic}
DRAFT JSON:\n${JSON.stringify(draft, null, 2)}

FACT-CHECK — HIGHEST PRIORITY:
- Every factual claim must be supported by current pages from the allowed domains.
- Check names, dates, model names, chronology and causal wording.
- Remove or rewrite anything that overstates evidence.
- If you cannot confidently verify the important claims, set publish_ok=false.
- If sources conflict materially, set publish_ok=false.
- Do not publish urban legends as fact.
- Special warning: the “banned Jordan” story is commonly simplified; verify the exact shoe and event.
- Famous people must be treated editorially, never as TrendyPatike endorsers.

COPY STRUCTURE — MANDATORY:
- Every slide2.fact.text and slide3.fact.text must be ONE complete standalone Serbian sentence.
- It must make sense when read without the tag, headline or previous slide.
- The sentence itself must clearly say WHO/WHAT and WHAT HAPPENED.
- Never approve fragments such as “Stiže godinu kasnije.”, “Postaje poseban brend.” or “Priča se vezuje za Air Ship.”
- Never approve unexplained “AJ1”; write “Air Jordan 1”.
- Never use “banned” in visible Serbian copy.
- Avoid vague pronouns if the person/model is not named in that same sentence.

CHILD-FRIENDLY LANGUAGE — MANDATORY:
- A 10-year-old should understand every sentence on FIRST read.
- Use everyday Serbian from Serbia.
- Do not sound like a textbook, journalist, historian or marketing department.
- Ban unnecessarily formal phrases including “oblikovao kulturu”, “prelomni trenutak”, “uniformisanje boja”, “kulturni fenomen”, “nacionalni zamah”, “strateški pozicionirao”, “zaseban brend unutar”.
- If a technical term is unavoidable, replace the fact with another verified fact that is easier to explain whenever possible.
- A complete easy sentence is MORE IMPORTANT than making it ultra-short.
- Facts should usually be 7-16 words and maximum 92 characters.
- Cover subheadline must also be a complete easy sentence.
- Final question: maximum 8 words.

TARGET EXAMPLES:
- “Michael Jordan je 1984. prvo nosio Nike Air Ship, a ne Air Jordan 1.”
- “Air Jordan 1 se pojavio u prodaji 1985. godine.”
- “Nike je ideju za Waffle đon dobio pomoću aparata za galete.”
- “Mnogi misle da je NBA zabranila Air Jordan 1, ali radilo se o Nike Air Shipu.”

Before approving, test EVERY visible fact:
1. If the tag and headline disappear, does the sentence still make complete sense?
2. Does it clearly tell the reader what happened?
3. Would a 10-year-old understand every normal word?
4. Is it fully supported by the searched sources?
If any answer is NO, rewrite it. If it cannot be rewritten accurately and simply, set publish_ok=false.

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
  const sourceUrls = new Set(post.sources.map(s => s.url));
  if (sourceUrls.size < 2) throw new Error("Fact-check guard: fewer than 2 source URLs");
  if (post.cover.subheadline.length > 92) throw new Error("Copy guard: cover subheadline too long");
  if (!isCompleteSentence(post.cover.subheadline)) throw new Error("Copy guard: cover subheadline is not a complete sentence");
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
    if (line.text.length > 26) throw new Error(`Copy guard: headline line too long: ${line.text}`);
  }

  for (const f of [...post.slide2.facts, ...post.slide3.facts]) {
    if (f.text.length > 92) throw new Error(`Copy guard: fact too long: ${f.text}`);
    if (wordCount(f.text) > 18) throw new Error(`Copy guard: fact has too many words: ${f.text}`);
    if (!isCompleteSentence(f.text)) throw new Error(`Copy guard: fact is not a complete sentence: ${f.text}`);
    if (f.tag.length > 18) throw new Error(`Copy guard: fact tag too long: ${f.tag}`);
    assertSimpleVisibleCopy(f.text, "fact");
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
