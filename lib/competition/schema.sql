-- Adrena Prop Challenge Hub — Database Schema
-- Version 1.0 | March 2026
--
-- Designed for PostgreSQL ≥ 15. Apply with:
--   psql -U postgres -d adrena_competition -f schema.sql

-- ── Challenges ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet          TEXT NOT NULL,
  tier_id         TEXT NOT NULL CHECK (tier_id IN ('scout','ranger','veteran','elite','apex')),
  specialist_type TEXT CHECK (specialist_type IN ('forex','commodities','crypto','multi_asset')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','passed','failed','expired')),
  entry_fee_usd   NUMERIC(10,2) NOT NULL,
  starting_equity NUMERIC(14,2) NOT NULL,
  current_equity  NUMERIC(14,2) NOT NULL,
  high_water_mark NUMERIC(14,2) NOT NULL,
  max_drawdown_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  daily_loss_pct  NUMERIC(6,2) NOT NULL DEFAULT 0,
  pnl_pct         NUMERIC(8,4) NOT NULL DEFAULT 0,
  trade_count     INTEGER NOT NULL DEFAULT 0,
  active_days     INTEGER NOT NULL DEFAULT 0,
  attempt_number  INTEGER NOT NULL DEFAULT 1,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  fail_reason     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_challenges_wallet ON challenges (wallet);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges (status);
CREATE INDEX IF NOT EXISTS idx_challenges_tier ON challenges (tier_id);

-- ── World Cup Seasons ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_seasons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','qualifying','knockout','finals','closed')),
  qualifying_start TIMESTAMPTZ NOT NULL,
  qualifying_end   TIMESTAMPTZ NOT NULL,
  finals_start     TIMESTAMPTZ,
  finals_end       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── World Cup Registrations ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_registrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL REFERENCES worldcup_seasons(season_id),
  wallet          TEXT NOT NULL,
  division        TEXT NOT NULL CHECK (division IN ('crypto','metals','energy','forex')),
  desk_id         TEXT,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, wallet)
);

CREATE INDEX IF NOT EXISTS idx_wc_reg_season ON worldcup_registrations (season_id);
CREATE INDEX IF NOT EXISTS idx_wc_reg_wallet ON worldcup_registrations (wallet);

-- ── World Cup Matches ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL REFERENCES worldcup_seasons(season_id),
  round           TEXT NOT NULL CHECK (round IN ('qualifying','group','round-of-16','quarterfinal','semifinal','final','third-place','redemption')),
  division        TEXT NOT NULL,
  left_wallet     TEXT NOT NULL,
  right_wallet    TEXT NOT NULL,
  left_raroi      NUMERIC(10,2),
  right_raroi     NUMERIC(10,2),
  winner_wallet   TEXT,
  margin          NUMERIC(10,2),
  group_id        TEXT,
  matchday        INTEGER,
  is_overtime     BOOLEAN NOT NULL DEFAULT FALSE,
  is_penalty_shootout BOOLEAN NOT NULL DEFAULT FALSE,
  twist_market    TEXT,
  power_ups_used  JSONB DEFAULT '[]',
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc_matches_season ON worldcup_matches (season_id);
CREATE INDEX IF NOT EXISTS idx_wc_matches_round ON worldcup_matches (round);
CREATE INDEX IF NOT EXISTS idx_wc_matches_group ON worldcup_matches (group_id);

-- ── World Cup Groups ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL REFERENCES worldcup_seasons(season_id),
  group_id        TEXT NOT NULL,
  label           TEXT NOT NULL,
  division        TEXT NOT NULL CHECK (division IN ('crypto','metals','energy','forex')),
  is_group_of_death BOOLEAN NOT NULL DEFAULT FALSE,
  seed_strength   NUMERIC(6,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, group_id)
);

-- ── World Cup Group Members ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_group_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL REFERENCES worldcup_seasons(season_id),
  group_id        TEXT NOT NULL,
  wallet          TEXT NOT NULL,
  qualifying_rank INTEGER NOT NULL,
  UNIQUE (season_id, group_id, wallet)
);

-- ── World Cup Group Standings ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_group_standings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL REFERENCES worldcup_seasons(season_id),
  group_id        TEXT NOT NULL,
  wallet          TEXT NOT NULL,
  played          INTEGER NOT NULL DEFAULT 0,
  won             INTEGER NOT NULL DEFAULT 0,
  drawn           INTEGER NOT NULL DEFAULT 0,
  lost            INTEGER NOT NULL DEFAULT 0,
  points          INTEGER NOT NULL DEFAULT 0,
  raroi_for       NUMERIC(10,2) NOT NULL DEFAULT 0,
  raroi_against   NUMERIC(10,2) NOT NULL DEFAULT 0,
  raroi_difference NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_volume    NUMERIC(14,2) NOT NULL DEFAULT 0,
  qualified       BOOLEAN NOT NULL DEFAULT FALSE,
  group_winner    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, group_id, wallet)
);

-- ── World Cup Captain's Picks ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_captains_picks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL REFERENCES worldcup_seasons(season_id),
  division        TEXT NOT NULL,
  picker_wallet   TEXT NOT NULL,
  picked_opponent TEXT NOT NULL,
  pick_order      INTEGER NOT NULL,
  reasoning       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── World Cup Power-ups ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_powerups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL REFERENCES worldcup_seasons(season_id),
  wallet          TEXT NOT NULL,
  powerup_id      TEXT NOT NULL CHECK (powerup_id IN ('mulligan','double-points','market-swap','overtime-shield')),
  earned_by       TEXT NOT NULL,
  used_in_match   UUID REFERENCES worldcup_matches(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── World Cup Golden Trades ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_golden_trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL REFERENCES worldcup_seasons(season_id),
  wallet          TEXT NOT NULL,
  market          TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('long','short')),
  pnl_usd         NUMERIC(14,2) NOT NULL,
  pnl_percent     NUMERIC(10,4) NOT NULL,
  leverage        NUMERIC(6,2) NOT NULL,
  match_context   TEXT,
  trade_at        TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── World Cup Crowd Votes ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_crowd_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL REFERENCES worldcup_seasons(season_id),
  match_id        UUID REFERENCES worldcup_matches(id),
  voter_wallet    TEXT NOT NULL,
  voted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, voter_wallet)
);

-- ── World Cup Rivalries ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_rivalries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_a        TEXT NOT NULL,
  wallet_b        TEXT NOT NULL,
  wins            INTEGER NOT NULL DEFAULT 0,
  losses          INTEGER NOT NULL DEFAULT 0,
  draws           INTEGER NOT NULL DEFAULT 0,
  total_meetings  INTEGER NOT NULL DEFAULT 0,
  last_season     TEXT,
  narrative_tag   TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_a, wallet_b)
);

-- ── World Cup Narrative Beats ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_narrative_beats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL REFERENCES worldcup_seasons(season_id),
  beat_type       TEXT NOT NULL,
  headline        TEXT NOT NULL,
  subtext         TEXT,
  severity        TEXT NOT NULL CHECK (severity IN ('normal','hype','legendary')),
  beat_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── World Cup Market Twists ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worldcup_market_twists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       TEXT NOT NULL REFERENCES worldcup_seasons(season_id),
  round           TEXT NOT NULL,
  market          TEXT NOT NULL,
  label           TEXT NOT NULL,
  description     TEXT NOT NULL,
  announced_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Trade Events ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet          TEXT NOT NULL,
  market          TEXT NOT NULL,
  asset_class     TEXT NOT NULL CHECK (asset_class IN ('crypto','metals','energy','forex')),
  direction       TEXT NOT NULL CHECK (direction IN ('long','short')),
  size_usd        NUMERIC(14,2) NOT NULL,
  entry_price     NUMERIC(18,8) NOT NULL,
  exit_price      NUMERIC(18,8),
  pnl_usd         NUMERIC(14,2),
  leverage        NUMERIC(6,2) NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','close','liquidate')),
  opened_at       TIMESTAMPTZ NOT NULL,
  closed_at       TIMESTAMPTZ,
  tx_signature    TEXT,
  challenge_id    UUID REFERENCES challenges(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_events_wallet ON trade_events (wallet);
CREATE INDEX IF NOT EXISTS idx_trade_events_market ON trade_events (market);
CREATE INDEX IF NOT EXISTS idx_trade_events_challenge ON trade_events (challenge_id);
CREATE INDEX IF NOT EXISTS idx_trade_events_opened ON trade_events (opened_at);

-- ══════════════════════════════════════════════════════════════════════════════
-- Prop Firm Challenge Social & Competitive Tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Challenge Risk Events ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_risk_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       TEXT NOT NULL,
  event_id        TEXT NOT NULL CHECK (event_id IN ('flash_crash','liquidity_drain','volatility_spike','forced_market','correlation_break','news_blackout','leverage_cap','spread_widening')),
  severity        TEXT NOT NULL CHECK (severity IN ('mild','moderate','severe')),
  affected_metric TEXT NOT NULL,
  modifier        NUMERIC(6,4) NOT NULL,
  duration_hours  INTEGER NOT NULL,
  triggered_at    TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_events_cohort ON challenge_risk_events (cohort_id);

-- ── Challenge Matchups ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_matchups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       TEXT NOT NULL,
  trader_a        TEXT NOT NULL,
  trader_b        TEXT NOT NULL,
  window_start    TIMESTAMPTZ NOT NULL,
  window_end      TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','completed')),
  winner_wallet   TEXT,
  margin_pnl      NUMERIC(10,2),
  margin_score    NUMERIC(10,2),
  is_draw         BOOLEAN NOT NULL DEFAULT FALSE,
  risk_event_id   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matchups_cohort ON challenge_matchups (cohort_id);
CREATE INDEX IF NOT EXISTS idx_matchups_status ON challenge_matchups (status);

-- ── Challenge Desks ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_desks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  desk_id         TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  motto           TEXT NOT NULL,
  tier_id         TEXT NOT NULL CHECK (tier_id IN ('scout','ranger','veteran','elite','apex')),
  specialist_type TEXT CHECK (specialist_type IN ('forex','commodities','crypto','multi_asset')),
  captain_wallet  TEXT,
  supporters      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Challenge Desk Members ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_desk_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  desk_id         TEXT NOT NULL,
  wallet          TEXT NOT NULL,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (desk_id, wallet)
);

CREATE INDEX IF NOT EXISTS idx_desk_members_desk ON challenge_desk_members (desk_id);
CREATE INDEX IF NOT EXISTS idx_desk_members_wallet ON challenge_desk_members (wallet);

-- ── Funded Trader Profiles ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS funded_trader_profiles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet                    TEXT NOT NULL UNIQUE,
  current_level             TEXT NOT NULL CHECK (current_level IN ('watchlist','funded','senior_funded','captain','partner')),
  season_points             INTEGER NOT NULL DEFAULT 0,
  consecutive_eligible_weeks INTEGER NOT NULL DEFAULT 0,
  best_finish               INTEGER NOT NULL DEFAULT 99,
  capital_allocated         NUMERIC(14,2) NOT NULL DEFAULT 0,
  promotion_progress        NUMERIC(6,3) NOT NULL DEFAULT 0,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funded_profiles_level ON funded_trader_profiles (current_level);

-- ── Funded Level Transitions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS funded_level_transitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet          TEXT NOT NULL,
  from_level      TEXT NOT NULL,
  to_level        TEXT NOT NULL,
  reason          TEXT NOT NULL,
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funded_transitions_wallet ON funded_level_transitions (wallet);

-- ── Capital Allocations ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS capital_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet          TEXT NOT NULL,
  level           TEXT NOT NULL CHECK (level IN ('watchlist','funded','senior_funded','captain','partner')),
  allocated_usd   NUMERIC(14,2) NOT NULL,
  max_drawdown_usd NUMERIC(14,2) NOT NULL,
  revenue_share_bps INTEGER NOT NULL,
  allocated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capital_alloc_wallet ON capital_allocations (wallet);

-- ── Challenge Spectator Votes ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_spectator_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL,
  voter_wallet    TEXT NOT NULL,
  voted_for       TEXT NOT NULL,
  voted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, voter_wallet)
);

CREATE INDEX IF NOT EXISTS idx_spectator_votes_match ON challenge_spectator_votes (match_id);

-- ── Challenge Rivalries ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_rivalries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_a        TEXT NOT NULL,
  wallet_b        TEXT NOT NULL,
  meetings        INTEGER NOT NULL DEFAULT 0,
  a_wins          INTEGER NOT NULL DEFAULT 0,
  b_wins          INTEGER NOT NULL DEFAULT 0,
  draws           INTEGER NOT NULL DEFAULT 0,
  narrative_tag   TEXT,
  intensity       INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_a, wallet_b)
);

-- ── Challenge Narrative Beats ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_narrative_beats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       TEXT NOT NULL,
  beat_type       TEXT NOT NULL,
  headline        TEXT NOT NULL,
  subtext         TEXT,
  severity        TEXT NOT NULL CHECK (severity IN ('normal','hype','legendary')),
  beat_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_narrative_beats_cohort ON challenge_narrative_beats (cohort_id);

-- ── Challenge Golden Trades ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_golden_trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       TEXT NOT NULL,
  trader_id       TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  market          TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('long','short')),
  pnl_usd         NUMERIC(14,2) NOT NULL,
  pnl_percent     NUMERIC(10,4) NOT NULL,
  leverage        NUMERIC(6,2) NOT NULL,
  cohort_context  TEXT,
  trade_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_golden_trades_cohort ON challenge_golden_trades (cohort_id);
