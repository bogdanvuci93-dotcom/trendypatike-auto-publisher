import app from './.svelte-kit/cloudflare/_worker.js';
import { syncMeta, syncShopify } from './src/lib/server/sync.ts';

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    let tasks = [];

    if (controller.cron === '*/5 * * * *') {
      // Recent Shopify state only. Keeps fulfilled/cancelled/refunded order state fresh
      // without re-reading 31 days every minute.
      tasks = [syncShopify(env, fetch, 2, 120000)];
    } else if (controller.cron === '*/15 * * * *') {
      // Meta insights do not need 30-second polling. Refresh the requested 7-day window.
      tasks = [syncMeta(env, fetch, 7, 300000)];
    } else {
      // Periodic reconciliation of older Shopify fulfillment/refund changes.
      tasks = [syncShopify(env, fetch, 31, 1800000)];
    }

    const job = Promise.allSettled(tasks).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') console.error('Automatic Growth sync failed', result.reason);
      }
    });
    ctx.waitUntil(job);
    await job;
  }
};
