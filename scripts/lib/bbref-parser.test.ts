import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { applySwapNotes, parseTradeText, stripTradeNotes } from './bbref-parser';

// Real BBRef transaction HTML (issue #45 cases), copied from the day-page cache.
const CABOCLO = "<p class=\"transaction \">The <a data-attr-from=\"MEM\" href=\"/teams/MEM/2020.html\">Memphis Grizzlies</a> traded <a href=\"/players/c/cabocbr01.html\">Bruno Caboclo</a> to the <a data-attr-to=\"HOU\" href=\"/teams/HOU/2020.html\">Houston Rockets</a> for <a href=\"/players/b/belljo01.html\">Jordan Bell</a> and a 2023 2nd round draft pick. 2023 2nd-rd pick was a protected right to swap, did not convey</p>";
const HOLIDAY = "<p class=\"transaction \">In a 4-team trade, the <a data-attr-from=\"DEN\" href=\"/teams/DEN/2021.html\">Denver Nuggets</a> traded a 2023 1st round draft pick (<a href=\"/players/s/smithni01.html\">Nick Smith Jr.</a> was later selected) to the <a data-attr-to=\"OKC\" href=\"/teams/OKC/2021.html\">Oklahoma City Thunder</a>; the <a data-attr-from=\"MIL\" href=\"/teams/MIL/2021.html\">Milwaukee Bucks</a> traded <a href=\"/players/h/hamptrj01.html\">R.J. Hampton</a> to the <a data-attr-to=\"DEN\" href=\"/teams/DEN/2021.html\">Denver Nuggets</a>; the <a data-attr-from=\"MIL\" href=\"/teams/MIL/2021.html\">Milwaukee Bucks</a> traded <a href=\"/players/b/bledser01.html\">Eric Bledsoe</a>, a 2024 1st round draft pick (<a href=\"/players/m/missiyv01.html\">Yves Missi</a> was later selected), a 2025 1st round draft pick (<a href=\"/players/t/traorno01.html\">Nolan Traor\u00e9</a> was later selected), a 2026 1st round draft pick and a 2027 1st round draft pick to the <a data-attr-to=\"NOP\" href=\"/teams/NOP/2021.html\">New Orleans Pelicans</a>; the <a data-attr-from=\"MIL\" href=\"/teams/MIL/2021.html\">Milwaukee Bucks</a> traded <a href=\"/players/h/hillge01.html\">George Hill</a> to the <a data-attr-to=\"OKC\" href=\"/teams/OKC/2021.html\">Oklahoma City Thunder</a>; the <a data-attr-from=\"NOP\" href=\"/teams/NOP/2021.html\">New Orleans Pelicans</a> traded <a href=\"/players/h/holidjr01.html\">Jrue Holiday</a> and <a href=\"/players/m/merrisa01.html\">Sam Merrill</a> to the <a data-attr-to=\"MIL\" href=\"/teams/MIL/2021.html\">Milwaukee Bucks</a>; the <a data-attr-from=\"NOP\" href=\"/teams/NOP/2021.html\">New Orleans Pelicans</a> traded <a href=\"/players/c/cheatzy01.html\">Zylan Cheatham</a>, <a href=\"/players/g/grayjo01.html\">Joshia Gray</a>, <a href=\"/players/m/milleda01.html\">Darius Miller</a>, <a href=\"/players/w/willike04.html\">Kenrich Williams</a>, a 2023 2nd round draft pick (<a href=\"/players/t/tysonhu01.html\">Hunter Tyson</a> was later selected) and a 2024 2nd round draft pick (<a href=\"/players/k/kolekty01.html\">Tyler Kolek</a> was later selected) to the <a data-attr-to=\"OKC\" href=\"/teams/OKC/2021.html\">Oklahoma City Thunder</a>; and  the <a data-attr-from=\"OKC\" href=\"/teams/OKC/2021.html\">Oklahoma City Thunder</a> traded <a href=\"/players/a/adamsst01.html\">Steven Adams</a> to the <a data-attr-to=\"NOP\" href=\"/teams/NOP/2021.html\">New Orleans Pelicans</a>. New Orleans acquires right to swap 2024 1st-rd pick with Milwaukee 2025 1st-rd pick is MIL own New Orleans acquires right to swap 2026 1st-rd pick with Milwaukee 2027 1st-rd pick is MIL own 2023 top-14 protected 1st-rd pick was DEN own 2023 2nd-rd pick was WAS own 2024 2nd-rd pick is CHO own</p>";

function parse(html: string) {
  const $ = cheerio.load(html);
  const [trade] = parseTradeText($, $('p').get(0)!, 2020);
  return trade;
}

describe('BBRef trade parser — pick swaps (issue #45)', () => {
  it('marks a pick the notes call a right to swap as a swap with no player', () => {
    const t = parse(CABOCLO);
    const pick = t.assets.find((a) => a.pick_year === 2023)!;
    expect(pick.type).toBe('swap');
    expect(pick.became_player_name).toBeNull();
  });

  it('never reads note text as a player', () => {
    const t = parse(CABOCLO);
    const names = t.assets.filter((a) => a.type === 'player').map((a) => a.player_name);
    expect(names.sort()).toEqual(['Bruno Caboclo', 'Jordan Bell']);
  });

  it('handles "acquires right to swap YYYY 1st-rd pick" notes and keeps outright picks', () => {
    const t = parse(HOLIDAY);
    const nop = t.assets.filter((a) => a.from_team_id === 'MIL' && a.to_team_id === 'NOP' && a.pick_year);
    const byYear = Object.fromEntries(nop.map((a) => [a.pick_year, a]));
    expect(byYear[2024].type).toBe('swap');
    expect(byYear[2024].became_player_name).toBeNull();
    expect(byYear[2026].type).toBe('swap');
    expect(byYear[2025].type).toBe('pick');
    expect(byYear[2025].became_player_name).toBe('Nolan Traoré');
    expect(byYear[2027].type).toBe('pick');
  });

  it('keeps the last clause when notes follow it (Steven Adams)', () => {
    const t = parse(HOLIDAY);
    const adams = t.assets.find((a) => a.player_name === 'Steven Adams');
    expect(adams).toMatchObject({ from_team_id: 'OKC', to_team_id: 'NOP' });
  });
});

describe('applySwapNotes', () => {
  it('does not read the next note as the swapped pick', () => {
    const assets = [2025, 2026, 2027].map((y) => ({
      type: 'pick' as const, player_name: null, from_team_id: 'ATL', to_team_id: 'SAS',
      pick_year: y, pick_round: 1, original_team_id: null, became_player_name: 'X', notes: null,
    }));
    applySwapNotes(assets, 'traded picks. 2025 1st-rd pick is ATL own 2026 1st-rd pick is a right to swap 2027 1st-rd pick is ATL own');
    expect(assets.map((a) => a.type)).toEqual(['pick', 'swap', 'pick']);
  });
});

describe('stripTradeNotes', () => {
  it('keeps initials and suffixes inside the sentence', () => {
    const s = 'the Bucks traded R.J. Hampton and Gary Trent Jr. to the Denver Nuggets. 2025 1st-rd pick is MIL own';
    expect(stripTradeNotes(s)).toBe('the Bucks traded R.J. Hampton and Gary Trent Jr. to the Denver Nuggets');
  });
});
