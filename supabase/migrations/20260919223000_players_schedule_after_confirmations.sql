create or replace function public.players_accept_invitation(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_event text;
begin
  update public.players_registrations r
  set confirmation_status = 'accepted', confirmed_at = now()
  from public.players_events e
  where r.client_token = p_token
    and e.event_name = r.event_name
    and e.status = 'confirming'
  returning r.event_name into accepted_event;

  if accepted_event is null then
    return false;
  end if;

  if not exists (
    select 1 from public.players_registrations
    where event_name = accepted_event and confirmation_status <> 'accepted'
  ) then
    update public.players_events
    set status = 'scheduled', updated_at = now()
    where event_name = accepted_event;
  end if;

  return true;
end;
$$;

revoke all on function public.players_accept_invitation(uuid) from public;
grant execute on function public.players_accept_invitation(uuid) to anon, authenticated;
