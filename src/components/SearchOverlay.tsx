'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { TradeWithDetails } from '@/lib/supabase';
import { getAnyTeam } from '@/lib/teams';
import { contrastText } from '@/lib/colors';
import { useGraphStore } from '@/lib/graph-store';
import DiscoverySection from '@/components/DiscoverySection';
import { useHints } from '@/lib/use-hints';
import { HintLabel } from '@/components/HintLabel';
import type { League } from '@/lib/league';
import { SKINS, type VisualSkin } from '@/lib/skins';
import Link from 'next/link';

export default function SearchOverlay() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    trades: TradeWithDetails[];
    players: string[];
  }>({ trades: [], players: [] });
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [hasGraph, setHasGraph] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useGraphStore((s) => s.search);
  const seedFromTrade = useGraphStore((s) => s.seedFromTrade);
  const seedFromChain = useGraphStore((s) => s.seedFromChain);
  const seedFromPlayer = useGraphStore((s) => s.seedFromPlayer);
  const seedChampionshipRoster = useGraphStore((s) => s.seedChampionshipRoster);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const nodes = useGraphStore((s) => s.nodes);
  const selectedLeague = useGraphStore((s) => s.selectedLeague);
  const setSelectedLeague = useGraphStore((s) => s.setSelectedLeague);
  const visualSkin = useGraphStore((s) => s.visualSkin);
  const setVisualSkin = useGraphStore((s) => s.setVisualSkin);
  const hintStep = useHints((s) => s.step);
  const dismissHint = useHints((s) => s.dismiss);

  useEffect(() => {
    setHasGraph(nodes.length > 0);
  }, [nodes.length]);

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults({ trades: [], players: [] });
        setOpen(false);
        return;
      }
      setSearching(true);
      const res = await search(q, selectedLeague);
      setResults(res);
      setOpen(true);
      setSearching(false);
    },
    [search, selectedLeague]
  );

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const selectTrade = (trade: TradeWithDetails) => {
    setOpen(false);
    setQuery('');
    dismissHint(1);
    dismissHint(6);
    seedFromTrade(trade);
  };

  const selectPlayer = (name: string) => {
    setOpen(false);
    setQuery('');
    dismissHint(1);
    dismissHint(6);
    seedFromPlayer(name);
  };

  const selectChain = (tradeId: string, chainScores?: Record<string, unknown>) => {
    setOpen(false);
    setQuery('');
    dismissHint(1);
    dismissHint(6);
    seedFromChain(tradeId, chainScores as Parameters<typeof seedFromChain>[1]);
  };

  const selectChampionship = (teamId: string, season: string) => {
    setOpen(false);
    setQuery('');
    dismissHint(1);
    dismissHint(6);
    seedChampionshipRoster(teamId, season);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLeagueSwitch = (league: League) => {
    setSelectedLeague(league);
    setQuery('');
    setResults({ trades: [], players: [] });
    setOpen(false);
  };

  // Re-search when league changes (if query active)
  useEffect(() => {
    if (query.length >= 2) {
      doSearch(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague]);

  const hasResults = results.trades.length > 0 || results.players.length > 0;
  const showDropdown = open && (hasResults || (!searching && query.length >= 2));

  // ── Search input + dropdown (shared between both layouts) ─────────────────

  const searchInput = (
    <div
      style={{
        position: 'relative',
        background: 'var(--bg-elevated)',
        borderRadius: hasGraph ? 'var(--radius-sm)' : 'var(--radius-lg)',
        border: '1px solid var(--border-medium)',
        backdropFilter: 'blur(20px)',
        overflow: 'visible',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search players or trades..."
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: hasGraph ? '10px 12px' : '14px 12px',
            fontSize: hasGraph ? 14 : 16,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          }}
        />
        {searching && (
          <div
            style={{
              width: 16,
              height: 16,
              border: '2px solid var(--text-muted)',
              borderTopColor: 'var(--accent-orange)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        )}
        {hasGraph && (
          <button
            onClick={() => {
              clearGraph();
              setQuery('');
              setResults({ trades: [], players: [] });
              setTimeout(() => inputRef.current?.focus(), 100);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              padding: '4px 8px',
              marginLeft: 4,
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );

  const resultsDropdown = showDropdown && (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 8,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-medium)',
        borderRadius: 'var(--radius-md)',
        maxHeight: 400,
        overflowY: 'auto',
        backdropFilter: 'blur(20px)',
        boxShadow: 'var(--shadow-lg)',
        animation: 'slideDown 0.2s ease-out',
        zIndex: 20,
      }}
    >
      {/* No results */}
      {!hasResults && !searching && query.length >= 2 && (
        <div style={{ padding: '16px 20px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          No results for &ldquo;{query}&rdquo;
        </div>
      )}

      {/* Player results */}
      {results.players.length > 0 && (
        <div style={{ padding: '8px 0' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: 'var(--text-muted)',
              padding: '4px 16px 8px',
            }}
          >
            Players
          </div>
          {results.players.map((name) => (
            <button
              key={name}
              onClick={() => selectPlayer(name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text-primary)',
                fontSize: 14,
                fontFamily: 'var(--font-body)',
                transition: 'var(--transition-fast)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--accent-blue)22',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--accent-blue)',
                }}
              >
                {name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
              </span>
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Divider */}
      {results.players.length > 0 && results.trades.length > 0 && (
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 16px' }} />
      )}

      {/* Trade results */}
      {results.trades.length > 0 && (
        <div style={{ padding: '8px 0' }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: 'var(--text-muted)',
              padding: '4px 16px 8px',
            }}
          >
            Trades
          </div>
          {results.trades.map((trade) => {
            const teamIds = trade.transaction_teams.map((tt) => tt.team_id);
            return (
              <button
                key={trade.id}
                onClick={() => selectTrade(trade)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 16px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'var(--font-body)',
                  transition: 'var(--transition-fast)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {trade.title}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--accent-orange)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {trade.date
                      ? new Date(trade.date).toLocaleDateString('en-US', {
                          month: 'short',
                          year: 'numeric',
                        })
                      : ''}
                  </span>
                  {teamIds.slice(0, 4).map((tid) => {
                    const bg = getAnyTeam(tid)?.color || '#555555';
                    return (
                      <span
                        key={tid}
                        style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: bg,
                          color: contrastText(bg),
                        }}
                      >
                        {tid}
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Compact overlay for when a graph is active ────────────────────────────

  if (hasGraph) {
    return (
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          width: 'min(calc(100vw - 32px), 520px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {(['NBA', 'WNBA'] as const).map((league) => (
              <button
                key={league}
                onClick={() => handleLeagueSwitch(league)}
                style={{
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: 'none',
                  background: selectedLeague === league ? 'var(--accent-orange)' : 'var(--bg-elevated)',
                  color: selectedLeague === league ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'var(--font-display)',
                  letterSpacing: 0.5,
                  transition: 'var(--transition-fast)',
                }}
              >
                {league}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative', flex: 1 }}>
            {searchInput}
            {resultsDropdown}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
          {SKINS.map((skin) => (
            <button
              key={skin.id}
              onClick={() => setVisualSkin(skin.id)}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                border: 'none',
                background: visualSkin === skin.id
                  ? (skin.id === 'holographic'
                      ? 'linear-gradient(135deg, #ff6b35, #9b5de5)'
                      : skin.id === 'insideStuff'
                        ? 'linear-gradient(135deg, #f5a623, #e8742a)'
                        : 'var(--accent-orange)')
                  : 'var(--bg-elevated)',
                color: visualSkin === skin.id ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'var(--font-display)',
                letterSpacing: 0.5,
                transition: 'var(--transition-fast)',
              }}
            >
              {skin.shortLabel}
            </button>
          ))}
          {hintStep === 2 && (
            <HintLabel text="Click a node to expand it" style={{ marginLeft: 4 }} />
          )}
        </div>
      </div>
    );
  }

  // ── Welcome screen — full-height scrollable overlay ───────────────────────
  // Body stays overflow:hidden (for the canvas), but this overlay is its own
  // scroll container, so vertical scroll works naturally.

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 10,
        background: 'var(--bg-primary)',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--bg-tertiary) transparent',
      }}
    >
      {/* ── Hero section: search bar in upper portion, discovery visible below ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '6vh',
          paddingBottom: 56,
          paddingLeft: 24,
          paddingRight: 24,
          position: 'relative',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 52,
              letterSpacing: 2,
              color: 'var(--text-primary)',
              lineHeight: 1.1,
            }}
          >
            {selectedLeague} TRADE MAPPER
          </h1>
          <div
            style={{
              display: 'flex',
              gap: 6,
              justifyContent: 'center',
              marginTop: 16,
            }}
          >
            {(['NBA', 'WNBA'] as const).map((league) => (
              <button
                key={league}
                onClick={() => handleLeagueSwitch(league)}
                style={{
                  padding: '6px 18px',
                  borderRadius: 999,
                  border: selectedLeague === league
                    ? '2px solid var(--accent-orange)'
                    : '1px solid var(--border-medium)',
                  background: selectedLeague === league ? 'var(--accent-orange)11' : 'transparent',
                  color: selectedLeague === league ? 'var(--accent-orange)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-display)',
                  fontSize: 14,
                  fontWeight: selectedLeague === league ? 700 : 400,
                  letterSpacing: 1,
                  transition: 'var(--transition-fast)',
                }}
              >
                {league}
              </button>
            ))}
          </div>
        </div>

        {/* Search bar + dropdown */}
        <div
          style={{
            width: 'min(88vw, 680px)',
            position: 'relative',
          }}
        >
          {searchInput}
          {resultsDropdown}
        </div>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--text-tertiary)',
            marginTop: 16,
            textAlign: 'center',
          }}
        >
          Search for any player or trade to begin
        </p>
        <Link
          href="/methodology"
          style={{
            display: 'inline-block',
            marginTop: 10,
            fontSize: 12,
            color: 'var(--text-muted)',
            textDecoration: 'none',
            borderBottom: '1px solid var(--border-subtle)',
            transition: 'var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent-orange)';
            e.currentTarget.style.borderBottomColor = 'var(--accent-orange)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.borderBottomColor = 'var(--border-subtle)';
          }}
        >
          How we score trades &rarr;
        </Link>
        <div
          style={{
            display: 'flex',
            gap: 6,
            justifyContent: 'center',
            marginTop: 12,
          }}
        >
          {SKINS.map((skin) => (
            <button
              key={skin.id}
              onClick={() => setVisualSkin(skin.id)}
              style={{
                padding: '6px 18px',
                borderRadius: 999,
                border: visualSkin === skin.id
                  ? `2px solid ${skin.id === 'insideStuff' ? '#f5a623' : 'var(--accent-purple)'}`
                  : '1px solid var(--border-medium)',
                background: visualSkin === skin.id
                  ? (skin.id === 'holographic'
                      ? 'linear-gradient(135deg, rgba(255,107,53,0.1), rgba(155,93,229,0.1))'
                      : skin.id === 'insideStuff'
                        ? 'rgba(245, 166, 35, 0.1)'
                        : 'var(--accent-purple)11')
                  : 'transparent',
                color: visualSkin === skin.id
                  ? (skin.id === 'insideStuff' ? '#f5a623' : 'var(--accent-purple)')
                  : 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontSize: 14,
                fontWeight: visualSkin === skin.id ? 700 : 400,
                letterSpacing: 1,
                transition: 'var(--transition-fast)',
              }}
            >
              {skin.label}
            </button>
          ))}
        </div>

        {hintStep === 1 && (
          <HintLabel text="Search a player or team" style={{ marginTop: 12 }} />
        )}

      </div>

      {/* ── Discovery section: scrolls in below the fold ── */}
      <div
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: '0 24px 120px',
        }}
      >
        {hintStep === 6 && (
          <HintLabel text="Browse curated trades" style={{ marginBottom: 12 }} />
        )}
        <DiscoverySection league={selectedLeague} onSelectTrade={selectTrade} onSelectPlayer={selectPlayer} onSelectChain={selectChain} onSelectChampionship={selectChampionship} />
      </div>
    </div>
  );
}
