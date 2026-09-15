#!/usr/bin/env python3
from pathlib import Path

OPENAI = Path("src/openai.mjs")
s = OPENAI.read_text(encoding="utf-8")

helper = r'''
async function pollBackgroundResponse(responseId) {
  const deadline = Date.now() + 10 * 60 * 1000;
  let transientFailures = 0;

  while (Date.now() < deadline) {
    await sleep(4000);
    try {
      const res = await fetch(`${API}/responses/${encodeURIComponent(responseId)}`, {
        headers: {
          "Authorization": `Bearer ${cfg.openaiKey}`,
          "X-Client-Request-Id": makeClientRequestId("tp-poll")
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20000)
      });
      const json = await parseJsonResponse(res);
      if (!res.ok || json?.error) {
        const apiError = json?.error || json || {};
        throw new OpenAIRequestError(
          `OpenAI background response poll failed (${res.status}): ${apiError.message || JSON.stringify(json)}`,
          { status: res.status, code: String(apiError.code || apiError.type || "") }
        );
      }

      transientFailures = 0;
      const status = String(json?.status || "unknown");
      if (["completed", "failed", "cancelled", "incomplete"].includes(status)) return json;
      console.log(`[openai] background response ${responseId} status=${status}`);
    } catch (err) {
      transientFailures += 1;
      if (isFatalAccountError(err) || isNonRetryableClientError(err) || transientFailures >= 4) throw err;
      console.warn(`[openai] background poll transient failure ${transientFailures}/4: ${err.message}`);
    }
  }

  throw new OpenAINetworkAmbiguousError(
    `OpenAI background response ${responseId} did not finish within 10 minutes; refusing to submit a duplicate paid request.`
  );
}
'''.strip()

anchor = 'async function openaiFetch(pathname, body) {'
if helper not in s:
    if anchor not in s:
        raise SystemExit("background policy: openaiFetch anchor not found")
    s = s.replace(anchor, helper + "\n\n" + anchor, 1)

old = '''    res = await fetch(`${API}${pathname}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.openaiKey}`,
        "Content-Type": "application/json",
        "X-Client-Request-Id": clientRequestId
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000)
    });'''
new = '''    const isResponseGeneration = pathname === "/responses";
    const requestBody = isResponseGeneration ? { ...body, background: true } : body;
    res = await fetch(`${API}${pathname}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.openaiKey}`,
        "Content-Type": "application/json",
        "X-Client-Request-Id": clientRequestId
      },
      body: JSON.stringify(requestBody),
      // Background Responses should acknowledge quickly; image generation stays synchronous.
      signal: AbortSignal.timeout(isResponseGeneration ? 45000 : 180000)
    });'''
if new not in s:
    if old not in s:
        raise SystemExit("background policy: POST fetch block not found")
    s = s.replace(old, new, 1)

old_return = '''  return json;
}

function isTransientHttpError(err) {'''
new_return = '''  if (pathname === "/responses" && json?.id) {
    const status = String(json?.status || "unknown");
    if (!["completed", "failed", "cancelled", "incomplete"].includes(status)) {
      console.log(`[openai] background response created: ${json.id} status=${status}`);
      return await pollBackgroundResponse(json.id);
    }
  }
  return json;
}

function isTransientHttpError(err) {'''
if new_return not in s:
    if old_return not in s:
        raise SystemExit("background policy: openaiFetch return anchor not found")
    s = s.replace(old_return, new_return, 1)

# Responses API web_search sources are source objects whose URL does not
# necessarily carry type="url". Traverse only response.output, but accept
# every http(s) `url` field there so action.sources evidence is preserved.
old_extract = '''function extractSearchUrls(json) {
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
}'''
new_extract = '''function extractSearchUrls(json) {
  const urls = new Set();
  const visit = value => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object") return;
    if (typeof value.url === "string" && /^https?:\\/\\//i.test(value.url)) urls.add(value.url);
    Object.values(value).forEach(visit);
  };
  visit(json.output || []);
  return [...urls];
}'''
if new_extract not in s:
    if old_extract not in s:
        raise SystemExit("background policy: extractSearchUrls anchor not found")
    s = s.replace(old_extract, new_extract, 1)

OPENAI.write_text(s, encoding="utf-8")
print("Background Responses policy applied: one paid POST, free polling, and complete web-search evidence extraction.")
