'use client';

import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { TradeWithDetails } from '@/lib/supabase';
import { getAnyTeam } from '@/lib/teams';
import { contrastText } from '@/lib/colors';
import { useGraphStore } from '@/lib/graph-store';
import { useMobile } from '@/lib/use-mobile';
import DiscoverySection from '@/components/DiscoverySection';
import { useTourStore } from '@/lib/tour-store';
import { GUIDED_TOUR_STEPS, HARDEN_TRADE_ID } from '@/lib/guided-tour-steps';
import { loadTrade, staticTradeToTradeWithDetails } from '@/lib/trade-data';
import { useHints } from '@/lib/use-hints';
import { HintLabel } from '@/components/HintLabel';
import type { League } from '@/lib/league';
import Link from 'next/link';
import TeamSeasonPicker from '@/components/TeamSeasonPicker';
import { track } from '@/lib/analytics';

// Text-link shortcuts under the search bar — deliberately quiet so the
// search stays the one obvious way in.
function shortcutStyle(active: boolean): CSSProperties {
  return {
    padding: 0,
    background: 'none',
    border: 'none',
    borderBottom: `1px solid ${active ? 'var(--accent-orange)' : 'var(--border-subtle)'}`,
    color: active ? 'var(--accent-orange)' : 'var(--text-secondary)',
    font: 'inherit',
    textDecoration: 'none',
    cursor: 'pointer',
  };
}

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
  const seedFromTradeCollapsed = useGraphStore((s) => s.seedFromTradeCollapsed);
  const seedFromChain = useGraphStore((s) => s.seedFromChain);
  const seedFromPlayer = useGraphStore((s) => s.seedFromPlayer);
  const seedChampionshipRoster = useGraphStore((s) => s.seedChampionshipRoster);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const nodes = useGraphStore((s) => s.nodes);
  const selectedLeague = useGraphStore((s) => s.selectedLeague);
  const setSelectedLeague = useGraphStore((s) => s.setSelectedLeague);
  const isMobile = useMobile();
  const [rosterOpen, setRosterOpen] = useState(false);
  const hintStep = useHints((s) => s.step);
  const dismissHint = useHints((s) => s.dismiss);
  const startTour = useTourStore((s) => s.startTour);
  const tourCompleted = useTourStore((s) => s.hasCompleted)('guided');

  const startGuidedTour = useCallback(async () => {
    const st = await loadTrade(HARDEN_TRADE_ID, 'NBA');
    if (!st) return;
    const trade = staticTradeToTradeWithDetails(st);
    seedFromTradeCollapsed(trade);
    track('tutorial_started', { tour_id: 'guided' });
    setTimeout(() => {
      startTour('guided', GUIDED_TOUR_STEPS);
    }, 600);
  }, [seedFromTradeCollapsed, startTour]);

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
      track('trade_searched', {
        query_length: q.length,
        result_count: res.trades.length + res.players.length,
        trade_count: res.trades.length,
        player_count: res.players.length,
        league: selectedLeague,
      });
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
    track('seed_graph', { seed_type: 'trade', trade_id: trade.id, source: 'search' });
    seedFromTrade(trade);
  };

  const selectPlayer = (name: string) => {
    setOpen(false);
    setQuery('');
    dismissHint(1);
    dismissHint(6);
    track('seed_graph', { seed_type: 'player', player_name: name, source: 'search' });
    seedFromPlayer(name);
  };

  const selectChain = (tradeId: string, chainScores?: Record<string, unknown>) => {
    setOpen(false);
    setQuery('');
    dismissHint(1);
    dismissHint(6);
    track('seed_graph', { seed_type: 'chain', trade_id: tradeId, source: 'discovery' });
    seedFromChain(tradeId, chainScores as Parameters<typeof seedFromChain>[1]);
  };

  const selectChampionship = (teamId: string, season: string) => {
    setOpen(false);
    setQuery('');
    dismissHint(1);
    dismissHint(6);
    track('seed_graph', { seed_type: 'championship', team_id: teamId, season, source: 'discovery' });
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
      className="search-box"
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
        overflowY: 'scroll',
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
        {hintStep === 2 && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <HintLabel text="Click a node to expand it" />
          </div>
        )}
      </div>
    );
  }

  // ── Welcome screen — full-height scrollable overlay ───────────────────────
  // Body stays overflow:hidden (for the canvas), but this overlay is its own
  // scroll container, so vertical scroll works naturally.

  return (
    <div
      ref={containerRef}
      className="welcome-overlay"
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
      {/* ── Top bar: brand, league switch, and the one primary action ── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 8 : 16,
          padding: isMobile ? '12px 12px' : '14px 28px',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: isMobile ? 18 : 24,
            letterSpacing: isMobile ? 1 : 1.5,
            color: 'var(--text-primary)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {selectedLeague} TRADE MAPPER
        </h1>
        <div
          data-tour="league-toggle"
          style={{
            display: 'flex',
            padding: 2,
            borderRadius: 999,
            border: '1px solid var(--border-medium)',
          }}
        >
          {(['NBA', 'WNBA'] as const).map((league) => (
            <button
              key={league}
              onClick={() => handleLeagueSwitch(league)}
              style={{
                padding: isMobile ? '3px 10px' : '4px 14px',
                borderRadius: 999,
                border: 'none',
                background: selectedLeague === league ? 'var(--bg-tertiary)' : 'transparent',
                color: selectedLeague === league ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                letterSpacing: 1,
                transition: 'var(--transition-fast)',
              }}
            >
              {league}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {/* Build a Trade — opens the full-page builder. "View on canvas"
            there brings the finished trade back onto this graph. */}
        <Link
          href="/trade-machine"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: isMobile ? '7px 12px' : '8px 18px',
            background: 'var(--accent-orange)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'var(--font-display)',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {isMobile ? 'Trade' : 'Build a Trade'}
        </Link>
      </div>

      {/* ── Hero: the search bar, with quiet shortcuts beneath it ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: isMobile ? 36 : '11vh',
          paddingBottom: isMobile ? 36 : 64,
          paddingLeft: 16,
          paddingRight: 16,
          position: 'relative',
        }}
      >
        {/* Search bar + dropdown */}
        <div
          data-tour="search-bar"
          style={{
            width: 'min(100%, 680px)',
            position: 'relative',
          }}
        >
          {searchInput}
          {resultsDropdown}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px 12px',
            marginTop: 18,
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          <button
            onClick={() => setRosterOpen((o) => !o)}
            aria-expanded={rosterOpen}
            style={shortcutStyle(rosterOpen)}
          >
            Browse a roster {rosterOpen ? '\u25B4' : '\u25BE'}
          </button>
          {!tourCompleted && (
            <>
              {!isMobile && <span aria-hidden>&middot;</span>}
              <button onClick={startGuidedTour} style={shortcutStyle(false)}>
                Try the Harden trade
              </button>
            </>
          )}
          {!isMobile && <span aria-hidden>&middot;</span>}
          <Link href="/methodology" data-tour="methodology-link" style={shortcutStyle(false)}>
            How we score trades
          </Link>
        </div>

        {rosterOpen && (
          <div style={{ marginTop: 18 }}>
            <TeamSeasonPicker compact />
          </div>
        )}

        {hintStep === 1 && (
          <HintLabel text="Search a player or team" style={{ marginTop: 14 }} />
        )}
      </div>

      {/* ── Discovery section: scrolls in below the fold ── */}
      <div
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: isMobile ? '0 16px 120px' : '0 24px 120px',
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
