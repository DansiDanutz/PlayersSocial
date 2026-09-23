create or replace function public.players_validate_event_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  joined_count integer;
  unconfirmed_count integer;
begin
  if new.status in ('confirming', 'scheduled') and new.status is distinct from old.status then
    select count(*), count(*) filter (where confirmation_status <> 'accepted')
    into joined_count, unconfirmed_count
    from public.players_registrations
    where event_name = new.event_name;

    if joined_count < new.participant_target then
      raise exception 'Pragul de participanți nu a fost atins';
    end if;

    if new.status = 'scheduled' and unconfirmed_count > 0 then
      raise exception 'Toți participanții trebuie să confirme înainte de programare';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists players_event_status_guard on public.players_events;
create trigger players_event_status_guard
before update of status on public.players_events
for each row execute function public.players_validate_event_status();

create or replace function public.players_admin_notify_all(p_event_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_count integer;
  joined_count integer;
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;

  select participant_target into target_count
  from public.players_events where event_name = p_event_name;
  select count(*) into joined_count
  from public.players_registrations where event_name = p_event_name;

  if joined_count < target_count then
    raise exception 'Pragul de participanți nu a fost atins';
  end if;

  update public.players_events
  set status = 'confirming', event_date = current_date + 1, updated_at = now()
  where event_name = p_event_name;
  update public.players_registrations
  set confirmation_status = 'pending'
  where event_name = p_event_name and confirmation_status = 'registered';
  return true;
end;
$$;

revoke all on function public.players_admin_notify_all(text) from public;
grant execute on function public.players_admin_notify_all(text) to authenticated;
