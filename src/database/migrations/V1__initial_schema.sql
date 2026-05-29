CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_balances (
  user_id BIGINT PRIMARY KEY,
  balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  balance_before DECIMAL(18, 2) NOT NULL,
  balance_after DECIMAL(18, 2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  metadata JSONB,
  source_system VARCHAR(50) NOT NULL,
  transaction_batch_id UUID
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions (timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);

CREATE TABLE IF NOT EXISTS economy_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  full_user_balances JSONB NOT NULL,
  total_rc_in_circulation DECIMAL(18, 2) NOT NULL,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS user_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL,
  balance DECIMAL(18, 2) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reason VARCHAR(255),
  transaction_id UUID REFERENCES transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_user_snapshots_user_id ON user_snapshots (user_id);
CREATE INDEX IF NOT EXISTS idx_user_snapshots_timestamp ON user_snapshots (timestamp);

CREATE TABLE IF NOT EXISTS user_activity (
  user_id BIGINT PRIMARY KEY,
  message_count INTEGER NOT NULL DEFAULT 0,
  vc_minutes INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_vc_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES user_balances(user_id),
  item_type VARCHAR(50) NOT NULL,
  item_metadata JSONB,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id ON user_inventory (user_id);

CREATE TABLE IF NOT EXISTS server_invite_codes (
  code VARCHAR(50) PRIMARY KEY,
  inviter_user_id BIGINT NOT NULL,
  uses_count_at_detection INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invite_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_user_id BIGINT NOT NULL UNIQUE,
  inviter_user_id BIGINT NOT NULL REFERENCES user_balances(user_id),
  invite_code_used VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_reason VARCHAR(255),
  reward_transaction_id UUID REFERENCES transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_invite_tracking_status ON invite_tracking (status);
CREATE INDEX IF NOT EXISTS idx_invite_tracking_inviter ON invite_tracking (inviter_user_id);

CREATE TABLE IF NOT EXISTS invite_milestones_awarded (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES user_balances(user_id),
  milestone_tier INTEGER NOT NULL,
  awarded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  transaction_id UUID REFERENCES transactions(id),
  UNIQUE (user_id, milestone_tier)
);

CREATE TABLE IF NOT EXISTS blackjack_games (
  game_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES user_balances(user_id),
  bet_amount DECIMAL(18, 2) NOT NULL,
  player_hand_json JSONB NOT NULL,
  dealer_hand_json JSONB NOT NULL,
  status VARCHAR(20) NOT NULL,
  result VARCHAR(20),
  player_payout DECIMAL(18, 2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  bet_transaction_id UUID REFERENCES transactions(id),
  payout_transaction_id UUID REFERENCES transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_blackjack_games_user_status ON blackjack_games (user_id, status);

CREATE TABLE IF NOT EXISTS crate_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crate_type VARCHAR(20) NOT NULL,
  reward_type VARCHAR(50) NOT NULL,
  reward_value DECIMAL(18, 2),
  reward_metadata JSONB,
  weight INTEGER NOT NULL,
  is_jackpot BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_crate_rewards_type ON crate_rewards (crate_type);

CREATE TABLE IF NOT EXISTS crate_opens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES user_balances(user_id),
  crate_type VARCHAR(20) NOT NULL,
  rc_spent DECIMAL(18, 2) NOT NULL,
  rewards_received_json JSONB NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  transaction_id UUID REFERENCES transactions(id)
);

CREATE TABLE IF NOT EXISTS tickets (
  ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES user_balances(user_id),
  channel_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  assigned_staff_id BIGINT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_channel_id ON tickets (channel_id);

CREATE TABLE IF NOT EXISTS redeem_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES user_balances(user_id),
  redeem_option VARCHAR(50) NOT NULL,
  rc_spent DECIMAL(18, 2) NOT NULL,
  redeem_value_usd DECIMAL(18, 2) NOT NULL,
  redeem_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  original_nickname VARCHAR(32),
  tagged_nickname VARCHAR(32),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMP WITH TIME ZONE,
  transaction_id UUID REFERENCES transactions(id),
  ticket_id UUID REFERENCES tickets(ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_redeem_transactions_user_status ON redeem_transactions (user_id, redeem_status);
