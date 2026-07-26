-- Adds 'archive' to audit_action — a natural counterpart to the existing
-- 'restore' value that the original enum (see 20260725090000_enums.sql)
-- omitted. Used by the employee archive Server Function
-- (modules/employees/actions.ts) instead of overloading 'update' or
-- 'close' for what is really its own distinct, broadly-reusable action.
--
-- Not used within this same migration file, so there is no same-transaction
-- restriction to work around either way.
alter type public.audit_action add value 'archive';
