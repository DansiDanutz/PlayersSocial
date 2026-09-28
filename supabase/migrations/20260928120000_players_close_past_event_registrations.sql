-- Reject registrations for events whose date has already passed (Cluj local time).
create or replace function public.players_register(p_event_name text, p_first_name text, p_last_name text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  registration public.players_registrations;
  event_status text;
  event_day date;
  target_count integer;
  joined_count integer;
begin
  select status, event_date, participant_target into event_status, event_day, target_count
  from public.players_events
  where event_name = p_event_name
  for update;

  if event_status is null then raise exception 'Eveniment inexistent'; end if;
  if event_day is not null and event_day < (now() at time zone 'Europe/Bucharest')::date then raise exception 'Evenimentul s-a încheiat'; end if;
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
