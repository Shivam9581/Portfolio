-- Split App schema
-- Design notes:
--  * All money stored as BIGINT cents — never FLOAT/NUMERIC for currency math.
--    See server/src/algorithms/settleDebts.ts header comment for why.
--  * expense_shares.share_cents has a CHECK + a trigger-enforced invariant
--    (sum of shares == expense.total_cents) rather than trusting the app
--    layer alone — defense in depth.
--  * Soft-deletes on expenses (deleted_at) so settlement history isn't
--    silently destroyed by an edit.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD', -- ISO 4217
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  total_cents     BIGINT NOT NULL CHECK (total_cents > 0),
  paid_by_user_id UUID NOT NULL REFERENCES users(id),
  split_type      TEXT NOT NULL CHECK (split_type IN ('equal', 'percentage', 'exact')),
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ -- soft delete; NULL = active
);

CREATE TABLE expense_shares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id  UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  share_cents BIGINT NOT NULL CHECK (share_cents >= 0),
  UNIQUE (expense_id, user_id)
);

-- Enforces "sum of shares for an expense == that expense's total_cents"
-- at the DB level, not just in application code. This is the kind of
-- thing that's easy to skip in a tutorial project and exactly the kind
-- of thing senior engineers look for.
CREATE OR REPLACE FUNCTION check_expense_shares_sum()
RETURNS TRIGGER AS $$
DECLARE
  expense_total BIGINT;
  shares_total BIGINT;
BEGIN
  SELECT total_cents INTO expense_total FROM expenses WHERE id = COALESCE(NEW.expense_id, OLD.expense_id);
  SELECT COALESCE(SUM(share_cents), 0) INTO shares_total FROM expense_shares WHERE expense_id = COALESCE(NEW.expense_id, OLD.expense_id);

  IF shares_total != expense_total THEN
    RAISE EXCEPTION 'Expense shares (%) do not sum to expense total (%)', shares_total, expense_total;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Deferred so we can insert all rows of a multi-row split in one
-- transaction before the constraint is checked.
CREATE CONSTRAINT TRIGGER trg_expense_shares_sum
  AFTER INSERT OR UPDATE OR DELETE ON expense_shares
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_expense_shares_sum();

CREATE TABLE settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_user_id    UUID NOT NULL REFERENCES users(id),
  to_user_id      UUID NOT NULL REFERENCES users(id),
  amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
  settled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by     UUID NOT NULL REFERENCES users(id),
  CHECK (from_user_id != to_user_id)
);

CREATE INDEX idx_expenses_group_id ON expenses(group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_expense_shares_user_id ON expense_shares(user_id);
CREATE INDEX idx_expense_shares_expense_id ON expense_shares(expense_id);
CREATE INDEX idx_settlements_group_id ON settlements(group_id);
CREATE INDEX idx_group_members_user_id ON group_members(user_id);
