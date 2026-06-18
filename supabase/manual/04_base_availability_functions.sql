create or replace function public.set_planning_availability(
  p_group_uuid uuid,
  p_participant_id uuid,
  p_edit_token text,
  p_access_token text,
  p_date date,
  p_status text
)
returns void
language plpgsql
security definer
as $function$
declare
  v_name text;
begin
  if not exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and (
        groups.access_token_hash is null
        or groups.access_token_hash = encode(
          extensions.digest(p_access_token, 'sha256'),
          'hex'
        )
      )
  ) then
    raise exception 'La clave de invitación no es válida';
  end if;

  select display_name into v_name
  from public.participants
  where id = p_participant_id
    and group_uuid = p_group_uuid
    and edit_token_hash = encode(
      extensions.digest(p_edit_token, 'sha256'),
      'hex'
    );

  if v_name is null then
    raise exception 'No tienes permiso para editar esta disponibilidad';
  end if;

  if p_status is null then
    delete from public.availability
    where group_uuid = p_group_uuid::text
      and participant_id = p_participant_id
      and date = p_date;
    return;
  end if;

  if p_status not in ('preferred', 'available', 'maybe', 'unavailable') then
    raise exception 'Estado de disponibilidad no válido';
  end if;

  insert into public.availability (
    group_uuid,
    participant_id,
    user_name,
    date,
    status
  )
  values (
    p_group_uuid::text,
    p_participant_id,
    v_name,
    p_date,
    p_status
  )
  on conflict (group_uuid, participant_id, date)
    where participant_id is not null
  do update set
    user_name = excluded.user_name,
    status = excluded.status;
end;
$function$;

create or replace function public.set_planning_availability_range(
  p_group_uuid uuid,
  p_participant_id uuid,
  p_edit_token text,
  p_access_token text,
  p_start_date date,
  p_end_date date,
  p_status text
)
returns void
language plpgsql
security definer
as $function$
declare
  v_day date;
begin
  if p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or p_end_date - p_start_date > 62
  then
    raise exception 'El rango debe contener entre 1 y 63 días';
  end if;

  for v_day in
    select generate_series(p_start_date, p_end_date, interval '1 day')::date
  loop
    perform public.set_planning_availability(
      p_group_uuid,
      p_participant_id,
      p_edit_token,
      p_access_token,
      v_day,
      p_status
    );
  end loop;
end;
$function$;

revoke all on function public.set_planning_availability(uuid, uuid, text, text, date, text) from public;
revoke all on function public.set_planning_availability_range(uuid, uuid, text, text, date, date, text) from public;

grant execute on function public.set_planning_availability(uuid, uuid, text, text, date, text) to anon, authenticated;
grant execute on function public.set_planning_availability_range(uuid, uuid, text, text, date, date, text) to anon, authenticated;
