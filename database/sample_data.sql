-- ═══════════════════════════════════════════════════════════════════════════════
-- NBA TRADE IMPACT MAPPER - Sample Historic Trades
-- Run this AFTER schema.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- KEY PLAYERS
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO players (id, name, bbref_id, current_team_id, position, draft_year, draft_round, draft_pick, is_active) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Shai Gilgeous-Alexander', 'gilMDC01', 'OKC', 'PG', 2018, 1, 11, true),
  ('11111111-1111-1111-1111-111111111102', 'Paul George', 'georgpa01', 'PHI', 'SF', 2010, 1, 10, true),
  ('11111111-1111-1111-1111-111111111103', 'Jalen Williams', 'willija06', 'OKC', 'SF', 2022, 1, 12, true),
  ('11111111-1111-1111-1111-111111111104', 'Luka Dončić', 'doncilu01', 'LAL', 'PG', 2018, 1, 3, true),
  ('11111111-1111-1111-1111-111111111105', 'Trae Young', 'youngtr01', 'WAS', 'PG', 2018, 1, 5, true),
  ('11111111-1111-1111-1111-111111111106', 'Kawhi Leonard', 'leonaka01', 'LAC', 'SF', 2011, 1, 15, true),
  ('11111111-1111-1111-1111-111111111107', 'Anthony Davis', 'davisan02', 'DAL', 'PF', 2012, 1, 1, true),
  ('11111111-1111-1111-1111-111111111108', 'James Harden', 'hardeja01', 'LAC', 'SG', 2009, 1, 3, true),
  ('11111111-1111-1111-1111-111111111109', 'Kevin Durant', 'duranke01', 'PHX', 'SF', 2007, 1, 2, true),
  ('11111111-1111-1111-1111-111111111110', 'DeMar DeRozan', 'derozde01', 'SAC', 'SG', 2009, 1, 9, true),
  ('11111111-1111-1111-1111-111111111111', 'Brandon Ingram', 'ingrabr01', 'NOP', 'SF', 2016, 1, 2, true),
  ('11111111-1111-1111-1111-111111111112', 'Danilo Gallinari', 'gallida01', NULL, 'PF', 2008, 1, 6, false),
  ('11111111-1111-1111-1111-111111111113', 'Cam Reddish', 'reddica01', 'LAL', 'SF', 2019, 1, 10, true),
  ('11111111-1111-1111-1111-111111111114', 'Mikal Bridges', 'bridgmi01', 'NYK', 'SF', 2018, 1, 10, true),
  ('11111111-1111-1111-1111-111111111115', 'Dillon Jones', 'jonesdi01', 'OKC', 'SF', 2024, 1, 26, true),
  ('11111111-1111-1111-1111-111111111116', 'Tre Mann', 'manntr01', 'CHA', 'PG', 2021, 1, 18, true)
ON CONFLICT (id) DO NOTHING;

-- Player accolades
INSERT INTO player_accolades (player_id, accolade, season) VALUES
  ('11111111-1111-1111-1111-111111111101', 'MVP', '2024-25'),
  ('11111111-1111-1111-1111-111111111101', 'Finals MVP', '2024-25'),
  ('11111111-1111-1111-1111-111111111101', 'Champion', '2024-25'),
  ('11111111-1111-1111-1111-111111111101', 'All-Star', '2022-23'),
  ('11111111-1111-1111-1111-111111111101', 'All-Star', '2023-24'),
  ('11111111-1111-1111-1111-111111111101', 'All-Star', '2024-25'),
  ('11111111-1111-1111-1111-111111111101', 'All-Star', '2025-26'),
  ('11111111-1111-1111-1111-111111111103', 'All-Star', '2023-24'),
  ('11111111-1111-1111-1111-111111111103', 'All-Star', '2024-25'),
  ('11111111-1111-1111-1111-111111111103', 'Champion', '2024-25'),
  ('11111111-1111-1111-1111-111111111104', 'All-Star', '2019-20'),
  ('11111111-1111-1111-1111-111111111104', 'All-Star', '2020-21'),
  ('11111111-1111-1111-1111-111111111104', 'All-Star', '2021-22'),
  ('11111111-1111-1111-1111-111111111104', 'All-Star', '2022-23'),
  ('11111111-1111-1111-1111-111111111104', 'All-Star', '2023-24'),
  ('11111111-1111-1111-1111-111111111105', 'All-Star', '2019-20'),
  ('11111111-1111-1111-1111-111111111105', 'All-Star', '2021-22'),
  ('11111111-1111-1111-1111-111111111105', 'All-Star', '2023-24'),
  ('11111111-1111-1111-1111-111111111102', 'All-Star', '2013-14'),
  ('11111111-1111-1111-1111-111111111102', 'All-Star', '2015-16'),
  ('11111111-1111-1111-1111-111111111102', 'All-Star', '2016-17'),
  ('11111111-1111-1111-1111-111111111102', 'All-Star', '2017-18'),
  ('11111111-1111-1111-1111-111111111102', 'All-Star', '2018-19'),
  ('11111111-1111-1111-1111-111111111102', 'All-Star', '2019-20'),
  ('11111111-1111-1111-1111-111111111102', 'All-Star', '2020-21'),
  ('11111111-1111-1111-1111-111111111102', 'All-Star', '2023-24'),
  ('11111111-1111-1111-1111-111111111102', 'All-Star', '2024-25')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PAUL GEORGE TRADE (2019) - Root trade
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO transactions (id, date, type, title, description, season, significance, generation) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2019-07-10', 'trade', 'Paul George Trade',
   'Clippers acquire Paul George from Thunder in blockbuster deal. OKC receives SGA plus historic haul of 5 first-round picks and 2 pick swaps that launched their championship rebuild.',
   '2019-20', 'historic', 0);

INSERT INTO transaction_teams (transaction_id, team_id, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'LAC', 'receiver'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OKC', 'sender');

INSERT INTO transaction_assets (transaction_id, asset_type, player_id, player_name, from_team_id, to_team_id, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'player', '11111111-1111-1111-1111-111111111102', 'Paul George', 'OKC', 'LAC', 'conveyed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'player', '11111111-1111-1111-1111-111111111101', 'Shai Gilgeous-Alexander', 'LAC', 'OKC', 'conveyed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'player', '11111111-1111-1111-1111-111111111112', 'Danilo Gallinari', 'LAC', 'OKC', 'conveyed');

INSERT INTO transaction_assets (transaction_id, asset_type, pick_year, pick_round, original_team_id, from_team_id, to_team_id, became_player_id, became_player_name, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pick', 2021, 1, 'MIA', 'LAC', 'OKC', '11111111-1111-1111-1111-111111111116', 'Tre Mann', 'conveyed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pick', 2022, 1, 'LAC', 'LAC', 'OKC', '11111111-1111-1111-1111-111111111103', 'Jalen Williams', 'conveyed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pick', 2024, 1, 'LAC', 'LAC', 'OKC', '11111111-1111-1111-1111-111111111115', 'Dillon Jones', 'conveyed'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pick', 2026, 1, 'LAC', 'LAC', 'OKC', NULL, NULL, 'pending');

INSERT INTO transaction_assets (transaction_id, asset_type, swap_year, swap_teams, from_team_id, to_team_id, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'swap', 2023, ARRAY['LAC', 'OKC'], 'LAC', 'OKC', 'not exercised'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'swap', 2025, ARRAY['LAC', 'OKC'], 'LAC', 'OKC', 'exercised');

-- Downstream: SGA Max Extension
INSERT INTO transactions (id, date, type, title, description, season, significance, root_transaction_id, parent_transaction_id, generation) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '2021-08-10', 'extension', 'SGA Max Extension',
   'Thunder sign Shai Gilgeous-Alexander to 5-year, $173M max extension, cementing him as franchise cornerstone.',
   '2021-22', 'major', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1);

INSERT INTO transaction_teams (transaction_id, team_id, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'OKC', 'receiver');

INSERT INTO transaction_assets (transaction_id, asset_type, player_id, player_name, to_team_id, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'player', '11111111-1111-1111-1111-111111111101', 'Shai Gilgeous-Alexander', 'OKC', 'signed');

-- Downstream: 2022 Pick becomes Jalen Williams
INSERT INTO transactions (id, date, type, title, description, season, significance, root_transaction_id, parent_transaction_id, generation) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '2022-06-23', 'draft', '2022 Draft: Jalen Williams',
   'Thunder select Jalen Williams with 12th pick (via LAC from PG trade). Williams becomes All-Star and key piece of championship team.',
   '2022-23', 'major', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1);

INSERT INTO transaction_teams (transaction_id, team_id, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'OKC', 'receiver');

INSERT INTO transaction_assets (transaction_id, asset_type, player_id, player_name, to_team_id, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'player', '11111111-1111-1111-1111-111111111103', 'Jalen Williams', 'OKC', 'drafted');

-- Downstream: OKC wins championship
INSERT INTO transactions (id, date, type, title, description, season, significance, root_transaction_id, parent_transaction_id, generation) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '2025-06-15', 'achievement', 'OKC Wins 2025 Championship',
   'Thunder win NBA Championship with SGA as Finals MVP and Jalen Williams as key contributor - both acquired from PG trade.',
   '2024-25', 'historic', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 2);

INSERT INTO transaction_teams (transaction_id, team_id, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'OKC', 'receiver');

-- ═══════════════════════════════════════════════════════════════════════════════
-- LUKA/TRAE DRAFT SWAP (2018) - Root trade
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO transactions (id, date, type, title, description, season, significance, generation) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2018-06-21', 'trade', 'Luka/Trae Draft Swap',
   'On draft night, Hawks trade #3 pick (Luka Dončić) to Mavericks for #5 pick (Trae Young) and a future first. Both stars have now been traded to new teams.',
   '2018-19', 'historic', 0);

INSERT INTO transaction_teams (transaction_id, team_id, role) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'DAL', 'receiver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ATL', 'sender');

INSERT INTO transaction_assets (transaction_id, asset_type, player_id, player_name, from_team_id, to_team_id, status, notes) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'player', '11111111-1111-1111-1111-111111111104', 'Luka Dončić', 'ATL', 'DAL', 'conveyed', 'Draft pick #3'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'player', '11111111-1111-1111-1111-111111111105', 'Trae Young', 'DAL', 'ATL', 'conveyed', 'Draft pick #5');

INSERT INTO transaction_assets (transaction_id, asset_type, pick_year, pick_round, original_team_id, from_team_id, to_team_id, became_player_id, became_player_name, status, protections) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pick', 2019, 1, 'DAL', 'DAL', 'ATL', '11111111-1111-1111-1111-111111111113', 'Cam Reddish', 'conveyed', '{"type": "top", "value": 5}');

-- Downstream: Luka to Lakers
INSERT INTO transactions (id, date, type, title, description, season, significance, root_transaction_id, parent_transaction_id, generation) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '2025-02-06', 'trade', 'Luka Dončić to Lakers',
   'Mavericks trade Luka Dončić to Lakers for Anthony Davis and future picks. The 2018 draft swap saga continues.',
   '2024-25', 'historic', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1);

INSERT INTO transaction_teams (transaction_id, team_id, role) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'LAL', 'receiver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'DAL', 'sender');

INSERT INTO transaction_assets (transaction_id, asset_type, player_id, player_name, from_team_id, to_team_id, status) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'player', '11111111-1111-1111-1111-111111111104', 'Luka Dončić', 'DAL', 'LAL', 'conveyed'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'player', '11111111-1111-1111-1111-111111111107', 'Anthony Davis', 'LAL', 'DAL', 'conveyed');

INSERT INTO transaction_assets (transaction_id, asset_type, pick_year, pick_round, original_team_id, from_team_id, to_team_id, status) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'pick', 2029, 1, 'LAL', 'LAL', 'DAL', 'pending'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'pick', 2031, 1, 'LAL', 'LAL', 'DAL', 'pending');

-- Downstream: Trae to Wizards
INSERT INTO transactions (id, date, type, title, description, season, significance, root_transaction_id, parent_transaction_id, generation) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '2026-01-08', 'trade', 'Trae Young to Wizards',
   'Hawks trade Trae Young to Washington for Bilal Coulibaly and draft picks. Both 2018 swap players now on their second teams.',
   '2025-26', 'major', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1);

INSERT INTO transaction_teams (transaction_id, team_id, role) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'WAS', 'receiver'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'ATL', 'sender');

INSERT INTO transaction_assets (transaction_id, asset_type, player_id, player_name, from_team_id, to_team_id, status) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'player', '11111111-1111-1111-1111-111111111105', 'Trae Young', 'ATL', 'WAS', 'conveyed');

INSERT INTO transaction_assets (transaction_id, asset_type, pick_year, pick_round, original_team_id, from_team_id, to_team_id, status) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'pick', 2026, 1, 'WAS', 'WAS', 'ATL', 'pending'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'pick', 2028, 1, 'WAS', 'WAS', 'ATL', 'pending');

-- ═══════════════════════════════════════════════════════════════════════════════
-- KAWHI LEONARD TO RAPTORS (2018)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO transactions (id, date, type, title, description, season, significance, generation) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '2018-07-18', 'trade', 'Kawhi Leonard to Raptors',
   'Spurs trade disgruntled Kawhi to Toronto. The gamble pays off with 2019 championship, then Kawhi leaves in free agency.',
   '2018-19', 'historic', 0);

INSERT INTO transaction_teams (transaction_id, team_id, role) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'TOR', 'receiver'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'SAS', 'sender');

INSERT INTO transaction_assets (transaction_id, asset_type, player_id, player_name, from_team_id, to_team_id, status) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'player', '11111111-1111-1111-1111-111111111106', 'Kawhi Leonard', 'SAS', 'TOR', 'conveyed'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'player', '11111111-1111-1111-1111-111111111110', 'DeMar DeRozan', 'TOR', 'SAS', 'conveyed');

-- Downstream: Raptors win championship
INSERT INTO transactions (id, date, type, title, description, season, significance, root_transaction_id, parent_transaction_id, generation) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', '2019-06-13', 'achievement', 'Raptors Win 2019 Championship',
   'Toronto wins first championship in franchise history. Kawhi Leonard wins Finals MVP.',
   '2018-19', 'historic', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1);

INSERT INTO transaction_teams (transaction_id, team_id, role) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'TOR', 'receiver');

-- ═══════════════════════════════════════════════════════════════════════════════
-- ANTHONY DAVIS TO LAKERS (2019)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO transactions (id, date, type, title, description, season, significance, generation) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '2019-06-15', 'trade', 'Anthony Davis to Lakers',
   'Pelicans trade AD to Los Angeles for young core plus picks. Lakers win 2020 championship, then trade AD to Dallas in 2025.',
   '2019-20', 'historic', 0);

INSERT INTO transaction_teams (transaction_id, team_id, role) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'LAL', 'receiver'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'NOP', 'sender');

INSERT INTO transaction_assets (transaction_id, asset_type, player_id, player_name, from_team_id, to_team_id, status) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'player', '11111111-1111-1111-1111-111111111107', 'Anthony Davis', 'NOP', 'LAL', 'conveyed'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'player', '11111111-1111-1111-1111-111111111111', 'Brandon Ingram', 'LAL', 'NOP', 'conveyed');

INSERT INTO transaction_assets (transaction_id, asset_type, pick_year, pick_round, original_team_id, from_team_id, to_team_id, status) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pick', 2021, 1, 'LAL', 'LAL', 'NOP', 'conveyed'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pick', 2024, 1, 'LAL', 'LAL', 'NOP', 'conveyed');

-- Downstream: Lakers win 2020 championship
INSERT INTO transactions (id, date, type, title, description, season, significance, root_transaction_id, parent_transaction_id, generation) VALUES
  ('dddddddd-dddd-dddd-dddd-ddddddddddd1', '2020-10-11', 'achievement', 'Lakers Win 2020 Championship',
   'Lakers win championship in the bubble. LeBron wins Finals MVP, AD is co-star.',
   '2019-20', 'historic', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 1);

INSERT INTO transaction_teams (transaction_id, team_id, role) VALUES
  ('dddddddd-dddd-dddd-dddd-ddddddddddd1', 'LAL', 'receiver');

-- ═══════════════════════════════════════════════════════════════════════════════
-- TEAM SEASONS (for outcome tracking)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO team_seasons (team_id, season, wins, losses, playoff_result, championship) VALUES
  -- OKC post-PG trade
  ('OKC', '2019-20', 44, 28, 'R1', false),
  ('OKC', '2020-21', 22, 50, NULL, false),
  ('OKC', '2021-22', 24, 58, NULL, false),
  ('OKC', '2022-23', 40, 42, NULL, false),
  ('OKC', '2023-24', 57, 25, 'R2', false),
  ('OKC', '2024-25', 64, 18, 'Champion', true),
  -- LAC post-PG trade
  ('LAC', '2019-20', 49, 23, 'R2', false),
  ('LAC', '2020-21', 47, 25, 'CF', false),
  ('LAC', '2021-22', 42, 40, 'R1', false),
  ('LAC', '2022-23', 44, 38, 'R1', false),
  ('LAC', '2023-24', 51, 31, 'R1', false),
  -- TOR post-Kawhi trade
  ('TOR', '2018-19', 58, 24, 'Champion', true),
  -- LAL post-AD trade
  ('LAL', '2019-20', 52, 19, 'Champion', true)
ON CONFLICT (team_id, season) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE! Sample data inserted.
-- ═══════════════════════════════════════════════════════════════════════════════
