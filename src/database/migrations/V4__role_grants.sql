CREATE TABLE IF NOT EXISTS role_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES user_balances(user_id),
  role_id BIGINT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  source VARCHAR(50) NOT NULL,
  inventory_id UUID REFERENCES user_inventory(id),
  consumed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_grants_expires ON role_grants (expires_at) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_role_grants_user ON role_grants (user_id);
