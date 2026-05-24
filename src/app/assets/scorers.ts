/**
 * Asset Dashboard — pure scoring functions.
 *
 * Each scorer takes raw query results and returns a per-team
 * `{ score, tier, sample }` shape that the table renders directly.
 * No UI, no I/O — fetchers live in AssetsClient.tsx.
 */

import { TEAMS } from '@/lib/teams';
import type { OwnedPick } from '@/lib/trade-builder';

export const CURRENT_SEASON = '2025-26';
export const NEXT_SEASON = '2026-27';
export const CURRENT_YEAR = 2026;
/**
 * 2026-27 projected salary cap. The 2025-26 cap was $140.6M; the league's
 * published 2026-27 projection at the time of build is ~$154.6M. Used when
 * salary_cap_history has no 2026-27 row yet. Surface this assumption in UI.
 */
export const PROJECTED_NEXT_CAP_FALLBACK = 154_600_000;

export type Tier = 'top' | 'high' | 'mid' | 'low';

export interface ColumnScore {
  score: number;
  tier: Tier;
  /** Top contributors — names or pick labels for the tooltip / detail cell. */
  sample: string[];
}

// ── Future Picks ──────────────────────────────────────────────────────
//
// EV per pick: 1st = 10, 2nd = 2. Modifiers stack multiplicatively:
//   - swap-right (asset_class='swap'): ×0.4 (controls choice, not selection)
//   - conditional (protected): ×0.7 (may not convey)
// Tier on team total: ≥40 top, 20–40 high, 10–20 mid, <10 low.

export function scorePicks(picks: OwnedPick[]): ColumnScore {
  const future = picks.filter((p) => p.year >= CURRENT_YEAR);
  let ev = 0;
  const items: Array<{ label: string; weight: number }> = [];
  for (const p of future) {
    const base = p.round === 1 ? 10 : 2;
    const swap = p.asset_class === 'swap' ? 0.4 : 1;
    const cond = p.conditional ? 0.7 : 1;
    const w = base * swap * cond;
    ev += w;
    const tag =
      (p.asset_class === 'swap' ? 'swap ' : '') +
      (p.conditional ? 'cond. ' : '');
    items.push({
      label: `${p.year} ${p.original_team_id} ${p.round === 1 ? '1st' : '2nd'}${tag ? ' (' + tag.trim() + ')' : ''}`,
      weight: w,
    });
  }
  items.sort((a, b) => b.weight - a.weight);
  return {
    score: Math.round(ev * 10) / 10,
    tier: ev >= 40 ? 'top' : ev >= 20 ? 'high' : ev >= 10 ? 'mid' : 'low',
    sample: items.slice(0, 4).map((i) => i.label),
  };
}

// ── Young Talent ──────────────────────────────────────────────────────
//
// Player tier from BPM (above the 500-minute floor so the signal is real):
//   Star ≥ 3, Starter 0–3, Rotation -2–0, Project < -2 (or sub-floor minutes).
// Team score: Star=5, Starter=3, Rotation=1, Project=0.5. Tier: ≥8 top,
// 4–8 high, 1–4 mid, <1 low.

const TALENT_MIN_MP = 500;

export interface YoungPlayerRow {
  player_name: string;
  age: number | null;
  bpm: number | null;
  mp: number | null;
}

export function scoreYoungTalent(players: YoungPlayerRow[]): ColumnScore {
  let score = 0;
  const labeled: Array<{ name: string; weight: number; bpm: number | null }> = [];
  for (const p of players) {
    if (p.age == null || p.age > 23) continue;
    const qualified = p.mp != null && p.mp >= TALENT_MIN_MP;
    let tier: 'Star' | 'Starter' | 'Rotation' | 'Project';
    let weight: number;
    if (!qualified || p.bpm == null) {
      tier = 'Project';
      weight = 0.5;
    } else if (p.bpm >= 3) {
      tier = 'Star';
      weight = 5;
    } else if (p.bpm >= 0) {
      tier = 'Starter';
      weight = 3;
    } else if (p.bpm >= -2) {
      tier = 'Rotation';
      weight = 1;
    } else {
      tier = 'Project';
      weight = 0.5;
    }
    score += weight;
    labeled.push({ name: `${p.player_name} (${tier})`, weight, bpm: p.bpm });
  }
  labeled.sort((a, b) => b.weight - a.weight || (b.bpm ?? -99) - (a.bpm ?? -99));
  return {
    score: Math.round(score * 10) / 10,
    tier: score >= 8 ? 'top' : score >= 4 ? 'high' : score >= 1 ? 'mid' : 'low',
    sample: labeled.slice(0, 4).map((i) => i.name),
  };
}

// ── Stars ─────────────────────────────────────────────────────────────
//
// Star = anyone with an All-NBA or All-Star nod within the last 3 seasons
// who is still on the team's 2025-26 roster. Tier: ≥2 top, 1 high, 0 low.

export function scoreStars(starNames: string[]): ColumnScore {
  return {
    score: starNames.length,
    tier:
      starNames.length >= 2 ? 'top' : starNames.length === 1 ? 'high' : 'low',
    sample: starNames.slice(0, 4),
  };
}

// ── Cap Space ─────────────────────────────────────────────────────────
//
// Space = projectedCap - 2026-27 guaranteed commitments. Tier:
//   ≥ $15M: top (room to sign or absorb)
//   $5M–$15M: high (MLE-only)
//   -$15M–$5M: mid (over cap, normal operating)
//   < -$15M: low (capped out, deep into tax)
//
// v1 caveat (surface in UI): apron tiers (1st/2nd) need salary_cap_history
// fill — the columns are NULL in the DB today.

export function scoreCapSpace(
  commitments2627: number,
  projectedCap: number,
): ColumnScore & { commitments: number; cap: number; space: number } {
  const space = projectedCap - commitments2627;
  return {
    score: space,
    tier:
      space >= 15_000_000
        ? 'top'
        : space >= 5_000_000
        ? 'high'
        : space >= -15_000_000
        ? 'mid'
        : 'low',
    sample: [],
    commitments: commitments2627,
    cap: projectedCap,
    space,
  };
}

// ── Aggregation ───────────────────────────────────────────────────────

export interface TeamAssetRow {
  teamId: string;
  teamName: string;
  cap: ColumnScore & { commitments: number; cap: number; space: number };
  picks: ColumnScore;
  young: ColumnScore;
  stars: ColumnScore;
}

export function buildRows(args: {
  ownershipByTeam: Record<string, OwnedPick[]>;
  youngByTeam: Record<string, YoungPlayerRow[]>;
  starsByTeam: Record<string, string[]>;
  commitmentsByTeam: Record<string, number>;
  projectedCap: number;
}): TeamAssetRow[] {
  const teamIds = Object.keys(TEAMS);
  return teamIds.map((teamId) => ({
    teamId,
    teamName: TEAMS[teamId].name,
    cap: scoreCapSpace(args.commitmentsByTeam[teamId] ?? 0, args.projectedCap),
    picks: scorePicks(args.ownershipByTeam[teamId] ?? []),
    young: scoreYoungTalent(args.youngByTeam[teamId] ?? []),
    stars: scoreStars(args.starsByTeam[teamId] ?? []),
  }));
}

// ── Display helpers ───────────────────────────────────────────────────

export function fmtMoney(dollars: number): string {
  const sign = dollars < 0 ? '-' : '';
  const m = Math.abs(dollars) / 1e6;
  return `${sign}$${m.toFixed(1)}M`;
}

export function tierLabel(col: 'cap' | 'picks' | 'young' | 'stars', tier: Tier): string {
  if (col === 'cap') {
    return tier === 'top' ? 'Room' : tier === 'high' ? 'MLE' : tier === 'mid' ? 'Over cap' : 'Capped out';
  }
  if (col === 'picks') {
    return tier === 'top' ? 'Stacked' : tier === 'high' ? 'Loaded' : tier === 'mid' ? 'Average' : 'Thin';
  }
  if (col === 'young') {
    return tier === 'top' ? 'Stacked' : tier === 'high' ? 'Strong' : tier === 'mid' ? 'Decent' : 'Thin';
  }
  return tier === 'top' ? 'Multi-star' : tier === 'high' ? 'Star team' : tier === 'mid' ? '—' : 'No star';
}

export const TIER_COLOR: Record<Tier, string> = {
  top: '#4ecdc4',
  high: '#9b5de5',
  mid: 'var(--text-secondary)',
  low: 'var(--text-tertiary)',
};
