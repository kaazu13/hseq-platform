-- Operational audit finding (Phase 28, input/abuse validation): the Equipment
-- V2 milestone (20260827090000_equipment.sql) shipped after the platform-wide
-- input-length-backstop sweep (20260818091000_input_length_backstops.sql)
-- and was never retrofitted with it — equipment_items/equipment_requests'
-- free-text columns had no DB-level CHECK at all, only a "not blank" guard
-- on the required ones. Confirmed live: a ~50,000-character
-- equipment_requests.item_description was accepted by a raw RPC call,
-- bypassing the client-side Zod limit (modules/equipment/validation.ts)
-- entirely — exactly the "client maxlength is UX only" gap the original
-- sweep's own header comment warns about. Limits below mirror each field's
-- existing Zod bound exactly, same "app-layer and DB-layer limit are the
-- same number" convention as every other module.
alter table public.equipment_items
  add constraint equipment_items_category_length check (char_length(category) <= 100),
  add constraint equipment_items_name_length check (char_length(name) <= 200),
  add constraint equipment_items_description_length check (description is null or char_length(description) <= 5000),
  add constraint equipment_items_reference_number_length check (reference_number is null or char_length(reference_number) <= 5000),
  add constraint equipment_items_manufacturer_length check (manufacturer is null or char_length(manufacturer) <= 5000),
  add constraint equipment_items_model_length check (model is null or char_length(model) <= 5000),
  add constraint equipment_items_specification_length check (specification is null or char_length(specification) <= 5000),
  add constraint equipment_items_location_length check (location is null or char_length(location) <= 5000),
  add constraint equipment_items_notes_length check (notes is null or char_length(notes) <= 5000);

alter table public.equipment_requests
  add constraint equipment_requests_item_description_length check (char_length(item_description) <= 200),
  add constraint equipment_requests_specification_length check (specification is null or char_length(specification) <= 5000),
  add constraint equipment_requests_reason_length check (char_length(reason) <= 1000),
  -- decision_comment is written by both the approve path (optionalText,
  -- 5000) and the deny/return path (max 2000) — sized to the larger of
  -- the two so neither legitimate writer is ever rejected.
  add constraint equipment_requests_decision_comment_length check (decision_comment is null or char_length(decision_comment) <= 5000);
