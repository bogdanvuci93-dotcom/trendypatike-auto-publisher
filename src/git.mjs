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

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pushWithRetry(branch, maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      git(["push", "origin", branch]);
      return;
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;

      console.warn(`[git] Push attempt ${attempt}/${maxAttempts} failed; retrying.`);

      // If main advanced while this workflow was running, rebase the bot commit.
      // If the failure was only transient network trouble, a failed pull is harmless
      // and the next push attempt can still succeed.
      try {
        git(["pull", "--rebase", "origin", branch]);
      } catch {}

      sleepSync(2000 * attempt);
    }
  }

  throw lastError || new Error("Git push failed");
}

export function commitAndPush(paths, message) {
  git(["config", "user.name", "TrendyPatike Bot"]);
  git(["config", "user.email", "bot@trendypatike.com"]);
  git(["add", ...paths]);

  const staged = git(["diff", "--cached", "--name-only"], { quiet: true });
  if (!staged) return false;

  git(["commit", "-m", message]);
  pushWithRetry(cfg.githubRefName || "main");
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
