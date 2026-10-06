-- Weekly programme managed from the admin dashboard ("Program"): one event per day (one of the site's
-- category cards) with an optional image, an optional image of the whole week, and an optional
-- "event of the week" that must be one of that week's days. Public reads go through
-- players_public_schedule(); writes only through admin RPCs. Images live in the public
-- "players-schedule" bucket.
create table if not exists public.players_schedule_days (
  day date primary key,
  linked_card text not null,
  image_url text check (image_url is null or image_url ~ '^https://lxhjfdxowpxzrybxdasi\.supabase\.co/storage/v1/object/public/players-schedule/[A-Za-z0-9._-]+\.(jpg|png|webp)$'),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.players_schedule_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),
  image_url text check (image_url is null or image_url ~ '^https://lxhjfdxowpxzrybxdasi\.supabase\.co/storage/v1/object/public/players-schedule/[A-Za-z0-9._-]+\.(jpg|png|webp)$'),
  featured_day date check (featured_day is null or featured_day between week_start and week_start + 6),
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.players_schedule_days enable row level security;
alter table public.players_schedule_weeks enable row level security;
revoke all on table public.players_schedule_days from anon, authenticated;
revoke all on table public.players_schedule_weeks from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('players-schedule', 'players-schedule', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "players admins upload schedule images" on storage.objects;
create policy "players admins upload schedule images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'players-schedule' and public.is_players_admin());

drop policy if exists "players admins delete schedule images" on storage.objects;
create policy "players admins delete schedule images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'players-schedule' and public.is_players_admin());

-- The week starting on p_week_start (a Monday): the week image, the featured day and the 7 days that have an event.
create or replace function public.players_public_schedule(p_week_start date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'week_start', p_week_start,
    'image_url', w.image_url,
    'featured_day', w.featured_day,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'linked_card', d.linked_card, 'image_url', d.image_url) order by d.day)
      from public.players_schedule_days d
      where d.day between p_week_start and p_week_start + 6
    ), '[]'::jsonb)
  )
  from (select 1) one
  left join public.players_schedule_weeks w on w.week_start = p_week_start;
$$;

-- Returns the replaced image URL (if any) so the dashboard can delete the old file.
create or replace function public.players_admin_set_schedule_day(p_day date, p_linked_card text, p_image_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_image text;
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if p_day is null then raise exception 'Ziua este obligatorie'; end if;
  if not exists (select 1 from public.players_events where event_name = p_linked_card and not is_featured) then raise exception 'Alege unul dintre evenimentele noastre'; end if;
  select image_url into previous_image from public.players_schedule_days where day = p_day;
  insert into public.players_schedule_days (day, linked_card, image_url, updated_at, updated_by)
  values (p_day, p_linked_card, nullif(p_image_url, ''), now(), lower(auth.jwt() ->> 'email'))
  on conflict (day) do update set linked_card = excluded.linked_card, image_url = excluded.image_url, updated_at = now(), updated_by = excluded.updated_by;
  return case when previous_image is distinct from nullif(p_image_url, '') then previous_image end;
exception
  when check_violation then raise exception 'Imaginea nu este validă';
end;
$$;

-- Removes a day's event (and the week's featured mark if it pointed at it); returns the image URL to delete.
create or replace function public.players_admin_clear_schedule_day(p_day date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_image text;
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  delete from public.players_schedule_days where day = p_day returning image_url into previous_image;
  update public.players_schedule_weeks set featured_day = null, updated_at = now() where featured_day = p_day;
  return previous_image;
end;
$$;

-- Sets the week image and the event of the week (which must be one of that week's scheduled days).
-- Returns the replaced week image URL (if any) so the dashboard can delete the old file.
create or replace function public.players_admin_set_schedule_week(p_week_start date, p_image_url text, p_featured_day date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_image text;
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then raise exception 'Săptămâna trebuie să înceapă luni'; end if;
  if p_featured_day is not null and not exists (
    select 1 from public.players_schedule_days where day = p_featured_day and day between p_week_start and p_week_start + 6
  ) then raise exception 'Evenimentul săptămânii trebuie să fie una dintre zilele programate'; end if;
  select image_url into previous_image from public.players_schedule_weeks where week_start = p_week_start;
  insert into public.players_schedule_weeks (week_start, image_url, featured_day, updated_at, updated_by)
  values (p_week_start, nullif(p_image_url, ''), p_featured_day, now(), lower(auth.jwt() ->> 'email'))
  on conflict (week_start) do update set image_url = excluded.image_url, featured_day = excluded.featured_day, updated_at = now(), updated_by = excluded.updated_by;
  return case when previous_image is distinct from nullif(p_image_url, '') then previous_image end;
exception
  when check_violation then raise exception 'Imaginea nu este validă';
end;
$$;

revoke all on function public.players_public_schedule(date) from public;
grant execute on function public.players_public_schedule(date) to anon, authenticated;
revoke all on function public.players_admin_set_schedule_day(date, text, text) from public, anon;
grant execute on function public.players_admin_set_schedule_day(date, text, text) to authenticated;
revoke all on function public.players_admin_clear_schedule_day(date) from public, anon;
grant execute on function public.players_admin_clear_schedule_day(date) to authenticated;
revoke all on function public.players_admin_set_schedule_week(date, text, date) from public, anon;
grant execute on function public.players_admin_set_schedule_week(date, text, date) to authenticated;
