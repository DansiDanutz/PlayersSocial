create table if not exists public.players_events (
  event_name text primary key,
  event_date date,
  participant_target integer not null default 10 check (participant_target between 2 and 500),
  status text not null default 'coming_soon' check (status in ('coming_soon', 'confirming', 'scheduled')),
  updated_at timestamptz not null default now()
);

create table if not exists public.players_registrations (
  id uuid primary key default gen_random_uuid(),
  client_token uuid not null default gen_random_uuid() unique,
  event_name text not null references public.players_events(event_name) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  email text not null check (char_length(email) between 5 and 254),
  confirmation_status text not null default 'registered' check (confirmation_status in ('registered', 'pending', 'accepted')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

insert into public.players_events (event_name, participant_target)
values
  ('Seară de Șah', 24), ('Seară de Table', 20), ('Turneu de Ping-Pong', 16),
  ('Karaoke Club', 30), ('Stand-up Open Mic', 24), ('Remi & Prieteni', 24),
  ('Campionat de FIFA', 16), ('Seară Champions League', 40),
  ('Team Building', 20), ('Evenimente Caritabile', 20)
on conflict (event_name) do nothing;

update public.players_events e
set event_date = d.event_date,
    status = case when d.event_date is null then 'coming_soon' else 'scheduled' end
from public.players_event_dates d
where d.event_name = e.event_name;

alter table public.players_events enable row level security;
alter table public.players_registrations enable row level security;

drop policy if exists "Anyone can read event workflow" on public.players_events;
create policy "Anyone can read event workflow" on public.players_events
for select to anon, authenticated using (true);

drop policy if exists "Admins manage event workflow" on public.players_events;
create policy "Admins manage event workflow" on public.players_events
for all to authenticated
using (public.is_players_admin())
with check (public.is_players_admin());

drop policy if exists "Admins read registrations" on public.players_registrations;
create policy "Admins read registrations" on public.players_registrations
for select to authenticated using (public.is_players_admin());

grant select on public.players_events to anon, authenticated;
grant insert, update, delete on public.players_events to authenticated;
grant select on public.players_registrations to authenticated;

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
    set status = 'confirming', event_date = current_date + 1, updated_at = now()
    where event_name = new.event_name;
    update public.players_registrations
    set confirmation_status = 'pending'
    where event_name = new.event_name and confirmation_status = 'registered';
  end if;
  return new;
end;
$$;

drop trigger if exists players_registration_threshold on public.players_registrations;
create trigger players_registration_threshold
after insert on public.players_registrations
for each row execute function public.players_maybe_start_confirmation();

create or replace function public.players_public_events()
returns table(event_name text, event_date date, participant_target integer, status text, joined_count bigint, accepted_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select e.event_name, e.event_date, e.participant_target, e.status,
         count(r.id) as joined_count,
         count(r.id) filter (where r.confirmation_status = 'accepted') as accepted_count
  from public.players_events e
  left join public.players_registrations r on r.event_name = e.event_name
  group by e.event_name, e.event_date, e.participant_target, e.status;
$$;

create or replace function public.players_register(p_event_name text, p_first_name text, p_last_name text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  registration public.players_registrations;
  event_status text;
begin
  select status into event_status from public.players_events where event_name = p_event_name;
  if event_status is null then raise exception 'Eveniment inexistent'; end if;
  if event_status <> 'coming_soon' then raise exception 'Înscrierile sunt închise pentru confirmare'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email invalid'; end if;
  insert into public.players_registrations(event_name, first_name, last_name, email)
  values (p_event_name, trim(p_first_name), trim(p_last_name), lower(trim(p_email)))
  returning * into registration;
  return jsonb_build_object('token', registration.client_token, 'status', registration.confirmation_status);
end;
$$;

create or replace function public.players_registration_status(p_token uuid)
returns table(event_name text, confirmation_status text, event_status text, event_date date)
language sql
stable
security definer
set search_path = public
as $$
  select r.event_name, r.confirmation_status, e.status, e.event_date
  from public.players_registrations r
  join public.players_events e on e.event_name = r.event_name
  where r.client_token = p_token;
$$;

create or replace function public.players_accept_invitation(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.players_registrations r
  set confirmation_status = 'accepted', confirmed_at = now()
  from public.players_events e
  where r.client_token = p_token and e.event_name = r.event_name and e.status = 'confirming';
  return found;
end;
$$;

create or replace function public.players_admin_set_target(p_event_name text, p_target integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if p_target < 2 or p_target > 500 then raise exception 'Număr invalid'; end if;
  update public.players_events set participant_target = p_target, updated_at = now() where event_name = p_event_name;
  return found;
end;
$$;

create or replace function public.players_admin_notify_all(p_event_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  update public.players_events set status = 'confirming', event_date = current_date + 1, updated_at = now() where event_name = p_event_name;
  update public.players_registrations set confirmation_status = 'pending' where event_name = p_event_name and confirmation_status = 'registered';
  return found;
end;
$$;

revoke all on function public.players_public_events() from public;
revoke all on function public.players_register(text,text,text,text) from public;
revoke all on function public.players_registration_status(uuid) from public;
revoke all on function public.players_accept_invitation(uuid) from public;
revoke all on function public.players_admin_set_target(text,integer) from public;
revoke all on function public.players_admin_notify_all(text) from public;
grant execute on function public.players_public_events() to anon, authenticated;
grant execute on function public.players_register(text,text,text,text) to anon, authenticated;
grant execute on function public.players_registration_status(uuid) to anon, authenticated;
grant execute on function public.players_accept_invitation(uuid) to anon, authenticated;
grant execute on function public.players_admin_set_target(text,integer) to authenticated;
grant execute on function public.players_admin_notify_all(text) to authenticated;
