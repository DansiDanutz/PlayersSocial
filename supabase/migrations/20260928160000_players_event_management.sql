-- Post-event editing (final attendance, public recap, private notes), hiding events and admin registrant access.
alter table public.players_events
  add column if not exists final_participants integer,
  add column if not exists public_recap text,
  add column if not exists admin_notes text,
  add column if not exists is_hidden boolean not null default false;

alter table public.players_events drop constraint if exists players_events_final_participants_check;
alter table public.players_events add constraint players_events_final_participants_check
  check (final_participants is null or final_participants between 0 and 5000);
alter table public.players_events drop constraint if exists players_events_public_recap_check;
alter table public.players_events add constraint players_events_public_recap_check
  check (public_recap is null or char_length(public_recap) <= 300);
alter table public.players_events drop constraint if exists players_events_admin_notes_check;
alter table public.players_events add constraint players_events_admin_notes_check
  check (admin_notes is null or char_length(admin_notes) <= 2000);

create or replace function public.players_admin_update_featured_event(
  p_event_name text,
  p_linked_card text,
  p_event_date date,
  p_start_time time,
  p_target integer,
  p_description text,
  p_location text,
  p_banner_url text,
  p_final_participants integer,
  p_public_recap text,
  p_admin_notes text,
  p_is_hidden boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if not exists (select 1 from public.players_events where event_name = p_linked_card and not is_featured) then raise exception 'Cardul selectat nu există'; end if;
  if p_event_date is null or p_start_time is null then raise exception 'Data și ora sunt obligatorii'; end if;
  if p_target is null or p_target < 2 or p_target > 500 then raise exception 'Număr de locuri invalid'; end if;
  if char_length(coalesce(btrim(p_description), '')) not between 10 and 600 then raise exception 'Descrierea trebuie să aibă 10–600 de caractere'; end if;
  if char_length(coalesce(btrim(p_location), '')) not between 3 and 120 then raise exception 'Locația este obligatorie'; end if;
  if p_banner_url is null then raise exception 'Bannerul este obligatoriu'; end if;

  update public.players_events
  set linked_card = p_linked_card,
      event_date = p_event_date,
      start_time = p_start_time,
      participant_target = p_target,
      description = btrim(p_description),
      location = btrim(p_location),
      banner_url = p_banner_url,
      final_participants = p_final_participants,
      public_recap = nullif(btrim(coalesce(p_public_recap, '')), ''),
      admin_notes = nullif(btrim(coalesce(p_admin_notes, '')), ''),
      is_hidden = coalesce(p_is_hidden, false),
      updated_at = now()
  where event_name = p_event_name and is_featured;
  if not found then raise exception 'Evenimentul nu există'; end if;
  return true;
end;
$$;

create or replace function public.players_admin_event_notes()
returns table(event_name text, admin_notes text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  return query select e.event_name, e.admin_notes from public.players_events e where e.is_featured;
end;
$$;

create or replace function public.players_admin_registrants(p_event_name text)
returns table(first_name text, last_name text, email text, confirmation_status text, created_at timestamptz, public_display_consent boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  return query
    select r.first_name, r.last_name, r.email, r.confirmation_status, r.created_at, coalesce(r.public_display_consent, false)
    from public.players_registrations r
    where r.event_name = p_event_name
    order by r.created_at;
end;
$$;

revoke all on function public.players_admin_update_featured_event(text, text, date, time, integer, text, text, text, integer, text, text, boolean) from public;
revoke all on function public.players_admin_event_notes() from public;
revoke all on function public.players_admin_registrants(text) from public;
grant execute on function public.players_admin_update_featured_event(text, text, date, time, integer, text, text, text, integer, text, text, boolean) to authenticated;
grant execute on function public.players_admin_event_notes() to authenticated;
grant execute on function public.players_admin_registrants(text) to authenticated;

-- Public listing gains recap fields; hidden events stay visible to admins only. admin_notes is never public.
drop function if exists public.players_public_events();
create function public.players_public_events()
returns table(
  event_name text, event_date date, participant_target integer, status text,
  joined_count bigint, accepted_count bigint,
  linked_card text, start_time time, description text, location text, banner_url text, is_featured boolean, created_at timestamptz,
  final_participants integer, public_recap text, is_hidden boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select e.event_name, e.event_date, e.participant_target, e.status,
         count(r.id) as joined_count,
         count(r.id) filter (where r.confirmation_status = 'accepted') as accepted_count,
         e.linked_card, e.start_time, e.description, e.location, e.banner_url, e.is_featured, e.created_at,
         e.final_participants, e.public_recap, e.is_hidden
  from public.players_events e
  left join public.players_registrations r on r.event_name = e.event_name
  where not e.is_hidden or public.is_players_admin()
  group by e.event_name;
$$;

grant execute on function public.players_public_events() to anon, authenticated, service_role;
