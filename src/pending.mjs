import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve("data/pending-post.json");

export function pendingFilePath() {
  return FILE;
}

export async function loadPending() {
  try {
    const value = JSON.parse(await fs.readFile(FILE, "utf8"));
    if (!value || typeof value !== "object" || !Object.keys(value).length) return null;
    return value;
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function savePending(value) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(value, null, 2) + "\n");
  return FILE;
}

export async function clearPending() {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, "{}\n");
  return FILE;
}
