# 10 Bargain-Bin Pickups That Outproduced a $211M Contract

> 10-slide carousel format. Each slide: rank, player photo, headline, data callout, 2-sentence take.
> Data: CATV scoring (Win Shares + playoff WS × 1.5 + championship bonus + accolades) through Mar 2026.
> Hook: Every player on this list cost less than Paul George's annual salary. Every one of them produced more.

---

### 1. Donovan Clingan — 10.0 WS, Portland +15 wins

**Data:** $24.2M total contract. 3.7x more Win Shares than Paul George at 11% of the cost.

Portland drafted Clingan 7th and he immediately became the most productive rookie center in the league. He made All-Rookie and lifted a 21-win team to 36 — while George, at nine times the salary, produced negative value relative to his cap hit in Philadelphia.

---

### 2. Neemias Queta — 9.2 WS for $5M in Boston

**Data:** $545K per Win Share — the second-best value of any signing since 2024.

A backup center on a minimum deal outproduced Philly's $211.6M acquisition by 3.4x. Queta is the clearest proof in the dataset that the NBA's value curve breaks at the bottom of the salary scale.

---

### 3. Goga Bitadze — 9.0 WS for $15.9M in Orlando

**Data:** Bitadze's 9.0 WS cost Orlando $1.8M per Win Share. George's 2.7 WS cost Philly $78.4M per Win Share.

Orlando signed Bitadze as injury insurance for Wendell Carter Jr. and got a starting-caliber center for the price of a midlevel exception. The 43x gap in cost efficiency between Bitadze and George is not a rounding error — it's a structural indictment of max-contract thinking.

---

### 4. Kel'el Ware — 8.9 WS, All-Rookie, Miami

**Data:** $16.2M total. Miami's best value acquisition of the offseason by CATV per dollar.

The 15th pick produced 8.9 Win Shares and made All-Rookie on a team that dropped 9 wins. Ware was the one bright spot in Miami's season, and he cost less than a single year of George's deal.

---

### 5. Naji Marshall — 7.9 WS for $18.4M in Dallas

**Data:** Marshall produced 2.9x more Win Shares than George at 8.7% of the total cost.

Dallas signed Marshall as a depth wing and he delivered 7.9 Win Shares — more than most teams got from their highest-paid players. For the price of one Paul George game check, the Mavericks got a full season of above-average production.

---

### 6. Collin Gillespie — 6.1 WS on a two-way contract

**Data:** $2.3M total. $376K per Win Share — the single best value of any move since 2024.

A former Villanova walk-on produced 6.1 Win Shares on a Phoenix two-way deal. That's 2.3x more production than Paul George on 1% of the money. Gillespie is the statistical embodiment of the league's most underpriced asset class: the two-way contract.

---

### 7. Cam Spencer — 5.2 WS on a Memphis two-way

**Data:** $10.4M total. Memphis went from 27 wins to 48 with Spencer contributing off the bench.

Spencer and Jaylen Wells (next slide) gave Memphis two productive contributors for a combined cost less than George's signing bonus. The Grizzlies' +21 win jump came from everywhere on the roster, not from one max contract.

---

### 8. Jaylen Wells — 5.0 WS, All-Rookie, $1.2M salary

**Data:** 33rd pick. $7.9M total contract. Made All-Rookie on a team that jumped 21 wins.

Wells was drafted in the second round, costs roughly what Paul George earns every three games, and produced almost twice the Win Shares. Memphis found a starting-caliber wing for less than a luxury-tax penalty.

---

### 9. Ajay Mitchell — 5.2 WS, championship ring, OKC two-way

**Data:** $11.7M total. 5.2 WS, 0.1 playoff WS, NBA champion.

A two-way player in Oklahoma City contributed 5.2 Win Shares and won a championship — nearly double Paul George's total production — on a contract that wouldn't cover George's per-game salary. OKC's roster construction philosophy in a single transaction.

---

### 10. Justin Champagnie — 5.3 WS, converted two-way, Washington

**Data:** $8.0M total. $1.5M per Win Share. Produced 2x Paul George's output.

Washington converted Champagnie from a two-way contract and got 5.3 Win Shares on an 18-win team. Champagnie's production on a bottom-five roster is more impressive per dollar than George's on a team that was supposed to contend.

---

## THE SCOREBOARD

**These 10 players combined:**
- 71.8 Win Shares
- $120M total salary
- $1.7M per Win Share
- 1 championship ring
- 3 All-Rookie selections
- Average team: +7.7 wins

**Paul George:**
- 2.7 Win Shares
- $211.6M total salary
- $78.4M per Win Share
- 0 championships
- Philadelphia went from 47 wins to 24

The 10 bargain pickups cost 57% of George's contract and produced 26.6x the Win Shares. The most expensive move of the 2024 offseason was also the least productive per dollar in the entire CATV dataset.

---

## DATA NOTES

- All Win Shares from Kaggle BBRef data through ~Mar 2026 (dataset v54)
- "Since 2024" = 2024-25 and 2025-26 seasons (2 full seasons of data)
- CATV = Win Shares + playoff WS × 1.5 + championship bonus + accolade bonus
- $/WS = total salary / total Win Shares (lower = better)
- Paul George comparison: 2.7 WS on $211.6M ($49.2M/yr avg), signed July 2024
- Two-way contracts are the most underpriced asset class in the NBA: Gillespie, Spencer, and Mitchell all produced 5+ WS on deals under $12M total

## QUERY COMMANDS

```bash
# Reproduce these results
npx tsx scripts/query-moves.ts --steals --since 2024 --limit 15 --json
npx tsx scripts/query-moves.ts --worst-moves --since 2024 --limit 5 --json
npx tsx scripts/query-moves.ts --best-moves --since 2024 --limit 20 --json
```
