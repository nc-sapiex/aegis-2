-- prisma/sql/010_audit_trigger_function.sql
--
-- audit_trigger_function() computes a per-tenant SHA-256 hash chain
-- instead of writing a plain audit row. sequenceNumber moves from a shared
-- Postgres sequence (AuditLog_sequenceNumber_seq) to a value this function
-- assigns itself from each tenant's AuditChainHead row.
--
-- Canonical string built here MUST match src/lib/audit-chain.ts's
-- canonicalString() byte-for-byte. It covers every "AuditLog" column except
-- "rowHash" itself, in this exact order: prevHash, id, tenantId,
-- sequenceNumber, tableName, recordId, operation, actionType,
-- justification, userId, ipAddress, sessionId, oldData, newData, createdAt,
-- retentionExpiresAt.
--
-- Each field is encoded with audit_chain_field(), below, before
-- concatenating -- there is no separator character between fields, because
-- a length-prefixed encoding needs none and a "|"-joined string (the
-- previous format) could shift content across a field boundary without
-- changing the hash (e.g. actionType "a|b" + justification "c" hashing the
-- same as actionType "a" + justification "b|c"):
--
--   enc(NULL) = "-"
--   enc(v)    = "<UTF-8 byte length of v, decimal>:" || v
--
-- This is unambiguous left to right: NULL is exactly "-", and every non-NULL
-- field starts with a decimal digit followed by ":" and then exactly that
-- many UTF-8 bytes of content -- a value can never be confused with a
-- length prefix or with the next field's start. The byte length (not
-- character/UTF-16-unit count) makes the prefix -- and the hash --
-- independent of both server_encoding and which language runtime computed
-- it.
--
-- oldData/newData are still hashed as Postgres's own `jsonb::text`
-- serialization (e.g. `{"a": 1}`, with the space jsonb_out inserts after
-- ":"/","), not JS's compact `JSON.stringify`: see audit-chain.ts's doc
-- comment for why re-deriving that text via JSON.parse+JSON.stringify on
-- the TS side does not round-trip.
--
-- NULL is distinct from the empty string everywhere in this format: a NULL
-- justification/actionType/ipAddress/sessionId/userId/oldData/newData
-- encodes as "-", never as "0:" (empty-but-present) or a sentinel word.
-- Swapping NULL and "" changes the hash.
--
-- The chain-computing core lives in audit_chain_insert(), a standalone
-- function callable both by the trigger (audit_trigger_function, below) and
-- directly by application code that writes a synthetic AuditLog row outside
-- any tracked table's trigger. onboarding.ts's onboarding.completed summary
-- is one such write, for a real tenant, and now calls audit_chain_insert()
-- directly instead of pulling a raw sequence number from
-- AuditLog_sequenceNumber_seq (a Task 1 stopgap; that sequence is dropped
-- below).
--
-- auth-lockout-plugin.ts's pre-auth account.locked event is the other such
-- write, but it CANNOT call audit_chain_insert(): it has no real tenant
-- (pre-auth, keyed by email; tenantId is the all-zero sentinel) and
-- audit_chain_insert()'s AuditChainHead upsert is FK'd to "Tenant" --
-- confirmed empirically against a throwaway database (23503 foreign key
-- violation). That event was never part of any tenant's cryptographic chain
-- in the first place, so it keeps its own tiny dedicated sequence
-- (AuditLog_system_sequence_seq, below) instead of joining one, and leaves
-- "prevHash"/"rowHash" NULL (both nullable) rather than faking a chain
-- linkage for a row no tenant chain will ever verify. A future
-- chain-verification job must exclude these rows by
-- "tenantId" = '00000000-0000-0000-0000-000000000000' (or by walking real
-- "Tenant" rows) -- NOT by "prevHash" IS NULL. Those are not equivalent:
-- filtering on the nullability of the hash columns would let anyone who can
-- NULL a real tenant row's prevHash/rowHash hide that row from
-- verification. Inside a real tenant's chain, a NULL hash is a broken
-- chain (verification failure), never a reason to skip the row.
--
-- _changed_at is truncated to millisecond precision before both storing it
-- and formatting it with to_char, so there is no rounding/truncation
-- ambiguity left for the JS side (Date only holds millisecond precision) to
-- reproduce -- it just reads back an already-millisecond-exact value.
-- Verified empirically: Postgres's to_char(...,'MS') truncates (never
-- rounds) sub-millisecond digits, and node-postgres's timestamptz -> Date
-- conversion (which this app's Prisma pg adapter delegates to) also
-- truncates -- they already agreed at every boundary case tested, and
-- date_trunc makes that agreement structural instead of coincidental.
--
-- With triggers attached, deleting a "Tenant" row now fails. The FK cascade
-- (ON DELETE CASCADE) removes that tenant's "AuditChainHead" along with
-- everything else, but the "Tenant" row's own DELETE fires audit_trigger,
-- which calls audit_chain_insert(), which re-INSERTs a head row for the
-- tenant being deleted -- and that insert's own FK to "Tenant" then fails
-- with 23503, since the row is already gone by the time the AFTER-trigger
-- runs. Seeds (`withTriggersDetached`) and the integration harness
-- (TRUNCATE, which fires no triggers) are unaffected, and no application
-- delete path exists today. Any future tenant offboarding/erasure feature
-- must either detach triggers around the delete or record its own audit
-- entry before deleting the row -- not something this task builds.
--
-- Every GUC read below is wrapped in NULLIF(current_setting(...), ''). Why:
-- Custom GUCs set with set_config(name, value, TRUE) are transaction-local, but
-- once a connection has set one, the setting stays *known* on that session and
-- later transactions read it back as an empty string rather than as absent:
--
--   fresh connection          current_setting('app.current_user_id', TRUE) -> NULL
--   after any tx has set it   current_setting('app.current_user_id', TRUE) -> ''
--
-- ''::UUID raises `invalid input syntax for type uuid: ""`. So a scheduled job
-- running as a system Actor (which deliberately sets no user) would abort
-- whenever it reused a pooled connection previously used by a signed-in user —
-- intermittently, and only under load. Neither set_config(name, NULL, TRUE) nor
-- RESET clears the value back to absent; both still read ''. The fix has to be
-- here, in the trigger.
--
-- Normalising the tenant the same way is deliberate: an empty tenant becomes
-- NULL and violates AuditLog.tenantId NOT NULL, so a mutation with no tenant
-- context still fails loudly instead of being recorded against nobody.


ALTER TABLE "AuditLog" ALTER COLUMN "sequenceNumber" DROP DEFAULT;
DROP SEQUENCE IF EXISTS "AuditLog_sequenceNumber_seq";

-- Dedicated, narrowly-scoped sequence for the one write that cannot join a
-- tenant's hash chain (see above). Nothing else may use it.
CREATE SEQUENCE IF NOT EXISTS "AuditLog_system_sequence_seq";

-- A database that predates this migration already holds sentinel-tenant
-- rows numbered by the dropped global AuditLog_sequenceNumber_seq. Without
-- this, a fresh AuditLog_system_sequence_seq starting at 1 collides with
-- one of those existing rows the first time it's used ((tenantId,
-- sequenceNumber) is UNIQUE), and the resulting $executeRaw throw is not
-- caught anywhere in auth-lockout-plugin.ts on purpose (a controller ruling:
-- swallowing an audit-write failure would hide a security event) -- it
-- surfaces as a 500 on sign-in, after the lockout itself already applied.
-- GREATEST(...) means re-running this on every bootstrap never moves the
-- sequence backward.
SELECT setval('"AuditLog_system_sequence_seq"', GREATEST(COALESCE((SELECT MAX("sequenceNumber") FROM "AuditLog" WHERE "tenantId" = '00000000-0000-0000-0000-000000000000'), 0), (SELECT last_value FROM "AuditLog_system_sequence_seq")));

-- Length-prefixed field encoder shared by every canonical-string field:
-- NULL -> "-"; non-NULL v -> "<UTF-8 byte length of v>:" || v. IMMUTABLE
-- (same input always yields the same output, no I/O) so the planner may
-- inline/fold it; convert_to(...,'UTF8') makes the byte count independent
-- of server_encoding.
CREATE OR REPLACE FUNCTION audit_chain_field(v TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN v IS NULL THEN '-'
    ELSE octet_length(convert_to(v, 'UTF8'))::TEXT || ':' || v
  END
$$;

CREATE OR REPLACE FUNCTION audit_chain_insert(
  p_tenant_id UUID,
  p_table_name TEXT,
  p_record_id TEXT,
  p_operation TEXT,
  p_action_type TEXT,
  p_justification TEXT,
  p_old_data JSONB,
  p_new_data JSONB,
  p_ip_address TEXT,
  p_session_id TEXT,
  p_user_id UUID,
  p_changed_at TIMESTAMPTZ DEFAULT NOW()
) RETURNS VOID AS $$
DECLARE
  _id UUID := gen_random_uuid();
  _prev_hash BYTEA;
  _next_sequence BIGINT;
  _canonical TEXT;
  _row_hash BYTEA;
  _retention_expires_at TIMESTAMP;
  -- "AuditLog".createdAt/retentionExpiresAt are TIMESTAMP (no time zone),
  -- so this is TIMESTAMP too, not TIMESTAMPTZ: converting via
  -- `AT TIME ZONE 'UTC'` up front bakes in the UTC wall-clock value once,
  -- here, instead of storing a TIMESTAMPTZ into a TIMESTAMP column and
  -- letting Postgres convert it implicitly through the session's TimeZone
  -- GUC on INSERT. The hash pins UTC (to_char below has no further
  -- `AT TIME ZONE`); a server whose TimeZone isn't UTC would otherwise
  -- store and hash two different instants.
  _changed_at TIMESTAMP;
BEGIN
  -- date_trunc first (on the TIMESTAMPTZ input): TIMESTAMP(3) rounds to the
  -- nearest millisecond on storage, while to_char's 'MS' truncates: without
  -- this, a value ending in .xxx5 or higher would store as one millisecond
  -- and hash as another.
  _changed_at := date_trunc('milliseconds', p_changed_at) AT TIME ZONE 'UTC';

  -- Lock (creating on first write) the tenant's head row so concurrent
  -- audited writes within the same tenant serialize; different tenants do
  -- not contend (spec §5, §12 risk: "not measurable at UCB scale").
  INSERT INTO "AuditChainHead" ("tenantId", "lastSequence", "lastHash", "updatedAt")
  VALUES (p_tenant_id, 0, '\x0000000000000000000000000000000000000000000000000000000000000000'::BYTEA, NOW())
  ON CONFLICT ("tenantId") DO NOTHING;

  SELECT "lastSequence", "lastHash" INTO _next_sequence, _prev_hash
    FROM "AuditChainHead" WHERE "tenantId" = p_tenant_id FOR UPDATE;
  _next_sequence := _next_sequence + 1;
  _retention_expires_at := _changed_at + INTERVAL '10 years';

  -- 16 fields, every "AuditLog" column except "rowHash", in this exact
  -- order (must match src/lib/audit-chain.ts's canonicalString()):
  -- prevHash, id, tenantId, sequenceNumber, tableName, recordId, operation,
  -- actionType, justification, userId, ipAddress, sessionId, oldData,
  -- newData, createdAt, retentionExpiresAt. No separator: audit_chain_field
  -- makes the concatenation unambiguous on its own (see header comment).
  _canonical :=
    audit_chain_field(encode(_prev_hash, 'hex'))
    || audit_chain_field(_id::TEXT)
    || audit_chain_field(p_tenant_id::TEXT)
    || audit_chain_field(_next_sequence::TEXT)
    || audit_chain_field(p_table_name)
    || audit_chain_field(p_record_id)
    || audit_chain_field(p_operation)
    || audit_chain_field(p_action_type)
    || audit_chain_field(p_justification)
    || audit_chain_field(p_user_id::TEXT)
    || audit_chain_field(p_ip_address)
    || audit_chain_field(p_session_id)
    || audit_chain_field(p_old_data::TEXT)
    || audit_chain_field(p_new_data::TEXT)
    || audit_chain_field(to_char(_changed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    || audit_chain_field(to_char(_retention_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  _row_hash := digest(convert_to(_canonical, 'UTF8'), 'sha256');

  INSERT INTO "AuditLog" (
    id, "tenantId", "userId", "tableName", "recordId", operation, "actionType",
    justification, "oldData", "newData", "ipAddress", "sessionId",
    "retentionExpiresAt", "createdAt", "sequenceNumber", "prevHash", "rowHash"
  ) VALUES (
    _id, p_tenant_id, p_user_id, p_table_name, p_record_id, p_operation,
    p_action_type, p_justification, p_old_data, p_new_data, p_ip_address, p_session_id,
    _retention_expires_at, _changed_at, _next_sequence, _prev_hash, _row_hash
  );

  UPDATE "AuditChainHead"
     SET "lastSequence" = _next_sequence, "lastHash" = _row_hash, "updatedAt" = NOW()
   WHERE "tenantId" = p_tenant_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  _action_type TEXT;
  _justification TEXT;
  _ip_address TEXT;
  _session_id TEXT;
  _user_id TEXT;
  _tenant_id TEXT;
  _record_id TEXT;
  _old_json JSONB;
  _new_json JSONB;
BEGIN
  _action_type := NULLIF(current_setting('app.current_action', TRUE), '');
  _justification := NULLIF(current_setting('app.current_justification', TRUE), '');
  _ip_address := NULLIF(current_setting('app.current_ip_address', TRUE), '');
  _session_id := NULLIF(current_setting('app.current_session_id', TRUE), '');
  _user_id := NULLIF(current_setting('app.current_user_id', TRUE), '');
  _tenant_id := NULLIF(current_setting('app.current_tenant_id', TRUE), '');

  _record_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT ELSE NEW.id::TEXT END;
  _old_json := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  _new_json := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

  PERFORM audit_chain_insert(
    _tenant_id::UUID, TG_TABLE_NAME, _record_id, TG_OP, _action_type, _justification,
    _old_json, _new_json, _ip_address, _session_id, _user_id::UUID, NOW()
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
