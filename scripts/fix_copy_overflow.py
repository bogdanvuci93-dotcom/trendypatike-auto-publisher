from pathlib import Path

CONTENT = Path("src/content.mjs")
s = CONTENT.read_text(encoding="utf-8")

# Detailed story copy: keep hooks readable, but never destroy meaning just to stay short.
s = s.replace("normally 10-16 words total and NEVER more than 18 words total across headline_lines", "normally 18-30 words total and NEVER more than 40 words total across headline_lines")
s = s.replace("normally 8-14 words total and NEVER more than 18 words total across headline_lines", "normally 18-30 words total and NEVER more than 40 words total across headline_lines")
s = s.replace("Each USED slide should contain 10-16 words total and MUST NOT exceed 18 words across headline_lines", "Each USED slide should normally contain 18-30 words and MUST NOT exceed 40 words across headline_lines. Use fewer only for a genuinely complete punchy hook.")
s = s.replace("Each USED slide should contain 8-14 words total and MUST NOT exceed 18 words across headline_lines", "Each USED slide should normally contain 18-30 words and MUST NOT exceed 40 words across headline_lines. Use fewer only for a genuinely complete punchy hook.")

old = '''function normalizeHeadlineGroup(lines,maxLines){ const cleaned=(lines||[]).map(line=>({text:simplifyKidPhrase(line?.text),accent:line?.accent===true})).filter(line=>line.text); if(!cleaned.length)return [{text:"PATIKA IMA ZANIMLJIVU PRIČU",accent:false}]; return cleaned.slice(0,maxLines); }'''
new = '''function dedupeAdjacentWords(text=""){
  const words=String(text).split(/\\s+/).filter(Boolean);
  const out=[];
  for(const word of words){
    const norm=word.toLowerCase().replace(/[^a-z0-9čćšđž]/g,"");
    const prev=(out.at(-1)||"").toLowerCase().replace(/[^a-z0-9čćšđž]/g,"");
    if(norm && norm===prev)continue;
    out.push(word);
  }
  return out.join(" ");
}
function capHeadlineWords(lines,maxWords=40){
  let remaining=maxWords;
  const out=[];
  for(const line of lines||[]){
    if(remaining<=0)break;
    const words=dedupeAdjacentWords(simplifyKidPhrase(line?.text)).split(/\\s+/).filter(Boolean);
    if(!words.length)continue;
    const kept=words.slice(0,remaining);
    remaining-=kept.length;
    out.push({text:kept.join(" "),accent:line?.accent===true});
  }
  const dangling=new Set(["sa","za","od","do","i","ili","pa","jer","koji","koja","koje","da","na","u","iz","ali","dok","ako","nego","već","preko"]);
  const incompleteVerbs=new Set(["registrovao","registrovala","kupio","kupila","prodao","prodala","osnovao","osnovala","napravio","napravila","predstavio","predstavila","lansirao","lansirala","postao","postala","dobio","dobila","osvojio","osvojila"]);
  while(out.length){
    const last=out[out.length-1];
    const words=last.text.split(/\\s+/).filter(Boolean);
    const tail=(words.at(-1)||"").toLowerCase().replace(/[^a-zčćšđž]/g,"");
    if(!dangling.has(tail) && !incompleteVerbs.has(tail))break;
    words.pop();
    if(words.length)last.text=words.join(" "); else out.pop();
  }
  return out;
}
function normalizeHeadlineGroup(lines,maxLines){ const cleaned=(lines||[]).map(line=>({text:dedupeAdjacentWords(simplifyKidPhrase(line?.text)),accent:line?.accent===true})).filter(line=>line.text); if(!cleaned.length)return [{text:"PATIKA IMA ZANIMLJIVU PRIČU",accent:false}]; return capHeadlineWords(cleaned.slice(0,maxLines),40); }'''

if new not in s:
    if old in s:
        s = s.replace(old, new, 1)
    else:
        # Upgrade the older 18-word patched implementation in place.
        start = s.find("function capHeadlineWords(")
        end = s.find("function normalizeHeadlineGroup", start)
        norm_end = s.find("}", s.find("function normalizeHeadlineGroup", start)) + 1 if start >= 0 else -1
        if start < 0 or end < 0 or norm_end <= end:
            raise SystemExit("Overflow guard patch failed: headline helpers not found")
        s = s[:start] + new + s[norm_end:]

# Any stale deterministic caps should respect the 40-word hard ceiling.
s = s.replace("capHeadlineWords(cleaned.slice(0,maxLines),18)", "capHeadlineWords(cleaned.slice(0,maxLines),40)")

CONTENT.write_text(s, encoding="utf-8")
print("Visible-copy guard applied: detailed 18-30 word target, 40-word hard cap, duplicate-word and dangling-ending protection.")
