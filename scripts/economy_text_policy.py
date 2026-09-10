from pathlib import Path

INDEX = Path("src/index.mjs")
OPENAI = Path("src/openai.mjs")

s = INDEX.read_text(encoding="utf-8")
s = s.replace(
    'const seed = await choosePriorityTopic(topics, state, { allowMajorNews: true });',
    'const seed = await choosePriorityTopic(topics, state, { allowMajorNews: false });'
)
INDEX.write_text(s, encoding="utf-8")

o = OPENAI.read_text(encoding="utf-8")
o = o.replace('maxOutputTokens = 12000,', 'maxOutputTokens = 6000,')
o = o.replace(
    'const normalizedMaxOutputTokens = Math.max(2000, Math.min(Number(maxOutputTokens) || 12000, 24000));',
    'const normalizedMaxOutputTokens = Math.max(2000, Math.min(Number(maxOutputTokens) || 6000, 8000));'
)
o = o.replace(
'''  let lastError = null;
  for (let structuredAttempt = 1; structuredAttempt <= 2; structuredAttempt++) {
    const outputBudget = structuredAttempt === 1
      ? normalizedMaxOutputTokens
      : Math.min(24000, Math.max(normalizedMaxOutputTokens + 6000, Math.ceil(normalizedMaxOutputTokens * 1.5)));''',
'''  let lastError = null;
  for (let structuredAttempt = 1; structuredAttempt <= 1; structuredAttempt++) {
    const outputBudget = normalizedMaxOutputTokens;'''
)
o = o.replace(
'''      if (!retryable || structuredAttempt >= 2) throw err;
      console.warn(`[structured] ${schemaName} malformed/incomplete; retrying SAME request once with larger output budget.`);
      await sleep(3000);''',
'''      if (!retryable || structuredAttempt >= 1) throw err;
      throw err;'''
)
OPENAI.write_text(o, encoding="utf-8")
print("Economy text policy applied: major-news gate off, one structured attempt only, 6k default / 8k hard cap.")
