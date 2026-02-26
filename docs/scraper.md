# GenCon Hotels Scraper

## Overview

The scraper fetches hotel availability from Passkey's housing portal every N seconds and stores snapshots in Supabase. It scrapes each of the 5 nights individually in parallel to detect partial availability.

## Configuration

Environment variables (set in Railway):

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRAPE_INTERVAL_SECONDS` | 45 | Seconds between scrapes |
| `PASSKEY_TOKEN_URL` | - | URL with auth token for Passkey |
| `PASSKEY_EVENT_ID` | 50910675 | Gen Con event ID |
| `PASSKEY_OWNER_ID` | 10909638 | Passkey owner ID |
| `DEFAULT_CHECK_IN` | 2026-07-29 | Start date for searches |
| `DEFAULT_CHECK_OUT` | 2026-08-03 | End date for searches |

### Scrape Interval Recommendations

| Interval | Risk Level | Notes |
|----------|------------|-------|
| 45s | Very Low | Conservative, safe default |
| 30s | Low | Good balance of speed and safety |
| 25s | Low-Medium | Aggressive but likely safe |
| 20s | Medium | May see occasional 429s |
| <15s | High | Will likely trigger rate limits |

**Current setting**: Check Railway environment variables.

## Rate Limiting

### Passkey Rate Limits

Passkey returns HTTP 429 when rate limited. The scraper has built-in adaptive backoff:

1. On 429, delay multiplier doubles (up to 10x)
2. On success, delay multiplier slowly decreases
3. After 5 consecutive 429s, scrape is aborted
4. "Cautious mode" activates after any 429, forcing sequential requests

### Logging

Watch for these log messages:

```
# Rate limit hit on search submit
Rate limited (429)! Retry-After: 60

# Rate limit hit on results fetch
Rate limited (429) on fetch! Retry-After: 60

# Per-night rate limit with backoff
Rate limited on submit for 2026-07-29, backing off 2.5s

# Summary at end of scrape
Encountered 2 rate-limited requests during scrape

# Adaptive delay being applied
Using adaptive delay of 0.50s before 2026-07-29
```

If you see these frequently, increase `SCRAPE_INTERVAL_SECONDS`.

## Performance

### Current Architecture

- **Parallel scraping**: All 5 nights scraped simultaneously (max_concurrent=5)
- **Batch DB inserts**: Single POST for all snapshots
- **Hotel caching**: In-memory cache refreshed daily
- **Room keys caching**: Previous scrape data cached for change detection
- **Hash deduplication**: Skip DB writes if no changes detected

### Typical Timing

```
Scrape Timing Summary:
  Session init: 0ms (cached)
  HTTP requests: 3500ms (5 nights in parallel)
  Delays: 0ms (parallel mode)
  Database operations: 800ms
    - Previous keys: 0ms (cached)
    - Upsert hotels: 50ms
    - Create snapshots: 600ms
    - Notifications: 150ms
```

**Total scrape time**: ~5-8 seconds

### Monitoring Queries

Check recent scrapes:
```sql
SELECT started_at, completed_at, status, duration_ms,
       hotels_found, rooms_found, no_changes, error_message
FROM scrape_runs
ORDER BY started_at DESC
LIMIT 10;
```

Check for data issues:
```sql
SELECT hotel_name, room_type, available_count,
       raw_block_data->>'nights_available' as nights_avail,
       raw_block_data->>'total_nights' as total_nights
FROM latest_room_availability
WHERE available_count > 0
ORDER BY hotel_name;
```

Check scrape frequency:
```sql
SELECT
  date_trunc('hour', started_at) as hour,
  COUNT(*) as scrapes,
  AVG(duration_ms) as avg_duration_ms,
  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
FROM scrape_runs
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 1 DESC;
```

## Availability Logic

A room shows as "available" only if ALL 5 nights have availability:

1. Each night is scraped individually
2. `nights_available` = count of nights with valid availability (1-499 rooms)
3. `full_stay_available` = 0 if `nights_available < 5`, else min across all nights
4. Rooms with partial availability have `available_count = 0` but `partial_availability = true`

### Diagnostic Logging

The scraper logs availability summaries:
```
Availability summary: 12 rooms with full availability, 45 with partial, 8 sold out
```

Data integrity errors are logged:
```
DATA INTEGRITY ERROR: Standard King at hotel xyz has nights_available=3/5 but full_stay_available=2
```

## Notifications

Notifications trigger when availability CHANGES:
- Room goes from 0 to >0 availability (newly available)
- Partial availability changes (different nights available)

Notifications are sent in parallel (max 15 concurrent) via Supabase Edge Function.

**Note**: Uses async HTTP client for true parallelism. Each notification takes ~700ms, so 15 notifications run in ~1-2 seconds instead of 10+ seconds.

## Data Quality Protection

Passkey's API sometimes returns inconsistent data (e.g., 15 blocks one scrape, 150 the next). The scraper detects this:

- Tracks "last good" data count from previous successful scrape
- If new scrape has <50% of previous data, marks as `status=skipped`
- Logs: `SUSPICIOUS DATA: Got X nights but expected ~Y`

Check for skipped scrapes:
```sql
SELECT * FROM scrape_runs
WHERE status = 'skipped'
ORDER BY started_at DESC;
```

## Troubleshooting

### Scraper not running
- Check Railway logs for errors
- Verify environment variables are set
- Check `scrape_runs` table for recent entries

### Rooms showing incorrect availability
- Check `raw_block_data` for the room to see per-night data
- Compare `nights_available` vs `total_nights`
- May be Passkey returning stale data (race condition)

### High error rate
- Check for 429s in logs - increase interval if frequent
- Check for session expiry - scraper should auto-reinitialize
- Check Passkey portal manually to verify it's working

### Slow scrapes
- Check `duration_ms` in `scrape_runs`
- Look for rate limit backoffs in logs
- Verify parallel scraping is active (not in "cautious mode")
