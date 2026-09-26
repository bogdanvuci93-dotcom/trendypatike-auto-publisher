import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncMeta, syncShopify } from '$lib/server/sync';

export const POST: RequestHandler = async ({ request, platform, fetch }) => {
  const body = await request.json().catch(()=>({})) as { provider?:string };
  const env = platform?.env ?? {};
  try {
    if(body.provider==='shopify') return json(await syncShopify(env, fetch, 31, 0));
    if(body.provider==='meta') return json(await syncMeta(env, fetch, 7, 0));
    return json({ok:false,error:'Nepoznata akcija'}, {status:400});
  } catch (e) {
    return json({ok:false,error:e instanceof Error?e.message:'Akcija nije uspela'}, {status:502});
  }
};
