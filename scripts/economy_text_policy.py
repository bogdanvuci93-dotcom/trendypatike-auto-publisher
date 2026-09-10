from pathlib import Path
import re

INDEX = Path("src/index.mjs")
OPENAI = Path("src/openai.mjs")

s = INDEX.read_text(encoding="utf-8")
s = s.replace(
    'const allowMajorNews = attempt === 1 && process.env.SKIP_MAJOR_NEWS !== "true";',
    'const allowMajorNews = false;'
)
s, _ = re.subn(r"allowMajorNews\s*:\s*true", "allowMajorNews: false", s)
if 'const allowMajorNews = false;' not in s and 'allowMajorNews: false' not in s:
    raise SystemExit("Economy policy failed: could not disable major-news gate")
INDEX.write_text(s, encoding="utf-8")

o = OPENAI.read_text(encoding="utf-8")
o = o.replace('maxOutputTokens = 12000,', 'maxOutputTokens = 6000,')
o = re.sub(
    r'const normalizedMaxOutputTokens = Math\.max\(2000, Math\.min\(Number\(maxOutputTokens\) \|\| \d+, \d+\)\);',
    'const normalizedMaxOutputTokens = Math.max(2000, Math.min(Number(maxOutputTokens) || 6000, 8000));',
    o,
    count=1
)
o = re.sub(
    r'for \(let structuredAttempt = 1; structuredAttempt <= 2; structuredAttempt\+\+\) \{\n\s*const outputBudget = structuredAttempt === 1\n\s*\? normalizedMaxOutputTokens\n\s*: Math\.min\(24000, Math\.max\(normalizedMaxOutputTokens \+ 6000, Math\.ceil\(normalizedMaxOutputTokens \* 1\.5\)\)\);',
    'for (let structuredAttempt = 1; structuredAttempt <= 1; structuredAttempt++) {\n    const outputBudget = normalizedMaxOutputTokens;',
    o,
    count=1
)
o = o.replace(
'''      if (!retryable || structuredAttempt >= 2) throw err;
      console.warn(`[structured] ${schemaName} malformed/incomplete; retrying SAME request once with larger output budget.`);
      await sleep(3000);''',
'''      if (!retryable || structuredAttempt >= 1) throw err;
      throw err;'''
)

checks = [
    'maxOutputTokens = 6000,',
    'Number(maxOutputTokens) || 6000, 8000',
    'structuredAttempt <= 1'
]
missing = [x for x in checks if x not in o]
if missing:
    raise SystemExit(f"Economy policy failed OpenAI checks: {missing}")
OPENAI.write_text(o, encoding="utf-8")
print("Economy text policy applied: major-news gate off, one structured attempt only, 6k default / 8k hard cap.")
