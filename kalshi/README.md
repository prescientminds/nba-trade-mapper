# Kalshi Prediction Market Integration (Exploratory)

**Status:** API validated, SDK installed, credentials stored. Not integrated into the app. Decision pending.

This directory contains 4 test scripts from a 2026-03-13 exploration session that validated Kalshi's API for NBA market coverage. The work confirmed that Kalshi has everything needed for a prediction market integration — the question is whether to build it.

## What was validated

The `kalshi-typescript` SDK (v3.9.0) connects successfully. NBA market coverage is comprehensive:

- **Futures:** Championship (`KXNBA-26`, 30 teams), MVP (`KXNBAMVP-26`, 72 markets), DPOY, COY, ROTY
- **Season:** Playoff qualifiers (`KXNBAPLAYOFF-26`), win totals per team (`KXNBAWINS-{TEAM}`)
- **Daily games:** Outcomes (`KXNBAGAME`), spreads (`KXNBASPREAD`), over/under (`KXNBAOU`)
- **Player props:** Points (`KXNBAPTS`), assists (`KXNBAAST`), rebounds (`KXNBAREB`), threes (`KXNBA3PT`)
- **Novelty:** Expansion cities, Seattle franchise, LeBron ownership

## Test scripts (run order)

These are standalone — run any of them independently with `npx tsx kalshi/<file>`.

| Script | What it does |
|--------|-------------|
| `test-kalshi.ts` | Initial API connection check. Sports filters, event search, market search, series list. |
| `test-kalshi-nba.ts` | Paginated NBA event discovery. Scans 5 pages of open events for basketball keywords. |
| `test-kalshi-sports.ts` | Broad sports market survey. 3 pages × 1000 markets, filters by team/player names, maps series tickers. |
| `test-kalshi-final.ts` | Comprehensive sweep. Raw market object inspection, KXNBA championship events, 20+ NBA series tickers tested, 10-page event scan. |

## Integration plan (if greenlit)

1. `src/lib/kalshi.ts` — SDK wrapper, fetch NBA markets, cache results
2. `/api/odds/route.ts` — server-side proxy (keeps API key server-side)
3. TradeNode expanded state: "Market" section below verdict — team championship odds, player props
4. Share cards: optional "Market Odds" spotlight toggle with probability snapshot
5. Referral link CTA: "Trade on Kalshi" with referral code

## Monetization model

Kalshi referral pays $25/signup (capped at $1K total). Real affiliate deal requires direct outreach to Kalshi partnerships team after proving volume. Secondary models: premium skins as paywall ($2.99/mo), sports betting affiliates (DraftKings CPA).

## Credentials

- `KALSHI_API_KEY_ID` and `KALSHI_PRIVATE_KEY_PATH` in `.env.local` (gitignored)
- Private key: `~/.kalshi/private-key.pem` (chmod 600)
- SDK: `kalshi-typescript` v3.9.0 in `package.json`

## Full context

Monetization strategy and integration plan tracked in project memory:
`~/.claude/projects/-Users-michaelweintraub/memory/nba-trade-mapper.md` → "Monetization — Kalshi prediction market integration"
