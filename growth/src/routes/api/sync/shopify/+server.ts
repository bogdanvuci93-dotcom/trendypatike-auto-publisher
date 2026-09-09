import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConnection } from '$lib/server/connections';

const INVALID_FINANCIAL_STATUSES = new Set(['REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED']);

const QUERY = `#graphql
query RecentOrders($query: String!) {
  orders(first: 100, reverse: true, sortKey: CREATED_AT, query: $query) {
    nodes {
      id
      createdAt
      cancelledAt
      displayFinancialStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 100) {
        nodes {
          title
          quantity
          product { id }
          variant { id }
          discountedTotalSet { shopMoney { amount } }
        }
      }
    }
  }
}`;

export const POST: RequestHandler = async ({ platform, fetch }) => {
  const env = platform?.env;
  const db = env?.DB;
  const key = env?.APP_ENCRYPTION_KEY;
  if (!db || !key) throw error(503, 'Database/encryption not configured');
  const connection = await getConnection(db, key, 'shopify');
  if (!connection?.accountId) throw error(409, 'Shopify is not connected');

  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const response = await fetch(`https://${connection.accountId}/admin/api/2026-07/graphql.json`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-shopify-access-token': connection.accessToken
    },
    body: JSON.stringify({ query: QUERY, variables: { query: `created_at:>=${since}` } })
  });
  if (!response.ok) throw error(502, `Shopify API error ${response.status}`);
  const payload = await response.json() as any;
  if (payload.errors?.length) throw error(502, payload.errors[0]?.message || 'Shopify GraphQL error');

  const orders = payload.data?.orders?.nodes ?? [];
  let itemCount = 0;
  let validOrderCount = 0;
  let ignoredOrderCount = 0;

  for (const order of orders) {
    const status = String(order.displayFinancialStatus || '').toUpperCase();
    const excluded = Boolean(order.cancelledAt) || INVALID_FINANCIAL_STATUSES.has(status);
    const money = order.currentTotalPriceSet?.shopMoney || order.totalPriceSet?.shopMoney;

    await db.prepare(`INSERT INTO shopify_orders(id,created_at,total,currency,financial_status,cancelled,synced_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7)
      ON CONFLICT(id) DO UPDATE SET total=excluded.total,currency=excluded.currency,financial_status=excluded.financial_status,cancelled=excluded.cancelled,synced_at=excluded.synced_at`)
      .bind(order.id, Date.parse(order.createdAt), Number(money?.amount || 0), money?.currencyCode || 'RSD', status || null, order.cancelledAt ? 1 : 0, Date.now())
      .run();

    if (excluded) {
      ignoredOrderCount++;
      await db.prepare(`DELETE FROM shopify_order_items WHERE order_id=?1`).bind(order.id).run();
      continue;
    }

    validOrderCount++;
    for (const item of order.lineItems?.nodes ?? []) {
      itemCount++;
      await db.prepare(`INSERT INTO shopify_order_items(order_id,product_id,variant_id,title,quantity,line_total)
        VALUES(?1,?2,?3,?4,?5,?6)
        ON CONFLICT(order_id,variant_id,title) DO UPDATE SET quantity=excluded.quantity,line_total=excluded.line_total`)
        .bind(order.id, item.product?.id ?? null, item.variant?.id ?? null, String(item.title || '').slice(0,200), Number(item.quantity || 0), Number(item.discountedTotalSet?.shopMoney?.amount || 0))
        .run();
    }
  }

  await db.prepare(`
    DELETE FROM shopify_order_items
    WHERE order_id IN (
      SELECT id FROM shopify_orders
      WHERE cancelled=1
         OR UPPER(COALESCE(financial_status,'')) IN ('REFUNDED','PARTIALLY_REFUNDED','VOIDED')
    )
  `).run();

  return json({
    ok: true,
    provider: 'shopify',
    orders: validOrderCount,
    ignoredOrders: ignoredOrderCount,
    fetchedOrders: orders.length,
    items: itemCount,
    since
  });
};
