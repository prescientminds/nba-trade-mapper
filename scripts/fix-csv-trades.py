#!/usr/bin/env python3
"""
fix-csv-trades.py

Patches public/data/trades/by-season/*.json to fix CSV-imported trades (pre-2019).

Problems fixed:
  1. Asset directions are inverted (from_team_id / to_team_id swapped)
  2. Return assets missing — only the received side was stored, not the sent side

Root cause: import-trades.ts misread the bipartite CSV format.
  - CSV row: to=AssetReceived, from=AssetSent, action_team=TeamThatReceived
  - Bug: import set from_team_id=action_team (wrong — action_team is the RECEIVER)
  - Bug: only 'to' assets were stored; 'from' assets (what was given away) were ignored

This script re-processes the CSV with correct logic and patches the JSON files.
BBRef-scraped trades (id starts with 'bbref-') and curated sample trades
(id starts with repeated hex patterns) are left untouched.

Usage:
  cd /path/to/nba-trade-mapper
  python3 scripts/fix-csv-trades.py
"""

import csv
import json
import os
import re
from collections import defaultdict

# ── Team name → abbreviation mapping (matches import-trades.ts) ─────────────
TEAM_NAME_TO_ID = {
    'Hawks': 'ATL', 'Celtics': 'BOS', 'Nets': 'BKN', 'Hornets': 'CHA',
    'Bulls': 'CHI', 'Cavaliers': 'CLE', 'Mavericks': 'DAL', 'Nuggets': 'DEN',
    'Pistons': 'DET', 'Warriors': 'GSW', 'Rockets': 'HOU', 'Pacers': 'IND',
    'Clippers': 'LAC', 'Lakers': 'LAL', 'Grizzlies': 'MEM', 'Heat': 'MIA',
    'Bucks': 'MIL', 'Timberwolves': 'MIN', 'Pelicans': 'NOP', 'Knicks': 'NYK',
    'Thunder': 'OKC', 'Magic': 'ORL', '76ers': 'PHI', 'Suns': 'PHX',
    'Trail Blazers': 'POR', 'Blazers': 'POR', 'Kings': 'SAC', 'Spurs': 'SAS',
    'Raptors': 'TOR', 'Jazz': 'UTA', 'Wizards': 'WAS',
    # Historical
    'SuperSonics': 'OKC', 'Sonics': 'OKC',
    'Bobcats': 'CHA', 'Charlotte Bobcats': 'CHA',
    'New Jersey Nets': 'BKN',
    'New Orleans Hornets': 'NOP', 'New Orleans/Oklahoma City Hornets': 'NOP',
    'Braves': 'LAC', 'Buffalo Braves': 'LAC', 'San Diego Clippers': 'LAC',
    'Bullets': 'WAS', 'Capital Bullets': 'WAS', 'Baltimore Bullets': 'WAS',
    'Cincinnati Royals': 'SAC', 'Kansas City Kings': 'SAC',
    'San Diego Rockets': 'HOU',
    'Vancouver Grizzlies': 'MEM',
    'Seattle SuperSonics': 'OKC',
    'New Orleans Jazz': 'UTA',
}


def resolve_team_id(name: str) -> str | None:
    name = name.strip()
    if not name:
        return None
    if name in TEAM_NAME_TO_ID:
        return TEAM_NAME_TO_ID[name]
    for key, val in TEAM_NAME_TO_ID.items():
        if name.endswith(key) or key in name:
            return val
    return None


# ── CSV processing ────────────────────────────────────────────────────────────

def load_trade_groups(csv_path: str) -> dict:
    """
    Re-process the CSV with correct directionality.

    Returns:
        dict: (date, frozenset[team_ids]) → {
            'action_team_id': str,
            'other_team_id': str | None,
            'team_ids': list[str],
            'received': dict[name, {is_pick, is_rights, is_cash}],
            'sent': dict[name, {is_pick, is_rights, is_cash}],
        }
    """
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        all_rows = list(reader)

    # Filter to trade rows only
    trade_rows = [r for r in all_rows if 'trade with' in r.get('notes', '').lower()]

    # Step 1: Group by (date, action_team, notes) — one group = one team's perspective
    raw_groups: dict[tuple, dict] = {}
    for row in trade_rows:
        key = (row['date'], row['action_team'], row['notes'])
        if key not in raw_groups:
            teams = set()
            teams.add(row['action_team'])
            for t in row.get('teams_involved', '').split(','):
                t = t.strip()
                if t:
                    teams.add(t)
            raw_groups[key] = {
                'action_team': row['action_team'],
                'teams': teams,
                'rows': [],
            }
        else:
            for t in row.get('teams_involved', '').split(','):
                t = t.strip()
                if t:
                    raw_groups[key]['teams'].add(t)
        raw_groups[key]['rows'].append(row)

    # Step 2: Consolidate by (date, frozenset[team_ids]) — use FIRST perspective only
    # (avoids double-counting when both team perspectives are in the CSV)
    consolidated: dict[tuple, dict] = {}

    for (date, action_team_name, notes), grp in raw_groups.items():
        action_team_id = resolve_team_id(action_team_name)
        if not action_team_id:
            continue

        team_ids_set = set()
        for name in grp['teams']:
            tid = resolve_team_id(name)
            if tid:
                team_ids_set.add(tid)

        if len(team_ids_set) < 2:
            continue

        consolidation_key = (date, frozenset(team_ids_set))

        if consolidation_key in consolidated:
            # Already have a perspective for this trade — skip duplicate
            continue

        # Extract unique received (to) and sent (from) assets.
        #
        # Key insight for pick detection:
        #   A value is a PICK if ALL rows in this group that contain that value
        #   have pick_involved=TRUE.  If any row has pick_involved=FALSE for the
        #   same value, the value is a real player (the trade just happens to also
        #   involve picks on a different edge).
        #
        # Examples:
        #   Harden trade: from=Steven Adams always pick=TRUE → Adams IS a pick
        #   Pierce trade: to=James Young always pick=TRUE → Young IS a received pick
        #                 from=Paul Pierce has pick=TRUE AND pick=FALSE rows → Pierce is a player

        # Step A: count pick=TRUE and total rows per (to_val / from_val)
        to_pick_count: dict[str, int] = defaultdict(int)
        to_total_count: dict[str, int] = defaultdict(int)
        from_pick_count: dict[str, int] = defaultdict(int)
        from_total_count: dict[str, int] = defaultdict(int)
        to_rights: set[str] = set()
        from_rights: set[str] = set()

        for row in grp['rows']:
            to_val = row.get('to', '').strip()
            from_val = row.get('from', '').strip()
            pick_inv = row.get('pick_involved', 'FALSE') == 'TRUE'
            rights_inv = row.get('rights_involved', 'FALSE') == 'TRUE'

            if to_val:
                to_total_count[to_val] += 1
                if pick_inv:
                    to_pick_count[to_val] += 1
                if rights_inv:
                    to_rights.add(to_val)

            if from_val:
                from_total_count[from_val] += 1
                if pick_inv:
                    from_pick_count[from_val] += 1
                if rights_inv:
                    from_rights.add(from_val)

        # Step B: classify each value
        def _is_cash(name: str) -> bool:
            return name.lower() in ('cash', '$cash')

        received: dict[str, dict] = {}
        for name, total in to_total_count.items():
            if _is_cash(name):
                received['__cash_to'] = {'is_cash': True, 'is_pick': False, 'is_rights': False}
            else:
                all_pick = (to_pick_count[name] == total)
                received[name] = {
                    'is_pick': all_pick,
                    'is_rights': name in to_rights,
                    'is_cash': False,
                }

        sent: dict[str, dict] = {}
        for name, total in from_total_count.items():
            if _is_cash(name):
                sent['__cash_from'] = {'is_cash': True, 'is_pick': False, 'is_rights': False}
            else:
                all_pick = (from_pick_count[name] == total)
                sent[name] = {
                    'is_pick': all_pick,
                    'is_rights': name in from_rights,
                    'is_cash': False,
                }

        other_team_ids = [t for t in team_ids_set if t != action_team_id]
        other_team_id = other_team_ids[0] if other_team_ids else None

        consolidated[consolidation_key] = {
            'action_team_id': action_team_id,
            'other_team_id': other_team_id,
            'team_ids': sorted(team_ids_set),
            'received': received,
            'sent': sent,
            'is_multi_team': len(team_ids_set) > 2,
        }

    return consolidated


def build_assets(grp: dict) -> list[dict]:
    """Convert a processed trade group into asset list with correct directions."""
    action_team_id = grp['action_team_id']
    other_team_id = grp['other_team_id']

    assets = []

    def make_asset(name, info, from_id, to_id):
        if info.get('is_cash'):
            return {
                'type': 'cash',
                'player_name': None,
                'from_team_id': from_id,
                'to_team_id': to_id,
                'pick_year': None,
                'pick_round': None,
                'original_team_id': None,
                'became_player_name': None,
                'notes': 'Cash considerations',
            }
        elif info.get('is_pick'):
            # Asset is a pick; the name is the player who was eventually drafted with it
            real_name = name if not name.startswith('__') else None
            return {
                'type': 'pick',
                'player_name': None,
                'from_team_id': from_id,
                'to_team_id': to_id,
                'pick_year': None,
                'pick_round': None,
                'original_team_id': None,
                'became_player_name': real_name,
                'notes': None,
            }
        else:
            return {
                'type': 'player',
                'player_name': name,
                'from_team_id': from_id,
                'to_team_id': to_id,
                'pick_year': None,
                'pick_round': None,
                'original_team_id': None,
                'became_player_name': None,
                'notes': None,
            }

    # Received assets: other_team → action_team
    for name, info in grp['received'].items():
        assets.append(make_asset(name, info, other_team_id, action_team_id))

    # Sent assets: action_team → other_team
    for name, info in grp['sent'].items():
        assets.append(make_asset(name, info, action_team_id, other_team_id))

    return assets


# ── Curated trade detection ───────────────────────────────────────────────────

CURATED_PREFIXES = (
    'aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd',
)


def is_curated(trade_id: str) -> bool:
    """Returns True if this trade came from sample_data.sql (manually curated)."""
    return any(trade_id.startswith(p) for p in CURATED_PREFIXES)


def is_bbref(trade_id: str) -> bool:
    """Returns True if this trade came from the BBRef scraper."""
    return trade_id.startswith('bbref-')


# ── Main patch logic ──────────────────────────────────────────────────────────

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    csv_path = os.path.join(base_dir, 'data', 'trades.csv')
    season_dir = os.path.join(base_dir, 'public', 'data', 'trades', 'by-season')

    print('Loading and re-processing CSV...')
    trade_groups = load_trade_groups(csv_path)
    print(f'  → {len(trade_groups)} corrected trade groups built')

    # Build lookup: (date, frozenset[team_ids]) → corrected data
    # (already keyed this way)

    files = sorted(f for f in os.listdir(season_dir) if f.endswith('.json'))

    total_patched = 0
    total_skipped_bbref = 0
    total_skipped_curated = 0
    total_no_match = 0

    for fname in files:
        fpath = os.path.join(season_dir, fname)
        with open(fpath, encoding='utf-8') as f:
            data = json.load(f)

        if isinstance(data, dict):
            trades = data.get('trades', [])
        else:
            trades = data

        file_patched = 0

        for trade in trades:
            trade_id = trade.get('id', '')

            if is_bbref(trade_id):
                total_skipped_bbref += 1
                continue
            if is_curated(trade_id):
                total_skipped_curated += 1
                continue

            # CSV-imported trade — look up corrected data
            date = trade.get('date', '')
            team_ids_in_json = frozenset(t['team_id'] for t in trade.get('teams', []))

            key = (date, team_ids_in_json)
            grp = trade_groups.get(key)

            if grp is None:
                total_no_match += 1
                continue

            # Replace assets with corrected data
            trade['assets'] = build_assets(grp)

            # Fix team roles: action_team = receiver, other = sender
            action_team_id = grp['action_team_id']
            is_multi = grp['is_multi_team']
            for team in trade.get('teams', []):
                if is_multi:
                    team['role'] = 'participant'
                elif team['team_id'] == action_team_id:
                    team['role'] = 'receiver'
                else:
                    team['role'] = 'sender'

            file_patched += 1
            total_patched += 1

        # Write back
        if file_patched > 0:
            if isinstance(data, dict):
                data['trades'] = trades
                out = data
            else:
                out = trades

            with open(fpath, 'w', encoding='utf-8') as f:
                json.dump(out, f, indent=2, ensure_ascii=False)

        print(f'  {fname}: {file_patched} trades patched')

    print()
    print(f'Done.')
    print(f'  Patched:            {total_patched} CSV-imported trades')
    print(f'  Skipped (BBRef):    {total_skipped_bbref}')
    print(f'  Skipped (curated):  {total_skipped_curated}')
    print(f'  No CSV match found: {total_no_match}')


if __name__ == '__main__':
    main()
