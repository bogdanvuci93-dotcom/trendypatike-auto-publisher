import app from './.svelte-kit/cloudflare/_worker.js';
import { syncMeta, syncShopify } from './src/lib/server/sync.ts';

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    const fast = controller.cron === '* * * * *';
    const tasks = fast
      ? [syncShopify(env, fetch, 2, 20000), syncMeta(env, fetch, 1, 20000)]
      : [syncShopify(env, fetch, 31), syncMeta(env, fetch, 7)];

    const job = Promise.allSettled(tasks).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') console.error('Automatic Growth sync failed', result.reason);
      }
    });
    ctx.waitUntil(job);
    await job;
  }
};
