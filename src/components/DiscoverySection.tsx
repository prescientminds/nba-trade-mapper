'use client';

import { useState, useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';
import { TEAMS, getTeamDisplayInfo } from '@/lib/teams';
import { contrastText } from '@/lib/colors';
import { loadTrade, loadSearchIndex, staticTradeToTradeWithDetails } from '@/lib/trade-data';
import type { TradeWithDetails, TradeSearchIndexEntry } from '@/lib/supabase';
import type { ChainAsset, ChainTeamData } from '@/lib/graph-store';

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
  chainScores?: Record<string, ChainTeamData>;
  date?: string;      // ISO date for historical team name lookup
}

/** "Warriors & Rockets" from team IDs, or "3-Team Trade" */
function teamHeading(teams: string[], tradeDate?: string): string {
  if (teams.length === 0) return 'Trade';
  if (teams.length === 2) {
    const n1 = getTeamDisplayInfo(teams[0], tradeDate).name.split(' ').pop() || teams[0];
    const n2 = getTeamDisplayInfo(teams[1], tradeDate).name.split(' ').pop() || teams[1];
    return `${n1} & ${n2}`;
  }
  if (teams.length >= 3) return `${teams.length}-Team Trade`;
  return (getTeamDisplayInfo(teams[0], tradeDate).name.split(' ').pop() || teams[0]) + ' Trade';
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
  description: string;
  accentColor: string;
  metricLabel: string;
  metricExplanation: string;
  cards: CardData[];
}

interface Props {
  onSelectTrade: (trade: TradeWithDetails) => void;
  onSelectPlayer: (name: string) => void;
  onSelectChain?: (tradeId: string, chainScores?: Record<string, ChainTeamData>) => void;
}

type ScoreRow = {
  trade_id: string;
  lopsidedness: number;
  winner: string;
  team_scores: Record<string, { score: number }>;
};

type ChampRow = { team_id: string; season: string };

type ChainScoreRow = {
  trade_id: string;
  season: string;
  max_chain_score: number;
  chain_scores: Record<string, ChainTeamData>;
  league_impact: number | null;
  league_impact_players: number | null;
  league_impact_depth: number | null;
  league_impact_top: { name: string; score: number }[] | null;
};

/** Recursively walk the chain asset tree and collect all players with their chain score. */
function flattenChainPlayers(assets: ChainAsset[]): { name: string; score: number }[] {
  const best = new Map<string, number>();
  function walk(list: ChainAsset[]) {
    for (const a of list) {
      if (a.type === 'player') {
        const prev = best.get(a.name) ?? -Infinity;
        if (a.chain > prev) best.set(a.name, a.chain);
      }
      if (a.children) walk(a.children);
    }
  }
  walk(assets);
  return [...best.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);
}

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

// ── Category Info Tooltip ─────────────────────────────────────────────
// One-sentence description shown next to the category title.

function CategoryInfoTooltip({ description }: { description: string }) {
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
        onClick={(e) => { e.stopPropagation(); visible ? setVisible(false) : showAt(); }}
        style={{
          width: 13,
          height: 13,
          borderRadius: '50%',
          border: '1px solid var(--border-medium)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 8,
          fontStyle: 'italic',
          fontFamily: 'Georgia, serif',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          flexShrink: 0,
          userSelect: 'none',
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
            width: 220,
            zIndex: 9999,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '9px 12px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
            backdropFilter: 'blur(16px)',
            fontSize: 11,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.55,
            pointerEvents: 'auto',
          }}
        >
          {description}
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
  const winnerInfo = card.winner ? getTeamDisplayInfo(card.winner, card.date) : null;
  const winnerColor = winnerInfo?.color || accentColor;

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
          {card.winner && winnerInfo && (
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
              {winnerInfo.abbreviation} ↑
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
          const info = getTeamDisplayInfo(tid, card.date);
          const bg = info.color || '#555555';
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
              {info.abbreviation}
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

// ── View Toggle Button ───────────────────────────────────────────────

function ViewToggle({
  mode,
  onToggle,
}: {
  mode: 'cards' | 'list';
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={mode === 'cards' ? 'Switch to list view' : 'Switch to card view'}
      title={mode === 'cards' ? 'List view' : 'Card view'}
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
      {mode === 'cards' ? '☰' : '▦'}
    </button>
  );
}

// ── Trade List Row ───────────────────────────────────────────────────

function TradeListRow({
  card,
  rank,
  accentColor,
  metricLabel,
  onClick,
}: {
  card: TradeCard;
  rank: number;
  accentColor: string;
  metricLabel: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const winnerInfo = card.winner ? getTeamDisplayInfo(card.winner, card.date) : null;
  const winnerColor = winnerInfo?.color || accentColor;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        background: hovered ? 'var(--bg-tertiary)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--border-subtle)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background var(--transition-fast)',
      }}
    >
      {/* Rank */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          width: 20,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {rank}
      </span>

      {/* Metric score */}
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          color: winnerColor,
          width: 52,
          textAlign: 'right',
          flexShrink: 0,
          letterSpacing: 0.3,
        }}
      >
        {card.metric.toFixed(1)}
      </span>

      {/* Metric label (compact) */}
      <span
        style={{
          fontSize: 7,
          fontWeight: 600,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-body)',
          width: 36,
          flexShrink: 0,
        }}
      >
        {metricLabel.split(' ')[0]}
      </span>

      {/* Trade heading + players */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
            letterSpacing: 0.3,
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {card.heading}
        </div>
        {card.players.length > 0 && (
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-body)',
              lineHeight: 1.3,
              marginTop: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {card.players.length <= 3
              ? card.players.join(', ')
              : `${card.players.slice(0, 3).join(', ')} +${card.players.length - 3}`}
          </div>
        )}
      </div>

      {/* Season */}
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
        }}
      >
        {card.season}
      </span>

      {/* Winner badge */}
      {card.winner && winnerInfo && (
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 999,
            background: winnerColor,
            color: contrastText(winnerColor),
            fontFamily: 'var(--font-body)',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {winnerInfo.abbreviation} ↑
        </span>
      )}

      {/* Team pills */}
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {card.teams.slice(0, 3).map((tid) => {
          const info = getTeamDisplayInfo(tid, card.date);
          const bg = info.color || '#555555';
          return (
            <span
              key={tid}
              style={{
                fontSize: 8,
                padding: '1px 4px',
                borderRadius: 999,
                background: bg,
                color: contrastText(bg),
                fontFamily: 'var(--font-body)',
              }}
            >
              {info.abbreviation}
            </span>
          );
        })}
      </div>
    </button>
  );
}

// ── Player List Row ──────────────────────────────────────────────────

function PlayerListRow({
  card,
  rank,
  onClick,
}: {
  card: PlayerCard;
  rank: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        background: hovered ? 'var(--bg-tertiary)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--border-subtle)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background var(--transition-fast)',
      }}
    >
      {/* Rank */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          width: 20,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {rank}
      </span>

      {/* Trade count as metric */}
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          color: 'var(--accent-purple)',
          width: 52,
          textAlign: 'right',
          flexShrink: 0,
          letterSpacing: 0.3,
        }}
      >
        {card.tradeCount}
      </span>

      {/* Label */}
      <span
        style={{
          fontSize: 7,
          fontWeight: 600,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-body)',
          width: 36,
          flexShrink: 0,
        }}
      >
        Trades
      </span>

      {/* Player name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
            letterSpacing: 0.3,
            lineHeight: 1.2,
          }}
        >
          {card.name}
        </div>
      </div>

      {/* CTA */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--accent-purple)',
          fontFamily: 'var(--font-body)',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        View journey →
      </span>
    </button>
  );
}

// ── Category Row ──────────────────────────────────────────────────────

function CategoryRow({
  category,
  onSelectTrade,
  onSelectPlayer,
  onSelectChain,
}: {
  category: Category;
  onSelectTrade: (trade: TradeWithDetails) => void;
  onSelectPlayer: (name: string) => void;
  onSelectChain?: (tradeId: string, chainScores?: Record<string, ChainTeamData>) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [expanded, setExpanded] = useState(false);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 210 : -210, behavior: 'smooth' });
  };

  const handleTradeClick = async (card: TradeCard) => {
    if (onSelectChain) {
      onSelectChain(card.tradeId, card.chainScores);
      return;
    }
    // Fallback if onSelectChain not provided
    const trade = await loadTrade(card.tradeId);
    if (trade) onSelectTrade(staticTradeToTradeWithDetails(trade));
  };

  const listCards = expanded ? category.cards : category.cards.slice(0, 5);
  const canExpand = category.cards.length > 5;

  return (
    <div style={{ marginTop: 20 }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
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
          <CategoryInfoTooltip description={category.description} />
        </div>
        <ViewToggle
          mode={viewMode}
          onToggle={() => { setViewMode(viewMode === 'cards' ? 'list' : 'cards'); setExpanded(false); }}
        />
        {viewMode === 'cards' && (
          <>
            <ArrowBtn dir="left" onClick={() => scroll('left')} />
            <ArrowBtn dir="right" onClick={() => scroll('right')} />
          </>
        )}
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>

      {viewMode === 'cards' ? (
        /* Scrollable card row */
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
                onClick={() => handleTradeClick(card)}
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
      ) : (
        /* List view */
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          {listCards.map((card, i) =>
            card.type === 'trade' ? (
              <TradeListRow
                key={card.tradeId}
                card={card}
                rank={i + 1}
                accentColor={category.accentColor}
                metricLabel={category.metricLabel}
                onClick={() => handleTradeClick(card)}
              />
            ) : (
              <PlayerListRow
                key={card.name}
                card={card}
                rank={i + 1}
                onClick={() => onSelectPlayer(card.name)}
              />
            )
          )}

          {/* See more / See less */}
          {canExpand && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-body)',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                transition: 'color var(--transition-fast)',
              }}
              onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
            >
              {expanded ? 'See less ↑' : `See more (${category.cards.length}) ↓`}
            </button>
          )}
        </div>
      )}
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
    metricLabel: 'Floor Score',
    metricExplanation:
      `The value received by the team that got the least — the floor of the deal. Only trades where every team scored above 15 qualify. This surfaces trades where nobody gave up scraps: both sides moved real assets. ${FORMULA_BASE}`,
  },
  alchemists: {
    metricLabel: 'Assets Generated',
    metricExplanation:
      `The number of distinct downstream assets a team accumulated through multiple rounds of trading — excluding trades where one star drives more than 30% of the chain value. High breadth with no single outlier signals organizational skill, not a lucky pick.`,
  },
  'trade-tree': {
    metricLabel: 'Tree Score',
    metricExplanation:
      `Team-centric value generated through multiple rounds of trading — what one team accumulated by flipping assets. Only counts production while on that team. Requires depth ≥ 2 and chain adding 20%+ beyond direct value. Fractional attribution prevents double-counting. ${FORMULA_BASE}`,
  },
  'league-impact': {
    metricLabel: 'Impact Score',
    metricExplanation:
      `Total career value produced by ALL players set in motion by this trade cascade, regardless of which team they played for. Measures the trade's ripple across the league — not GM skill, but historical significance. ${FORMULA_BASE}`,
  },
};

// ── Main Component ────────────────────────────────────────────────────

export default function DiscoverySection({ onSelectTrade, onSelectPlayer, onSelectChain }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Load static index first — always works regardless of Supabase config
        const index = await loadSearchIndex();

        // Try Supabase — may fail if env vars aren't configured in production
        let scores: ScoreRow[] = [];
        let champs: ChampRow[] = [];
        let chainRows: ChainScoreRow[] = [];
        try {
          const [scoresRes, champsRes, chainRes, impactRes] = await Promise.all([
            getSupabase()
              .from('trade_scores')
              .select('trade_id, lopsidedness, winner, team_scores')
              .not('winner', 'is', null)
              .order('lopsidedness', { ascending: false })
              .limit(150) as unknown as Promise<{ data: ScoreRow[] | null }>,
            getSupabase()
              .from('team_seasons')
              .select('team_id, season')
              .eq('championship', true) as unknown as Promise<{ data: ChampRow[] | null }>,
            getSupabase()
              .from('trade_chain_scores')
              .select('trade_id, season, max_chain_score, chain_scores, league_impact, league_impact_players, league_impact_depth, league_impact_top')
              .gt('max_chain_score', 20)
              .order('max_chain_score', { ascending: false })
              .limit(150) as unknown as Promise<{ data: ChainScoreRow[] | null }>,
            getSupabase()
              .from('trade_chain_scores')
              .select('trade_id, season, max_chain_score, chain_scores, league_impact, league_impact_players, league_impact_depth, league_impact_top')
              .gt('league_impact', 50)
              .order('league_impact', { ascending: false })
              .limit(50) as unknown as Promise<{ data: ChainScoreRow[] | null }>,
          ]);
          scores = scoresRes.data ?? [];
          champs = champsRes.data ?? [];
          // Merge chain rows with league impact rows, deduplicate by trade_id
          const chainMap = new Map<string, ChainScoreRow>();
          for (const row of (chainRes.data ?? [])) chainMap.set(row.trade_id, row);
          for (const row of (impactRes.data ?? [])) {
            if (!chainMap.has(row.trade_id)) chainMap.set(row.trade_id, row);
          }
          chainRows = [...chainMap.values()];
        } catch (supabaseErr) {
          console.warn('[DiscoverySection] Supabase unavailable, showing static data only:', supabaseErr);
        }
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

        // 0. Asset Chains — from trade_chain_scores
        const chainCards: TradeCard[] = chainRows
          .map((row): TradeCard | null => {
            const entry = indexMap.get(row.trade_id);
            if (!entry) return null;
            // Find team with highest chain score
            const sorted = Object.entries(row.chain_scores).sort(
              (a, b) => b[1].chain - a[1].chain
            );
            if (sorted.length === 0) return null;
            const [winnerTeam, winnerData] = sorted[0];
            // Require actual chaining: depth >= 2 means assets moved at least twice,
            // and chain must exceed direct by 20%+ (movement added real value).
            // Excludes heists like Kobe/Parish where the team just held the asset forever.
            if (winnerData.depth < 2) return null;
            if (winnerData.chain <= winnerData.direct * 1.2) return null;
            const chainPlayers = flattenChainPlayers(winnerData.assets);
            const playerLabels = chainPlayers.length > 0
              ? chainPlayers.slice(0, 3).map((p) => `${p.name} (${p.score.toFixed(1)})`)
              : entry.players;
            return {
              type: 'trade',
              tradeId: row.trade_id,
              heading: teamHeading(entry.teams, entry.date),
              players: playerLabels,
              season: entry.season,
              teams: entry.teams,
              winner: winnerTeam,
              metric: winnerData.chain,
              badge: winnerData.depth >= 3 ? `${winnerData.asset_count} assets` : undefined,
              chainScores: row.chain_scores,
              date: entry.date,
            };
          })
          .filter((c): c is TradeCard => c !== null)
          .slice(0, 20);

        // 0a-b. League Impact — total career value across the league from trade cascades
        const leagueImpactCards: TradeCard[] = [...chainRows]
          .filter((row) => (row.league_impact ?? 0) > 50)
          .sort((a, b) => (b.league_impact ?? 0) - (a.league_impact ?? 0))
          .map((row): TradeCard | null => {
            const entry = indexMap.get(row.trade_id);
            if (!entry) return null;
            const topPlayers = row.league_impact_top ?? [];
            const playerLabels = topPlayers.length > 0
              ? topPlayers.slice(0, 3).map((p) => `${p.name} (${p.score.toFixed(1)})`)
              : entry.players;
            return {
              type: 'trade',
              tradeId: row.trade_id,
              heading: teamHeading(entry.teams, entry.date),
              players: playerLabels,
              season: entry.season,
              teams: entry.teams,
              winner: null,
              metric: row.league_impact ?? 0,
              badge: `${row.league_impact_players ?? 0} players`,
              chainScores: row.chain_scores,
              date: entry.date,
            };
          })
          .filter((c): c is TradeCard => c !== null)
          .slice(0, 20);

        // 0b. Alchemists — breadth over magnitude, no single asset dominating
        const alchemistCards: TradeCard[] = [...chainRows]
          .map((row): (TradeCard & { _breadth: number }) | null => {
            const entry = indexMap.get(row.trade_id);
            if (!entry) return null;
            const sorted = Object.entries(row.chain_scores).sort(
              (a, b) => b[1].asset_count - a[1].asset_count
            );
            if (sorted.length === 0) return null;
            const [winnerTeam, winnerData] = sorted[0];
            // Require genuine multi-hop chaining
            if (winnerData.depth < 2) return null;
            // Require breadth — at least 4 distinct downstream assets
            if (winnerData.asset_count < 4) return null;
            // Exclude outlier-dominated chains — no single asset > 30% of chain
            if (winnerData.max_single_asset > winnerData.chain * 0.3) return null;
            const chainPlayers = flattenChainPlayers(winnerData.assets);
            const playerNames = chainPlayers.length > 0
              ? chainPlayers.slice(0, 4).map((p) => p.name)
              : entry.players;
            return {
              type: 'trade',
              tradeId: row.trade_id,
              heading: teamHeading(entry.teams, entry.date),
              players: playerNames,
              season: entry.season,
              teams: entry.teams,
              winner: winnerTeam,
              metric: winnerData.asset_count,
              badge: `${winnerData.depth} hops`,
              chainScores: row.chain_scores,
              date: entry.date,
              _breadth: winnerData.asset_count,
            };
          })
          .filter((c): c is (TradeCard & { _breadth: number }) => c !== null)
          .sort((a, b) => b._breadth - a._breadth)
          .slice(0, 20)
          .map(({ _breadth: _, ...card }) => card);

        // 1. Heist Index
        const heistCards: TradeCard[] = enriched
          .filter(({ s }) => !tpeTradeIds.has(s.trade_id))
          .slice(0, 20)
          .map(({ s, entry }) => ({
            type: 'trade' as const,
            tradeId: s.trade_id,
            heading: teamHeading(entry.teams, entry.date),
            players: entry.players,
            season: entry.season,
            teams: entry.teams,
            winner: s.winner,
            metric: s.lopsidedness,
            date: entry.date,
          }));

        // 2. Championship DNA
        const champCards: TradeCard[] = enriched
          .filter((e) => e.champWithin4 && !tpeTradeIds.has(e.s.trade_id))
          .sort((a, b) => b.s.lopsidedness - a.s.lopsidedness)
          .slice(0, 20)
          .map(({ s, entry }) => {
            const tradeYear = seasonYear(entry.season);
            const winnerChamps = champYears.get(s.winner) ?? new Set<number>();
            const nextChamp = [...winnerChamps].find(
              (y) => y >= tradeYear && y <= tradeYear + 4
            );
            return {
              type: 'trade' as const,
              tradeId: s.trade_id,
              heading: teamHeading(entry.teams, entry.date),
              players: entry.players,
              season: entry.season,
              teams: entry.teams,
              winner: s.winner,
              metric: s.lopsidedness,
              badge: nextChamp ? `${nextChamp} Champs` : undefined,
              date: entry.date,
            };
          });

        // 3. Blockbusters — every team gave up real value (high floor, not high ceiling)
        const blockCards: TradeCard[] = [...enriched]
          .filter(({ s }) => {
            if (tpeTradeIds.has(s.trade_id)) return false;
            const teamScores = Object.values(s.team_scores ?? {}).map((t) => t.score ?? 0);
            if (teamScores.length < 2) return false;
            return Math.min(...teamScores) > 15;
          })
          .map(({ s, entry }) => {
            const teamScores = Object.values(s.team_scores ?? {}).map((t) => t.score ?? 0);
            const floorScore = Math.min(...teamScores);
            return { s, entry, floorScore };
          })
          .sort((a, b) => b.floorScore - a.floorScore)
          .slice(0, 20)
          .map(({ s, entry, floorScore }) => ({
            type: 'trade' as const,
            tradeId: s.trade_id,
            heading: teamHeading(entry.teams, entry.date),
            players: entry.players,
            season: entry.season,
            teams: entry.teams,
            winner: s.winner,
            metric: Math.round(floorScore * 10) / 10,
            badge: entry.teams.length >= 3 ? `${entry.teams.length}-Team` : undefined,
            date: entry.date,
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
          .slice(0, 20)
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

        const allCategories: Category[] = [
          {
            id: 'trade-tree',
            label: 'Trade Tree Value',
            description: 'Team-centric value from flipping assets through multiple trades — what one GM accumulated through smart asset management.',
            accentColor: 'var(--accent-teal)',
            ...METRIC_DEFS['trade-tree'],
            cards: chainCards,
          },
          {
            id: 'league-impact',
            label: 'League Impact',
            description: 'Total career value produced by all players set in motion by a trade cascade, regardless of which team they ended up on.',
            accentColor: 'var(--accent-red)',
            ...METRIC_DEFS['league-impact'],
            cards: leagueImpactCards,
          },
          {
            id: 'alchemists',
            label: 'The Alchemists',
            description: 'Trades that generated the most downstream assets with no single star accounting for more than half — organizational craft, not luck.',
            accentColor: 'var(--accent-purple)',
            ...METRIC_DEFS['alchemists'],
            cards: alchemistCards,
          },
          {
            id: 'heist',
            label: 'Heist Index',
            description: 'The most lopsided trades in NBA history, ranked by how much more one team received than the other.',
            accentColor: 'var(--accent-orange)',
            ...METRIC_DEFS['heist'],
            cards: heistCards,
          },
          {
            id: 'champ-dna',
            label: 'Championship DNA',
            description: 'Lopsided trades where the winning team won a championship within four seasons.',
            accentColor: 'var(--accent-gold)',
            ...METRIC_DEFS['champ-dna'],
            cards: champCards,
          },
          {
            id: 'blockbusters',
            label: 'Blockbusters',
            description: 'Trades where even the team that got less still received significant value — both sides moved real assets.',
            accentColor: 'var(--accent-green)',
            ...METRIC_DEFS['blockbusters'],
            cards: blockCards,
          },
          {
            id: 'journeymen',
            label: 'The Journeymen',
            description: 'Players who appeared in the most trades throughout their NBA careers.',
            accentColor: 'var(--accent-purple)',
            metricLabel: 'Trade Count',
            metricExplanation: JOURNEY_EXPLANATION,
            cards: journeyCards,
          },
        ];
        // Only show categories that have cards
        setCategories(allCategories.filter((c) => c.cards.length > 0));
      } catch (err) {
        console.error('[DiscoverySection] Failed to load:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-body)' }}>
      Loading…
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-body)' }}>
      Could not load discovery data: {error}
    </div>
  );

  if (categories.length === 0) return null;

  return (
    <div style={{ marginTop: 20 }}>
      {categories.map((cat) => (
        <CategoryRow
          key={cat.id}
          category={cat}
          onSelectTrade={onSelectTrade}
          onSelectPlayer={onSelectPlayer}
          onSelectChain={onSelectChain}
        />
      ))}
    </div>
  );
}
