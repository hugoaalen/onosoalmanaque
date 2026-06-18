create or replace function public.get_planning_preferences(
  p_group_uuid uuid,
  p_access_token text
)
returns table (
  participant_id uuid,
  group_uuid uuid,
  preferred_max_days integer,
  budget_eur integer,
  origin text,
  notes text
)
language sql
security definer
as $function$
  select
    preferences.participant_id,
    preferences.group_uuid,
    preferences.preferred_max_days,
    preferences.budget_eur,
    preferences.origin,
    preferences.notes
  from public.participant_preferences preferences
  where preferences.group_uuid = p_group_uuid
    and exists (
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
    );
$function$;

revoke all on function public.get_planning_preferences(uuid, text) from public;
grant execute on function public.get_planning_preferences(uuid, text) to anon, authenticated;
