# NBA Trade Mapper — Guide & Methodology

## How to Use

### 1. Search
Type a player name, team, or trade into the search bar. The Trade Mapper starts empty — your search creates the first node on the canvas.

### 2. Expand
Click any node to expand it. Trade nodes reveal the assets exchanged on each side. Player nodes show their career journey — every team stint, connected by trade edges. Stint nodes show per-season stats, awards, and playoff results.

### 3. Follow the Chain
Click "Path" on any player inside a trade card to load their full career — every team, every trade, connected on the graph. Click "Path" on a draft pick to follow where that pick ended up.

### 4. Read the Scores
Each expanded trade shows a score bar comparing what each team got. The team with the higher total won the trade. Scores measure actual production after the trade: win shares, playoff performance, championships, and awards. Salary figures (in light type at the top of each team's haul) show how much the acquiring team ultimately paid for the assets received.

### 5. Go Deeper
Use the +/− web buttons on any trade node to expand the graph outward — follow draft picks that became players, follow players through subsequent trades, see free agency connections. The graph grows as you explore.

### 6. Discover
Click "Explore" to browse curated categories: Championship DNA, Heist Index, Value Creation, The Alchemists, Blockbusters, The Journeymen. Each surfaces a different lens on 50 years of trade history.

---

## Trade Scoring

### The Question

Who got the better end of the deal? Not predictions, not draft-night grades. We measure what each team got.

### The Formula

Every player is scored on what they produced on the acquiring team, after the trade. Pre-trade stats don't count. Stats on other teams don't count.

```
Player Score = Win Shares
             + (Playoff Win Shares × 1.5)
             + Championship Bonus (contribution-weighted)
             + Accolade Bonus
```

The team with the higher total won — but only if the margin exceeds 1.5 points. A 0.8-point edge could flip on one decent season.

### Win Shares

Dean Oliver's stat. Divides team wins among players based on their contributions. One Win Share ≈ one win. Available back to 1977.

Team-dependent: a player on a 60-win team has more wins to divide than the same player on a 30-win team. If a player gets traded to a bad team and the team keeps losing, the trade didn't produce wins. That's the point — Win Shares measure contribution to actual victories, not talent in a vacuum.

### Why Win Shares

- **PER:** Overvalues high-usage scorers. Outdated.
- **VORP:** Ignores team quality. We want team quality.
- **BPM:** Rate stat. We need cumulative production over multiple seasons.
- **EPM / RAPTOR / LEBRON / DARKO:** Proprietary, defunct, or only available from ~2014.
- **Raw box score:** Doesn't account for efficiency, defense, or winning.

### Playoff Win Shares × 1.5

Same math, playoff games, 1.5× weight. Teams that go deeper play more games and accumulate more. A trade that reaches the Finals produced more than a first-round exit.

### Championship Bonus

```
Championship Bonus = 5.0 × (Player's Playoff WS ÷ Team's Total Playoff WS)
```

Carry 35% of the postseason workload, get +1.75 per title. Ride the bench, get a fraction. This separates the player who carried the run from the player who happened to be on the roster.

### Accolade Bonus

Awards catch what the box score misses.

| Award | Bonus | Rationale |
|-------|-------|-----------|
| MVP | +5.0 | Dominance that cumulative stats understate |
| Finals MVP | +3.0 | Best player on the biggest stage |
| DPOY | +2.5 | Primary correction for defensive value |
| All-NBA 1st Team | +2.0 | Top 5 player that season |
| ROY | +1.5 | Immediate contributor — relevant for picks |
| All-NBA 2nd Team | +1.2 | Top 10 player |
| Sixth Man | +0.8 | Best reserve |
| All-NBA 3rd Team | +0.7 | Top 15 player |
| MIP | +0.5 | Breakout season |
| All-Defensive Team | +0.5 | Broader defensive correction |
| All-Star | +0.3 | Partially a popularity contest |
| All-Rookie Team | +0.2 | Minor signal |

Awards double-count great seasons. They should. A player who leads the league in Win Shares by a wide margin gets the same WS credit as one who barely leads. The award captures the gap.

---

## Salary Metrics

### Acquired Salary Value

**What it measures:** The total salary a player earned at the team that acquired them, from the trade date through their departure from that team.

**The rubric:** Sum all contracts for a traded player on the acquiring team's books, starting from the trade season through the player's last season with that team. This includes the inherited contract, any extensions, and any new deals re-signed with the same team.

**Why this scope:**

A team trades for a player making $30M/yr with two years remaining. He produces, and they extend him for $250M over five years. Total acquired salary value: ~$310M. That number reflects the team's sustained belief — expressed in guaranteed dollars — that this player was worth keeping and paying. Compare that to Kevin Martin going the other direction — $40M over two seasons, then gone. The asymmetry in committed dollars mirrors the asymmetry in value.

A high acquired salary value paired with high win shares means the trade worked on both axes: the player produced, and the team invested accordingly. A high salary with low win shares is an albatross — the team overpaid for what they got. A low salary with high win shares means the team got a bargain (think late-first-round picks on rookie deals who immediately contributed).

**Why not salary on another team:** If a player signs a max elsewhere after being traded away, that's a different team's bet on a different version of the player. It doesn't measure what the acquiring team got.

**Why not all future contracts across a career:** A 22-year-old traded as a throw-in who becomes an All-Star six teams later — the link between that trade and those paydays is too loose to attribute.

**Why not a fixed time window:** Arbitrary. A player who signs a 5-year max in year 1 and a player who plays out 4 years of a rookie deal look different under a 4-year window for no good reason. The team's own decision to keep or release the player is the natural boundary.

**Data source:** 15,370 player contracts from Basketball Reference (1984–2031). Coverage: 90.5% of trades. The 9.5% gap is structural — pre-1984 trades, picks-only trades, international stash players.

### Total Salary Traded

Shown at the top of each team's haul when a trade is expanded. The sum of acquired salary values for all players received by that team. A quick read on the financial magnitude of what changed hands.

### Under the Cap

A subtle marker (▾) appears at the top of a trade node when a team used the trade to get below the salary cap. This signals strategic intent — the trade wasn't about acquiring talent, it was about creating financial flexibility. Teams that get under the cap can absorb salary in future trades without matching, sign free agents outright, and operate with different rules than over-the-cap teams.

Computed by comparing team payroll before and after the trade against the salary cap for that season. Approximate — based on known contracts in the database.

---

## Game Score Badges

The 🔦 badge on season rows marks a player's best playoff game score (minimum 20.0) in that postseason. Click the badge to expand an inline series panel showing per-game PTS/REB/AST/GS with W/L margin for each game in the series.

**Game Score** (John Hollinger): A single-number summary of a box score.

```
GS = PTS + 0.4×FG - 0.7×FGA - 0.4×(FTA-FT) + 0.7×ORB + 0.3×DRB + STL + 0.7×AST + 0.7×BLK - 0.4×PF - TOV
```

A game score of 20+ is a strong performance. 40+ is historic.

---

## Discovery Categories

| Category | What it shows |
|----------|---------------|
| Value Creation | Trades where downstream re-trades created more value than the original deal |
| Inflection Trades | Trades where team win trajectories diverged the most — one team rose while the other fell |
| Dynasty Ingredients | How each championship was assembled — % of playoff production from trade-acquired players |
| Verdict Flips | Trades where the winner at year 1 reversed by year 5 |
| The Alchemists | Teams that turned one trade into 4+ branches of value |
| Heist Index | Most lopsided trades by score margin |
| Championship DNA | Trades where the winner won a championship within 4 seasons |
| Blockbusters | Trades where both sides scored above 15 — big talent on the move |
| The Journeymen | Players involved in the most trades |

---

## What the Scoring Doesn't Capture

**Strategic value.** A team that trades a star for expiring contracts to clear cap space scores zero for the expirings. The cap space they created has real value — the scoring system can't measure it. The under-the-cap indicator partially addresses this by flagging when a team used a trade for financial flexibility.

**Peak impact.** Eight solid years outscores two brilliant years. A rental who carries a team to a championship in one season may score lower than a steady contributor over a decade.

**Defensive impact beyond awards.** Elite defenders who didn't win DPOY or make All-Defensive teams are undervalued by this system.

---

## Edge Cases

**Recent trades** have fewer seasons to accumulate stats. Scores will increase as players continue their careers.

**Sign-and-trades** are flagged separately. The player already chose the destination — the trade is a mechanism, not a decision.

**Unresolved draft picks** score zero until the player enters the league.

**Three-team trades:** each team scored independently. Facilitators score low by design — they moved the pieces, they didn't acquire the talent.

---

## Data Sources

All from [Basketball Reference](https://www.basketball-reference.com/). Stats count only after the trade, on the acquiring team.

- **Regular season:** 23,500+ player-seasons (1977–present)
- **Playoffs:** 9,100+ player-seasons + 59,500+ game logs
- **Championships:** 49 verified champions
- **Accolades:** 2,500+ awards
- **Trades:** 1,935 (1976–present)
- **Salaries:** 15,370 contracts (1984–2031)
- **Salary cap history:** 42 seasons
