import { redirect, json, type Handle } from '@sveltejs/kit';
import { verifyAdminCookie } from '$lib/server/auth';

const PUBLIC_PREFIXES = ['/_app/', '/favicon', '/robots.txt'];
const PUBLIC_PATHS = new Set([
  '/login',
  '/connect/shopify/callback',
  '/connect/meta/callback',
  '/tracker.js',
  '/replay.js',
  '/api/collect',
  '/api/replay/collect'
]);

export const handle: Handle = async ({ event, resolve }) => {
  const password = event.platform?.env?.DASHBOARD_PASSWORD as string | undefined;
  const encryptionKey = event.platform?.env?.APP_ENCRYPTION_KEY as string | undefined;

  if (!password || !encryptionKey) return resolve(event);

  const path = event.url.pathname;
  if (PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return resolve(event);
  }

  const ok = await verifyAdminCookie(event.cookies.get('tp_admin'), encryptionKey);
  if (ok) return resolve(event);

  if (path.startsWith('/api/')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  throw redirect(303, `/login?next=${encodeURIComponent(path + event.url.search)}`);
};
