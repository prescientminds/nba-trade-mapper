# The .500 Line: How We Fixed the Formula

**By Rachel Xu** | Methodology

---

There was a number I couldn't stop looking at.

Zach LaVine: 31.1 CATV.

Thirty-one points of trade value, almost all of it regular-season Win Shares, accumulated across eight seasons on a Bulls team that made the playoffs once. The formula said Chicago won the Jimmy Butler trade convincingly — 46.8 to 11.7, with LaVine as the centerpiece return. Meanwhile, Butler went to Philadelphia and Miami, made multiple conference finals, reached the NBA Finals twice, and became one of the best playoff performers of his generation.

The Bulls got a player on a max contract they couldn't move, on a team that couldn't win, and the formula called it a heist.

Win Shares is a counting stat. Play enough minutes on any team, and you accumulate them. LaVine put up 7.1 WS in 2022-23 on a 40-42 Bulls team that missed the playoffs. The number is real — he produced basketball value on a per-possession basis. But the team won 40 games. Nothing happened in April. The formula treated that 7.1 the same as 7.1 WS on a 60-win contender pushing through three playoff rounds. That's wrong.

## The first fix, and why it failed

The obvious solution: discount Win Shares on non-playoff teams. If your team misses the playoffs, multiply your WS by the team's winning percentage. A 40-42 team (.488) gives you 48.8% credit. A playoff team gives you full credit.

We ran the simulation across all 1,931 trades in the database. LaVine dropped from 31.1 to 18.1. The Bulls' side of the Butler trade went from 46.8 to 23.5.

Then we looked at Kevin Love.

Love on the 2009-10 Timberwolves: 26 points, 13 rebounds per game, All-NBA caliber production, and 4.6 Win Shares on a team that went 15-67. Under the playoff-gate formula, that .183 winning percentage crushed his 4.6 WS to 0.8. His full Timberwolves tenure — 51.0 CATV in the original formula — collapsed to 19.5. The formula said Kevin Love's production on those Wolves teams was nearly worthless.

It wasn't worthless. Love was the only reason those teams won 15 games instead of 5. His production was real. The team around him wasn't.

The deeper problem was structural: the formula created a 2.4x cliff at the playoff line. A team at .415 that missed the playoffs got 41.5% credit. A team at .512 that squeaked into the 8th seed got 100%. That's not a rule of basketball — it's an artifact of a binary gate applied to a continuous distribution. The playoff cutoff moves every year, varies by conference, and since 2020 includes a play-in tournament that our database can't even distinguish from missing the playoffs entirely.

Human interventions in formulas create their own hazards. A binary playoff gate introduces a cliff. Adding a floor to soften the cliff introduces an arbitrary threshold. Adding buckets to smooth the threshold introduces more arbitrary thresholds. Every patch adds a knob someone had to tune. A good formula doesn't have knobs.

## The .500 line

The fix is one line of math:

**multiplier = min(1.0, win_pct x 2)**

Teams at .500 or above get full credit for their Win Shares. Teams below .500 get linearly less. No playoff lookup. No binary gate. No cliff. A .490 team gets 98% credit. A .400 team gets 80%. A .250 team gets 50%.

The .500 line is the right threshold because it represents the point where a team is contributing to winning at a neutral rate. Below .500, you are losing more games than you're winning, and the production that happens on your roster — while real — translates to less actual team success per unit. Above .500, you are a winning team. Whether you're the 8-seed at .512 or the 1-seed at .780, your players' production is fully converting to wins.

This is what the first version of CATV was missing. Win Shares measures individual production; it doesn't measure whether that production happened in a context where it mattered. The .500 multiplier bridges that gap without introducing discontinuities or requiring any external data beyond the team's record.

## What changed

We ran the new formula against every trade in the database and compared it to both the original scoring and the playoff-gate alternative.

| Metric | Original | Playoff Gate | .500 Line (v2.0) |
|--------|----------|-------------|-------------------|
| Winner flips | — | 17 | 5 |
| New draws | — | 187 | 73 |
| Mean score delta | — | -2.95 | -1.22 |
| Lowest multiplier | 1.0 | .106 | .366 |
| Edge cases passed | — | 3 of 5 | 5 of 5 |

Five representative trades:

**LaVine/Butler (2016-17):** Chicago drops from 46.8 to 37.9. LaVine: 31.1 to 27.3. The discount is proportional — his 22-60 seasons (.537 multiplier) take the biggest hit while his one playoff season keeps full credit. Chicago still "wins" the trade in CATV terms, but the margin shrinks from 35.1 to 26.4. Closer to reality.

**Harden to Houston (2012-13):** Virtually unchanged. Houston made the playoffs eight of Harden's nine seasons. Lopsidedness holds at 85.6. This is the "must not break" control — the most obviously lopsided trade in the database stays obviously lopsided.

**KG to Boston (2007-08):** The gap actually widens — from 42.3 to 56.2. KG's Boston years were all playoff years; full credit. Minnesota's return (Al Jefferson, Ryan Gomes, picks) played on historically terrible Wolves teams. The formula correctly identifies that the players Minnesota got back didn't produce in a winning context. Boston got a championship. Minnesota got stats.

**Kevin Love (MIN, 2007-08 draft):** Under the playoff gate, Love dropped from 51.0 to 19.5. Under the .500 line, he drops to 35.7. His 15-67 season gets a .366 multiplier instead of .183. Still discounted — a 15-win team should be discounted — but not to nothing.

**Kobe Bryant draft-day trade (1996-97):** 263.2 to 262.1. A rounding error on an all-time robbery. Sixteen playoff seasons at full credit. Only his final three tanking years see any discount.

## What the formula is and isn't

CATV measures **value actually delivered to a team after a trade**. It is not a player evaluation metric — it doesn't tell you whether Zach LaVine is good at basketball. He is. It tells you whether the basketball he played translated into the kind of value that justifies what a team gave up to get him.

The .500 multiplier doesn't penalize good players on bad teams for being good. It discounts their production proportionally to how little that production translated to winning. There's a difference. Kevin Love putting up 26 and 13 on a 15-win team is impressive and also worth less, in trade terms, than the same stat line on a 50-win team — because one context produced a first-round exit and the other produced a lottery pick.

Every trade grade on the site now uses this formula.

The change affects 71.1% of scored trades. Five trades changed winners. The median score shift is -0.50 points — most trades barely moved. But the trades that moved the most are the ones where the original formula was most wrong: players accumulating Win Shares on losing teams, getting credit for volume that never became winning.

The formula that powered CATV 1.0 was right about what to count — Win Shares, playoff performance, championships, accolades. It was wrong about treating all regular-season production equally. Version 2.0 fixes that with one multiplier, no knobs, and a principle anyone can understand: if your team is winning, your production counts in full. If your team is losing, it counts for less.
