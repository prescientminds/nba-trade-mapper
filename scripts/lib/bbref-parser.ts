/**
 * Shared BBRef trade parsing functions.
 * Extracted from scrape-bbref-trades.ts for reuse by verify-trades.ts.
 */

import * as cheerio from 'cheerio';
import { resolveTeamId, resolveFullTeamName } from './team-resolver';

// ── Interfaces ────────────────────────────────────────────────────────

export interface StaticTradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string | null;
  to_team_id: string | null;
  pick_year: number | null;
  pick_round: number | null;
  original_team_id: string | null;
  became_player_name: string | null;
  notes: string | null;
}

export interface StaticTrade {
  id: string;
  date: string;
  season: string;
  title: string;
  description: string;
  is_multi_team: boolean;
  teams: { team_id: string; role: string }[];
  assets: StaticTradeAsset[];
}

export interface SearchIndexEntry {
  id: string;
  date: string;
  season: string;
  title: string;
  teams: string[];
  players: string[];
  topAssets: string[];
}

// ── Diacritics ────────────────────────────────────────────────────────

export const DIACRITICS_MAP: Record<string, string> = {
  'Luka Doncic': 'Luka Dončić',
  'Bogdan Bogdanovic': 'Bogdan Bogdanović',
  'Bojan Bogdanovic': 'Bojan Bogdanović',
  'Dario Saric': 'Dario Šarić',
  'Goran Dragic': 'Goran Dragić',
  'Jonas Valanciunas': 'Jonas Valančiūnas',
  'Jusuf Nurkic': 'Jusuf Nurkić',
  'Nikola Vucevic': 'Nikola Vučević',
  'Nikola Jokic': 'Nikola Jokić',
  'Luka Samanic': 'Luka Šamanić',
  'Vanja Marinkovic': 'Vanja Marinković',
  'Nikola Djurisic': 'Nikola Đurišić',
  'Ante Tomic': 'Ante Tomić',
  'Tadija Dragicevic': 'Tadija Dragičević',
  'Nemanja Dangubic': 'Nemanja Dangubić',
  'Luka Mitrovic': 'Luka Mitrović',
  'Bojan Dubljevic': 'Bojan Dubljivić',
};

// Build reverse map for normalization (Unicode → ASCII)
const REVERSE_DIACRITICS: Record<string, string> = {};
for (const [ascii, unicode] of Object.entries(DIACRITICS_MAP)) {
  REVERSE_DIACRITICS[unicode.toLowerCase()] = ascii.toLowerCase();
}

export function fixDiacritics(name: string): string {
  return DIACRITICS_MAP[name] ?? name;
}

/** Normalize a player name for comparison: lowercase, strip diacritics, trim */
export function normalizeName(name: string): string {
  let n = name.toLowerCase().trim();
  if (REVERSE_DIACRITICS[n]) return REVERSE_DIACRITICS[n];
  // Also try stripping common diacritical marks via NFD decomposition
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── Link Extractors ───────────────────────────────────────────────────

export function extractTeamFromLink(href: string): string | null {
  const match = href.match(/\/teams\/([A-Z]{3})\//);
  if (match) return resolveTeamId(match[1]);
  return null;
}

export function extractPlayerFromLink(href: string, text: string): { name: string; bbrefId: string } | null {
  const match = href.match(/\/players\/\w\/(\w+)\.html/);
  if (match) return { name: text.trim(), bbrefId: match[1] };
  return null;
}

// ── Trade Parser ──────────────────────────────────────────────────────

export function parseTradeText($: cheerio.CheerioAPI, el: Parameters<typeof $>[0], year: number): StaticTrade[] {
  const $el = $(el);
  const text = $el.text().trim();

  if (!text.toLowerCase().includes('traded')) return [];

  const dateMatch = text.match(/^(\w+ \d+, \d{4})/);

  const links: { href: string; text: string; attrFrom?: string; attrTo?: string }[] = [];
  $el.find('a').each((_, a) => {
    links.push({
      href: $(a).attr('href') || '',
      text: $(a).text(),
      attrFrom: $(a).attr('data-attr-from') || undefined,
      attrTo: $(a).attr('data-attr-to') || undefined,
    });
  });

  const teamsInTrade = new Set<string>();
  const teamLinks: { team: string; position: number }[] = [];
  for (const link of links) {
    const team = extractTeamFromLink(link.href);
    if (team) {
      teamsInTrade.add(team);
      teamLinks.push({ team, position: text.indexOf(link.text) });
    }
  }

  if (teamsInTrade.size < 2) return [];

  const players: { name: string; bbrefId: string }[] = [];
  for (const link of links) {
    const player = extractPlayerFromLink(link.href, link.text);
    if (player) players.push(player);
  }

  const trades: StaticTrade[] = [];
  const assets: StaticTradeAsset[] = [];

  const segments = text.split(/;\s*/);

  for (let segment of segments) {
    segment = segment
      .replace(/^In a \d+-team trade,\s*/i, '')
      .replace(/^and\s+/i, '')
      .replace(/\.\s{2,}.*$/, '')
      .trim();

    const tradedToMatch = segment.match(
      /(?:The\s+)?(.+?)\s+traded\s+(.+?)\s+to\s+(?:the\s+)?(.+?)(?:\s+for\s+(.+))?$/i
    );

    if (tradedToMatch) {
      const [, fromTeamText, assetsGiven, toTeamText, assetsReceived] = tradedToMatch;

      const fromTeam = resolveFullTeamName(fromTeamText.replace(/^the\s+/i, '').trim());
      const toTeam = resolveFullTeamName(toTeamText.replace(/^the\s+/i, '').trim());

      if (fromTeam && toTeam) {
        parseAssetsFromText(assetsGiven, fromTeam, toTeam, assets, links, text);
        if (assetsReceived) {
          parseAssetsFromText(assetsReceived, toTeam, fromTeam, assets, links, text);
        }
      }
    }
  }

  // Fallback: simpler extraction
  if (assets.length === 0 && players.length > 0) {
    const teamArr = [...teamsInTrade];
    for (const player of players) {
      const playerPos = text.indexOf(player.name);
      let fromTeam: string | null = null;
      let toTeam: string | null = null;

      for (const tl of teamLinks) {
        if (tl.position < playerPos) fromTeam = tl.team;
        if (tl.position > playerPos && !toTeam) toTeam = tl.team;
      }

      if (text.toLowerCase().includes(`traded ${player.name.toLowerCase()} to`)) {
        const tradedIdx = text.toLowerCase().indexOf(`traded ${player.name.toLowerCase()} to`);
        for (const tl of teamLinks) {
          if (tl.position > tradedIdx + player.name.length) { toTeam = tl.team; break; }
        }
        for (const tl of [...teamLinks].reverse()) {
          if (tl.position < tradedIdx) { fromTeam = tl.team; break; }
        }
      }

      assets.push({
        type: 'player',
        player_name: player.name,
        from_team_id: fromTeam || teamArr[0] || null,
        to_team_id: toTeam || teamArr[1] || null,
        pick_year: null, pick_round: null,
        original_team_id: null, became_player_name: null, notes: null,
      });
    }

    const pickMatches = text.matchAll(/(\d{4})\s+(1st|2nd|first|second)\s+round\s+(?:draft\s+)?pick/gi);
    for (const m of pickMatches) {
      const pickYear = parseInt(m[1]);
      const pickRound = /1st|first/i.test(m[2]) ? 1 : 2;
      const afterPick = text.slice(text.indexOf(m[0]) + m[0].length);
      const becameMatch = afterPick.match(/\((.+?)\s+was\s+later\s+selected\)/i);
      assets.push({
        type: 'pick', player_name: null,
        from_team_id: null, to_team_id: null,
        pick_year: pickYear, pick_round: pickRound,
        original_team_id: null,
        became_player_name: becameMatch ? becameMatch[1].trim() : null,
        notes: null,
      });
    }
  }

  if (assets.length === 0) return [];

  const teamArr = [...teamsInTrade];
  const dateStr = dateMatch
    ? new Date(dateMatch[1]).toISOString().split('T')[0]
    : `${year}-01-01`;

  const playerNames = assets
    .filter((a) => a.type === 'player' && a.player_name)
    .map((a) => a.player_name!)
    .slice(0, 3);
  const title = playerNames.length > 0
    ? `${playerNames.join(', ')} Trade`
    : `${teamArr.join(' / ')} Trade`;

  trades.push({
    id: '', // caller sets this
    date: dateStr,
    season: '',  // caller sets this
    title,
    description: text.replace(/\s+/g, ' ').trim(),
    is_multi_team: teamsInTrade.size > 2,
    teams: teamArr.map((t) => ({ team_id: t, role: 'participant' })),
    assets,
  });

  return trades;
}

export function parseAssetsFromText(
  text: string,
  fromTeam: string,
  toTeam: string,
  assets: StaticTradeAsset[],
  links: { href: string; text: string }[],
  fullText: string
): void {
  const rawParts = text.split(/\s+and\s+/i);
  const parts: string[] = [];
  for (const rp of rawParts) {
    const subParts = rp.split(/,\s*/).filter((s) => s.trim().length > 0);
    parts.push(...subParts);
  }

  for (const part of parts) {
    const trimmed = part.trim();

    // Draft pick
    const pickMatch = trimmed.match(
      /(?:a\s+)?(\d{4})\s+(1st|2nd|first|second)\s+round\s+(?:draft\s+)?pick/i
    );
    if (pickMatch) {
      const pickYear = parseInt(pickMatch[1]);
      const pickRound = /1st|first/i.test(pickMatch[2]) ? 1 : 2;

      const becameInTrimmed = trimmed.match(/\((.+?)\s+was\s+later\s+selected\)/i);
      const afterText = becameInTrimmed
        ? ''
        : fullText.slice(fullText.indexOf(trimmed) + trimmed.length);
      const becameMatch = becameInTrimmed ?? afterText.match(/\((.+?)\s+was\s+later\s+selected\)/i);

      const origMatch = trimmed.match(/\((.+?)'s\s+pick\)/i);
      const origTeam = origMatch ? resolveFullTeamName(origMatch[1]) : null;

      assets.push({
        type: 'pick', player_name: null,
        from_team_id: fromTeam, to_team_id: toTeam,
        pick_year: pickYear, pick_round: pickRound,
        original_team_id: origTeam,
        became_player_name: becameMatch ? becameMatch[1].trim() : null,
        notes: null,
      });
      continue;
    }

    // Cash
    if (/cash/i.test(trimmed)) {
      assets.push({
        type: 'cash', player_name: null,
        from_team_id: fromTeam, to_team_id: toTeam,
        pick_year: null, pick_round: null,
        original_team_id: null, became_player_name: null,
        notes: 'Cash considerations',
      });
      continue;
    }

    // Swap rights
    if (/swap|right to swap/i.test(trimmed)) {
      const swapPickMatch = trimmed.match(/(\d{4})/);
      assets.push({
        type: 'swap', player_name: null,
        from_team_id: fromTeam, to_team_id: toTeam,
        pick_year: swapPickMatch ? parseInt(swapPickMatch[1]) : null,
        pick_round: null, original_team_id: null, became_player_name: null,
        notes: trimmed,
      });
      continue;
    }

    // Player (matched via link)
    const matchedPlayer = links.find((l) => {
      if (!l.href.includes('/players/')) return false;
      return trimmed.includes(l.text);
    });

    if (matchedPlayer) {
      assets.push({
        type: 'player',
        player_name: fixDiacritics(matchedPlayer.text.trim()),
        from_team_id: fromTeam, to_team_id: toTeam,
        pick_year: null, pick_round: null,
        original_team_id: null, became_player_name: null, notes: null,
      });
    } else if (trimmed.length > 2 && !trimmed.startsWith('a ') && !/^the\s/i.test(trimmed)) {
      assets.push({
        type: 'player',
        player_name: fixDiacritics(trimmed.replace(/^the\s+/i, '')),
        from_team_id: fromTeam, to_team_id: toTeam,
        pick_year: null, pick_round: null,
        original_team_id: null, became_player_name: null, notes: null,
      });
    }
  }
}

// ── Index Builder ─────────────────────────────────────────────────────

export function buildSearchIndexEntry(trade: StaticTrade): SearchIndexEntry {
  const players = trade.assets
    .flatMap((a) => [a.player_name, a.became_player_name])
    .filter((n): n is string => !!n)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const topAssets = trade.teams.map(({ team_id }) => {
    const asset = trade.assets.find(
      (a) => a.type === 'player' && a.player_name && a.from_team_id === team_id,
    );
    return asset?.player_name || '';
  });

  return {
    id: trade.id, date: trade.date, season: trade.season,
    title: trade.title, teams: trade.teams.map((t) => t.team_id),
    players, topAssets,
  };
}
