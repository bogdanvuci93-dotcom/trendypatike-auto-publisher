import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SHOP_ORIGIN = 'https://trendypatike.com';

function safeStorefrontUrl(rawPath: string | null) {
  const path = rawPath && rawPath.startsWith('/') ? rawPath : '/';
  const target = new URL(path, SHOP_ORIGIN);
  if (target.origin !== SHOP_ORIGIN) throw error(400, 'Invalid storefront path');
  return target;
}

function makeStaticSnapshot(html: string) {
  let out = html;

  // The snapshot is visual only. Remove executable/embedded content so opening a
  // heatmap cannot submit forms, fire storefront analytics or run theme scripts.
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  out = out.replace(/<script\b[^>]*\/\s*>/gi, '');
  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '');
  out = out.replace(/<meta\b[^>]*http-equiv=["']?content-security-policy["']?[^>]*>/gi, '');
  out = out.replace(/<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, '');

  const injected = `
    <base href="${SHOP_ORIGIN}/">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <style id="tp-growth-snapshot-style">
      html,body{margin:0!important;min-height:100%!important;overflow:visible!important;}
      html{scroll-behavior:auto!important;}
      body{pointer-events:none!important;user-select:none!important;}
      a,button,input,select,textarea,form,[role="button"]{pointer-events:none!important;}
      [data-tp-growth-snapshot-hidden]{display:none!important;}
    </style>
  `;

  if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b([^>]*)>/i, `<head$1>${injected}`);
  } else {
    out = injected + out;
  }
  return out;
}

export const GET: RequestHandler = async ({ url, fetch }) => {
  const target = safeStorefrontUrl(url.searchParams.get('path'));
  const upstream = await fetch(target.toString(), {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'TrendyPatike-Growth-Heatmap-Snapshot/1.0'
    },
    redirect: 'follow'
  });

  if (!upstream.ok) throw error(502, `Storefront snapshot failed (${upstream.status})`);
  const contentType = upstream.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) throw error(502, 'Storefront did not return HTML');

  const html = makeStaticSnapshot(await upstream.text());
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    }
  });
};
