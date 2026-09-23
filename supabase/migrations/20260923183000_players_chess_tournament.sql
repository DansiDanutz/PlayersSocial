-- A separate tournament keeps the existing Seară de Șah registrations intact.
insert into public.players_events (event_name, event_date, participant_target, status)
values ('Turneu de Șah Amatori', date '2026-09-26', 64, 'coming_soon')
on conflict (event_name) do nothing;

-- Lock the event before counting registrations so concurrent signups cannot exceed capacity.
create or replace function public.players_register(p_event_name text, p_first_name text, p_last_name text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  registration public.players_registrations;
  event_status text;
  target_count integer;
  joined_count integer;
begin
  select status, participant_target into event_status, target_count
  from public.players_events
  where event_name = p_event_name
  for update;

  if event_status is null then raise exception 'Eveniment inexistent'; end if;
  if event_status <> 'coming_soon' then raise exception 'Înscrierile sunt închise pentru confirmare'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email invalid'; end if;

  select count(*) into joined_count
  from public.players_registrations
  where event_name = p_event_name;
  if joined_count >= target_count then raise exception 'Nu mai sunt locuri disponibile'; end if;

  insert into public.players_registrations(event_name, first_name, last_name, email)
  values (p_event_name, trim(p_first_name), trim(p_last_name), lower(trim(p_email)))
  returning * into registration;
  return jsonb_build_object('token', registration.client_token, 'status', registration.confirmation_status);
end;
$$;

-- Keep an announced event date when the last available place is filled.
create or replace function public.players_maybe_start_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_count integer;
  current_status text;
  joined_count integer;
begin
  select participant_target, status into target_count, current_status
  from public.players_events where event_name = new.event_name for update;
  select count(*) into joined_count from public.players_registrations where event_name = new.event_name;
  if current_status = 'coming_soon' and joined_count >= target_count then
    update public.players_events
    set status = 'confirming', event_date = coalesce(event_date, current_date + 1), updated_at = now()
    where event_name = new.event_name;
    update public.players_registrations
    set confirmation_status = 'pending'
    where event_name = new.event_name and confirmation_status = 'registered';
  end if;
  return new;
end;
$$;
