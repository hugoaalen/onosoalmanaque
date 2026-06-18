create or replace function public.set_planning_preferences(
  p_group_uuid uuid,
  p_participant_id uuid,
  p_edit_token text,
  p_access_token text,
  p_preferred_max_days integer,
  p_budget_eur integer,
  p_origin text,
  p_notes text
)
returns void
language plpgsql
security definer
as $function$
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

  if not exists (
    select 1
    from public.participants
    where participants.id = p_participant_id
      and participants.group_uuid = p_group_uuid
      and participants.edit_token_hash = encode(
        extensions.digest(p_edit_token, 'sha256'),
        'hex'
      )
  ) then
    raise exception 'No tienes permiso para editar estas preferencias';
  end if;

  insert into public.participant_preferences (
    participant_id,
    group_uuid,
    preferred_max_days,
    budget_eur,
    origin,
    notes
  )
  values (
    p_participant_id,
    p_group_uuid,
    p_preferred_max_days,
    p_budget_eur,
    nullif(trim(p_origin), ''),
    nullif(trim(p_notes), '')
  )
  on conflict (participant_id)
  do update set
    preferred_max_days = excluded.preferred_max_days,
    budget_eur = excluded.budget_eur,
    origin = excluded.origin,
    notes = excluded.notes,
    updated_at = now();
end;
$function$;

revoke all on function public.set_planning_preferences(uuid, uuid, text, text, integer, integer, text, text) from public;
grant execute on function public.set_planning_preferences(uuid, uuid, text, text, integer, integer, text, text) to anon, authenticated;
