import { cfg } from "./config.mjs";

const base = () => `https://graph.instagram.com/${cfg.igVersion}`;

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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function retryDelay(err, attempt) {
  if (err?.retryAfterMs > 0) return Math.min(err.retryAfterMs, 30000);
  return Math.min(3000 * (2 ** (attempt - 1)), 20000);
}

function isTransientInstagramError(err) {
  if (!(err instanceof InstagramRequestError)) return false;
  if (err.status === 429 || err.status >= 500) return true;
  return [1, 2, 4, 17, 32, 613].includes(err.code);
}

async function parseResponse(res) {
  try {
    return await res.json();
  } catch {
    return { error: { message: `Non-JSON Instagram response (HTTP ${res.status})` } };
  }
}

async function igRequest(method, path, params = {}, maxAttempts = 4) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const url = new URL(`${base()}/${path}`);
      const options = {
        method,
        headers: { "Authorization": `Bearer ${cfg.igToken}` },
        cache: "no-store"
      };

      if (method === "GET") {
        for (const [key, value] of Object.entries(params)) {
          url.searchParams.set(key, String(value));
        }
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
        `Instagram ${method} ${path} failed (HTTP ${res.status}): ${apiError.message || JSON.stringify(json)}`,
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
        : new InstagramRequestError(`Instagram ${method} ${path} network failure: ${err.message}`,
          { status: 503 });

      if (!isTransientInstagramError(lastError) || attempt >= maxAttempts) throw lastError;

      const delay = retryDelay(lastError, attempt);
      console.warn(
        `[instagram] ${method} ${path} attempt ${attempt}/${maxAttempts} failed transiently; ` +
        `retrying in ${Math.round(delay / 1000)}s.`
      );
      await sleep(delay);
    }
  }

  throw lastError || new Error(`Instagram ${method} ${path} failed`);
}

async function igPost(path, params, maxAttempts = 4) {
  return igRequest("POST", path, params, maxAttempts);
}

async function igGet(path, params = {}, maxAttempts = 4) {
  return igRequest("GET", path, params, maxAttempts);
}

async function waitContainer(id, timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await igGet(id, { fields: "status_code,status" }, 4);
    if (["FINISHED", "PUBLISHED"].includes(status.status_code)) return status;
    if (["ERROR", "EXPIRED"].includes(status.status_code)) {
      throw new Error(`Instagram container ${id} failed: ${JSON.stringify(status)}`);
    }
    await sleep(5000);
  }
  throw new Error(`Instagram container timeout: ${id}`);
}

export async function verifyInstagramConnection({ probeImageUrl = "" } = {}) {
  const account = await igGet("me", {
    fields: "id,user_id,username,account_type"
  }, 4);

  const returnedIds = [account.user_id, account.id]
    .filter(Boolean)
    .map(String);

  if (!returnedIds.length) {
    throw new Error("Instagram preflight worked but returned no account ID");
  }

  if (cfg.igUserId && !returnedIds.includes(String(cfg.igUserId))) {
    throw new Error(
      `Instagram preflight IG_USER_ID mismatch: configured ${cfg.igUserId}, returned ${returnedIds.join(", ")}`
    );
  }

  console.log(`Instagram account preflight OK for @${account.username || "unknown"}`);

  if (probeImageUrl) {
    // Create but DO NOT publish a disposable carousel-item container. This
    // proves content-publish permission and proves Meta can fetch our public
    // GitHub JPEG before we spend anything on OpenAI.
    const probe = await igPost(`${cfg.igUserId}/media`, {
      image_url: probeImageUrl,
      is_carousel_item: "true"
    }, 4);
    if (!probe?.id) throw new Error("Instagram publishing preflight returned no container ID");
    await waitContainer(probe.id, 180000);
    console.log(`Instagram publishing preflight OK; disposable container ${probe.id} is ready and will not be published.`);
  }

  return account;
}

function normalizedCaption(value = "") {
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export async function findExistingPublishedMedia(caption, { limit = 12, lookbackHours = 48 } = {}) {
  const target = normalizedCaption(caption);
  if (!target) return null;

  const result = await igGet(`${cfg.igUserId}/media`, {
    fields: "id,caption,timestamp,media_type,permalink",
    limit
  }, 4);

  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
  for (const item of result.data || []) {
    const timestamp = Date.parse(item.timestamp || "");
    if (Number.isFinite(timestamp) && timestamp < cutoff) continue;
    if (normalizedCaption(item.caption) === target) return item;
  }

  return null;
}

export async function publishCarousel(imageUrls, caption) {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`Carousel needs 2-10 items, received ${imageUrls.length}`);
  }

  // Duplicate guard: if Meta already published the exact caption during a prior
  // run but GitHub state persistence failed afterwards, recover that media ID
  // instead of publishing the carousel a second time.
  const existing = await findExistingPublishedMedia(caption);
  if (existing) {
    console.log(`[instagram] Exact carousel already exists as media ${existing.id}; recovering instead of duplicating.`);
    return { id: existing.id, recovered: true };
  }

  const childIds = [];
  for (const imageUrl of imageUrls) {
    const child = await igPost(`${cfg.igUserId}/media`, {
      image_url: imageUrl,
      is_carousel_item: "true"
    }, 4);
    childIds.push(child.id);
  }

  for (const id of childIds) await waitContainer(id);

  const carousel = await igPost(`${cfg.igUserId}/media`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption
  }, 4);
  await waitContainer(carousel.id);

  try {
    const published = await igPost(`${cfg.igUserId}/media_publish`, {
      creation_id: carousel.id
    }, 4);
    if (!published?.id) throw new Error("Instagram media_publish returned no media ID");
    return published;
  } catch (err) {
    // A network/5xx failure can happen after Meta has already accepted the
    // publish request. Re-check the account before treating it as a failure.
    console.warn(`[instagram] media_publish did not return cleanly: ${err.message}`);
    await sleep(5000);
    const recovered = await findExistingPublishedMedia(caption);
    if (recovered) {
      console.log(`[instagram] Publish was actually successful; recovered media ${recovered.id}.`);
      return { id: recovered.id, recovered: true };
    }
    throw err;
  }
}
