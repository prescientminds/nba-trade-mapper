import { nanoid } from 'nanoid';
import { getSupabase } from './supabase';
import { useGraphStore } from './graph-store';
import type { SeedInfo } from './graph-store';
import type { League } from './league';
import type { VisualSkin } from './skins';

// ── Types ────────────────────────────────────────────────────────────

export interface ShareState {
  seed: SeedInfo;
  league: League;
  expansions: string[]; // node IDs expanded after seed, in order
  skin?: VisualSkin;    // visual skin at time of share (optional for legacy compat)
}

interface SharedGraph {
  id: string;
  share_state: ShareState;
  title: string;
  subtitle: string | null;
  teams: string[];
  league: string;
  created_at: string;
  view_count: number;
}

// ── Create a share link ──────────────────────────────────────────────

export async function createShareLink(): Promise<string | null> {
  const state = useGraphStore.getState();
  const { seedInfo, selectedLeague, expandedNodes, coreNodes, nodes, visualSkin } = state;

  if (!seedInfo || nodes.length === 0) {
    console.error('Share failed: no seedInfo or empty graph', { seedInfo, nodeCount: nodes.length });
    return null;
  }

  // Collect user expansions: expanded nodes that aren't core (seed-generated)
  const expansions: string[] = [];
  expandedNodes.forEach((id) => {
    if (!coreNodes.has(id)) {
      expansions.push(id);
    }
  });

  const shareState: ShareState = {
    seed: seedInfo,
    league: selectedLeague,
    expansions,
    skin: visualSkin,
  };

  // Build OG metadata
  const { title, subtitle, teams } = buildOgMetadata(seedInfo, nodes);

  const id = nanoid(8);
  const sb = getSupabase();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.rpc as any)('create_shared_graph', {
    p_id: id,
    p_share_state: shareState,
    p_title: title,
    p_subtitle: subtitle,
    p_teams: teams,
    p_league: selectedLeague,
  });

  if (error) {
    console.error('Failed to create share link:', error);
    return null;
  }

  // Use current origin for the URL
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/s/${id}`;
}

// ── Load a shared graph ──────────────────────────────────────────────

export async function loadSharedGraph(id: string): Promise<SharedGraph | null> {
  const sb = getSupabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from('shared_graphs') as any)
    .select('*')
    .eq('id', id)
    .single() as { data: SharedGraph | null; error: unknown };

  if (error || !data) return null;

  // Fire-and-forget atomic view count increment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.rpc as any)('increment_view_count', { share_id: id }).then(() => {});

  return data;
}

// ── Build OG metadata from seed info ─────────────────────────────────

// Story-type headline picker for chain (Trade Tree) shares.
// Uses what's available on the canvas: stint nodes (player + WS + team)
// and trade nodes (dates + assets). No extra DB roundtrip.
function buildChainOgMetadata(
  nodes: { type?: string; data: Record<string, unknown> }[]
): { title: string; subtitle: string | null; teams: string[] } {
  const tradeNodes = nodes.filter((n) => n.type === 'trade');
  const stintNodes = nodes.filter((n) => n.type === 'playerStint');
  const rootTrade = (tradeNodes[0]?.data?.trade ?? null) as
    | { title?: string; date?: string;
        transaction_assets?: { asset_type: string; player_name: string | null; from_team_id: string | null }[] }
    | null;

  // Era span: from earliest trade to latest stint season end
  const tradeYears = tradeNodes
    .map((n) => {
      const d = (n.data?.trade as { date?: string } | undefined)?.date;
      return d ? parseInt(d.slice(0, 4), 10) : NaN;
    })
    .filter((y) => !isNaN(y));
  const stintYears = stintNodes.flatMap((n) => {
    const seasons = (n.data.seasons as string[] | undefined) ?? [];
    return seasons.map((s) => parseInt(s.slice(0, 4), 10) + 1).filter((y) => !isNaN(y));
  });
  const allYears = [...tradeYears, ...stintYears];
  const yearSpan = allYears.length > 0 ? Math.max(...allYears) - Math.min(...allYears) : 0;

  // Per-team total WS across stints
  const wsByTeam = new Map<string, number>();
  for (const n of stintNodes) {
    const teamId = n.data.teamId as string | undefined;
    const ws = (n.data.totalWinShares as number | null | undefined) ?? 0;
    if (teamId) wsByTeam.set(teamId, (wsByTeam.get(teamId) ?? 0) + ws);
  }
  const teamRanking = [...wsByTeam.entries()].sort((a, b) => b[1] - a[1]);
  const winnerTeamId = teamRanking[0]?.[0] ?? null;
  const winnerWs = teamRanking[0]?.[1] ?? 0;
  const totalWs = teamRanking.reduce((s, [, v]) => s + v, 0);
  const teamIds = teamRanking.map(([t]) => t);

  // Top endpoint player on the winner team
  const winnerStints = stintNodes.filter((n) => n.data.teamId === winnerTeamId);
  winnerStints.sort(
    (a, b) =>
      ((b.data.totalWinShares as number | null) ?? 0) -
      ((a.data.totalWinShares as number | null) ?? 0),
  );
  const topEndpoint = winnerStints[0]?.data.playerName as string | undefined;
  const topEndpointWs = (winnerStints[0]?.data.totalWinShares as number | null) ?? 0;

  // Seed asset: the first player_name from the root trade's assets,
  // preferring an asset that left the winner team in this trade.
  const assets = rootTrade?.transaction_assets ?? [];
  const playerAssets = assets.filter((a) => a.asset_type === 'player' && a.player_name);
  const fromWinner = playerAssets.find((a) => a.from_team_id === winnerTeamId);
  const seedPlayer =
    fromWinner?.player_name ??
    playerAssets[0]?.player_name ??
    (rootTrade?.title?.split(',')[0]?.trim() ?? 'Trade');

  const tradeCount = tradeNodes.length;
  const teamCount = teamIds.length;

  // Story-type picker
  let title: string;
  let subtitle: string | null;

  const yearsLabel = yearSpan > 0 ? `${yearSpan} years` : null;
  const tradesLabel = tradeCount > 1 ? `${tradeCount} trades` : null;
  const teamsLabel = teamCount > 1 ? `${teamCount} teams` : `${teamCount} team`;

  // Value creation: clear endpoint payoff
  if (topEndpoint && topEndpointWs >= 30 && seedPlayer && topEndpoint !== seedPlayer) {
    title = `From ${seedPlayer} to ${topEndpoint}`;
    subtitle = [yearsLabel, tradesLabel, teamsLabel].filter(Boolean).join(' · ');
  }
  // Single team's masterclass: one team captured 70%+ of value
  else if (totalWs > 0 && winnerWs / totalWs >= 0.7 && winnerTeamId && tradeCount >= 2) {
    const yearTag = tradeYears.length > 0 ? `${Math.min(...tradeYears)} ` : '';
    title = `${winnerTeamId}'s ${yearTag}trade kept paying${yearsLabel ? ` for ${yearsLabel}` : ''}`;
    subtitle = topEndpoint ? `${topEndpoint} was the payoff` : null;
  }
  // Wide ripple: many teams touched
  else if (teamCount >= 4) {
    title = seedPlayer ? `The ${seedPlayer} ripple` : 'Trade ripple';
    const playerCount = stintNodes.length;
    subtitle = [`${playerCount} players`, teamsLabel, yearsLabel].filter(Boolean).join(' · ');
  }
  // Default fallback
  else {
    title = seedPlayer ? `${seedPlayer} — Trade Tree` : 'Trade Tree';
    subtitle = [yearsLabel, tradesLabel, teamsLabel].filter(Boolean).join(' · ') || null;
  }

  return { title, subtitle: subtitle || null, teams: teamIds };
}

function buildOgMetadata(
  seed: SeedInfo,
  nodes: { type?: string; data: Record<string, unknown> }[]
): { title: string; subtitle: string | null; teams: string[] } {
  switch (seed.type) {
    case 'trade': {
      const tradeNode = nodes.find((n) => n.type === 'trade');
      const trade = tradeNode?.data?.trade as { title?: string; date?: string; transaction_teams?: { team_id: string }[] } | undefined;
      const teams = trade?.transaction_teams?.map((t) => t.team_id) ?? [];
      return {
        title: trade?.title || 'Trade',
        subtitle: trade?.date || null,
        teams,
      };
    }
    case 'chain': {
      return buildChainOgMetadata(nodes);
    }
    case 'player': {
      const stintNodes = nodes.filter((n) => n.type === 'playerStint');
      const teamIds = stintNodes
        .map((n) => n.data.teamId as string)
        .filter((v, i, a) => a.indexOf(v) === i);
      return {
        title: `${seed.playerName} — Career Journey`,
        subtitle: teamIds.length > 0 ? teamIds.join(' → ') : null,
        teams: teamIds,
      };
    }
    case 'championship': {
      return {
        title: `${seed.season} Championship`,
        subtitle: `${seed.teamId} — Road to the Title`,
        teams: [seed.teamId],
      };
    }
  }
}
