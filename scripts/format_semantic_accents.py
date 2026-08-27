from pathlib import Path

CONTENT = Path("src/content.mjs")
s = CONTENT.read_text(encoding="utf-8")

# Tighten writer/verifier instructions so the model produces the desired format before deterministic cleanup.
s = s.replace(
'''- Use only 1 or 2 accented phrases per slide whenever possible. Each accented phrase should normally be 1-4 words.
- Never color filler words, connectors or a whole long sentence.''',
'''- NUMBERS ARE SEMANTIC ACCENTS: every important year, quantity, percentage, record and price shown in visible copy MUST be isolated into its own short headline_lines segment with accent=true so it renders green.
- Money MUST use a currency symbol/code, never a Serbian currency word: write $289.000, €12.500 or 7.990 RSD, never 289.000 dolara, 12.500 eura/evra or 7.990 dinara.
- Use only 1 or 2 additional accented key phrases per slide whenever possible, besides important number/price segments. Each non-number accented phrase should normally be 1-4 words.
- Accent only meaningful model/person/record/technology words. Never color filler words, connectors or a whole long sentence.''')

s = s.replace(
'''- Prefer 1-2 accented phrases per used slide, normally 1-4 words each. Never accent filler words or a random trailing chunk.''',
'''- Every important visible number, year, quantity, percentage, record or price MUST be its own accent=true segment.
- Money format is strict: $289.000, €12.500 or 7.990 RSD. Rewrite any form such as 289.000 dolara/USD, 12.500 eura/evra/EUR or 7.990 dinara into that format.
- Besides numbers, prefer only 1-2 accented key phrases per used slide, normally 1-4 words each. Accent only meaningful model/person/record/technology words, never filler or a random trailing chunk.''')

anchor = '''function normalizeHeadlineGroup(lines,maxLines){ const cleaned=(lines||[]).map(line=>({text:simplifyKidPhrase(line?.text),accent:line?.accent===true})).filter(line=>line.text); if(!cleaned.length)return [{text:"PATIKA IMA ZANIMLJIVU PRIČU",accent:false}]; return capHeadlineWords(cleaned.slice(0,maxLines),18); }'''
replacement = r'''function normalizeMoneyNotation(value=""){
  return simplifyKidPhrase(value)
    .replace(/\b(\d[\d.,]*)(\s+(?:miliona?|milijarde?))?\s+(?:američkih\s+)?(?:dolara?|usd)\b/gi,(_,n,m="")=>`$${n}${m?` ${m.trim().toUpperCase()}`:""}`)
    .replace(/\b(\d[\d.,]*)(\s+(?:miliona?|milijarde?))?\s+(?:eura?|evra?|eur)\b/gi,(_,n,m="")=>`€${n}${m?` ${m.trim().toUpperCase()}`:""}`)
    .replace(/\b(\d[\d.,]*)(\s+(?:miliona?|milijarde?))?\s+(?:dinara?|rsd)\b/gi,(_,n,m="")=>`${n}${m?` ${m.trim().toUpperCase()}`:""} RSD`)
    .replace(/\bUSD\s*(\d[\d.,]*)\b/gi,"$$$1")
    .replace(/\bEUR\s*(\d[\d.,]*)\b/gi,"€$1");
}
function isImportantNumberToken(word=""){
  return /^(?:[$€]?\d|\d.*(?:%|RSD)$)/i.test(word) || /\d/.test(word);
}
function semanticAccentSegments(lines,maxWords=18){
  const source=capHeadlineWords((lines||[]).map(line=>({text:normalizeMoneyNotation(line?.text),accent:line?.accent===true})),maxWords);
  const out=[];
  const filler=new Set(["JE","SU","SE","I","ILI","ZA","SA","OD","DO","NA","U","IZ","PA","DA","KOJI","KOJA","KOJE"]);
  for(const line of source){
    const words=String(line.text||"").split(/\s+/).filter(Boolean);
    let buffer=[];
    const flush=(accent)=>{
      if(!buffer.length)return;
      const text=buffer.join(" ");
      const count=buffer.length;
      const meaningful=buffer.some(w=>!filler.has(w.toUpperCase().replace(/[^A-ZČĆŠĐŽ0-9$€]/g,"")));
      out.push({text,accent:accent===true && count<=4 && meaningful});
      buffer=[];
    };
    for(let i=0;i<words.length;i++){
      const word=words[i];
      if(isImportantNumberToken(word)){
        flush(line.accent);
        let numberText=word;
        const next=(words[i+1]||"").toUpperCase().replace(/[^A-ZČĆŠĐŽ]/g,"");
        if(/^(MILIONA?|MILIJARDE?|PARA|PAROVA|KOMADA|GODINA|RSD)$/.test(next)){
          numberText += ` ${words[++i]}`;
        }
        out.push({text:numberText,accent:true});
      }else{
        buffer.push(word);
      }
    }
    flush(line.accent);
  }
  return out.length?out:[{text:"PATIKA IMA ZANIMLJIVU PRIČU",accent:false}];
}
function normalizeHeadlineGroup(lines,maxLines){
  const cleaned=(lines||[]).map(line=>({text:normalizeMoneyNotation(line?.text),accent:line?.accent===true})).filter(line=>line.text);
  if(!cleaned.length)return [{text:"PATIKA IMA ZANIMLJIVU PRIČU",accent:false}];
  return semanticAccentSegments(cleaned.slice(0,maxLines),18);
}'''

if replacement not in s:
    if anchor not in s:
        raise SystemExit("Semantic accent patch failed: normalizeHeadlineGroup anchor not found")
    s = s.replace(anchor, replacement, 1)

# Apply currency notation to supporting/caption text too, without forcing green there.
s = s.replace('value.cover.subheadline=ensureSentence(value.cover.subheadline);', 'value.cover.subheadline=ensureSentence(normalizeMoneyNotation(value.cover.subheadline));')
s = s.replace('text:ensureSentence(fact.text)', 'text:ensureSentence(normalizeMoneyNotation(fact.text))')
s = s.replace('value.caption=normalizeCaption(value.caption);', 'value.caption=normalizeCaption(normalizeMoneyNotation(value.caption));')

CONTENT.write_text(s, encoding="utf-8")
print("Semantic accents applied: important numbers green, money uses $ / € / RSD notation.")
