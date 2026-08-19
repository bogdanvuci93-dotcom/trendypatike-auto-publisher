import { cfg } from "./config.mjs";
import { structuredWebResponse } from "./openai.mjs";
import { chooseTopic } from "./content.mjs";

const MAJOR_NEWS_DOMAINS = [
  "about.nike.com",
  "nike.com",
  "nba.com",
  "news.adidas.com",
  "adidas-group.com",
  "adidas.com",
  "about.puma.com",
  "puma.com",
  "newbalance.com",
  "newbalance.newsmarket.com",
  "asics.com",
  "reebok.com",
  "olympics.com",
  "reuters.com",
  "apnews.com",
  "espn.com",
  "sportsbusinessjournal.com",
  "gq.com"
];

const TOPIC_STOP_WORDS = new Set([
  "a", "ali", "bi", "bio", "bila", "bilo", "da", "do", "i", "iz", "je", "kao",
  "kako", "koja", "koje", "koji", "na", "od", "o", "po", "sa", "se", "sta", "su",
  "u", "za", "zasto"
]);

const majorNewsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_major",
    "reason",
    "id",
    "topic",
    "category",
    "preferred_domains",
    "visual_subject"
  ],
  properties: {
    is_major: { type: "boolean" },
    reason: { type: "string" },
    id: { type: "string" },
    topic: { type: "string" },
    category: { type: "string" },
    preferred_domains: {
      type: "array",
      minItems: 0,
      maxItems: 6,
      items: { type: "string" }
    },
    visual_subject: { type: "string" }
  }
};

function normalizeTopicText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stemTopicToken(token) {
  const endings = ["ovima", "evima", "ima", "ama", "ovi", "evi", "om", "em", "og", "oj", "a", "e", "i", "o", "u"];
  for (const ending of endings) {
    if (token.endsWith(ending) && token.length - ending.length >= 4) {
      return token.slice(0, -ending.length);
    }
  }
  return token;
}

function topicTokens(value = "") {
  return new Set(
    normalizeTopicText(value)
      .split(/\s+/)
      .filter(token => token.length > 1 && !TOPIC_STOP_WORDS.has(token))
      .map(stemTopicToken)
  );
}

function overlapScore(a, b) {
  const left = topicTokens(a);
  const right = topicTokens(b);
  if (!left.size || !right.size) return { score: 0, shared: 0 };

  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }

  return {
    score: shared / Math.min(left.size, right.size),
    shared
  };
}

export function isDuplicateTopic(candidate, state) {
  const candidateId = normalizeTopicText(candidate?.id);
  const candidateTopic = normalizeTopicText(candidate?.topic);

  return state.posted.some(entry => {
    const postedId = normalizeTopicText(entry.topic_id);
    if (candidateId && postedId && candidateId === postedId) return true;

    const previousTitles = [entry.seed_topic, entry.topic_title]
      .map(normalizeTopicText)
      .filter(Boolean);

    for (const previous of previousTitles) {
      if (candidateTopic && candidateTopic === previous) return true;

      const { score, shared } = overlapScore(candidateTopic, previous);
      if ((shared >= 5 && score >= 0.55) || (shared >= 4 && score >= 0.72)) return true;
    }

    return false;
  });
}

async function scanMajorSneakerNews(state) {
  const previous = state.posted
    .slice(-200)
    .map(x => x.seed_topic || x.topic_title)
    .filter(Boolean);

  const prompt = `
You are the breaking-news gatekeeper for TrendyPatike, a Serbian Instagram account about sneaker history, culture and sport.

IMPORTANT EDITORIAL PRIORITY:
The NORMAL daily TrendyPatike post should be evergreen history, culture, iconic models, athletes, design, inventions and surprising facts.
Breaking news is an EXCEPTION, not the main content strategy.

Search the web for events from roughly the LAST 72 HOURS.
Return is_major=true ONLY if there is a genuinely big sneaker/sportswear story that is more interesting than a strong evergreen history post.

QUALIFYING MAJOR STORIES can include:
- a major company sale, acquisition, new controlling owner or ownership change involving a globally known sportswear/sneaker company;
- a major lawsuit, court decision, settlement, regulatory action or business dispute involving a major sneaker/sportswear brand or famous sneaker partnership;
- a major athlete or celebrity sneaker/sportswear contract, endorsement or partnership, especially when the value is reliably reported;
- a major contract breakup, return or unexpected partnership change involving a globally known athlete, celebrity or brand;
- a major award, championship, record or sports moment where sneakers or a sneaker deal are a central part of the story;
- a major executive/founder event that materially affects a famous sneaker company;
- another truly exceptional sneaker-culture story with broad mainstream relevance.

DO NOT qualify ordinary product news:
- normal new sneaker releases;
- new colorways;
- restocks;
- release dates;
- leaks or rumors;
- routine collaborations;
- resale price changes;
- a celebrity simply being photographed wearing shoes;
- small influencer stories;
- ordinary marketing campaigns.

A new shoe itself is NOT enough. Only choose product news if the surrounding event is historically or culturally significant on a mainstream level.

SOURCE RULES:
- The story must be verified from at least 2 reliable sources when possible.
- Prefer an official source plus Reuters, AP, ESPN or another highly reputable source.
- Do not use rumors, anonymous social posts or speculative sneaker blogs as the basis for is_major=true.
- If contract value, lawsuit amount, ownership value or another number is uncertain, do not state it as fact.

Previous TrendyPatike topics to avoid repeating:
${previous.map(x => `- ${x}`).join("\n") || "- none yet"}

If there is NO exceptional story, return is_major=false and leave id/topic/category/visual_subject as short empty strings and preferred_domains as an empty array.
If there IS an exceptional story, return a stable lowercase ASCII hyphenated id, a clear topic, category, visual subject, and preferred_domains chosen only from this list:
${MAJOR_NEWS_DOMAINS.join(", ")}
`;

  const result = await structuredWebResponse({
    model: cfg.textModel,
    prompt,
    schema: majorNewsSchema,
    schemaName: "trendypatike_major_news_gate",
    allowedDomains: MAJOR_NEWS_DOMAINS
  });

  const candidate = result.value;
  if (!candidate.is_major) {
    console.log(`[news] No exceptional sneaker story today: ${candidate.reason}`);
    return null;
  }

  if (!candidate.id || !candidate.topic || !candidate.visual_subject) {
    console.log("[news] Major-news gate returned incomplete story; using evergreen topic instead.");
    return null;
  }

  if (isDuplicateTopic(candidate, state)) {
    console.log(`[news] Duplicate major story blocked: ${candidate.topic}`);
    return null;
  }

  console.log(`[news] Exceptional story selected: ${candidate.topic}`);
  console.log(`[news] Why it qualified: ${candidate.reason}`);

  return {
    id: candidate.id,
    topic: candidate.topic,
    category: candidate.category || "major-news",
    preferred_domains: candidate.preferred_domains.length
      ? candidate.preferred_domains
      : MAJOR_NEWS_DOMAINS.slice(0, 6),
    visual_subject: candidate.visual_subject
  };
}

async function chooseUniqueEvergreenTopic(topics, state) {
  const selectionState = {
    ...state,
    posted: [...state.posted]
  };

  for (let attempt = 1; attempt <= 5; attempt++) {
    const candidate = await chooseTopic(topics, selectionState);
    if (!isDuplicateTopic(candidate, state)) return candidate;

    console.log(`[topics] Duplicate topic blocked (${attempt}/5): ${candidate.topic}`);
    selectionState.posted.push({
      topic_id: candidate.id,
      topic_title: candidate.topic,
      seed_topic: candidate.topic
    });
  }

  throw new Error("Could not find a unique TrendyPatike topic after 5 attempts");
}

export async function choosePriorityTopic(topics, state, { allowMajorNews = true } = {}) {
  if (allowMajorNews) {
    try {
      const major = await scanMajorSneakerNews(state);
      if (major) return major;
    } catch (err) {
      console.error(`[news] Major-news scan failed; continuing with evergreen topic: ${err.message}`);
    }
  }

  return chooseUniqueEvergreenTopic(topics, state);
}
