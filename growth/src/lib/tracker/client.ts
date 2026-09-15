type TrackPayload = {
  type: 'page_view' | 'click' | 'scroll' | 'rage_click' | 'add_to_cart' | 'checkout_started' | 'purchase';
  path: string;
  ts: number;
  sessionId: string;
  meta?: Record<string, string | number | boolean | null>;
};

const SESSION_KEY = 'tp_growth_session';

function sessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export async function track(type: TrackPayload['type'], meta: TrackPayload['meta'] = {}) {
  const payload: TrackPayload = {
    type,
    path: location.pathname,
    ts: Date.now(),
    sessionId: sessionId(),
    meta
  };

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    return;
  }

  await fetch('/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true
  });
}

export function installBehaviorTracking() {
  let lastScrollBucket = -1;
  const clicks: number[] = [];

  track('page_view', {
    referrer: document.referrer || null,
    utm_source: new URLSearchParams(location.search).get('utm_source'),
    utm_campaign: new URLSearchParams(location.search).get('utm_campaign'),
    fbclid: new URLSearchParams(location.search).get('fbclid')
  });

  addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (max <= 0) return;
    const pct = Math.min(100, Math.round((scrollY / max) * 100));
    const bucket = Math.floor(pct / 25) * 25;
    if (bucket > lastScrollBucket) {
      lastScrollBucket = bucket;
      track('scroll', { depth: bucket });
    }
  }, { passive: true });

  addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const now = Date.now();
    clicks.push(now);
    while (clicks.length && now - clicks[0] > 1500) clicks.shift();

    const safeTarget = target.closest('button,a,[role="button"],[data-track]') as HTMLElement | null;
    const label = safeTarget?.getAttribute('data-track') || safeTarget?.textContent?.trim().slice(0, 60) || target.tagName;
    track('click', { target: label });

    if (clicks.length >= 5) {
      track('rage_click', { target: label, count: clicks.length });
      clicks.length = 0;
    }
  }, { passive: true });
}
