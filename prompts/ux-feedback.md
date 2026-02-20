# UX Feedback & Requirements

## Target User
NBA analysts, podcasters, and serious fans who want to trace trade lineage — "what happened to that pick?" / "who did that become?" / "what was the full ripple of that trade?"

## Core Experience Goal
Search a player or trade → see a clean, traceable graph of movements → follow any thread as deep as you want → understand the full impact and reverberations of any NBA trade.

---

## Current Problems (Priority Order)

### 1. Season sprawl (CRITICAL)
Expanding a stint creates separate SeasonDetailNode cards per season — one card per year, each 220x160px. A player with 8 seasons on one team generates 8 floating cards. A fully expanded Harden journey = 35+ nodes on canvas.

**Required:** Seasons must render INSIDE the stint card (as rows or a compact inline list), NOT as separate graph nodes. Clicking a stint should expand it in-place, not spawn new nodes across the canvas.

### 2. Global re-layout destroys user context
Every expand action calls ELK on the ENTIRE graph and repositions ALL nodes. Combined with `fitView()` firing on every node addition, each click causes the whole canvas to reorganize and zoom-reset. Users lose their place constantly.

**Required:** Local layout only — new nodes position relative to their parent without moving existing nodes. Remove or debounce the fitView auto-trigger.

### 3. Inconsistent entry flows
- Selecting a **player** immediately populates a rich journey graph
- Selecting a **trade** shows an empty canvas with a panel — user must click assets one by one

**Required:** Selecting a trade should auto-expand its assets into the graph, same as selecting a player auto-expands the journey.

### 4. Trade lineage is broken for real data
`expandTradeNode` checks Supabase `parent_transaction_id` for downstream trades, but lineage fields are only populated for 4 sample trades. For all 1,935 real trades, it always falls through to showing assets as leaf nodes — no multi-generational chain exploration.

**Required:** Either populate lineage data for all trades, or find downstream trades by matching assets (if a pick from Trade A appears in Trade B, they're linked).

### 5. Transition nodes always say "Free Agency"
The store hardcodes `'free-agency'` for all transition types. Drafted, waived, and unknown transitions all display incorrectly.

**Required:** Detect actual transition type from data context (draft year match = drafted, etc).

### 6. `hasJourneyData` flag computed but never shown
PlayerNode stores whether journey data exists but the component never renders it. Users can't tell before clicking whether they'll get a full career or just trade references.

**Required:** Visual indicator (dot, icon, or label) on player nodes that have full journey data.

### 7. Nodes too large
All node types consume excessive screen real estate. PlayerStintNode = 240x120, SeasonDetailNode = 220x160, TradeNode = 240x120. Users scroll/pan constantly.

**Required:** Shrink all node types. Stint cards should be compact summary rows. Trade nodes should be tight.

### 8. Impact indicators missing or unverified
- Playoff depth: only stores TRUE/FALSE (made playoffs), not round reached
- Accolades need verification (e.g., Harden MVP 2018, All-Star appearances)
- No visual hierarchy for accolade importance (MVP vs All-NBA 3rd team)
- No "trade impact summary" — can't see aggregate value each side got from a trade

**Required:** Playoff round data, verified accolades with visual weight hierarchy, trade impact roll-up.

### 9. ELK size estimates cause overlap
ELK assumes fixed heights (e.g., 120px for stints) but `minHeight` nodes can render taller when accolades are present. Nodes visually overlap.

**Required:** Either measure actual rendered heights or add padding buffer to ELK estimates.

### 10. Sequential async fetches in journey build
`findTradeBetweenStints` runs sequentially per inter-stint gap. A player with 6 stints = 5 sequential JSON fetches.

**Required:** Parallelize with `Promise.all`.

---

## Design Principles

1. **Team = organizing principle for careers.** Never scatter seasons as separate nodes.
2. **Transactions = spine.** Trades and free agency connect stints in a readable timeline.
3. **Compact by default, detail on demand.** Stint cards show summary. Click to expand seasons inline.
4. **Impact is visible.** Accolade badges, win contributions, and playoff depth scannable at a glance.
5. **Every node invites a next click.** Dead ends = failure.
6. **Minimize canvas sprawl.** Dense, readable information > big pretty cards.
7. **Don't move what the user already placed.** Expanding new nodes must not reorganize existing layout.

---

## Future Vision
- AI layer: longest trade lineage, highest-impact sleeper trade, compare trade outcomes
- Trade impact summary: aggregate win shares, championships, All-Stars per side
- Shareable graph snapshots for podcasts/articles
- Salary/contract overlay for cap analysis
