-- Adds scaffold_defects ("findings/defects") to resolve_public_report()'s
-- scaffold_inspection projection — Phase 2's explicit "findings/defects"
-- requirement was covered by the checklist items alone in the original
-- migration; a defect is a distinct, separately-tracked remediation record
-- (modules/scaffold-defects/) and belongs in the report too.
create or replace function public.resolve_public_report(target_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token_hash text;
  v_share public.report_shares;
  v_company jsonb;
  v_project jsonb;
  v_record jsonb;
begin
  if target_token is null or btrim(target_token) = '' or length(target_token) > 200 then
    return null;
  end if;

  v_token_hash := encode(extensions.digest(target_token, 'sha256'), 'hex');

  select * into v_share from public.report_shares where token_hash = v_token_hash;
  if v_share.id is null then
    return null;
  end if;
  if v_share.revoked_at is not null then
    return null;
  end if;
  if v_share.expires_at is not null and v_share.expires_at <= now() then
    return null;
  end if;

  update public.report_shares
  set last_viewed_at = now(), view_count = view_count + 1
  where id = v_share.id;

  select jsonb_build_object('id', c.id, 'name', c.name) into v_company from public.companies c where c.id = v_share.company_id;
  if v_share.project_id is not null then
    select jsonb_build_object('id', p.id, 'name', p.name) into v_project from public.projects p where p.id = v_share.project_id;
  end if;

  if v_share.record_type = 'lmra' then
    select jsonb_build_object(
      'id', a.id,
      'work_area', a.work_area,
      'work_activity', a.work_activity,
      'work_date', a.work_date,
      'shift', a.shift,
      'status', a.status,
      'result', a.result,
      'stop_work_reason', a.stop_work_reason,
      'notes', a.notes,
      'created_at', a.created_at,
      'updated_at', a.updated_at,
      'submitted_at', a.submitted_at,
      'reviewed_at', a.reviewed_at,
      'completed_by', jsonb_build_object('first_name', ce.first_name, 'last_name', ce.last_name),
      'responsible_person', case when re.id is not null then jsonb_build_object('first_name', re.first_name, 'last_name', re.last_name) else null end,
      'participants', coalesce((
        select jsonb_agg(jsonb_build_object('first_name', pe.first_name, 'last_name', pe.last_name) order by pe.last_name, pe.first_name)
        from public.lmra_participants p join public.employees pe on pe.id = p.employee_id where p.lmra_assessment_id = a.id
      ), '[]'::jsonb),
      'hazards', coalesce((
        select jsonb_agg(jsonb_build_object(
          'hazard_type', h.hazard_type,
          'is_applicable', h.is_applicable,
          'selected_controls', h.selected_controls,
          'controls', h.controls,
          'controls_confirmed', h.controls_confirmed,
          'other_description', h.other_description,
          'responsible_person', case when hre.id is not null then jsonb_build_object('first_name', hre.first_name, 'last_name', hre.last_name) else null end
        ) order by h.hazard_type)
        from public.lmra_hazards h left join public.employees hre on hre.id = h.responsible_person_id where h.lmra_assessment_id = a.id
      ), '[]'::jsonb)
    ) into v_record
    from public.lmra_assessments a
    join public.employees ce on ce.id = a.completed_by_employee_id
    left join public.employees re on re.id = a.responsible_person_id
    where a.id = v_share.lmra_assessment_id;

  elsif v_share.record_type = 'scaffold_inspection' then
    select jsonb_build_object(
      'id', si.id,
      'scaffold_number', s.scaffold_number,
      'sequence_number', si.sequence_number,
      'tag_number', s.tag_number,
      'work_area', s.work_area,
      'scaffold_type', s.scaffold_type,
      'inspected_at', si.inspected_at,
      'reason', si.inspection_reason,
      'status', si.status,
      'outcome', si.outcome,
      'expires_at', si.expires_at,
      'notes', si.notes,
      'voided_at', si.voided_at,
      'void_reason', si.void_reason,
      'inspector', case when ie.id is not null then jsonb_build_object('first_name', ie.first_name, 'last_name', ie.last_name) else null end,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'item_type', it.item_type,
          'result', it.result,
          'comment', it.comment,
          'required_corrective_action', it.required_corrective_action,
          'severity', it.severity
        ) order by it.item_type)
        from public.scaffold_inspection_items it where it.scaffold_inspection_id = si.id
      ), '[]'::jsonb),
      'defects', coalesce((
        select jsonb_agg(jsonb_build_object(
          'description', d.description,
          'severity', d.severity,
          'status', d.status,
          'due_date', d.due_date,
          'immediate_control', d.immediate_control
        ) order by d.created_at)
        from public.scaffold_defects d where d.scaffold_inspection_id = si.id
      ), '[]'::jsonb)
    ) into v_record
    from public.scaffold_inspections si
    join public.scaffolds s on s.id = si.scaffold_id
    left join public.employees ie on ie.id = si.inspector_id
    where si.id = v_share.scaffold_inspection_id;

  elsif v_share.record_type = 'safety_observation' then
    select jsonb_build_object(
      'id', o.id,
      'work_area', o.work_area,
      'observed_at', o.observed_at,
      'category', o.category,
      'observation_type', o.observation_type,
      'description', o.description,
      'immediate_action_taken', o.immediate_action_taken,
      'risk_level', o.risk_level,
      'is_stop_work', o.is_stop_work,
      'status', o.status,
      'disposition', o.disposition,
      'observer', case when oe.id is not null then jsonb_build_object('first_name', oe.first_name, 'last_name', oe.last_name) else null end,
      'participants', coalesce((
        select jsonb_agg(jsonb_build_object('first_name', pe.first_name, 'last_name', pe.last_name) order by pe.last_name, pe.first_name)
        from public.safety_observation_participants p join public.employees pe on pe.id = p.employee_id where p.observation_id = o.id
      ), '[]'::jsonb),
      'corrective_actions', coalesce((
        select jsonb_agg(jsonb_build_object('description', ca.description, 'status', ca.status, 'priority', ca.priority, 'due_date', ca.due_date) order by ca.created_at)
        from public.corrective_actions ca where ca.observation_id = o.id
      ), '[]'::jsonb)
    ) into v_record
    from public.safety_observations o
    left join public.employees oe on oe.id = o.observer_id
    where o.id = v_share.safety_observation_id;

  elsif v_share.record_type = 'corrective_action' then
    select jsonb_build_object(
      'id', ca.id,
      'description', ca.description,
      'priority', ca.priority,
      'due_date', ca.due_date,
      'status', ca.status,
      'reviewed_at', ca.reviewed_at,
      'completion_notes', ca.completion_notes,
      'closure_evidence', ca.closure_evidence,
      'created_at', ca.created_at,
      'responsible_person', case when re.id is not null then jsonb_build_object('first_name', re.first_name, 'last_name', re.last_name) else null end,
      'observation', jsonb_build_object('work_area', o.work_area, 'description', o.description, 'observed_at', o.observed_at)
    ) into v_record
    from public.corrective_actions ca
    left join public.employees re on re.id = ca.responsible_person_id
    join public.safety_observations o on o.id = ca.observation_id
    where ca.id = v_share.corrective_action_id;

  elsif v_share.record_type = 'toolbox_meeting' then
    select jsonb_build_object(
      'id', tm.id,
      'meeting_number', tm.meeting_number,
      'title', tm.title,
      'meeting_date', tm.meeting_date,
      'work_area', tm.work_area,
      'status', tm.status,
      'notes', tm.notes,
      'held_by', case when he.id is not null then jsonb_build_object('first_name', he.first_name, 'last_name', he.last_name) else null end,
      'storage_bucket', tm.storage_bucket,
      'storage_object_path', tm.storage_object_path,
      'original_filename', tm.original_filename
    ) into v_record
    from public.toolbox_meetings tm
    left join public.employees he on he.id = tm.held_by_employee_id
    where tm.id = v_share.toolbox_meeting_id;

  elsif v_share.record_type = 'safety_flash' then
    select jsonb_build_object(
      'id', sf.id,
      'flash_number', sf.flash_number,
      'title', sf.title,
      'date_issued', sf.date_issued,
      'category', sf.category,
      'summary', sf.summary,
      'status', sf.status,
      'issued_by', case when ie.id is not null then jsonb_build_object('first_name', ie.first_name, 'last_name', ie.last_name) else null end,
      'storage_bucket', sf.storage_bucket,
      'storage_object_path', sf.storage_object_path,
      'original_filename', sf.original_filename
    ) into v_record
    from public.safety_flashes sf
    left join public.employees ie on ie.id = sf.issued_by_employee_id
    where sf.id = v_share.safety_flash_id;
  end if;

  if v_record is null then
    return null;
  end if;

  return jsonb_build_object(
    'share', jsonb_build_object('id', v_share.id, 'record_type', v_share.record_type, 'created_at', v_share.created_at, 'expires_at', v_share.expires_at),
    'company', v_company,
    'project', v_project,
    'record', v_record
  );
end;
$$;
