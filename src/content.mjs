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

export class TopicRejectedError extends Error { constructor(message) { super(message); this.name = "TopicRejectedError"; } }
export function isTopicRejectedError(err) { return err instanceof TopicRejectedError; }
async function atomicWriteJson(file, value) { const target=path.resolve(file); const temp=`${target}.tmp-${process.pid}-${Date.now()}`; await fs.writeFile(temp, JSON.stringify(value,null,2)+"\n"); await fs.rename(temp,target); }
export async function loadTopics(){ return JSON.parse(await fs.readFile(path.resolve("data/topics.json"),"utf8")); }
export async function loadState(){ return JSON.parse(await fs.readFile(path.resolve("data/state.json"),"utf8")); }
export async function saveState(state){ await atomicWriteJson("data/state.json",state); }
export function dateInBelgrade(){ return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Belgrade",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); }
function notPostedTopics(topics,state){ const used=new Set((state.posted||[]).map(x=>x.topic_id)); return topics.filter(t=>!used.has(t.id)); }
export async function chooseTopic(topics,state){ const available=notPostedTopics(topics,state); if(available.length) return available[0]; return discoverFreshTopic(state); }

async function discoverFreshTopic(state){
  const previous=(state.posted||[]).slice(-200).map(x=>x.seed_topic||x.topic_title).filter(Boolean);
  const prompt=`Choose ONE fresh topic for TrendyPatike, a Serbian sneaker-culture Instagram account.
Use web search. The topic must be factual, visually strong and easy to explain to a child with zero prior knowledge.
Do not repeat these topics:\n${previous.map(x=>`- ${x}`).join("\n")||"- none"}
Prefer sneaker history, famous models, athletes, sports moments, inventions, unusual design stories and myths-vs-facts.
Pick a topic that works as a strong Instagram carousel with 1, 2 or 3 slides. Never stretch a weak topic just to reach 3 slides.
Avoid rumors, resale speculation, routine releases, weak anecdotes and topics that require specialist sneaker knowledge.
preferred_domains must come only from: ${GLOBAL_TRUSTED_DOMAINS.join(", ")}.
Return a lowercase ASCII hyphenated id.`;
  const result=await structuredWebResponse({model:cfg.textModel,prompt,schema:freshSeedSchema,schemaName:"trendypatike_fresh_seed",allowedDomains:GLOBAL_TRUSTED_DOMAINS,searchContextSize:"low",maxToolCalls:1,maxOutputTokens:3500});
  return result.value;
}

function writerPrompt(seed){ return `You are the senior Serbian editor for TrendyPatike.
Use web search BEFORE writing.
TOPIC: ${seed.topic}
CATEGORY: ${seed.category}
VISUAL: ${seed.visual_subject}

The Instagram design is fixed by code. You create only the content inside it.

NON-NEGOTIABLE VISIBLE-COPY RULES:
- Serbian Latin script with correct letters Č, Ć, Š, Đ and Ž.
- Everyday spoken Serbian understandable to a 10-year-old with ZERO prior knowledge.
- A child must understand every used slide on the first read without knowing sneaker history.
- One used slide = ONE simple idea, normally 10-16 words total and NEVER more than 18 words total across headline_lines.
- Prefer ordinary Serbian words. If a specialist term is essential, explain it immediately in simple words.
- Do not use English jargon in visible Serbian copy except exact official model/person names that cannot be translated.
- NO decorative titles, vague teaser headings, tiny secondary copy, marketing language or academic wording.
- Every visible text block is rendered LARGE, BOLD and ALL CAPS.
- Do not create a separate title plus explanation. The large text itself tells the story directly.
- Never glue words together. Keep normal spaces around model names, years and numbers: AIR JORDAN 11, not AIRJORDAN11.
- Avoid awkward machine wording such as "kulturna primena", "modelski simbol", "signatura modela", "uveo eleganciju" or repeated words.
- Read the sentence mentally as if speaking to a child. If it sounds unnatural, rewrite it.

SEMANTIC GREEN ACCENT RULES:
- headline_lines are the actual visible text on EVERY used slide.
- accent=true is a DESIGN COMMAND, not decoration.
- Set accent=true ONLY on genuinely important details: exact sneaker/model name, important year, person's name or one signature technology/detail.
- Use only 1 or 2 accented phrases per slide whenever possible. Each accented phrase should normally be 1-4 words.
- Never color filler words, connectors or a whole long sentence.
- Keep surrounding explanation accent=false so the key detail stands out.

STRUCTURE:
- Choose slide_count as 1, 2 or 3. Use ONLY as many slides as the topic deserves. Never pad to 3.
- Cover headline_lines: 2-3 short phrase segments that together form ONE direct, self-contained sentence.
- Cover subheadline is required by schema but normally not rendered. Keep it simple.
- Slide 2 headline_lines are the visible slide-2 sentence if used. Use 1-3 short segments.
- Slide 2 facts are evidence/support fields. facts[0] must still be a clear fallback sentence.
- Slide 3 headline_lines are the visible slide-3 sentence if used. Use 1-3 short segments.
- Slide 3 facts are evidence/support fields. facts[0] must still be a clear fallback sentence.
- Keep slide3.question short and never add a slide only for a question.

FACT RULES:
- Use only facts supported by pages you actually found now.
- Use at least 2 source URLs, preferably primary/official sources.
- Never invent dates, money, records, quotes or causal claims.
- Correct sneaker myths. Distinguish Nike Air Ship from Air Jordan 1 when relevant.
- Famous people are editorial subjects, never TrendyPatike endorsers.
- Do not write AJ1; write Air Jordan 1. Do not use the English word banned in visible Serbian text.
- Caption should explain the story naturally and simply, then 4-8 hashtags.

IMAGE RULES:
- Return exactly 3 English image prompts because the schema requires them, but only the first slide_count prompts will be rendered.
- EACH used prompt must directly illustrate that slide's exact visible statement.
- Used images must be meaningfully different scenes and visually obvious to a child.
- If text names a person, event, invention, place, specific sneaker or comparison, the image must show that exact subject rather than a generic sneaker.
- Base images contain NO TrendyPatike logo/name/site/frame/captions/typography/watermark. Code adds branding.
- Every source URL and claim URL must be an exact page discovered in web search.
- Never cut a sentence or word to meet a length limit. Rewrite it shorter instead.`; }

function verifierPrompt(seed,draft){ return `You are an independent fact-checker and Serbian copy editor for TrendyPatike.
Use web search AGAIN and do not trust the draft blindly.
TOPIC: ${seed.topic}
DRAFT:\n${JSON.stringify(draft)}

Verify every important factual claim. Remove or rewrite anything unsupported. If material claims cannot be verified, set publish_ok=false.

Enforce these rules STRICTLY:
- Correct Serbian Latin letters Č, Ć, Š, Đ and Ž.
- A 10-year-old with ZERO prior knowledge must understand every visible sentence on first read.
- Each USED slide should contain 10-16 words total and MUST NOT exceed 18 words across headline_lines.
- Use normal spaces between every word, model name and number. AIR JORDAN 11 is correct; AIRJORDAN11 is forbidden.
- Replace specialist or awkward language with simple Serbian. Explain any unavoidable technical term in child-friendly words.
- No decorative headings, vague teasers, marketing language, academic language or machine-translated phrasing.
- ALL visible copy is intended to be LARGE, BOLD and ALL CAPS.
- headline_lines are the preferred visible copy and together form one natural, direct sentence.
- accent=true is semantic: only key model names, years, people or signature technologies/details may be green.
- Prefer 1-2 accented phrases per used slide, normally 1-4 words each. Never accent filler words or a random trailing chunk.
- slide_count must be 1, 2 or 3 and reflect story strength. Never pad to 3.
- facts[0] on later slides remains a simple factual fallback, but headline_lines are preferred visible text.
- Do not use AJ1 or the English word banned in visible copy. Never truncate words or sentences.
- Only the first slide_count image prompts matter; each must visually match its exact slide fact.
- No TrendyPatike branding inside base AI images.
Every final source and claim URL must correspond to pages actually found in web search.
Return a corrected final post even if you rewrote the draft.`; }

function normalizedUrlKey(raw){ try{ const u=new URL(raw); const host=u.hostname.replace(/^www\./,"").toLowerCase(); const pathname=decodeURIComponent(u.pathname).replace(/\/+$/,"")||"/"; return `${host}${pathname}`.toLowerCase(); }catch{return "";} }
function hostFor(raw){ try{return new URL(raw).hostname.replace(/^www\./,"").toLowerCase();}catch{return "";} }
function isAllowedUrl(raw,seed){ const host=hostFor(raw); if(!host)return false; return (seed.preferred_domains||[]).some(domain=>{const d=String(domain).replace(/^www\./,"").toLowerCase(); return host===d||host.endsWith(`.${d}`);}); }
function urlPathTokens(raw){ try{return new Set(decodeURIComponent(new URL(raw).pathname).toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>=3));}catch{return new Set();} }
function urlSimilarity(a,b){ const left=urlPathTokens(a),right=urlPathTokens(b); if(!left.size||!right.size)return 0; let shared=0; for(const token of left)if(right.has(token))shared++; return shared/Math.max(left.size,right.size); }
function matchEvidenceUrl(raw,evidence){ const key=normalizedUrlKey(raw); if(!key)return null; const exact=evidence.find(url=>normalizedUrlKey(url)===key); if(exact)return exact; const host=hostFor(raw); const sameHost=evidence.filter(url=>hostFor(url)===host); if(!sameHost.length)return null; if(sameHost.length===1)return sameHost[0]; return [...sameHost].map(url=>({url,score:urlSimilarity(raw,url)})).sort((a,b)=>b.score-a.score)[0]?.url||sameHost[0]; }
function cleanText(value=""){ return String(value).normalize("NFC").replace(/[\u2010-\u2015]/g,",").replace(/\u00a0/g," ").replace(/\bAJ1\b/gi,"Air Jordan 1").replace(/\bbanned\b/gi,"zabranjen").replace(/\s+,/g,",").replace(/,{2,}/g,",").replace(/\s{2,}/g," ").trim(); }
function ensureSentence(value=""){ const text=cleanText(value); if(!text)return "Činjenica je potvrđena iz pouzdanih izvora."; return /[.!?]$/.test(text)?text:`${text}.`; }
function shortenAtWordBoundary(text="",maxChars=18){ const value=cleanText(text); if(value.length<=maxChars)return value; const words=value.split(/\s+/); let out=""; for(const word of words){const next=out?`${out} ${word}`:word;if(next.length>maxChars)break;out=next;} return out||value.slice(0,maxChars).trim(); }
function normalizeHeadlineGroup(lines,maxLines){ const cleaned=(lines||[]).map(line=>({text:cleanText(line?.text),accent:line?.accent===true})).filter(line=>line.text); if(!cleaned.length)return [{text:"PATIKA IMA ZANIMLJIVU PRIČU",accent:false}]; return cleaned.slice(0,maxLines); }
function normalizeQuestion(text=""){ const words=cleanText(text).replace(/[?!.,]+$/g,"").split(/\s+/).filter(Boolean).slice(0,6); return `${(words.length?words:["Da","li","ste","znali"]).join(" ")}?`; }
function normalizeCaption(text=""){ const value=cleanText(text); if(value.length<=780)return value; const shortened=shortenAtWordBoundary(value,779).replace(/[,:;\-\s]+$/g,""); return /[.!?]$/.test(shortened)?shortened:`${shortened}.`; }
function normalizeHashtags(items=[]){ const out=[]; for(const item of items){let tag=cleanText(item).replace(/\s+/g,"");if(!tag)continue;if(!tag.startsWith("#"))tag=`#${tag}`;if(!out.includes(tag))out.push(tag.slice(0,48));} for(const fallback of ["#TrendyPatike","#Patike","#SneakerKultura","#IstorijaPatika"]){if(out.length>=4)break;if(!out.includes(fallback))out.push(fallback);} return out.slice(0,8); }
function headlineWordCount(lines=[]){ return lines.map(x=>cleanText(x?.text)).join(" ").split(/\s+/).filter(Boolean).length; }
function enforceKidCopy(post){
  const used=[post.cover?.headline_lines];
  if(Number(post.slide_count)>=2)used.push(post.slide2?.headline_lines);
  if(Number(post.slide_count)>=3)used.push(post.slide3?.headline_lines);
  for(const lines of used){
    const count=headlineWordCount(lines||[]);
    if(count<3||count>18)throw new TopicRejectedError(`Visible copy failed kid-friendly word limit: ${count} words`);
  }
  return post;
}
function normalizePostForPublishing(post){ const value=JSON.parse(JSON.stringify(post)); value.topic_title=cleanText(value.topic_title); value.slide_count=Math.max(1,Math.min(3,Number(value.slide_count)||1)); value.cover.headline_lines=normalizeHeadlineGroup(value.cover.headline_lines,3); value.cover.subheadline=ensureSentence(value.cover.subheadline); value.slide2.headline_lines=normalizeHeadlineGroup(value.slide2.headline_lines,3); value.slide2.facts=value.slide2.facts.map(fact=>({...fact,tag:shortenAtWordBoundary(fact.tag,18),text:ensureSentence(fact.text)})); value.slide3.headline_lines=normalizeHeadlineGroup(value.slide3.headline_lines,3); value.slide3.facts=value.slide3.facts.map(fact=>({...fact,tag:shortenAtWordBoundary(fact.tag,18),text:ensureSentence(fact.text)})); value.slide3.question=normalizeQuestion(value.slide3.question); value.caption=normalizeCaption(value.caption); value.hashtags=normalizeHashtags(value.hashtags); value.image_prompts=value.image_prompts.map(cleanText); return enforceKidCopy(value); }

function reconcileEvidence(post,seed,searchedUrls){
 const evidence=[...new Set((searchedUrls||[]).filter(url=>isAllowedUrl(url,seed)).filter(url=>normalizedUrlKey(url)))];
 if(evidence.length<2)throw new TopicRejectedError(`Fact-check evidence contained only ${evidence.length} approved source URL(s)`);
 const reconciledSources=[];
 for(const source of post.sources||[]){const matched=matchEvidenceUrl(source.url,evidence);if(!matched)continue;if(reconciledSources.some(x=>normalizedUrlKey(x.url)===normalizedUrlKey(matched)))continue;reconciledSources.push({...source,url:matched,publisher:cleanText(source.publisher)||hostFor(matched),title:cleanText(source.title)||"Verified source"});}
 for(const url of evidence){if(reconciledSources.length>=2)break;if(reconciledSources.some(x=>normalizedUrlKey(x.url)===normalizedUrlKey(url)))continue;reconciledSources.push({title:"Verified source",publisher:hostFor(url),url});}
 if(reconciledSources.length<2)throw new TopicRejectedError("Fact-check could not reconcile two distinct approved source URLs");
 post.sources=reconciledSources.slice(0,6);
 const reconciledClaims=[];
 for(const claim of post.claims||[]){const urls=[...new Set((claim.source_urls||[]).map(url=>matchEvidenceUrl(url,evidence)).filter(Boolean))];if(!urls.length)throw new TopicRejectedError(`A verifier claim had no matching web evidence: ${cleanText(claim.claim)}`);reconciledClaims.push({claim:cleanText(claim.claim),source_urls:urls.slice(0,4)});}
 post.claims=reconciledClaims; return post;
}

async function researchWriteVerifyOnce(seed){
 const domains=[...new Set(seed.preferred_domains||[])]; if(!domains.length)throw new TopicRejectedError(`Topic ${seed.id} has no approved research domains`);
 const draftResult=await structuredWebResponse({model:cfg.textModel,prompt:writerPrompt(seed),schema:postSchema,schemaName:"trendypatike_post",allowedDomains:domains,searchContextSize:"medium",maxToolCalls:2,maxOutputTokens:12000});
 const checkedResult=await structuredWebResponse({model:cfg.verifyModel,prompt:verifierPrompt(seed,draftResult.value),schema:verifierSchema,schemaName:"trendypatike_verified_post",allowedDomains:domains,searchContextSize:"medium",maxToolCalls:2,maxOutputTokens:14000});
 const checked=checkedResult.value; if(!checked.publish_ok)throw new TopicRejectedError(`Verifier rejected topic: ${cleanText(checked.reason)}`);
 let post=normalizePostForPublishing(checked.post); post=reconcileEvidence(post,seed,[...draftResult.searchUrls,...checkedResult.searchUrls]); return post;
}
export async function researchWriteVerify(seed){ return researchWriteVerifyOnce(seed); }
