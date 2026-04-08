# NBA Trade Impact Mapper

## Vision

A **visual graph explorer** for NBA trades and player journeys. The entire UI is a spatial node graph — like Google NotebookLM's mind map. You search for a player or trade, a node appears, and you click to expand it. New nodes emerge with connecting lines. The graph grows as you explore.

**The home page is a search bar. That's it.** Search "Kobe" → see the 1996 draft-day trade → click → nodes appear for Vlade Divac going to Charlotte, the #13 pick going to the Lakers. Click any player → see their **career journey** (stints at each team with stats, awards, impact). Keep clicking, keep exploring. The graph IS the app.

### Core UX Principles
- **Search-first** — no lists, no grids, no cards. Just a search bar on a clean page.
- **Expand on click** — clicking a node fetches related data and adds new nodes + edges to the canvas.
- **Spatial** — nodes have position, connected by lines/edges. You can pan and zoom.
- **Multi-generational** — follow a chain through 5, 10, 20 trades deep. The graph captures the full ripple.
- **Both directions** — trace forward (what happened to players acquired) AND backward (how did this team get this pick).
- **Player journeys** — clicking a player shows their career path: team stints with stats, awards, and impact on winning. Expandable to per-season detail.

### Layout Vision
- Trade detail panel at top: compact "key" (~10% of screen, 100px expanded / 48px minimized)
- Graph below (~90%): mind map where you click players and follow their journeys

## Current Status

### What Works — confirmed Feb 2026
- **Graph UI built** — React Flow with search bar, click-to-expand, auto-layout (ELK.js)
- **6 active node types**: TradeNode, PlayerNode, PickNode, PlayerStintNode, GapNode, ChampionshipNode
- **1,935 trades in static JSON** — 1,541 from Supabase (1976–Feb 2019) + 394 scraped from BBRef (Feb 2019–Feb 2026)
- **50 season files** in `public/data/trades/by-season/` (1976-77 through 2025-26) + search index
- **23,567 player-season stat rows** in Supabase — regular + 8 playoff columns. 9,187 rows have playoff_ws (1977–2025).
- **2,510 player accolades** in Supabase — MVP, DPOY, ROY, MIP, Sixth Man, All-Star, All-NBA (1st/2nd/3rd), All-Defensive, All-Rookie.
- **1,376 team-season records** in Supabase — W/L + `playoff_result` (R1/R2/CONF/FINALS/CHAMP) + championship bool. 49 champions verified.
- **1,927 trade score rows** in Supabase `trade_scores` — `winner`, `lopsidedness`, `team_scores` JSONB with per-asset breakdown.
- **Trade verdict UI** — expanded TradeNode shows compact bar chart, winner highlighted, lazy-fetched on first expand.
- **SeasonTable** — playoff result badges inline per season row (CONF=teal, FINALS=purple, CHAMP=gold); accolade badges; W/L footer.
- **Player journeys** — stints chained by trade nodes; `← Hist` (backward) and `Path →` (forward) buttons; inline stats panel per player in trade card.
- **Expand web (+/−)** — multi-degree expansion via BFS across all reachable trade nodes. Handles free agency (direct stint→stint edges). Collapse peels leaf layer.
- **Data quality clean** — all team IDs validated; NOP/CHA era fixed (50 trades); Pippen/Polynice pick names corrected.
- **Build compiles cleanly** (`npm run build` passes) | **Deployed to Vercel** — auto-deploys on push

### Static JSON Data Pipeline
The app reads trade data from static JSON files, NOT directly from Supabase at runtime.
Run these scripts in order if rebuilding trade data from scratch:

1. `npx tsx scripts/export-existing-trades.ts` — Supabase → static JSON (~30s)
2. `python3 scripts/fix-csv-trades.py` — ⚠️ MUST run after step 1 (fixes direction bug in CSV-era trades)
3. Re-apply NOP/CHA fix — ⚠️ MUST run after step 1 (50 trades had New Orleans Hornets stored as CHA)
4. `npx tsx scripts/scrape-bbref-trades.ts` — BBRef scrape Feb 2019–present (~2hrs first run, cached after)
5. `npx tsx scripts/enrich-picks.ts` — Add drafted player names from Kaggle CSV (~5s)

Daily updates: `scripts/scrape-today.ts` (used by `.github/workflows/update-trades.yml`)

### Non-Trade Transaction Pipeline
Covers signings, waivers, extensions, two-way, exhibit 10, 10-day, waiver claims, conversions, retirements, suspensions.
- **Source:** BBRef season transaction pages (`/leagues/NBA_{YYYY}_transactions.html`)
- **Script:** `npx tsx scripts/scrape-bbref-transactions.ts` — one HTTP request per season, cached in `data/bbref-cache/transactions/`
- **Output:** `public/data/transactions/by-season/{season}.json` + `public/data/transactions/index.json`
- **Coverage:** 1999-00 through 2025-26 (27 seasons, 14,331 transactions)
- **DB table:** `player_transactions` (migration: `017-player-transactions.sql` — needs manual run in SQL Editor)
- **Options:** `--season 2025-26` (single season), `--from 2020` (range), `--dry-run`, `--no-db`

### Trade Data Quality Fix (reference — ✅ COMPLETE)

**Root cause:** `import-trades.ts` misread the bipartite CSV format. All 1,552 CSV-imported trades (1976-2019) had inverted directions.
**Fix:** `scripts/fix-csv-trades.py` — re-processes with correct logic. 1,526 trades patched.
**Re-run required** after any `export-existing-trades.ts` since Supabase still has original bug.

### Target Player Journey UX (reference — design spec)
Using Harden as reference: Draft card → click → OKC seasons (inline, not modal) → trade card (collapsed: date/teams/count) → click to expand both sides → click player name for stint stats → parallel columns for secondary players anchored at shared trade node. Transactions are the organizing spine; seasons nest under stints; stints separated by trades.

### Recent Changes
See changelog in `~/.claude/projects/-Users-michaelweintraub/memory/nba-trade-mapper.md`

## Tech Stack
- **Next.js 16** (App Router, TypeScript, Tailwind CSS v4)
- **Supabase** (PostgreSQL, free tier, project ref: `izvnmsrjygshtperrwqk`)
- **@supabase/supabase-js** — official SDK
- **@xyflow/react v12** (React Flow) — graph visualization with custom nodes
- **ELK.js** (elkjs) — automatic graph layout (layered algorithm, DOWN direction)
- **Zustand** — state management for graph store
- **csv-parse** — CSV parsing in import scripts
- **cheerio** — HTML parsing (for scrapers, currently blocked by Cloudflare)

## Project Structure
```
nba-trade-mapper/
├── database/
│   ├── schema.sql                    # Full Supabase schema (already run)
│   ├── reset-and-create.sql          # DROP + recreate if needed
│   └── migrations/
│       ├── 001-player-seasons.sql    # player_seasons table (APPLIED)
│       ├── 002-player-contracts.sql  # player_contracts table (APPLIED)
│       ├── 003-accolades-player-name.sql # player_name col on accolades (APPLIED)
│       ├── 004-fix-trade-lineage-security.sql # (APPLIED)
│       ├── 005-playoff-stats.sql     # 8 playoff columns on player_seasons (APPLIED)
│       ├── 006-trade-scores.sql      # trade_scores table (APPLIED)
│       └── 012-playoff-game-logs.sql # playoff_game_logs table (APPLIED)
├── data/
│   ├── trades.csv                    # 37K rows, source: svitkin/bball-trade-network
│   └── kaggle/                       # BBRef datasets (gitignored)
│       ├── Player Per Game.csv       # Per-game stats
│       ├── Advanced.csv              # Win shares, PER, VORP
│       ├── Player Award Shares.csv   # MVP, DPOY, ROY winners
│       ├── End of Season Teams.csv   # All-NBA, All-Defensive
│       ├── All-Star Selections.csv   # All-Star picks
│       └── Team Summaries.csv        # Team W/L, playoffs
├── kalshi/                              # Prediction market integration (exploratory, excluded from build)
│   ├── README.md                        # What was validated, integration plan, credentials
│   ├── test-kalshi.ts                   # Initial API connection check
│   ├── test-kalshi-nba.ts               # NBA event discovery
│   ├── test-kalshi-sports.ts            # Broad sports market survey
│   └── test-kalshi-final.ts             # Comprehensive series ticker sweep
├── scripts/
│   ├── lib/
│   │   ├── supabase-admin.ts         # Shared Supabase admin client (service role key)
│   │   └── team-resolver.ts          # BBRef abbreviation → team_id mapping
│   ├── export-existing-trades.ts     # Supabase → static JSON (Step 1 of data pipeline)
│   ├── scrape-bbref-trades.ts        # BBRef scrape Feb 2019–present (Step 2, cached in data/bbref-cache/)
│   ├── enrich-picks.ts               # Add became_player_name from Kaggle CSV (Step 3)
│   ├── scrape-today.ts               # Daily scraper (used by GitHub Action)
│   ├── freeze-season.ts              # End-of-season minification utility
│   ├── import-trades.ts              # CSV → transactions (ALREADY RUN, 1541 trades)
│   ├── import-player-stats.ts        # Kaggle → player_seasons (ALREADY RUN, 23567 rows)
│   ├── import-accolades.ts           # Kaggle → player_accolades (ALREADY RUN, 2510 rows — uses INSERT, wipe before re-run)
│   ├── import-team-seasons.ts        # Kaggle → team_seasons (ALREADY RUN, 1376 rows)
│   ├── scrape-playoff-results.ts     # BBRef brackets → team_seasons playoff_result+championship (ALREADY RUN)
│   ├── scrape-playoff-stats.ts       # BBRef playoff pages → player_seasons playoff_ws etc (ALREADY RUN)
│   ├── scrape-playoff-game-logs.ts   # BBRef player pages → playoff_game_logs per-game stats (ALREADY RUN)
│   ├── score-trades.ts               # Scores all trades → trade_scores table (ALREADY RUN)
│   ├── run-migrations.ts             # Run migrations via direct postgres connection
│   ├── run-migrations-api.ts         # Run migrations via Supabase Management API
│   └── scrape-trades.ts              # prosportstransactions.com scraper (DEAD — blocked by Cloudflare)
├── src/
│   ├── app/
│   │   ├── globals.css               # Design system
│   │   ├── layout.tsx                # Root layout
│   │   └── page.tsx                  # Search bar + React Flow graph canvas
│   ├── components/
│   │   ├── SearchOverlay.tsx         # Search modal overlay
│   │   ├── TradeDetailPanel.tsx      # Compact trade key panel (top ~10%)
│   │   └── nodes/
│   │       ├── TradeNode.tsx         # 240px trade card (date, teams, title)
│   │       ├── PlayerNode.tsx        # Player pill (click → journey or trades)
│   │       ├── PickNode.tsx          # Draft pick node
│   │       └── PlayerStintNode.tsx   # Career stint at one team (avg stats, accolades)
│   └── lib/
│       ├── supabase.ts              # Supabase client + TypeScript types
│       ├── teams.ts                 # All 30 teams: colors, conferences, divisions
│       ├── graph-store.ts           # Zustand store: all graph logic, expand actions
│       ├── graph-layout.ts          # ELK.js layout engine
│       ├── trade-data.ts            # Static JSON trade loader (search, load by season)
│       └── draft-data.ts            # Draft info loader from public/data/drafts.json
└── .env.local                       # Supabase URL + anon key + service role key
```

## Database Schema

### Tables
- **teams** — 30 NBA teams (id like 'LAL', colors, conference, division)
- **players** — name, bbref_id, draft info, current_team_id
- **transactions** — date, type, title, description + lineage fields
- **transaction_teams** — links transactions to teams with role (sender/receiver)
- **transaction_assets** — players, picks, cash exchanged; pick_year, pick_round, became_player_name
- **team_seasons** — W/L records, playoff results, championship flags (1,376 rows imported)
- **player_accolades** — MVP, All-Star, All-NBA, DPOY, ROY, MIP, Sixth Man by season (2,510 rows)
- **player_seasons** — per-game + advanced stats by player/team/season (23,308 rows)
- **player_contracts** — salary + contract type by season (15,370 rows)
- **playoff_game_logs** — per-game playoff stats by player/date/team (scraped from BBRef player pages)

### Lineage Fields (on transactions)
- `root_transaction_id` — the original trade this stems from
- `parent_transaction_id` — immediate parent in the chain
- `generation` — 0 = root, 1 = first downstream, etc.

### Key Join Patterns
- Player journey: `player_seasons` joined by `player_name` + `team_id`
- Accolades: `player_accolades` joined by `player_name` + `season`
- Team context: `team_seasons` joined by `team_id` + `season`
- Trade assets: `transaction_assets` linked by `transaction_id`

## Graph Store Architecture (`graph-store.ts`)

### Node Types
| Type | Data Interface | Dimensions | Purpose |
|------|---------------|------------|---------|
| `trade` | TradeNodeData | 240x120 | Trade event card |
| `player` | PlayerNodeData | 200x80 | Player pill (clickable) |
| `pick` | PickNodeData | 200x60 | Draft pick |
| `playerStint` | PlayerStintNodeData | 240x120 | Career stint at one team |

### Key Actions
- `search(query)` — searches transactions + player_seasons by name
- `seedFromTrade(tradeId)` — loads trade + assets into graph
- `seedFromChain(tradeId, chainScores)` — **Trade Tree view** from Discovery page (see invariants below)
- `seedFromPlayer(playerName, teamId)` — loads player node, checks for journey data
- `expandTradeNode(tradeId)` — expands trade into player/pick child nodes
- `expandPlayerNode(nodeId)` — if player has season data → `expandPlayerJourney`, else → find related trades
- `expandPlayerJourney(playerName)` — groups seasons into team stints, creates stint chain
- `expandStintDetails(stintNodeId)` — expands stint into per-season cards with stats/record/awards

### Trade Tree (`seedFromChain`) Invariants — do not break
**Concept:** Measures one team's asset management. Only win shares on the WINNING TEAM count.
- Each player shows **only their stint on `winnerTeamId`**, NOT their full multi-team career
- Bridge players with no stint on winning team: direct edge `entryTrade → exitTrade` (no stint node)
- Players with no `player_seasons` data: same bridge treatment
- `compute-chain-scores.ts` → `scorePlayer()` uses `seasonsByPlayerTeam` keyed by `playerName|teamId`
- Card labels (`flattenChainPlayers` in DiscoverySection) walk the full recursive tree — may show deep players that are many hops from the root
- **Do NOT show outgoing players' WS** — e.g., Pippen's Chicago WS must not count for Seattle's tree

### Journey Data Flow (CURRENT — see "Target Player Journey UX" above for design spec)
Current: Click player → sprawls all seasons in no clear order.

**TARGET flow (transaction-based organization):**
1. Click player node (e.g., "James Harden") → expand
2. Show **team stints** separated by **trade nodes**: Thunder → [TRADE: to Rockets for Kevin Martin, Lamb, picks] → Rockets → [TRADE: to Nets for ...] → Nets → Sixers → Clippers
3. Each team stint is a compact card with aggregated stats + accolade badges
4. Click a stint → expands to show per-season detail cards underneath
5. Click a trade node → shows the assets exchanged, each asset is clickable (follow Kevin Martin's journey, follow where the pick went)
6. **Transactions are the spine.** Seasons nest under stints. Stints are separated by trades.

## Data Sources

### Kaggle BBRef Dataset (sumitrodatta/nba-aba-baa-stats)
- Downloaded to `data/kaggle/` (gitignored)
- Coverage: 1947-present, we filter to 1976+ (ABA-NBA merger)
- CSV column names (not always obvious):
  - Per Game: `player`, `season` (end year), `team`, `g`, `pts_per_game`, `trb_per_game`, `ast_per_game`, `fg_percent`
  - Advanced: `player`, `season`, `team`, `ws`, `per`, `vorp`
  - Awards: `player`, `season`, `award`, `winner` (TRUE/FALSE)
  - End of Season: `player`, `season`, `type`, `number_tm`
  - All-Star: `player`, `season`
  - Team Summaries: `abbreviation`, `season`, `w`, `l`, `playoffs` (TRUE/FALSE), `lg`

### Team Abbreviation Mapping (scripts/lib/team-resolver.ts)
BBRef uses different abbreviations than our schema:
- BRK → BKN, PHO → PHX, CHO → CHA
- Historical: NJN → BKN, SEA → OKC, VAN → MEM, CHH → CHA, NOH/NOK → NOP, WSB → WAS
- `TOT` rows (multi-team totals) are skipped

### Trade CSV (svitkin/bball-trade-network)
- 37K rows, 1976-Feb 2019
- 1,535 unique trades after dedup

## Design System
- **BG**: #0a0a0f (dark)
- **Fonts**: Bebas Neue (display), Inter (body), JetBrains Mono (mono)
- **Accents**: Orange #ff6b35, Teal #4ecdc4, Purple #9b5de5, Gold #f9c74f
- **Team colors**: in `src/lib/teams.ts` — used to color nodes by team
- **MiniMap colors**: trade=#ff6b35, player=#4ecdc4, pick=#f9c74f, playerStint=#9b5de5, seasonDetail=#a8a8a8

## Conventions
- Supabase client uses lazy init (`getSupabase()`) — never create at module level
- All data fetching is client-side — no SSR for Supabase calls
- Supabase queries need type assertions: `as { data: { transaction_id: string }[] | null }`
- Team data in `teams.ts` for instant rendering without DB calls
- Import scripts use service_role key via `scripts/lib/supabase-admin.ts` to bypass RLS
- Player names in BBRef have `*` for HOF players — stripped with `cleanPlayerName()`
- BBRef seasons stored as end year (2020 = "2019-20") — converted with `bbrefSeasonToOurs()`

## Commands
```bash
npm run dev                                    # Dev server
npm run build                                  # Production build

# Static JSON data pipeline (run in order)
npx tsx scripts/export-existing-trades.ts      # Step 1: Supabase → static JSON
npx tsx scripts/scrape-bbref-trades.ts         # Step 2: BBRef scrape (cached in data/bbref-cache/)
npx tsx scripts/enrich-picks.ts                # Step 3: Add drafted player names

# Supabase import scripts (already run, only re-run if resetting DB)
npx tsx scripts/import-trades.ts               # Re-import trade CSV
npx tsx scripts/import-player-stats.ts         # Import player stats from Kaggle
npx tsx scripts/import-accolades.ts            # Import awards/accolades (wipe table first — uses INSERT not upsert)
npx tsx scripts/import-team-seasons.ts         # Import team W/L from Kaggle
SUPABASE_ACCESS_TOKEN=xxx npx tsx scripts/run-migrations-api.ts  # Run SQL migrations via API

# Non-trade transactions (signings, waivers, extensions, etc.)
npx tsx scripts/scrape-bbref-transactions.ts             # All seasons (2000-present, cached)
npx tsx scripts/scrape-bbref-transactions.ts --season 2025-26  # Single season
npx tsx scripts/scrape-bbref-transactions.ts --no-db     # JSON only, skip Supabase

# Mid-season Kaggle stats refresh (downloads latest CSVs + re-imports)
KAGGLE_API_TOKEN=xxx ./scripts/update-kaggle-stats.sh   # One command: download, compare, swap, import

# Seasonal refresh (run each offseason after playoffs end)
npx tsx scripts/scrape-playoff-results.ts --year 2026   # Bracket results → team_seasons
npx tsx scripts/scrape-playoff-stats.ts --year 2026     # Playoff WS/PPG → player_seasons
npx tsx scripts/score-trades.ts                         # Recompute all trade scores
```

## Supabase
- **URL**: https://izvnmsrjygshtperrwqk.supabase.co
- **Project ref**: izvnmsrjygshtperrwqk
- **SQL Editor**: https://supabase.com/dashboard/project/izvnmsrjygshtperrwqk/sql/new
- **Keys**: in .env.local
- **Management API**: POST to `https://api.supabase.com/v1/projects/izvnmsrjygshtperrwqk/database/query` with Bearer token
- **DB connection note**: Service role key does NOT work as postgres password. Use Management API with access token for migrations, or use Supabase SQL Editor directly.

## GitHub
- **Repo**: https://github.com/prescientminds/nba-trade-mapper
- **Status**: Pushed and deployed — auto-deploys on push to main

## Known Issues & Gotchas
1. **prosportstransactions.com is behind Cloudflare** — `scrape-trades.ts` doesn't work. BBRef scraper (`scrape-bbref-trades.ts`) is the replacement.
2. **Supabase DB direct connection fails** — pooler (port 6543) and direct (port 5432) both reject the service role key as password. Use Supabase SQL Editor directly for DDL.
3. **Kaggle CSV column names** — don't match what you'd expect. Always `head -1` the CSV first. See Data Sources section above. Key gotcha: `End of Season Teams.csv` stores `number_tm` as `'1st'`/`'2nd'`/`'3rd'` strings, not integers.
4. **player_contracts table** — 15,370 salary records (1984–2031), 2,102 unique players. Scraped via `scrape-salaries.ts` + `scrape-cap-history.ts`. Trade salary scoring via `score-trade-salaries.ts` (90.5% coverage).
5. **BBRef rate limit** — scraper uses 3.1s delay per request. First run ~2 hours for full history. Cached in `data/bbref-cache/` so re-runs are instant.
6. **CSV trade direction bug** — `scripts/fix-csv-trades.py` fixes the JSON files; Supabase `transactions` table still has the original inversion. Re-run the fix script after any re-export.
7. **Supabase PostgREST row limit** — default 1000 rows per response. Always paginate with `.range(from, from+999)` and loop; break when `data.length < 1000`.
8. **`import-accolades.ts` uses INSERT** — will create duplicates if run twice. Always wipe `player_accolades` table first if re-running.
9. **BBRef BPM sentinel** — value -1000.0 means "negligible minutes"; must be treated as null (clamped in `parseNum(s, -999.99, 999.99)`).
10. **Robert Parish 1980 trade** (`1979-80.json`): Parish stored as `type: "pick"` but was an established player. Path button non-functional. Needs: change to `type: "player"`, add `pick_year: 1980` to the 3 actual picks.

## Data Quality Notes (Feb 2026)
- ✅ Trade direction fixed (fix-csv-trades.py) — all 1,535 CSV-era trades have correct sides
- ✅ NOP/CHA fixed — 50 New Orleans Hornets trades (2002-03 through 2012-13) corrected from CHA → NOP
- ✅ Pippen/Polynice 1987 — B.J. Armstrong / Sylvester Gray removed as pick names (those picks resolved elsewhere)
- ✅ All-NBA tiers fixed — tiers were all showing "3rd" due to CSV column comparison bug
- ✅ All team IDs validated — no legacy codes in any static JSON file
- ✅ Trade Tree `seedFromChain` fixed — only shows winning team stints, bridge players maintain chain connectivity
- ✅ Salary data: 15,370 contracts, 90.5% trade coverage, diacritics/aliases/suffix handling all fixed
- ⚠️ Supabase `transactions` table still has original CSV direction bug — static JSON is source of truth
- ⚠️ `import-accolades.ts` uses INSERT — wipe table before re-running
- ⚠️ salary_cap_history supplementary columns (luxury_tax, apron, MLE, BAE) are all NULL

## Priorities & Session State

**Do not track priorities here.** This file is for codebase architecture only.

Current priorities, WIP state, and changelog live in the **single source of truth:**
`~/.claude/projects/-Users-michaelweintraub/memory/nba-trade-mapper.md`
