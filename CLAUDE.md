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
- **5 active node types**: TradeNode, PlayerNode, PickNode, PlayerStintNode, GapNode
  - TransitionNode exists in code but `makeTransitionNode()` is never called — dead code
- **1,935 trades in static JSON** — 1,541 from Supabase (1976–Feb 2019) + 394 scraped from BBRef (Feb 2019–Feb 2026)
- **50 season files** in `public/data/trades/by-season/` (1976-77 through 2025-26) + search index
- **23,567 player-season stat rows** in Supabase — regular + 8 playoff columns. 9,187 rows have playoff_ws (1977–2025).
- **2,510 player accolades** in Supabase — MVP, DPOY, ROY, MIP, Sixth Man, All-Star, All-NBA (1st/2nd/3rd), All-Defensive, All-Rookie.
- **1,376 team-season records** in Supabase — W/L + `playoff_result` (R1/R2/CONF/FINALS/CHAMP) + championship bool. 49 champions verified.
- **1,927 trade score rows** in Supabase `trade_scores` — `winner`, `lopsidedness`, `team_scores` JSONB with per-asset breakdown.
- **Trade verdict UI** — expanded TradeNode shows compact bar chart, winner highlighted, lazy-fetched on first expand.
- **SeasonTable** — playoff result badges inline per season row (CONF=teal, FINALS=purple, CHAMP=gold); accolade badges; W/L footer.
- **Player journeys** — stints chained by trade nodes; `← Hist` (backward) and `Path →` (forward) buttons; inline stats panel per player in trade card.
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

### What's Remaining (Priority Order)

#### 1. FIX: Trade data quality + Rebuild player journey UX (IMMEDIATE — use James Harden as test case)

**Step 1a: Audit & fix trade data quality — ✅ COMPLETE**
- **Root cause found:** `import-trades.ts` misread the bipartite CSV format. CSV has `to`=received, `from`=sent, `action_team`=receiver — but the import assigned `from_team_id=action_team` (wrong; action_team is the RECEIVER) and ignored all `from` assets (sent side) entirely.
- **Scope:** ALL 1,552 CSV-imported trades (1976-2019) were broken. BBRef-scraped trades (2019+, 383 trades) and 6 curated sample trades were already correct.
- **Fix applied:** `scripts/fix-csv-trades.py` — re-processes the CSV bipartite graph with correct logic:
  - **Direction fix:** `to` assets go `other_team → action_team`; `from` assets go `action_team → other_team`
  - **Missing assets added:** both sides of every trade now recorded
  - **Pick detection:** value is a pick if ALL rows containing it in the trade group have `pick_involved=TRUE`
  - 1,526 trades patched; 9 obscure historical trades couldn't be matched (team name resolution failures, minor edge cases)
- **Verified:** Harden (OKC→HOU + Kevin Martin/Lamb/picks HOU→OKC ✓), KG (MIN→BOS + Jefferson/Green/picks BOS→MIN ✓), Kobe (Vlade LAL→CHA + Kobe CHA→LAL ✓), Pierce/KG to Brooklyn (both sides ✓)
- **Re-run the fix after any re-export:** If `export-existing-trades.ts` is re-run (rebuilds from Supabase), must also re-run `python3 scripts/fix-csv-trades.py` since Supabase data still has the original bug.

**Step 1b: Rebuild player journey UX (target flow)**
Using Harden as the reference implementation:
1. **Draft card** — first node: "Drafted by OKC, R1 Pick #3, 2009"
2. **Click player name on draft card** → slide-out panel or inline expansion showing all OKC seasons with stats & awards (NOT a modal — modals break spatial context)
3. **Trade card (collapsed by default)** — one-line summary: "Oct 27, 2012 · OKC → HOU · 5 players, 2 picks"
4. **Click trade card to expand** → shows all players/picks in the trade (BOTH sides)
5. **Click Harden in expanded trade** → stint panel for HOU seasons
6. **Click another player (e.g., Cole Aldrich)** → their trajectory appears in parallel column, aligned at the shared trade node (trade node is horizontal anchor, columns scroll independently above/below)
7. **Click that player's name in trade node** → see their stint stats
8. Line back to their column, showing next step in their trajectory
9. Continue down the timeline for each subsequent trade...

**Key UX decisions:**
- Stint details = slide-out panel or inline expansion, NOT modal popup
- Collapsed trade cards show: date · teams · player/pick count
- Parallel columns for secondary players with shared trade node as anchor
- Transactions are the organizing spine; seasons nest under stints; stints separated by trades

#### 2. FIX: Compact node sizing
- Current tiles/squares are too large — user has to scroll too far between nodes
- Make all node types smaller and more compact so more fits on one screen
- Should be intuitive and easy to follow without excessive scrolling

#### 3. ✅ DONE: Accolades fixed
- Root bug: `End of Season Teams.csv` has `number_tm` values `'1st'`/`'2nd'`/`'3rd'` but code compared `=== '1'`/`'2'`/`'3'`
- Fix: updated comparison in `import-accolades.ts`, wiped table, reimported 2,510 clean rows
- Table also had duplicates (INSERT run twice) — wipe before re-importing

#### 4. ✅ DONE: GitHub push + Vercel deployment
- Repo: https://github.com/wandebao/nba-trade-mapper
- Auto-deploys on push to main. Daily trade update via `.github/workflows/update-trades.yml`.

#### 5. ✅ DONE: Playoff results + Trade impact scoring
- `scrape-playoff-results.ts` — full bracket results in `team_seasons` (playoff_result + championship)
- `scrape-playoff-stats.ts` — playoff WS/PPG/BPM in `player_seasons` (migration 005)
- `score-trades.ts` — scores all 1,927 trades; upserts to `trade_scores` (migration 006)
- Trade verdict bar chart shown in expanded TradeNode UI (lazy-fetched, no RLS needed)

#### 6. (Optional) Salary/contract data
- `player_contracts` table exists but is empty. Could scrape HoopsHype.

### What's Remaining (Next Priorities)

#### 1. Compact node sizing (HIGH IMPACT)
- All node types are still too large — users scroll too far between nodes
- TradeNode: target ~180px wide, ~44px collapsed height
- PlayerStintNode: reduce padding, tighten stat rows
- Goal: fit 3–4 nodes in one viewport without zooming out

#### 2. Per-asset score in TradeNode UI
- `trade_scores.team_scores.assets[]` has per-player breakdown (ws, playoff_ws, championships, score) — not yet shown in UI
- Add each player's score next to their name in expanded trade card (e.g., `Wiggins  29.3`)
- Helps users understand WHY a team won the trade

#### 3. Winner badge on collapsed TradeNode
- Currently verdict only shows when card is expanded (lazy fetch on expand)
- To show on collapsed: fetch `trade_scores` inside `expandTradeNode` store action, store result in `TradeNodeData.tradeScore`
- Avoids fetching for every collapsed node on mount (only load when that trade is first interacted with)
- Show as small colored pill: `GSW ↑` in team color next to the `3P 2Pk` summary

#### 4. "Paved the way" chain (BIG FEATURE)
- Given a championship team/season, trace backward through all trades that built the roster
- Example: "How did GSW assemble the 2022 championship team?" → show the trade chains for Wiggins, Curry, Klay, Draymond
- Implementation: new UI entry point + backward graph traversal from a team's final roster
- Data is already all there (trade_scores, playoff_ws, championships) — this is purely a new graph traversal + UI

#### 5. Explore by trade score (DISCOVERY FEATURE)
- New panel or search mode: "most lopsided trades ever", "best picks hauls", "biggest steals"
- Query `trade_scores ORDER BY lopsidedness DESC` and display as a ranked list
- Clicking a result seeds the graph with that trade

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
│   ├── sample_data.sql               # 4 curated trade trees (already run)
│   ├── reset-and-create.sql          # DROP + recreate if needed
│   └── migrations/
│       ├── 001-player-seasons.sql    # player_seasons table (APPLIED)
│       ├── 002-player-contracts.sql  # player_contracts table (APPLIED)
│       ├── 003-accolades-player-name.sql # player_name col on accolades (APPLIED)
│       ├── 004-fix-trade-lineage-security.sql # (APPLIED)
│       ├── 005-playoff-stats.sql     # 8 playoff columns on player_seasons (APPLIED)
│       └── 006-trade-scores.sql      # trade_scores table (APPLIED)
├── data/
│   ├── trades.csv                    # 37K rows, source: svitkin/bball-trade-network
│   └── kaggle/                       # BBRef datasets (gitignored)
│       ├── Player Per Game.csv       # Per-game stats
│       ├── Advanced.csv              # Win shares, PER, VORP
│       ├── Player Award Shares.csv   # MVP, DPOY, ROY winners
│       ├── End of Season Teams.csv   # All-NBA, All-Defensive
│       ├── All-Star Selections.csv   # All-Star picks
│       └── Team Summaries.csv        # Team W/L, playoffs
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
│   │       ├── PlayerStintNode.tsx   # Career stint at one team (avg stats, accolades)
│   │       └── TransitionNode.tsx    # Connector between stints (traded/drafted/free-agency/waived)
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
- **player_contracts** — salary + contract type by season (EMPTY — not yet populated)

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
| `transition` | TransitionNodeData | 100-130x36-48 | Connector between stints (traded/drafted/FA/waived) |

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

### Journey Data Flow (CURRENT — needs rework, see "What's Remaining #1")
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
- **Repo**: https://github.com/wandebao/nba-trade-mapper
- **Status**: Pushed and deployed — auto-deploys on push to main

## Known Issues & Gotchas
1. **prosportstransactions.com is behind Cloudflare** — `scrape-trades.ts` doesn't work. BBRef scraper (`scrape-bbref-trades.ts`) is the replacement.
2. **Supabase DB direct connection fails** — pooler (port 6543) and direct (port 5432) both reject the service role key as password. Use Supabase SQL Editor directly for DDL.
3. **Kaggle CSV column names** — don't match what you'd expect. Always `head -1` the CSV first. See Data Sources section above. Key gotcha: `End of Season Teams.csv` stores `number_tm` as `'1st'`/`'2nd'`/`'3rd'` strings, not integers.
4. **player_contracts table is empty** — schema exists but no import script for salary data yet.
5. **BBRef rate limit** — scraper uses 3.1s delay per request. First run ~2 hours for full history. Cached in `data/bbref-cache/` so re-runs are instant.
6. **CSV trade direction bug** — `scripts/fix-csv-trades.py` fixes the JSON files; Supabase `transactions` table still has the original inversion. Re-run the fix script after any re-export.
7. **Supabase PostgREST row limit** — default 1000 rows per response. Always paginate with `.range(from, from+999)` and loop; break when `data.length < 1000`.
8. **`import-accolades.ts` uses INSERT** — will create duplicates if run twice. Always wipe `player_accolades` table first if re-running.
9. **BBRef BPM sentinel** — value -1000.0 means "negligible minutes"; must be treated as null (clamped in `parseNum(s, -999.99, 999.99)`).
10. **`database/sample_data.sql`** — legacy dead code. App reads trades from static JSON, not Supabase `transactions`. Safe to delete from repo.
11. **Robert Parish 1980 trade** (`1979-80.json`): Parish stored as `type: "pick"` but was an established player. Path button non-functional. Needs: change to `type: "player"`, add `pick_year: 1980` to the 3 actual picks.

## Data Quality Notes (Feb 2026)
- ✅ Trade direction fixed (fix-csv-trades.py) — all 1,535 CSV-era trades have correct sides
- ✅ NOP/CHA fixed — 50 New Orleans Hornets trades (2002-03 through 2012-13) corrected from CHA → NOP
- ✅ Pippen/Polynice 1987 — B.J. Armstrong / Sylvester Gray removed as pick names (those picks resolved elsewhere)
- ✅ All-NBA tiers fixed — tiers were all showing "3rd" due to CSV column comparison bug
- ✅ All team IDs validated — no legacy codes in any static JSON file
- ✅ Trade Tree `seedFromChain` fixed — only shows winning team stints, bridge players maintain chain connectivity
- ⚠️ Supabase `transactions` table still has original CSV direction bug — static JSON is source of truth
- ⚠️ `import-accolades.ts` uses INSERT — wipe table before re-running
- ⚠️ `database/sample_data.sql` is legacy dead code

## Next Session Priority
1. **Compact node sizing** — all nodes still too large (TradeNode, PlayerStintNode, PlayerNode). Start here.
2. **Per-asset score display** — show `team_scores.assets[].score` next to each player name in expanded TradeNode
3. **Winner badge on collapsed TradeNode** — fetch score in `expandTradeNode` store action, persist in `TradeNodeData`
4. **"Paved the way" chain** — trace backward from championship roster through founding trades
5. **Explore by trade score** — ranked list of most lopsided trades, seeding the graph on click

## Data Quality Notes (Feb 2026)
- ✅ Trade direction fixed (fix-csv-trades.py) — all 1,535 CSV-era trades have correct sides
- ✅ NOP/CHA fixed — 50 New Orleans Hornets trades (2002-03 through 2012-13) corrected from CHA → NOP
- ✅ Pippen/Polynice 1987 — B.J. Armstrong / Sylvester Gray removed as pick names (those picks resolved elsewhere)
- ✅ All-NBA tiers fixed — tiers were all showing "3rd" due to CSV column comparison bug
- ✅ All team IDs validated — no legacy codes in any static JSON file
- ⚠️ Supabase `transactions` table still has original CSV direction bug — static JSON is source of truth
- ⚠️ `import-accolades.ts` uses INSERT — wipe table before re-running
- ⚠️ `database/sample_data.sql` is legacy dead code
