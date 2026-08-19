import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { cfg } from "./config.mjs";
import { generateImage } from "./openai.mjs";

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
  const words = String(text).trim().split(/\s+/);
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

function headlineSvg(lines, { x = 72, y = 320, size = 94, gap = 100 } = {}) {
  return lines.map((line, i) => {
    const fill = line.accent ? cfg.brandGreen : WHITE;
    return `<text x="${x}" y="${y + i * gap}" font-family="${FONT}" font-size="${size}" font-weight="900" fill="${fill}" letter-spacing="-2">${esc(line.text.toUpperCase())}</text>`;
  }).join("\n");
}

function factBlockSvg(fact, y, maxChars = 34) {
  const lines = wrap(fact.text, maxChars).slice(0, 3);
  const body = lines.map((line, i) =>
    `<text x="72" y="${y + 44 + i * 36}" font-family="${FONT}" font-size="30" font-weight="600" fill="${WHITE}">${esc(line)}</text>`
  ).join("\n");
  return `
    <text x="72" y="${y}" font-family="${FONT}" font-size="25" font-weight="800" fill="${cfg.brandGreen}" letter-spacing="1">${esc(fact.tag.toUpperCase())}</text>
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
  const lineCount = post.cover.headline_lines.length;
  const size = lineCount >= 5 ? 82 : lineCount === 4 ? 91 : 100;
  const gap = size + 10;
  const sub = wrap(post.cover.subheadline, 37).slice(0, 2);
  const subY = 1160;
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${frameSvg(1)}
    ${headlineSvg(post.cover.headline_lines, { y: 330, size, gap })}
    <line x1="72" y1="${subY - 42}" x2="132" y2="${subY - 42}" stroke="${cfg.brandGreen}" stroke-width="4"/>
    ${sub.map((t, i) => `<text x="72" y="${subY + i * 38}" font-family="${FONT}" font-size="30" font-weight="600" fill="${i === 1 ? cfg.brandGreen : WHITE}">${esc(t)}</text>`).join("\n")}
  </svg>`;
}

function factsOverlay(post) {
  const h = post.slide2.headline_lines;
  const size = h.length === 3 ? 78 : 88;
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${frameSvg(2)}
    ${headlineSvg(h, { y: 305, size, gap: size + 9 })}
    ${factBlockSvg(post.slide2.facts[0], 650, 34)}
    <line x1="72" y1="800" x2="132" y2="800" stroke="${cfg.brandGreen}" stroke-width="3"/>
    ${factBlockSvg(post.slide2.facts[1], 845, 34)}
    <line x1="72" y1="995" x2="132" y2="995" stroke="${cfg.brandGreen}" stroke-width="3"/>
    ${factBlockSvg(post.slide2.facts[2], 1040, 34)}
  </svg>`;
}

function impactOverlay(post) {
  const h = post.slide3.headline_lines;
  const size = h.length === 3 ? 78 : 88;
  const q = wrap(post.slide3.question, 31).slice(0, 2);
  return `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${frameSvg(3)}
    ${headlineSvg(h, { y: 305, size, gap: size + 9 })}
    ${factBlockSvg(post.slide3.facts[0], 675, 34)}
    <line x1="72" y1="835" x2="132" y2="835" stroke="${cfg.brandGreen}" stroke-width="3"/>
    ${factBlockSvg(post.slide3.facts[1], 885, 34)}
    <line x1="72" y1="1050" x2="132" y2="1050" stroke="${cfg.brandGreen}" stroke-width="3"/>
    <circle cx="92" cy="1124" r="25" fill="none" stroke="${cfg.brandGreen}" stroke-width="3"/>
    <text x="84" y="1135" font-family="${FONT}" font-size="29" font-weight="900" fill="${cfg.brandGreen}">?</text>
    ${q.map((t, i) => `<text x="135" y="${1120 + i * 39}" font-family="${FONT}" font-size="31" font-weight="800" fill="${i === q.length - 1 ? cfg.brandGreen : WHITE}">${esc(t)}</text>`).join("\n")}
  </svg>`;
}

async function logoBuffers() {
  const white = await sharp(path.resolve("assets/logo-mark-white.png"))
    .resize({ width: 56 })
    .png()
    .toBuffer();
  const green = await sharp(path.resolve("assets/logo-mark-white.png"))
    .resize({ width: 57 })
    .tint(cfg.brandGreen)
    .png()
    .toBuffer();
  return { white, green };
}

function finalPrompt(base, slideIndex) {
  const composition = slideIndex === 0
    ? "Place the main person or sneaker mostly on the RIGHT half, leaving dark negative space on the LEFT for large headline typography."
    : "Keep the main sneaker or person mostly on the RIGHT half, with dark clean negative space on the LEFT for editorial text.";
  return `${base}\n\n${composition}\n4:5 vertical portrait. Premium dark sneaker magazine editorial photography. Cinematic but believable. No text, no captions, no watermark, no frame, no TrendyPatike branding. Avoid malformed shoes, duplicated limbs, incorrect random lettering, fake signatures and gibberish logos. This is an editorial culture/history visual, not a celebrity endorsement advertisement.`;
}

export async function generateAndRender(post, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const { white, green } = await logoBuffers();
  const overlays = [coverOverlay(post), factsOverlay(post), impactOverlay(post)];
  const outputs = [];

  for (let i = 0; i < 3; i++) {
    const primaryPrompt = finalPrompt(post.image_prompts[i], i);
    const fallbackPrompt = `${primaryPrompt}\nIf a named public figure is difficult to depict, use a historically appropriate anonymous athlete/artist silhouette or era-specific scene instead, while preserving the factual visual context.`;
    const imageBuffer = await generateImage(primaryPrompt, fallbackPrompt);

    const outPath = path.join(outputDir, `${String(i + 1).padStart(2, "0")}.jpg`);
    await sharp(imageBuffer)
      .resize(W, H, { fit: "cover", position: "attention" })
      .composite([
        { input: Buffer.from(overlays[i]), left: 0, top: 0 },
        { input: white, left: 70, top: 62 },
        { input: green, left: 948, top: 1233 }
      ])
      .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
      .toFile(outPath);

    outputs.push(outPath);
  }

  return outputs;
}
