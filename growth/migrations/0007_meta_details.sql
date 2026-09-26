-- Legacy migration kept for D1 migration-history compatibility.
-- Schema normalization is handled by 0009_repair_schema.sql.
CREATE TABLE IF NOT EXISTS __growth_migration_marker (
  id INTEGER PRIMARY KEY
);
