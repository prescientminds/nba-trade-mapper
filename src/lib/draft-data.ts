/**
 * Client-side loader for static draft data (public/data/drafts.json).
 */

export interface DraftInfo {
  year: number;
  round: number;
  pick: number;
  teamId: string;
}

let draftCache: Record<string, DraftInfo> | null = null;

async function loadDrafts(): Promise<Record<string, DraftInfo>> {
  if (draftCache) return draftCache;
  const res = await fetch('/data/drafts.json');
  if (!res.ok) {
    console.warn('Failed to load drafts.json');
    draftCache = {};
    return draftCache;
  }
  draftCache = await res.json();
  return draftCache!;
}

/**
 * Look up draft info for a player by name.
 * Returns null if the player wasn't found in draft data.
 */
export async function getDraftInfo(playerName: string): Promise<DraftInfo | null> {
  const drafts = await loadDrafts();
  return drafts[playerName.toLowerCase()] ?? null;
}
