import { nanoid } from 'nanoid';
import { getSupabase } from './supabase';
import { useGraphStore } from './graph-store';
import type { SeedInfo } from './graph-store';
import type { League } from './league';

// ── Types ────────────────────────────────────────────────────────────

export interface ShareState {
  seed: SeedInfo;
  league: League;
  expansions: string[]; // node IDs expanded after seed, in order
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
  const { seedInfo, selectedLeague, expandedNodes, coreNodes, nodes } = state;

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
  };

  // Build OG metadata
  const { title, subtitle, teams } = buildOgMetadata(seedInfo, nodes);

  const id = nanoid(8);
  const sb = getSupabase();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from('shared_graphs') as any).insert({
    id,
    share_state: shareState,
    title,
    subtitle,
    teams,
    league: selectedLeague,
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

  // Fire-and-forget view count increment
  (sb.from('shared_graphs') as any)
    .update({ view_count: (data.view_count || 0) + 1 })
    .eq('id', id)
    .then(() => {});

  return data;
}

// ── Build OG metadata from seed info ─────────────────────────────────

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
      const tradeNode = nodes.find((n) => n.type === 'trade');
      const trade = tradeNode?.data?.trade as { title?: string } | undefined;
      const teamIds = nodes
        .filter((n) => n.type === 'playerStint')
        .map((n) => n.data.teamId as string)
        .filter((v, i, a) => a.indexOf(v) === i);
      return {
        title: trade?.title ? `${trade.title} — Trade Tree` : 'Trade Tree',
        subtitle: `${nodes.filter((n) => n.type === 'playerStint').length} player stints across ${teamIds.length} teams`,
        teams: teamIds,
      };
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
