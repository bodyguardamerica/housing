-- Add indexes to improve scrape deduplication and snapshot lookup performance.
-- The scrape_runs query filters on (status, year, no_changes) and orders by completed_at DESC.
-- The room_snapshots query filters by scrape_run_id which had no index.

-- Composite index for finding the latest successful scrape run
CREATE INDEX IF NOT EXISTS idx_scrape_runs_latest_success
ON scrape_runs(year, completed_at DESC)
WHERE status = 'success' AND no_changes = false;

-- Index for fetching snapshots by scrape_run_id (1.1M+ rows, no index existed)
CREATE INDEX IF NOT EXISTS idx_snapshots_scrape_run_id
ON room_snapshots(scrape_run_id);
