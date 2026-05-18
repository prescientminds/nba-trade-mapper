// ── Salary Ledger ─────────────────────────────────────────────────
// Shows each side's outgoing salary, the max it can legally take back
// under the 2023 CBA, and what it's actually taking back. Gives the
// user live guidance on whether the trade is balanced before the
// legality verdict flips.
//
// Shared between the standalone /trade-machine page and the canvas-native
// side panel. Pure presentational — all logic lives in trade-builder.

import { TEAMS } from '@/lib/teams';
import { getCBAEra, maxIncomingSalary } from '@/lib/trade-validation';
import { type BuilderState, outgoingSalaryOf, fmtM } from '@/lib/trade-builder';

export default function SalaryLedger({ left, right }: { left: BuilderState; right: BuilderState }) {
  const { total: leftOut, complete: leftComplete } = outgoingSalaryOf(left);
  const { total: rightOut, complete: rightComplete } = outgoingSalaryOf(right);
  const bothTeamsPicked = !!left.teamId && !!right.teamId;
  const bothSendPlayers =
    left.selectedPlayerNames.size > 0 && right.selectedPlayerNames.size > 0;

  if (!bothTeamsPicked || !bothSendPlayers) return null;
  if (!leftComplete || !rightComplete) {
    return (
      <section style={ledgerShell}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Missing 2025-26 salary data for one or more selected players — legality
          check falls back to asset-count only.
        </div>
      </section>
    );
  }

  const era = getCBAEra('2026-02-01');
  const leftMaxIn = maxIncomingSalary(leftOut, era);
  const rightMaxIn = maxIncomingSalary(rightOut, era);

  const leftOk = rightOut <= leftMaxIn;
  const rightOk = leftOut <= rightMaxIn;

  const leftTeamName = left.teamId ? TEAMS[left.teamId]?.name ?? 'Team A' : 'Team A';
  const rightTeamName = right.teamId ? TEAMS[right.teamId]?.name ?? 'Team B' : 'Team B';

  return (
    <section style={ledgerShell}>
      <LedgerRow
        teamName={leftTeamName}
        sends={leftOut}
        maxIn={leftMaxIn}
        actuallyTakes={rightOut}
        ok={leftOk}
      />
      <LedgerRow
        teamName={rightTeamName}
        sends={rightOut}
        maxIn={rightMaxIn}
        actuallyTakes={leftOut}
        ok={rightOk}
      />
    </section>
  );
}

function LedgerRow({
  teamName,
  sends,
  maxIn,
  actuallyTakes,
  ok,
}: {
  teamName: string;
  sends: number;
  maxIn: number;
  actuallyTakes: number;
  ok: boolean;
}) {
  const overshoot = actuallyTakes - maxIn;
  const color = ok ? 'var(--accent-green)' : 'var(--accent-red)';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 1fr auto auto auto',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderRadius: 'var(--radius-sm)',
        background: ok ? 'rgba(6,214,160,0.06)' : 'rgba(239,71,111,0.08)',
      }}
    >
      <span style={{ color, fontSize: 14, fontWeight: 700 }}>{ok ? '✓' : '✗'}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
        {teamName}
      </span>
      <LedgerStat label="Sends" value={`$${fmtM(sends)}`} />
      <LedgerStat label="Max incoming" value={`$${fmtM(maxIn)}`} />
      <LedgerStat
        label={ok ? 'Taking back' : `Over by $${fmtM(Math.max(0, overshoot))}`}
        value={`$${fmtM(actuallyTakes)}`}
        emphasize={!ok}
      />
    </div>
  );
}

function LedgerStat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 90 }}>
      <span
        style={{
          fontSize: 9,
          color: emphasize ? 'var(--accent-red)' : 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

const ledgerShell: React.CSSProperties = {
  marginTop: 20,
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
