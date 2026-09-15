CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_path_type_ts ON events(path, type, event_ts DESC);
