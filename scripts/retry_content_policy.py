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
          // Mark only inside this run, so the next attempt cannot select the same topic again.
          workingState.posted.push({
            topic_id: seed.id,
            seed_topic: seed.topic,
            topic_title: seed.topic
          });
        }
        if (attempt < maxAttempts) continue;
      } else {
        // Technical/account/network errors should not trigger extra paid research calls.
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

# Repair a few harmless presentation failures deterministically before the strict kid-copy gate.
repair_fn = r'''function repairVisibleText(value=""){
  let text=cleanText(value)
    .replace(/^KAKO\s+TO\s+RADI\s*[:,-]?\s*/i,"")
    .replace(/^ZAŠTO\s+JE\s+TO\s+VAŽNO\s*[:,-]?\s*/i,"");

  // Example: "FLYPLATE KARBONSKA FLYPLATE" -> "KARBONSKA FLYPLATE".
  // This only removes a duplicated technology/model token around a simple descriptor;
  // it does not invent or change any factual claim.
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

old_normalize = 'function normalizeHeadlineGroup(lines,maxLines){ const cleaned=(lines||[]).map(line=>({text:cleanText(line?.text),accent:line?.accent===true})).filter(line=>line.text);'
new_normalize = 'function normalizeHeadlineGroup(lines,maxLines){ const cleaned=(lines||[]).map(line=>({text:repairVisibleText(line?.text),accent:line?.accent===true})).filter(line=>line.text);'
if old_normalize in content:
    content = content.replace(old_normalize, new_normalize, 1)
elif new_normalize not in content:
    raise SystemExit('Could not patch normalizeHeadlineGroup')

index_path.write_text(index, encoding='utf-8')
content_path.write_text(content, encoding='utf-8')
print('Resilient topic retry + visible-copy repair policy applied.')
