#!/usr/bin/env python3
"""Compare candidate bookability rules against genconhotels.com per-night truth."""

import json
import os
import sys
from collections import Counter, defaultdict

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

import httpx

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "scraper/.env"))
except ImportError:
    pass

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://qfrxhaiurggmqkmnkzpg.supabase.co")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

NIGHT_DATES = {
    "wednesday": "2026-07-29",
    "thursday":  "2026-07-30",
    "friday":    "2026-07-31",
    "saturday":  "2026-08-01",
}


def norm(s: str) -> str:
    """Normalize hotel/room name for matching."""
    import html, re
    s = html.unescape(s or "").lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def fetch_gencon():
    with httpx.Client(timeout=15) as c:
        return c.get("https://genconhotels.com/data.json", headers={"Cache-Control": "no-store"}).json()


def fetch_snapshots():
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    with httpx.Client(timeout=15, headers=headers) as c:
        run = c.get(f"{SUPABASE_URL}/rest/v1/scrape_runs", params={
            "select": "id", "no_changes": "eq.false", "status": "eq.success",
            "order": "started_at.desc", "limit": "1",
        }).json()[0]
        snaps = c.get(f"{SUPABASE_URL}/rest/v1/room_snapshots", params={
            "select": "room_type,raw_block_data,hotels(name)",
            "scrape_run_id": f"eq.{run['id']}", "limit": "1000",
        }).json()
    return snaps


# Candidate rules. The current production rule (commit 32fb90a, verified
# 100% agreement against genconhotels.com on 2026-04-24) is listed first.
# Keep the old inverted rule as a regression guard so anyone re-running
# this script sees the accuracy delta.
RULES = {
    "current (avail==10000 OR 1..499)": lambda n: n["available"] == 10000 or 0 < n["available"] < 500,
    "rate>0 (interim, conflates WL)":   lambda n: n["rate"] > 0,
    "pre-fix (inverted)":               lambda n: n["available"] == 0 or 0 < n["available"] < 500,
}


def main():
    gencon = fetch_gencon()
    snaps = fetch_snapshots()

    # Index gencon by normalized (hotel, room) for 4 relevant nights
    gencon_idx = {}
    for r in gencon:
        key = (norm(r["hotel_name"]), norm(r["room_name"]))
        gencon_idx[key] = {NIGHT_DATES[d]: r.get(d) for d in NIGHT_DATES}

    # Index our snapshots
    our_idx = {}
    for s in snaps:
        h = (s.get("hotels") or {}).get("name", "?")
        key = (norm(h), norm(s["room_type"]))
        nights = (s.get("raw_block_data") or {}).get("nights", [])
        our_idx[key] = {n["date"]: n for n in nights if n["date"] in NIGHT_DATES.values()}

    matched_keys = sorted(set(gencon_idx) & set(our_idx))
    print(f"gencon rooms: {len(gencon_idx)}, our rooms: {len(our_idx)}, matched keys: {len(matched_keys)}")
    print()

    # Evaluate each rule per-night across every matched (hotel, room, night)
    rule_stats = {name: Counter() for name in RULES}
    per_rule_wrong = {name: [] for name in RULES}

    for key in matched_keys:
        g = gencon_idx[key]
        o = our_idx[key]
        for date, truth_status in g.items():
            night = o.get(date)
            if night is None:
                continue
            truth_open = (truth_status == "Open")
            for name, pred in RULES.items():
                predicted = pred(night)
                if predicted == truth_open:
                    rule_stats[name]["agree"] += 1
                else:
                    rule_stats[name]["disagree"] += 1
                    if len(per_rule_wrong[name]) < 15:
                        per_rule_wrong[name].append({
                            "key": key, "date": date, "truth": truth_status,
                            "predicted_open": predicted,
                            "rate": night["rate"], "avail": night["available"],
                        })

    print("=" * 80)
    print(f"{'rule':<50} {'agree':>8} {'disagree':>10} {'accuracy':>10}")
    print("-" * 80)
    for name, c in rule_stats.items():
        total = c["agree"] + c["disagree"]
        acc = (c["agree"] / total * 100) if total else 0
        print(f"{name:<50} {c['agree']:>8} {c['disagree']:>10} {acc:>9.2f}%")

    # Show a few disagreements for best rule
    best_rule = max(RULES, key=lambda n: rule_stats[n]["agree"])
    print()
    print(f"Sample disagreements for best rule '{best_rule}':")
    for w in per_rule_wrong[best_rule][:10]:
        print(f"  {w['key'][0][:30]:30} | {w['key'][1][:25]:25} | {w['date']} truth={w['truth']:5} pred_open={w['predicted_open']} (rate={w['rate']}, avail={w['avail']})")


if __name__ == "__main__":
    main()
