#!/usr/bin/env python3
"""
NBA Trade Data Sanity Check - Random Sample 10 trades across different eras.
Fixed seed=42 for reproducibility.
Must include at least 2-3 trades from recently modified files:
1977-78, 1981-82, 1982-83, 1985-86, 1987-88, 1988-89, 2009-10, 2012-13, 2018-19
"""

import json
import os
import random

DATA_DIR = "/Users/michaelweintraub/Desktop/AI Folder/nba-trade-mapper/public/data/trades/by-season"

# Fixed seed for reproducibility
random.seed(42)

# Load all seasons
all_seasons = sorted([f.replace(".json", "") for f in os.listdir(DATA_DIR) if f.endswith(".json")])

# Priority seasons (recently modified)
priority_seasons = {"1977-78", "1981-82", "1982-83", "1985-86", "1987-88", "1988-89", "2009-10", "2012-13", "2018-19"}

# Era groupings for spread
era_groups = {
    "1970s": [s for s in all_seasons if s.startswith("197")],
    "1980s_early": [s for s in all_seasons if s.startswith("198") and int(s[:4]) <= 1984],
    "1980s_late": [s for s in all_seasons if s.startswith("198") and int(s[:4]) >= 1985],
    "1990s_early": [s for s in all_seasons if s.startswith("199") and int(s[:4]) <= 1994],
    "1990s_late": [s for s in all_seasons if s.startswith("199") and int(s[:4]) >= 1995],
    "2000s": [s for s in all_seasons if s.startswith("200")],
    "2010s_early": [s for s in all_seasons if s.startswith("201") and int(s[:4]) <= 2014],
    "2010s_late": [s for s in all_seasons if s.startswith("201") and int(s[:4]) >= 2015],
    "2020s": [s for s in all_seasons if int(s[:4]) >= 2020],
}

def load_season(season):
    path = os.path.join(DATA_DIR, f"{season}.json")
    with open(path) as f:
        return json.load(f)

def print_trade(season, trade):
    print(f"\n{'='*70}")
    print(f"Season: {season}  |  Trade ID: {trade['id']}")
    print(f"Date: {trade.get('date', 'N/A')}  |  Title: {trade.get('title', 'N/A')}")

    assets = trade.get("assets", [])
    players = [a for a in assets if a.get("type") == "player"]
    picks = [a for a in assets if a.get("type") == "pick"]
    cash = [a for a in assets if a.get("type") == "cash"]

    if players:
        print(f"\n  PLAYERS ({len(players)}):")
        for p in players:
            name = p.get("player_name") or p.get("name") or "Unknown"
            from_t = p.get("from_team_id", "?")
            to_t = p.get("to_team_id", "?")
            print(f"    - {name}: {from_t} → {to_t}")

    if picks:
        print(f"\n  PICKS ({len(picks)}):")
        for pk in picks:
            yr = pk.get("pick_year", "?")
            rnd = pk.get("pick_round", "?")
            orig = pk.get("original_team_id", "?")
            became = pk.get("became_player_name", "")
            from_t = pk.get("from_team_id", "?")
            to_t = pk.get("to_team_id", "?")
            became_str = f" → became {became}" if became else ""
            print(f"    - {yr} Rd{rnd} ({orig} pick){became_str}: {from_t} → {to_t}")

    if cash:
        print(f"\n  CASH: {len(cash)} item(s)")

# Select trades
selected = []

# First, ensure we pick from priority seasons
# Pick 3 from priority seasons
priority_trades = []
priority_list = list(priority_seasons)
random.shuffle(priority_list)
for season in priority_list[:4]:  # try to pick from 4 priority seasons
    try:
        data = load_season(season)
        trades = data.get("trades", data) if isinstance(data, dict) else data
        if isinstance(data, dict) and "trades" in data:
            trades = data["trades"]
        elif isinstance(data, list):
            trades = data
        else:
            trades = list(data.values()) if isinstance(data, dict) else []

        if trades:
            t = random.choice(trades)
            priority_trades.append((season, t))
    except Exception as e:
        print(f"Error loading {season}: {e}")

selected.extend(priority_trades[:3])

# Then fill remaining 7 from other eras
era_keys = list(era_groups.keys())
random.shuffle(era_keys)

for era in era_keys:
    if len(selected) >= 10:
        break
    seasons_in_era = era_groups[era]
    # Filter out already-selected seasons and priority seasons already selected
    already_selected_seasons = {s for s, _ in selected}
    available = [s for s in seasons_in_era if s not in already_selected_seasons and s not in priority_seasons]
    if not available:
        available = [s for s in seasons_in_era if s not in already_selected_seasons]
    if not available:
        continue

    season = random.choice(available)
    try:
        data = load_season(season)
        if isinstance(data, dict) and "trades" in data:
            trades = data["trades"]
        elif isinstance(data, list):
            trades = data
        else:
            trades = list(data.values())

        if trades:
            t = random.choice(trades)
            selected.append((season, t))
    except Exception as e:
        print(f"Error loading {season}: {e}")

# Trim to 10
selected = selected[:10]

print(f"RANDOM SEED: 42")
print(f"Total trades sampled: {len(selected)}")
print(f"Seasons covered: {sorted(set(s for s, _ in selected))}")

for season, trade in sorted(selected, key=lambda x: x[0]):
    print_trade(season, trade)

print(f"\n{'='*70}")
print("Done.")
