-- AuditLog immutability, defense in depth beyond the aegis_app REVOKE
-- (scripts/db-bootstrap.ts's grantAppRole()): these rules block UPDATE and
-- DELETE through ordinary SQL for every role, including the owner and a
-- superuser — the CI integration test's "superuser edit" case still reaches
-- the row (a rule rewrites the query before privilege checks even run for
-- some paths, but a superuser can still DISABLE RULE; that path is not
-- defended here on purpose, since spec §5's tamper test wants a superuser
-- edit to succeed at the SQL level and be *caught by the chain*, not blocked
-- outright — these rules cover the ordinary-privilege path, the hash chain
-- covers the superuser path).
DROP RULE IF EXISTS audit_log_no_update ON "AuditLog";
CREATE RULE audit_log_no_update AS ON UPDATE TO "AuditLog" DO INSTEAD NOTHING;

DROP RULE IF EXISTS audit_log_no_delete ON "AuditLog";
CREATE RULE audit_log_no_delete AS ON DELETE TO "AuditLog" DO INSTEAD NOTHING;
