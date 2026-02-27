-- Add salary-based trade value columns to trade_scores.
-- Populated by scripts/score-trade-salaries.ts

ALTER TABLE trade_scores
  ADD COLUMN IF NOT EXISTS total_salary_exchanged BIGINT,     -- Sum of all future contract $ moved in trade
  ADD COLUMN IF NOT EXISTS salary_winner TEXT,                  -- Team that received more contract value
  ADD COLUMN IF NOT EXISTS salary_details JSONB;
  -- salary_details schema:
  -- {
  --   "GSW": {
  --     "total": 280000000,          -- Total future salary received
  --     "cap_pct": 0.45,             -- Total as % of salary cap at time of trade
  --     "players": [
  --       {
  --         "name": "Andrew Wiggins",
  --         "salary_at_trade": 31579390,  -- Salary in trade season
  --         "future_salary": 94738170,    -- Sum of remaining contract
  --         "seasons_remaining": 3,
  --         "cap_pct": 0.24              -- Salary / cap at trade time
  --       }
  --     ]
  --   }
  -- }

CREATE INDEX IF NOT EXISTS idx_trade_scores_salary ON trade_scores (total_salary_exchanged DESC NULLS LAST);
