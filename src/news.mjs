import { cfg } from "./config.mjs";
import { structuredWebResponse, isFatalAccountError } from "./openai.mjs";
import { chooseTopic } from "./content.mjs";

const MAJOR_NEWS_DOMAINS = [
  "about.nike.com", "nike.com", "nba.com", "news.adidas.com", "adidas-group.com",
  "adidas.com", "about.puma.com", "puma.com", "newbalance.com",
  "newbalance.newsmarket.com", "asics.com", "reebok.com", "olympics.com",
  "reuters.com", "apnews.com", "espn.com", "sportsbusinessjournal.com", "gq.com"
];

const TOPIC_STOP_WORDS = new Set([
  "a", "ali", "bi", "bio", "bila", "bilo", "da", "do", "i", "iz", "je", "kao",
  "kako", "koja", "koje", "koji", "na", "od", "o", "po", "sa", "se", "sta", "su",
  "u", "za", "zasto"
]);

const majorNewsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["is_major", "reason", "id", "topic", "category", "preferred_domains", "visual_subject"],
  properties: {
    is_major: { type: "boolean" },
    reason: { type: "string", maxLength: 300 },
    id: { type: "string", maxLength: 100 },
    topic: { type: "string", maxLength: 180 },
    category: { type: "string", maxLength: 100 },
    preferred_domains: {
      type: "array",
      minItems: 0,
      maxItems: 6,
      items: { type: "string", maxLength: 120 }
    },
    visual_subject: { type: "string", maxLength: 300 }
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
    if (token.endsWith(ending) && token.length - ending.length >= 4) return token.slice(0, -ending.length);
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
  for (const token of left) if (right.has(token)) shared += 1;
  return { score: shared / Math.min(left.size, right.size), shared };
}

export function isDuplicateTopic(candidate, state) {
  const candidateId = normalizeTopicText(candidate?.id);
  const candidateTopic = normalizeTopicText(candidate?.topic);

  return (state.posted || []).some(entry => {
    const postedId = normalizeTopicText(entry.topic_id);
    if (candidateId && postedId && candidateId === postedId) return true;

    for (const previous of [entry.seed_topic, entry.topic_title].map(normalizeTopicText).filter(Boolean)) {
      if (candidateTopic && candidateTopic === previous) return true;
      const { score, shared } = overlapScore(candidateTopic, previous);
      if ((shared >= 5 && score >= 0.55) || (shared >= 4 && score >= 0.72)) return true;
    }
    return false;
  });
}

async function scanMajorSneakerNews(state) {
  const previous = (state.posted || [])
    .slice(-200)
    .map(x => x.seed_topic || x.topic_title)
    .filter(Boolean);

  const prompt = `You are the breaking-news gatekeeper for TrendyPatike.
Search roughly the last 72 hours. Normal daily content is evergreen sneaker history/culture.
Return is_major=true ONLY for a genuinely major mainstream story: ownership/acquisition, major lawsuit or ruling,
major athlete/celebrity sportswear contract or breakup, championship/record where sneaker business is central,
or another exceptional sneaker-industry event.
Do NOT qualify normal releases, colorways, restocks, leaks, routine collaborations, resale changes or celebrity sightings.
Use reliable sources and avoid rumors.
Previous topics to avoid:\n${previous.map(x => `- ${x}`).join("\n") || "- none"}
If no exceptional story exists, return is_major=false with empty id/topic/category/visual_subject and empty preferred_domains.
If one exists, preferred_domains must come from: ${MAJOR_NEWS_DOMAINS.join(", ")}.`;

  const result = await structuredWebResponse({
    model: cfg.textModel,
    prompt,
    schema: majorNewsSchema,
    schemaName: "trendypatike_major_news_gate",
    allowedDomains: MAJOR_NEWS_DOMAINS,
    searchContextSize: "low",
    maxToolCalls: 1,
    maxOutputTokens: 3000
  });

  const candidate = result.value;
  if (!candidate.is_major) {
    console.log(`[news] No exceptional sneaker story today: ${candidate.reason}`);
    return null;
  }
  if (!candidate.id || !candidate.topic || !candidate.visual_subject) return null;
  if (isDuplicateTopic(candidate, state)) {
    console.log(`[news] Duplicate major story blocked: ${candidate.topic}`);
    return null;
  }

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
  for (const topic of topics) {
    if (!isDuplicateTopic(topic, state)) return topic;
  }

  const fresh = await chooseTopic([], state);
  if (!isDuplicateTopic(fresh, state)) return fresh;
  throw new Error(`Fresh topic generator returned a duplicate: ${fresh.topic}`);
}

export async function choosePriorityTopic(topics, state, { allowMajorNews = true } = {}) {
  if (allowMajorNews) {
    try {
      const major = await scanMajorSneakerNews(state);
      if (major) return major;
    } catch (err) {
      // Never stack more paid calls after account/budget problems or an ambiguous
      // network timeout where the first request may already have been charged.
      if (
        isFatalAccountError(err) ||
        ["OpenAIBudgetGuardError", "OpenAINetworkAmbiguousError"].includes(err?.name)
      ) {
        throw err;
      }
      // A malformed optional news-gate object can safely fall back to curated
      // evergreen content; writer/verifier still do independent fact research.
      console.warn(`[news] Optional major-news gate unavailable; using evergreen: ${err.message}`);
    }
  }

  return chooseUniqueEvergreenTopic(topics, state);
}
