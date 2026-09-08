#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PROMPT_FILES = [ROOT / "src" / "openai.mjs", ROOT / "src" / "index.mjs", ROOT / "src" / "content.mjs"]
RENDER_FILE = ROOT / "src" / "render.mjs"
CONTENT_FILE = ROOT / "src" / "content.mjs"

RULES = r'''
VISIBLE COPY POLICY — COMPLETE THOUGHTS FIRST:
- Every slide must contain a complete, self-contained thought in natural Serbian.
- Never end a slide on a bare verb, unfinished clause, dangling conjunction, colon, dash, or setup without its consequence/explanation.
- Bad: "1996. je registrovao". Good: "1996. je registrovao patent za sistem koji je kasnije postao osnova tog modela."
- Prefer concrete detail: when, who, what happened, why it mattered, and the consequence — but only when supported by the verified facts.
- Do not pad. If the full thought is too long, rewrite it more compactly while preserving the complete meaning.
- Target roughly 12–24 words for body copy when needed; a complete sentence is more important than a rigid word target.
- Headlines can stay short, but body text must not be a fragment.
- Before returning JSON, silently check each visible text field: does it make sense if read alone? If not, rewrite it.
'''.strip()

for path in PROMPT_FILES:
    if not path.exists():
        continue
    s = path.read_text(encoding="utf-8")
    marker = "VISIBLE COPY POLICY — COMPLETE THOUGHTS FIRST:"
    if marker not in s:
        insert = "\nconst DETAIL_COPY_POLICY = `" + RULES.replace("`", "\\`") + "`;\n"
        import_block = re.match(r"(?s)(?:import .*?;\s*)+", s)
        pos = import_block.end() if import_block else 0
        s = s[:pos] + insert + s[pos:]
        changed = False
        for pat in [
            r"(const\s+SYSTEM_PROMPT\s*=\s*`[\s\S]*?)(`;)",
            r"(const\s+\w*PROMPT\w*\s*=\s*`[\s\S]*?)(`;)"
        ]:
            ns, n = re.subn(pat, r"\1\n\n${DETAIL_COPY_POLICY}\2", s, count=1)
            if n:
                s = ns
                changed = True
                break
        if not changed:
            s = s.replace("Return valid JSON", "${DETAIL_COPY_POLICY}\n\nReturn valid JSON", 1)

    s = s.replace("normally 8-14 words total and NEVER more than 18 words total across headline_lines",
                  "normally 12-24 words total when needed; NEVER cut a sentence just to hit a word limit")
    s = s.replace("Each USED slide should contain 8-14 words total and MUST NOT exceed 18 words across headline_lines",
                  "Each USED slide should usually contain 12-24 words; complete the thought and shorten naturally instead of truncating")
    s = re.sub(r"8[-–]14\s+words", "12-24 words when needed", s, flags=re.I)
    s = re.sub(r"hard\s+cap\s+18", "no hard truncation; complete thought first", s, flags=re.I)
    path.write_text(s, encoding="utf-8")

if CONTENT_FILE.exists():
    s = CONTENT_FILE.read_text(encoding="utf-8")

    # IMPORTANT: only replace capHeadlineWords itself. The previous regex stretched
    # through normalizeMoneyNotation/isImportantNumberToken/semanticAccentSegments
    # and deleted those helpers, causing a runtime ReferenceError after preflight.
    pattern_with_semantic_helpers = (
        r"function capHeadlineWords\(lines,maxWords=18\)\{[\s\S]*?\n\}"
        r"\nfunction normalizeMoneyNotation"
    )
    replacement_with_semantic_helpers = '''function capHeadlineWords(lines,maxWords=24){
  // COMPLETE-THOUGHT POLICY: never chop text mid-sentence to satisfy a word cap.
  // Generation/repair is responsible for concise copy; rendering will shrink font if needed.
  return (lines||[])
    .map(line=>({text:simplifyKidPhrase(line?.text),accent:line?.accent===true}))
    .filter(line=>line.text);
}
function normalizeMoneyNotation'''
    s, n = re.subn(pattern_with_semantic_helpers, replacement_with_semantic_helpers, s, count=1)

    if n == 0:
        # Fallback for versions where semantic helpers have not yet been installed.
        pattern_plain = r"function capHeadlineWords\(lines,maxWords=18\)\{[\s\S]*?\n\}\nfunction normalizeHeadlineGroup"
        replacement_plain = '''function capHeadlineWords(lines,maxWords=24){
  // COMPLETE-THOUGHT POLICY: never chop text mid-sentence to satisfy a word cap.
  return (lines||[])
    .map(line=>({text:simplifyKidPhrase(line?.text),accent:line?.accent===true}))
    .filter(line=>line.text);
}
function normalizeHeadlineGroup'''
        s, n = re.subn(pattern_plain, replacement_plain, s, count=1)

    if n == 0:
        s = s.replace('const kept=words.slice(0,remaining);', 'const kept=words;')
        s = s.replace('remaining-=kept.length;', 'remaining=Math.max(0,remaining-kept.length);')

    s = s.replace('return capHeadlineWords(cleaned.slice(0,maxLines),18);',
                  'return capHeadlineWords(cleaned.slice(0,maxLines),24);')

    # If semantic accents were present before this policy, they MUST still be present.
    if "normalizeMoneyNotation" in s and "semanticAccentSegments" not in s:
        raise SystemExit("Detail-copy policy would remove semanticAccentSegments; refusing to continue")

    CONTENT_FILE.write_text(s, encoding="utf-8")

if RENDER_FILE.exists():
    s = RENDER_FILE.read_text(encoding="utf-8")
    s = s.replace('preferred: 126,\n    min: 62,', 'preferred: 118,\n    min: 44,')
    s = s.replace('maxLines: 6,', 'maxLines: 7,')
    RENDER_FILE.write_text(s, encoding="utf-8")

print("Detailed complete-thought policy applied safely: semantic helpers preserved; no mid-sentence truncation.")
