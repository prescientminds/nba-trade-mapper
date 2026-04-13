import type { ChainAsset, ChainTeamData } from './graph-store';

/** Recursively walk a chain asset tree and collect all players with their chain score.
 *  Includes both 'player' and 'pick' type assets (picks that resolved to real players).
 *  When endpointsOnly is true, skip bridge players who were immediately flipped (0 direct WS). */
export function flattenChainPlayers(assets: ChainAsset[], endpointsOnly = false): { name: string; score: number }[] {
  const best = new Map<string, number>();
  function walk(list: ChainAsset[]) {
    for (const a of list) {
      if ((a.type === 'player' || a.type === 'pick') && isRealPlayerName(a.name) && a.chain > 0) {
        // Skip pure bridge players: they have an exit trade and no direct production
        const isBridge = endpointsOnly && a.exit_trade_id && a.direct <= 0;
        if (!isBridge) {
          const prev = best.get(a.name) ?? -Infinity;
          if (a.chain > prev) best.set(a.name, a.chain);
        }
      }
      if (a.children) walk(a.children);
    }
  }
  walk(assets);
  return [...best.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);
}

/** Filter out non-player names that leak into chain data (trade exceptions, pick protection clauses). */
function isRealPlayerName(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  if (lower.includes('trade exception')) return false;
  if (lower.includes('pick') && (lower.includes('if') || lower.includes('unless'))) return false;
  if (lower.includes('2nd-round') || lower.includes('2016.') || lower.includes('000')) return false;
  // Real names have at least two words and don't start with numbers/punctuation
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return false;
  if (/^[0-9(]/.test(name)) return false;
  return true;
}

// ── Resolved Outcome: what each team truly ended up with ────────────

export interface ResolvedEndpoint {
  name: string;
  score: number;
  via: string | null;  // null = direct acquisition, chain path annotation otherwise
}

/** Walk each team's chain tree and return the resolved endpoints — the players who
 *  actually produced value or are the terminal nodes of re-trade chains.
 *  Bridge players (0 direct WS, immediately flipped) are collapsed into "via" annotations. */
export function resolveTeamOutcomes(
  chainData: Record<string, ChainTeamData>,
): { teamId: string; endpoints: ResolvedEndpoint[]; chain: number }[] {
  const results: { teamId: string; endpoints: ResolvedEndpoint[]; chain: number }[] = [];

  for (const [teamId, data] of Object.entries(chainData)) {
    const best = new Map<string, ResolvedEndpoint>();

    function walk(assets: ChainAsset[], ancestors: ChainAsset[]) {
      for (const a of assets) {
        if (!isRealPlayerName(a.name) || a.chain <= 0) {
          if (a.children?.length) walk(a.children, [...ancestors, a]);
          continue;
        }

        const isBridge = !!a.exit_trade_id && a.direct <= 0;

        if (!isBridge) {
          // Build "via" from ancestor chain (last names only, cap at 2 hops)
          let via: string | null = null;
          if (ancestors.length > 0) {
            const names = ancestors
              .filter(anc => isRealPlayerName(anc.name))
              .map(anc => anc.name.split(' ').pop()!);
            if (names.length > 2) {
              via = `via ${names[0]} → … → ${names[names.length - 1]}`;
            } else if (names.length > 0) {
              via = `via ${names.join(' → ')}`;
            }
          }

          const prev = best.get(a.name);
          if (!prev || a.chain > prev.score) {
            best.set(a.name, { name: a.name, score: a.chain, via });
          }
        }

        // Always recurse — bridges feed their children, non-bridges may also have been re-traded
        if (a.children?.length) walk(a.children, [...ancestors, a]);
      }
    }

    walk(data.assets, []);
    const endpoints = [...best.values()].sort((a, b) => b.score - a.score);
    results.push({ teamId, endpoints, chain: data.chain });
  }

  return results.sort((a, b) => b.chain - a.chain);
}

/** Find the outgoing player(s) — what a team SENT away — from the other teams' asset trees. */
export function findOutgoingPlayers(
  chainScores: Record<string, { assets: ChainAsset[]; direct: number }>,
  winnerTeamId: string,
): string[] {
  const outgoing: { name: string; score: number }[] = [];
  for (const [teamId, teamData] of Object.entries(chainScores)) {
    if (teamId === winnerTeamId) continue;
    for (const a of teamData.assets) {
      if (a.name) outgoing.push({ name: a.name, score: a.direct });
    }
  }
  return outgoing.sort((a, b) => b.score - a.score).map((p) => p.name);
}
