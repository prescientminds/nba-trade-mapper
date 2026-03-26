'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';
import { getAnyTeam, getAnyTeamDisplayInfo } from '@/lib/teams';
import { contrastText } from '@/lib/colors';
import { loadTrade, loadSearchIndex, staticTradeToTradeWithDetails } from '@/lib/trade-data';
import type { TradeWithDetails, TradeSearchIndexEntry } from '@/lib/supabase';
import type { ChainAsset, ChainTeamData } from '@/lib/graph-store';
import type { League } from '@/lib/league';
import VerdictFlipTimeline from '@/components/VerdictFlipTimeline';

// ── Types ─────────────────────────────────────────────────────────────

interface TradeCard {
  type: 'trade';
  tradeId: string;
  heading: string;    // "Harden for Martin"
  players: string[];  // ["Kobe Bryant", "Shaq O'Neal", ...]
  season: string;
  teams: string[];
  winner: string | null;
  metric: number;
  badge?: string;
  chainScores?: Record<string, ChainTeamData>;
  date?: string;      // ISO date for historical team name lookup
  verdictFlip?: { winner1yr: string | null; winner5yr: string | null };
}

/** Build heading from marquee players: "Gary Payton for Alton Lister", or fallback to team names.
 *  topAssets are pre-sorted by WS (highest first) via enrich-top-assets.ts. */
function tradeHeading(
  topAssets: string[] | undefined,
  teams: string[],
  tradeDate?: string,
): string {
  if (topAssets) {
    const names = topAssets.filter(Boolean);
    if (names.length >= 2) return `${names[0]} for ${names[1]}`;
    if (names.length === 1) return `${names[0]} Trade`;
  }

  // Fallback: team nicknames
  if (teams.length === 0) return 'Trade';
  if (teams.length === 2) {
    const n1 = getAnyTeamDisplayInfo(teams[0], tradeDate).name.split(' ').pop() || teams[0];
    const n2 = getAnyTeamDisplayInfo(teams[1], tradeDate).name.split(' ').pop() || teams[1];
    return `${n1} & ${n2}`;
  }
  if (teams.length >= 3) return `${teams.length}-Team Trade`;
  return (getAnyTeamDisplayInfo(teams[0], tradeDate).name.split(' ').pop() || teams[0]) + ' Trade';
}

interface PlayerCard {
  type: 'player';
  name: string;
  tradeCount: number;
  initials: string;
}

interface ChampionshipCard {
  type: 'championship';
  teamId: string;
  season: string;
  teamName: string;
  teamColor: string;
}

type CardData = TradeCard | PlayerCard | ChampionshipCard;

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
  league: League;
  onSelectTrade: (trade: TradeWithDetails) => void;
  onSelectPlayer: (name: string) => void;
  onSelectChain?: (tradeId: string, chainScores?: Record<string, ChainTeamData>) => void;
  onSelectChampionship?: (teamId: string, season: string) => void;
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
};

type VerdictFlipRow = {
  trade_id: string;
  winner: string | null;
  winner_1yr: string | null;
  winner_3yr: string | null;
  winner_5yr: string | null;
  verdict_flipped: boolean;
  lopsidedness: number;
  team_scores: Record<string, { score: number }>;
};

type DynastyRow = {
  team_id: string;
  season: string;
  trade_pct: number;
  draft_pct: number;
  fa_pct: number;
  top_trade_id: string | null;
  top_trade_pws: number;
  roster: { name: string; playoff_ws: number; acquisition: string; trade_id?: string }[];
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

// ── Side Arrow Button ─────────────────────────────────────────────────

function SideArrowBtn({ dir, onClick, visible }: { dir: 'left' | 'right'; onClick: () => void; visible: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={dir === 'left' ? 'Scroll left' : 'Scroll right'}
      style={{
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        [dir === 'left' ? 'left' : 'right']: -4,
        zIndex: 2,
        background: hovered ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
        border: `1px solid ${hovered ? 'var(--border-medium)' : 'var(--border-subtle)'}`,
        borderRadius: '50%',
        color: hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        padding: 0,
        transition: 'opacity 0.2s, background 0.15s, border-color 0.15s, color 0.15s',
        flexShrink: 0,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      {dir === 'left' ? '‹' : '›'}
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
  tourTag,
}: {
  card: TradeCard;
  accentColor: string;
  metricLabel: string;
  metricExplanation: string;
  onClick: () => void;
  tourTag?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const winnerInfo = card.winner ? getAnyTeamDisplayInfo(card.winner, card.date) : null;
  const winnerColor = winnerInfo?.color || accentColor;

  return (
    <button
      className="discovery-card"
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
        <div data-tour={tourTag} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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

      {/* Heading: Nickname A & Nickname B — or chain narrative */}
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
          ...(card.players.length === 0
            ? {
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as const,
              }
            : { whiteSpace: 'nowrap' as const }),
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
          const info = getAnyTeamDisplayInfo(tid, card.date);
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
      className="discovery-card"
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

// ── Championship Card ────────────────────────────────────────────────

function ChampionshipCardItem({ card, onClick }: { card: ChampionshipCard; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const teamColor = card.teamColor || '#9b5de5';

  return (
    <button
      className="discovery-card"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        width: 188,
        background: hovered ? 'var(--bg-tertiary)' : 'var(--bg-card)',
        border: `1px solid ${hovered ? teamColor + '66' : 'var(--border-subtle)'}`,
        borderLeft: `3px solid ${teamColor}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all var(--transition-fast)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? `0 4px 16px ${teamColor}22` : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 18 }}>{'\uD83C\uDFC6'}</span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 999,
            background: teamColor,
            color: contrastText(teamColor),
            fontFamily: 'var(--font-body)',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          {card.teamId}
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 0.3,
          lineHeight: 1.2,
        }}
      >
        {card.teamName}
      </div>
      <div
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
        }}
      >
        {card.season}
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: '#f9c74f',
          fontFamily: 'var(--font-body)',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        View roster →
      </div>
    </button>
  );
}

// ── Championship List Row ───────────────────────────────────────────

function ChampionshipListRow({ card, rank, onClick }: { card: ChampionshipCard; rank: number; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const teamColor = card.teamColor || '#9b5de5';

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
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', width: 20, textAlign: 'right', flexShrink: 0 }}>
        {rank}
      </span>
      <span style={{ fontSize: 14 }}>{'\uD83C\uDFC6'}</span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: 999,
          background: teamColor,
          color: contrastText(teamColor),
          fontFamily: 'var(--font-body)',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        {card.teamId}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', letterSpacing: 0.3, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card.teamName}
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
        {card.season}
      </span>
      <span style={{ fontSize: 9, fontWeight: 600, color: '#f9c74f', fontFamily: 'var(--font-body)', letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 0 }}>
        View →
      </span>
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
  const label = mode === 'cards' ? 'Explore' : 'Card view';
  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={mode === 'cards' ? 'Switch to list view' : 'Switch to card view'}
      style={{
        background: hovered ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
        border: `1px solid ${hovered ? 'var(--border-medium)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-full, 999px)',
        color: hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 9,
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        padding: '3px 10px',
        transition: 'var(--transition-fast)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 10, lineHeight: 1 }}>{mode === 'cards' ? '☰' : '▦'}</span>
      {label}
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
  const winnerInfo = card.winner ? getAnyTeamDisplayInfo(card.winner, card.date) : null;
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
          const info = getAnyTeamDisplayInfo(tid, card.date);
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
  league,
  onSelectTrade,
  onSelectPlayer,
  onSelectChain,
  onSelectChampionship,
  onVerdictFlipClick,
}: {
  category: Category;
  league: League;
  onSelectTrade: (trade: TradeWithDetails) => void;
  onSelectPlayer: (name: string) => void;
  onSelectChain?: (tradeId: string, chainScores?: Record<string, ChainTeamData>) => void;
  onSelectChampionship?: (teamId: string, season: string) => void;
  onVerdictFlipClick?: (card: TradeCard) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [visibleCount, setVisibleCount] = useState(10);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || viewMode !== 'cards') return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [viewMode, updateScrollState, category.cards.length]);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 210 : -210, behavior: 'smooth' });
  };

  const handleTradeClick = async (card: TradeCard) => {
    // Verdict flips open the timeline visualization
    if (card.verdictFlip && onVerdictFlipClick) {
      onVerdictFlipClick(card);
      return;
    }
    if (onSelectChain) {
      onSelectChain(card.tradeId, card.chainScores);
      return;
    }
    // Fallback if onSelectChain not provided
    const trade = await loadTrade(card.tradeId, league);
    if (trade) onSelectTrade(staticTradeToTradeWithDetails(trade));
  };

  const maxVisible = Math.min(visibleCount, 200);
  const listCards = category.cards.slice(0, maxVisible);
  const hasMore = category.cards.length > maxVisible;

  return (
    <div data-tour={`discovery-${category.id}`} style={{ marginTop: 20 }}>
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
              color: '#ffffff',
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
          onToggle={() => { setViewMode(viewMode === 'cards' ? 'list' : 'cards'); setVisibleCount(10); }}
        />
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>

      {viewMode === 'cards' ? (
        /* Scrollable card row with side arrows */
        <div style={{ position: 'relative' }}>
          <SideArrowBtn dir="left" onClick={() => scroll('left')} visible={canScrollLeft} />
          <SideArrowBtn dir="right" onClick={() => scroll('right')} visible={canScrollRight} />
          {/* Left fade */}
          {canScrollLeft && (
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 4,
              width: 32, zIndex: 1, pointerEvents: 'none',
              background: 'linear-gradient(to right, var(--bg-primary), transparent)',
            }} />
          )}
          {/* Right fade */}
          {canScrollRight && (
            <div style={{
              position: 'absolute', top: 0, right: 0, bottom: 4,
              width: 32, zIndex: 1, pointerEvents: 'none',
              background: 'linear-gradient(to left, var(--bg-primary), transparent)',
            }} />
          )}
          <div
            ref={scrollRef}
            style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              paddingBottom: 4,
              paddingLeft: 4,
              paddingRight: 4,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {category.cards.map((card, cardIdx) =>
              card.type === 'trade' ? (
                <TradeCardItem
                  key={card.tradeId}
                  card={card}
                  accentColor={category.accentColor}
                  metricLabel={category.metricLabel}
                  metricExplanation={category.metricExplanation}
                  onClick={() => handleTradeClick(card)}
                  tourTag={cardIdx === 0 ? `discovery-first-score-${category.id}` : undefined}
                />
              ) : card.type === 'championship' ? (
                <ChampionshipCardItem
                  key={`${card.teamId}-${card.season}`}
                  card={card}
                  onClick={() => onSelectChampionship?.(card.teamId, card.season)}
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
            ) : card.type === 'championship' ? (
              <ChampionshipListRow
                key={`${card.teamId}-${card.season}`}
                card={card}
                rank={i + 1}
                onClick={() => onSelectChampionship?.(card.teamId, card.season)}
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

          {/* See next 10 */}
          {hasMore && (
            <button
              onClick={() => setVisibleCount(prev => Math.min(prev + 10, 200))}
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
              See next 10 ↓
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Metric explanations ───────────────────────────────────────────────

const FORMULA_BASE =
  'Each player\'s score = Win Shares + (Playoff Win Shares × 1.5) + championship bonus (contribution-weighted) + accolade bonus. Championship bonus = 5.0 × (player playoff WS / team playoff WS). Accolade weights: MVP +5, Finals MVP +3, DPOY +2.5, ROY +1.5, All-NBA 1st +2, 2nd +1.2, 3rd +0.7, All-Defensive +0.5, All-Star +0.3.';

const METRIC_DEFS: Record<string, { metricLabel: string; metricExplanation: string }> = {
  heist: {
    metricLabel: 'WS',
    metricExplanation:
      `The margin of advantage — how much more one team received than the other. Calculated as winner\'s total minus loser\'s total. ${FORMULA_BASE}`,
  },
  'champ-dna': {
    metricLabel: 'WS',
    metricExplanation:
      `Winner\'s total minus loser\'s total, filtered to trades where the winning team won a championship within 4 seasons. ${FORMULA_BASE}`,
  },
  blockbusters: {
    metricLabel: 'WS',
    metricExplanation:
      `The value received by the team that got the least — the floor of the deal. Only trades where every team scored above 15 qualify. This surfaces trades where nobody gave up scraps: both sides moved real assets. ${FORMULA_BASE}`,
  },
  alchemists: {
    metricLabel: 'Assets',
    metricExplanation:
      `The number of distinct downstream assets a team accumulated through multiple rounds of trading — excluding trades where one star drives more than 30% of the chain value. High breadth with no single outlier signals organizational skill, not a lucky pick.`,
  },
  'trade-tree': {
    metricLabel: 'WS',
    metricExplanation:
      `Total Win Shares generated through multiple rounds of trading — what one team accumulated by flipping assets. Only counts production while on that team. Requires depth ≥ 2 and chain adding 20%+ beyond direct value. Fractional attribution prevents double-counting. ${FORMULA_BASE}`,
  },
  'dynasty-ingredients': {
    metricLabel: '% Trade-Built',
    metricExplanation:
      'Percentage of the championship playoff run (by Playoff Win Shares) produced by trade-acquired players. Drafted players and free agent signings account for the rest. Shows how each ring was assembled.',
  },
  'verdict-flips': {
    metricLabel: 'WS',
    metricExplanation:
      `Trades where the winner at year 1 is different from the winner at year 5. Scored at each horizon using the same formula, capped to seasons within the time window. ${FORMULA_BASE}`,
  },
};

// ── Main Component ────────────────────────────────────────────────────

export default function DiscoverySection({ league, onSelectTrade, onSelectPlayer, onSelectChain, onSelectChampionship }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verdictTimeline, setVerdictTimeline] = useState<{
    tradeId: string;
    winner1yr: string | null;
    winner5yr: string | null;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Load static index first — always works regardless of Supabase config
        const index = await loadSearchIndex(league);

        // Try Supabase — may fail if env vars aren't configured in production
        let scores: ScoreRow[] = [];
        let champs: ChampRow[] = [];
        let chainRows: ChainScoreRow[] = [];
        let verdictRows: VerdictFlipRow[] = [];
        let dynastyRows: DynastyRow[] = [];
        try {
          const [scoresRes, champsRes, chainRes, verdictRes, dynastyRes] = await Promise.all([
            getSupabase()
              .from('trade_scores')
              .select('trade_id, lopsidedness, winner, team_scores')
              .eq('league', league)
              .not('winner', 'is', null)
              .order('lopsidedness', { ascending: false })
              .limit(150) as unknown as Promise<{ data: ScoreRow[] | null }>,
            getSupabase()
              .from('team_seasons')
              .select('team_id, season')
              .eq('league', league)
              .eq('championship', true) as unknown as Promise<{ data: ChampRow[] | null }>,
            getSupabase()
              .from('trade_chain_scores')
              .select('trade_id, season, max_chain_score, chain_scores')
              .eq('league', league)
              .gt('max_chain_score', 20)
              .order('max_chain_score', { ascending: false })
              .limit(150) as unknown as Promise<{ data: ChainScoreRow[] | null }>,
            getSupabase()
              .from('trade_scores')
              .select('trade_id, winner, winner_1yr, winner_3yr, winner_5yr, verdict_flipped, lopsidedness, team_scores')
              .eq('league', league)
              .eq('verdict_flipped', true)
              .order('lopsidedness', { ascending: false })
              .limit(100) as unknown as Promise<{ data: VerdictFlipRow[] | null }>,
            getSupabase()
              .from('championship_ingredients')
              .select('team_id, season, trade_pct, draft_pct, fa_pct, top_trade_id, top_trade_pws, roster')
              .eq('league', league)
              .order('trade_pct', { ascending: false }) as unknown as Promise<{ data: DynastyRow[] | null }>,
          ]);
          scores = scoresRes.data ?? [];
          champs = champsRes.data ?? [];
          chainRows = chainRes.data ?? [];
          verdictRows = verdictRes.data ?? [];
          dynastyRows = dynastyRes.data ?? [];
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

            // Build narrative heading: "Turned FirstName LastName into A, B, C…"
            // The outgoing player = what the winning team SENT AWAY to start the chain
            const winnerIdx = entry.teams.indexOf(winnerTeam);
            const outgoingPlayer = winnerIdx >= 0 && entry.topAssets?.[winnerIdx]
              ? entry.topAssets[winnerIdx]
              : null;
            // All chain players sorted by WS — these are what the team got back
            const chainNames = chainPlayers.map((p) => p.name);

            let chainHeading: string;
            if (outgoingPlayer && chainNames.length > 0) {
              chainHeading = `Turned ${outgoingPlayer} into ${chainNames.join(', ')}`;
            } else if (chainNames.length > 0) {
              chainHeading = chainNames.join(', ');
            } else {
              chainHeading = tradeHeading(entry.topAssets, entry.teams, entry.date);
            }

            return {
              type: 'trade',
              tradeId: row.trade_id,
              heading: chainHeading,
              players: [],
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
          .slice(0, 200);

        // Verdict Flips — trades where the winner changed between year 1 and year 5
        const verdictCards: TradeCard[] = verdictRows
          .map((row): TradeCard | null => {
            const entry = indexMap.get(row.trade_id);
            if (!entry) return null;
            const yr1Info = row.winner_1yr ? getAnyTeamDisplayInfo(row.winner_1yr, entry.date) : null;
            const yr5Info = row.winner_5yr ? getAnyTeamDisplayInfo(row.winner_5yr, entry.date) : null;
            const yr1Name = yr1Info ? yr1Info.name.split(' ').pop() : '?';
            const yr5Name = yr5Info ? yr5Info.name.split(' ').pop() : '?';
            return {
              type: 'trade',
              tradeId: row.trade_id,
              heading: tradeHeading(entry.topAssets, entry.teams, entry.date),
              players: entry.players,
              season: entry.season,
              teams: entry.teams,
              winner: row.winner_5yr,
              metric: row.lopsidedness,
              badge: `${yr1Name} → ${yr5Name}`,
              date: entry.date,
              verdictFlip: { winner1yr: row.winner_1yr, winner5yr: row.winner_5yr },
            };
          })
          .filter((c): c is TradeCard => c !== null)
          .slice(0, 200);

        // 0c. Dynasty Ingredients — how championship rosters were assembled
        const dynastyCards: TradeCard[] = dynastyRows
          .map((row): TradeCard | null => {
            // Find the top trade in the search index
            const topTradeEntry = row.top_trade_id ? indexMap.get(row.top_trade_id) : null;
            const info = getAnyTeamDisplayInfo(row.team_id, `${row.season.split('-')[0]}-06-15`);
            const teamName = info.name;
            // Top 3 trade-acquired players by playoff WS
            const tradeAcquired = (row.roster || [])
              .filter((r: { acquisition: string }) => r.acquisition === 'trade')
              .slice(0, 3)
              .map((r: { name: string; playoff_ws: number }) => r.name);
            return {
              type: 'trade',
              tradeId: row.top_trade_id || `dynasty-${row.team_id}-${row.season}`,
              heading: `${row.season.split('-')[0]} ${teamName}`,
              players: tradeAcquired.length > 0 ? tradeAcquired : [`${row.draft_pct.toFixed(0)}% drafted`],
              season: row.season,
              teams: [row.team_id],
              winner: row.team_id,
              metric: row.trade_pct,
              badge: `${row.trade_pct.toFixed(0)}% trade-built`,
              date: topTradeEntry?.date,
            };
          })
          .filter((c): c is TradeCard => c !== null)
          .slice(0, 200);

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
              heading: tradeHeading(entry.topAssets, entry.teams, entry.date),
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
          .slice(0, 200)
          .map(({ _breadth: _, ...card }) => card);

        // 1. Heist Index
        const heistCards: TradeCard[] = enriched
          .filter(({ s }) => !tpeTradeIds.has(s.trade_id))
          .slice(0, 200)
          .map(({ s, entry }) => ({
            type: 'trade' as const,
            tradeId: s.trade_id,
            heading: tradeHeading(entry.topAssets, entry.teams, entry.date),
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
          .slice(0, 200)
          .map(({ s, entry }) => {
            const tradeYear = seasonYear(entry.season);
            const winnerChamps = champYears.get(s.winner) ?? new Set<number>();
            const nextChamp = [...winnerChamps].find(
              (y) => y >= tradeYear && y <= tradeYear + 4
            );
            return {
              type: 'trade' as const,
              tradeId: s.trade_id,
              heading: tradeHeading(entry.topAssets, entry.teams, entry.date),
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
          .slice(0, 200)
          .map(({ s, entry, floorScore }) => ({
            type: 'trade' as const,
            tradeId: s.trade_id,
            heading: tradeHeading(entry.topAssets, entry.teams, entry.date),
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
          .slice(0, 200)
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
            label: 'Value Creation',
            description: 'Player 1 becomes Player 2, Player 3, Player 4 — follow how one trade ripples into the next.',
            accentColor: 'var(--accent-teal)',
            ...METRIC_DEFS['trade-tree'],
            cards: chainCards,
          },
          {
            id: 'dynasty-ingredients',
            label: 'Dynasty Ingredients',
            description: 'How each championship was assembled — the percentage of playoff production from trade-acquired players.',
            accentColor: 'var(--accent-gold)',
            ...METRIC_DEFS['dynasty-ingredients'],
            cards: dynastyCards,
          },
          {
            id: 'verdict-flips',
            label: 'Verdict Flips',
            description: 'Trades where the consensus winner reversed — one team looked smart at first, but the other won by year five.',
            accentColor: 'var(--accent-green)',
            ...METRIC_DEFS['verdict-flips'],
            cards: verdictCards,
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
            label: league === 'WNBA' ? 'The Journeywomen' : 'The Journeymen',
            description: `Players who appeared in the most trades throughout their ${league} careers.`,
            accentColor: 'var(--accent-purple)',
            metricLabel: 'Trade Count',
            metricExplanation: JOURNEY_EXPLANATION,
            cards: journeyCards,
          },
        ];

        // Build championship roster cards (most recent first)
        const rosterCards: ChampionshipCard[] = [...champs]
          .sort((a, b) => b.season.localeCompare(a.season))
          .map((c) => {
            const info = getAnyTeamDisplayInfo(c.team_id, `${c.season.split('-')[0]}-06-15`);
            return {
              type: 'championship' as const,
              teamId: c.team_id,
              season: c.season,
              teamName: info.name,
              teamColor: info.color || '#9b5de5',
            };
          });

        if (rosterCards.length > 0) {
          allCategories.push({
            id: 'championship-road',
            label: 'Road to a Championship',
            description: 'Select a championship team to trace how every player on the roster arrived — from draft to title.',
            accentColor: '#f9c74f',
            metricLabel: 'Season',
            metricExplanation: 'The championship season. Click to see the full roster sorted by playoff impact, then expand each player to trace their path to the title.',
            cards: rosterCards,
          });
        }

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
  }, [league]);

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
      <h2 data-tour="discovery-heading" style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 2.4,
        textTransform: 'uppercase',
        color: '#ffffff',
        fontFamily: 'var(--font-body)',
        textAlign: 'center',
        marginBottom: 8,
      }}>
        Explore
      </h2>
      {categories.map((cat) => (
        <CategoryRow
          key={cat.id}
          category={cat}
          league={league}
          onSelectTrade={onSelectTrade}
          onSelectPlayer={onSelectPlayer}
          onSelectChain={onSelectChain}
          onSelectChampionship={onSelectChampionship}
          onVerdictFlipClick={(card) => {
            if (card.verdictFlip) {
              setVerdictTimeline({
                tradeId: card.tradeId,
                winner1yr: card.verdictFlip.winner1yr,
                winner5yr: card.verdictFlip.winner5yr,
              });
            }
          }}
        />
      ))}

      {verdictTimeline && (
        <VerdictFlipTimeline
          tradeId={verdictTimeline.tradeId}
          league={league}
          winner1yr={verdictTimeline.winner1yr}
          winner5yr={verdictTimeline.winner5yr}
          onClose={() => setVerdictTimeline(null)}
        />
      )}

      <div style={{ textAlign: 'center', marginTop: 32, paddingBottom: 8 }}>
        <a
          href="/team"
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            opacity: 0.4,
            textDecoration: 'none',
            fontFamily: 'var(--font-body)',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Our Team
        </a>
      </div>
    </div>
  );
}
