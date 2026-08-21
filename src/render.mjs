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
const TEXT_LEFT = 58;
const TEXT_RIGHT = 1002;
const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;
const TEXT_TOP_MIN = 190;
const TEXT_TOP_MAX = 685;
const TEXT_BOTTOM_MIN = 715;
const TEXT_BOTTOM_MAX = 1190;
const RENDER_VERSION = "kids-editorial-v9-safe-text-dark-fade";

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

function wrap(text, maxChars = 20) {
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

function fitGiantText(text, {
  maxLines = 6,
  preferred = 126,
  min = 62,
  maxChars = 18,
  maxHeight = 470
} = {}) {
  let lines = wrap(text, maxChars);
  for (const width of [maxChars + 2, maxChars + 4, maxChars + 6, maxChars + 8, maxChars + 10, maxChars + 13, maxChars + 16]) {
    if (lines.length <= maxLines) break;
    lines = wrap(text, width);
  }

  // Never silently cut the copy. If it still needs more lines, keep them and
  // reduce the font until the entire block fits inside the safe text zone.
  const longest = Math.max(1, ...lines.map(x => x.length));
  // 0.66 is intentionally conservative for bold condensed uppercase glyphs.
  const widthFit = Math.floor(TEXT_WIDTH / (longest * 0.66));
  const lineCount = Math.max(1, lines.length);
  const heightFit = Math.floor(maxHeight / (1 + Math.max(0, lineCount - 1) * 0.90));
  const size = Math.max(min, Math.min(preferred, widthFit, heightFit));
  const gap = Math.round(size * 0.90);
  return { lines, size, gap };
}

function textPositionForSlide(i) {
  return i % 2 === 0 ? "top" : "bottom";
}

function fadeSvg(position) {
  if (position === "top") {
    return `<defs>
      <linearGradient id="textFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0.99"/>
        <stop offset="45%" stop-color="#000" stop-opacity="0.94"/>
        <stop offset="68%" stop-color="#000" stop-opacity="0.78"/>
        <stop offset="86%" stop-color="#000" stop-opacity="0.34"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="760" fill="url(#textFade)"/>
    <rect x="0" y="150" width="${W}" height="500" fill="#000" fill-opacity="0.16"/>`;
  }
  return `<defs>
    <linearGradient id="textFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="14%" stop-color="#000" stop-opacity="0.28"/>
      <stop offset="32%" stop-color="#000" stop-opacity="0.70"/>
      <stop offset="58%" stop-color="#000" stop-opacity="0.93"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.99"/>
    </linearGradient>
  </defs>
  <rect x="0" y="590" width="${W}" height="760" fill="url(#textFade)"/>
  <rect x="0" y="700" width="${W}" height="500" fill="#000" fill-opacity="0.18"/>`;
}

function frameSvg() {
  return `<rect x="13" y="13" width="${W - 26}" height="${H - 26}" fill="none" stroke="${GREEN}" stroke-width="3"/>
  <text x="144" y="100" font-family="${FONT}" font-size="31" font-weight="900" fill="${WHITE}" letter-spacing="2" stroke="#000" stroke-opacity="0.28" stroke-width="2" paint-order="stroke">TRENDYPATIKE</text>
  <line x1="48" y1="144" x2="1032" y2="144" stroke="${GREEN}" stroke-width="2"/>
  <line x1="48" y1="1248" x2="1032" y2="1248" stroke="${GREEN}" stroke-width="2"/>
  <text x="56" y="1302" font-family="${FONT}" font-size="31" font-weight="900" fill="${WHITE}" letter-spacing="0.8" stroke="#000" stroke-opacity="0.45" stroke-width="3" paint-order="stroke">TRENDYPATIKE.COM</text>`;
}

function coverMainText(post) {
  const headline = (post.cover?.headline_lines || [])
    .map(x => clean(x.text))
    .filter(Boolean)
    .join(" ");
  return headline || clean(post.cover?.subheadline) || clean(post.topic_title);
}

function visibleTextForSlide(post, i) {
  if (i === 0) return coverMainText(post);
  if (i === 1) {
    return clean(
      post.slide2?.facts?.[0]?.text ||
      post.slide2?.headline_lines?.map(x => x.text).join(" ") ||
      post.topic_title
    );
  }
  return clean(
    post.slide3?.facts?.[0]?.text ||
    post.slide3?.headline_lines?.map(x => x.text).join(" ") ||
    post.topic_title
  );
}

function giantTextSvg(text, position) {
  const zoneHeight = position === "top"
    ? TEXT_TOP_MAX - TEXT_TOP_MIN
    : TEXT_BOTTOM_MAX - TEXT_BOTTOM_MIN;
  const { lines, size, gap } = fitGiantText(text, {
    maxLines: 6,
    preferred: 126,
    min: 62,
    maxChars: 18,
    maxHeight: zoneHeight
  });

  const blockHeight = Math.max(size, (lines.length - 1) * gap + size);
  const startY = position === "top"
    ? TEXT_TOP_MIN + size
    : Math.max(TEXT_BOTTOM_MIN + size, TEXT_BOTTOM_MAX - blockHeight + size);

  const clipY = position === "top" ? TEXT_TOP_MIN : TEXT_BOTTOM_MIN;
  const clipH = position === "top"
    ? TEXT_TOP_MAX - TEXT_TOP_MIN
    : TEXT_BOTTOM_MAX - TEXT_BOTTOM_MIN;
  const accentStart = Math.max(1, Math.floor(lines.length * 0.62));
  const textNodes = lines.map((line, i) => {
    const fill = i >= accentStart ? GREEN : WHITE;
    return `<text x="${TEXT_LEFT}" y="${Math.round(startY + i * gap)}" font-family="${FONT}" font-size="${size}" font-weight="900" fill="${fill}" letter-spacing="-2.5" stroke="#000" stroke-opacity="0.20" stroke-width="2" paint-order="stroke">${esc(line.toUpperCase())}</text>`;
  }).join("\n");

  // Clip is a final safety net. Auto-fit should keep everything inside it,
  // but no glyph can ever cross the green frame even with unusual characters.
  return `<defs><clipPath id="safeTextClip"><rect x="48" y="${clipY}" width="984" height="${clipH}"/></clipPath></defs><g clip-path="url(#safeTextClip)">${textNodes}</g>`;
}

function slideOverlay(post, i) {
  const position = textPositionForSlide(i);
  const text = visibleTextForSlide(post, i);
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${fadeSvg(position)}${frameSvg()}${giantTextSvg(text, position)}</svg>`;
}

async function logoBuffer() {
  return sharp(path.resolve("assets/logo-mark-white.png")).resize({ width: 70 }).png().toBuffer();
}

function finalPrompt(base, i) {
  const position = textPositionForSlide(i);
  const composition = position === "top"
    ? "Keep the strongest visual subject in the middle and lower half of the frame. Preserve a calmer, darker upper area so our code can place large text there without hiding the subject."
    : "Keep the strongest visual subject in the middle and upper half of the frame. Preserve a calmer, darker lower area so our code can place large text there without hiding the subject.";

  return `VISUAL SCENE BRIEF ONLY. DO NOT WRITE OR DISPLAY ANY WORDS FROM THIS BRIEF IN THE IMAGE:\n${base}\n\nCreate a full-bleed 4:5 vertical editorial photograph that clearly shows the exact sneaker, person, sport, object, place, invention, event or comparison requested above. Never replace a specific sneaker or historical object with a generic modern shoe. ${composition}\nThe image must fill the entire frame and remain visually strong outside the future text area. Premium sneaker-editorial photography, realistic materials, believable cinematic lighting, kid-friendly and instantly understandable. ABSOLUTELY NO WRITTEN LANGUAGE OR TYPOGRAPHY IN THE GENERATED IMAGE: no captions, headlines, letters, numbers, labels, signs, posters, website text, random glyphs, watermarks, TrendyPatike branding or frame. All typography and branding are added later by code.`;
}

function neutralSafePrompt(i, base) {
  const position = textPositionForSlide(i);
  const composition = position === "top"
    ? "main subject in the middle/lower half, calmer upper area"
    : "main subject in the middle/upper half, calmer lower area";
  return `Create a full-bleed 4:5 dark editorial sports photograph based only on this visual scene brief: ${base}. Show the exact specific visual subject, not a generic substitute. Compose with ${composition}. Keep the image realistic, visually striking and easy for a child to understand. ABSOLUTELY NO TEXT OR WRITING OF ANY KIND: no words, letters, numbers, signs, labels, captions, logos with lettering, watermarks, website text or random glyphs.`;
}

function localFallbackSvg(i) {
  const shift = i * 30;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="70%" cy="55%" r="60%"><stop offset="0%" stop-color="${GREEN}" stop-opacity=".24"/><stop offset="100%" stop-color="#050706" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="#050706"/><rect width="${W}" height="${H}" fill="url(#g)"/><path d="M560 ${780 + shift} C660 ${700 + shift},740 ${668 + shift},810 ${620 + shift} L900 ${676 + shift} C940 ${706 + shift},966 ${756 + shift},985 ${820 + shift} L1020 ${852 + shift} C1040 ${875 + shift},1020 ${914 + shift},982 ${928 + shift} C870 ${960 + shift},728 ${960 + shift},610 ${936 + shift} C564 ${925 + shift},536 ${888 + shift},548 ${848 + shift} Z" fill="#252a28" stroke="#aeb5b2" stroke-opacity=".28" stroke-width="3"/></svg>`;
}

async function localFallbackBuffer(i) {
  return sharp(Buffer.from(localFallbackSvg(i))).png().toBuffer();
}

async function usableImage(file, { width = null, height = null, format = null, minSize = 1000 } = {}) {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size < minSize) return false;
    const meta = await sharp(file).metadata();
    if (!meta.width || !meta.height) return false;
    if (width && meta.width !== width) return false;
    if (height && meta.height !== height) return false;
    if (format && !([].concat(format).includes(meta.format))) return false;
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
  const slideCount = Math.max(1, Math.min(3, Number(post.slide_count) || 1));
  const outputs = [];

  for (let i = 0; i < slideCount; i++) {
    const number = String(i + 1).padStart(2, "0");
    const sourcePath = path.join(outputDir, `${number}-source-${RENDER_VERSION}.png`);
    const outPath = path.join(outputDir, `${number}.jpg`);

    if (!(await usableImage(sourcePath, { format: "png", minSize: 1000 }))) {
      let imageBuffer;
      if (post.force_local_images) {
        imageBuffer = await localFallbackBuffer(i);
      } else {
        const primary = finalPrompt(post.image_prompts[i], i);
        const fallback = `${primary}\nIf a named public figure is difficult to depict, use an era-appropriate scene only when the person is not essential. Never replace a specific product or comparison with an unrelated generic shoe. Keep the image completely free of writing.`;
        const safe = neutralSafePrompt(i, post.image_prompts[i]);
        try {
          imageBuffer = await generateImage(primary, fallback, safe);
        } catch (err) {
          console.warn(`[image] AI unavailable for slide ${i + 1}; local fallback: ${err.message}`);
          imageBuffer = await localFallbackBuffer(i);
        }
      }

      await fs.writeFile(sourcePath, imageBuffer);
      if (!(await usableImage(sourcePath, { format: "png", minSize: 1000 }))) {
        throw new Error(`Source image ${i + 1} could not be decoded`);
      }
      await checkpointBestEffort([sourcePath], `Checkpoint TrendyPatike source ${i + 1} ${RENDER_VERSION}`);
    }

    const overlay = slideOverlay(post, i);
    await renderSlide(sourcePath, overlay, logo, outPath);
    outputs.push(outPath);
    await checkpointBestEffort([outPath], `Checkpoint TrendyPatike rendered slide ${i + 1} ${RENDER_VERSION}`);
  }

  return outputs;
}

export async function runRenderSelfTest() {
  const post = {
    slide_count: 3,
    topic_title: "Kako je Stan Smith dobio ime",
    cover: {
      headline_lines: [{ text: "OVA PATIKA SE PRVO", accent: false }, { text: "ZVALA HAILLET", accent: true }],
      subheadline: "Tek kasnije je postala Stan Smith."
    },
    slide2: {
      headline_lines: [{ text: "", accent: false }],
      facts: [{ tag: "", text: "Napravljena je za francuskog tenisera Roberta Hailleta." }]
    },
    slide3: {
      headline_lines: [{ text: "", accent: false }],
      facts: [{ tag: "", text: "Posle je dobila ime Stan Smith." }],
      question: ""
    },
    image_prompts: ["shoe on tennis court", "French tennis player and shoe", "before and after sneaker"]
  };

  const base = await sharp({ create: { width: W, height: H, channels: 3, background: "#111111" } }).png().toBuffer();
  const logo = await logoBuffer();
  for (let i = 0; i < 3; i++) {
    const overlay = slideOverlay(post, i);
    const buffer = await sharp(base)
      .composite([{ input: Buffer.from(overlay), left: 0, top: 0 }, { input: logo, left: 52, top: 47 }])
      .jpeg({ quality: 80 })
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    if (meta.width !== W || meta.height !== H || meta.format !== "jpeg") {
      throw new Error("Offline carousel render self-test failed");
    }
  }
}