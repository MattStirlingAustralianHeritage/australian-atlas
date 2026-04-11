-- ============================================================
-- Australian Atlas Portal — Master DB
-- Migration 053: Deprecate vendor_accounts table
-- ============================================================
-- vendor_accounts is superseded by profiles (role = 'vendor')
-- and operator_accounts. Keeping the table for now to avoid
-- breaking any lingering reads, but marking it deprecated so
-- no new code targets it.
-- ============================================================

COMMENT ON TABLE vendor_accounts IS 'DEPRECATED — replaced by profiles (role=vendor) + operator_accounts. Do not write new code against this table. Will be dropped in a future migration.';
