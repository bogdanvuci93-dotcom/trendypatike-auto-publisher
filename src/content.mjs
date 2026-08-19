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
The finished post must be interesting even to a 10-13 year old who knows little about sneaker history.
Do NOT repeat these previous topics:\n${previous.map(x => `- ${x}`).join("\n")}

Prefer: sneaker history, iconic models, athletes, musicians, sports moments, surprising inventions, technology, design, cultural impact and simple myths-vs-facts stories.
Prefer topics with one clear WOW detail that can be explained in one short sentence.
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

THE MOST IMPORTANT COPY RULE:
Write so a smart 10-13 year old can understand EVERYTHING on the first read.
The reader should instantly think: “Čekaj, stvarno?” or “Ovo nisam znao.”
Do NOT sound like a newspaper article, museum label, school essay or corporate press release.

LANGUAGE:
- Serbian language, LATIN script only.
- Natural everyday Serbian.
- Prefer common words over formal words.
- Avoid jargon and abstract phrases such as: “oblikovao kulturu”, “prelomni trenutak”, “uniformisanje boja”, “kulturni fenomen”, “strateški pozicionirao”, “nacionalni zamah”, “ikonografski”, unless there is no simpler accurate wording.
- If a technical term is necessary, explain it immediately in very simple words.
- Never use a harder phrase when a child-friendly one is equally accurate.

INSTAGRAM STYLE:
- VERY short. VERY clear. VERY punchy.
- One sentence = one idea.
- Prefer 4-10 words per fact whenever possible.
- Every slide should be understandable in 2-4 seconds.
- Keep the interesting part; remove background details that are not needed to understand it.
- Use direct verbs: nosi, stiže, pravi, menja, postaje, osvaja, nastaje, prodaje se, pojavljuje se.
- Use simple curiosity hooks: “Nije počelo kako misliš”, “Prvo je bio…”, “Ovo malo ljudi zna”, “Najveći mit”, “A onda se desilo ovo”. Use them only when factually fair.
- Do NOT use fake clickbait, fake drama or unsupported superlatives.

SLIDE 1 — HOOK:
- 2-4 headline lines.
- Each line ideally 1-3 words.
- Total headline should feel like a strong question or surprising statement.
- Subheadline = ONE tiny tease, not an explanation.
- Good style examples: “KAKO JE POČEO / AIR JORDAN?”, “NIJE POČELO / OD AJ1”, “PATIKA IZ / APARATA ZA GALETE?”
- Bad style example: “Mit i činjenice koje su oblikovale sneaker kulturu.” Too formal and abstract.

SLIDE 2 — 3 FAST FACTS:
- Exactly 3 facts.
- Each has a short green tag: year, number, or 1-2 simple words such as PRVO, WOW, ONDA, ISTINA.
- Each fact = ONE short sentence, ideally 4-10 words and never more than 66 characters.
- Prioritize surprising facts over chronology if chronology is boring.
- Example style: “Jordan prvo nosi Nike Air Ship.” / “AJ1 stiže godinu kasnije.”

SLIDE 3 — PAYOFF:
- Exactly 2 strongest or most surprising facts.
- Each fact ideally 4-10 words and never more than 66 characters.
- Explain myths in the simplest accurate wording possible.
- End with one simple question, max 8 words.
- Example: “NBA nije zabranila baš AJ1.” / “Priča se prvo vezuje za Air Ship.” / “Da li si ovo znao?”

CAPTION:
- Max ~500 characters before hashtags.
- Give a tiny extra detail, do not simply repeat all slide text.
- End with one easy question or “Sačuvaj ako voliš ovakve priče.”
- 4-8 hashtags.

FINAL SELF-CHECK BEFORE RETURNING JSON:
- Could an 11-year-old explain every slide to a friend after reading it once? If NO, simplify again.
- Is there any sentence that sounds like a textbook? Rewrite it.
- Is each fact interesting by itself? If not, replace it with a stronger VERIFIED fact from the sources.
- Did simplification change the factual meaning? If YES, restore accuracy and find simpler wording.

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
You are a second, independent fact-checker AND simplicity editor for a Serbian sneaker Instagram account. Use web search AGAIN; do not merely trust the draft or its listed sources.

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

SIMPLICITY CHECK — ALSO MANDATORY:
- Rewrite the final copy so a 10-13 year old understands it on FIRST read.
- It must sound like a friend telling an amazing true sneaker fact, not a school textbook.
- Use everyday Serbian and short active sentences.
- Remove formal words, jargon and abstract phrases whenever a simpler accurate version exists.
- Never sacrifice accuracy to make something sound exciting.
- Slide 2 facts: ideally 4-10 words, hard maximum 66 characters each.
- Slide 3 facts: ideally 4-10 words, hard maximum 66 characters each.
- Cover subheadline: one tiny tease, maximum 80 characters.
- Final question: maximum 8 words.
- Caption should be compact and easy to scan.

BAD → GOOD STYLE EXAMPLES:
- “Povod kontroverze bilo je NBA pravilo o uniformisanju boja.” → “NBA je imala stroga pravila o bojama opreme.”
- “All-Star vikend dao je nacionalni zamah priči.” → “All-Star vikend je Jordana video ceo svet.”
- “Jordan Brand postaje zaseban brend unutar NIKE, Inc.” → “Jordan postaje poseban Nike brend.”
- “Mit i činjenice koje su oblikovale kulturu.” → “Priča nije počela kako misliš.”

Before approving, ask yourself:
1. Is every claim verified?
2. Can an 11-year-old understand every line instantly?
3. Is each line interesting enough to keep swiping?
If any answer is NO, correct the post before returning it. If accuracy cannot be kept, set publish_ok=false.

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

function validatePost(post, seed, searchedUrls = []) {
  const sourceUrls = new Set(post.sources.map(s => s.url));
  if (sourceUrls.size < 2) throw new Error("Fact-check guard: fewer than 2 source URLs");
  if (post.cover.subheadline.length > 80) throw new Error("Copy guard: cover subheadline too long");
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
    if (f.text.length > 66) throw new Error(`Copy guard: fact too long: ${f.text}`);
    if (wordCount(f.text) > 14) throw new Error(`Copy guard: fact has too many words: ${f.text}`);
    if (f.tag.length > 18) throw new Error(`Copy guard: fact tag too long: ${f.tag}`);
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
