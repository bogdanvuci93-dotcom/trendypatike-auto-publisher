from pathlib import Path

CONTENT = Path("src/content.mjs")
s = CONTENT.read_text(encoding="utf-8")

# Aim comfortably below the hard 18-word cap.
s = s.replace("normally 10-16 words total and NEVER more than 18 words total across headline_lines", "normally 8-14 words total and NEVER more than 18 words total across headline_lines")
s = s.replace("Each USED slide should contain 10-16 words total and MUST NOT exceed 18 words across headline_lines", "Each USED slide should contain 8-14 words total and MUST NOT exceed 18 words across headline_lines")

old = '''function normalizeHeadlineGroup(lines,maxLines){ const cleaned=(lines||[]).map(line=>({text:simplifyKidPhrase(line?.text),accent:line?.accent===true})).filter(line=>line.text); if(!cleaned.length)return [{text:"PATIKA IMA ZANIMLJIVU PRIČU",accent:false}]; return cleaned.slice(0,maxLines); }'''
new = '''function capHeadlineWords(lines,maxWords=18){
  let remaining=maxWords;
  const out=[];
  for(const line of lines||[]){
    if(remaining<=0)break;
    const words=simplifyKidPhrase(line?.text).split(/\\s+/).filter(Boolean);
    if(!words.length)continue;
    const kept=words.slice(0,remaining);
    remaining-=kept.length;
    out.push({text:kept.join(" "),accent:line?.accent===true});
  }
  const dangling=new Set(["sa","za","od","do","i","ili","pa","jer","koji","koja","koje","da","na","u","iz"]);
  while(out.length){
    const last=out[out.length-1];
    const words=last.text.split(/\\s+/).filter(Boolean);
    const tail=(words.at(-1)||"").toLowerCase().replace(/[^a-zčćšđž]/g,"");
    if(!dangling.has(tail))break;
    words.pop();
    if(words.length)last.text=words.join(" "); else out.pop();
  }
  return out;
}
function normalizeHeadlineGroup(lines,maxLines){ const cleaned=(lines||[]).map(line=>({text:simplifyKidPhrase(line?.text),accent:line?.accent===true})).filter(line=>line.text); if(!cleaned.length)return [{text:"PATIKA IMA ZANIMLJIVU PRIČU",accent:false}]; return capHeadlineWords(cleaned.slice(0,maxLines),18); }'''

if new not in s:
    if old not in s:
        raise SystemExit("Overflow guard patch failed: normalizeHeadlineGroup signature not found")
    s = s.replace(old, new, 1)

CONTENT.write_text(s, encoding="utf-8")
print("Visible-copy overflow guard applied: target 8-14 words, hard cap 18 without cutting words.")
