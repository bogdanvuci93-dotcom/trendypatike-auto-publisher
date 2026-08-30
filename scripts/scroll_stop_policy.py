from pathlib import Path

CONTENT = Path("src/content.mjs")
s = CONTENT.read_text(encoding="utf-8")

# Make the writer optimize for stopping the scroll, not for encyclopedic completeness.
s = s.replace(
'''- One used slide = ONE simple idea, normally 8-14 words total and NEVER more than 18 words total across headline_lines.''',
'''- One used slide = ONE simple idea. COVER should normally be 5-10 words; later slides 6-12 words. NEVER exceed 18 words.
- The COVER is a scroll-stopping HOOK, not a summary. Lead with the surprising payoff immediately: a shocking verified price/number, a famous name + extraordinary event, a record, a myth/controversy, extreme rarity, or a famous film/music/sports moment.
- NEVER open with schoolbook phrasing such as "X je uticao na razvoj...", "X je promenio osećaj...", "X je uveo tehnologiju..." or a generic biography. If the topic cannot produce a hook that a non-sneaker fan would understand in one second, reject the topic.
- Default to 1-2 slides. Use 3 slides ONLY when all three slides have a separate strong payoff. Never make slide 2 or 3 a technical filler fact.
- Every used slide must answer: "Zašto bi neko ko ne zna ništa o patikama nastavio da čita?" If the answer is only technical knowledge, rewrite or reject.''')

s = s.replace(
'''- Each USED slide should contain 8-14 words total and MUST NOT exceed 18 words across headline_lines.''',
'''- COVER should normally contain 5-10 words; later used slides 6-12 words. Absolute maximum remains 18 words.
- The cover must reveal the strongest hook immediately. Reject covers that read like a textbook introduction or generic biography.
- Default to 1-2 slides. Approve 3 slides only if every slide contains a distinct wow fact worth stopping for on its own.
- Reject generic technical progression such as "Kobe asked for lighter shoes", "model introduced Flyknit", "technology improved cushioning" unless it is tied to an extraordinary verified record, money figure, famous event or controversy that a general audience would care about.''')

# Strengthen topic-interest requirements beyond merely using a famous name.
s = s.replace(
'''- The story must have a strong mass-interest hook. Prefer globally famous athletes, musicians, films, iconic models, records, scandals/myths with a factual correction, unusual inventions, extreme rarity, huge auction sales or surprising money.''',
'''- The story must have a strong mass-interest hook. A famous name ALONE is not enough. The angle itself must include at least one strong reason to click: extraordinary verified money, record, extreme rarity/quantity, famous controversy or myth, iconic film/music moment, unbelievable design story, or historic sports moment.
- Prefer stories where the hook can be expressed in ONE short sentence with a concrete payoff. Reject broad themes like "how an athlete influenced footwear" or "how a technology evolved".''')

s = s.replace(
'''- Reject weak niche angles centered on people a general audience is unlikely to know. The post needs an obvious mass-interest hook: famous person/model/event, extraordinary rarity, record, money, controversy/myth, invention or surprising cultural moment.''',
'''- Reject weak or broad angles even when they contain a famous person. A famous name is NOT sufficient by itself. The actual angle must contain a concrete mass-interest payoff: extraordinary money, record, extreme rarity/quantity, controversy/myth, famous film/music/sports moment or unbelievable invention/design story.
- Reject generic "influence", "evolution", "lighter shoe", "new material" and biography angles unless tied to a major verified event/number that a non-sneaker audience would immediately care about.''')

# Force shorter visible copy after all other normalization, preserving semantic accents.
s = s.replace(
'value.cover.headline_lines=normalizeHeadlineGroup(value.cover.headline_lines,3);',
'value.cover.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.cover.headline_lines,3),11);')
s = s.replace(
'value.slide2.headline_lines=normalizeHeadlineGroup(value.slide2.headline_lines,3);',
'value.slide2.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.slide2.headline_lines,3),12);')
s = s.replace(
'value.slide3.headline_lines=normalizeHeadlineGroup(value.slide3.headline_lines,3);',
'value.slide3.headline_lines=capHeadlineWords(normalizeHeadlineGroup(value.slide3.headline_lines,3),12);')

# Make generated images editorial scenes, not boring catalogue shoe photos.
needle = 'let rule=` EXACT SLIDE FACT TO ILLUSTRATE: ${fact}. The main visible subject must directly prove or explain this exact fact, not merely suggest the general topic.`;'
replacement = 'let rule=` EXACT SLIDE FACT TO ILLUSTRATE: ${fact}. The main visible subject must directly prove or explain this exact fact, not merely suggest the general topic. SCROLL-STOP VISUAL: create a dramatic editorial moment with action, tension, scale, famous-event context or a striking visual setup. NEVER use a generic clean catalogue/product shot as the whole scene. NEVER use a random anonymous crowd or random people unrelated to the fact. If a famous person or famous event is material to the slide, make that person/event the dominant story subject and keep the relevant sneaker clearly visible. Base image must contain NO readable text, prices, labels or typography; code adds all text.`;'
if needle in s:
    s = s.replace(needle, replacement, 1)
elif replacement not in s:
    raise SystemExit("Scroll-stop image policy anchor not found")

# Fresh-topic discovery must pass a tougher viral-interest test.
s = s.replace(
'''Before choosing, apply this test: would someone who does NOT follow sneaker culture still recognize the person/model/event OR immediately care because the number/story is extraordinary? If not, reject the topic and choose another.''',
'''Before choosing, apply TWO tests. (1) Would someone who does NOT follow sneaker culture understand why this is interesting in one second? (2) Can the cover be written as a 5-10 word hook containing a concrete payoff such as money, record, rarity, controversy/myth or famous event? If either answer is no, reject the topic and choose another. A famous athlete name by itself does NOT pass.''')

CONTENT.write_text(s, encoding="utf-8")
print("Scroll-stop policy applied: viral hooks, shorter copy, 1-2 slide default, cinematic fact-matched images.")
