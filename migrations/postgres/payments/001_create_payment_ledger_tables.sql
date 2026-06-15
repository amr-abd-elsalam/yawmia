-- Yawmia PostgreSQL Payment Ledger Schema Scaffold
-- Patch 76 — static SQL only
--
-- Runtime posture:
--   - not executed by server startup
--   - not executed by tests by default
--   - not imported by runtime services
--   - PgPaymentRepository not implemented
--   - PaymentLedgerRepository runtime not implemented
--   - ReceiptRepository runtime not implemented
--   - file-backed payments remain runtime source of truth
--   - receipts remain on-demand and non-persisted at runtime
--
-- Allowed table scope:
--   payments
--   payment_ledger_entries
--   payment_disputes
--   receipt_sequences
--   receipts
--
-- Explicitly out of scope for this scaffold:
--   outbox_events
--   users
--   jobs
--   applications
--   sessions
--   ops_queue tables
--   privacy_action_log
--   audit

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  employer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  currency TEXT NOT NULL DEFAULT 'EGP',
  amount INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL,
  worker_payout INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  workers_accepted INTEGER NOT NULL DEFAULT 0,
  daily_wage INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 1,
  attendance_adjusted BOOLEAN NOT NULL DEFAULT false,
  attendance_breakdown_json JSONB,
  notes TEXT,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  last_ledger_entry_id TEXT,
  imported_from_file_json BOOLEAN NOT NULL DEFAULT false,
  import_metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payments_status_check
    CHECK (status IN ('pending', 'employer_confirmed', 'disputed', 'completed', 'cancelled', 'refunded', 'adjusted')),

  CONSTRAINT payments_currency_check
    CHECK (currency = 'EGP'),

  CONSTRAINT payments_amount_check
    CHECK (amount >= 0),

  CONSTRAINT payments_platform_fee_check
    CHECK (platform_fee >= 0),

  CONSTRAINT payments_worker_payout_check
    CHECK (worker_payout >= 0),

  CONSTRAINT payments_amount_split_check
    CHECK (amount = platform_fee + worker_payout),

  CONSTRAINT payments_method_check
    CHECK (method IN ('cash', 'wallet', 'instapay')),

  CONSTRAINT payments_workers_accepted_check
    CHECK (workers_accepted >= 0),

  CONSTRAINT payments_daily_wage_check
    CHECK (daily_wage >= 0),

  CONSTRAINT payments_duration_days_check
    CHECK (duration_days >= 1),

  CONSTRAINT payments_attendance_breakdown_object_check
    CHECK (attendance_breakdown_json IS NULL OR jsonb_typeof(attendance_breakdown_json) = 'object'),

  CONSTRAINT payments_import_metadata_object_check
    CHECK (import_metadata_json IS NULL OR jsonb_typeof(import_metadata_json) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_job_id_once_idx
  ON payments (job_id);

CREATE INDEX IF NOT EXISTS payments_employer_id_idx
  ON payments (employer_id);

CREATE INDEX IF NOT EXISTS payments_status_idx
  ON payments (status);

CREATE INDEX IF NOT EXISTS payments_created_at_idx
  ON payments (created_at DESC);

CREATE INDEX IF NOT EXISTS payments_imported_from_file_json_idx
  ON payments (imported_from_file_json)
  WHERE imported_from_file_json = true;

CREATE TABLE IF NOT EXISTS payment_ledger_entries (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  job_id TEXT NOT NULL,
  actor_id TEXT,
  actor_role TEXT,
  entry_type TEXT NOT NULL,
  amount_delta INTEGER NOT NULL DEFAULT 0,
  platform_fee_delta INTEGER NOT NULL DEFAULT 0,
  worker_payout_delta INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EGP',
  reason TEXT,
  metadata_json JSONB,
  idempotency_key TEXT,
  imported_from_file_json BOOLEAN NOT NULL DEFAULT false,
  estimated_from_projection BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payment_ledger_actor_role_check
    CHECK (actor_role IS NULL OR actor_role IN ('worker', 'employer', 'admin', 'system')),

  CONSTRAINT payment_ledger_entry_type_check
    CHECK (entry_type IN (
      'payment_created',
      'platform_fee_accrual',
      'worker_payout_payable',
      'employer_confirmed',
      'worker_disputed',
      'employer_disputed',
      'admin_resolved',
      'payment_completed',
      'payment_adjusted',
      'receipt_issued',
      'refund_requested',
      'refund_completed',
      'reversal',
      'attendance_adjustment_applied',
      'platform_fee_adjusted',
      'worker_payout_adjusted',
      'dispute_evidence_added',
      'manual_admin_correction'
    )),

  CONSTRAINT payment_ledger_currency_check
    CHECK (currency = 'EGP'),

  CONSTRAINT payment_ledger_amount_split_check
    CHECK (amount_delta = platform_fee_delta + worker_payout_delta),

  CONSTRAINT payment_ledger_metadata_object_check
    CHECK (metadata_json IS NULL OR jsonb_typeof(metadata_json) = 'object')
);

CREATE INDEX IF NOT EXISTS payment_ledger_payment_id_idx
  ON payment_ledger_entries (payment_id, created_at);

CREATE INDEX IF NOT EXISTS payment_ledger_job_id_idx
  ON payment_ledger_entries (job_id, created_at);

CREATE INDEX IF NOT EXISTS payment_ledger_entry_type_idx
  ON payment_ledger_entries (entry_type);

CREATE INDEX IF NOT EXISTS payment_ledger_actor_idx
  ON payment_ledger_entries (actor_id, actor_role);

CREATE INDEX IF NOT EXISTS payment_ledger_imported_from_file_json_idx
  ON payment_ledger_entries (imported_from_file_json)
  WHERE imported_from_file_json = true;

CREATE UNIQUE INDEX IF NOT EXISTS payment_ledger_idempotency_key_idx
  ON payment_ledger_entries (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_disputes (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  job_id TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  opened_by_role TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  opened_ledger_entry_id TEXT REFERENCES payment_ledger_entries(id),
  resolved_ledger_entry_id TEXT REFERENCES payment_ledger_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payment_disputes_opened_by_role_check
    CHECK (opened_by_role IN ('worker', 'employer')),

  CONSTRAINT payment_disputes_status_check
    CHECK (status IN ('open', 'under_review', 'resolved_employer', 'resolved_worker', 'resolved_adjusted', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS payment_disputes_payment_id_idx
  ON payment_disputes (payment_id);

CREATE INDEX IF NOT EXISTS payment_disputes_job_id_idx
  ON payment_disputes (job_id);

CREATE INDEX IF NOT EXISTS payment_disputes_status_idx
  ON payment_disputes (status);

CREATE INDEX IF NOT EXISTS payment_disputes_opened_by_idx
  ON payment_disputes (opened_by);

CREATE UNIQUE INDEX IF NOT EXISTS payment_disputes_one_open_per_payment_idx
  ON payment_disputes (payment_id)
  WHERE status IN ('open', 'under_review');

CREATE TABLE IF NOT EXISTS receipt_sequences (
  receipt_date DATE PRIMARY KEY,
  next_sequence INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receipt_sequences_next_sequence_check
    CHECK (next_sequence >= 1)
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  job_id TEXT NOT NULL,
  employer_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EGP',
  subtotal INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL,
  worker_payout INTEGER NOT NULL,
  attendance_snapshot_json JSONB,
  worker_snapshot_json JSONB,
  job_snapshot_json JSONB,
  payment_snapshot_json JSONB,
  issued_by TEXT NOT NULL,
  issued_by_role TEXT NOT NULL,
  ledger_entry_id TEXT REFERENCES payment_ledger_entries(id),
  imported_from_file_json BOOLEAN NOT NULL DEFAULT false,
  retroactive_policy_approval_id TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receipts_currency_check
    CHECK (currency = 'EGP'),

  CONSTRAINT receipts_subtotal_check
    CHECK (subtotal >= 0),

  CONSTRAINT receipts_platform_fee_check
    CHECK (platform_fee >= 0),

  CONSTRAINT receipts_worker_payout_check
    CHECK (worker_payout >= 0),

  CONSTRAINT receipts_amount_split_check
    CHECK (subtotal = platform_fee + worker_payout),

  CONSTRAINT receipts_issued_by_role_check
    CHECK (issued_by_role IN ('admin', 'system', 'employer')),

  CONSTRAINT receipts_attendance_snapshot_object_check
    CHECK (attendance_snapshot_json IS NULL OR jsonb_typeof(attendance_snapshot_json) = 'object'),

  CONSTRAINT receipts_worker_snapshot_object_check
    CHECK (worker_snapshot_json IS NULL OR jsonb_typeof(worker_snapshot_json) = 'object'),

  CONSTRAINT receipts_job_snapshot_object_check
    CHECK (job_snapshot_json IS NULL OR jsonb_typeof(job_snapshot_json) = 'object'),

  CONSTRAINT receipts_payment_snapshot_object_check
    CHECK (payment_snapshot_json IS NULL OR jsonb_typeof(payment_snapshot_json) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS receipts_payment_id_once_idx
  ON receipts (payment_id);

CREATE INDEX IF NOT EXISTS receipts_job_id_idx
  ON receipts (job_id);

CREATE INDEX IF NOT EXISTS receipts_employer_id_idx
  ON receipts (employer_id);

CREATE INDEX IF NOT EXISTS receipts_issued_at_idx
  ON receipts (issued_at DESC);

CREATE INDEX IF NOT EXISTS receipts_imported_from_file_json_idx
  ON receipts (imported_from_file_json)
  WHERE imported_from_file_json = true;

-- Append-only ledger guard.
-- This is static scaffold only and is not enforced until the SQL is explicitly
-- executed in a guarded future migration.
CREATE OR REPLACE FUNCTION prevent_payment_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payment_ledger_entries is append-only';
END;

$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_payment_ledger_update
BEFORE UPDATE ON payment_ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_payment_ledger_mutation();

CREATE TRIGGER trg_prevent_payment_ledger_delete
BEFORE DELETE ON payment_ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_payment_ledger_mutation();

-- Future receipt allocation behavior must be equivalent to:
--
-- BEGIN;
-- SELECT next_sequence
-- FROM receipt_sequences
-- WHERE receipt_date = $1
-- FOR UPDATE;
--
-- INSERT INTO receipt_sequences (receipt_date, next_sequence)
-- VALUES ($1, 2)
-- ON CONFLICT (receipt_date) DO UPDATE
--   SET next_sequence = receipt_sequences.next_sequence + 1,
--       updated_at = now()
-- RETURNING next_sequence - 1 AS allocated_sequence;
--
-- INSERT INTO receipts (...);
-- INSERT INTO payment_ledger_entries (..., entry_type = 'receipt_issued', ...);
-- COMMIT;
--
-- The future adapter must allocate receipt number, insert receipt, append ledger
-- entry, and insert durable outbox event in one transaction.
--
-- This scaffold intentionally does not create outbox_events.
-- Durable outbox remains a separate static/runtime migration concern.
