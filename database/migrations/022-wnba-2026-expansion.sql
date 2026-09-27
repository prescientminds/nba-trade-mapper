-- 2026 WNBA expansion: Toronto Tempo (new) and Portland Fire (revived; BBRef
-- treats it as the same franchise as the 2000-02 Fire, so it keeps W-POR).
-- Applied via supabase-js upsert on 2026-09-27.
INSERT INTO teams (id, name, city, color, secondary_color, conference, division, league) VALUES
  ('W-TOR', 'Toronto Tempo', 'Toronto',  '#441E36', '#B3C7E7', 'East', 'Eastern', 'WNBA'),
  ('W-POR', 'Portland Fire', 'Portland', '#C8102E', '#3F3735', 'West', 'Western', 'WNBA')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, city = EXCLUDED.city, color = EXCLUDED.color,
  secondary_color = EXCLUDED.secondary_color, conference = EXCLUDED.conference,
  division = EXCLUDED.division, league = EXCLUDED.league;
