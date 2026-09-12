CREATE INDEX IF NOT EXISTS idx_events_event_ts ON events(event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_session_event_ts ON events(session_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_replay_session_created_at ON replay_chunks(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_created_at ON shopify_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_daily_day_only ON meta_daily(day);
