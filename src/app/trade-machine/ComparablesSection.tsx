// ── Historical Comparables ────────────────────────────────────────
// Given the two builder sides, builds the proposed trade profile and
// surfaces its five closest historical matches as click-to-expand
// cards (factor chips always on; rationale + outcome + motivation on
// expand).
//
// Shared between the standalone /trade-machine page and the canvas-native
// side panel. Reactive: recomputes on [left, right, salaryCap]. All
// matching logic lives in comparables / trade-builder — this is the
// presentation layer. Comparables-as-graph-nodes is Phase B Step 3;
// this stays cards.

import { useEffect, useMemo, useState } from 'react';
import {
  findComparablesDetailed,
  BAND_LABELS,
  type Comparable,
  type TradeProfile,
  type CalibrationArtifact,
} from '@/lib/comparables';
import { buildProposedProfileForSlots, type BuilderState } from '@/lib/trade-builder';

// Module-level cache, same pattern as loadOwnership() in trade-builder: the
// calibration is a static 12 KB artifact and only needs fetching once per page
// load, not once per mount. Both the standalone page and the canvas side panel
// render this component, and without the cache they would each fetch it.
let calibrationCache: CalibrationArtifact | null = null;
let calibrationPromise: Promise<CalibrationArtifact> | null = null;
function loadCalibration(): Promise<CalibrationArtifact> {
  if (calibrationCache) return Promise.resolve(calibrationCache);
  if (calibrationPromise) return calibrationPromise;
  calibrationPromise = fetch('/data/comparables-calibration.json')
    .then((r) => r.json())
    .then((j: CalibrationArtifact) => {
      calibrationCache = j;
      return j;
    });
  return calibrationPromise;
}

export default function ComparablesSection({
  slots,
  salaryCap,
  candidates,
  onResultsChange,
}: {
  slots: BuilderState[];
  salaryCap: number | null;
  candidates: TradeProfile[] | null;
  /** Side-channel for the canvas-native panel: lets the parent publish the
   *  current top-N to the graph store so the node-side Visualize button can
   *  fire without recomputing. Standalone /trade-machine omits it. */
  onResultsChange?: (results: Comparable[]) => void;
}) {
  const proposed = useMemo(
    () => buildProposedProfileForSlots(slots, salaryCap),
    [slots, salaryCap],
  );

  const candidateLookup = useMemo(() => {
    const m = new Map<string, TradeProfile>();
    if (candidates) for (const c of candidates) m.set(c.id, c);
    return m;
  }, [candidates]);

  const [calibration, setCalibration] = useState<CalibrationArtifact | null>(null);
  useEffect(() => {
    let live = true;
    loadCalibration()
      .then((c) => {
        if (live) setCalibration(c);
      })
      .catch(() => {
        // Without the calibration there is no absolute scale. Showing a
        // rank-within-the-five instead is exactly the bug v2 replaces, so the
        // section stays empty and says so rather than showing a fake number.
      });
    return () => {
      live = false;
    };
  }, []);

  const detailed = useMemo(() => {
    if (!proposed || !candidates || !calibration) return null;
    return findComparablesDetailed(proposed, candidates, { topN: 5, calibration });
  }, [proposed, candidates, calibration]);

  const results: Comparable[] = useMemo(() => detailed?.comparables ?? [], [detailed]);

  useEffect(() => {
    onResultsChange?.(results);
  }, [results, onResultsChange]);

  return (
    <section style={{ marginTop: 28 }}>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          letterSpacing: '0.04em',
          color: 'var(--text-primary)',
          marginBottom: 12,
        }}
      >
        Historical Comparables
      </h2>
      {(!candidates || !calibration) && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Loading historical trades…
        </div>
      )}
      {candidates && calibration && !proposed && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Build a trade on both sides to see its five closest historical matches.
        </div>
      )}
      {candidates && calibration && proposed && results.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          No comparables — try adjusting the players involved.
        </div>
      )}

      {/* Say plainly when nothing in 1,570 trades is structurally like this,
          rather than presenting the five least-bad options as precedents. */}
      {detailed?.noStructuralPrecedent && results.length > 0 && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            background: 'rgba(249,199,79,0.08)',
            border: '1px solid rgba(249,199,79,0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 10px',
            marginBottom: 12,
            lineHeight: 1.45,
          }}
        >
          No historical trade is structurally like this one. The closest matches
          below are the nearest available, not precedents.
        </div>
      )}

      {detailed && !detailed.noStructuralPrecedent && results.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            marginBottom: 10,
          }}
        >
          {detailed.proposedArchetype.replace(/_/g, ' ')} · {detailed.gatedCandidateCount} structurally similar trades considered
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {results.map((c) => (
          <ComparableCard
            key={c.id}
            comparable={c}
            year={candidateLookup.get(c.id)?.year ?? null}
          />
        ))}
      </div>
    </section>
  );
}

const BAND_COLOR: Record<Comparable['band'], string> = {
  'near-identical': 'var(--accent-teal)',
  strong: 'var(--accent-teal)',
  loose: 'var(--accent-blue)',
  weak: 'var(--text-muted)',
};

function ComparableCard({ comparable, year }: { comparable: Comparable; year: number | null }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(comparable.matchScore * 100);
  const factors = comparable.factors;

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      style={{
        padding: 14,
        background: 'var(--bg-card)',
        border: `1px solid ${expanded ? 'var(--accent-orange)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
            flex: 1,
          }}
        >
          {comparable.headline ?? comparable.id}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: BAND_COLOR[comparable.band],
            whiteSpace: 'nowrap',
            textAlign: 'right',
            lineHeight: 1.35,
          }}
        >
          {/* The band leads. The number is detail: "87%" reads as more
              precision than the model has, "Strong precedent" says what it
              means. Both are absolute — see calibration.ts. */}
          <div style={{ fontSize: 10, letterSpacing: '0.04em' }}>
            {BAND_LABELS[comparable.band]}
          </div>
          <div style={{ opacity: 0.75 }}>{pct}%</div>
        </div>
      </div>

      {year != null && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {year - 1}-{String(year).slice(-2)}
        </div>
      )}

      {/* Why this matched, in the engine's own terms. The raw ΔBPM / Δage
          chips moved into the expanded rationale — they describe two players,
          while the match is made on seventeen features. */}
      {comparable.matchedOn.length > 0 && <MatchedOnChips reasons={comparable.matchedOn} />}

      {/* Click-to-expand rationale */}
      {expanded && factors && <FactorChips factors={factors} />}
      {expanded && factors && (
        <ExpandedRationale
          factors={factors}
          outcomeSummary={comparable.outcomeSummary}
          motivation={comparable.motivation}
          tradeId={comparable.id}
        />
      )}

      {!expanded && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            marginTop: 2,
          }}
        >
          click for details
        </div>
      )}
    </div>
  );
}

function MatchedOnChips({ reasons }: { reasons: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {reasons.map((r) => (
        <span
          key={r}
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            background: 'rgba(255,255,255,0.04)',
            padding: '2px 7px',
            borderRadius: 999,
            border: '1px solid var(--border-subtle)',
            whiteSpace: 'nowrap',
          }}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

function FactorChips({ factors }: { factors: NonNullable<Comparable['factors']> }) {
  const chipStyle: React.CSSProperties = {
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    background: 'rgba(255,255,255,0.04)',
    padding: '2px 7px',
    borderRadius: 999,
    border: '1px solid var(--border-subtle)',
    whiteSpace: 'nowrap',
  };
  const bpm = factors.bpmDelta;
  const age = factors.ageDelta;
  const era = factors.eraGap;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      <span style={chipStyle}>
        ΔBPM {bpm == null ? '—' : (Math.abs(bpm) < 0.05 ? '0.0' : bpm.toFixed(1))}
      </span>
      <span style={chipStyle}>
        Δage {age === 0 ? '0' : (age > 0 ? `+${age}` : `${age}`)}y
      </span>
      <span style={chipStyle}>
        {era === 0 ? 'same yr' : `${Math.abs(era)}y era`}
      </span>
    </div>
  );
}

function rationaleSentence(factors: NonNullable<Comparable['factors']>): string {
  const p = factors.proposedAnchor;
  const c = factors.candidateAnchor;
  const bpmPart =
    factors.bpmDelta == null
      ? `${p.name} (age ${p.age}) and ${c.name} (age ${c.age})`
      : `${p.name} (age ${p.age}, ${fmtBpm(p.bpm)} BPM) and ${c.name} (age ${c.age}, ${fmtBpm(c.bpm)} BPM)`;
  const eraAbs = Math.abs(factors.eraGap);
  const eraPart =
    factors.eraGap === 0
      ? 'same era'
      : `${eraAbs} year${eraAbs === 1 ? '' : 's'} ${factors.eraGap > 0 ? 'later' : 'earlier'}`;
  return `Anchors ${bpmPart} — ${eraPart}.`;
}

function fmtBpm(x: number | null): string {
  if (x == null) return '—';
  return x > 0 ? `+${x.toFixed(1)}` : x.toFixed(1);
}

function ExpandedRationale({
  factors,
  outcomeSummary,
  motivation,
  tradeId,
}: {
  factors: NonNullable<Comparable['factors']>;
  outcomeSummary?: string;
  motivation?: string;
  tradeId: string;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        marginTop: 6,
        padding: '10px 12px',
        background: 'rgba(255,107,53,0.05)',
        border: '1px solid rgba(255,107,53,0.2)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--accent-orange)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Why this match
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {rationaleSentence(factors)}
      </div>

      {outcomeSummary && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            paddingTop: 6,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Outcome:</span>
          {outcomeSummary}
        </div>
      )}

      {motivation && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Tagged:
          </span>
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--accent-purple)',
              padding: '2px 7px',
              borderRadius: 999,
              background: 'rgba(155, 93, 229, 0.12)',
              border: '1px solid rgba(155, 93, 229, 0.3)',
            }}
          >
            {motivation.replace(/_/g, ' ')}
          </span>
        </div>
      )}

      <a
        href={`/?t=${tradeId}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{
          fontSize: 11,
          color: 'var(--accent-orange)',
          textDecoration: 'none',
          alignSelf: 'flex-start',
        }}
      >
        Open this trade in the graph →
      </a>
    </div>
  );
}
