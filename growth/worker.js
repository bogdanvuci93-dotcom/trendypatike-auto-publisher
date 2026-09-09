import app from './.svelte-kit/cloudflare/_worker.js';
import { syncMeta, syncShopify } from './src/lib/server/sync.ts';

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },

  async scheduled(_controller, env, ctx) {
    const job = Promise.allSettled([
      syncShopify(env),
      syncMeta(env, fetch, 7)
    ]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') console.error('Automatic Growth sync failed', result.reason);
      }
    });
    ctx.waitUntil(job);
    await job;
  }
};
