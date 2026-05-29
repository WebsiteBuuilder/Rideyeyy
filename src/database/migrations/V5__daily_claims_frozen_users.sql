-- V5: Add daily_claims and frozen_users tables

CREATE TABLE IF NOT EXISTS daily_claims (
  user_id        TEXT        PRIMARY KEY,
  last_claimed_at TIMESTAMPTZ,
  streak         INTEGER     NOT NULL DEFAULT 0,
  total_claimed  NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS frozen_users (
  user_id    TEXT        PRIMARY KEY,
  frozen_by  TEXT        NOT NULL,
  reason     TEXT        NOT NULL DEFAULT '',
  frozen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
