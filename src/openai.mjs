import { cfg } from "./config.mjs";

const API = "https://api.openai.com/v1";

async function openaiFetch(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.openaiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`OpenAI ${path} failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
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

  for (const item of json.output || []) {
    if (item?.type === "web_search_call") {
      const action = item.action || {};
      if (typeof action.url === "string") urls.add(action.url);
      for (const source of action.sources || []) {
        if (source?.type === "url" && typeof source.url === "string") {
          urls.add(source.url);
        }
      }
    }

    if (item?.type === "message") {
      for (const part of item.content || []) {
        for (const annotation of part.annotations || []) {
          if (annotation?.type === "url_citation" && typeof annotation.url === "string") {
            urls.add(annotation.url);
          }
        }
      }
    }
  }

  return [...urls];
}

export async function structuredWebResponse({ model, prompt, schema, schemaName, allowedDomains }) {
  const tool = { type: "web_search", search_context_size: "high" };
  if (allowedDomains?.length) {
    tool.filters = { allowed_domains: allowedDomains };
  }

  const json = await openaiFetch("/responses", {
    model,
    store: false,
    tools: [tool],
    tool_choice: "required",
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
  });

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

  return { value, searchUrls };
}

export async function generateImage(prompt, fallbackPrompt = "") {
  const prompts = fallbackPrompt ? [prompt, fallbackPrompt] : [prompt];
  let lastError;

  for (const currentPrompt of prompts) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
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
        if (attempt < 2) await new Promise(r => setTimeout(r, 2500));
      }
    }
  }

  throw lastError;
}
