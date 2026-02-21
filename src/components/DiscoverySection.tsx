'use client';

import { useState, useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';
import { TEAMS } from '@/lib/teams';
import { contrastText } from '@/lib/colors';
import { loadTrade, loadSearchIndex, staticTradeToTradeWithDetails } from '@/lib/trade-data';
import type { TradeWithDetails, TradeSearchIndexEntry } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────

interface TradeCard {
  type: 'trade';
  tradeId: string;
  heading: string;    // "Lakers & Celtics"
  players: string[];  // ["Kobe Bryant", "Shaq O'Neal", ...]
  season: string;
  teams: string[];
  winner: string | null;
  metric: number;
  badge?: string;
}

/** "Warriors & Rockets" from team IDs, or "3-Team Trade" */
function teamHeading(teams: string[]): string {
  if (teams.length === 0) return 'Trade';
  if (teams.length === 2) {
    const n1 = TEAMS[teams[0]]?.name.split(' ').pop() || teams[0];
    const n2 = TEAMS[teams[1]]?.name.split(' ').pop() || teams[1];
    return `${n1} & ${n2}`;
  }
  if (teams.length >= 3) return `${teams.length}-Team Trade`;
  return (TEAMS[teams[0]]?.name.split(' ').pop() || teams[0]) + ' Trade';
}

interface PlayerCard {
  type: 'player';
  name: string;
  tradeCount: number;
  initials: string;
}

type CardData = TradeCard | PlayerCard;

interface Category {
  id: string;
  label: string;
  accentColor: string;
  metricLabel: string;
  metricExplanation: string;
  cards: CardData[];
}

interface Props {
  onSelectTrade: (trade: TradeWithDetails) => void;
  onSelectPlayer: (name: string) => void;
}

type ScoreRow = {
  trade_id: string;
  lopsidedness: number;
  winner: string;
  team_scores: Record<string, { score: number }>;
};

type ChampRow = { team_id: string; season: string };

// ── Metric Tooltip ────────────────────────────────────────────────────
// Uses position: fixed + getBoundingClientRect to escape scroll containers

function MetricTooltip({ name, explanation }: { name: string; explanation: string }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);

  const showAt = () => {
    if (!iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: Math.max(8, rect.left - 8) });
    setVisible(true);
  };

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={showAt}
        onMouseLeave={() => setVisible(false)}
        onClick={(e) => {
          e.stopPropagation();
          visible ? setVisible(false) : showAt();
        }}
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1px solid var(--border-medium)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontStyle: 'italic',
          fontFamily: 'Georgia, serif',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          flexShrink: 0,
          userSelect: 'none',
          transition: 'var(--transition-fast)',
        }}
      >
        i
      </span>

      {visible && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={() => setVisible(false)}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: 210,
            zIndex: 9999,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
            backdropFilter: 'blur(16px)',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-body)',
              marginBottom: 6,
            }}
          >
            How is {name} calculated?
          </div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-body)',
              lineHeight: 1.6,
            }}
          >
            {explanation}
          </div>
        </div>
      )}
    </>
  );
}

// ── Arrow Button ──────────────────────────────────────────────────────

function ArrowBtn({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={dir === 'left' ? 'Scroll left' : 'Scroll right'}
      style={{
        background: hovered ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
        border: `1px solid ${hovered ? 'var(--border-medium)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-sm)',
        color: hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        width: 22,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        padding: 0,
        transition: 'var(--transition-fast)',
        flexShrink: 0,
      }}
    >
      {dir === 'left' ? '←' : '→'}
    </button>
  );
}

// ── Trade Card ────────────────────────────────────────────────────────

function TradeCardItem({
  card,
  accentColor,
  metricLabel,
  metricExplanation,
  onClick,
}: {
  card: TradeCard;
  accentColor: string;
  metricLabel: string;
  metricExplanation: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const winnerColor = card.winner ? TEAMS[card.winner]?.color || accentColor : accentColor;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        width: 188,
        background: hovered ? 'var(--bg-tertiary)' : 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--border-medium)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all var(--transition-fast)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      {/* Top row: metric + badges */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        {/* Metric number + label + info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              color: winnerColor,
              letterSpacing: 0.5,
              lineHeight: 1,
            }}
          >
            {card.metric.toFixed(1)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {metricLabel}
            </span>
            <MetricTooltip name={metricLabel} explanation={metricExplanation} />
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          {card.winner && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 999,
                background: winnerColor,
                color: contrastText(winnerColor),
                fontFamily: 'var(--font-body)',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              {card.winner} ↑
            </span>
          )}
          {card.badge && (() => {
            const badgeBg = card.badge === 'TPE' ? '#4ecdc4' : '#f9c74f';
            return (
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: badgeBg,
                  color: contrastText(badgeBg),
                  fontFamily: 'var(--font-body)',
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {card.badge}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Heading: Nickname A & Nickname B */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 0.4,
          lineHeight: 1.2,
          marginBottom: card.players.length > 0 ? 3 : 10,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {card.heading}
      </div>

      {/* Player subtitle */}
      {card.players.length > 0 && (
        <div
          style={{
            fontSize: 9,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.3,
            marginBottom: 8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {card.players.length <= 2
            ? card.players.join(', ')
            : `${card.players.slice(0, 2).join(', ')} +${card.players.length - 2}`}
        </div>
      )}

      {/* Season + team pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            marginRight: 2,
          }}
        >
          {card.season}
        </span>
        {card.teams.slice(0, 3).map((tid) => {
          const bg = TEAMS[tid]?.color || '#555555';
          return (
            <span
              key={tid}
              style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 999,
                background: bg,
                color: contrastText(bg),
                fontFamily: 'var(--font-body)',
              }}
            >
              {tid}
            </span>
          );
        })}
      </div>
    </button>
  );
}

// ── Player Card ───────────────────────────────────────────────────────

const JOURNEY_EXPLANATION =
  'Total two-way trades this player appeared in across NBA history. Trade exceptions are excluded — being traded away for cash or nothing doesn\'t count as a journeyman appearance.';

function PlayerCardItem({ card, onClick }: { card: PlayerCard; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        width: 188,
        background: hovered ? 'var(--bg-tertiary)' : 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--border-medium)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all var(--transition-fast)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.3)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--accent-purple)22',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--accent-purple)',
            fontFamily: 'var(--font-display)',
            flexShrink: 0,
            letterSpacing: 0.5,
          }}
        >
          {card.initials}
        </span>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              lineHeight: 1.2,
            }}
          >
            {card.name}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 3,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {card.tradeCount} trades
            </span>
            <MetricTooltip name="Trade Count" explanation={JOURNEY_EXPLANATION} />
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--accent-purple)',
          fontFamily: 'var(--font-body)',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        View journey →
      </div>
    </button>
  );
}

// ── Category Row ──────────────────────────────────────────────────────

function CategoryRow({
  category,
  onSelectTrade,
  onSelectPlayer,
}: {
  category: Category;
  onSelectTrade: (trade: TradeWithDetails) => void;
  onSelectPlayer: (name: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 210 : -210, behavior: 'smooth' });
  };

  const handleTradeClick = async (tradeId: string) => {
    const trade = await loadTrade(tradeId);
    if (trade) onSelectTrade(staticTradeToTradeWithDetails(trade));
  };

  return (
    <div style={{ marginTop: 20 }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1.8,
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)',
            whiteSpace: 'nowrap',
          }}
        >
          {category.label}
        </span>
        <ArrowBtn dir="left" onClick={() => scroll('left')} />
        <ArrowBtn dir="right" onClick={() => scroll('right')} />
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>

      {/* Scrollable card row */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {category.cards.map((card) =>
          card.type === 'trade' ? (
            <TradeCardItem
              key={card.tradeId}
              card={card}
              accentColor={category.accentColor}
              metricLabel={category.metricLabel}
              metricExplanation={category.metricExplanation}
              onClick={() => handleTradeClick(card.tradeId)}
            />
          ) : (
            <PlayerCardItem
              key={card.name}
              card={card}
              onClick={() => onSelectPlayer(card.name)}
            />
          )
        )}
      </div>
    </div>
  );
}

// ── Metric explanations ───────────────────────────────────────────────

const FORMULA_BASE =
  'Each player\'s score = Win Shares + (VORP × 0.5) + (Playoff Win Shares × 1.5) + (Championships × 5) + accolade bonus. Accolade weights: MVP +5, DPOY +2.5, ROY +1.5, All-NBA 1st +2, 2nd +1.2, 3rd +0.7, All-Defensive +0.5, All-Star +0.3.';

const METRIC_DEFS: Record<string, { metricLabel: string; metricExplanation: string }> = {
  heist: {
    metricLabel: 'Edge Score',
    metricExplanation:
      `The margin of advantage — how much more one team received than the other. Calculated as winner\'s total minus loser\'s total. ${FORMULA_BASE}`,
  },
  'champ-dna': {
    metricLabel: 'Edge Score',
    metricExplanation:
      `Same as Heist Index: winner\'s total minus loser\'s total, filtered to trades where the winning team won a championship within 4 seasons. ${FORMULA_BASE}`,
  },
  blockbusters: {
    metricLabel: 'Deal Size',
    metricExplanation:
      `The combined value of everything that changed hands — both sides added together. Trades rank higher when both teams gave up and received significant assets. ${FORMULA_BASE}`,
  },
};

// ── Main Component ────────────────────────────────────────────────────

export default function DiscoverySection({ onSelectTrade, onSelectPlayer }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [scoresRes, champsRes, index] = await Promise.all([
          getSupabase()
            .from('trade_scores')
            .select('trade_id, lopsidedness, winner, team_scores')
            .not('winner', 'is', null)
            .order('lopsidedness', { ascending: false })
            .limit(100) as unknown as Promise<{ data: ScoreRow[] | null }>,
          getSupabase()
            .from('team_seasons')
            .select('team_id, season')
            .eq('championship', true) as unknown as Promise<{ data: ChampRow[] | null }>,
          loadSearchIndex(),
        ]);

        const scores = scoresRes.data ?? [];
        const champs = champsRes.data ?? [];
        const indexMap = new Map<string, TradeSearchIndexEntry>(index.map((e) => [e.id, e]));
        const seasonYear = (s: string) => parseInt(s.split('-')[0], 10);

        const champYears = new Map<string, Set<number>>();
        for (const c of champs) {
          if (!champYears.has(c.team_id)) champYears.set(c.team_id, new Set());
          champYears.get(c.team_id)!.add(seasonYear(c.season));
        }

        const enriched = scores
          .map((s) => {
            const entry = indexMap.get(s.trade_id);
            if (!entry) return null;
            const totalScore = Object.values(s.team_scores ?? {}).reduce(
              (sum, t) => sum + (t.score ?? 0),
              0
            );
            const tradeYear = seasonYear(entry.season);
            const winnerChamps = champYears.get(s.winner) ?? new Set<number>();
            const champWithin4 = [...winnerChamps].some(
              (y) => y >= tradeYear && y <= tradeYear + 4
            );
            return { s, entry, totalScore, champWithin4 };
          })
          .filter(
            (
              x
            ): x is {
              s: ScoreRow;
              entry: TradeSearchIndexEntry;
              totalScore: number;
              champWithin4: boolean;
            } => x !== null
          );

        // TPE detection: one side received no player value
        const tpeTradeIds = new Set<string>();
        for (const { s } of enriched) {
          const numScoredTeams = Object.keys(s.team_scores ?? {}).length;
          const teamScoreValues = Object.values(s.team_scores ?? {}).map((t) => t.score ?? 0);
          const minScore = teamScoreValues.length > 0 ? Math.min(...teamScoreValues) : 0;
          const isTPE =
            (numScoredTeams === 1 && s.lopsidedness > 5) ||
            (numScoredTeams >= 2 && minScore < 0.5);
          if (isTPE) tpeTradeIds.add(s.trade_id);
        }

        // 1. Heist Index
        const heistCards: TradeCard[] = enriched
          .filter(({ s }) => !tpeTradeIds.has(s.trade_id))
          .slice(0, 8)
          .map(({ s, entry }) => ({
            type: 'trade',
            tradeId: s.trade_id,
            heading: teamHeading(entry.teams),
            players: entry.players,
            season: entry.season,
            teams: entry.teams,
            winner: s.winner,
            metric: s.lopsidedness,
          }));

        // 2. Championship DNA
        const champCards: TradeCard[] = enriched
          .filter((e) => e.champWithin4 && !tpeTradeIds.has(e.s.trade_id))
          .sort((a, b) => b.s.lopsidedness - a.s.lopsidedness)
          .slice(0, 8)
          .map(({ s, entry }) => {
            const tradeYear = seasonYear(entry.season);
            const winnerChamps = champYears.get(s.winner) ?? new Set<number>();
            const nextChamp = [...winnerChamps].find(
              (y) => y >= tradeYear && y <= tradeYear + 4
            );
            return {
              type: 'trade' as const,
              tradeId: s.trade_id,
              heading: teamHeading(entry.teams),
              players: entry.players,
              season: entry.season,
              teams: entry.teams,
              winner: s.winner,
              metric: s.lopsidedness,
              badge: nextChamp ? `${nextChamp} Champs` : undefined,
            };
          });

        // 3. Blockbusters
        const blockCards: TradeCard[] = [...enriched]
          .filter(({ s }) => !tpeTradeIds.has(s.trade_id))
          .sort((a, b) => b.totalScore - a.totalScore)
          .slice(0, 8)
          .map(({ s, entry, totalScore }) => ({
            type: 'trade' as const,
            tradeId: s.trade_id,
            heading: teamHeading(entry.teams),
            players: entry.players,
            season: entry.season,
            teams: entry.teams,
            winner: s.winner,
            metric: totalScore,
          }));

        // 4. The Journeymen (TPE trades excluded from count)
        const NON_PLAYER_NAMES = new Set([
          'trade exception', 'cash', 'cash considerations', 'future considerations',
        ]);
        const playerCount = new Map<string, number>();
        for (const entry of index) {
          if (tpeTradeIds.has(entry.id)) continue;
          for (const p of entry.players) {
            if (NON_PLAYER_NAMES.has(p.toLowerCase())) continue;
            playerCount.set(p, (playerCount.get(p) ?? 0) + 1);
          }
        }
        const journeyCards: PlayerCard[] = [...playerCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, count]) => ({
            type: 'player' as const,
            name,
            tradeCount: count,
            initials: name
              .split(' ')
              .map((w) => w[0] ?? '')
              .join('')
              .slice(0, 2)
              .toUpperCase(),
          }));

        setCategories([
          {
            id: 'heist',
            label: 'Heist Index',
            accentColor: 'var(--accent-orange)',
            ...METRIC_DEFS['heist'],
            cards: heistCards,
          },
          {
            id: 'champ-dna',
            label: 'Championship DNA',
            accentColor: 'var(--accent-gold)',
            ...METRIC_DEFS['champ-dna'],
            cards: champCards,
          },
          {
            id: 'blockbusters',
            label: 'Blockbusters',
            accentColor: 'var(--accent-green)',
            ...METRIC_DEFS['blockbusters'],
            cards: blockCards,
          },
          {
            id: 'journeymen',
            label: 'The Journeymen',
            accentColor: 'var(--accent-purple)',
            metricLabel: 'Trade Count',
            metricExplanation: JOURNEY_EXPLANATION,
            cards: journeyCards,
          },
        ]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading || categories.length === 0) return null;

  return (
    <div style={{ marginTop: 20 }}>
      {categories.map((cat) => (
        <CategoryRow
          key={cat.id}
          category={cat}
          onSelectTrade={onSelectTrade}
          onSelectPlayer={onSelectPlayer}
        />
      ))}
    </div>
  );
}
