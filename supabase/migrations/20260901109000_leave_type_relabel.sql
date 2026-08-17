-- Task 3 Part 4: relabel the leave-request type set. The canonical set of
-- types OFFERED for a NEW request becomes sick/holiday/emergency/other —
-- 'holiday' and 'emergency' are genuinely new; 'sick'/'other' already
-- existed. 'annual'/'unpaid'/'compassionate' are NOT removed (an enum value
-- already referenced by historical leave_requests rows cannot be dropped,
-- and per this codebase's forward-only-migrations/preserve-historical-data
-- rule it shouldn't be even if it could) — they become legacy-only values,
-- still rendering with their existing friendly label wherever a historical
-- row uses one, just no longer offered in the "Request leave" picker. This
-- mirrors modules/leave-requests/types.ts's existing split between
-- LEAVE_TYPES (offered choices) and LEAVE_TYPE_LABELS (a complete,
-- TypeScript-enforced label for every enum value, past or present).
alter type public.leave_type add value if not exists 'holiday';
alter type public.leave_type add value if not exists 'emergency';
