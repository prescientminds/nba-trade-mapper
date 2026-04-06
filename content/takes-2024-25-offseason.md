# Best and Worst Moves of the 2024-25 Offseason

> 10-slide carousel format. Each slide: rank, player photo, headline, data callout, 2-sentence take.
> Data: CATV scoring (Win Shares + playoff WS × 1.5 + championship bonus + accolades) through Mar 2025.

---

## BEST MOVES

### 1. Cleveland extends Allen, Mobley, and Mitchell — all three deliver

**Data:** Allen 17.5 WS ($20M/yr), Mobley 13.3 WS, Mitchell 14.1 WS ($35.4M). Team +16 wins.

Cleveland locked in three max-level players within the same offseason and all three cleared double-digit Win Shares inside two years. The combined 44.9 WS at a combined cap hit still below luxury-tax territory is the single best offseason of extensions in the CATV dataset.

---

### 2. Zubac extension — 15.7 WS for $11.7M

**Data:** 1.5 CATV per $M spent — best ratio of any extension since 2024.

The Clippers lost Kawhi Leonard and Paul George and still got the most efficient contract in the league from the guy everybody forgot about. Zubac produced more Win Shares than Paul George, OG Anunoby, or Pascal Siakam at a fraction of the cost.

---

### 3. Hartenstein to OKC — +11 wins, 10.8 WS

**Data:** $30M signing. OKC went from 57 to 68 wins.

OKC's roster had one structural hole: a starting center who could rebound, screen, and defend in the playoffs. Hartenstein filled it, and the Thunder went from best record in the West to best record in the league.

---

### 4. Cade Cunningham extension — Detroit +30 wins

**Data:** 12.9 WS. Detroit went from 14 wins to 44.

A team that won 14 games gave a max extension to a player who hadn't proven he could lead a winning team. Two seasons later he's produced 12.9 WS and Detroit had the second-biggest win jump in the dataset. The $/WS will look expensive ($20.9M/WS) across the life of the contract — but the trajectory matters more than the snapshot.

---

### 5. Jalen Brunson extension — 14.8 WS on a below-market deal

**Data:** CATV 19.8, second-highest non-trade CATV since 2024.

Brunson's extension was below what the market would have dictated, and he responded with 14.8 WS across two seasons while running the league's most efficient offense. The Knicks paid for a starter and got an MVP candidate.

---

## WORST MOVES

### 6. Patrick Williams, $72M for 0.6 WS

**Data:** $120M per Win Share — worst ratio of any contract over $20M since 2024.

Chicago committed $72M to a forward who has produced 0.6 Win Shares in two full seasons. For context: Ivica Zubac produced 26x more Win Shares on a smaller deal. This is the single worst $/WS contract in the dataset for moves above $20M.

---

### 7. Paul George, $211.6M for 2.7 WS

**Data:** $78.4M/WS. PHI's total investment in George + Embiid extensions: $455M for 7.6 combined WS.

Philadelphia bet $211.6M that Paul George at 34 would be the championship piece alongside Joel Embiid. George has produced 2.7 WS across two seasons — less than Neemias Queta, a bench center on a minimum deal in Boston. The move wasn't just expensive; it foreclosed every other roster path.

---

### 8. Joel Embiid extension, $243.5M for 4.9 WS

**Data:** $49.7M/WS. Has played 42 of a possible 164 regular season games.

The 76ers committed a quarter-billion dollars to a player who has been available for 26% of regular-season games since signing. The CATV doesn't capture opportunity cost — what Philly couldn't build while the cap was locked.

---

### 9. Lauri Markkanen extension, $238M for 5.9 WS in Utah

**Data:** $40.3M/WS on a 34-win team.

Markkanen has been fine — 5.9 WS is a solid starter. The problem is that Utah committed $238M to a player on a team with no playoff path, no second star, and no clear timeline. This is the textbook "Moderate" archetype from CATV analysis: no thesis, 39% historical win rate.

---

### 10. The 76ers' combined catastrophe: $455M, 7.6 WS

**Data:** George 2.7 WS + Embiid 4.9 WS. The rest of the 76ers' non-trade additions combined for less CATV than Cleveland's Jarrett Allen alone.

Philadelphia committed more guaranteed money to two players than any team in the offseason and got fewer combined Win Shares than a single Jarrett Allen extension. The George signing and Embiid extension aren't independent failures — they're the same bet placed twice. Win-now requires winning now.

---

## DATA NOTES

- All Win Shares reflect Kaggle BBRef data through ~Mar 1, 2026 (dataset v54)
- "Since 2024" = 2024-25 and 2025-26 seasons (2 full seasons for 2024 offseason moves, 1 for 2025)
- CATV = Win Shares + playoff WS × 1.5 + championship bonus + accolade bonus
- $/WS = total salary on the contract / total Win Shares produced (lower = better)
- Extensions show total contract value, not annual — Cade Cunningham's $269M is a 5-year deal
- Young max extensions (Wagner, Barnes, Mobley) have large total$ but only 1-2 years of data — too early to call "worst" even if $/WS looks high; their trajectory determines whether they'll be Gold Mines or Traps

## QUERY COMMANDS

```bash
# Reproduce these results
npx tsx scripts/query-moves.ts --best-moves --since 2024 --limit 15
npx tsx scripts/query-moves.ts --worst-contracts --since 2024 --limit 15
npx tsx scripts/query-moves.ts --steals --since 2024 --limit 10
npx tsx scripts/query-moves.ts --biggest-wins --since 2024 --limit 10
```
