import { decryptSecret, encryptSecret } from '$lib/server/crypto';

export type Provider = 'shopify' | 'meta';

export async function saveConnection(opts: {
  db: D1Database;
  encryptionKey: string;
  provider: Provider;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  scopes?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const token = await encryptSecret(opts.accessToken, opts.encryptionKey);
  const refresh = opts.refreshToken ? await encryptSecret(opts.refreshToken, opts.encryptionKey) : null;
  await opts.db.prepare(`
    INSERT INTO connections(provider, account_id, account_name, encrypted_access_token, encrypted_refresh_token, token_expires_at, scopes, metadata_json, updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
    ON CONFLICT(provider) DO UPDATE SET
      account_id=excluded.account_id,
      account_name=excluded.account_name,
      encrypted_access_token=excluded.encrypted_access_token,
      encrypted_refresh_token=excluded.encrypted_refresh_token,
      token_expires_at=excluded.token_expires_at,
      scopes=excluded.scopes,
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at
  `).bind(opts.provider, opts.accountId ?? null, opts.accountName ?? null, token, refresh, opts.expiresAt ?? null, opts.scopes ?? null, JSON.stringify(opts.metadata ?? {}), Date.now()).run();
}

export async function listConnectionStatus(db?: D1Database) {
  if (!db) return [];
  const result = await db.prepare(`SELECT provider, account_id, account_name, token_expires_at, scopes, updated_at FROM connections ORDER BY provider`).all();
  return result.results;
}

export async function getConnection(db: D1Database, encryptionKey: string, provider: Provider) {
  const row = await db.prepare(`SELECT provider, account_id, account_name, encrypted_access_token, encrypted_refresh_token, token_expires_at, scopes, metadata_json FROM connections WHERE provider=?1`).bind(provider).first<{
    provider: Provider;
    account_id: string | null;
    account_name: string | null;
    encrypted_access_token: string;
    encrypted_refresh_token: string | null;
    token_expires_at: number | null;
    scopes: string | null;
    metadata_json: string;
  }>();
  if (!row) return null;
  return {
    provider: row.provider,
    accountId: row.account_id,
    accountName: row.account_name,
    accessToken: await decryptSecret(row.encrypted_access_token, encryptionKey),
    refreshToken: row.encrypted_refresh_token ? await decryptSecret(row.encrypted_refresh_token, encryptionKey) : null,
    expiresAt: row.token_expires_at,
    scopes: row.scopes,
    metadata: JSON.parse(row.metadata_json || '{}') as Record<string, unknown>
  };
}
