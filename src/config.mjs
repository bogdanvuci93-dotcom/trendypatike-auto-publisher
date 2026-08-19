import fs from "node:fs";
import path from "node:path";

if (fs.existsSync(path.resolve(".env")) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(path.resolve(".env"));
}

export const cfg = {
  openaiKey: process.env.OPENAI_API_KEY,
  textModel: process.env.TEXT_MODEL || "gpt-5",
  verifyModel: process.env.VERIFY_MODEL || "gpt-5",
  imageModel: process.env.IMAGE_MODEL || "gpt-image-1-mini",
  imageQuality: process.env.IMAGE_QUALITY || "medium",

  igToken: process.env.IG_ACCESS_TOKEN,
  igUserId: process.env.IG_USER_ID,
  igVersion: process.env.IG_API_VERSION || "v25.0",

  brandGreen: process.env.BRAND_GREEN || "#037361",
  brandName: process.env.BRAND_NAME || "TRENDYPATIKE",
  brandSite: process.env.BRAND_SITE || "trendypatike.com",

  dryRun: process.env.DRY_RUN ? String(process.env.DRY_RUN).toLowerCase() === "true" : true,
  forceRun: process.env.FORCE_RUN ? String(process.env.FORCE_RUN).toLowerCase() === "true" : false,
  maxTopicAttempts: Number(process.env.MAX_TOPIC_ATTEMPTS || 3),

  githubRepository: process.env.GITHUB_REPOSITORY || "",
  githubRefName: process.env.GITHUB_REF_NAME || "main",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || ""
};

export function assertBaseConfig() {
  if (!cfg.openaiKey) throw new Error("Missing OPENAI_API_KEY");
  if (!cfg.dryRun) {
    if (!cfg.igToken) throw new Error("Missing IG_ACCESS_TOKEN");
    if (!cfg.igUserId) throw new Error("Missing IG_USER_ID");
  }
}
