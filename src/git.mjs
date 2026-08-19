import { execFileSync } from "node:child_process";
import path from "node:path";
import { cfg } from "./config.mjs";

function git(args, { quiet = false, timeoutMs = 60000 } = {}) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    timeout: timeoutMs
  }).trim();
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function repoPath(filePath) {
  const absolute = path.resolve(filePath);
  const relative = path.relative(process.cwd(), absolute).split(path.sep).join("/");
  if (!relative || relative === ".." || relative.startsWith("../")) {
    throw new Error(`Refusing to commit path outside repository: ${filePath}`);
  }
  return relative;
}

function cleanupInterruptedGitOperation() {
  try { git(["rebase", "--abort"], { quiet: true, timeoutMs: 15000 }); } catch {}
  try { git(["cherry-pick", "--abort"], { quiet: true, timeoutMs: 15000 }); } catch {}
  try { git(["merge", "--abort"], { quiet: true, timeoutMs: 15000 }); } catch {}
}

export function commitAndPush(paths, message, maxAttempts = 4) {
  const branch = cfg.githubRefName || "main";
  const targetPaths = [...new Set(paths.map(repoPath))];
  if (!targetPaths.length) return false;

  git(["config", "user.name", "TrendyPatike Bot"]);
  git(["config", "user.email", "bot@trendypatike.com"]);
  cleanupInterruptedGitOperation();

  git(["add", "--", ...targetPaths]);
  const staged = git(["diff", "--cached", "--name-only"], { quiet: true });
  if (!staged) return false;

  git(["commit", "-m", message]);
  const snapshotCommit = git(["rev-parse", "HEAD"]);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      cleanupInterruptedGitOperation();
      git(["fetch", "origin", branch], { timeoutMs: 60000 });
      git(["reset", "--hard", `origin/${branch}`], { timeoutMs: 30000 });
      git(["checkout", snapshotCommit, "--", ...targetPaths], { timeoutMs: 30000 });
      git(["add", "--", ...targetPaths]);

      const rebasedChanges = git(["diff", "--cached", "--name-only"], { quiet: true });
      if (!rebasedChanges) {
        console.log("[git] Target files already exist on latest main; no push required.");
        return false;
      }

      git(["commit", "-m", message]);
      git(["push", "origin", `HEAD:${branch}`], { timeoutMs: 60000 });
      return true;
    } catch (err) {
      lastError = err;
      const detail = String(err?.stderr || err?.message || err).trim().slice(0, 500);
      console.warn(`[git] Attempt ${attempt}/${maxAttempts} failed: ${detail}`);
      cleanupInterruptedGitOperation();
      if (attempt < maxAttempts) sleepSync(Math.min(3000 * attempt, 12000));
    }
  }

  throw lastError || new Error("Git publish failed after retries");
}

export function publicUrlFor(filePath) {
  const rel = path.relative(process.cwd(), filePath).split(path.sep).join("/");
  if (!rel || rel === ".." || rel.startsWith("../")) {
    throw new Error(`Cannot build public URL for path outside repository: ${filePath}`);
  }
  if (cfg.publicBaseUrl) return `${cfg.publicBaseUrl.replace(/\/$/, "")}/${rel}`;
  if (!cfg.githubRepository) throw new Error("PUBLIC_BASE_URL or GITHUB_REPOSITORY is required to build public media URLs");
  return `https://raw.githubusercontent.com/${cfg.githubRepository}/${cfg.githubRefName || "main"}/${rel}`;
}

export async function waitUntilPublic(url, timeoutMs = 300000) {
  const start = Date.now();
  let lastStatus = 0;
  let lastType = "";

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(15000)
      });
      lastStatus = res.status;
      lastType = String(res.headers.get("content-type") || "").toLowerCase();
      if (res.ok) {
        const bytes = Buffer.from(await res.arrayBuffer());
        const mediaTypeOk = !url.toLowerCase().endsWith(".jpg") || lastType.includes("image/jpeg");
        if (bytes.length > 10000 && mediaTypeOk) return;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }

  throw new Error(
    `Media did not become publicly readable in time (HTTP ${lastStatus || "network"}, type ${lastType || "unknown"}): ${url}`
  );
}
