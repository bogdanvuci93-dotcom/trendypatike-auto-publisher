import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { cfg } from "./config.mjs";
import { generateImage } from "./openai.mjs";
import { commitAndPush } from "./git.mjs";

const W = 1080;
const H = 1350;
const GREEN = "#037361";
const WHITE = "#F7F7F5";
const FONT = "DejaVu Sans Condensed";

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clean(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "")
    .trim();
}

function wrap(text, maxChars = 28) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function headlineMetrics(lines, base = 124) {
  const longest = Math.max(1, ...lines.map(line => String(line.text || "").length));
  let size = base;
  if (longest > 34) size -= 20;
  else if (longest > 29) size -= 12;
  if (lines.length >= 4) size -= 10;
  return { size: Math.max(78, size), gap: Math.max(90, size + 7) };
}

function headlineSvg(lines, { x = 66, y = 300, base = 124 } = {}) {
  const { size, gap } = headlineMetrics(lines, base);
  return lines.map((line, i) => {
    const fill = line.accent ? GREEN : WHITE;
    return `<text x="${x}" y="${y + i * gap}" font-family="${FONT}" font-size="${size}" font-weight="900" fill="${fill}" letter-spacing="-2.2">${esc(String(line.text || "").toUpperCase())}</text>`;
  }).join("\n");
}

function statementLines(text, maxLines = 5) {
  for (const width of [21, 24, 27, 30, 33, 36]) {
    const lines = wrap(text, width);
    if (lines.length <= maxLines) return lines;
  }
  return wrap(text, 38).slice(0, maxLines);
}

function statementSvg(text, {
  x = 66,
  y = 590,
  maxLines = 5,
  accentLine = 1,
  tag = ""
} = {}) {
  const lines = statementLines(text, maxLines);
  let size = 69;
  if (lines.length <= 2) size = 83;
  else if (lines.length === 3) size = 76;
  else if (lines.length === 4) size = 68;
  else size = 60;
  const gap = size + 5;
  const accent = Math.min(Math.max(accentLine, 0), Math.max(0, lines.length - 1));

  const tagSvg = tag
    ? `<text x="${x}" y="${y - 54}" font-family="${FONT}" font-size="29" font-weight="900" fill="${GREEN}" letter-spacing="2">${esc(String(tag).toUpperCase())}</text>`
    : "";

  const body = lines.map((line, i) => {
    const fill = i === accent ? GREEN : WHITE;
    return `<text x="${x}" y="${y + i * gap}" font-family="${FONT}" font-size="${size}" font-weight="900" fill="${fill}" letter-spacing="-1.5">${esc(line.toUpperCase())}</text>`;
  }).join("\n");

  return `${tagSvg}\n${body}`;
}

function frameSvg(slideNo) {
  const n = String(slideNo).padStart(2, "0");
  return `
  <defs>
    <linearGradient id="leftShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#020403" stop-opacity="0.86"/>
      <stop offset="52%" stop-color="#020403" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#020403" stop-opacity="0.03"/>
    </linearGradient>
    <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="58%" stop-color="#000" stop-opacity="0"/>
      <stop offset="82%" stop-color="#000" stop-opacity="0.48"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.96"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#leftShade)"/>
  <rect width="${W}" height="${H}" fill="url(#bottomShade)"/>
  <rect x="15" y="15" width="${W - 30}" height="${H - 30}" fill="none" stroke="${GREEN}" stroke-width="4"/>
  <line x1="68" y1="137" x2="1010" y2="137" stroke="${GREEN}" stroke-width="2"/>
  <polyline points="510,137 522,149 535,137" fill="none" stroke="${GREEN}" stroke-width="2"/>
  <text x="147" y="105" font-family="${FONT}" font-size="29" font-weight="900" fill="${WHITE}" letter-spacing="3">TRENDYPATIKE</text>
  <text x="918" y="105" font-family="${FONT}" font-size="23" font-weight="900" fill="${GREEN}">${n}</text>
  <text x="952" y="105" font-family="${FONT}" font-size="23" font-weight="900" fill="${WHITE}">/03</text>
  <text x="72" y="1292" font-family="${FONT}" font-size="23" font-weight="800" fill="${WHITE}">${esc(cfg.brandSite)}</text>
  <line x1="338" y1="1283" x2="873" y2="1283" stroke="${GREEN}" stroke-width="2"/>
  <polyline points="520,1283 532,1295 545,1283" fill="none" stroke="${GREEN}" stroke-width="2"/>
  `;
}

function coverOverlay(post) {
  const sub = statementLines(post.cover.subheadline, 3);
  let subSize = 54;
  if (sub.length === 2) subSize = 50;
  if (sub.length === 3) subSize = 44;
  const subGap = subSize + 5;
  const subY = 700;

  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${frameSvg(1)}
    ${headlineSvg(post.cover.headline_lines, { y: 300, base: 128 })}
    ${sub.map((line, i) => `<text x="68" y="${subY + i * subGap}" font-family="${FONT}" font-size="${subSize}" font-weight="900" fill="${i === 1 || (sub.length === 1 && i === 0) ? GREEN : WHITE}" letter-spacing="-1">${esc(line.toUpperCase())}</text>`).join("\n")}
  </svg>`;
}

function factsOverlay(post) {
  const first = post.slide2.facts[0];
  const second = post.slide2.facts[1];
  const statement = `${clean(first.text)}. ${clean(second.text)}.`;

  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${frameSvg(2)}
    ${headlineSvg(post.slide2.headline_lines, { y: 265, base: 102 })}
    ${statementSvg(statement, { y: 610, maxLines: 5, accentLine: 1, tag: first.tag })}
  </svg>`;
}

function impactOverlay(post) {
  const first = post.slide3.facts[0];
  const second = post.slide3.facts[1];
  const statement = `${clean(first.text)}. ${clean(second.text)}.`;
  const q = wrap(post.slide3.question, 27).slice(0, 2);

  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${frameSvg(3)}
    ${headlineSvg(post.slide3.headline_lines, { y: 265, base: 102 })}
    ${statementSvg(statement, { y: 590, maxLines: 5, accentLine: 1, tag: first.tag })}
    <circle cx="92" cy="1142" r="25" fill="none" stroke="${GREEN}" stroke-width="4"/>
    <text x="84" y="1154" font-family="${FONT}" font-size="31" font-weight="900" fill="${GREEN}">?</text>
    ${q.map((line, i) => `<text x="137" y="${1142 + i * 39}" font-family="${FONT}" font-size="35" font-weight="900" fill="${GREEN}" letter-spacing="-0.7">${esc(line.toUpperCase())}</text>`).join("\n")}
  </svg>`;
}

async function logoBuffers() {
  const logo = path.resolve("assets/logo-mark-white.png");
  const white = await sharp(logo).resize({ width: 56 }).png().toBuffer();
  const green = await sharp(logo).resize({ width: 57 }).tint(GREEN).png().toBuffer();
  return { white, green };
}

function finalPrompt(base, slideIndex) {
  const composition = slideIndex === 0
    ? "Keep the main sneaker or person in the LOWER-RIGHT or lower-center area. Leave the upper-left and middle-left areas dark and clean for very large editorial headline typography."
    : "Keep the main historical subject, sneaker or person mainly on the RIGHT and LOWER half. Leave the upper-left and center-left areas dark, clean and uncluttered for large editorial text.";
  return `${base}\n\n${composition}\n4:5 vertical portrait. Premium dark sneaker magazine editorial photography. Cinematic, believable, rich contrast, realistic materials, deep blacks and restrained color. No text, captions, watermark, frame or TrendyPatike branding. Avoid malformed shoes, duplicated limbs, random lettering and fake signatures. Editorial culture/history visual, not an endorsement advertisement.`;
}

function neutralSafePrompt(slideIndex) {
  const scene = slideIndex === 0
    ? "A single unbranded retro athletic sneaker positioned in the lower-right of a dark cinematic studio scene."
    : slideIndex === 1
      ? "An unbranded retro sneaker and anonymous historical sports workshop atmosphere, subject mostly on the lower-right."
      : "An unbranded retro sneaker with an anonymous sports-culture atmosphere, subject mostly on the lower-right.";
  return `${scene} 4:5 vertical portrait. Premium dark sneaker magazine photography. Deep black and charcoal background, realistic materials, cinematic lighting, clean dark negative space on the upper-left and center-left. No recognizable celebrity, brand logo, trademark, text, letters, watermark, frame or signature.`;
}

function localFallbackSvg(slideIndex) {
  const shift = slideIndex * 24;
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="78%" cy="64%" r="52%">
        <stop offset="0%" stop-color="${GREEN}" stop-opacity="0.28"/>
        <stop offset="55%" stop-color="#17302c" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#050706" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="shoe" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#727775"/>
        <stop offset="55%" stop-color="#242927"/>
        <stop offset="100%" stop-color="#0b0e0d"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#050706"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <circle cx="840" cy="${680 + shift}" r="180" fill="none" stroke="${GREEN}" stroke-opacity="0.08" stroke-width="2"/>
    <path d="M585 ${830 + shift} C670 ${760 + shift}, 738 ${706 + shift}, 790 ${650 + shift} L880 ${695 + shift} C916 ${714 + shift}, 942 ${760 + shift}, 965 ${813 + shift} L1015 ${847 + shift} C1038 ${863 + shift}, 1027 ${901 + shift}, 992 ${913 + shift} C884 ${946 + shift}, 738 ${949 + shift}, 625 ${925 + shift} C583 ${916 + shift}, 558 ${882 + shift}, 568 ${850 + shift} Z" fill="url(#shoe)" stroke="#aeb5b2" stroke-opacity="0.30" stroke-width="3"/>
    <path d="M646 ${850 + shift} C748 ${865 + shift}, 852 ${865 + shift}, 975 ${846 + shift}" fill="none" stroke="${GREEN}" stroke-opacity="0.58" stroke-width="8" stroke-linecap="round"/>
    <ellipse cx="820" cy="${966 + shift}" rx="245" ry="40" fill="#000" fill-opacity="0.65"/>
  </svg>`;
}

async function localFallbackBuffer(slideIndex) {
  return sharp(Buffer.from(localFallbackSvg(slideIndex))).png().toBuffer();
}

async function usableImage(file, { width = null, height = null, format = null, minSize = 1000 } = {}) {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size < minSize) return false;
    const meta = await sharp(file).metadata();
    if (!meta.width || !meta.height) return false;
    if (width && meta.width !== width) return false;
    if (height && meta.height !== height) return false;
    if (format && ![].concat(format).includes(meta.format)) return false;
    return true;
  } catch {
    return false;
  }
}

async function checkpointBestEffort(files, message) {
  if (process.env.GITHUB_ACTIONS !== "true" || cfg.dryRun) return;
  try {
    commitAndPush(files, message, 6);
  } catch (err) {
    console.warn(`[checkpoint] ${message} could not be pushed yet: ${err.message}`);
  }
}

async function renderSlide(source, overlay, logos, outPath) {
  await sharp(source)
    .resize(W, H, { fit: "cover", position: "attention" })
    .composite([
      { input: Buffer.from(overlay), left: 0, top: 0 },
      { input: logos.white, left: 67, top: 62 },
      { input: logos.green, left: 932, top: 1230 }
    ])
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toFile(outPath);

  if (!(await usableImage(outPath, { width: W, height: H, format: ["jpeg", "jpg"], minSize: 10000 }))) {
    throw new Error(`Rendered slide failed integrity check: ${outPath}`);
  }
}

export async function generateAndRender(post, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const logos = await logoBuffers();
  const overlays = [coverOverlay(post), factsOverlay(post), impactOverlay(post)];
  const outputs = [];

  for (let i = 0; i < 3; i++) {
    const number = String(i + 1).padStart(2, "0");
    const sourcePath = path.join(outputDir, `${number}-source.png`);
    const outPath = path.join(outputDir, `${number}.jpg`);

    if (await usableImage(outPath, { width: W, height: H, format: ["jpeg", "jpg"], minSize: 10000 })) {
      console.log(`[resume] Reusing rendered slide ${i + 1}/3.`);
      outputs.push(outPath);
      continue;
    }

    if (!(await usableImage(sourcePath, { format: "png", minSize: 1000 }))) {
      let imageBuffer;

      if (post.force_local_images) {
        console.log(`[image] Emergency post slide ${i + 1}/3 uses zero-cost local visual by design.`);
        imageBuffer = await localFallbackBuffer(i);
      } else {
        const primaryPrompt = finalPrompt(post.image_prompts[i], i);
        const fallbackPrompt = `${primaryPrompt}\nIf a named public figure or recognizable branding is difficult to depict, replace it with an anonymous era-appropriate athlete silhouette and an unlabeled sneaker while preserving the editorial mood.`;
        const safePrompt = neutralSafePrompt(i);

        try {
          imageBuffer = await generateImage(primaryPrompt, fallbackPrompt, safePrompt);
          console.log(`[image] AI source ${i + 1}/3 generated successfully.`);
        } catch (err) {
          console.warn(`[image] AI image unavailable for slide ${i + 1}; using zero-cost local fallback: ${err.message}`);
          imageBuffer = await localFallbackBuffer(i);
        }
      }

      await fs.writeFile(sourcePath, imageBuffer);
      if (!(await usableImage(sourcePath, { format: "png", minSize: 1000 }))) {
        throw new Error(`Source image ${i + 1} could not be decoded after generation/fallback`);
      }
      await checkpointBestEffort([sourcePath], `Checkpoint TrendyPatike source ${i + 1}`);
    } else {
      console.log(`[resume] Reusing source image ${i + 1}/3; rendering only.`);
    }

    await renderSlide(sourcePath, overlays[i], logos, outPath);
    outputs.push(outPath);
    await checkpointBestEffort([outPath], `Checkpoint TrendyPatike rendered slide ${i + 1}`);
  }

  return outputs;
}

export async function runRenderSelfTest() {
  const post = {
    cover: {
      headline_lines: [{ text: "ŠTA ZNAČI", accent: false }, { text: "ASICS?", accent: true }],
      subheadline: "Ime brenda je latinski akronim."
    },
    slide2: {
      headline_lines: [{ text: "PRIČA IZA IMENA", accent: true }],
      facts: [
        { tag: "1949", text: "Kihachiro Onitsuka je 1949. pokrenuo svoju kompaniju za sportsku obuću u Kobeu." },
        { tag: "1977", text: "ASICS je kao kompanija nastao 1977. spajanjem tri japanske firme." },
        { tag: "DETALJ", text: "Treća činjenica ostaje dostupna za caption i fact-check." }
      ]
    },
    slide3: {
      headline_lines: [{ text: "ZDRAV UM I TELO", accent: true }],
      facts: [
        { tag: "ZNAČENJE", text: "Izraz prenosi ideju zdravog uma u zdravom telu." },
        { tag: "DANAS", text: "Ta poruka je postala centralni deo filozofije brenda ASICS." }
      ],
      question: "Jeste li znali značenje imena?"
    }
  };

  const base = await sharp({ create: { width: W, height: H, channels: 3, background: "#111111" } }).png().toBuffer();
  const logos = await logoBuffers();
  const overlays = [coverOverlay(post), factsOverlay(post), impactOverlay(post)];

  for (const overlay of overlays) {
    const buffer = await sharp(base)
      .composite([
        { input: Buffer.from(overlay), left: 0, top: 0 },
        { input: logos.white, left: 67, top: 62 },
        { input: logos.green, left: 932, top: 1230 }
      ])
      .jpeg({ quality: 80 })
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    if (meta.width !== W || meta.height !== H || meta.format !== "jpeg") {
      throw new Error("Offline carousel render self-test failed");
    }
  }

  for (let i = 0; i < 3; i++) {
    const fallback = await localFallbackBuffer(i);
    const meta = await sharp(fallback).metadata();
    if (meta.width !== W || meta.height !== H || meta.format !== "png") {
      throw new Error(`Offline fallback image self-test failed for slide ${i + 1}`);
    }
  }
}
