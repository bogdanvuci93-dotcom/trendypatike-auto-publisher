import { cfg } from "./config.mjs";

const base = () => `https://graph.instagram.com/${cfg.igVersion}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class InstagramRequestError extends Error {
  constructor(message, { status = 0, code = 0, subcode = 0, retryAfterMs = 0 } = {}) {
    super(message);
    this.name = "InstagramRequestError";
    this.status = status;
    this.code = Number(code || 0);
    this.subcode = Number(subcode || 0);
    this.retryAfterMs = retryAfterMs;
  }
}

function retryDelay(err, attempt) {
  if (err?.retryAfterMs > 0) return Math.min(err.retryAfterMs, 60000);
  return Math.min(5000 * (2 ** (attempt - 1)), 60000);
}

function isTransientInstagramError(err) {
  if (!(err instanceof InstagramRequestError)) return false;
  if (err.status === 408 || err.status === 429 || err.status >= 500) return true;
  return [1, 2, 4, 17, 32, 613].includes(err.code);
}

async function parseResponse(res) {
  try {
    return await res.json();
  } catch {
    return { error: { message: `Non-JSON Instagram response (HTTP ${res.status})` } };
  }
}

async function igRequest(method, endpoint, params = {}, maxAttempts = 5) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const url = new URL(`${base()}/${endpoint}`);
      const options = {
        method,
        headers: { "Authorization": `Bearer ${cfg.igToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(30000)
      };

      if (method === "GET") {
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
      } else {
        const body = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) body.set(key, String(value));
        options.headers["Content-Type"] = "application/x-www-form-urlencoded";
        options.body = body;
      }

      const res = await fetch(url, options);
      const json = await parseResponse(res);
      if (res.ok && !json.error) return json;

      const apiError = json.error || json || {};
      const retryAfter = Number(res.headers.get("retry-after") || 0);
      throw new InstagramRequestError(
        `Instagram ${method} ${endpoint} failed (HTTP ${res.status}): ${apiError.message || JSON.stringify(json)}`,
        {
          status: res.status,
          code: apiError.code,
          subcode: apiError.error_subcode,
          retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0
        }
      );
    } catch (err) {
      lastError = err instanceof InstagramRequestError
        ? err
        : new InstagramRequestError(`Instagram ${method} ${endpoint} network failure: ${err.message}`, { status: 503 });

      if (!isTransientInstagramError(lastError) || attempt >= maxAttempts) throw lastError;
      const delay = retryDelay(lastError, attempt);
      console.warn(`[instagram] ${method} ${endpoint} transient failure ${attempt}/${maxAttempts}; retry in ${Math.round(delay / 1000)}s.`);
      await sleep(delay);
    }
  }

  throw lastError || new Error(`Instagram ${method} ${endpoint} failed`);
}

async function igPost(endpoint, params, maxAttempts = 5) {
  return igRequest("POST", endpoint, params, maxAttempts);
}

async function igGet(endpoint, params = {}, maxAttempts = 5) {
  return igRequest("GET", endpoint, params, maxAttempts);
}

async function waitContainer(id, timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await igGet(id, { fields: "status_code,status" }, 5);
    const code = String(status.status_code || status.status || "").toUpperCase();
    if (["FINISHED", "PUBLISHED"].includes(code)) return status;
    if (["ERROR", "EXPIRED"].includes(code)) {
      const err = new Error(`Instagram container ${id} ${code.toLowerCase()}: ${JSON.stringify(status)}`);
      err.containerStatus = code;
      throw err;
    }
    await sleep(5000);
  }
  const err = new Error(`Instagram container timeout: ${id}`);
  err.containerStatus = "TIMEOUT";
  throw err;
}

export async function verifyInstagramConnection({ probeImageUrl = "" } = {}) {
  const account = await igGet("me", { fields: "id,user_id,username,account_type" }, 5);
  const returnedIds = [account.user_id, account.id].filter(Boolean).map(String);

  if (!returnedIds.length) throw new Error("Instagram preflight worked but returned no account ID");
  if (cfg.igUserId && !returnedIds.includes(String(cfg.igUserId))) {
    throw new Error(`Instagram preflight IG_USER_ID mismatch: configured ${cfg.igUserId}, returned ${returnedIds.join(", ")}`);
  }

  console.log(`Instagram account preflight OK for @${account.username || "unknown"}`);

  if (probeImageUrl) {
    const probe = await igPost(`${cfg.igUserId}/media`, {
      image_url: probeImageUrl,
      is_carousel_item: "true"
    }, 5);
    if (!probe?.id) throw new Error("Instagram publishing preflight returned no container ID");
    await waitContainer(probe.id, 180000);
    console.log(`Instagram publishing preflight OK; disposable container ${probe.id} is ready and will not be published.`);
  }

  return account;
}

function normalizedCaption(value = "") {
  return String(value)
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function findExistingPublishedMedia(caption, { limit = 20, lookbackHours = 72 } = {}) {
  const target = normalizedCaption(caption);
  if (!target) return null;

  const result = await igGet(`${cfg.igUserId}/media`, {
    fields: "id,caption,timestamp,media_type,permalink",
    limit
  }, 5);

  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
  for (const item of result.data || []) {
    const timestamp = Date.parse(item.timestamp || "");
    if (Number.isFinite(timestamp) && timestamp < cutoff) continue;
    if (normalizedCaption(item.caption) === target) return item;
  }
  return null;
}

async function safeProgress(onProgress, state) {
  if (typeof onProgress !== "function") return;
  try {
    await onProgress(JSON.parse(JSON.stringify(state)));
  } catch (err) {
    console.warn(`[instagram] Could not persist publish progress; continuing current Meta session: ${err.message}`);
  }
}

async function validateExistingChildren(childIds) {
  if (!Array.isArray(childIds) || !childIds.length) return [];
  try {
    for (const id of childIds) await waitContainer(id, 120000);
    return childIds;
  } catch (err) {
    console.warn(`[instagram] Saved child container state is no longer reusable: ${err.message}`);
    return [];
  }
}

export async function publishCarousel(imageUrls, caption, { resumeState = {}, onProgress = null } = {}) {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`Carousel needs 2-10 items, received ${imageUrls.length}`);
  }

  const existing = await findExistingPublishedMedia(caption);
  if (existing) {
    console.log(`[instagram] Exact carousel already exists as media ${existing.id}; recovering instead of duplicating.`);
    return { id: existing.id, recovered: true };
  }

  const progress = {
    child_ids: await validateExistingChildren(resumeState.child_ids),
    carousel_id: String(resumeState.carousel_id || "")
  };

  // If saved children do not exactly match the current number of carousel items,
  // rebuild the Meta session, but reuse all AI/GitHub assets.
  if (progress.child_ids.length > imageUrls.length) progress.child_ids = [];

  for (let i = progress.child_ids.length; i < imageUrls.length; i++) {
    const child = await igPost(`${cfg.igUserId}/media`, {
      image_url: imageUrls[i],
      is_carousel_item: "true"
    }, 5);
    if (!child?.id) throw new Error(`Instagram returned no child container ID for slide ${i + 1}`);
    progress.child_ids.push(String(child.id));
    await safeProgress(onProgress, progress);
  }

  for (const id of progress.child_ids) await waitContainer(id);

  if (progress.carousel_id) {
    try {
      await waitContainer(progress.carousel_id, 180000);
    } catch (err) {
      console.warn(`[instagram] Saved carousel container cannot be reused: ${err.message}`);
      progress.carousel_id = "";
      await safeProgress(onProgress, progress);
    }
  }

  if (!progress.carousel_id) {
    const carousel = await igPost(`${cfg.igUserId}/media`, {
      media_type: "CAROUSEL",
      children: progress.child_ids.join(","),
      caption
    }, 5);
    if (!carousel?.id) throw new Error("Instagram returned no carousel container ID");
    progress.carousel_id = String(carousel.id);
    await safeProgress(onProgress, progress);
    await waitContainer(progress.carousel_id);
  }

  try {
    const published = await igPost(`${cfg.igUserId}/media_publish`, {
      creation_id: progress.carousel_id
    }, 5);
    if (!published?.id) throw new Error("Instagram media_publish returned no media ID");
    return published;
  } catch (err) {
    // The request may have succeeded on Meta even if the response was lost.
    console.warn(`[instagram] media_publish did not return cleanly: ${err.message}`);
    for (let check = 1; check <= 4; check++) {
      await sleep(5000 * check);
      const recovered = await findExistingPublishedMedia(caption);
      if (recovered) {
        console.log(`[instagram] Publish was successful; recovered media ${recovered.id}.`);
        return { id: recovered.id, recovered: true };
      }
    }
    throw err;
  }
}
