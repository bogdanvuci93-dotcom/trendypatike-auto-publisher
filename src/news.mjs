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

async function scanMajorSneakerNews(state) {
  const previous = state.posted
    .slice(-80)
    .map(x => x.topic_title)
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

export async function choosePriorityTopic(topics, state, { allowMajorNews = true } = {}) {
  if (allowMajorNews) {
    try {
      const major = await scanMajorSneakerNews(state);
      if (major) return major;
    } catch (err) {
      console.error(`[news] Major-news scan failed; continuing with evergreen topic: ${err.message}`);
    }
  }

  return chooseTopic(topics, state);
}
