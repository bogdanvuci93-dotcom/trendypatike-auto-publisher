import { getConnection } from './connections';
import { deliveryStatusFromOrder, isExcludedShopifyOrder, validOrderSql } from './orders';

export type SyncEnv = {
  DB?: D1Database;
  APP_ENCRYPTION_KEY?: string;
  META_GRAPH_VERSION?: string;
};

const DAY = 86400000;
const SESSION_ATTR_KEYS = new Set(['_tp_growth_session','tp_growth_session']);

function storefrontSessionId(order: any) {
  for (const attr of order?.customAttributes ?? []) {
    if (!SESSION_ATTR_KEYS.has(String(attr?.key || ''))) continue;
    const value = String(attr?.value || '').slice(0, 80);
    if (/^[A-Za-z0-9_-]{10,80}$/.test(value)) return value;
  }
  return '';
}

async function beginSync(db: D1Database, provider: string, minIntervalMs = 0) {
  const now = Date.now();
  if (minIntervalMs > 0) {
    const state = await db.prepare(`SELECT last_attempt_at FROM sync_state WHERE provider=?1`).bind(provider).first<{ last_attempt_at:number|null }>();
    const lastAttempt = Number(state?.last_attempt_at || 0);
    if (lastAttempt && now - lastAttempt < minIntervalMs) return false;
  }

  await db.prepare(`
    INSERT INTO sync_state(provider,last_success_at,last_attempt_at,last_error,result_json)
    VALUES(?1,NULL,?2,NULL,'{}')
    ON CONFLICT(provider) DO UPDATE SET last_attempt_at=excluded.last_attempt_at
  `).bind(provider, now).run();
  return true;
}

async function setSyncState(db: D1Database, provider: string, ok: boolean, result: unknown, error = '') {
  const now = Date.now();
  await db.prepare(`
    INSERT INTO sync_state(provider,last_success_at,last_attempt_at,last_error,result_json)
    VALUES(?1,?2,?3,?4,?5)
    ON CONFLICT(provider) DO UPDATE SET
      last_success_at=CASE WHEN ?6=1 THEN excluded.last_success_at ELSE sync_state.last_success_at END,
      last_attempt_at=excluded.last_attempt_at,
      last_error=excluded.last_error,
      result_json=excluded.result_json
  `).bind(provider, ok ? now : null, now, error || null, JSON.stringify(result ?? {}), ok ? 1 : 0).run();
}

const SHOPIFY_QUERY = `#graphql
query RecentOrders($query: String!, $after: String) {
  orders(first: 100, after: $after, reverse: false, sortKey: CREATED_AT, query: $query) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      createdAt
      cancelledAt
      displayFinancialStatus
      displayFulfillmentStatus
      returnStatus
      customAttributes { key value }
      fulfillments(first: 10) {
        status
        displayStatus
        deliveredAt
      }
      totalPriceSet { shopMoney { amount currencyCode } }
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 100) {
        nodes {
          title
          quantity
          product { id handle }
          variant { id }
          discountedTotalSet { shopMoney { amount } }
        }
      }
    }
  }
}`;

export async function syncShopify(env: SyncEnv, fetchFn: typeof fetch = fetch, lookbackDays = 31, minIntervalMs = 0) {
  const db = env.DB;
  const key = env.APP_ENCRYPTION_KEY;
  if (!db || !key) throw new Error('Database/encryption not configured');

  const allowed = await beginSync(db, 'shopify', minIntervalMs);
  if (!allowed) return { ok:true, provider:'shopify', skipped:true, reason:'recent_sync' };

  try {
    const connection = await getConnection(db, key, 'shopify');
    if (!connection?.accountId) throw new Error('Shopify is not connected');

    const days = Math.max(1, Math.min(31, Math.round(lookbackDays || 31)));
    const sinceMs = Date.now() - days * DAY;
    const since = new Date(sinceMs).toISOString().slice(0, 10);
    let after: string | null = null;
    let fetchedOrders = 0;
    let validOrders = 0;
    let ignoredOrders = 0;
    let itemCount = 0;
    let linkedOrders = 0;

    do {
      const response = await fetchFn(`https://${connection.accountId}/admin/api/2026-07/graphql.json`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-shopify-access-token': connection.accessToken
        },
        body: JSON.stringify({ query: SHOPIFY_QUERY, variables: { query: `created_at:>=${since}`, after } })
      });
      if (!response.ok) throw new Error(`Shopify API error ${response.status}`);
      const payload = await response.json() as any;
      if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'Shopify GraphQL error');

      const connectionOrders = payload.data?.orders;
      const orders = connectionOrders?.nodes ?? [];
      fetchedOrders += orders.length;

      for (const order of orders) {
        const financialStatus = String(order.displayFinancialStatus || '').toUpperCase();
        const returnStatus = String(order.returnStatus || 'NO_RETURN').toUpperCase();
        const fulfillmentStatus = String(order.displayFulfillmentStatus || '').toUpperCase();
        const deliveryStatus = deliveryStatusFromOrder(order);
        const excluded = isExcludedShopifyOrder(order);
        const money = order.currentTotalPriceSet?.shopMoney || order.totalPriceSet?.shopMoney;
        const sessionId = storefrontSessionId(order) || null;
        if (sessionId) linkedOrders++;

        await db.prepare(`
          INSERT INTO shopify_orders(id,created_at,total,currency,financial_status,cancelled,synced_at,return_status,session_id,fulfillment_status,delivery_status)
          VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
          ON CONFLICT(id) DO UPDATE SET
            created_at=excluded.created_at,
            total=excluded.total,
            currency=excluded.currency,
            financial_status=excluded.financial_status,
            cancelled=excluded.cancelled,
            synced_at=excluded.synced_at,
            return_status=excluded.return_status,
            session_id=COALESCE(excluded.session_id,shopify_orders.session_id),
            fulfillment_status=excluded.fulfillment_status,
            delivery_status=excluded.delivery_status
        `).bind(
          order.id,
          Date.parse(order.createdAt),
          Number(money?.amount || 0),
          money?.currencyCode || 'RSD',
          financialStatus || null,
          order.cancelledAt ? 1 : 0,
          Date.now(),
          returnStatus,
          sessionId,
          fulfillmentStatus || null,
          deliveryStatus || null
        ).run();

        if (excluded) {
          ignoredOrders++;
          await db.prepare(`DELETE FROM shopify_order_items WHERE order_id=?1`).bind(order.id).run();
          continue;
        }

        validOrders++;
        for (const item of order.lineItems?.nodes ?? []) {
          itemCount++;
          await db.prepare(`
            INSERT INTO shopify_order_items(order_id,product_id,variant_id,title,quantity,line_total,product_handle)
            VALUES(?1,?2,?3,?4,?5,?6,?7)
            ON CONFLICT(order_id,variant_id,title) DO UPDATE SET
              product_id=excluded.product_id,
              quantity=excluded.quantity,
              line_total=excluded.line_total,
              product_handle=excluded.product_handle
          `).bind(
            order.id,
            item.product?.id ?? null,
            item.variant?.id ?? null,
            String(item.title || '').slice(0, 200),
            Number(item.quantity || 0),
            Number(item.discountedTotalSet?.shopMoney?.amount || 0),
            String(item.product?.handle || '').slice(0, 160) || null
          ).run();
        }
      }

      after = connectionOrders?.pageInfo?.hasNextPage ? connectionOrders.pageInfo.endCursor : null;
    } while (after);

    await db.prepare(`
      DELETE FROM shopify_order_items
      WHERE order_id IN (
        SELECT id FROM shopify_orders o WHERE NOT (${validOrderSql('o')})
      )
    `).run();

    await db.prepare(`
      UPDATE sessions
      SET purchased=CASE WHEN EXISTS(
            SELECT 1 FROM shopify_orders o
            WHERE o.session_id=sessions.id AND ${validOrderSql('o')}
          ) THEN 1 ELSE 0 END,
          revenue=COALESCE((
            SELECT SUM(o.total) FROM shopify_orders o
            WHERE o.session_id=sessions.id AND ${validOrderSql('o')}
          ),0)
      WHERE id IN (
        SELECT DISTINCT session_id FROM shopify_orders
        WHERE session_id IS NOT NULL AND created_at>=?1
      )
    `).bind(sinceMs).run();

    const result = { ok: true, provider: 'shopify', orders: validOrders, ignoredOrders, fetchedOrders, linkedOrders, items: itemCount, since, lookbackDays:days, revenueRule:'fulfilled_and_not_cancelled_refunded_returned' };
    await setSyncState(db, 'shopify', true, result);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Shopify sync failed';
    await setSyncState(db, 'shopify', false, {}, message).catch(() => {});
    throw e;
  }
}

function actionValue(rows: { action_type?: string; value?: string }[] | undefined, names: string[]) {
  for (const name of names) {
    const row = rows?.find((r) => r.action_type === name);
    if (row) return Number(row.value || 0);
  }
  return 0;
}

async function readPagedMeta(url: URL, fetchFn: typeof fetch) {
  const rows: any[] = [];
  let next: string | null = url.toString();
  let guard = 0;
  while (next && guard++ < 20) {
    const res = await fetchFn(next);
    if (!res.ok) throw new Error(`Meta insights error ${res.status}`);
    const payload = await res.json() as any;
    rows.push(...(payload.data ?? []));
    next = payload.paging?.next || null;
  }
  return rows;
}

export async function syncMeta(env: SyncEnv, fetchFn: typeof fetch = fetch, days = 7, minIntervalMs = 0) {
  const db = env.DB;
  const key = env.APP_ENCRYPTION_KEY;
  const version = env.META_GRAPH_VERSION || 'v24.0';
  if (!db || !key) throw new Error('Database/encryption not configured');

  const allowed = await beginSync(db, 'meta', minIntervalMs);
  if (!allowed) return { ok:true, provider:'meta', skipped:true, reason:'recent_sync' };

  try {
    const connection = await getConnection(db, key, 'meta');
    if (!connection) throw new Error('Meta Ads is not connected');

    const accountsUrl = new URL(`https://graph.facebook.com/${version}/me/adaccounts`);
    accountsUrl.searchParams.set('fields', 'id,name,account_status,currency');
    accountsUrl.searchParams.set('limit', '100');
    accountsUrl.searchParams.set('access_token', connection.accessToken);
    const accountsRes = await fetchFn(accountsUrl);
    if (!accountsRes.ok) throw new Error(`Meta ad accounts error ${accountsRes.status}`);
    const accountsPayload = await accountsRes.json() as any;
    const accounts = accountsPayload.data ?? [];

    const safeDays = Math.max(1, Math.min(35, Math.round(days || 7)));
    const until = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - Math.max(0, safeDays - 1) * DAY).toISOString().slice(0, 10);
    let ads = 0;
    let rowsStored = 0;
    const activeAccounts: { id: string; name: string; currency: string; ads: number }[] = [];

    for (const account of accounts) {
      const insightsUrl = new URL(`https://graph.facebook.com/${version}/${account.id}/insights`);
      insightsUrl.searchParams.set('level', 'ad');
      insightsUrl.searchParams.set('time_range', JSON.stringify({ since, until }));
      insightsUrl.searchParams.set('time_increment', '1');
      insightsUrl.searchParams.set('limit', '500');
      insightsUrl.searchParams.set('fields', 'date_start,date_stop,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,actions,action_values');
      insightsUrl.searchParams.set('access_token', connection.accessToken);

      const insightRows = await readPagedMeta(insightsUrl, fetchFn);
      const adIds = new Set<string>();
      for (const row of insightRows) {
        if (!row.ad_id || !row.date_start) continue;
        adIds.add(String(row.ad_id));

        const purchases = actionValue(row.actions, ['offsite_conversion.fb_pixel_purchase','purchase','omni_purchase']);
        const purchaseValue = actionValue(row.action_values, ['offsite_conversion.fb_pixel_purchase','purchase','omni_purchase']);
        const landingPageViews = actionValue(row.actions, ['landing_page_view','omni_landing_page_view']);
        const addToCart = actionValue(row.actions, ['offsite_conversion.fb_pixel_add_to_cart','add_to_cart','omni_add_to_cart']);
        const checkouts = actionValue(row.actions, ['offsite_conversion.fb_pixel_initiate_checkout','initiate_checkout','omni_initiated_checkout']);

        await db.prepare(`
          INSERT INTO meta_daily(
            day,account_id,account_name,currency,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,
            spend,impressions,clicks,purchases,purchase_value,synced_at,reach,frequency,link_clicks,landing_page_views,add_to_cart,checkouts
          ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)
          ON CONFLICT(day,account_id,ad_id) DO UPDATE SET
            account_name=excluded.account_name,
            currency=excluded.currency,
            campaign_id=excluded.campaign_id,
            campaign_name=excluded.campaign_name,
            adset_id=excluded.adset_id,
            adset_name=excluded.adset_name,
            ad_name=excluded.ad_name,
            spend=excluded.spend,
            impressions=excluded.impressions,
            clicks=excluded.clicks,
            purchases=excluded.purchases,
            purchase_value=excluded.purchase_value,
            reach=excluded.reach,
            frequency=excluded.frequency,
            link_clicks=excluded.link_clicks,
            landing_page_views=excluded.landing_page_views,
            add_to_cart=excluded.add_to_cart,
            checkouts=excluded.checkouts,
            synced_at=excluded.synced_at
        `).bind(
          row.date_start,
          account.id,
          account.name ?? account.id,
          account.currency ?? null,
          row.campaign_id ?? null,
          row.campaign_name ?? null,
          row.adset_id ?? null,
          row.adset_name ?? null,
          row.ad_id,
          row.ad_name ?? null,
          Number(row.spend || 0),
          Number(row.impressions || 0),
          Number(row.clicks || 0),
          purchases,
          purchaseValue,
          Date.now(),
          Number(row.reach || 0),
          Number(row.frequency || 0),
          Number(row.inline_link_clicks || 0),
          landingPageViews,
          addToCart,
          checkouts
        ).run();
        rowsStored++;
      }
      ads += adIds.size;
      if (adIds.size) activeAccounts.push({ id: account.id, name: account.name ?? account.id, currency: account.currency ?? '', ads: adIds.size });
    }

    const cutoff = new Date(Date.now() - 35 * DAY).toISOString().slice(0, 10);
    await db.prepare(`DELETE FROM meta_daily WHERE day < ?1`).bind(cutoff).run();

    const result = { ok: true, provider: 'meta', accounts: accounts.length, activeAccounts, ads, rows: rowsStored, since, until, days:safeDays };
    await setSyncState(db, 'meta', true, result);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Meta sync failed';
    await setSyncState(db, 'meta', false, {}, message).catch(() => {});
    throw e;
  }
}
