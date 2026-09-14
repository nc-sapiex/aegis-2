-- Make audit_trigger_function() tolerant of empty-string session settings.
--
-- Apply manually, like the other loose .sql files in this directory.
--
-- WHY
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

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  _action_type TEXT;
  _justification TEXT;
  _ip_address TEXT;
  _session_id TEXT;
  _user_id TEXT;
  _tenant_id TEXT;
BEGIN
  -- NULLIF collapses both "never set" and "set then released" to NULL.
  _action_type := NULLIF(current_setting('app.current_action', TRUE), '');
  _justification := NULLIF(current_setting('app.current_justification', TRUE), '');
  _ip_address := NULLIF(current_setting('app.current_ip_address', TRUE), '');
  _session_id := NULLIF(current_setting('app.current_session_id', TRUE), '');
  _user_id := NULLIF(current_setting('app.current_user_id', TRUE), '');
  _tenant_id := NULLIF(current_setting('app.current_tenant_id', TRUE), '');

  INSERT INTO "AuditLog" (
    id,
    "tenantId",
    "userId",
    "tableName",
    "recordId",
    operation,
    "actionType",
    justification,
    "oldData",
    "newData",
    "ipAddress",
    "sessionId",
    "retentionExpiresAt",
    "createdAt"
  ) VALUES (
    gen_random_uuid(),
    _tenant_id::UUID,
    _user_id::UUID,
    TG_TABLE_NAME,
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT
      ELSE NEW.id::TEXT
    END,
    TG_OP,
    _action_type,
    _justification,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    _ip_address,
    _session_id,
    NOW() + INTERVAL '10 years',  -- DE3: PMLA 10-year retention
    NOW()
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
