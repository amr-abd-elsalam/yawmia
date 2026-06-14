-- Yawmia PostgreSQL Queue Schema Scaffold
-- Patch 71 — static SQL only
--
-- Runtime posture:
--   - not executed by server startup
--   - not executed by tests by default
--   - not imported by runtime services
--   - PgQueueRepository not implemented
--   - file-backed queue remains runtime source of truth
--
-- Allowed table scope:
--   ops_queue_jobs
--   ops_queue_attempts
--   ops_queue_idempotency
--   ops_queue_workers

CREATE TABLE IF NOT EXISTS ops_queue_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  priority_weight INTEGER NOT NULL DEFAULT 50,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  backoff_ms INTEGER NOT NULL DEFAULT 30000,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  result_json JSONB,
  cancel_requested BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  CONSTRAINT ops_queue_jobs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'dead_letter')),

  CONSTRAINT ops_queue_jobs_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),

  CONSTRAINT ops_queue_jobs_attempts_check
    CHECK (attempts >= 0),

  CONSTRAINT ops_queue_jobs_max_attempts_check
    CHECK (max_attempts >= 1),

  CONSTRAINT ops_queue_jobs_backoff_check
    CHECK (backoff_ms >= 0),

  CONSTRAINT ops_queue_jobs_payload_object_check
    CHECK (jsonb_typeof(payload_json) = 'object')
);

CREATE INDEX IF NOT EXISTS ops_queue_jobs_claim_idx
  ON ops_queue_jobs (status, next_run_at, priority_weight DESC, created_at ASC)
  WHERE status = 'pending' AND cancel_requested = false;

CREATE INDEX IF NOT EXISTS ops_queue_jobs_type_status_idx
  ON ops_queue_jobs (type, status);

CREATE INDEX IF NOT EXISTS ops_queue_jobs_idempotency_key_idx
  ON ops_queue_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ops_queue_jobs_running_lease_idx
  ON ops_queue_jobs (lease_until)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS ops_queue_jobs_created_at_idx
  ON ops_queue_jobs (created_at);

CREATE INDEX IF NOT EXISTS ops_queue_jobs_updated_at_idx
  ON ops_queue_jobs (updated_at);

CREATE TABLE IF NOT EXISTS ops_queue_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES ops_queue_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  worker_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'started',
  error TEXT,
  duration_ms INTEGER,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT ops_queue_attempts_status_check
    CHECK (status IN ('started', 'completed', 'failed', 'cancelled', 'dead_lettered')),

  CONSTRAINT ops_queue_attempts_attempt_number_check
    CHECK (attempt_number >= 1),

  CONSTRAINT ops_queue_attempts_duration_check
    CHECK (duration_ms IS NULL OR duration_ms >= 0),

  CONSTRAINT ops_queue_attempts_metadata_object_check
    CHECK (jsonb_typeof(metadata_json) = 'object'),

  CONSTRAINT ops_queue_attempts_job_attempt_unique
    UNIQUE (job_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS ops_queue_attempts_job_id_idx
  ON ops_queue_attempts (job_id, attempt_number);

CREATE INDEX IF NOT EXISTS ops_queue_attempts_status_idx
  ON ops_queue_attempts (status);

CREATE TABLE IF NOT EXISTS ops_queue_idempotency (
  key_hash TEXT PRIMARY KEY,
  idempotency_key TEXT,
  job_id TEXT NOT NULL REFERENCES ops_queue_jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT ops_queue_idempotency_expiry_check
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS ops_queue_idempotency_job_id_idx
  ON ops_queue_idempotency (job_id);

CREATE INDEX IF NOT EXISTS ops_queue_idempotency_expires_at_idx
  ON ops_queue_idempotency (expires_at);

CREATE TABLE IF NOT EXISTS ops_queue_workers (
  worker_id TEXT PRIMARY KEY,
  instance_id TEXT,
  hostname TEXT,
  pid INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT ops_queue_workers_pid_check
    CHECK (pid IS NULL OR pid > 0),

  CONSTRAINT ops_queue_workers_metadata_object_check
    CHECK (jsonb_typeof(metadata_json) = 'object')
);

CREATE INDEX IF NOT EXISTS ops_queue_workers_heartbeat_idx
  ON ops_queue_workers (heartbeat_at);

-- Future claim behavior must be equivalent to:
--
-- SELECT id
-- FROM ops_queue_jobs
-- WHERE status = 'pending'
--   AND cancel_requested = false
--   AND next_run_at <= now()
-- ORDER BY priority_weight DESC, next_run_at ASC, created_at ASC
-- FOR UPDATE SKIP LOCKED
-- LIMIT $1;
--
-- The adapter must claim and transition rows in one transaction.
