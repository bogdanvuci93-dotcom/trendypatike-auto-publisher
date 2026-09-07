#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PROMPT_FILES = [ROOT / "src" / "openai.mjs", ROOT / "src" / "index.mjs"]
RENDER_FILES = [ROOT / "src" / "render.mjs"]

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
        for pat in [r"(const\s+SYSTEM_PROMPT\s*=\s*`[\s\S]*?)(`;)", r"(const\s+\w*PROMPT\w*\s*=\s*`[\s\S]*?)(`;)"]:
            ns, n = re.subn(pat, r"\1\n\n${DETAIL_COPY_POLICY}\2", s, count=1)
            if n:
                s = ns
                changed = True
                break
        if not changed:
            s = s.replace("Return valid JSON", "${DETAIL_COPY_POLICY}\n\nReturn valid JSON", 1)
    s = re.sub(r"target\s+8[-–]14\s+words,\s*hard\s+cap\s+18", "target 12-24 words; complete thought has priority over a hard cap", s, flags=re.I)
    s = re.sub(r"8[-–]14\s+words", "12-24 words when needed", s, flags=re.I)
    path.write_text(s, encoding="utf-8")

for path in RENDER_FILES:
    if not path.exists():
        continue
    s = path.read_text(encoding="utf-8")
    s = re.sub(r"Math\.max\((2[4-9]|3[0-2]),", "Math.max(20,", s)
    s = re.sub(r"minFontSize\s*:\s*(2[4-9]|3[0-2])", "minFontSize: 20", s)
    path.write_text(s, encoding="utf-8")

print("Detailed complete-thought copy policy applied: finish every sentence; compact before cutting; smaller font allowed when needed.")
