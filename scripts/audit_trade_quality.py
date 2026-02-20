#!/usr/bin/env python3
"""
Trade JSON Data Quality Audit Script
Checks all 50 season files for:
1. Duplicate trades (same 2+ players, within 90 days, same file)
2. Stub/placeholder IDs (low entropy UUIDs)
3. Incomplete trades (only 1 player/pick asset total)
4. Cross-season duplicates (same trade in multiple files)
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
import itertools

TRADES_DIR = Path("/Users/michaelweintraub/Desktop/AI Folder/nba-trade-mapper/public/data/trades/by-season")

# ─────────────────────────────────────────────
# Load all trades
# ─────────────────────────────────────────────

all_trades = []       # list of dicts: {file, trade_obj}
trades_by_file = {}   # file -> list of trade_obj

for json_file in sorted(TRADES_DIR.glob("*.json")):
    with open(json_file, "r") as f:
        try:
            trades = json.load(f)
        except json.JSONDecodeError as e:
            print(f"JSON PARSE ERROR in {json_file.name}: {e}")
            continue
    trades_by_file[json_file.name] = trades
    for t in trades:
        all_trades.append({"file": json_file.name, "trade": t})

print(f"Loaded {len(all_trades)} trades across {len(trades_by_file)} files\n")
print("=" * 80)


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def get_player_names(trade):
    """Return set of player names in a trade (lowercase for comparison)."""
    names = set()
    for asset in trade.get("assets", []):
        if asset.get("type") == "player" and asset.get("player_name"):
            names.add(asset["player_name"].strip().lower())
    return names

def get_all_asset_count(trade):
    """Count all tradeable assets (players + picks, not cash/exceptions)."""
    count = 0
    for asset in trade.get("assets", []):
        if asset.get("type") in ("player", "pick"):
            count += 1
    return count

def get_date(trade):
    """Parse trade date string into datetime or None."""
    d = trade.get("date", "")
    if not d or d == "null":
        return None
    try:
        return datetime.strptime(d[:10], "%Y-%m-%d")
    except ValueError:
        return None

def id_entropy(trade_id):
    """
    Return number of unique hex characters in a UUID (dashes removed).
    A random UUID has ~16 unique hex chars. Low means hand-crafted/stub.
    """
    cleaned = trade_id.replace("-", "").lower()
    return len(set(cleaned))

def is_bbref_id(trade_id):
    """BBRef-scraped IDs look like: bbref-YYYY-MM-DD-xxxxxxxx"""
    return trade_id.startswith("bbref-")

def format_trade_summary(file, trade):
    players = get_player_names(trade)
    player_str = ", ".join(sorted(p.title() for p in players)) if players else "(no players)"
    asset_count = get_all_asset_count(trade)
    return (
        f"  File: {file}\n"
        f"  ID:   {trade['id']}\n"
        f"  Date: {trade.get('date', 'N/A')}\n"
        f"  Title: {trade.get('title', 'N/A')}\n"
        f"  Players: {player_str}\n"
        f"  Total player+pick assets: {asset_count}"
    )


# ─────────────────────────────────────────────
# CHECK 1: Stub / Placeholder IDs
# ─────────────────────────────────────────────

print("\n" + "=" * 80)
print("CHECK 1: STUB / PLACEHOLDER IDs")
print("=" * 80)
print("Criteria: UUID with ≤3 unique hex chars, OR a known hand-crafted pattern")
print("(BBRef-format IDs are excluded from entropy check)\n")

LOW_ENTROPY_THRESHOLD = 3
stub_ids_found = []

for entry in all_trades:
    file = entry["file"]
    trade = entry["trade"]
    tid = trade.get("id", "")

    # Skip BBRef IDs — they have a different format but are legit
    if is_bbref_id(tid):
        continue

    entropy = id_entropy(tid)

    # Check: very low unique hex chars (strong signal of hand-crafted stub)
    if entropy <= LOW_ENTROPY_THRESHOLD:
        stub_ids_found.append({
            "file": file,
            "trade": trade,
            "entropy": entropy,
            "reason": f"Only {entropy} unique hex char(s) in UUID"
        })
        continue

    # Check: UUID segments that look like all-zeros or obvious patterns
    cleaned = tid.replace("-", "").lower()
    if len(set(cleaned)) <= 4 and len(cleaned) >= 30:
        stub_ids_found.append({
            "file": file,
            "trade": trade,
            "entropy": entropy,
            "reason": f"Only {entropy} unique hex chars — likely placeholder"
        })

# Also flag IDs that have repeating blocks (e.g. aaaabbbbcccc patterns)
# Check if any non-BBRef UUID has a run of ≥8 identical chars
for entry in all_trades:
    file = entry["file"]
    trade = entry["trade"]
    tid = trade.get("id", "")
    if is_bbref_id(tid):
        continue
    cleaned = tid.replace("-", "").lower()
    for char in set(cleaned):
        run = char * 8
        if run in cleaned:
            already = any(s["trade"]["id"] == tid for s in stub_ids_found)
            if not already:
                stub_ids_found.append({
                    "file": file,
                    "trade": trade,
                    "entropy": id_entropy(tid),
                    "reason": f"Contains run of 8+ identical chars ('{char}' repeated)"
                })

if stub_ids_found:
    print(f"Found {len(stub_ids_found)} stub/placeholder ID(s):\n")
    for i, s in enumerate(stub_ids_found, 1):
        print(f"  [{i}] {s['reason']}")
        print(f"       Entropy: {s['entropy']} unique hex chars")
        print(format_trade_summary(s["file"], s["trade"]))
        print()
else:
    print("  None found.\n")


# ─────────────────────────────────────────────
# CHECK 2: Incomplete Trades (only 1 total player+pick asset)
# ─────────────────────────────────────────────

print("\n" + "=" * 80)
print("CHECK 2: INCOMPLETE TRADES (≤1 player+pick asset)")
print("=" * 80)
print("These may be stubs missing the return side of the trade.\n")

incomplete = []
for entry in all_trades:
    file = entry["file"]
    trade = entry["trade"]
    asset_count = get_all_asset_count(trade)
    if asset_count <= 1:
        incomplete.append({"file": file, "trade": trade, "asset_count": asset_count})

if incomplete:
    print(f"Found {len(incomplete)} incomplete trade(s):\n")
    for i, item in enumerate(incomplete, 1):
        t = item["trade"]
        assets = t.get("assets", [])
        asset_detail = []
        for a in assets:
            atype = a.get("type", "?")
            name = a.get("player_name") or a.get("notes") or "(unnamed)"
            direction = f"{a.get('from_team_id','?')} → {a.get('to_team_id','?')}"
            asset_detail.append(f"{atype}: {name} ({direction})")
        print(f"  [{i}] {item['asset_count']} tradeable asset(s)")
        print(format_trade_summary(item["file"], t))
        print(f"  Assets listed: {'; '.join(asset_detail) if asset_detail else '(none)'}")
        print()
else:
    print("  None found.\n")


# ─────────────────────────────────────────────
# CHECK 3: Within-file Duplicates (2+ shared players, within 90 days)
# ─────────────────────────────────────────────

print("\n" + "=" * 80)
print("CHECK 3: WITHIN-FILE DUPLICATE TRADES")
print("=" * 80)
print("Criteria: Two trades in the same file share ≥2 players AND are within 90 days.\n")

within_file_dups = []

for filename, trades in trades_by_file.items():
    for i, t1 in enumerate(trades):
        for j, t2 in enumerate(trades):
            if j <= i:
                continue
            p1 = get_player_names(t1)
            p2 = get_player_names(t2)
            shared = p1 & p2
            if len(shared) < 2:
                continue
            d1 = get_date(t1)
            d2 = get_date(t2)
            if d1 is None or d2 is None:
                days_diff = None
            else:
                days_diff = abs((d2 - d1).days)
            if days_diff is not None and days_diff <= 90:
                within_file_dups.append({
                    "file": filename,
                    "trade1": t1,
                    "trade2": t2,
                    "shared_players": shared,
                    "days_diff": days_diff
                })

if within_file_dups:
    print(f"Found {len(within_file_dups)} within-file duplicate pair(s):\n")
    for i, dup in enumerate(within_file_dups, 1):
        shared_display = ", ".join(p.title() for p in sorted(dup["shared_players"]))
        print(f"  [{i}] Shared players: {shared_display}  |  Days apart: {dup['days_diff']}")
        print(f"  --- Trade A ---")
        print(format_trade_summary(dup["file"], dup["trade1"]))
        print(f"  --- Trade B ---")
        print(format_trade_summary(dup["file"], dup["trade2"]))
        print()
else:
    print("  None found.\n")


# ─────────────────────────────────────────────
# CHECK 4: Cross-Season Duplicates
# Same trade_id in multiple files, OR same date+players in different files
# ─────────────────────────────────────────────

print("\n" + "=" * 80)
print("CHECK 4: CROSS-SEASON DUPLICATES")
print("=" * 80)
print("Sub-check 4a: Same trade ID appearing in multiple season files")
print("Sub-check 4b: Same date + ≥2 shared players in different season files\n")

# 4a: ID collisions across files
id_to_files = defaultdict(list)
for entry in all_trades:
    tid = entry["trade"].get("id", "")
    id_to_files[tid].append((entry["file"], entry["trade"]))

print("--- 4a: Same trade ID in multiple files ---\n")
id_collisions = {tid: entries for tid, entries in id_to_files.items() if len(entries) > 1}
if id_collisions:
    print(f"Found {len(id_collisions)} trade ID(s) appearing in multiple files:\n")
    for tid, entries in sorted(id_collisions.items()):
        print(f"  Trade ID: {tid}")
        for (fname, t) in entries:
            print(f"    File: {fname}  |  Date: {t.get('date','?')}  |  Title: {t.get('title','?')}")
        print()
else:
    print("  None found.\n")

# 4b: Same date + ≥2 shared players across different files
print("--- 4b: Same date + ≥2 shared players in different files ---\n")

cross_season_dups = []
checked_pairs = set()

for i, entry1 in enumerate(all_trades):
    for j, entry2 in enumerate(all_trades):
        if j <= i:
            continue
        if entry1["file"] == entry2["file"]:
            continue
        # Avoid re-checking same pair
        pair_key = tuple(sorted([entry1["trade"]["id"], entry2["trade"]["id"]]))
        if pair_key in checked_pairs:
            continue
        checked_pairs.add(pair_key)

        t1 = entry1["trade"]
        t2 = entry2["trade"]

        d1 = t1.get("date", "")
        d2 = t2.get("date", "")
        if d1 != d2 or not d1:
            # Allow date-flexible check: within 1 day (data entry discrepancy)
            dt1 = get_date(t1)
            dt2 = get_date(t2)
            if dt1 is None or dt2 is None:
                continue
            if abs((dt1 - dt2).days) > 1:
                continue

        p1 = get_player_names(t1)
        p2 = get_player_names(t2)
        shared = p1 & p2
        if len(shared) >= 2:
            cross_season_dups.append({
                "file1": entry1["file"],
                "trade1": t1,
                "file2": entry2["file"],
                "trade2": t2,
                "shared_players": shared
            })

if cross_season_dups:
    print(f"Found {len(cross_season_dups)} cross-season duplicate pair(s):\n")
    for i, dup in enumerate(cross_season_dups, 1):
        shared_display = ", ".join(p.title() for p in sorted(dup["shared_players"]))
        print(f"  [{i}] Shared players: {shared_display}")
        print(f"  --- File 1 ---")
        print(format_trade_summary(dup["file1"], dup["trade1"]))
        print(f"  --- File 2 ---")
        print(format_trade_summary(dup["file2"], dup["trade2"]))
        print()
else:
    print("  None found.\n")


# ─────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────

print("\n" + "=" * 80)
print("AUDIT SUMMARY")
print("=" * 80)
print(f"  Total files scanned:                 {len(trades_by_file)}")
print(f"  Total trades loaded:                 {len(all_trades)}")
print(f"  Stub/placeholder IDs:                {len(stub_ids_found)}")
print(f"  Incomplete trades (≤1 asset):        {len(incomplete)}")
print(f"  Within-file duplicate pairs:         {len(within_file_dups)}")
print(f"  Cross-file ID collisions:            {len(id_collisions)}")
print(f"  Cross-season duplicate pairs:        {len(cross_season_dups)}")
print()

# Catalog all unique problematic trade IDs
all_problem_ids = set()
for s in stub_ids_found:
    all_problem_ids.add(s["trade"]["id"])
for item in incomplete:
    all_problem_ids.add(item["trade"]["id"])
for dup in within_file_dups:
    all_problem_ids.add(dup["trade1"]["id"])
    all_problem_ids.add(dup["trade2"]["id"])
for tid in id_collisions:
    all_problem_ids.add(tid)
for dup in cross_season_dups:
    all_problem_ids.add(dup["trade1"]["id"])
    all_problem_ids.add(dup["trade2"]["id"])

print(f"  Total unique trade IDs with issues:  {len(all_problem_ids)}")
print()
