import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { cfg } from "./config.mjs";
import { commitAndPush } from "./git.mjs";

const API = "https://api.openai.com/v1";
const CACHE_FILE = path.resolve("data/openai-cache.json");
const CACHEABLE_SCHEMAS = new Set(["trendypatike_post", "trendypatike_verified_post"]);
const CACHE_TTL_MS = 72 * 60 * 60 * 1000;

class OpenAIRequestError extends Error {
  constructor(message, { status = 0, code = "", retryAfterMs = 0 } = {}) {
    super(message);
    this.name = "OpenAIRequestError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

class OpenAIBudgetGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = "OpenAIBudgetGuardError";
  }
}

class OpenAIStructuredResponseError extends Error {
  constructor(message, { reason = "", retryable = false } = {}) {
    super(message);
    this.name = "OpenAIStructuredResponseError";
    this.reason = reason;
    this.retryable = retryable;
  }
}

class OpenAINetworkAmbiguousError extends Error {
  constructor(message) {
    super(message);
    this.name = "OpenAINetworkAmbiguousError";
  }
}

let fatalAccountFailure = null;
let apiCallCount = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function isFatalAccountError(err) {
  if (!(err instanceof OpenAIRequestError)) return false;
  if ([401, 402, 403].includes(err.status)) return true;
  const text = `${err.code} ${err.message}`.toLowerCase();
  return [
    "insufficient_quota", "quota_exceeded", "billing_hard_limit_reached",
    "billing_not_active", "invalid_api_key", "no credits remaining", "credit balance"
  ].some(x => text.includes(x));
}

function isNonRetryableClientError(err) {
  return err instanceof OpenAIRequestError &&
    err.status >= 400 && err.status < 500 &&
    ![408, 409, 429].includes(err.status);
}

export function isFatalOpenAIError(err) {
  return isFatalAccountError(err) ||
    isNonRetryableClientError(err) ||
    err instanceof OpenAIBudgetGuardError ||
    err instanceof OpenAIStructuredResponseError ||
    err instanceof OpenAINetworkAmbiguousError;
}

function assertOpenAIBudget(pathname) {
  if (fatalAccountFailure) throw fatalAccountFailure;
  if (apiCallCount >= cfg.maxOpenAICalls) {
    throw new OpenAIBudgetGuardError(
      `OpenAI safety budget reached: ${apiCallCount}/${cfg.maxOpenAICalls} calls. ` +
      `Stopping before another paid API request (${pathname}).`
    );
  }
  apiCallCount += 1;
  console.log(`[openai] API call ${apiCallCount}/${cfg.maxOpenAICalls}: ${pathname}`);
}

function makeClientRequestId(prefix = "tp") {
  return `${prefix}-${randomUUID()}`;
}

async function parseJsonResponse(res) {
  try {
    return await res.json();
  } catch {
    return { error: { message: `Non-JSON OpenAI response (HTTP ${res.status})` } };
  }
}

async function openaiFetch(pathname, body) {
  assertOpenAIBudget(pathname);
  const clientRequestId = makeClientRequestId(pathname.includes("images") ? "tp-img" : "tp-resp");
  let res;

  try {
    res = await fetch(`${API}${pathname}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.openaiKey}`,
        "Content-Type": "application/json",
        "X-Client-Request-Id": clientRequestId
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000)
    });
  } catch (err) {
    throw new OpenAINetworkAmbiguousError(
      `OpenAI ${pathname} network/timeout failure after request ${clientRequestId}: ${err.message}`
    );
  }

  const json = await parseJsonResponse(res);
  const serverRequestId = res.headers.get("x-request-id");
  if (serverRequestId) console.log(`[openai] x-request-id=${serverRequestId}`);

  if (!res.ok || json?.error) {
    const apiError = json?.error || json || {};
    const code = String(apiError.code || apiError.type || "");
    const retryAfter = Number(res.headers.get("retry-after") || 0);
    const err = new OpenAIRequestError(
      `OpenAI ${pathname} failed (${res.status}): ${apiError.message || JSON.stringify(json)}`,
      {
        status: res.status,
        code,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0
      }
    );
    if (isFatalAccountError(err)) fatalAccountFailure = err;
    throw err;
  }
  return json;
}

function isTransientHttpError(err) {
  return err instanceof OpenAIRequestError && [408, 409, 429].includes(err.status) ||
    err instanceof OpenAIRequestError && err.status >= 500;
}

function requestRetryDelay(err, attempt) {
  if (err instanceof OpenAIRequestError && err.retryAfterMs > 0) return Math.min(err.retryAfterMs, 45000);
  return attempt === 1 ? 6000 : 15000;
}

async function openaiFetchWithRetry(pathname, body, maxAttempts = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await openaiFetch(pathname, body);
    } catch (err) {
      lastError = err;
      if (isFatalOpenAIError(err) || !isTransientHttpError(err) || attempt >= maxAttempts) throw err;
      const delay = requestRetryDelay(err, attempt);
      console.warn(`[openai] ${pathname} transient HTTP failure ${attempt}/${maxAttempts}; retry in ${Math.round(delay / 1000)}s.`);
      await sleep(delay);
    }
  }
  throw lastError || new Error(`OpenAI ${pathname} failed`);
}

async function modelGet(model) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${API}/models/${encodeURIComponent(model)}`, {
        headers: {
          "Authorization": `Bearer ${cfg.openaiKey}`,
          "X-Client-Request-Id": makeClientRequestId("tp-preflight")
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20000)
      });
      const json = await parseJsonResponse(res);
      if (res.ok && !json?.error) return json;
      const apiError = json?.error || json || {};
      throw new OpenAIRequestError(
        `OpenAI model preflight failed for ${model} (${res.status}): ${apiError.message || JSON.stringify(json)}`,
        { status: res.status, code: String(apiError.code || apiError.type || "") }
      );
    } catch (err) {
      lastError = err;
      if (err instanceof OpenAIRequestError && err.status >= 400 && err.status < 500) throw err;
      if (attempt < 2) await sleep(2000);
    }
  }
  throw lastError || new Error(`OpenAI model preflight failed for ${model}`);
}

export async function verifyOpenAIModelAccess({ text = true, image = true } = {}) {
  if (!cfg.openaiKey) throw new Error("Missing OPENAI_API_KEY");
  const models = new Set();
  if (text) {
    models.add(cfg.textModel);
    models.add(cfg.verifyModel);
  }
  if (image) models.add(cfg.imageModel);
  for (const model of models) await modelGet(model);
  console.log(`[openai] Free model-access preflight OK: ${[...models].join(", ")}`);
}

function extractOutputText(json) {
  if (typeof json.output_text === "string" && json.output_text.trim()) return json.output_text.trim();
  const chunks = [];
  for (const item of json.output || []) {
    if (item?.type !== "message") continue;
    for (const part of item.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") chunks.push(part.text);
    }
  }
  return chunks.join("\n").trim();
}

function extractSearchUrls(json) {
  const urls = new Set();
  const visit = value => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object") return;
    if (value.type === "url" && typeof value.url === "string") urls.add(value.url);
    if (value.type === "url_citation" && typeof value.url === "string") urls.add(value.url);
    if (["open_page", "find_in_page"].includes(value.type) && typeof value.url === "string") urls.add(value.url);
    Object.values(value).forEach(visit);
  };
  visit(json.output || []);
  return [...urls];
}

function usageSummary(json) {
  const outputTokens = Number(json?.usage?.output_tokens || 0);
  const reasoningTokens = Number(json?.usage?.output_tokens_details?.reasoning_tokens || 0);
  return `output_tokens=${outputTokens}, reasoning_tokens=${reasoningTokens}`;
}

function assertCompletedResponse(json, schemaName) {
  const status = String(json?.status || "unknown");
  if (status === "completed") return;
  if (status === "incomplete") {
    const reason = String(json?.incomplete_details?.reason || "unknown");
    throw new OpenAIStructuredResponseError(
      `OpenAI returned incomplete ${schemaName} response (${reason}; ${usageSummary(json)})`,
      { reason, retryable: ["max_output_tokens", "max_tokens"].includes(reason) }
    );
  }
  throw new OpenAIStructuredResponseError(
    `OpenAI did not complete ${schemaName}: ${json?.error?.message || `status=${status}`}`,
    { reason: status, retryable: false }
  );
}

function cacheKey(args) {
  return createHash("sha256").update(JSON.stringify({
    ...args,
    allowedDomains: [...(args.allowedDomains || [])].sort()
  })).digest("hex");
}

async function readCache() {
  try {
    const parsed = JSON.parse(await fs.readFile(CACHE_FILE, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    if (err?.code === "ENOENT") return {};
    console.warn(`[cache] Could not read OpenAI recovery cache: ${err.message}`);
    return {};
  }
}

async function atomicWriteCache(value) {
  const temp = `${CACHE_FILE}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temp, CACHE_FILE);
}

async function cachedStructuredResult(key, schemaName) {
  if (!CACHEABLE_SCHEMAS.has(schemaName)) return null;
  const cache = await readCache();
  const entry = cache[key];
  if (!entry?.saved_at || !entry?.value || !Array.isArray(entry.searchUrls)) return null;
  const age = Date.now() - Date.parse(entry.saved_at);
  if (!Number.isFinite(age) || age < 0 || age > CACHE_TTL_MS) return null;
  console.log(`[cache] Reusing paid ${schemaName} result from ${entry.saved_at}; no OpenAI call needed.`);
  return { value: entry.value, searchUrls: entry.searchUrls };
}

async function persistStructuredResult(key, schemaName, result) {
  if (!CACHEABLE_SCHEMAS.has(schemaName)) return;
  try {
    const cache = await readCache();
    cache[key] = {
      saved_at: new Date().toISOString(),
      schema_name: schemaName,
      value: result.value,
      searchUrls: result.searchUrls
    };
    const trimmed = Object.fromEntries(
      Object.entries(cache)
        .sort((a, b) => Date.parse(b[1]?.saved_at || 0) - Date.parse(a[1]?.saved_at || 0))
        .slice(0, 16)
    );
    await atomicWriteCache(trimmed);
    if (process.env.GITHUB_ACTIONS === "true" && !cfg.dryRun) {
      try {
        commitAndPush([CACHE_FILE], `Checkpoint paid OpenAI ${schemaName}`, 6);
      } catch (err) {
        console.warn(`[cache] GitHub cache checkpoint failed but current result is usable: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`[cache] Could not save OpenAI recovery cache: ${err.message}`);
  }
}

function normalizeReasoningEffort(value = "low") {
  const allowed = new Set(["low", "medium", "high"]);
  const normalized = String(value).toLowerCase();
  return allowed.has(normalized) ? normalized : "low";
}

export async function structuredWebResponse({
  model,
  prompt,
  schema,
  schemaName,
  allowedDomains,
  searchContextSize = "medium",
  maxToolCalls = 2,
  maxOutputTokens = 12000,
  reasoningEffort = "low"
}) {
  const normalizedMaxToolCalls = Math.max(1, Math.min(Number(maxToolCalls) || 2, 5));
  const normalizedMaxOutputTokens = Math.max(2000, Math.min(Number(maxOutputTokens) || 12000, 24000));
  const normalizedReasoningEffort = normalizeReasoningEffort(reasoningEffort);
  const key = cacheKey({
    model, prompt, schema, schemaName, allowedDomains, searchContextSize,
    maxToolCalls: normalizedMaxToolCalls,
    maxOutputTokens: normalizedMaxOutputTokens,
    reasoningEffort: normalizedReasoningEffort
  });

  const cached = await cachedStructuredResult(key, schemaName);
  if (cached) return cached;

  const tool = { type: "web_search", search_context_size: searchContextSize };
  if (allowedDomains?.length) tool.filters = { allowed_domains: allowedDomains };

  let lastError = null;
  for (let structuredAttempt = 1; structuredAttempt <= 2; structuredAttempt++) {
    const outputBudget = structuredAttempt === 1
      ? normalizedMaxOutputTokens
      : Math.min(24000, Math.max(normalizedMaxOutputTokens + 6000, Math.ceil(normalizedMaxOutputTokens * 1.5)));

    try {
      const json = await openaiFetchWithRetry("/responses", {
        model,
        store: false,
        tools: [tool],
        tool_choice: "required",
        max_tool_calls: normalizedMaxToolCalls,
        max_output_tokens: outputBudget,
        reasoning: { effort: normalizedReasoningEffort },
        prompt_cache_key: `trendypatike-${key.slice(0, 48)}`,
        include: ["web_search_call.action.sources"],
        input: prompt,
        text: {
          verbosity: "low",
          format: { type: "json_schema", name: schemaName, strict: true, schema }
        }
      }, 2);

      assertCompletedResponse(json, schemaName);
      const text = extractOutputText(json);
      if (!text) {
        throw new OpenAIStructuredResponseError(
          `No text output from completed ${schemaName} (${usageSummary(json)})`,
          { reason: "empty_output", retryable: true }
        );
      }

      let value;
      try {
        value = JSON.parse(text);
      } catch (err) {
        throw new OpenAIStructuredResponseError(
          `Invalid structured JSON from ${schemaName}: ${err.message} (${usageSummary(json)})`,
          { reason: "invalid_json", retryable: true }
        );
      }

      const searchUrls = extractSearchUrls(json);
      if (!searchUrls.length) {
        throw new OpenAIStructuredResponseError(
          `No web-search evidence returned for ${schemaName}`,
          { reason: "missing_evidence", retryable: true }
        );
      }

      console.log(`[evidence] ${schemaName}: ${searchUrls.length} web source URL(s)`);
      const result = { value, searchUrls };
      await persistStructuredResult(key, schemaName, result);
      return result;
    } catch (err) {
      lastError = err;
      if (isFatalAccountError(err) || err instanceof OpenAIBudgetGuardError || err instanceof OpenAINetworkAmbiguousError) throw err;
      const retryable = err instanceof OpenAIStructuredResponseError && err.retryable;
      if (!retryable || structuredAttempt >= 2) throw err;
      console.warn(`[structured] ${schemaName} malformed/incomplete; retrying SAME request once with larger output budget.`);
      await sleep(3000);
    }
  }
  throw lastError || new Error(`Structured response failed for ${schemaName}`);
}

function isPromptLevelError(err) {
  if (!(err instanceof OpenAIRequestError) || err.status !== 400) return false;
  const text = `${err.code} ${err.message}`.toLowerCase();
  return ["safety", "policy", "moderation", "content", "prompt"].some(x => text.includes(x));
}

async function downloadGeneratedImage(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 1000) throw new Error("downloaded image was unexpectedly small");
      return buffer;
    } catch (err) {
      lastError = err;
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  throw new OpenAINetworkAmbiguousError(`Generated image URL could not be downloaded without regenerating: ${lastError?.message}`);
}

export async function generateImage(prompt, fallbackPrompt = "", safePrompt = "") {
  const prompts = [...new Set([prompt, fallbackPrompt, safePrompt].filter(Boolean))];
  if (!prompts.length) throw new Error("No image prompt provided");

  let promptIndex = 0;
  let lastError = null;
  const maxPaidAttempts = 3;

  for (let paidAttempt = 1; paidAttempt <= maxPaidAttempts; paidAttempt++) {
    const currentPrompt = prompts[Math.min(promptIndex, prompts.length - 1)];
    try {
      console.log(`[image] Paid image attempt ${paidAttempt}/${maxPaidAttempts}, prompt ${promptIndex + 1}/${prompts.length}`);
      const json = await openaiFetch("/images/generations", {
        model: cfg.imageModel,
        prompt: currentPrompt,
        size: "1024x1536",
        quality: cfg.imageQuality,
        output_format: "png"
      });

      const item = json.data?.[0];
      if (!item) throw new Error("OpenAI image generation returned no image item");
      if (item.b64_json) {
        const buffer = Buffer.from(item.b64_json, "base64");
        if (buffer.length < 1000) throw new Error("OpenAI image payload was unexpectedly small");
        return buffer;
      }
      if (item.url) return downloadGeneratedImage(item.url);
      throw new Error("Image response contained neither b64_json nor url");
    } catch (err) {
      lastError = err;
      console.warn(`[image] Attempt ${paidAttempt}/${maxPaidAttempts} failed: ${err.message}`);

      if (isPromptLevelError(err)) {
        promptIndex = Math.min(promptIndex + 1, prompts.length - 1);
      } else if (isFatalOpenAIError(err)) {
        throw err;
      } else if (isTransientHttpError(err)) {
        if (paidAttempt < maxPaidAttempts) await sleep(requestRetryDelay(err, paidAttempt));
      } else {
        promptIndex = Math.min(promptIndex + 1, prompts.length - 1);
      }
    }
  }

  throw lastError || new Error("Image generation failed after bounded attempts");
}
