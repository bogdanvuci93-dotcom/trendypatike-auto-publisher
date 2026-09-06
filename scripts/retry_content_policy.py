from pathlib import Path
import re

index_path = Path('src/index.mjs')
content_path = Path('src/content.mjs')

index = index_path.read_text(encoding='utf-8')
content = content_path.read_text(encoding='utf-8')

new_build = r'''async function buildNewPost({ topics, state, aiTextAvailable }) {
  if (cfg.dryRun) {
    console.log("[dry-run] Using verified emergency content and local visuals only.");
    return loadEmergencyFallback(state);
  }
  if (!aiTextAvailable) return loadEmergencyFallback(state);

  let lastContentError = null;
  const maxAttempts = Math.max(1, Number(cfg.maxTopicAttempts) || 1);
  const workingState = {
    ...state,
    posted: [...(state.posted || [])]
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let seed = null;
    try {
      seed = await choosePriorityTopic(topics, workingState, { allowMajorNews: attempt === 1 });
      if (isDuplicateTopic(seed, state)) {
        throw new Error(`Selected topic was already used: ${seed.topic}`);
      }

      console.log(`[${attempt}/${maxAttempts}] Researching: ${seed.topic}`);
      const candidatePost = sanitizeVisiblePost(await researchWriteVerify(seed));
      if (isDuplicateTopic({ id: seed.id, topic: candidatePost.topic_title }, state)) {
        throw new Error(`Generated topic overlaps a previously posted topic: ${candidatePost.topic_title}`);
      }
      return { seed, post: candidatePost };
    } catch (err) {
      lastContentError = err;

      if (isTopicRejectedError(err)) {
        console.warn(`[retry-topic] Attempt ${attempt}/${maxAttempts} rejected by content/fact-check: ${err.message}`);
        if (seed) {
          workingState.posted.push({
            topic_id: seed.id,
            seed_topic: seed.topic,
            topic_title: seed.topic
          });
        }
        if (attempt < maxAttempts) continue;
      } else {
        console.warn(`[fallback] Dynamic research had a technical/system failure: ${err.message}`);
      }
      break;
    }
  }

  try {
    return await loadEmergencyFallback(state);
  } catch (fallbackErr) {
    throw new Error(
      `Dynamic content failed after ${maxAttempts} topic attempt(s) (${lastContentError?.message || "unknown"}) and no unused verified fallback remained (${fallbackErr.message})`
    );
  }
}'''

index, count = re.subn(
    r'async function buildNewPost\(\{ topics, state, aiTextAvailable \}\) \{.*?\n\}\n\nasync function persistPublishedState',
    new_build + '\n\nasync function persistPublishedState',
    index,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('Could not patch buildNewPost exactly once')

repair_fn = r'''function repairVisibleText(value=""){
  let text=cleanText(value)
    .replace(/^KAKO\s+TO\s+RADI\s*[:,-]?\s*/i,"")
    .replace(/^ZAŠTO\s+JE\s+TO\s+VAŽNO\s*[:,-]?\s*/i,"");

  text=text.replace(
    /\b([A-ZČĆŠĐŽ0-9-]{3,})\s+(KARBONSKA|KARBONSKI|KARBONSKO)\s+\1\b/gi,
    "$2 $1"
  );
  return cleanText(text);
}
'''

if 'function repairVisibleText(value="")' not in content:
    marker = 'function ensureSentence(value="")'
    pos = content.find(marker)
    if pos < 0:
        raise SystemExit('Could not find ensureSentence marker')
    content = content[:pos] + repair_fn + content[pos:]

# Other policy scripts may rewrite normalizeHeadlineGroup before this script runs.
# Patch only the text normalizer inside that function, regardless of spacing or other transforms.
m = re.search(r'function\s+normalizeHeadlineGroup\s*\(lines\s*,\s*maxLines\s*\)\s*\{(?P<body>.*?)\}', content, flags=re.S)
if not m:
    raise SystemExit('Could not find normalizeHeadlineGroup')

block = m.group(0)
if 'repairVisibleText(line?.text)' not in block:
    patched_block, replacements = re.subn(
        r'(text\s*:\s*)(?:cleanText|simplifyKidPhrase|normalizeMoneyNotation)\s*\(\s*line\?\.text\s*\)',
        r'\1repairVisibleText(line?.text)',
        block,
        count=1,
    )
    if replacements != 1:
        # Last-resort: replace the first line?.text expression used for text field.
        patched_block, replacements = re.subn(
            r'(text\s*:\s*)[^,}\n]*line\?\.text[^,}\n]*',
            r'\1repairVisibleText(line?.text)',
            block,
            count=1,
        )
    if replacements != 1:
        raise SystemExit('Could not patch normalizeHeadlineGroup text normalizer')
    content = content[:m.start()] + patched_block + content[m.end():]

index_path.write_text(index, encoding='utf-8')
content_path.write_text(content, encoding='utf-8')
print('Resilient topic retry + visible-copy repair policy applied.')
