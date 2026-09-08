(() => {
  if (window.__TP_GROWTH_TRACKER__) return;
  window.__TP_GROWTH_TRACKER__ = true;

  const allowedHosts = new Set(['trendypatike.com', 'www.trendypatike.com']);
  if (!allowedHosts.has(location.hostname)) return;
  if (/^\/(account|challenge|password)(\/|$)/.test(location.pathname)) return;

  const script = document.currentScript;
  if (!script || !script.src) return;
  const collector = `${new URL(script.src).origin}/api/collect`;
  const SID_KEY = 'tp_growth_sid';
  const START_KEY = 'tp_growth_started';
  const LAST_KEY = 'tp_growth_last';
  const SESSION_TTL = 30 * 60 * 1000;
  const now = Date.now();

  const uuid = () => {
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID().replace(/-/g, '_');
    return `tp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  };

  const previousLast = Number(localStorage.getItem(LAST_KEY) || 0);
  let sessionId = localStorage.getItem(SID_KEY) || '';
  let startedAt = Number(localStorage.getItem(START_KEY) || 0);
  const isNewSession = !sessionId || !startedAt || !previousLast || now - previousLast > SESSION_TTL;
  if (isNewSession) {
    sessionId = uuid();
    startedAt = now;
    localStorage.setItem(SID_KEY, sessionId);
    localStorage.setItem(START_KEY, String(startedAt));
  }
  localStorage.setItem(LAST_KEY, String(now));

  const params = new URLSearchParams(location.search);
  const safeReferrer = (() => {
    if (!document.referrer) return '';
    try {
      const u = new URL(document.referrer);
      return `${u.origin}${u.pathname}`.slice(0, 500);
    } catch {
      return '';
    }
  })();

  const session = {
    startedAt,
    lastSeenAt: now,
    landingPath: isNewSession ? location.pathname : (sessionStorage.getItem('tp_growth_landing') || location.pathname),
    referrer: isNewSession ? safeReferrer : (sessionStorage.getItem('tp_growth_ref') || ''),
    utmSource: isNewSession ? (params.get('utm_source') || '') : (sessionStorage.getItem('tp_growth_utm_source') || ''),
    utmCampaign: isNewSession ? (params.get('utm_campaign') || '') : (sessionStorage.getItem('tp_growth_utm_campaign') || ''),
    fbclid: isNewSession ? (params.get('fbclid') || '') : (sessionStorage.getItem('tp_growth_fbclid') || '')
  };

  if (isNewSession) {
    sessionStorage.setItem('tp_growth_landing', session.landingPath);
    sessionStorage.setItem('tp_growth_ref', session.referrer);
    sessionStorage.setItem('tp_growth_utm_source', session.utmSource);
    sessionStorage.setItem('tp_growth_utm_campaign', session.utmCampaign);
    sessionStorage.setItem('tp_growth_fbclid', session.fbclid);
  }

  let queue = [];
  let flushTimer = 0;
  const seen = new Map();

  const pathOnly = () => location.pathname.slice(0, 500) || '/';
  const push = (type, meta = {}, path = pathOnly()) => {
    const key = `${type}:${path}:${JSON.stringify(meta)}`;
    const t = Date.now();
    const last = seen.get(key) || 0;
    if ((type === 'add_to_cart' || type === 'checkout_started') && t - last < 1200) return;
    seen.set(key, t);
    queue.push({ type, path, ts: t, meta });
    localStorage.setItem(LAST_KEY, String(t));
    session.lastSeenAt = t;
    if (queue.length >= 10) flush();
    else if (!flushTimer) flushTimer = window.setTimeout(flush, 1800);
  };

  const flush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = 0;
    if (!queue.length) return;
    const events = queue.splice(0, 40);
    const payload = JSON.stringify({ sessionId, session, events });
    let sent = false;
    if (navigator.sendBeacon) {
      try { sent = navigator.sendBeacon(collector, payload); } catch { sent = false; }
    }
    if (!sent) {
      fetch(collector, { method: 'POST', body: payload, mode: 'cors', credentials: 'omit', keepalive: true }).catch(() => {});
    }
  };

  const device = innerWidth < 768 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop';
  if (isNewSession) {
    push('session_start', {
      vw: innerWidth,
      vh: innerHeight,
      screenW: screen.width,
      screenH: screen.height,
      device,
      lang: navigator.language || ''
    });
  }

  const recordPage = () => {
    push('page_view');
    if (location.pathname.startsWith('/products/')) {
      push('product_view', { handle: location.pathname.split('/products/')[1]?.split('/')[0] || '' });
    }
  };
  recordPage();

  const targetDescriptor = (node) => {
    const el = node instanceof Element ? node : null;
    if (!el) return '';
    const tag = el.tagName.toLowerCase();
    const id = el.id && /^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(el.id) ? `#${el.id}` : '';
    const classes = Array.from(el.classList || []).filter((c) => /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(c)).slice(0, 2).map((c) => `.${c}`).join('');
    return `${tag}${id}${classes}`.slice(0, 120);
  };

  const recentClicks = [];
  document.addEventListener('click', (event) => {
    const doc = document.documentElement;
    const docHeight = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0, innerHeight, 1);
    const xPct = Math.max(0, Math.min(100, (event.clientX / Math.max(innerWidth, 1)) * 100));
    const yPct = Math.max(0, Math.min(100, (event.clientY / Math.max(innerHeight, 1)) * 100));
    const docYPct = Math.max(0, Math.min(100, ((scrollY + event.clientY) / docHeight) * 100));
    const target = targetDescriptor(event.target);
    push('click', { xPct, yPct, docYPct, target });

    const t = Date.now();
    recentClicks.push({ t, x: event.clientX, y: event.clientY });
    while (recentClicks.length && t - recentClicks[0].t > 900) recentClicks.shift();
    if (recentClicks.length >= 3) {
      const a = recentClicks[recentClicks.length - 3];
      const close = Math.hypot(event.clientX - a.x, event.clientY - a.y) < 55;
      if (close) push('rage_click', { xPct, yPct, docYPct, target });
    }

    const el = event.target instanceof Element ? event.target.closest('a,button,[role="button"],input[type="submit"]') : null;
    if (!el) return;
    const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') || '' : '';
    const name = el.getAttribute('name') || '';
    const classes = el.getAttribute('class') || '';
    const dataAction = el.getAttribute('data-action') || el.getAttribute('data-add-to-cart') || '';
    if (/\/checkout(?:[/?#]|$)/.test(href) || name === 'checkout') {
      push('checkout_started', { source: target || 'click' });
    }
    if (name === 'add' || /add[-_ ]?to[-_ ]?cart/i.test(`${classes} ${dataAction}`)) {
      push('add_to_cart', { source: target || 'click' });
    }
  }, { capture: true, passive: true });

  document.addEventListener('submit', (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form) return;
    const action = form.getAttribute('action') || '';
    if (/\/cart\/add/.test(action)) push('add_to_cart', { source: 'form' });
    if (/\/checkout/.test(action)) push('checkout_started', { source: 'form' });
  }, true);

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const input = args[0];
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const response = await originalFetch(...args);
    try {
      const parsed = new URL(url, location.origin);
      if (response.ok && /\/cart\/add(?:\.js)?$/.test(parsed.pathname)) push('add_to_cart', { source: 'ajax' });
    } catch {}
    return response;
  };

  const milestones = [25, 50, 75, 90, 100];
  const reached = new Set();
  const onScroll = () => {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - innerHeight);
    const depth = Math.max(0, Math.min(100, Math.round((scrollY / max) * 100)));
    for (const milestone of milestones) {
      if (depth >= milestone && !reached.has(milestone)) {
        reached.add(milestone);
        push('scroll_depth', { depth: milestone });
      }
    }
  };
  addEventListener('scroll', onScroll, { passive: true });
  setTimeout(onScroll, 1000);

  const wrapHistory = (name) => {
    const original = history[name];
    history[name] = function (...args) {
      const result = original.apply(this, args);
      setTimeout(recordPage, 0);
      return result;
    };
  };
  wrapHistory('pushState');
  wrapHistory('replaceState');
  addEventListener('popstate', () => setTimeout(recordPage, 0));
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);
  setInterval(() => { session.lastSeenAt = Date.now(); localStorage.setItem(LAST_KEY, String(session.lastSeenAt)); flush(); }, 15000);
})();
