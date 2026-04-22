/**
 * Bobby Marks Engine: CBA trade salary matching validation.
 *
 * Validates whether a trade is salary-cap legal based on the CBA rules
 * that were in effect at the time of the trade.
 *
 * Trade matching rules vary by:
 *   1. CBA era (different thresholds in 2005, 2011, 2017, 2023 CBAs)
 *   2. Team cap status (under cap, over cap, above tax apron, above second apron)
 *   3. Outgoing salary amount (tiered brackets)
 */

// ── CBA Eras ────────────────────────────────────────────────────────

export type CBAEra = '1999' | '2005' | '2011' | '2017' | '2023';

export function getCBAEra(tradeDate: string): CBAEra {
  // CBA effective dates (approximate — based on ratification, not season start)
  if (tradeDate >= '2023-07-01') return '2023';
  if (tradeDate >= '2017-07-01') return '2017';
  if (tradeDate >= '2011-12-01') return '2011';  // 2011 lockout ended Dec 2011
  if (tradeDate >= '2005-07-01') return '2005';
  return '1999';  // 1999 CBA: flat 125% + $100K, no tiered brackets
}

// ── Salary matching rules per CBA era ───────────────────────────────

interface MatchingBracket {
  /** Outgoing salary threshold (up to this amount, use this rule) */
  threshold: number;
  /** Either a multiplier (e.g., 1.75 = 175%) or null for additive-only */
  multiplier: number;
  /** Flat bonus added on top */
  bonus: number;
}

interface CBAMatchingRules {
  /** Ordered brackets — first matching bracket applies */
  brackets: MatchingBracket[];
  /** Fallback for salary above all thresholds */
  fallback: { multiplier: number; bonus: number };
}

const MATCHING_RULES: Record<CBAEra, CBAMatchingRules> = {
  '1999': {
    // 1999 CBA (post-lockout): flat 125% + $100K for all over-the-cap trades,
    // no tiered brackets. Applies Jan 1999 through June 2005.
    brackets: [],
    fallback: { multiplier: 1.25, bonus: 100_000 },
  },
  '2005': {
    // 2005 CBA added a 150% tier for outgoing salaries under ~$9.8M.
    brackets: [
      { threshold: 9_800_000, multiplier: 1.5, bonus: 100_000 },
    ],
    fallback: { multiplier: 1.25, bonus: 100_000 },
  },
  '2011': {
    // 2011 CBA: tiered system
    brackets: [
      { threshold: 9_800_000, multiplier: 1.5, bonus: 100_000 },
      { threshold: 19_600_000, multiplier: 1.0, bonus: 5_000_000 },
    ],
    fallback: { multiplier: 1.25, bonus: 100_000 },
  },
  '2017': {
    // 2017 CBA: revised tiers
    brackets: [
      { threshold: 6_533_333, multiplier: 1.75, bonus: 100_000 },
      { threshold: 19_600_000, multiplier: 1.0, bonus: 5_000_000 },
    ],
    fallback: { multiplier: 1.25, bonus: 100_000 },
  },
  '2023': {
    // 2023 CBA: new tiers
    brackets: [
      { threshold: 7_500_000, multiplier: 2.0, bonus: 250_000 },
      { threshold: 29_000_000, multiplier: 1.0, bonus: 7_500_000 },
    ],
    fallback: { multiplier: 1.25, bonus: 250_000 },
  },
};

// ── Core validation ─────────────────────────────────────────────────

/**
 * Calculate the maximum incoming salary allowed for a given outgoing salary,
 * assuming the team is over the cap (standard trade rules).
 */
export function maxIncomingSalary(outgoingSalary: number, era: CBAEra): number {
  const rules = MATCHING_RULES[era];

  for (const bracket of rules.brackets) {
    if (outgoingSalary <= bracket.threshold) {
      return Math.floor(outgoingSalary * bracket.multiplier + bracket.bonus);
    }
  }

  return Math.floor(outgoingSalary * rules.fallback.multiplier + rules.fallback.bonus);
}

/**
 * Calculate the minimum outgoing salary required to receive a given incoming salary.
 * (Inverse of maxIncomingSalary — for checking if a team sent enough salary out.)
 */
export function minOutgoingSalary(incomingSalary: number, era: CBAEra): number {
  const rules = MATCHING_RULES[era];

  // Check each bracket's inverse
  for (const bracket of rules.brackets) {
    const maxIncoming = bracket.threshold * bracket.multiplier + bracket.bonus;
    if (incomingSalary <= maxIncoming) {
      // Inverse: outgoing >= (incoming - bonus) / multiplier
      return Math.ceil((incomingSalary - bracket.bonus) / bracket.multiplier);
    }
  }

  // Fallback bracket inverse
  return Math.ceil((incomingSalary - rules.fallback.bonus) / rules.fallback.multiplier);
}

// ── Team cap status ─────────────────────────────────────────────────

export type CapStatus =
  | 'under_cap'           // Can absorb salary into cap room
  | 'over_cap'            // Standard matching rules apply
  | 'above_first_apron'   // Cannot take back more than sent (2023 CBA)
  | 'above_second_apron'; // Same + cannot aggregate players (2023 CBA)

export interface CapThresholds {
  salary_cap: number;
  luxury_tax: number | null;
  first_apron: number | null;
  second_apron: number | null;
}

export function getCapStatus(teamSalary: number, thresholds: CapThresholds, era: CBAEra): CapStatus {
  if (teamSalary < thresholds.salary_cap) return 'under_cap';

  // Second apron only exists in 2023 CBA
  if (era === '2023' && thresholds.second_apron && teamSalary >= thresholds.second_apron) {
    return 'above_second_apron';
  }

  // First apron (or tax apron in pre-2023)
  if (thresholds.first_apron && teamSalary >= thresholds.first_apron) {
    return 'above_first_apron';
  }

  return 'over_cap';
}

// ── Trade validation result ─────────────────────────────────────────

export interface TeamTradeValidation {
  teamId: string;
  outgoingSalary: number;
  incomingSalary: number;
  maxAllowedIncoming: number;
  capStatus: CapStatus;
  isLegal: boolean;
  /** Why the trade works (or doesn't) */
  reason: string;
  /** Players with salary data */
  outgoingPlayers: { name: string; salary: number }[];
  incomingPlayers: { name: string; salary: number }[];
  /** Players missing salary data */
  missingSalaryPlayers: string[];
}

export interface TradeValidationResult {
  tradeId: string;
  tradeDate: string;
  season: string;
  cbaEra: CBAEra;
  teams: TeamTradeValidation[];
  /** Overall verdict */
  isLegal: boolean;
  /** True if we're missing salary data for any player */
  hasIncompleteData: boolean;
  /** Human-readable summary */
  summary: string;
}

// ── Validate a trade ────────────────────────────────────────────────

export interface TradeAssetWithSalary {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string;
  to_team_id: string;
  salary: number | null;  // Player's salary at time of trade
}

export function validateTrade(
  tradeId: string,
  tradeDate: string,
  season: string,
  assets: TradeAssetWithSalary[],
  capThresholds: CapThresholds,
  teamSalaries?: Map<string, number>,  // Optional: team total salary for cap status
): TradeValidationResult {
  const era = getCBAEra(tradeDate);

  // Group assets by team (what each team sends and receives)
  const teamIds = new Set<string>();
  for (const a of assets) {
    teamIds.add(a.from_team_id);
    teamIds.add(a.to_team_id);
  }

  const teamValidations: TeamTradeValidation[] = [];
  let allLegal = true;
  let hasIncompleteData = false;

  for (const teamId of teamIds) {
    const outgoing = assets.filter(a => a.from_team_id === teamId && a.type === 'player');
    const incoming = assets.filter(a => a.to_team_id === teamId && a.type === 'player');

    const outgoingPlayers: { name: string; salary: number }[] = [];
    const incomingPlayers: { name: string; salary: number }[] = [];
    const missingSalaryPlayers: string[] = [];

    let outgoingSalary = 0;
    let incomingSalary = 0;

    for (const a of outgoing) {
      if (a.player_name && a.salary != null) {
        outgoingPlayers.push({ name: a.player_name, salary: a.salary });
        outgoingSalary += a.salary;
      } else if (a.player_name) {
        missingSalaryPlayers.push(a.player_name);
        hasIncompleteData = true;
      }
    }

    for (const a of incoming) {
      if (a.player_name && a.salary != null) {
        incomingPlayers.push({ name: a.player_name, salary: a.salary });
        incomingSalary += a.salary;
      } else if (a.player_name) {
        missingSalaryPlayers.push(a.player_name);
        hasIncompleteData = true;
      }
    }

    // Determine cap status
    const teamTotalSalary = teamSalaries?.get(teamId);
    let capStatus: CapStatus = 'over_cap';  // Default assumption
    if (teamTotalSalary != null) {
      capStatus = getCapStatus(teamTotalSalary, capThresholds, era);
    }

    // Validate
    let maxAllowedIncoming: number;
    let isLegal: boolean;
    let reason: string;

    if (capStatus === 'under_cap') {
      // Team under cap can absorb salary into cap room
      const capRoom = capThresholds.salary_cap - (teamTotalSalary ?? 0);
      maxAllowedIncoming = outgoingSalary + capRoom;
      isLegal = incomingSalary <= maxAllowedIncoming;
      reason = isLegal
        ? `Under cap with $${(capRoom / 1e6).toFixed(1)}M room — can absorb salary`
        : `Incoming exceeds cap room + outgoing by $${((incomingSalary - maxAllowedIncoming) / 1e6).toFixed(1)}M`;
    } else if (capStatus === 'above_first_apron' && era === '2023') {
      // Above first apron in 2023 CBA: cannot take back more than sent
      maxAllowedIncoming = outgoingSalary;
      isLegal = incomingSalary <= outgoingSalary;
      reason = isLegal
        ? `Above first apron — incoming ≤ outgoing (${(incomingSalary / 1e6).toFixed(1)}M ≤ ${(outgoingSalary / 1e6).toFixed(1)}M)`
        : `Above first apron — incoming $${(incomingSalary / 1e6).toFixed(1)}M exceeds outgoing $${(outgoingSalary / 1e6).toFixed(1)}M`;
    } else if (capStatus === 'above_second_apron') {
      // Above second apron (2023 CBA):
      //   1. Incoming salary ≤ outgoing (dollar-in, dollar-out)
      //   2. Cannot aggregate OUTGOING contracts to acquire a single bigger incoming
      //      (e.g., Phoenix can't combine Nurkić + Little to trade for one $24M player).
      //      Practical test: no single incoming salary can exceed the largest single
      //      outgoing salary. If it does, matching would require combining outgoings.
      maxAllowedIncoming = outgoingSalary;
      const totalCapOk = incomingSalary <= outgoingSalary;

      const maxOutgoing = outgoingPlayers.length > 0
        ? Math.max(...outgoingPlayers.map(p => p.salary))
        : 0;
      const maxIncoming = incomingPlayers.length > 0
        ? Math.max(...incomingPlayers.map(p => p.salary))
        : 0;
      const aggregationOk = maxIncoming <= maxOutgoing;

      isLegal = totalCapOk && aggregationOk;

      if (!totalCapOk) {
        reason = `Above second apron — incoming $${(incomingSalary / 1e6).toFixed(1)}M exceeds outgoing $${(outgoingSalary / 1e6).toFixed(1)}M`;
      } else if (!aggregationOk) {
        reason = `Above second apron — illegal outgoing aggregation: largest incoming $${(maxIncoming / 1e6).toFixed(1)}M exceeds largest single outgoing $${(maxOutgoing / 1e6).toFixed(1)}M`;
      } else {
        reason = `Above second apron — incoming $${(incomingSalary / 1e6).toFixed(1)}M ≤ outgoing $${(outgoingSalary / 1e6).toFixed(1)}M, no outgoing aggregation`;
      }
    } else {
      // Standard over-the-cap matching rules
      maxAllowedIncoming = maxIncomingSalary(outgoingSalary, era);
      isLegal = incomingSalary <= maxAllowedIncoming;
      reason = isLegal
        ? `Over cap — incoming $${(incomingSalary / 1e6).toFixed(1)}M within allowed $${(maxAllowedIncoming / 1e6).toFixed(1)}M (sending $${(outgoingSalary / 1e6).toFixed(1)}M)`
        : `Over cap — incoming $${(incomingSalary / 1e6).toFixed(1)}M exceeds allowed $${(maxAllowedIncoming / 1e6).toFixed(1)}M`;
    }

    if (!isLegal) allLegal = false;

    teamValidations.push({
      teamId,
      outgoingSalary,
      incomingSalary,
      maxAllowedIncoming,
      capStatus,
      isLegal,
      reason,
      outgoingPlayers,
      incomingPlayers,
      missingSalaryPlayers,
    });
  }

  // If we don't have team salary data, we assume over-the-cap.
  // Trades that fail matching might actually be legal if a team had cap room.
  const summary = hasIncompleteData
    ? `Incomplete salary data — ${teamValidations.filter(t => t.missingSalaryPlayers.length > 0).length} team(s) missing player salaries`
    : allLegal
      ? `Trade is salary-cap legal under ${era} CBA rules`
      : `Trade appears salary-illegal — may indicate cap room absorption or trade exception usage`;

  return {
    tradeId,
    tradeDate,
    season,
    cbaEra: era,
    teams: teamValidations,
    isLegal: allLegal,
    hasIncompleteData,
    summary,
  };
}
