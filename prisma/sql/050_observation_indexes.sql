-- Observation lifecycle indexes (OBS-09 repeat detection, timeline ordering,
-- optimistic-lock lookups).
--
-- Replaces add_observation_lifecycle_indexes.sql, whose trailing
-- `CREATE POLICY tenant_isolation_obs_rbi` is not idempotent and belongs to
-- the RLS path this project does not use.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_observation_repeat_detection
ON "Observation" ("tenantId", "branchId", "auditAreaId", status)
WHERE status = 'CLOSED';

CREATE INDEX IF NOT EXISTS idx_observation_title_trgm
ON "Observation" USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_timeline_observation_ordered
ON "ObservationTimeline" ("observationId", "createdAt");

CREATE INDEX IF NOT EXISTS idx_observation_version
ON "Observation" (id, version);
