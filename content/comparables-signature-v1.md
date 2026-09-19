# Trade Machine Comparables Signature — v1 Design

Three worked examples to derive what a "comparable trade" actually means, before committing to an algorithm. The goal is to find the features that do real work in matching, and avoid a naive rate-stat Euclidean distance that produces superficially-similar-but-actually-unrelated pairs.

---

## Example 1 — Kawhi Leonard → Toronto (July 2018)

**SAS sent:** Kawhi Leonard (age 27, 2017-18 BPM not meaningful — 9 GP injury; 2016-17 BPM +8.0, +11.6 WS), Danny Green (age 31, role wing, +1.2 BPM)
**TOR sent:** DeMar DeRozan (age 29, +2.6 BPM, 4x All-Star, 3 yrs left $83M), Jakob Poeltl (age 22, -2.5 BPM, rookie-scale young big), 2019 1st (top-20 protected)
**Context:** Kawhi had formally requested a trade out of SAS. One year left on his deal. TOR was a 59-win team with a perceived ceiling problem; acquiring Kawhi was a "push for a ring before he walks" move.
**Outcome:** TOR won 2019 title, Kawhi left for LAC. SAS got one good DeRozan season + Poeltl + the pick (Keldon Johnson). CATV verdict: TOR dominant winner.

**What made this trade what it was:**
- Disgruntled top-5 player on expiring-plus-one-year contract
- Contender trading long-term franchise face (DeRozan) to buy short-term ceiling
- Age gap modest (27 vs 29) — not a youth-for-vet swap
- Pick included but secondary; player-heavy package
- Motivation flag: **superstar-requesting-out**

**What would feel like a comparable trade:**
- Anthony Davis → LAL (2019) — same template almost exactly
- Jimmy Butler → MIN (2017) — younger version, different motivation
- Chris Paul → HOU (2017) — superstar opt-in-and-out, contender buy
- Carmelo → NYK (2011) — disgruntled star, contender buy, pick-heavy package

**What would NOT feel comparable despite similar BPM numbers:**
- George → OKC (2017) — same BPM range on the outgoing star, but IND wasn't forced and OKC wasn't a desperate contender; different motivation entirely
- Kyrie → BOS (2017) — superstar requesting out, but age (25) and years-remaining profile differ meaningfully

---

## Example 2 — James Harden → Houston (October 2012)

**OKC sent:** James Harden (age 23, 2011-12 BPM +3.6 off bench, trending up, rookie extension negotiations collapsed)
**HOU sent:** Kevin Martin (age 29, +1.1 BPM, vet scorer), Jeremy Lamb (age 20, rookie, unproven), 2013 1st (OKC's, eventually Steven Adams), 2013 1st (TOR via HOU), 2014 1st-swap rights
**Context:** OKC refused to pay luxury tax on a 4th max slot. Harden had won 6MOY the season before and was trending toward star status. Pure salary-driven sale of a young ascending asset.
**Outcome:** Harden became MVP-tier. Adams became a starter. OKC's title window closed shortly after.

**What made this trade what it was:**
- Young ascending star (age ≤ 24) with rising BPM, rookie deal expiring
- Team refusing to pay extension (cap/tax-driven, not player-driven)
- Return: role veteran + prospect + multiple 1st-round picks
- Motivation flag: **cap-driven-sale-of-young-star**
- Pick-heavy package structure

**What would feel like a comparable trade:**
- Paul George → LAC (2019) — different motivation but similar pick-heavy package
- Luka → LAL (2025) — young ascending star, different motivation (cap-star-move rather than refusal-to-pay)
- Bledsoe → PHO (2013) — young ascending player out of LAC, similar trade logic
- Dončić situation (pre-trade speculation) — ascending young star + cap decision

**What would NOT feel comparable:**
- Kawhi → TOR — same package structure on paper but completely different motivation (superstar request vs team refusal)
- AD → LAL — again, motivation differs

---

## Example 3 — Anthony Davis → LAL (June 2019)

**NOP sent:** Anthony Davis (age 26, 2018-19 BPM +5.4 despite strained tenure, 1 year left on deal)
**LAL sent:** Lonzo Ball (age 21, -0.7 BPM), Brandon Ingram (age 21, +0.5 BPM), Josh Hart (age 24, +0.9 BPM), 2019 4th pick (→ RJ Barrett), 2021 unprotected 1st, 2022 1st-swap rights, 2024 unprotected 1st, 2025 1st-swap rights
**Context:** AD formally requested a trade via Rich Paul. NOP leveraged the request into a pick-heavy and young-piece-heavy package. LAL was a contender-adjacent team with LeBron needing a co-star.
**Outcome:** LAL won 2020 title. NOP's Ingram became an All-Star, picks turned into Dyson Daniels + future assets.

**What made this trade what it was:**
- Disgruntled top-5 player on expiring-plus-one contract (**identical template to Kawhi**)
- Contender going all-in with young pieces + picks (**more pick-heavy than Kawhi**)
- Age gap larger (26 vs 21/21/24 return) — genuine youth-for-star swap
- Motivation flag: **superstar-requesting-out**

**What would feel like a comparable trade:**
- Kawhi → TOR (2018) — same motivation, lighter package
- Harden → BKN (2021) — superstar request, young-pieces-plus-picks package, different CBA era
- Doncic → LAL (2025) — adjacent but motivation differs

---

## Synthesis — Features that do real work

Ranked by how much each feature changes which historical trades feel comparable:

### Tier 1 — Load-bearing

**1. Motivation flag.** The strongest single signal. Four buckets observable from external context:
- `superstar-requesting-out` (Kawhi, AD, Kyrie, George-to-LAC)
- `cap-driven-sale-of-young-star` (Harden-to-HOU, potentially Doncic situation)
- `contender-rebalancing` (Lowry-to-MIA, Nurkić moves at deadline)
- `rebuilder-selling-vet` (Gobert-to-MIN from UTA side, most deadline rentals)

Derivable from: contract years remaining, team W-L at trade time, prior trade request signal (currently not in our data — would need a text flag, which is usually knowable from context and could be human-tagged on major trades).

**2. Package structure.** Three axes:
- Player-heavy vs pick-heavy vs hybrid (count players + count picks + ratio)
- Age profile of return (young/vet/mixed)
- Total salary sent vs received

**3. Star profile at moment of trade.**
- Age bracket (≤23 / 24-27 / 28-30 / 31+)
- BPM tier (elite 6+ / star 4-6 / above-avg 2-4 / avg 0-2 / below 0)
- Contract years remaining (0-1 / 2-3 / 4+)
- Contract cap % (max / DPE / MLE / mid / min)

### Tier 2 — Refining

**4. Era context.**
- CBA regime (pre-1999 / 1999-2005 / 2005-2011 / 2011-2023 / 2023+ second apron)
- Cap year for relative-salary normalization
- Post-2011 vs pre-2011 (MLE shrunk, picks appreciated)

**5. Team posture at trade time.**
- Sending team: contender (top-4 seed) / middling / rebuilding
- Receiving team: same

**6. Timing.**
- Deadline / summer / preseason / midseason
- Deadline trades skew short-horizon; summer trades have full-season horizon

### Tier 3 — Noise (for v1)

- Coach continuity, player-coach fit, injury-history detail, specific positional overlap, front-office reputation. All potentially matter, none easy to encode without major manual tagging.

---

## Algorithm sketch (v1)

Two-stage matcher, not a single distance function.

**Stage 1 — Structural gate.** Filter the 1,927 scored trades down to structurally-similar ones:
- Same motivation flag (or flag unknown → pass through)
- Same package-structure bucket (player-heavy / pick-heavy / hybrid)
- Same star-age bracket

Expect this cuts the pool from 1,927 to 20-80 candidates for most queries.

**Stage 2 — Profile distance.** Rank surviving candidates by weighted distance on:
- BPM delta (weight 1.0)
- Age delta (weight 0.7)
- Contract-years-remaining delta (weight 0.6)
- Cap-% delta (weight 0.4)
- Era proximity (decay function, recent trades weighted higher)

Return top 5. Surface in UI with: match score, motivation label, one-line outcome summary.

---

## Card-copy implications

The BPM/WS split the consultant flagged matters here. Card copy should read:

> **Comparable to:** Anthony Davis → Lakers, 2019
> *Matched on:* superstar-requesting-out · age 26-27 bracket · player + pick package
> *LAL verdict:* dominant winner (+ championship)
> *Your trade's expected verdict:* lean contender (based on 68% of comparables where contender won)

Two currencies surfaced explicitly: match is on pre-trade profile, verdict on realized WS.

---

## Open questions for Phase B2 build

1. **Motivation flag source.** For 1,927 historical trades, do we hand-tag the top 100 and leave the rest `unknown`? Or derive from contract-years + team-posture signals automatically?
2. **Stage 1 gate too strict?** If a query hits 0 candidates after structural filter, fall through to pure Stage 2 ranking with a "no structural match" warning.
3. **Rookie edge case.** Player-BPM based on single season breaks for sub-20-GP injury seasons. Fall back to `max(last 2 seasons BPM with ≥ 500 MP)` when current season is noise.
4. **Multi-player packages.** When SAS sends Kawhi + Danny Green, do we match on Kawhi alone, or aggregate the outgoing package's total BPM? Probably the former — the star anchors the trade — with Green as secondary matching factor.
5. **Pick valuation for matching.** Use simple pick count + round, or the existing pick-value curve we already score with?
