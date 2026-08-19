import { cfg } from "./config.mjs";

const API = "https://api.openai.com/v1";

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

let fatalAccountFailure = null;
let apiCallCount = 0;

export function isFatalAccountError(err) {
  if (!(err instanceof OpenAIRequestError)) return false;
  if ([401, 403].includes(err.status)) return true;

  const text = `${err.code} ${err.message}`.toLowerCase();
  return [
    "insufficient_quota",
    "billing_hard_limit_reached",
    "billing_not_active",
    "invalid_api_key",
    "no credits remaining"
  ].some(x => text.includes(x));
}

export function isFatalOpenAIError(err) {
  return isFatalAccountError(err) || err instanceof OpenAIBudgetGuardError;
}

function assertOpenAIBudget(path) {
  if (fatalAccountFailure) throw fatalAccountFailure;

  if (apiCallCount >= cfg.maxOpenAICalls) {
    throw new OpenAIBudgetGuardError(
      `OpenAI safety budget reached: ${apiCallCount}/${cfg.maxOpenAICalls} calls. ` +
      `Stopping before another paid API request (${path}).`
    );
  }

  apiCallCount += 1;
  console.log(`[openai] API call ${apiCallCount}/${cfg.maxOpenAICalls}: ${path}`);
}

async function openaiFetch(path, body) {
  // Once OpenAI says the account/key cannot make paid requests, do not send
  // any more API calls during this run. The hard per-run call cap also prevents
  // accidental retry loops from consuming an unexpected balance.
  assertOpenAIBudget(path);

  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.openaiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  let json;
  try {
    json = await res.json();
  } catch {
    json = { error: { message: `Non-JSON OpenAI response (HTTP ${res.status})` } };
  }

  if (!res.ok) {
    const apiError = json?.error || json || {};
    const code = String(apiError.code || apiError.type || "");
    const retryAfter = Number(res.headers.get("retry-after") || 0);
    const err = new OpenAIRequestError(
      `OpenAI ${path} failed (${res.status}): ${apiError.message || JSON.stringify(json)}`,
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

function isTransientError(err) {
  return err instanceof OpenAIRequestError && (err.status === 429 || err.status >= 500);
}

function requestRetryDelay(err, attempt) {
  if (err instanceof OpenAIRequestError && err.retryAfterMs > 0) {
    return Math.min(err.retryAfterMs, 30000);
  }
  return attempt === 1 ? 6000 : 15000;
}

async function openaiFetchWithRetry(path, body, maxAttempts = 2) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await openaiFetch(path, body);
    } catch (err) {
      lastError = err;
      if (isFatalOpenAIError(err) || !isTransientError(err) || attempt >= maxAttempts) throw err;

      const delay = requestRetryDelay(err, attempt);
      console.warn(
        `[openai] ${path} transient failure on attempt ${attempt}/${maxAttempts}; ` +
        `retrying in ${Math.round(delay / 1000)}s.`
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error(`OpenAI ${path} failed`);
}

function extractOutputText(json) {
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }

  const chunks = [];
  for (const item of json.output || []) {
    if (item?.type !== "message") continue;
    for (const part of item.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function extractSearchUrls(json) {
  const urls = new Set();

  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const x of value) visit(x);
      return;
    }
    if (typeof value !== "object") return;

    if (value.type === "url" && typeof value.url === "string") urls.add(value.url);
    if (value.type === "url_citation" && typeof value.url === "string") urls.add(value.url);
    if (["open_page", "find_in_page"].includes(value.type) && typeof value.url === "string") urls.add(value.url);

    for (const child of Object.values(value)) visit(child);
  };

  visit(json.output || []);
  return [...urls];
}

export async function structuredWebResponse({
  model,
  prompt,
  schema,
  schemaName,
  allowedDomains,
  searchContextSize = "medium"
}) {
  const tool = { type: "web_search", search_context_size: searchContextSize };
  if (allowedDomains?.length) {
    tool.filters = { allowed_domains: allowedDomains };
  }

  const json = await openaiFetchWithRetry("/responses", {
    model,
    store: false,
    tools: [tool],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    input: prompt,
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema
      }
    }
  }, 2);

  const text = extractOutputText(json);
  if (!text) throw new Error(`No text output from ${schemaName}`);

  let value;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid structured JSON from ${schemaName}: ${err.message}`);
  }

  const searchUrls = extractSearchUrls(json);
  if (!searchUrls.length) {
    throw new Error(`No web-search evidence returned for ${schemaName}`);
  }

  console.log(`[evidence] ${schemaName}: ${searchUrls.length} web source URL(s)`);
  return { value, searchUrls };
}

function isPromptLevelError(err) {
  if (!(err instanceof OpenAIRequestError) || err.status !== 400) return false;
  const text = `${err.code} ${err.message}`.toLowerCase();
  return ["safety", "policy", "moderation", "content", "prompt"].some(x => text.includes(x));
}

function imageRetryDelay(err, attempt) {
  if (err instanceof OpenAIRequestError && err.retryAfterMs > 0) {
    return Math.min(err.retryAfterMs, 30000);
  }
  return attempt === 1 ? 5000 : 12000;
}

export async function generateImage(prompt, fallbackPrompt = "", safePrompt = "") {
  const prompts = [...new Set([prompt, fallbackPrompt, safePrompt].filter(Boolean))];
  let lastError;

  for (let promptIndex = 0; promptIndex < prompts.length; promptIndex++) {
    const currentPrompt = prompts[promptIndex];

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[image] Generating with prompt ${promptIndex + 1}/${prompts.length}, attempt ${attempt}/2`);
        const json = await openaiFetch("/images/generations", {
          model: cfg.imageModel,
          prompt: currentPrompt,
          size: "1024x1536",
          quality: cfg.imageQuality,
          output_format: "png"
        });

        const item = json.data?.[0];
        if (!item) throw new Error("OpenAI image generation returned no image");
        if (item.b64_json) return Buffer.from(item.b64_json, "base64");
        if (item.url) {
          const res = await fetch(item.url);
          if (!res.ok) throw new Error(`Could not download generated image: ${res.status}`);
          return Buffer.from(await res.arrayBuffer());
        }
        throw new Error("Image response contained neither b64_json nor url");
      } catch (err) {
        lastError = err;
        console.warn(`[image] Attempt failed: ${err.message}`);

        if (isFatalOpenAIError(err)) throw err;
        if (isPromptLevelError(err)) break;

        if (attempt < 2) {
          const delay = isTransientError(err) ? imageRetryDelay(err, attempt) : 3000;
          console.warn(`[image] Waiting ${Math.round(delay / 1000)}s before retry.`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
  }

  throw lastError || new Error("Image generation failed for all prompts");
}
