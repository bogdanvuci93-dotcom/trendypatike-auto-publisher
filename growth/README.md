# TrendyPatike Growth

Private growth dashboard for TrendyPatike. The architecture is intentionally designed around free tiers and avoids paid analytics subscriptions.

## What is already implemented

- SvelteKit dashboard shell
- ECharts performance chart
- deterministic SCALE / KEEP / WATCH / PAUSE / WEBSITE_ISSUE rule engine
- privacy-safe client behavior tracker
- rage-click detection
- scroll-depth events
- UTM / fbclid capture
- `/api/track` endpoint
- Cloudflare D1 schema for sessions, events, Meta snapshots and daily rollups
- Cloudflare adapter

## Local start

```bash
cd growth
npm install
npm run dev
```

The overview currently uses mock data so the UI can be developed independently from credentials.

## Zero-cost architecture

1. SvelteKit + Cloudflare Workers free tier
2. D1 for compact event / aggregate data
3. R2 only for selected session-replay payloads, with automatic retention
4. Meta Marketing API directly, no paid connector
5. Shopify Web Pixels / webhooks directly, no paid connector
6. deterministic recommendation engine; no paid LLM API required

## Privacy rules

The tracker must never collect raw form input, customer names, email, phone, address, passwords or payment data. The ingestion endpoint accepts only an explicit metadata allow-list.

## Next implementation steps

1. Create/bind free Cloudflare D1 database and optional R2 bucket.
2. Add Shopify custom pixel/app embed for commerce events.
3. Add Meta OAuth + Insights sync worker.
4. Match UTM/fbclid sessions to campaigns/ads.
5. Add Sessions, Funnel, Ads, Products and Heatmaps pages.
6. Add rrweb replay with aggressive masking and storage sampling.
7. Add hard storage guard so the project cannot silently exceed free-tier quotas.
8. Only after enough historical data exists, enable guarded Meta write actions behind manual approval.
