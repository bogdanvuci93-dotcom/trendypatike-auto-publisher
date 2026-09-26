const TZ = 'Europe/Belgrade';
const DAY = 86400000;

export type AnalyticsPeriod = {
  range: 'today' | 'yesterday' | '7d' | '30d' | 'date';
  start: number;
  end: number;
  label: string;
  date?: string;
};

export function dayKey(ms: number) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export function zonedStart(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return NaN;
  let guess = Date.UTC(y, m - 1, d);
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(guess));
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value || 0);
  const represented = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return guess - (represented - guess);
}

export function analyticsPeriod(url: URL): AnalyticsPeriod {
  const now = Date.now();
  const today = dayKey(now);
  const todayStart = zonedStart(today);
  const requested = String(url.searchParams.get('range') || 'today');

  if (requested === 'yesterday') {
    const key = dayKey(todayStart - 1);
    return { range: 'yesterday', start: zonedStart(key), end: todayStart, label: 'Juče', date: key };
  }
  if (requested === '7d') return { range: '7d', start: now - 7 * DAY, end: now, label: 'Poslednjih 7 dana' };
  if (requested === '30d') return { range: '30d', start: now - 30 * DAY, end: now, label: 'Poslednjih 30 dana' };
  if (requested === 'date') {
    const raw = String(url.searchParams.get('date') || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const start = zonedStart(raw);
      if (Number.isFinite(start)) {
        const next = new Date(start + 36 * 60 * 60 * 1000);
        const endKey = dayKey(next.getTime());
        const end = zonedStart(endKey);
        const pretty = new Intl.DateTimeFormat('sr-RS', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(start + 12 * 60 * 60 * 1000));
        return { range: 'date', start, end: Math.min(end, now), label: pretty, date: raw };
      }
    }
  }
  return { range: 'today', start: todayStart, end: now, label: 'Danas', date: today };
}
