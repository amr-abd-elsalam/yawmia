-- Yawmia PostgreSQL Durable Outbox Schema Scaffold
-- Patch 85 — static SQL only
--
-- Runtime posture:
--   - not executed by server startup
--   - not executed by tests by default
--   - not imported by runtime services
--   - PgOutboxRepository not implemented
--   - OutboxDispatcher runtime not implemented
--   - EventBus remains in-memory runtime fanout
--   - file-backed payments remain runtime source of truth
--
-- Allowed table scope:
--   outbox_events
--   outbox_dispatch_attempts
--
-- Explicitly out of scope for this scaffold:
--   payments
--   payment_ledger_entries
--   payment_disputes
--   receipt_sequences
--   receipts
--   users
--   sessions
--   jobs
--   applications
--   direct_offers
--   messages
--   workrooms
--   notifications
--   privacy_requests
--   privacy_action_log
--   audit
--   ops_queue tables

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 10,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until TIMESTAMPTZ,
  locked_by TEXT,
  processed_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  last_error TEXT,
  last_attempt_id TEXT,
  correlation_id TEXT,
  causation_id TEXT,
  source_system TEXT NOT NULL DEFAULT 'yawmia',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT outbox_events_status_check
    CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter', 'cancelled')),

  CONSTRAINT outbox_events_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),

  CONSTRAINT outbox_events_attempts_check
    CHECK (attempts >= 0),

  CONSTRAINT outbox_events_max_attempts_check
    CHECK (max_attempts >= 1),

  CONSTRAINT outbox_events_payload_object_check
    CHECK (jsonb_typeof(payload_json) = 'object'),

  CONSTRAINT outbox_events_event_type_not_blank_check
    CHECK (length(trim(event_type)) > 0),

  CONSTRAINT outbox_events_aggregate_type_not_blank_check
    CHECK (length(trim(aggregate_type)) > 0),

  CONSTRAINT outbox_events_aggregate_id_not_blank_check
    CHECK (length(trim(aggregate_id)) > 0),

  CONSTRAINT outbox_events_idempotency_key_not_blank_check
    CHECK (length(trim(idempotency_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_idempotency_key_idx
  ON outbox_events (idempotency_key);

CREATE INDEX IF NOT EXISTS outbox_events_pending_dispatch_idx
  ON outbox_events (priority DESC, available_at ASC, created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS outbox_events_processing_lease_idx
  ON outbox_events (lease_until ASC)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS outbox_events_aggregate_replay_idx
  ON outbox_events (aggregate_type, aggregate_id, created_at ASC);

CREATE INDEX IF NOT EXISTS outbox_events_event_type_status_idx
  ON outbox_events (event_type, status);

CREATE INDEX IF NOT EXISTS outbox_events_status_created_at_idx
  ON outbox_events (status, created_at DESC);

CREATE INDEX IF NOT EXISTS outbox_events_dead_letter_review_idx
  ON outbox_events (dead_lettered_at DESC)
  WHERE status = 'dead_letter';

CREATE INDEX IF NOT EXISTS outbox_events_correlation_id_idx
  ON outbox_events (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS outbox_dispatch_attempts (
  id TEXT PRIMARY KEY,
  outbox_event_id TEXT NOT NULL REFERENCES outbox_events(id),
  attempt_number INTEGER NOT NULL,
  dispatcher_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error TEXT,
  transport TEXT,
  delivery_metadata_json JSONB,

  CONSTRAINT outbox_dispatch_attempts_attempt_number_check
    CHECK (attempt_number >= 1),

  CONSTRAINT outbox_dispatch_attempts_status_check
    CHECK (status IN ('started', 'processed', 'failed', 'dead_lettered', 'cancelled')),

  CONSTRAINT outbox_dispatch_attempts_duration_check
    CHECK (duration_ms IS NULL OR duration_ms >= 0),

  CONSTRAINT outbox_dispatch_attempts_delivery_metadata_object_check
    CHECK (delivery_metadata_json IS NULL OR jsonb_typeof(delivery_metadata_json) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS outbox_dispatch_attempts_event_attempt_once_idx
  ON outbox_dispatch_attempts (outbox_event_id, attempt_number);

CREATE INDEX IF NOT EXISTS outbox_dispatch_attempts_event_id_idx
  ON outbox_dispatch_attempts (outbox_event_id, started_at DESC);

CREATE INDEX IF NOT EXISTS outbox_dispatch_attempts_dispatcher_id_idx
  ON outbox_dispatch_attempts (dispatcher_id, started_at DESC);

CREATE INDEX IF NOT EXISTS outbox_dispatch_attempts_status_idx
  ON outbox_dispatch_attempts (status, started_at DESC);

-- Future claim behavior must be equivalent to:
--
-- BEGIN;
-- SELECT id
-- FROM outbox_events
-- WHERE status = 'pending'
--   AND available_at <= now()
-- ORDER BY
--   CASE priority
--     WHEN 'critical' THEN 4
--     WHEN 'high' THEN 3
--     WHEN 'normal' THEN 2
--     WHEN 'low' THEN 1
--     ELSE 0
--   END DESC,
--   available_at ASC,
--   created_at ASC
-- LIMIT $1
-- FOR UPDATE SKIP LOCKED;
--
-- Then the adapter must transition claimed rows to processing, set lease_until,
-- increment attempts, and create outbox_dispatch_attempts rows in the same
-- transaction.
--
-- Future dispatcher behavior:
--   - processed is set only after downstream delivery succeeds
--   - failed events remain retryable with backoff
--   - dead_letter preserves diagnostic context without secrets
--   - crash before send leaves event recoverable
--   - crash after send before processed mark may cause duplicate delivery
--   - downstream handlers must be idempotent
--
-- Future payment workflow behavior:
--   payment / ledger / receipt / audit / approval changes and required outbox event insertion
--   must commit or roll back as one transaction.
--
-- This scaffold intentionally does not:
--   - execute any migration
--   - install pg
--   - implement PgOutboxRepository
--   - implement OutboxDispatcher
--   - insert outbox events
--   - dispatch events
--   - replace EventBus
--   - mutate file-backed runtime data
