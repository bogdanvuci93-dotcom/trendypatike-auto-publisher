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
const TEXT_LEFT = 56;
const TEXT_RIGHT = 1024;
const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;
const RENDER_VERSION = "kids-editorial-v4";

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

function wrap(text, maxChars = 24) {
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

function fitLines(text, { maxLines = 5, preferred = 96, min = 50, maxChars = 24 } = {}) {
  let lines = wrap(text, maxChars);
  for (const width of [maxChars + 2, maxChars + 4, maxChars + 7, maxChars + 10]) {
    if (lines.length <= maxLines) break;
    lines = wrap(text, width);
  }
  lines = lines.slice(0, maxLines);
  const longest = Math.max(1, ...lines.map(line => line.length));
  const widthFit = Math.floor(TEXT_WIDTH / (longest * 0.60));
  const size = Math.max(min, Math.min(preferred, widthFit));
  return { lines, size, gap: size + 7 };
}

function mainTextSvg(text, {
  y = 285,
  preferred = 102,
  min = 54,
  maxLines = 5,
  maxChars = 23,
  accentFrom = 0.62
} = {}) {
  const { lines, size, gap } = fitLines(text, { maxLines, preferred, min, maxChars });
  const accentStart = Math.max(0, Math.min(lines.length - 1, Math.floor(lines.length * accentFrom)));
  return lines.map((line, i) => {
    const fill = i >= accentStart ? GREEN : WHITE;
    return `<text x="${TEXT_LEFT}" y="${y + i * gap}" font-family="${FONT}" font-size="${size}" font-weight="900" fill="${fill}" letter-spacing="-2">${esc(line.toUpperCase())}</text>`;
  }).join("\n");
}

function supportTextSvg(text, { y = 985, maxLines = 2 } = {}) {
  const { lines, size, gap } = fitLines(text, { maxLines, preferred: 52, min: 38, maxChars: 30 });
  return lines.map((line, i) => {
    const fill = i === lines.length - 1 ? GREEN : WHITE;
    return `<text x="${TEXT_LEFT}" y="${y + i * gap}" font-family="${FONT}" font-size="${size}" font-weight="900" fill="${fill}" letter-spacing="-1">${esc(line.toUpperCase())}</text>`;
  }).join("\n");
}

function fixedFrameSvg() {
  return `
  <defs>
    <linearGradient id="leftShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#000" stop-opacity="0.84"/>
      <stop offset="50%" stop-color="#000" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.04"/>
    </linearGradient>
    <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="80%" stop-color="#000" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.90"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#leftShade)"/>
  <rect width="${W}" height="${H}" fill="url(#bottomShade)"/>
  <rect x="13" y="13" width="${W - 26}" height="${H - 26}" fill="none" stroke="${GREEN}" stroke-width="3"/>
  <text x="144" y="101" font-family="${FONT}" font-size="31" font-weight="900" fill="${WHITE}" letter-spacing="2">TRENDYPATIKE</text>
  <line x1="48" y1="145" x2="1032" y2="145" stroke="${GREEN}" stroke-width="2"/>
  <line x1="48" y1="1248" x2="1032" y2="1248" stroke="${GREEN}" stroke-width="2"/>
  `;
}

function coverMainText(post) {
  const headline = (post.cover?.headline_lines || []).map(x => clean(x.text)).filter(Boolean).join(" ");
  return headline || clean(post.cover?.subheadline) || clean(post.topic_title);
}

function visibleTextForSlide(post, slideIndex) {
  if (slideIndex === 0) {
    return [coverMainText(post), clean(post.cover?.subheadline)].filter(Boolean).join(". ");
  }
  if (slideIndex === 1) {
    return clean(post.slide2?.facts?.[0]?.text || post.slide2?.headline_lines?.map(x => x.text).join(" "));
  }
  return clean(post.slide3?.facts?.[0]?.text || post.slide3?.headline_lines?.map(x => x.text).join(" "));
}

function coverOverlay(post) {
  const main = coverMainText(post);
  const support = clean(post.cover?.subheadline);
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${fixedFrameSvg()}
    ${mainTextSvg(main, { y: 285, preferred: 106, min: 58, maxLines: 5, maxChars: 22 })}
    ${support ? supportTextSvg(support, { y: 1005, maxLines: 2 }) : ""}
  </svg>`;
}

function factsOverlay(post) {
  const text = clean(post.slide2?.facts?.[0]?.text);
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${fixedFrameSvg()}
    ${mainTextSvg(text, { y: 300, preferred: 104, min: 56, maxLines: 5, maxChars: 23 })}
  </svg>`;
}

function impactOverlay(post) {
  const text = clean(post.slide3?.facts?.[0]?.text);
  const question = clean(post.slide3?.question);
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${fixedFrameSvg()}
    ${mainTextSvg(text, { y: 285, preferred: 104, min: 54, maxLines: 5, maxChars: 23 })}
    ${question ? supportTextSvg(question, { y: 1120, maxLines: 2 }) : ""}
  </svg>`;
}

async function logoBuffer() {
  const logo = path.resolve("assets/logo-mark-white.png");
  return sharp(logo).resize({ width: 70 }).png().toBuffer();
}

function finalPrompt(base, slideIndex, visibleText) {
  const composition = slideIndex === 0
    ? "Place the main subject mostly on the right or lower-right, with clean dark negative space on the left for large typography."
    : "Compose the exact subject of this fact prominently in the center-right or lower-right, while keeping the left side readable and uncluttered.";

  return `${base}\n\nTHIS SLIDE SAYS: ${visibleText}\nThe image must directly and obviously illustrate that exact statement, even to a child who knows nothing about the topic. Show the specific sneaker, person, sport, object, place or before/after comparison mentioned in the statement. Do not use a generic sneaker if the text is about a specific person, event, invention or comparison. Make every slide a meaningfully different scene that matches its own statement.\n${composition}\n4:5 vertical portrait. Premium dark sneaker editorial photography, cinematic but believable, strong subject separation, realistic materials and high visual impact. IMPORTANT: the base image itself must contain NO TrendyPatike logo, NO TrendyPatike name, NO website, NO frame, NO captions, NO generated typography, NO watermark and NO decorative brand mark added by the image model. Avoid random or misspelled lettering. Historical product branding may appear only when it naturally belongs to the real subject.`;
}

function neutralSafePrompt(slideIndex, visibleText) {
  return `Create a 4:5 dark editorial sports photograph that directly illustrates this statement: ${visibleText}. Use a specific visual object or scene from the statement, not a generic sneaker. Keep the main subject on the right or lower-right and leave clean dark space on the left. No TrendyPatike logo, no TrendyPatike name, no website, no frame, no caption, no typography, no watermark, no random lettering. Realistic materials, believable lighting, kid-friendly and visually striking.`;
}

function localFallbackSvg(slideIndex) {
  const shift = slideIndex * 30;
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="78%" cy="62%" r="54%">
        <stop offset="0%" stop-color="${GREEN}" stop-opacity="0.24"/>
        <stop offset="55%" stop-color="#17302c" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#050706" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="shoe" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#787d7b"/>
        <stop offset="55%" stop-color="#252a28"/>
        <stop offset="100%" stop-color="#0b0e0d"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#050706"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <path d="M590 ${820 + shift} C674 ${748 + shift}, 742 ${700 + shift}, 798 ${642 + shift} L886 ${690 + shift} C922 ${710 + shift}, 950 ${760 + shift}, 970 ${812 + shift} L1020 ${847 + shift} C1040 ${864 + shift}, 1028 ${902 + shift}, 994 ${914 + shift} C884 ${948 + shift}, 742 ${952 + shift}, 628 ${927 + shift} C586 ${918 + shift}, 560 ${884 + shift}, 570 ${850 + shift} Z" fill="url(#shoe)" stroke="#aeb5b2" stroke-opacity="0.28" stroke-width="3"/>
    <path d="M650 ${850 + shift} C752 ${866 + shift}, 858 ${866 + shift}, 977 ${847 + shift}" fill="none" stroke="${GREEN}" stroke-opacity="0.52" stroke-width="8" stroke-linecap="round"/>
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

async function renderSlide(source, overlay, logo, outPath) {
  await sharp(source)
    .resize(W, H, { fit: "cover", position: "attention" })
    .composite([
      { input: Buffer.from(overlay), left: 0, top: 0 },
      { input: logo, left: 52, top: 47 }
    ])
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toFile(outPath);

  if (!(await usableImage(outPath, { width: W, height: H, format: ["jpeg", "jpg"], minSize: 10000 }))) {
    throw new Error(`Rendered slide failed integrity check: ${outPath}`);
  }
}

export async function generateAndRender(post, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const logo = await logoBuffer();
  const overlays = [coverOverlay(post), factsOverlay(post), impactOverlay(post)];
  const outputs = [];

  for (let i = 0; i < 3; i++) {
    const number = String(i + 1).padStart(2, "0");
    const sourcePath = path.join(outputDir, `${number}-source-${RENDER_VERSION}.png`);
    const outPath = path.join(outputDir, `${number}.jpg`);
    const visibleText = visibleTextForSlide(post, i);

    if (!(await usableImage(sourcePath, { format: "png", minSize: 1000 }))) {
      let imageBuffer;

      if (post.force_local_images) {
        console.log(`[image] Emergency post slide ${i + 1}/3 uses zero-cost local visual by design.`);
        imageBuffer = await localFallbackBuffer(i);
      } else {
        const primaryPrompt = finalPrompt(post.image_prompts[i], i, visibleText);
        const fallbackPrompt = `${primaryPrompt}\nIf a named public figure is difficult to depict, use an era-appropriate anonymous athlete only when the person is not essential to understanding the fact. Never replace a specific product comparison with an unrelated generic shoe.`;
        const safePrompt = neutralSafePrompt(i, visibleText);

        try {
          imageBuffer = await generateImage(primaryPrompt, fallbackPrompt, safePrompt);
          console.log(`[image] AI source ${i + 1}/3 generated successfully for the exact slide fact.`);
        } catch (err) {
          console.warn(`[image] AI image unavailable for slide ${i + 1}; using zero-cost local fallback: ${err.message}`);
          imageBuffer = await localFallbackBuffer(i);
        }
      }

      await fs.writeFile(sourcePath, imageBuffer);
      if (!(await usableImage(sourcePath, { format: "png", minSize: 1000 }))) {
        throw new Error(`Source image ${i + 1} could not be decoded after generation/fallback`);
      }
      await checkpointBestEffort([sourcePath], `Checkpoint TrendyPatike source ${i + 1} ${RENDER_VERSION}`);
    } else {
      console.log(`[resume] Reusing ${RENDER_VERSION} source image ${i + 1}/3; rerendering fixed frame.`);
    }

    await renderSlide(sourcePath, overlays[i], logo, outPath);
    outputs.push(outPath);
    await checkpointBestEffort([outPath], `Checkpoint TrendyPatike rendered slide ${i + 1} ${RENDER_VERSION}`);
  }

  return outputs;
}

export async function runRenderSelfTest() {
  const post = {
    topic_title: "Kako je Stan Smith dobio ime",
    cover: {
      headline_lines: [
        { text: "OVA PATIKA SE PRVO", accent: false },
        { text: "ZVALA HAILLET", accent: true }
      ],
      subheadline: "Tek kasnije je postala Stan Smith."
    },
    slide2: {
      headline_lines: [{ text: "", accent: false }],
      facts: [
        { tag: "", text: "Napravljena je za francuskog tenisera Roberta Hailleta." },
        { tag: "", text: "Druga činjenica ostaje za caption." },
        { tag: "", text: "Treća činjenica ostaje za proveru." }
      ]
    },
    slide3: {
      headline_lines: [{ text: "", accent: false }],
      facts: [
        { tag: "", text: "Posle je dobila ime Stan Smith." },
        { tag: "", text: "Druga završna činjenica ostaje za caption." }
      ],
      question: "Koje ime ti je bolje?"
    },
    image_prompts: ["shoe on a tennis court", "French tennis player and shoe", "before and after sneaker comparison"]
  };

  const base = await sharp({ create: { width: W, height: H, channels: 3, background: "#111111" } }).png().toBuffer();
  const logo = await logoBuffer();
  const overlays = [coverOverlay(post), factsOverlay(post), impactOverlay(post)];

  for (const overlay of overlays) {
    const buffer = await sharp(base)
      .composite([
        { input: Buffer.from(overlay), left: 0, top: 0 },
        { input: logo, left: 52, top: 47 }
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
