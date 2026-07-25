-- Database foundation milestone — enums.
-- See docs/DATABASE_SCHEMA.md for the design this implements.
--
-- Fixed, closed vocabularies use native Postgres enums (cheap, indexed,
-- self-documenting). The role catalogue is deliberately NOT an enum here —
-- see 20260725090400_roles.sql for why.

create type public.organization_status as enum ('trial', 'active', 'suspended');

create type public.membership_status as enum ('invited', 'active', 'suspended', 'removed');

create type public.audit_action as enum (
  'create',
  'update',
  'delete',
  'restore',
  'approve',
  'reject',
  'sign',
  'close',
  'amend'
);
