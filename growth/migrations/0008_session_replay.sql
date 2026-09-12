CREATE TABLE IF NOT EXISTS replay_chunks (
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_replay_chunks_session_time
  ON replay_chunks(session_id, started_at);

CREATE INDEX IF NOT EXISTS idx_replay_chunks_created_at
  ON replay_chunks(created_at);
