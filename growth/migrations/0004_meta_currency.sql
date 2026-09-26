ALTER TABLE ad_snapshots ADD COLUMN account_name TEXT;
ALTER TABLE ad_snapshots ADD COLUMN currency TEXT;

CREATE INDEX IF NOT EXISTS idx_ad_snapshots_account_ts ON ad_snapshots(account_id, snapshot_ts);
