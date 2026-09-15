-- prisma/sql/090_audit_log_immutability.sql
--
-- AuditLog immutability, a second wall behind the REVOKE UPDATE, DELETE that
-- scripts/db-bootstrap.ts applies to aegis_app and aegis_system. These rules
-- turn every UPDATE and DELETE on "AuditLog" into a no-op for every role,
-- the owner included. A superuser can still DISABLE RULE; that path is left
-- open on purpose. Spec §5 wants a superuser edit to land and then be caught
-- by the hash chain, so the rules cover ordinary privileges and the chain
-- covers the superuser.
--
-- Must apply after 010: its backfill UPDATEs "AuditLog", and these rules
-- would silently swallow those writes. TRUNCATE is not affected by rules,
-- which is how prisma/seed.ts and the integration harness still clear the
-- table.
DROP RULE IF EXISTS audit_log_no_update ON "AuditLog";
CREATE RULE audit_log_no_update AS ON UPDATE TO "AuditLog" DO INSTEAD NOTHING;

DROP RULE IF EXISTS audit_log_no_delete ON "AuditLog";
CREATE RULE audit_log_no_delete AS ON DELETE TO "AuditLog" DO INSTEAD NOTHING;
