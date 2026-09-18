from pathlib import Path

CONTENT = Path("src/content.mjs")
s = CONTENT.read_text(encoding="utf-8")

replacements = {
    "COVER should normally be 5-10 words; later slides 6-12 words. NEVER exceed 18 words.":
    "COVER should normally be 8-16 high-impact words and lead with the strongest verified payoff. It MAY use up to 20 words only when needed to complete the hook. Later slides should normally be 18-30 words, but MAY use 31-40 words when needed to finish the story clearly. NEVER cut a sentence or leave a thought unfinished just to hit a word limit.",
    "COVER should normally contain 5-10 words; later used slides 6-12 words. Absolute maximum remains 18 words.":
    "COVER should normally contain 8-16 high-impact words, up to 20 only when needed to finish the hook. Later used slides should normally contain 18-30 words, but MAY use 31-40 words when the cause, event and consequence need more context. Complete meaning is more important than a short word count.",
    "One used slide = ONE simple idea. COVER should normally be 5-10 words; later slides 6-12 words. NEVER exceed 18 words.":
    "One used slide = ONE coherent mini-story. COVER should normally be 8-16 high-impact words and show the strongest verified surprise immediately. Later slides should normally contain 18-30 words and MAY use 31-40 words when necessary to explain what happened, why it happened and what followed. NEVER cut the sentence or leave the thought unfinished.",
}
for old, new in replacements.items():
    s = s.replace(old, new)

s = s.replace("value.cover.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.cover.headline_lines,3),11);",
              "value.cover.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.cover.headline_lines,3),20);")
s = s.replace("value.cover.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.cover.headline_lines,3),14);",
              "value.cover.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.cover.headline_lines,3),20);")
s = s.replace("value.cover.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.cover.headline_lines,3),24);",
              "value.cover.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.cover.headline_lines,3),20);")
s = s.replace("value.slide2.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.slide2.headline_lines,3),12);",
              "value.slide2.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.slide2.headline_lines,3),40);")
s = s.replace("value.slide3.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.slide3.headline_lines,3),12);",
              "value.slide3.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.slide3.headline_lines,3),40);")
s = s.replace("return capHeadlineWords(cleaned.slice(0,maxLines),18);",
              "return capHeadlineWords(cleaned.slice(0,maxLines),40);")

attention_writer = '''
ATTENTION-FIRST STORY RULES — THESE OVERRIDE ANY EARLIER PREFERENCE FOR ULTRA-SHORT OR ENCYCLOPEDIC COPY:
- Every post must feel like a mini-story a person would retell to a friend, not a list of sneaker facts.
- Prefer a real conflict, rivalry, breakup, ban, lawsuit, record, bankruptcy, acquisition, huge money figure, unbelievable mistake, famous sports moment, controversial rule change or surprising reversal.
- The story must clearly answer, in natural Serbian: KO je u priči? ŠTA se tačno desilo? ZAŠTO je to važno / zašto se desilo? ŠTA je bila posledica?
- At least one used slide must contain a concrete, verified consequence or payoff. Do not end after merely naming an event.
- Whenever reliable evidence exists, include one memorable verified detail: year/date, money, number of pairs, record, contract, fine, sale, bankruptcy, rule or other concrete number.
- COVER IS A SCROLL-STOP AD FOR THE STORY. Lead with the single strongest verified surprise, number, conflict or reversal immediately. The reader should understand in under one second why this fact is worth swiping.
- COVER should usually carry 8-16 high-impact words and may use up to 20 only to complete the hook. Prefer a large memorable number or contrast over background explanation. Move context to later slides.
- Do not start the cover with setup such as "Pre nego što...", generic biography, or a long chronological introduction when a stronger payoff exists.
- The cover image prompt must show the most recognizable, emotionally clear object/person/moment from the story with one dominant focal subject. Avoid generic shoes, empty offices or abstract scenery when a specific object/event can be shown.
- Later slides should usually carry 18-30 meaningful words, up to 40 when the explanation genuinely needs it.
- Never pad with filler just to reach a word count; every added phrase must add cause, consequence, context or a memorable verified detail.
- NEVER repeat the same sentence, clause or 3+ word phrase on two slides. Each slide must advance the story with NEW information.
- NEVER repeat a word directly (example: "dva dva", "brend brend") and avoid awkward echoing of the same noun several times in one headline when a pronoun or clearer rewrite works.
- Hook must create an immediate "čekaj, stvarno?" reaction. A famous name alone is not a hook.
- Never write a dangling thought such as "Nike je 1985. registrovao". Finish the object and why it matters. Never end on an auxiliary or action verb that obviously requires an object/explanation.
- If a complete explanation needs 31-40 words on a later slide, USE THEM. Prefer a smaller font over deleting the reason or consequence.
- Do not manufacture drama. Rumors, affairs, motives, feuds and scandals may be stated only when reliably sourced. When cause is disputed, say that clearly instead of inventing certainty.
- FINAL SLIDE ENGAGEMENT RULE: the last used slide must end the story with a useful payoff, and the visual renderer will ALWAYS add a permanent CTA asking people to like and follow TrendyPatike for more facts. Do not waste the main headline repeating that CTA; use the headline for the final interesting fact.
- Strong pattern: SCROLL-STOP HOOK -> exact event -> cause/context -> consequence -> memorable verified detail -> CTA on final slide.
'''

if attention_writer.strip() not in s:
    anchor = "FACT RULES:\n"
    if anchor in s:
        s = s.replace(anchor, attention_writer + "\n" + anchor, 1)
    else:
        s = "const ATTENTION_STORY_POLICY = `" + attention_writer.replace("`", "'") + "`;\n" + s

attention_verifier = '''
ATTENTION / COMPLETENESS / REPETITION GATE:
- Reject the post if it reads like an encyclopedia entry, generic biography or technical product summary.
- Reject if the COVER does not expose the strongest verified surprise/payoff immediately or requires reading a long setup before the interesting point appears.
- Reject if the cover is generic when the sources contain a strong number, conflict, reversal, ban, record, price, acquisition, bankruptcy or other concrete scroll-stop detail.
- Reject if the hook lacks a concrete conflict, reversal, money/record/rarity, famous event, controversy/myth or another obvious mass-interest payoff.
- Reject if the post tells WHAT happened but omits the important WHY/context or WHAT HAPPENED NEXT when reliable sources provide it.
- Reject any headline that ends mid-thought, on an incomplete verb/object relationship, or feels like text was chopped to fit the image.
- Reject any used slide that is obviously too thin to explain its promised idea. As a default, cover should be about 8-16 meaningful words (up to 20 when needed) and later slides about 18-30, with up to 40 allowed when needed.
- Reject direct duplicate words, nonsensical repeated wording, or a repeated 3+ word phrase across multiple slides unless it is an unavoidable proper name.
- Every new slide must add new information; reject carousel padding that merely rephrases the previous slide.
- Do NOT shorten a complete verified explanation merely to satisfy an old 18-word preference.
- Reject sensational allegations that are not well supported by the cited sources.
'''
if attention_verifier.strip() not in s:
    verifier_anchor = "- slide_count must be 1, 2 or 3 and reflect story strength. Never pad to 3."
    if verifier_anchor in s:
        s = s.replace(verifier_anchor, verifier_anchor + attention_verifier, 1)

CONTENT.write_text(s, encoding="utf-8")

# Permanent visual CTA on the FINAL USED slide. This is intentionally renderer-level,
# so the call-to-action survives fallback posts and any AI omission.
RENDER = Path("src/render.mjs")
r = RENDER.read_text(encoding="utf-8")
old_overlay = '''function slideOverlay(post, i) {
  const position = textPositionForSlide(i);
  const segments = visibleSegmentsForSlide(post, i);
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${fadeSvg(position)}${frameSvg()}${semanticTextSvg(segments, position)}</svg>`;
}'''
new_overlay = '''function engagementCommentPrompt(post) {
  const topic = clean(`${post?.topic_title || ""} ${post?.cover?.subheadline || ""}`).toLowerCase();
  if (/aukc|cena|košta|vred|dolar|milion|novac|prod/.test(topic)) return "KOLIKO BI TI PLATIO?";
  if (/zabran|kazn|tuž|sukob|svađ|kontrover|prevara|slučaj|bankrot/.test(topic)) return "ŠTA TI MISLIŠ O OVOME?";
  if (/protiv|poređ|bolj|izabra|najbolj/.test(topic)) return "KOJI BI TI IZABRAO?";
  return "KOMENTARIŠI OVU PRIČU";
}

function finalSlideEngagementCta(post, i) {
  const slideCount = Math.max(1, Math.min(3, Number(post?.slide_count) || 3));
  if (i !== slideCount - 1) return "";
  const commentPrompt = esc(engagementCommentPrompt(post));
  return `<g>
    <rect x="548" y="1254" width="462" height="76" rx="22" fill="#050706" fill-opacity="0.94" stroke="${GREEN}" stroke-width="2"/>
    <text x="779" y="1282" text-anchor="middle" font-family="${FONT}" font-size="21" font-weight="900" fill="${WHITE}" letter-spacing="0.5">LAJKUJ + ZAPRATI ZA JOŠ</text>
    <text x="779" y="1312" text-anchor="middle" font-family="${FONT}" font-size="19" font-weight="900" fill="${GREEN}" letter-spacing="0.3">${commentPrompt}</text>
  </g>`;
}

function slideOverlay(post, i) {
  const position = textPositionForSlide(i);
  const segments = visibleSegmentsForSlide(post, i);
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${fadeSvg(position)}${frameSvg()}${semanticTextSvg(segments, position)}${finalSlideEngagementCta(post, i)}</svg>`;
}'''
if old_overlay in r:
    r = r.replace(old_overlay, new_overlay, 1)
elif "function finalSlideEngagementCta(post, i)" not in r:
    raise SystemExit("attention_story_policy: render CTA anchor not found")

# Make the first generated image explicitly scroll-stopping and singular in focus.
old_prompt = '''  return `VISUAL SCENE BRIEF ONLY. DO NOT WRITE OR DISPLAY ANY WORDS FROM THIS BRIEF IN THE IMAGE:\\n${base}\\n\\nCreate a full-bleed 4:5 vertical editorial photograph that clearly shows the exact sneaker, person, sport, object, place, invention, event or comparison requested above. Never replace a specific sneaker or historical object with a generic modern shoe. ${composition}\\nThe image must fill the entire frame and remain visually strong outside the future text area. Premium sneaker-editorial photography, realistic materials, believable cinematic lighting, kid-friendly and instantly understandable.'''
new_prompt = '''  const hookVisual = i === 0 ? "FIRST SLIDE: make this instantly scroll-stopping with one dominant recognizable focal subject, strong contrast, dramatic but believable lighting, and a composition understandable in under one second. Avoid generic filler scenery." : "";
  return `VISUAL SCENE BRIEF ONLY. DO NOT WRITE OR DISPLAY ANY WORDS FROM THIS BRIEF IN THE IMAGE:\\n${base}\\n\\n${hookVisual} Create a full-bleed 4:5 vertical editorial photograph that clearly shows the exact sneaker, person, sport, object, place, invention, event or comparison requested above. Never replace a specific sneaker or historical object with a generic modern shoe. ${composition}\\nThe image must fill the entire frame and remain visually strong outside the future text area. Premium sneaker-editorial photography, realistic materials, believable cinematic lighting, kid-friendly and instantly understandable.'''
if old_prompt in r:
    r = r.replace(old_prompt, new_prompt, 1)

RENDER.write_text(r, encoding="utf-8")
print("Attention-story policy applied: scroll-stop cover, detailed 18-40 word storytelling, repetition rejection, and permanent final-slide CTA.")
