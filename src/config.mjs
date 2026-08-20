import fs from "node:fs";
import path from "node:path";

if (fs.existsSync(path.resolve(".env")) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(path.resolve(".env"));
}

export const cfg = {
  openaiKey: process.env.OPENAI_API_KEY,
  textModel: process.env.TEXT_MODEL || "gpt-5-mini",
  verifyModel: process.env.VERIFY_MODEL || "gpt-5-mini",
  imageModel: process.env.IMAGE_MODEL || "gpt-image-1-mini",
  imageQuality: process.env.IMAGE_QUALITY || "medium",
  maxOpenAICalls: Math.max(1, Number(process.env.MAX_OPENAI_CALLS || 8)),

  igToken: process.env.IG_ACCESS_TOKEN,
  igUserId: process.env.IG_USER_ID,
  igVersion: process.env.IG_API_VERSION || "v25.0",

  brandGreen: process.env.BRAND_GREEN || "#037361",
  brandName: process.env.BRAND_NAME || "TRENDYPATIKE",
  brandSite: process.env.BRAND_SITE || "trendypatike.com",

  dryRun: process.env.DRY_RUN ? String(process.env.DRY_RUN).toLowerCase() === "true" : true,
  forceRun: process.env.FORCE_RUN ? String(process.env.FORCE_RUN).toLowerCase() === "true" : false,
  maxTopicAttempts: Number(process.env.MAX_TOPIC_ATTEMPTS || 1),

  githubRepository: process.env.GITHUB_REPOSITORY || "",
  githubRefName: process.env.GITHUB_REF_NAME || "main",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || ""
};

export function assertRuntimeConfig() {
  if (!Number.isFinite(cfg.maxOpenAICalls) || cfg.maxOpenAICalls < 1) {
    throw new Error("MAX_OPENAI_CALLS must be a positive number");
  }
  if (!Number.isFinite(cfg.maxTopicAttempts) || cfg.maxTopicAttempts < 1) {
    throw new Error("MAX_TOPIC_ATTEMPTS must be a positive number");
  }
  if (!cfg.dryRun) {
    if (!cfg.igToken) throw new Error("Missing IG_ACCESS_TOKEN");
    if (!cfg.igUserId) throw new Error("Missing IG_USER_ID");
  }
}

export function assertOpenAIConfig() {
  if (!cfg.openaiKey) throw new Error("Missing OPENAI_API_KEY");
  if (!cfg.textModel) throw new Error("Missing TEXT_MODEL");
  if (!cfg.verifyModel) throw new Error("Missing VERIFY_MODEL");
  if (!cfg.imageModel) throw new Error("Missing IMAGE_MODEL");
}

export function assertBaseConfig() {
  assertRuntimeConfig();
  assertOpenAIConfig();
}
