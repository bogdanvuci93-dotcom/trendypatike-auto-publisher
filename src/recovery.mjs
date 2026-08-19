import fs from "node:fs/promises";
import path from "node:path";

const CACHE_FILE = path.resolve("data/openai-cache.json");
const PENDING_FILE = path.resolve("data/pending-post.json");
const STATE_FILE = path.resolve("data/state.json");

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file, fallback = {}) {
  try {
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

async function atomicWriteJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temp, file);
}

function validPending(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    ["verified", "ready"].includes(value.stage) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || "")) &&
    value.seed && value.post;
}

function progressScore(pending) {
  if (!validPending(pending)) return -1;
  const stage = pending.stage === "ready" ? 100 : 10;
  const children = Array.isArray(pending.instagram?.child_ids) ? pending.instagram.child_ids.length : 0;
  const carousel = pending.instagram?.carousel_id ? 5 : 0;
  return stage + children + carousel;
}

function choosePending(current, recovered, state) {
  if (!validPending(recovered)) return current;
  const alreadyPosted = (state.posted || []).some(entry =>
    entry.topic_id === recovered.seed?.id ||
    (entry.media_id && recovered.instagram?.published_id && entry.media_id === recovered.instagram.published_id)
  );
  if (alreadyPosted) return current;
  if (!validPending(current)) return recovered;

  if (String(recovered.date) > String(current.date)) return recovered;
  if (String(recovered.date) < String(current.date)) return current;

  if (recovered.fingerprint && current.fingerprint && recovered.fingerprint !== current.fingerprint) {
    return progressScore(recovered) > progressScore(current) ? recovered : current;
  }

  if (progressScore(recovered) > progressScore(current)) {
    return { ...current, ...recovered };
  }
  return current;
}

async function mergeCache(recoveredFile) {
  const current = await readJson(CACHE_FILE, {});
  const recovered = await readJson(recoveredFile, {});
  const merged = { ...recovered, ...current };

  // For duplicate keys, keep the newest saved_at instead of blindly preferring
  // whichever file was read last.
  for (const key of new Set([...Object.keys(current), ...Object.keys(recovered)])) {
    const a = current[key];
    const b = recovered[key];
    if (!a) merged[key] = b;
    else if (!b) merged[key] = a;
    else merged[key] = Date.parse(a.saved_at || 0) >= Date.parse(b.saved_at || 0) ? a : b;
  }

  const trimmed = Object.fromEntries(
    Object.entries(merged)
      .sort((a, b) => Date.parse(b[1]?.saved_at || 0) - Date.parse(a[1]?.saved_at || 0))
      .slice(0, 16)
  );
  await atomicWriteJson(CACHE_FILE, trimmed);
}

async function saveBundle(targetDir) {
  const root = path.resolve(targetDir);
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(path.join(root, "data"), { recursive: true });

  for (const [source, name] of [
    [CACHE_FILE, "openai-cache.json"],
    [PENDING_FILE, "pending-post.json"]
  ]) {
    if (await exists(source)) await fs.copyFile(source, path.join(root, "data", name));
  }

  const pending = await readJson(PENDING_FILE, {});
  if (validPending(pending) && pending.fingerprint) {
    const safeId = String(pending.seed.id || "post").replace(/[^a-z0-9-]+/g, "-");
    const dirName = `${pending.date}-${safeId}-${pending.fingerprint}`;
    const sourceDir = path.resolve("public/posts", dirName);
    if (await exists(sourceDir)) {
      const target = path.join(root, "public/posts", dirName);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.cp(sourceDir, target, { recursive: true, force: true });
    }
  }

  console.log(`[recovery] Bundle prepared at ${root}`);
}

async function restoreBundle(sourceDir) {
  const root = path.resolve(sourceDir);
  if (!(await exists(root))) {
    console.log("[recovery] No previous artifact directory to restore.");
    return;
  }

  const recoveredCache = path.join(root, "data/openai-cache.json");
  if (await exists(recoveredCache)) await mergeCache(recoveredCache);

  const currentPending = await readJson(PENDING_FILE, {});
  const recoveredPending = await readJson(path.join(root, "data/pending-post.json"), {});
  const state = await readJson(STATE_FILE, { posted: [] });
  const chosen = choosePending(currentPending, recoveredPending, state);
  if (validPending(chosen)) await atomicWriteJson(PENDING_FILE, chosen);

  const recoveredPosts = path.join(root, "public/posts");
  if (await exists(recoveredPosts)) {
    await fs.mkdir(path.resolve("public/posts"), { recursive: true });
    await fs.cp(recoveredPosts, path.resolve("public/posts"), { recursive: true, force: true });
  }

  console.log("[recovery] Previous paid-work artifact merged successfully.");
}

const [mode, dir = ".recovery"] = process.argv.slice(2);

try {
  if (mode === "save") await saveBundle(dir);
  else if (mode === "restore") await restoreBundle(dir);
  else throw new Error("Usage: node src/recovery.mjs <save|restore> [directory]");
} catch (err) {
  console.error(err.stack || err.message || err);
  process.exit(1);
}
