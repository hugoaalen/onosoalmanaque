create or replace function public.create_planning_proposal(
  p_group_uuid uuid,
  p_admin_token text,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_note text
)
returns uuid
language plpgsql
security definer
as $function$
declare
  v_proposal_id uuid;
  v_title text := trim(p_title);
begin
  if not public.is_planning_admin(p_group_uuid, p_admin_token) then
    raise exception 'Solo el administrador puede crear propuestas';
  end if;

  if exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and groups.finalized_proposal_id is not null
  ) then
    raise exception 'El viaje ya tiene una fecha final';
  end if;

  if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'El título debe tener entre 1 y 80 caracteres';
  end if;

  if p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or p_end_date - p_start_date > 62
  then
    raise exception 'La propuesta debe contener entre 1 y 63 días';
  end if;

  insert into public.proposals (group_uuid, title, start_date, end_date, note)
  values (
    p_group_uuid,
    v_title,
    p_start_date,
    p_end_date,
    nullif(trim(p_note), '')
  )
  returning id into v_proposal_id;

  return v_proposal_id;
end;
$function$;

revoke all on function public.create_planning_proposal(uuid, text, text, date, date, text) from public;
grant execute on function public.create_planning_proposal(uuid, text, text, date, date, text) to anon, authenticated;
