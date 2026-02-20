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

### What Works
- **Graph UI built** — React Flow with search bar, click-to-expand, auto-layout (ELK.js)
- **5 node types**: TradeNode, PlayerNode, PickNode, PlayerStintNode, TransitionNode (SeasonDetailNode was deleted — season details now render inline within PlayerStintNode)
- **1,935 trades in static JSON** — 1,541 from Supabase (1976–Feb 2019) + 394 scraped from BBRef (Feb 2019–Feb 2026)
- **50 season files** in `public/data/trades/by-season/` (1976-77 through 2025-26) + search index
- **23,308 player-season stat rows** in Supabase (1976-present, from Kaggle BBRef)
- **2,510 player accolades** in Supabase (MVP, DPOY, ROY, MIP, Sixth Man, All-Star, All-NBA, All-Defensive, All-Rookie)
- **1,376 team-season records** in Supabase (W/L, playoff yes/no)
- **Build compiles cleanly** (`npm run build` passes)
- **Dev server runs** (`npm run dev` on localhost:3000)

### Static JSON Data Pipeline
The app reads trade data from static JSON files, NOT directly from Supabase at runtime.
Run these 3 scripts in order to populate `public/data/trades/by-season/`:

1. `npx tsx scripts/export-existing-trades.ts` — Supabase → static JSON (~30s)
2. `npx tsx scripts/scrape-bbref-trades.ts` — BBRef scrape Feb 2019–present (~2hrs first run, cached after)
3. `npx tsx scripts/enrich-picks.ts` — Add drafted player names from Kaggle CSV (~5s)

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

#### 3. FIX: Accolades/badges sanity check
- All-Star, MVP, All-NBA, and playoff labels may be incorrect
- Need to verify accolades display correctly on the right players/seasons
- Cross-reference against known data (e.g., Harden MVP 2018, All-Star appearances)

#### 4. GitHub push + Vercel deployment
- Repo exists at https://github.com/wandebao/nba-trade-mapper but not yet pushed

#### 5. (Optional) Salary/contract data
- `player_contracts` table exists but is empty. Could scrape HoopsHype.

#### 6. (Optional) Team season playoff results
- Currently only stores TRUE/FALSE (made playoffs or not), not specific round

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
│       └── 003-accolades-player-name.sql # player_name col on accolades (APPLIED)
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
│   ├── import-player-stats.ts        # Kaggle → player_seasons (ALREADY RUN, 23308 rows)
│   ├── import-accolades.ts           # Kaggle → player_accolades (ALREADY RUN, 2510 rows)
│   ├── import-team-seasons.ts        # Kaggle → team_seasons (ALREADY RUN, 1376 rows)
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
- `seedFromPlayer(playerName, teamId)` — loads player node, checks for journey data
- `expandTradeNode(tradeId)` — expands trade into player/pick child nodes
- `expandPlayerNode(nodeId)` — if player has season data → `expandPlayerJourney`, else → find related trades
- `expandPlayerJourney(playerName)` — groups seasons into team stints, creates stint chain
- `expandStintDetails(stintNodeId)` — expands stint into per-season cards with stats/record/awards

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
npx tsx scripts/import-accolades.ts            # Import awards/accolades from Kaggle
npx tsx scripts/import-team-seasons.ts         # Import team W/L from Kaggle
SUPABASE_ACCESS_TOKEN=xxx npx tsx scripts/run-migrations-api.ts  # Run SQL migrations via API
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
- **Status**: Not yet pushed

## Known Issues & Gotchas
1. **prosportstransactions.com is behind Cloudflare** — the scrape-trades.ts script doesn't work. BBRef scraper (`scrape-bbref-trades.ts`) is the replacement.
2. **Supabase DB direct connection fails** — pooler (port 6543) and direct (port 5432) both reject the service role key as password. Use Management API instead.
3. **Kaggle CSV column names** — don't match what you'd expect. Always `head -1` the CSV first. See Data Sources section above.
4. **player_contracts table is empty** — schema exists but no import script for salary data yet.
5. **Playoff results are basic** — team_seasons only stores "made playoffs" (TRUE/FALSE from CSV), not specific round. The 4 curated trade trees in sample_data.sql have specific results.
6. **BBRef rate limit** — scraper uses 3.1s delay per request. First run ~2 hours for full history. Results cached in `data/bbref-cache/` so re-runs are instant.

## Next Session Priority
1. ~~**Audit trade data quality**~~ ✅ DONE — systemic direction inversion found and fixed in all 1,526 CSV trades via `scripts/fix-csv-trades.py`
2. ~~**Fix Harden trade data**~~ ✅ DONE — fixed as part of full data fix above
3. **Rebuild `expandPlayerJourney()`** — draft node → collapsed trade cards → expandable stint panels → parallel columns for secondary players (START HERE NEXT)
4. **Compact node sizing** — shrink all node types so more fits on screen
5. **Accolades sanity check** — verify badges display correctly against known data
6. **Push to GitHub + deploy to Vercel**
