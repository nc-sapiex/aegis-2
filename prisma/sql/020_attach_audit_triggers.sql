-- Attach `audit_trigger` to every audited table, idempotently.
--
-- The original attachments live in two Prisma migrations
-- (20260209015123_audit_trigger, 20260209220425_add_remaining_audit_triggers)
-- and, for the last two tables, in add_notification_tables.sql — none of which
-- `prisma db push` runs. This file is the single place the
-- attachment is expressed for any database built by push, and it is safe to
-- re-run against a database that already has them.
--
-- Requires audit_trigger_function() to exist — see the null-safe function file
-- earlier in the manifest.

DO $$
DECLARE
  t TEXT;
  audited TEXT[] := ARRAY[
    'Tenant', 'User', 'Branch', 'AuditArea', 'AuditPlan', 'AuditEngagement',
    'Observation', 'ObservationTimeline', 'Evidence', 'ComplianceRequirement',
    'UserBranchAssignment', 'AuditeeResponse', 'NotificationQueue', 'EmailLog',
    -- Previously attached only by add_notification_tables.sql, so a
    -- push-built database silently left them unaudited while
    -- AUDITED_TABLES claimed otherwise. Attached here for every database.
    'NotificationPreference', 'BoardReport',
    -- RBIA/GRC scoring surface: the regulated change-history. Every write
    -- path to these already sets session context, so the trigger fires
    -- cleanly. Kept in step with AUDITED_TABLES and AUDIT_TRIGGER_TABLES.
    'ActionPoint', 'RamAssessment', 'RamAssessmentScore', 'BranchRbiaScore',
    'AuditExaminationResponse',
    -- Remaining scoring tables; their write paths now set session context.
    'ExaminationResponse', 'AccountExamResponse', 'LoanAccount'
  ];
BEGIN
  FOREACH t IN ARRAY audited LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION audit_trigger_function()',
      t
    );
  END LOOP;
END
$$;
