import { cfg } from "./config.mjs";

const base = () => `https://graph.instagram.com/${cfg.igVersion}`;

async function igPost(path, params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.set(k, String(v));

  const res = await fetch(`${base()}/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.igToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`Instagram POST ${path} failed: ${JSON.stringify(json)}`);
  return json;
}

async function igGet(path, params = {}) {
  const url = new URL(`${base()}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${cfg.igToken}` },
    cache: "no-store"
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`Instagram GET ${path} failed: ${JSON.stringify(json)}`);
  return json;
}

async function waitContainer(id, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await igGet(id, { fields: "status_code,status" });
    if (["FINISHED", "PUBLISHED"].includes(status.status_code)) return;
    if (["ERROR", "EXPIRED"].includes(status.status_code)) {
      throw new Error(`Instagram container ${id} failed: ${JSON.stringify(status)}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Instagram container timeout: ${id}`);
}

export async function publishCarousel(imageUrls, caption) {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`Carousel needs 2-10 items, received ${imageUrls.length}`);
  }

  const childIds = [];
  for (const imageUrl of imageUrls) {
    const child = await igPost(`${cfg.igUserId}/media`, {
      image_url: imageUrl,
      is_carousel_item: "true"
    });
    childIds.push(child.id);
  }

  for (const id of childIds) await waitContainer(id);

  const carousel = await igPost(`${cfg.igUserId}/media`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption
  });
  await waitContainer(carousel.id);

  return igPost(`${cfg.igUserId}/media_publish`, {
    creation_id: carousel.id
  });
}
