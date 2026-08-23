from pathlib import Path

CONTENT = Path("src/content.mjs")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Content policy patch failed: {label}")
    return text.replace(old, new, 1)


s = CONTENT.read_text(encoding="utf-8")

# 1) Add permanent, deterministic Serbian simplification before the visible-copy gate.
old = '''function normalizeHeadlineGroup(lines,maxLines){ const cleaned=(lines||[]).map(line=>({text:cleanText(line?.text),accent:line?.accent===true})).filter(line=>line.text); if(!cleaned.length)return [{text:"PATIKA IMA ZANIMLJIVU PRIČU",accent:false}]; return cleaned.slice(0,maxLines); }'''
new = '''function simplifyKidPhrase(value=""){
  return cleanText(value)
    .replace(/\\bpuna srednja pena\\b/gi,"deblji sloj pene u đonu")
    .replace(/\\bsrednja pena\\b/gi,"pena u đonu")
    .replace(/\\bza bolje umekšanje\\b/gi,"koji ublažava udarce")
    .replace(/\\bbolje umekšanje\\b/gi,"ublažavanje udaraca")
    .replace(/\\bsvakodnevna silueta\\b/gi,"patika za svaki dan")
    .replace(/\\bsimbol sneaker kulture\\b/gi,"poznata patika među ljubiteljima patika")
    .replace(/\\bsneaker kultura\\b/gi,"svet patika")
    .replace(/\\bpop[- ]kulturni klasik\\b/gi,"poznata patika i van sporta")
    .replace(/\\bkulturna primena\\b/gi,"način na koji su je ljudi nosili")
    .replace(/\\bmodelski simbol\\b/gi,"poznat model")
    .replace(/\\bsignatura modela\\b/gi,"prepoznatljiv detalj modela")
    .replace(/\\buveo eleganciju\\b/gi,"dao patiki elegantniji izgled");
}
function normalizeHeadlineGroup(lines,maxLines){ const cleaned=(lines||[]).map(line=>({text:simplifyKidPhrase(line?.text),accent:line?.accent===true})).filter(line=>line.text); if(!cleaned.length)return [{text:"PATIKA IMA ZANIMLJIVU PRIČU",accent:false}]; return cleaned.slice(0,maxLines); }'''
s = replace_once(s, old, new, "kid phrase normalizer")

# 2) Harder writer rules: no literal translations and exact image-to-fact matching.
old = '''- Prefer ordinary Serbian words. If a specialist term is essential, explain it immediately in simple Serbian on the SAME slide.'''
new = '''- Prefer ordinary Serbian words. If a specialist term is essential, explain it immediately in simple Serbian on the SAME slide.
- NEVER translate English sneaker construction literally. Forbidden examples include "puna srednja pena", "srednja pena", "bolje umekšanje" and "svakodnevna silueta". Say what it means in normal Serbian, for example "deblji sloj pene u đonu koji ublažava udarce".
- Use verbs and concrete objects instead of abstract nouns. A child should be able to picture the sentence immediately.'''
s = replace_once(s, old, new, "writer Serbian rule")

old = '''FACT RULES:
- Use only facts supported by pages you actually found now.'''
new = '''FACT RULES:
- The story must have a strong mass-interest hook. Prefer globally famous athletes, musicians, films, iconic models, records, scandals/myths with a factual correction, unusual inventions, extreme rarity, huge auction sales or surprising money.
- Do NOT center a post on an obscure designer, executive, collector or random person unless a mainstream audience would recognize the event/story without already knowing sneaker history.
- At least ONE used slide after the cover should contain a verified WOW NUMBER whenever a reliable source provides one: documented auction/sale price, original retail price, production quantity, pairs made, record, contract value, fine, year gap or another surprising concrete number.
- For rare/collectible shoes, actively search for the strongest documented price fact. Prefer an actual recorded auction/sale price with the year and auction/source over vague current "worth" or unstable resale estimates.
- Never invent a price and never present an asking price or unsourced resale estimate as value. If no reliable money figure exists, use another verified surprising number instead.
- Write money in a form Serbian readers instantly understand, e.g. "2,2 MILIONA DOLARA", and make the number a green accent when it is the slide's main hook.
- Use only facts supported by pages you actually found now.'''
s = replace_once(s, old, new, "writer mass-interest and numbers")

old = '''- EACH used prompt must directly illustrate that slide's exact visible statement.
- Used images must be meaningfully different scenes and visually obvious to a child.'''
new = '''- EACH used prompt must directly illustrate that slide's exact visible statement, not merely the general topic.
- The exact sneaker/model/person named on the slide MUST also be explicitly named in that slide's image prompt.
- If the slide explains a physical detail such as foam, sole, cushioning, leather, Air unit, stitching or another construction detail, the image prompt MUST demand a close-up, macro, cutaway or cross-section of THAT EXACT DETAIL on THAT EXACT MODEL. The shoe/detail must occupy at least 65% of the frame. NO group of people, generic street scene or unrelated lifestyle image is allowed on such a slide.
- If the slide is about a person, require that person and the exact relevant shoe/object in the scene whenever both are material to the fact.
- Used images must be meaningfully different scenes and visually obvious to a child.'''
s = replace_once(s, old, new, "writer image alignment")

# 3) Same standards for the independent verifier.
old = '''- Replace specialist or awkward language with simple Serbian. Translate unexplained English jargon; for example patent leather should become "sjajna lakovana koža" when visible.'''
new = '''- Replace specialist or awkward language with simple Serbian. Translate unexplained English jargon; for example patent leather should become "sjajna lakovana koža" when visible.
- Reject literal or unnatural translations such as "puna srednja pena", "srednja pena", "bolje umekšanje" and "svakodnevna silueta". Rewrite them into ordinary Serbian that a 10-year-old would naturally understand.
- Prefer a concrete verb + object over abstract wording. If you would not say the sentence naturally to a child, rewrite it.'''
s = replace_once(s, old, new, "verifier Serbian rule")

old = '''- slide_count must be 1, 2 or 3 and reflect story strength. Never pad to 3.'''
new = '''- slide_count must be 1, 2 or 3 and reflect story strength. Never pad to 3.
- Reject weak niche angles centered on people a general audience is unlikely to know. The post needs an obvious mass-interest hook: famous person/model/event, extraordinary rarity, record, money, controversy/myth, invention or surprising cultural moment.
- Whenever reliable evidence exists, include at least one surprising verified number on a used slide after the cover. For collectible/limited shoes prefer a documented auction/sale price plus year; otherwise use production count, original retail price, record or another strong number.
- Never use a current resale guess, asking price or unsupported "worth". A price must be tied to a reliable documented sale/auction/source.'''
s = replace_once(s, old, new, "verifier mass-interest and numbers")

old = '''- Only the first slide_count image prompts matter; each must visually match its exact slide fact.
- No TrendyPatike branding inside base AI images.'''
new = '''- Only the first slide_count image prompts matter; each must visually match its exact slide fact, not just the overall topic.
- Every used image prompt must explicitly name the exact model/person/object named by that slide.
- For a construction/material/detail fact, require a close-up, macro, cutaway or cross-section of the exact shoe detail, with the shoe/detail filling at least 65% of the frame; reject people-only, generic street or unrelated lifestyle scenes.
- No TrendyPatike branding inside base AI images.'''
s = replace_once(s, old, new, "verifier image alignment")

# 4) Deterministically strengthen the actual prompts AFTER AI/verifier output.
old = '''function normalizePostForPublishing(post){ const value=JSON.parse(JSON.stringify(post)); value.topic_title=cleanText(value.topic_title); value.slide_count=Math.max(1,Math.min(3,Number(value.slide_count)||1)); value.cover.headline_lines=normalizeHeadlineGroup(value.cover.headline_lines,3); value.cover.subheadline=ensureSentence(value.cover.subheadline); value.slide2.headline_lines=normalizeHeadlineGroup(value.slide2.headline_lines,3); value.slide2.facts=value.slide2.facts.map(fact=>({...fact,tag:shortenAtWordBoundary(fact.tag,18),text:ensureSentence(fact.text)})); value.slide3.headline_lines=normalizeHeadlineGroup(value.slide3.headline_lines,3); value.slide3.facts=value.slide3.facts.map(fact=>({...fact,tag:shortenAtWordBoundary(fact.tag,18),text:ensureSentence(fact.text)})); value.slide3.question=normalizeQuestion(value.slide3.question); value.caption=normalizeCaption(value.caption); value.hashtags=normalizeHashtags(value.hashtags); value.image_prompts=value.image_prompts.map(cleanText); return enforceKidCopy(value); }'''
new = '''function slideHeadline(post,index){
  if(index===0)return headlineText(post.cover?.headline_lines||[]);
  if(index===1)return headlineText(post.slide2?.headline_lines||[]);
  return headlineText(post.slide3?.headline_lines||[]);
}
function hardenImagePrompts(post){
  const construction=/\\b(?:pena|đon|amortiz|ublaž|koža|air|jastuči|šav|materijal|guma|potplat)\\w*/i;
  return (post.image_prompts||[]).map((raw,index)=>{
    const fact=slideHeadline(post,index);
    let rule=` EXACT SLIDE FACT TO ILLUSTRATE: ${fact}. The main visible subject must directly prove or explain this exact fact, not merely suggest the general topic.`;
    if(construction.test(fact)) rule += " MANDATORY DETAIL SHOT: show the exact sneaker/model and the exact physical construction/material/detail described by the fact in a close-up, macro, cutaway or cross-section. The shoe or relevant detail must occupy at least 65% of the frame. NO group of people, NO people-only scene, NO generic street/lifestyle scene, NO unrelated objects as the main subject.";
    return `${cleanText(raw)}${rule}`;
  });
}
function normalizePostForPublishing(post){ const value=JSON.parse(JSON.stringify(post)); value.topic_title=cleanText(value.topic_title); value.slide_count=Math.max(1,Math.min(3,Number(value.slide_count)||1)); value.cover.headline_lines=normalizeHeadlineGroup(value.cover.headline_lines,3); value.cover.subheadline=ensureSentence(value.cover.subheadline); value.slide2.headline_lines=normalizeHeadlineGroup(value.slide2.headline_lines,3); value.slide2.facts=value.slide2.facts.map(fact=>({...fact,tag:shortenAtWordBoundary(fact.tag,18),text:ensureSentence(fact.text)})); value.slide3.headline_lines=normalizeHeadlineGroup(value.slide3.headline_lines,3); value.slide3.facts=value.slide3.facts.map(fact=>({...fact,tag:shortenAtWordBoundary(fact.tag,18),text:ensureSentence(fact.text)})); value.slide3.question=normalizeQuestion(value.slide3.question); value.caption=normalizeCaption(value.caption); value.hashtags=normalizeHashtags(value.hashtags); value.image_prompts=value.image_prompts.map(cleanText); enforceKidCopy(value); value.image_prompts=hardenImagePrompts(value); return value; }'''
s = replace_once(s, old, new, "deterministic image prompt hardening")

# 5) Make future auto-discovered topics pass a mainstream-interest test and allow reputable auction evidence.
old = '''  "newbalance.com", "newbalance.newsmarket.com", "asics.com", "reebok.com",
  "olympics.com", "smithsonianmag.com", "moma.org", "britannica.com", "gq.com"
];'''
new = '''  "newbalance.com", "newbalance.newsmarket.com", "asics.com", "reebok.com",
  "olympics.com", "smithsonianmag.com", "moma.org", "britannica.com", "gq.com",
  "sothebys.com", "christies.com", "guinnessworldrecords.com"
];'''
s = replace_once(s, old, new, "trusted auction domains")

old = '''Prefer sneaker history, famous models, athletes, sports moments, inventions, unusual design stories and myths-vs-facts.
Pick a topic that works as a strong Instagram carousel with 1, 2 or 3 slides. Never stretch a weak topic just to reach 3 slides.
Avoid rumors, resale speculation, routine releases, weak anecdotes and topics that require specialist sneaker knowledge.'''
new = '''Prioritize MASS-INTEREST stories that a normal Instagram user would stop for even without sneaker expertise: globally famous athletes/musicians/films, iconic models, records, huge documented auction sales, extreme rarity, surprising money, unusual inventions, famous controversies or myths-vs-facts.
Before choosing, apply this test: would someone who does NOT follow sneaker culture still recognize the person/model/event OR immediately care because the number/story is extraordinary? If not, reject the topic and choose another.
Avoid obscure designers, executives, collectors and random people unless the event itself is globally notable. Prefer Michael Jordan, Kobe Bryant, Kanye West, major films/music moments and universally recognizable models/events over niche insider names.
When possible choose a topic with at least one reliable WOW NUMBER such as a documented auction/sale price, pairs made, original retail price, record or other surprising statistic. Never use unstable resale speculation.
Pick a topic that works as a strong Instagram carousel with 1, 2 or 3 slides. Never stretch a weak topic just to reach 3 slides.
Avoid rumors, resale speculation, routine releases, weak anecdotes and topics that require specialist sneaker knowledge.'''
s = replace_once(s, old, new, "fresh topic mass-interest filter")

# 6) Fix the earlier auxiliary-verb bug in source as well, so workflow no longer depends on runtime sed for it.
s = s.replace('(?:ga|je|to|taj|ta|ovo|ona|on)', '(?:ga|to|taj|ta|ovo|ona|on)')

CONTENT.write_text(s, encoding="utf-8")
print("Strict kid-copy, mass-interest, wow-number and image-to-fact policy applied.")
