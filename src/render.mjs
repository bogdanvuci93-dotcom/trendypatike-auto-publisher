import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { cfg } from "./config.mjs";
import { generateImage } from "./openai.mjs";
import { commitAndPush } from "./git.mjs";

const W = 1080;
const H = 1350;
const WHITE = "#F7F7F5";
const FONT = "DejaVu Sans Condensed";

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrap(text, maxChars = 34) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
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

function headlineMetrics(lines, base = 104) {
  const longest = Math.max(1, ...lines.map(line => String(line.text).length));
  let size = base;
  if (longest > 35) size -= 17;
  else if (longest > 30) size -= 10;
  if (lines.length >= 4) size -= 7;
  return { size: Math.max(76, size), gap: Math.max(86, size + 8) };
}

function headlineSvg(lines, { x = 72, y = 320, size = 104, gap = 112 } = {}) {
  return lines.map((line, i) => {
    const fill = line.accent ? cfg.brandGreen : WHITE;
    return `<text x="${x}" y="${y + i * gap}" font-family="${FONT}" font-size="${size}" font-weight="900" fill="${fill}" letter-spacing="-2">${esc(line.text.toUpperCase())}</text>`;
  }).join("\n");
}

function factLines(text) {
  for (const width of [31, 35, 39, 43, 47]) {
    const lines = wrap(text, width);
    if (lines.length <= 3) return lines;
  }
  return wrap(text, 50);
}

function factBlockSvg(fact, y) {
  const lines = factLines(fact.text);
  const size = lines.length <= 2 ? 40 : lines.length === 3 ? 35 : 30;
  const lineGap = lines.length <= 2 ? 46 : lines.length === 3 ? 40 : 35;
  const body = lines.map((line, i) =>
    `<text x="72" y="${y + 50 + i * lineGap}" font-family="${FONT}" font-size="${size}" font-weight="800" fill="${WHITE}">${esc(line)}</text>`
  ).join("\n");
  return `
    <text x="72" y="${y}" font-family="${FONT}" font-size="28" font-weight="900" fill="${cfg.brandGreen}" letter-spacing="1">${esc(fact.tag.toUpperCase())}</text>
    ${body}
  `;
}

function frameSvg(slideNo) {
  const n = String(slideNo).padStart(2, "0");
  return `
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#050807" stop-opacity="0.96"/>
      <stop offset="52%" stop-color="#050807" stop-opacity="0.73"/>
      <stop offset="78%" stop-color="#050807" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#050807" stop-opacity="0.04"/>
    </linearGradient>
    <linearGradient id="bottomShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.76"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <rect width="${W}" height="${H}" fill="url(#bottomShade)"/>
  <rect x="16" y="16" width="${W - 32}" height="${H - 32}" fill="none" stroke="${cfg.brandGreen}" stroke-width="5"/>
  <line x1="72" y1="138" x2="1000" y2="138" stroke="${cfg.brandGreen}" stroke-width="2" opacity="0.9"/>
  <polyline points="310,138 324,126 338,142 352,138" fill="none" stroke="${cfg.brandGreen}" stroke-width="2"/>
  <text x="150" y="104" font-family="${FONT}" font-size="28" font-weight="800" fill="${WHITE}" letter-spacing="3">${esc(cfg.brandName)}</text>
  <text x="940" y="104" font-family="${FONT}" font-size="23" font-weight="800" fill="${cfg.brandGreen}">${n}</text>
  <text x="975" y="104" font-family="${FONT}" font-size="23" font-weight="700" fill="${WHITE}">/ 03</text>
  <text x="104" y="1292" font-family="${FONT}" font-size="23" font-weight="600" fill="${WHITE}">${esc(cfg.brandSite)}</text>
  <line x1="345" y1="1284" x2="900" y2="1284" stroke="${cfg.brandGreen}" stroke-width="2" opacity="0.9"/>
  <polyline points="545,1284 558,1296 571,1284" fill="none" stroke="${cfg.brandGreen}" stroke-width="2"/>
  `;
}

function coverOverlay(post) {
  const h = post.cover.headline_lines;
  const { size, gap } = headlineMetrics(h, 116);
  let sub = wrap(post.cover.subheadline, 31);
  if (sub.length > 3) sub = wrap(post.cover.subheadline, 37);
  const subSize = sub.length <= 2 ? 43 : sub.length === 3 ? 38 : 33;
  const subGap = subSize + 7;
  const subY = 1035;
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${frameSvg(1)}
    ${headlineSvg(h, { y: 335, size, gap })}
    <line x1="72" y1="${subY - 50}" x2="142" y2="${subY - 50}" stroke="${cfg.brandGreen}" stroke-width="5"/>
    ${sub.map((t, i) => `<text x="72" y="${subY + i * subGap}" font-family="${FONT}" font-size="${subSize}" font-weight="800" fill="${i === sub.length - 1 ? cfg.brandGreen : WHITE}">${esc(t)}</text>`).join("\n")}
  </svg>`;
}

function factsOverlay(post) {
  const h = post.slide2.headline_lines;
  const { size, gap } = headlineMetrics(h, 104);
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${frameSvg(2)}
    ${headlineSvg(h, { y: 285, size, gap })}
    ${factBlockSvg(post.slide2.facts[0], 565)}
    <line x1="72" y1="775" x2="142" y2="775" stroke="${cfg.brandGreen}" stroke-width="4"/>
    ${factBlockSvg(post.slide2.facts[1], 815)}
    <line x1="72" y1="1015" x2="142" y2="1015" stroke="${cfg.brandGreen}" stroke-width="4"/>
    ${factBlockSvg(post.slide2.facts[2], 1055)}
  </svg>`;
}

function impactOverlay(post) {
  const h = post.slide3.headline_lines;
  const { size, gap } = headlineMetrics(h, 104);
  const q = wrap(post.slide3.question, 26);
  const qSize = q.length <= 1 ? 42 : 36;
  const qGap = qSize + 7;
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${frameSvg(3)}
    ${headlineSvg(h, { y: 285, size, gap })}
    ${factBlockSvg(post.slide3.facts[0], 630)}
    <line x1="72" y1="835" x2="142" y2="835" stroke="${cfg.brandGreen}" stroke-width="4"/>
    ${factBlockSvg(post.slide3.facts[1], 875)}
    <line x1="72" y1="1070" x2="142" y2="1070" stroke="${cfg.brandGreen}" stroke-width="4"/>
    <circle cx="96" cy="1140" r="28" fill="none" stroke="${cfg.brandGreen}" stroke-width="4"/>
    <text x="86" y="1153" font-family="${FONT}" font-size="33" font-weight="900" fill="${cfg.brandGreen}">?</text>
    ${q.map((t, i) => `<text x="145" y="${1140 + i * qGap}" font-family="${FONT}" font-size="${qSize}" font-weight="900" fill="${i === q.length - 1 ? cfg.brandGreen : WHITE}">${esc(t)}</text>`).join("\n")}
  </svg>`;
}

async function logoBuffers() {
  const logo = path.resolve("assets/logo-mark-white.png");
  const white = await sharp(logo).resize({ width: 56 }).png().toBuffer();
  const green = await sharp(logo).resize({ width: 57 }).tint(cfg.brandGreen).png().toBuffer();
  return { white, green };
}

function finalPrompt(base, slideIndex) {
  const composition = slideIndex === 0
    ? "Place the main person or sneaker mostly on the RIGHT half, leaving dark negative space on the LEFT for large headline typography."
    : "Keep the main sneaker or person mostly on the RIGHT half, with dark clean negative space on the LEFT for editorial text.";
  return `${base}\n\n${composition}\n4:5 vertical portrait. Premium dark sneaker magazine editorial photography. Cinematic but believable. No text, captions, watermark, frame or TrendyPatike branding. Avoid malformed shoes, duplicated limbs, random lettering and fake signatures. Editorial culture/history visual, not an endorsement advertisement.`;
}

function neutralSafePrompt(slideIndex) {
  const scene = slideIndex === 0
    ? "A single unbranded retro high-top athletic sneaker displayed on the RIGHT side of a dark studio pedestal."
    : slideIndex === 1
      ? "A close editorial still life of an unbranded retro basketball sneaker on the RIGHT, with subtle vintage arena lights in the background."
      : "An unbranded retro high-top sneaker on the RIGHT with an anonymous basketball-court atmosphere and dramatic studio lighting.";
  return `${scene} 4:5 vertical portrait. Premium dark sneaker magazine photography. Deep black and charcoal background, realistic materials, cinematic light, clean negative space on the LEFT. No people, recognizable celebrity, brand logo, trademark, text, letters, watermark, frame or signature.`;
}

function localFallbackSvg(slideIndex) {
  const shift = slideIndex * 24;
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="78%" cy="47%" r="55%">
        <stop offset="0%" stop-color="${cfg.brandGreen}" stop-opacity="0.38"/>
        <stop offset="55%" stop-color="#17302c" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#050706" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="shoe" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#727775"/>
        <stop offset="55%" stop-color="#242927"/>
        <stop offset="100%" stop-color="#0b0e0d"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="#050706"/>
    <rect width="1080" height="1350" fill="url(#glow)"/>
    <circle cx="850" cy="${305 + shift}" r="170" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/>
    <circle cx="850" cy="${305 + shift}" r="230" fill="none" stroke="${cfg.brandGreen}" stroke-opacity="0.08" stroke-width="2"/>
    <path d="M610 ${750 + shift} C675 ${690 + shift}, 735 ${642 + shift}, 782 ${584 + shift} L872 ${634 + shift} C904 ${652 + shift}, 929 ${700 + shift}, 948 ${748 + shift} L1008 ${790 + shift} C1028 ${805 + shift}, 1022 ${844 + shift}, 990 ${855 + shift} C889 ${888 + shift}, 745 ${893 + shift}, 638 ${868 + shift} C598 ${858 + shift}, 573 ${825 + shift}, 583 ${792 + shift} Z" fill="url(#shoe)" stroke="#aeb5b2" stroke-opacity="0.34" stroke-width="3"/>
    <path d="M665 ${770 + shift} C748 ${786 + shift}, 856 ${789 + shift}, 967 ${774 + shift}" fill="none" stroke="${cfg.brandGreen}" stroke-opacity="0.65" stroke-width="8" stroke-linecap="round"/>
    <path d="M777 ${618 + shift} L821 ${737 + shift} M810 ${615 + shift} L855 ${730 + shift}" stroke="#d7dbd9" stroke-opacity="0.24" stroke-width="5"/>
    <ellipse cx="825" cy="${905 + shift}" rx="245" ry="40" fill="#000" fill-opacity="0.65"/>
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
      { input: logos.white, left: 70, top: 62 },
      { input: logos.green, left: 948, top: 1233 }
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
      headline_lines: [{ text: "TEST NASLOV", accent: true }, { text: "DRUGI RED", accent: false }],
      subheadline: "Ovo je lokalni test renderovanja bez API poziva."
    },
    slide2: {
      headline_lines: [{ text: "TRI ČINJENICE", accent: true }],
      facts: [
        { tag: "PRVO", text: "Ovo je kompletna probna rečenica za proveru prvog bloka." },
        { tag: "DRUGO", text: "Druga probna činjenica proverava slova č ć ž š i đ bez problema." },
        { tag: "TREĆE", text: "Treća probna rečenica proverava da završni blok ostane unutar slajda." }
      ]
    },
    slide3: {
      headline_lines: [{ text: "KRAJ PRIČE", accent: true }],
      facts: [
        { tag: "TEST", text: "Prva završna činjenica proverava raspored teksta na trećem slajdu." },
        { tag: "TEST 2", text: "Druga završna činjenica potvrđuje da SVG i Sharp rade zajedno." }
      ],
      question: "Da li render radi?"
    }
  };

  const base = await sharp({ create: { width: W, height: H, channels: 3, background: "#111111" } }).png().toBuffer();
  const logos = await logoBuffers();
  const overlays = [coverOverlay(post), factsOverlay(post), impactOverlay(post)];
  for (const overlay of overlays) {
    const buffer = await sharp(base)
      .composite([
        { input: Buffer.from(overlay), left: 0, top: 0 },
        { input: logos.white, left: 70, top: 62 },
        { input: logos.green, left: 948, top: 1233 }
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
