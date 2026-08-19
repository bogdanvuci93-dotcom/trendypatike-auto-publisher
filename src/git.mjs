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

function repoPath(filePath) {
  const absolute = path.resolve(filePath);
  const relative = path.relative(process.cwd(), absolute).split(path.sep).join("/");
  if (!relative || relative.startsWith("../")) {
    throw new Error(`Refusing to commit path outside repository: ${filePath}`);
  }
  return relative;
}

function cleanupInterruptedGitOperation() {
  try { git(["rebase", "--abort"], { quiet: true }); } catch {}
  try { git(["cherry-pick", "--abort"], { quiet: true }); } catch {}
  try { git(["merge", "--abort"], { quiet: true }); } catch {}
}

export function commitAndPush(paths, message, maxAttempts = 4) {
  const branch = cfg.githubRefName || "main";
  const targetPaths = [...new Set(paths.map(repoPath))];

  git(["config", "user.name", "TrendyPatike Bot"]);
  git(["config", "user.email", "bot@trendypatike.com"]);
  cleanupInterruptedGitOperation();

  // First make an immutable local snapshot of ONLY the files this operation owns.
  // We keep the snapshot commit SHA even if main moves while the workflow is running.
  git(["add", "--", ...targetPaths]);
  const staged = git(["diff", "--cached", "--name-only"], { quiet: true });
  if (!staged) return false;

  git(["commit", "-m", message]);
  const snapshotCommit = git(["rev-parse", "HEAD"]);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      cleanupInterruptedGitOperation();

      // Always rebuild the bot commit on top of the newest remote main.
      // This avoids non-fast-forward and rebase conflicts entirely.
      git(["fetch", "origin", branch]);
      git(["reset", "--hard", `origin/${branch}`]);

      // Restore exactly the files produced by this operation from the snapshot.
      // Other files that appeared on main while the workflow was running are untouched.
      git(["checkout", snapshotCommit, "--", ...targetPaths]);
      git(["add", "--", ...targetPaths]);

      const rebasedChanges = git(["diff", "--cached", "--name-only"], { quiet: true });
      if (!rebasedChanges) {
        console.log("[git] Target files are already present on the latest main; nothing to push.");
        return false;
      }

      git(["commit", "-m", message]);
      git(["push", "origin", `HEAD:${branch}`]);
      return true;
    } catch (err) {
      lastError = err;
      console.warn(`[git] Publish attempt ${attempt}/${maxAttempts} failed.`);
      cleanupInterruptedGitOperation();
      if (attempt < maxAttempts) sleepSync(2000 * attempt);
    }
  }

  throw lastError || new Error("Git publish failed after retries");
}

export function publicUrlFor(filePath) {
  const rel = path.relative(process.cwd(), filePath).split(path.sep).join("/");
  if (cfg.publicBaseUrl) return `${cfg.publicBaseUrl.replace(/\/$/, "")}/${rel}`;
  if (!cfg.githubRepository) throw new Error("PUBLIC_BASE_URL or GITHUB_REPOSITORY is required to build public media URLs");
  return `https://raw.githubusercontent.com/${cfg.githubRepository}/${cfg.githubRefName || "main"}/${rel}`;
}

export async function waitUntilPublic(url, timeoutMs = 300000) {
  const start = Date.now();
  let lastStatus = 0;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      lastStatus = res.status;
      if (res.ok && Number(res.headers.get("content-length") || 1) > 0) return;
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }

  throw new Error(`Media did not become public in time (last HTTP ${lastStatus || "network error"}): ${url}`);
}
