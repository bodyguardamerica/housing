# Pause / Resume Runbook

This project (Gen Con hotel availability tracker) only needs to run in the
months leading up to Gen Con. The rest of the year it can be fully paused to
save Railway compute and Supabase/Vercel quota. This document is the
authoritative checklist for pausing and resuming.

There are four independent moving parts:

| Part | What it does | Where it lives |
|------|--------------|----------------|
| **Scraper** | Polls Passkey every 25s, writes snapshots | Railway service `housing` (project `gracious-communication`) |
| **Soft switch** | `app_config.scraper_active` gate the scraper checks each run | Supabase table `app_config` |
| **Watchers** | Fire Discord/push when rooms match | Supabase table `watchers` |
| **Verification cron** | 6-hourly remote agent health check | claude.ai scheduled trigger `trig_01YBLNvoG2SYtZ2zcenx6SME` |
| **Website** | Next.js dashboard | Vercel project `housing` (stays UP, shows a paused banner) |

---

## TO PAUSE

Run these from the repo root. Order doesn't strictly matter, but do the
Railway stop **last** so a code push can't restart it.

### 1. Soft switch — stop scraping even if the container runs
Primary guarantee. The scraper calls `is_scraper_active()` every cycle and
skips the entire scrape when this is `false`.
```bash
cd scraper && python -c "
import os; from dotenv import load_dotenv; load_dotenv('.env')
from database import Database
db = Database(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
db.client.patch(f'{db.base_url}/app_config', params={'key':'eq.scraper_active'}, json={'value': False})
print('scraper_active =', db._get('app_config', {'key':'eq.scraper_active','select':'value'}))
"
```

### 2. Banner — tell visitors the site is paused
```bash
cd scraper && python -c "
import os; from dotenv import load_dotenv; load_dotenv('.env')
from database import Database
db = Database(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
msg='⏸️ Monitoring is paused for the off-season. Gen Con room tracking will resume in early 2026. Data shown may be outdated.'
db.client.patch(f'{db.base_url}/app_config', params={'key':'eq.site_banner_message'}, json={'value': msg})
print('banner set')
"
```
The `SiteBanner` component (frontend/src/components/SiteBanner.tsx) reads
`/api/config` and renders this message. The `StatusBar` also shows a small
"Scraper paused" tag whenever `scraper_active` is false.

### 3. Watchers — no stray notifications
```bash
cd scraper && python -c "
import os; from dotenv import load_dotenv; load_dotenv('.env')
from database import Database
db = Database(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
db.client.patch(f'{db.base_url}/watchers', params={'active':'eq.true'}, json={'active': False})
print([{r['id'][:8]: r['active']} for r in db._get('watchers', {'select':'id,active'})])
"
```

### 4. Verification cron — stop the 6-hourly health check
Via the `/schedule` skill (RemoteTrigger tool) or claude.ai/code/scheduled:
```
RemoteTrigger update trig_01YBLNvoG2SYtZ2zcenx6SME  body={"enabled": false}
```
(As of this writing it is already disabled.)

### 5. Railway — stop the compute (do this LAST)
Fully halts the container so it stops billing and stops polling the DB.
```bash
railway status          # confirm: project gracious-communication, service housing
railway down --yes      # removes the active deployment
```
`railway down` removes the most recent deployment; the service then has no
running container. This is reversible (see resume step 5).

---

## TO RESUME (early next year)

### 1. Update the year-specific config
Gen Con event id and dates roll over each year. Confirm/update:
- Railway env `PASSKEY_EVENT_ID` (2026 was `51118112`) and `PASSKEY_TOKEN_URL`
- Railway env `DEFAULT_CHECK_IN` / `DEFAULT_CHECK_OUT`, `CURRENT_YEAR`
- Supabase `app_config`: `current_year`, `convention_start_date`,
  `convention_end_date`, `default_check_in`, `default_check_out`
- Discord Book Now fallback: Edge Function secrets `PASSKEY_EVENT_ID`,
  `PASSKEY_OWNER_ID` (`supabase secrets set ...`)

### 2. Restart the Railway service
```bash
railway up            # from repo root, or:
railway redeploy      # redeploy the last build
```
(If Railway auto-deploys from GitHub, pushing any commit also rebuilds it.)

### 3. Flip the soft switch back on
```bash
cd scraper && python -c "
import os; from dotenv import load_dotenv; load_dotenv('.env')
from database import Database
db = Database(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
db.client.patch(f'{db.base_url}/app_config', params={'key':'eq.scraper_active'}, json={'value': True})
"
```

### 4. Clear the banner
```bash
cd scraper && python -c "
import os; from dotenv import load_dotenv; load_dotenv('.env')
from database import Database
db = Database(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
db.client.patch(f'{db.base_url}/app_config', params={'key':'eq.site_banner_message'}, json={'value': None})
"
```

### 5. Re-activate watchers you still want
Do NOT blanket re-enable — the two unnamed skywalk watchers (`dc42707e`,
`aa285d05`) are orphaned test rows with no linked alert. Only re-activate
the ones tied to a real `user_alerts` row (e.g. "Downtown" = `ee74bae1`),
or better, have users re-create alerts through the UI:
```bash
cd scraper && python -c "
import os; from dotenv import load_dotenv; load_dotenv('.env')
from database import Database
db = Database(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY'])
db.client.patch(f'{db.base_url}/watchers', params={'id':'eq.ee74bae1-6e08-4208-a6a3-782ac30174bc'}, json={'active': True})
"
```

### 6. (Optional) Re-enable the verification cron
```
RemoteTrigger update trig_01YBLNvoG2SYtZ2zcenx6SME  body={"enabled": true}
```

### 7. Verify
```bash
python verify.py            # compares our data to genconhotels.com
```

---

## Notes / gotchas

- **PostgREST schema-cache flakiness**: direct REST reads of `app_config`
  sometimes return `PGRST205 (table not found)` from a stale worker. The
  scraper's `Database` class and the Vercel routes retry / use pooled
  connections and work fine. If a write fails, just retry — a different
  worker will have the fresh cache.
- **Website stays online while paused.** Only the scraper compute is
  stopped. Vercel is not paused; the banner communicates the paused state.
- **Cost while paused**: Railway ~$0 (no container), Supabase minimal (no
  writes, occasional page reads), Vercel minimal (cached static + light API).
- **Data is frozen**: the last snapshots remain in `latest_room_availability`
  so the site still renders a table, just stale — hence the banner.
