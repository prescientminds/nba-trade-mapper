/**
 * CBA regime, not raw calendar distance.
 *
 * v1 multiplied the distance by `1 + |yearGap| / 30`. Because the proposed
 * trade's year was hardcoded to `CURRENT_YEAR`, that was not an era penalty at
 * all — it was a flat recency bias applied to every candidate, scaling from
 * 1.03x for a 2026 trade to 2.67x for a 1977 one. Pre-2000 trades were
 * multiplied out of contention regardless of how well they actually fit.
 *
 * What actually makes two trades contemporaries is the rule set they were built
 * under. The mid-level exception shrank in 2011, picks appreciated sharply
 * after it, and the 2023 second apron changed what a team is even allowed to
 * do. A 2012 trade and a 2016 trade are near-neighbours; a 2022 trade and a
 * 2024 trade are not, despite being closer on the calendar.
 *
 * Era is therefore an ordinal feature inside the distance vector, weighted like
 * any other, rather than a multiplier bolted onto the outside.
 */

import { getCBAEra } from '../trade-validation';
import type { TradeProfile } from './types';

/** Ordinal CBA regimes, oldest first. */
export const ERA_LABELS = [
  'pre-1999',
  '1999',
  '2005',
  '2011',
  '2017',
  '2023',
] as const;

export type EraLabel = (typeof ERA_LABELS)[number];

/**
 * Trade date, best available. Profiles built by v2 carry an ISO `date`; older
 * ones only have the season end-year, which we approximate to midseason so the
 * CBA lookup lands in the right regime for all but a handful of July trades in
 * transition years.
 */
function tradeDate(trade: TradeProfile): string {
  if (trade.date) return trade.date;
  return `${trade.year - 1}-12-31`;
}

export function eraLabel(trade: TradeProfile): EraLabel {
  const date = tradeDate(trade);
  // getCBAEra's floor is the 1999 CBA; anything earlier is its own regime,
  // with no salary cap at all before 1984.
  if (date < '1999-02-01') return 'pre-1999';
  return getCBAEra(date) as EraLabel;
}

export function eraIndex(trade: TradeProfile): number {
  return ERA_LABELS.indexOf(eraLabel(trade));
}

/**
 * February deadline window. Deadline trades skew short-horizon — rentals,
 * salary dumps, contenders topping up — and summer trades skew structural, so
 * this separates two populations that otherwise look alike on the box score.
 *
 * Without a date we cannot tell, and returning false is the safer default: it
 * never asserts a deadline trade that wasn't one.
 */
export function isDeadlineWindow(trade: TradeProfile): boolean {
  if (!trade.date) return false;
  const month = trade.date.slice(5, 7);
  return month === '02';
}
