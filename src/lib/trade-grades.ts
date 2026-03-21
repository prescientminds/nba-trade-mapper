/**
 * Trade Grade System — maps team trade scores to letter grades (A+ through F).
 *
 * Thresholds based on what score levels mean in basketball terms:
 * - A role player: 5-7 score (few WS, no accolades)
 * - Solid starter over multiple seasons: 20-30 score
 * - All-Star caliber return: 45-60 score
 * - MVP/franchise-altering: 60-100+ score
 */

export type TradeGrade =
  | 'A+' | 'A' | 'A-'
  | 'B+' | 'B' | 'B-'
  | 'C+' | 'C' | 'C-'
  | 'D' | 'F';

export interface GradeInfo {
  grade: TradeGrade;
  color: string;      // display color for the grade letter
  label: string;       // short description
}

const THRESHOLDS: [number, TradeGrade, string][] = [
  [100, 'A+', 'Generational haul'],
  [60,  'A',  'Franchise-altering'],
  [45,  'A-', 'All-Star return'],
  [30,  'B+', 'Very strong return'],
  [20,  'B',  'Solid return'],
  [12,  'B-', 'Good role player value'],
  [8,   'C+', 'Average'],
  [5,   'C',  'Below average'],
  [3,   'C-', 'Mediocre'],
  [1,   'D',  'Poor'],
  [0,   'F',  'Disaster'],
];

const GRADE_COLORS: Record<TradeGrade, string> = {
  'A+': '#FFD700',  // gold
  'A':  '#FFD700',
  'A-': '#FFC107',
  'B+': '#4CAF50',  // green
  'B':  '#4CAF50',
  'B-': '#66BB6A',
  'C+': '#FF9800',  // orange
  'C':  '#FF9800',
  'C-': '#FFA726',
  'D':  '#F44336',  // red
  'F':  '#D32F2F',
};

export function getTradeGrade(score: number): GradeInfo {
  for (const [threshold, grade, label] of THRESHOLDS) {
    if (score >= threshold) {
      return { grade, color: GRADE_COLORS[grade], label };
    }
  }
  return { grade: 'F', color: GRADE_COLORS['F'], label: 'Disaster' };
}

/** Format a dollar amount compactly: $196M, $2.6M, etc. */
export function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

/** Format WS: 68.0, 23.3, 0.9 */
export function fmtWs(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n === 0) return '0.0';
  if (Math.abs(n) >= 100) return Math.round(n).toString();
  return n.toFixed(1);
}
