import { createClient } from '@supabase/supabase-js';

let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Missing Supabase environment variables');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Types matching our schema
export interface Team {
  id: string;
  name: string;
  city: string;
  color: string;
  secondary_color: string;
  conference: string;
  division: string;
}

export interface Transaction {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  season: string;
  significance: string;
  root_transaction_id: string | null;
  parent_transaction_id: string | null;
  generation: number;
  is_multi_team: boolean;
  group_id: string | null;
}

export interface TransactionTeam {
  id: string;
  transaction_id: string;
  team_id: string;
  role: string;
  teams?: Team;
}

export interface TransactionAsset {
  id: string;
  transaction_id: string;
  asset_type: string;
  player_name: string | null;
  pick_year: number | null;
  pick_round: number | null;
  original_team_id: string | null;
  from_team_id: string | null;
  to_team_id: string | null;
  became_player_name: string | null;
  status: string | null;
  notes: string | null;
}

export interface TradeWithDetails extends Transaction {
  transaction_teams: TransactionTeam[];
  transaction_assets: TransactionAsset[];
}

export interface PlayerSeason {
  id: string;
  player_name: string;
  team_id: string | null;
  season: string;
  gp: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  fg_pct: number | null;
  win_shares: number | null;
  per: number | null;
  vorp: number | null;
}

export interface PlayerContract {
  id: string;
  player_name: string;
  team_id: string | null;
  season: string;
  salary: number | null;
  contract_type: string | null;
}

export interface PlayerAccolade {
  id: string;
  player_id: string | null;
  player_name: string | null;
  accolade: string;
  season: string | null;
}

export interface TeamSeason {
  id: string;
  team_id: string;
  season: string;
  wins: number | null;
  losses: number | null;
  playoff_result: string | null;
  championship: boolean;
}

// ── Static JSON trade format ─────────────────────────────────────────
export interface StaticTradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string | null;
  to_team_id: string | null;
  pick_year: number | null;
  pick_round: number | null;
  original_team_id: string | null;
  became_player_name: string | null;
  notes: string | null;
}

export interface StaticTrade {
  id: string;
  date: string;
  season: string;
  title: string;
  description: string;
  is_multi_team: boolean;
  teams: { team_id: string; role: string }[];
  assets: StaticTradeAsset[];
}

export interface TradeSearchIndexEntry {
  id: string;
  date: string;
  season: string;
  title: string;
  teams: string[];
  players: string[];
}
