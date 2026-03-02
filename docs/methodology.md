# How We Score Trades

## The Question

**Who got the better end of the deal?**

Not predictions, not draft-night grades, not what the trade "should have been." We measure what each team got.

---

## The Formula

Every player is scored on what they produced **on the acquiring team, after the trade.** Pre-trade stats don't count. Stats on other teams don't count.

```
Player Score = Win Shares
             + (Playoff Win Shares × 1.5)
             + Championship Bonus (contribution-weighted)
             + Accolade Bonus
```

The team with the higher total won — **but only if the margin exceeds 1.5 points.** A 0.8-point edge could flip on one decent season.

---

### Win Shares

Dean Oliver's stat. Divides team wins among players based on their contributions. One Win Share ≈ one win. Available back to 1977.

Team-dependent: a player on a 60-win team has more wins to divide than the same player on a 30-win team. If a player gets traded to a bad team and the team keeps losing, the trade didn't produce wins.

### Playoff Win Shares × 1.5

Same math, playoff games, 1.5× weight. Teams that go deeper play more games and accumulate more. A trade that reaches the Finals produced more than a first-round exit.

### Championship Bonus

```
Championship Bonus = 5.0 × (Player's Playoff WS ÷ Team's Total Playoff WS)
```

Carry 35% of the postseason workload, get +1.75 per title. Ride the bench, get a fraction.

### Accolade Bonus

Awards catch what the box score misses.

| Award | Bonus | Rationale |
|-------|-------|-----------|
| MVP | +5.0 | Captures dominance that cumulative stats understate. |
| Finals MVP | +3.0 | Best player on the biggest stage. |
| DPOY | +2.5 | Primary correction for defensive value. |
| All-NBA 1st Team | +2.0 | Top 5 player that season. |
| ROY | +1.5 | Immediate contributor — relevant for picks. |
| All-NBA 2nd Team | +1.2 | Top 10 player. |
| Sixth Man | +0.8 | Best reserve. |
| All-NBA 3rd Team | +0.7 | Top 15 player. |
| MIP | +0.5 | Breakout season. |
| All-Defensive Team | +0.5 | Broader defensive correction than DPOY alone. |
| All-Star | +0.3 | Partially a popularity contest. |
| All-Rookie Team | +0.2 | Minor signal. |

Awards double-count great seasons. They should. A player who leads the league in Win Shares by a wide margin gets the same WS credit as one who barely leads. The award captures the gap.

---

## What This System Doesn't Capture

- **Strategic value.** A team that trades a star for expirings to clear cap space scores zero for the expirings.

- **Peak impact.** Eight solid years outscores two brilliant years.

- **Defensive impact beyond awards.** Elite defenders who didn't win DPOY or make All-Defensive teams are undervalued.

---

## Why Win Shares

- **PER:** Overvalues high-usage scorers. Outdated.
- **VORP:** Ignores team quality. We want team quality.
- **BPM:** Rate stat. We need cumulative production.
- **EPM / RAPTOR / LEBRON / DARKO:** Proprietary, defunct, or only from ~2014.
- **Raw box score:** Doesn't account for efficiency, defense, or winning.

---

## Data Sources

All from [Basketball Reference](https://www.basketball-reference.com/). Stats count only after the trade, on the acquiring team.

- **Regular season:** 23,500+ player-seasons (1977–present)
- **Playoffs:** 9,100+ player-seasons
- **Championships:** 49 verified champions
- **Accolades:** 2,500+ awards
- **Trades:** 1,935 (1976–present)

---

## Edge Cases

**Recent trades** have fewer seasons to accumulate.

**Sign-and-trades** are flagged separately. The player already chose the destination.

**Unresolved draft picks** score zero until the player enters the league.

**Three-team trades:** each team scored independently. Facilitators score low by design.
