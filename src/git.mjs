import { execFileSync } from "node:child_process";
import path from "node:path";
import { cfg } from "./config.mjs";

function git(args, { quiet = false } = {}) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]
  }).trim();
}

export function commitAndPush(paths, message) {
  git(["config", "user.name", "TrendyPatike Bot"]);
  git(["config", "user.email", "bot@trendypatike.com"]);
  git(["add", ...paths]);

  const changed = git(["status", "--porcelain"], { quiet: true });
  if (!changed) return false;

  git(["commit", "-m", message]);
  git(["push", "origin", cfg.githubRefName || "main"]);
  return true;
}

export function publicUrlFor(filePath) {
  const rel = path.relative(process.cwd(), filePath).split(path.sep).join("/");
  if (cfg.publicBaseUrl) return `${cfg.publicBaseUrl.replace(/\/$/, "")}/${rel}`;
  if (!cfg.githubRepository) throw new Error("PUBLIC_BASE_URL or GITHUB_REPOSITORY is required to build public media URLs");
  return `https://raw.githubusercontent.com/${cfg.githubRepository}/${cfg.githubRefName || "main"}/${rel}`;
}

export async function waitUntilPublic(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      if (res.ok && Number(res.headers.get("content-length") || 1) > 0) return;
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Media did not become public in time: ${url}`);
}
