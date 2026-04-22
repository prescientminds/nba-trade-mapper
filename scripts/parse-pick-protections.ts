/**
 * Parse pick protection language from the trade-description corpus into
 * structured JSON. Companion to `build-pick-ownership.ts` — that script
 * resolves *who owns* each pick; this one resolves *under what conditions*.
 *
 * Scope: post-2019 BBRef-scraped trades (descriptions start with "The TEAM
 * traded..."). Pre-2019 CSV-era trades (start with "On YYYY-MM-DD:") have
 * richer year-stepped protections and are marked `confidence: 'unparsed'`
 * with the raw snippet preserved for a future parser.
 *
 * For each pick_key (`${year}-${round}-${originalTeam}`), we take the
 * protection from the most-recent trade step in the lineage. A pick that
 * has bounced through three trades gets the third trade's protection —
 * that's the one currently live on the owed pick.
 *
 * Writes: public/data/pick-protections.json
 *
 * Usage:
 *   npx tsx scripts/parse-pick-protections.ts            # writes the JSON
 *   npx tsx scripts/parse-pick-protections.ts --dry-run  # prints stats only
 *   npx tsx scripts/parse-pick-protections.ts --sample N # print N unparsed
 */

import * as fs from 'fs';
import * as path from 'path';

const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'pick-protections.json');

const TARGET_YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032] as const;

// =============================================================================
// Types
// =============================================================================

type Rule =
  | { kind: 'top_protected'; threshold: number }
  | { kind: 'lottery_protected' }
  | { kind: 'unprotected' }
  | { kind: 'least_favorable' }
  | { kind: 'most_favorable' }
  | { kind: 'nth_least_favorable'; n: number }
  | { kind: 'nth_most_favorable'; n: number }
  | { kind: 'swap_right' }
  | { kind: 'protected_unspecified' }
  | { kind: 'unclear' };

interface Condition {
  year: number;
  rule: Rule;
}

interface PickProtection {
  pick_key: string;
  asset_class: 'pick' | 'swap';
  conditions: Condition[];
  status: 'pending' | 'conveyed' | 'did_not_convey';
  confidence: 'high' | 'medium' | 'low' | 'unparsed';
  raw_snippet: string;
  trade_id: string;
  trade_date: string;
  notes: string[];
}

interface StaticTradeAsset {
  type: string;
  player_name: string | null;
  from_team_id: string | null;
  to_team_id: string | null;
  pick_year: number | null;
  pick_round: number | null;
  original_team_id: string | null;
  became_player_name: string | null;
  notes: string | null;
}

interface StaticTrade {
  id: string;
  date: string;
  description: string;
  assets: StaticTradeAsset[];
}

// =============================================================================
// Era + clause extraction
// =============================================================================

/**
 * Post-2019 BBRef descriptions open with "The TEAM traded..." or
 * "In a N-team trade, the TEAM traded..." (multi-team). Pre-2019 CSV
 * opens with "On YYYY-MM-DD:". Use that prefix as era detection.
 */
function isPost2019Format(description: string): boolean {
  const t = description.trim();
  return /^The\s+[A-Z]/.test(t) || /^In a \d+-team trade, the\s+[A-Z]/i.test(t);
}

/**
 * Slice the description into per-pick clauses. Anchors on "YYYY (1st|2nd)-rd
 * pick" mentions and takes everything between consecutive anchors. Returns
 * a list of {year, round, text} — a trade with 3 pick mentions produces 3.
 *
 * Multiple picks with the same year+round (e.g., two 2027 2nds) produce
 * separate clauses in order; we join them when attributing to a pick asset.
 */
function extractPickClauses(
  description: string,
): Array<{ year: number; round: 1 | 2; text: string }> {
  // "2024 1st-rd pick" OR "2024 1st round pick" OR bare "2024 1st-rd two most
  // favorable" — any mention that introduces a pick-scoped phrase.
  const anchor = /(\d{4})[- ](1st|2nd)[- ]?rd(?:\s+pick)?/gi;
  const anchors: Array<{ year: number; round: 1 | 2; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(description))) {
    anchors.push({
      year: parseInt(m[1], 10),
      round: m[2].toLowerCase() === '1st' ? 1 : 2,
      start: m.index,
    });
  }
  const clauses: Array<{ year: number; round: 1 | 2; text: string }> = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const end = i + 1 < anchors.length ? anchors[i + 1].start : description.length;
    clauses.push({ year: a.year, round: a.round, text: description.slice(a.start, end).trim() });
  }
  return clauses;
}

// =============================================================================
// Protection parser (post-2019 language)
// =============================================================================

function parseClauseForYear(clause: string, year: number): {
  conditions: Condition[];
  asset_class: 'pick' | 'swap';
  status: 'pending' | 'conveyed' | 'did_not_convey';
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
} {
  const lower = clause.toLowerCase();
  const notes: string[] = [];
  const rules: Rule[] = [];

  // "right to swap", "swap rights", or bare "is a swap" / "pick is a swap".
  const asset_class: 'pick' | 'swap' =
    /right to swap|swap rights?|\bis a swap\b/i.test(clause) ? 'swap' : 'pick';

  const status: 'pending' | 'conveyed' | 'did_not_convey' =
    /did not convey/i.test(clause) ? 'did_not_convey' : 'pending';

  // Swap rights — the asset IS the protection; record a structural rule.
  if (asset_class === 'swap') rules.push({ kind: 'swap_right' });

  // top-N protected. Handles "top 4 protected", "top-4 protected",
  // "top 55 protected", and reversed word order "protected top 55".
  const topM =
    lower.match(/top[- ]?(\d{1,2})[- ]?protected/) ||
    lower.match(/protected[- ]?top[- ]?(\d{1,2})/);
  if (topM) rules.push({ kind: 'top_protected', threshold: parseInt(topM[1], 10) });

  // lottery protected
  if (/lottery[- ]?protected/i.test(clause)) rules.push({ kind: 'lottery_protected' });

  // unprotected (don't match "top-4 protected" — guard with word boundary)
  if (/\bunprotected\b/i.test(clause) && !topM) rules.push({ kind: 'unprotected' });

  // Nth-least / Nth-most favorable ("2nd-least favorable", "2nd least favorable")
  const nthLeast = lower.match(/(\d+)(?:st|nd|rd|th)?[- ]?least favorable/);
  if (nthLeast) rules.push({ kind: 'nth_least_favorable', n: parseInt(nthLeast[1], 10) });
  const nthMost = lower.match(/(\d+)(?:st|nd|rd|th)?[- ]?most favorable/);
  if (nthMost) rules.push({ kind: 'nth_most_favorable', n: parseInt(nthMost[1], 10) });

  // plain least/most favorable (only if Nth form didn't match)
  if (!nthLeast && /\bleast favorable\b/i.test(clause))
    rules.push({ kind: 'least_favorable' });
  if (!nthMost && /\bmost favorable\b/i.test(clause))
    rules.push({ kind: 'most_favorable' });

  // "conditional" or "protected" keyword with no threshold extracted
  if (
    rules.length === 0 &&
    /\b(conditional|protected)\b/i.test(clause) &&
    !/unprotected/i.test(clause)
  ) {
    rules.push({ kind: 'protected_unspecified' });
    notes.push('Protection keyword present, threshold not stated in snippet.');
  }

  // Confidence scoring
  let confidence: 'high' | 'medium' | 'low';
  if (rules.length === 0) {
    rules.push({ kind: 'unclear' });
    confidence = 'low';
  } else if (rules.some((r) => r.kind === 'protected_unspecified')) {
    confidence = 'medium';
  } else if (rules.length === 1) {
    confidence = 'high';
  } else if (
    rules.length === 2 &&
    rules.some((r) => r.kind === 'swap_right')
  ) {
    // Swap right + a protection rule is valid and common (swap with top-N guard).
    confidence = 'high';
  } else {
    // Multiple rules co-present (e.g., "top-4 protected" + "least favorable")
    // is valid — keep both, downgrade confidence slightly.
    confidence = 'medium';
    notes.push(`${rules.length} rules co-present in one clause.`);
  }

  return {
    conditions: rules.map((rule) => ({ year, rule })),
    asset_class,
    status,
    confidence,
    notes,
  };
}

// =============================================================================
// Pick-key resolution (matches build-pick-ownership.ts)
// =============================================================================

function resolveOriginalTeam(
  pickYear: number,
  pickRound: 1 | 2,
  fromTeamId: string | null,
  description: string,
  explicit: string | null,
): string | null {
  if (explicit) return explicit;
  const roundLabel = pickRound === 1 ? '1st' : '2nd';
  const re = new RegExp(
    `${pickYear}[^.]*?${roundLabel}[^.]*?is\\s+([A-Z]{3})\\s*own`,
    'i',
  );
  const m = description.match(re);
  if (m) return m[1].toUpperCase();
  return fromTeamId;
}

// =============================================================================
// Main
// =============================================================================

interface FlatPickParse {
  pick_key: string;
  year: number;
  round: 1 | 2;
  original_team_id: string;
  trade_id: string;
  trade_date: string;
  description: string;
  clause: string;
  parsed: ReturnType<typeof parseClauseForYear> | null;
  era: 'post_2019' | 'pre_2019';
  has_protection_language: boolean;
}

const PROTECTION_RE =
  /protect|top[- ]\d|lottery|unprotected|least favorable|most favorable|did not convey|swap/i;

function loadAllTrades(): StaticTrade[] {
  const files = fs.readdirSync(TRADES_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const out: StaticTrade[] = [];
  for (const f of files) {
    const arr: StaticTrade[] = JSON.parse(fs.readFileSync(path.join(TRADES_DIR, f), 'utf-8'));
    for (const t of arr) out.push(t);
  }
  return out;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sampleIdx = process.argv.indexOf('--sample');
  const sampleN = sampleIdx !== -1 ? parseInt(process.argv[sampleIdx + 1] ?? '10', 10) : 0;

  console.log('Loading trades…');
  const trades = loadAllTrades();
  console.log(`  ${trades.length} trades`);

  const parses: FlatPickParse[] = [];

  for (const t of trades) {
    const era: 'post_2019' | 'pre_2019' = isPost2019Format(t.description)
      ? 'post_2019'
      : 'pre_2019';

    // Pre-computed clause map for this trade (post-2019 only).
    const clauseList = era === 'post_2019' ? extractPickClauses(t.description) : [];
    // Multiple picks with same year+round consumed in order.
    const clauseCursor = new Map<string, number>();

    for (const a of t.assets) {
      if (a.type !== 'pick' && a.type !== 'swap') continue;
      if (!a.pick_year || a.pick_round == null) continue;
      if (a.pick_round !== 1 && a.pick_round !== 2) continue;
      const year = a.pick_year;
      const round = a.pick_round as 1 | 2;

      const origTeam = resolveOriginalTeam(year, round, a.from_team_id, t.description, a.original_team_id);
      if (!origTeam) continue;
      if (!TARGET_YEARS.includes(year as typeof TARGET_YEARS[number])) continue;

      // Find this pick's clause in the description.
      let clause = '';
      if (era === 'post_2019') {
        const key = `${year}|${round}`;
        const start = clauseCursor.get(key) ?? 0;
        // Walk clauseList to find the next matching clause from `start`.
        let found = -1;
        for (let i = 0; i < clauseList.length; i++) {
          if (clauseList[i].year === year && clauseList[i].round === round) {
            if (i >= start) {
              found = i;
              break;
            }
          }
        }
        if (found !== -1) {
          clause = clauseList[found].text;
          clauseCursor.set(key, found + 1);
        }
      }
      if (!clause) clause = t.description; // fallback

      const hasLang = PROTECTION_RE.test(clause) || a.type === 'swap';
      const parsed = era === 'post_2019' && hasLang ? parseClauseForYear(clause, year) : null;

      parses.push({
        pick_key: `${year}-${round}-${origTeam}`,
        year,
        round,
        original_team_id: origTeam,
        trade_id: t.id,
        trade_date: t.date,
        description: t.description,
        clause,
        parsed,
        era,
        has_protection_language: hasLang,
      });
    }
  }

  console.log(`  pick-asset rows (in target years): ${parses.length}`);

  // Group by pick_key → pick the most recent parse with protection language.
  const byKey = new Map<string, FlatPickParse[]>();
  for (const p of parses) {
    const arr = byKey.get(p.pick_key) ?? [];
    arr.push(p);
    byKey.set(p.pick_key, arr);
  }

  const picks: Record<string, PickProtection> = {};
  const stats = {
    total_candidate_picks: 0,
    high: 0,
    medium: 0,
    low: 0,
    unparsed_pre_2019: 0,
    no_protection_language: 0,
    swap_assets: 0,
    did_not_convey: 0,
    by_rule: {} as Record<string, number>,
  };

  for (const [pick_key, arr] of byKey.entries()) {
    // Only include picks that have *any* protection language across their lineage.
    const conditional = arr.filter((p) => p.has_protection_language);
    if (conditional.length === 0) {
      stats.no_protection_language += 1;
      continue;
    }
    stats.total_candidate_picks += 1;

    // Take the most recent trade step.
    conditional.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const latest = conditional[conditional.length - 1];

    if (latest.era === 'pre_2019') {
      picks[pick_key] = {
        pick_key,
        asset_class: 'pick',
        conditions: [],
        status: 'pending',
        confidence: 'unparsed',
        raw_snippet: latest.clause.slice(0, 300),
        trade_id: latest.trade_id,
        trade_date: latest.trade_date,
        notes: ['Pre-2019 CSV era — not parsed. Raw snippet preserved.'],
      };
      stats.unparsed_pre_2019 += 1;
      continue;
    }

    if (!latest.parsed) {
      // Post-2019 but no protection language matched on the clause.
      // Still record if the asset was a swap, etc.
      picks[pick_key] = {
        pick_key,
        asset_class: 'pick',
        conditions: [{ year: latest.year, rule: { kind: 'unclear' } }],
        status: 'pending',
        confidence: 'low',
        raw_snippet: latest.clause.slice(0, 300),
        trade_id: latest.trade_id,
        trade_date: latest.trade_date,
        notes: ['Post-2019 but no protection pattern matched.'],
      };
      stats.low += 1;
      continue;
    }

    picks[pick_key] = {
      pick_key,
      asset_class: latest.parsed.asset_class,
      conditions: latest.parsed.conditions,
      status: latest.parsed.status,
      confidence: latest.parsed.confidence,
      raw_snippet: latest.clause.slice(0, 300),
      trade_id: latest.trade_id,
      trade_date: latest.trade_date,
      notes: latest.parsed.notes,
    };

    if (latest.parsed.confidence === 'high') stats.high += 1;
    else if (latest.parsed.confidence === 'medium') stats.medium += 1;
    else stats.low += 1;

    if (latest.parsed.asset_class === 'swap') stats.swap_assets += 1;
    if (latest.parsed.status === 'did_not_convey') stats.did_not_convey += 1;

    for (const c of latest.parsed.conditions) {
      stats.by_rule[c.rule.kind] = (stats.by_rule[c.rule.kind] ?? 0) + 1;
    }
  }

  console.log('');
  console.log('=== Pick Protection Parse Stats ===');
  console.log(`Candidate picks (with protection language): ${stats.total_candidate_picks}`);
  console.log(`  high confidence:   ${stats.high}`);
  console.log(`  medium confidence: ${stats.medium}`);
  console.log(`  low confidence:    ${stats.low}`);
  console.log(`  pre-2019 unparsed: ${stats.unparsed_pre_2019}`);
  console.log('');
  console.log(`Swap-rights assets: ${stats.swap_assets}`);
  console.log(`Historical did-not-convey: ${stats.did_not_convey}`);
  console.log('');
  console.log('Rule distribution (conditions count, incl. multi-rule picks):');
  for (const [kind, n] of Object.entries(stats.by_rule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(24)} ${n}`);
  }
  const parsed = stats.high + stats.medium;
  const coverable = stats.total_candidate_picks - stats.unparsed_pre_2019;
  if (coverable > 0) {
    const pct = ((parsed / coverable) * 100).toFixed(1);
    console.log('');
    console.log(`Post-2019 coverage (high+medium / post-2019 candidates): ${pct}% (${parsed}/${coverable})`);
  }

  if (sampleN > 0) {
    for (const bucket of ['low', 'medium', 'unparsed'] as const) {
      console.log('');
      console.log(`=== Sample ${sampleN} ${bucket}-confidence picks ===`);
      let shown = 0;
      for (const p of Object.values(picks)) {
        if (p.confidence === bucket && shown < sampleN) {
          console.log(`\n${p.pick_key} (${p.trade_date})`);
          console.log(`  rules:   ${p.conditions.map((c) => JSON.stringify(c.rule)).join(', ')}`);
          console.log(`  snippet: ${p.raw_snippet}`);
          if (p.notes.length) console.log(`  notes:   ${p.notes.join(' ')}`);
          shown += 1;
        }
      }
    }
  }

  if (dryRun) {
    console.log('\nDry run — no file written.');
    return;
  }

  const output = {
    generated_at: new Date().toISOString(),
    stats,
    picks,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`\nWrote ${OUT_FILE} (${kb} KB)`);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
