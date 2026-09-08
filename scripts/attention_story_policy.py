from pathlib import Path

CONTENT = Path("src/content.mjs")
s = CONTENT.read_text(encoding="utf-8")

replacements = {
    "COVER should normally be 5-10 words; later slides 6-12 words. NEVER exceed 18 words.":
    "COVER should normally be 12-22 words. Later slides should normally be 18-30 words, but MAY use 31-40 words when needed to finish the story clearly. NEVER cut a sentence or leave a thought unfinished just to hit a word limit.",
    "COVER should normally contain 5-10 words; later used slides 6-12 words. Absolute maximum remains 18 words.":
    "COVER should normally contain 12-22 words. Later used slides should normally contain 18-30 words, but MAY use 31-40 words when the cause, event and consequence need more context. Complete meaning is more important than a short word count.",
    "One used slide = ONE simple idea. COVER should normally be 5-10 words; later slides 6-12 words. NEVER exceed 18 words.":
    "One used slide = ONE coherent mini-story. COVER should normally be 12-22 words. Later slides should normally contain 18-30 words and MAY use 31-40 words when necessary to explain what happened, why it happened and what followed. NEVER cut the sentence or leave the thought unfinished.",
}
for old, new in replacements.items():
    s = s.replace(old, new)

s = s.replace("value.cover.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.cover.headline_lines,3),11);",
              "value.cover.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.cover.headline_lines,3),24);")
s = s.replace("value.cover.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.cover.headline_lines,3),14);",
              "value.cover.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.cover.headline_lines,3),24);")
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
- COVER should usually carry 12-22 meaningful words. Later slides should usually carry 18-30 meaningful words, up to 40 when the explanation genuinely needs it.
- Never pad with filler just to reach a word count; every added phrase must add cause, consequence, context or a memorable verified detail.
- NEVER repeat the same sentence, clause or 3+ word phrase on two slides. Each slide must advance the story with NEW information.
- NEVER repeat a word directly (example: "dva dva", "brend brend") and avoid awkward echoing of the same noun several times in one headline when a pronoun or clearer rewrite works.
- Hook must create an immediate "čekaj, stvarno?" reaction. A famous name alone is not a hook.
- Never write a dangling thought such as "Nike je 1985. registrovao". Finish the object and why it matters. Never end on an auxiliary or action verb that obviously requires an object/explanation.
- If a complete explanation needs 31-40 words on a later slide, USE THEM. Prefer a smaller font over deleting the reason or consequence.
- Do not manufacture drama. Rumors, affairs, motives, feuds and scandals may be stated only when reliably sourced. When cause is disputed, say that clearly instead of inventing certainty.
- Strong pattern: HOOK -> exact event -> cause/context -> consequence -> one memorable verified detail.
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
- Reject if the hook lacks a concrete conflict, reversal, money/record/rarity, famous event, controversy/myth or another obvious mass-interest payoff.
- Reject if the post tells WHAT happened but omits the important WHY/context or WHAT HAPPENED NEXT when reliable sources provide it.
- Reject any headline that ends mid-thought, on an incomplete verb/object relationship, or feels like text was chopped to fit the image.
- Reject any used slide that is obviously too thin to explain its promised idea. As a default, cover should be about 12-22 meaningful words and later slides about 18-30, with up to 40 allowed when needed.
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
print("Attention-story policy applied: detailed 12-40 word storytelling, new-info-per-slide and repetition rejection.")
