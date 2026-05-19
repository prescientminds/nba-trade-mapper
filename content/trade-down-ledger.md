# Trade-Down Ledger — LOCKED CANONICAL SOURCE

> **Status: FROZEN as of 2026-05-17.** Do not edit, regenerate, or recompute the numbers in this file. This is the single source of truth for the Trade-Down Ledger Discovery category. The next step is an independent accuracy test by a separate agent. Any change requires a verified data correction, applied here first, before any downstream use (Explore tab logic, staff social post).
>
> **Audit resolution (2026-05-17).** Independent accuracy test complete: 11/13 rows reproduced exactly. Tenure rule set to **trade-tenure** — count each player's WS only for the continuous stint the trade produced, ending when his rights leave the receiving team (trade-out, FA departure, waiver); a later FA return after stints elsewhere is a separate tenure, excluded. Two verified corrections applied below: Row 8 Other side 8.9→11.6, Diff −1.1→−3.8 (the locked 8.9 dropped Elfrid Payton's 2017-18 Orlando split, 2.7 WS, a clean continuous-tenure season). Row 13 Other side 99.8→99.5, Diff −91.9→−91.6 (the locked 99.8 included Pippen's 2003-04 Chicago return, 0.3 WS — a separate FA tenure after Houston and Portland). Row 2 Carroll confirmed as one continuous Golden State tenure: rights retained through his 1984-85 Italy year, no intervening NBA team, so the 1981–88 span is one tenure (33.4 / +202.2 stands).
>
> Title for the Discovery category is still open ("The Trade-Down Ledger" is a suggestion only). The freeze covers the data below.

---

## Methodology (locked)

- **Source:** Kaggle `Advanced.csv` (career WS by player-team-season), via the NBA Trade Mapper data layer.
- **Inclusion rule:** A current-year draft pick is the main asset traded down (a team sends a higher pick and receives a lower pick in the same draft year). Future picks may be included in the trade as throw-ins but are noted, not scored.
- **WS attribution:** Career win shares accumulated by each player while on the team that received them.
- **Differential:** (pick-trader's gained WS) − (other side's gained WS). Positive = pick-trader won the trade-down.
- **Capped tenures:** Luka Dončić (DAL) and Anthony Davis (LAL) capped at Feb 2025. Tatum, Trae, LaVine, Brown still active and accumulating — numbers require a "WS through [date]" stamp at display time.

---

## Trade-Downs, ranked — with future-pick fates

| # | Year | Pick-trader | Traded down | Got back | Future picks → who they became | Trader WS | Other side WS | Diff |
|---|------|-------------|-------------|----------|-------------------------------|-----------|---------------|------|
| 1 | 1998 | **Mavericks** | #6 (Traylor) | #9 (Dirk) + #19 (Garrity) | — none — | **206.4** | 3.5 | **+202.9** |
| 2 | 1980 | **Celtics** | #1 (Carroll) + #13 (Brown) | Parish + #3 (McHale) | — none — | **235.6** | 33.4 | **+202.2** |
| 3 | 2017 | **Celtics** | #1 (Fultz) | #3 (Tatum) | 2019 1st → **Romeo Langford** (#14, BOS, 1.5 WS) | **67.1** | 0.5 | **+66.6** |
| 4 | 1996 | **Bucks** | #4 (Marbury) | #5 (Allen) + Lang | 1999 1st → **William Avery** (#14, looped back to MIN, −0.9 WS) | **56.7** | 10.3 | **+46.4** |
| 5 | 2007 | **Celtics** | #5 (Green) + Wally + Delonte | #35 (Davis) + Ray Allen | 2008 2nd → **Trent Plaisted** (#46, SEA, 0 WS) | **56.1** | 16.2 | **+39.9** |
| 6 | 2008 | **Timberwolves** | #3 (Mayo) + 3 vets | #5 (Love) + 3 vets | — none — | **47.0** | 14.9 | **+32.1** |
| 7 | 2019 | **Pelicans** | #4 (Hunter) | #8 (Hayes) + #17 (NAW) | 2020 2nd + 2021 2nd → minor, no rotation player | **14.4** | 9.8 | **+4.6** |
| 8 | 2014 | **76ers** | #10 (Payton) | #12 (Šarić) | 2015 1st (protected → washed to 2019+2020 2nds) + 2017 2nd → no value | **7.8** | 11.6 | **−3.8** |
| 9 | 2018 | **Hawks** | #3 (Luka) | #5 (Trae) | 2019 1st → **Cam Reddish** (#10, ATL, 0.6 WS) | **44.4** | 53.7 | **−9.3** |
| 10 | 2018 | **76ers** | #10 (Bridges) | #16 (Zhaire Smith) | MIA 2021 1st → conveyed late-1st, re-traded by PHI, no rotation player | **0** | 29.5 | **−29.5** |
| 11 | 2017 | **Timberwolves** | #7 (Markkanen) + LaVine + Dunn | #16 (Patton) + Butler | — none — | **10.2** | 45.8 | **−35.6** |
| 12 | 2006 | **Bulls** | #2 (Aldridge) | #4 (Tyrus Thomas) + Khryapa | 2007 2nd → **Demetris Nichols** (#53, 0 WS) | **11.0** | 69.3 | **−58.3** |
| 13 | 1987 | **Sonics** | #5 (Pippen) | #8 (Polynice) | 1989 1st-swap option (unused — Bulls kept **B.J. Armstrong** #18 + **Jeff Sanders** #20) + minor 2nd | **7.9** | 99.5 | **−91.6** |

---

**Takeaway on the future picks:** In all 13 trade-downs, the future-pick throw-in produced **zero rotation value** for the team that received it — the most any of them returned was Langford's 1.5 WS and Reddish's 0.6 WS. The current-year pick was the whole ballgame every time. Sonics-1987 is the cleanest cautionary tale: they had the Pippen pick *and* a swap option on Chicago's future firsts (Armstrong, Sanders), and the entire package netted them Polynice.

---

## Accuracy-test handoff notes (priority soft spots)

These were flagged as the least-clean lineages during the build. Verify against primary sources before the data is trusted for the Explore tab or any social post:

1. **1987 Pippen** — the future-pick structure (1989 1st-swap option / Armstrong / Sanders / "minor 2nd") is the least clean in the DB. Differential (−91.6, corrected) holds regardless, but the offshoot display needs the lineage right.
2. **1996 Allen–Marbury** — the 1999 1st (William Avery) loops MIN→MIL→MIN across two June/July 1996 trades. Confirm the net-zero claim.
3. **2014 76ers–Magic** — the protected 2015 1st that "washed to 2nds." Tangled in the DB; verify before showing as an offshoot.
4. **Active-player caps** — Tatum, Trae, LaVine, Brown still accumulating; Luka/AD capped at Feb 2025. Display needs a "WS through [date]" stamp or the numbers rot.

---

## Workflow

1. ✅ Locked verbatim (this file, 2026-05-17).
2. ✅ Independent accuracy test — complete 2026-05-17. 11/13 exact; Rows 8 and 13 corrected under the trade-tenure rule (see Audit resolution in header).
3. ⏳ If verified: duplicate the logic and ship to the Explore tab.
4. ⏳ Staff social post from the verified ledger — later agent.
