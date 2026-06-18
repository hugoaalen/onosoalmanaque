create or replace function public.get_planning_proposals(
  p_group_uuid uuid,
  p_access_token text
)
returns table (
  id uuid,
  group_uuid uuid,
  title text,
  start_date date,
  end_date date,
  note text,
  created_at timestamptz,
  vote_count bigint
)
language sql
security definer
as $function$
  select
    proposals.id,
    proposals.group_uuid,
    proposals.title,
    proposals.start_date,
    proposals.end_date,
    proposals.note,
    proposals.created_at,
    count(proposal_votes.participant_id) as vote_count
  from public.proposals
  left join public.proposal_votes
    on proposal_votes.proposal_id = proposals.id
  where proposals.group_uuid = p_group_uuid
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
    )
  group by proposals.id
  order by vote_count desc, proposals.start_date, proposals.created_at;
$function$;

create or replace function public.get_planning_votes(
  p_group_uuid uuid,
  p_access_token text
)
returns table (
  proposal_id uuid,
  participant_id uuid
)
language sql
security definer
as $function$
  select proposal_votes.proposal_id, proposal_votes.participant_id
  from public.proposal_votes
  where proposal_votes.group_uuid = p_group_uuid
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

create or replace function public.delete_planning_proposal(
  p_group_uuid uuid,
  p_admin_token text,
  p_proposal_id uuid
)
returns void
language plpgsql
security definer
as $function$
begin
  if not public.is_planning_admin(p_group_uuid, p_admin_token) then
    raise exception 'Solo el administrador puede eliminar propuestas';
  end if;

  if exists (
    select 1
    from public.groups
    where groups.id = p_group_uuid
      and groups.finalized_proposal_id = p_proposal_id
  ) then
    raise exception 'No se puede eliminar la propuesta final';
  end if;

  delete from public.proposals
  where proposals.id = p_proposal_id
    and proposals.group_uuid = p_group_uuid;
end;
$function$;

revoke all on function public.get_planning_proposals(uuid, text) from public;
revoke all on function public.get_planning_votes(uuid, text) from public;
revoke all on function public.create_planning_proposal(uuid, text, text, date, date, text) from public;
revoke all on function public.delete_planning_proposal(uuid, text, uuid) from public;

grant execute on function public.get_planning_proposals(uuid, text) to anon, authenticated;
grant execute on function public.get_planning_votes(uuid, text) to anon, authenticated;
grant execute on function public.create_planning_proposal(uuid, text, text, date, date, text) to anon, authenticated;
grant execute on function public.delete_planning_proposal(uuid, text, uuid) to anon, authenticated;
