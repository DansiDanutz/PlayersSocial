-- Admin-created featured events linked to an existing category card, with an uploaded banner.
alter table public.players_events
  add column if not exists linked_card text,
  add column if not exists start_time time,
  add column if not exists description text,
  add column if not exists location text,
  add column if not exists banner_url text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

-- Banners may only point at this project's banner bucket or at a file shipped with the site.
alter table public.players_events drop constraint if exists players_events_banner_url_check;
alter table public.players_events add constraint players_events_banner_url_check check (
  banner_url is null
  or banner_url ~ '^https://lxhjfdxowpxzrybxdasi\.supabase\.co/storage/v1/object/public/players-event-banners/[A-Za-z0-9._/-]+$'
  or banner_url ~ '^/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$'
);

-- The chess tournament was hard-coded in the page; store it so every featured event is data-driven.
update public.players_events
set linked_card = 'Seară de Șah',
    start_time = '09:30',
    description = 'Player''s Șah × Heracles Cluj-Napoca · Elo sub 2000. Fond de premii garantat: 4.000 lei. Taxă de participare: 180 lei.',
    location = 'Str. Louis Pasteur nr. 75, Cluj-Napoca',
    banner_url = '/turneu-sah-amatori-2026-09-26.jpg',
    is_featured = true
where event_name = 'Turneu de Șah Amatori';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('players-event-banners', 'players-event-banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "players admins upload event banners" on storage.objects;
create policy "players admins upload event banners" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'players-event-banners' and public.is_players_admin());

drop policy if exists "players admins update event banners" on storage.objects;
create policy "players admins update event banners" on storage.objects
  for update to authenticated
  using (bucket_id = 'players-event-banners' and public.is_players_admin());

drop policy if exists "players admins delete event banners" on storage.objects;
create policy "players admins delete event banners" on storage.objects
  for delete to authenticated
  using (bucket_id = 'players-event-banners' and public.is_players_admin());

create or replace function public.players_admin_create_event(
  p_event_name text,
  p_linked_card text,
  p_event_date date,
  p_start_time time,
  p_target integer,
  p_description text,
  p_location text,
  p_banner_url text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  event_name_clean text := btrim(p_event_name);
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if char_length(coalesce(event_name_clean, '')) not between 3 and 80 then raise exception 'Numele evenimentului trebuie să aibă 3–80 de caractere'; end if;
  if not exists (select 1 from public.players_events where event_name = p_linked_card and not is_featured) then raise exception 'Cardul selectat nu există'; end if;
  if p_event_date is null or p_event_date < (now() at time zone 'Europe/Bucharest')::date then raise exception 'Data evenimentului trebuie să fie în viitor'; end if;
  if p_start_time is null then raise exception 'Ora de început este obligatorie'; end if;
  if p_target is null or p_target < 2 or p_target > 500 then raise exception 'Număr de locuri invalid'; end if;
  if char_length(coalesce(btrim(p_description), '')) not between 10 and 600 then raise exception 'Descrierea trebuie să aibă 10–600 de caractere'; end if;
  if char_length(coalesce(btrim(p_location), '')) not between 3 and 120 then raise exception 'Locația este obligatorie'; end if;
  if p_banner_url is null then raise exception 'Bannerul este obligatoriu'; end if;

  insert into public.players_events (event_name, linked_card, event_date, start_time, participant_target, description, location, banner_url, is_featured, status)
  values (event_name_clean, p_linked_card, p_event_date, p_start_time, p_target, btrim(p_description), btrim(p_location), p_banner_url, true, 'coming_soon');
  return true;
exception
  when unique_violation then raise exception 'Există deja un eveniment cu acest nume';
end;
$$;

revoke all on function public.players_admin_create_event(text, text, date, time, integer, text, text, text) from public;
grant execute on function public.players_admin_create_event(text, text, date, time, integer, text, text, text) to authenticated;

-- Return type changes, so the function must be recreated (grants restored below).
drop function if exists public.players_public_events();
create function public.players_public_events()
returns table(
  event_name text, event_date date, participant_target integer, status text,
  joined_count bigint, accepted_count bigint,
  linked_card text, start_time time, description text, location text, banner_url text, is_featured boolean, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.event_name, e.event_date, e.participant_target, e.status,
         count(r.id) as joined_count,
         count(r.id) filter (where r.confirmation_status = 'accepted') as accepted_count,
         e.linked_card, e.start_time, e.description, e.location, e.banner_url, e.is_featured, e.created_at
  from public.players_events e
  left join public.players_registrations r on r.event_name = e.event_name
  group by e.event_name;
$$;

grant execute on function public.players_public_events() to anon, authenticated, service_role;
