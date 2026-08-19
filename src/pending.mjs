import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve("data/pending-post.json");

export function pendingFilePath() {
  return FILE;
}

async function atomicWrite(value) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const temp = `${FILE}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temp, FILE);
}

export async function loadPending() {
  try {
    const value = JSON.parse(await fs.readFile(FILE, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) return null;
    return value;
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function savePending(value) {
  await atomicWrite(value);
  return FILE;
}

export async function clearPending() {
  await atomicWrite({});
  return FILE;
}
