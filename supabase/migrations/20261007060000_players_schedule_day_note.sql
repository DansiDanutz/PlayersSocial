-- Optional note per programme day (e.g. a student offer), set by admins and shown with the day's terms.
alter table public.players_schedule_days
  add column if not exists note text check (note is null or char_length(note) between 1 and 200);

drop function if exists public.players_admin_set_schedule_day(date, text, text, time, integer, integer, integer);
create function public.players_admin_set_schedule_day(p_day date, p_linked_card text, p_image_url text, p_start_time time default null, p_buy_in integer default null, p_guaranteed integer default null, p_min_players integer default null, p_note text default null)
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
  insert into public.players_schedule_days (day, linked_card, image_url, start_time, buy_in, guaranteed, min_players, note, updated_at, updated_by)
  values (p_day, p_linked_card, nullif(p_image_url, ''), p_start_time, p_buy_in, p_guaranteed, p_min_players, nullif(btrim(p_note), ''), now(), lower(auth.jwt() ->> 'email'))
  on conflict (day) do update set linked_card = excluded.linked_card, image_url = excluded.image_url, start_time = excluded.start_time, buy_in = excluded.buy_in, guaranteed = excluded.guaranteed, min_players = excluded.min_players, note = excluded.note, updated_at = now(), updated_by = excluded.updated_by;
  return case when previous_image is distinct from nullif(p_image_url, '') then previous_image end;
exception
  when check_violation then raise exception 'Imaginea, buy-in-ul, garantatul, minimul de jucători sau nota (max. 200 de caractere) nu sunt valide';
end;
$$;
revoke all on function public.players_admin_set_schedule_day(date, text, text, time, integer, integer, integer, text) from public, anon;
grant execute on function public.players_admin_set_schedule_day(date, text, text, time, integer, integer, integer, text) to authenticated;

-- Marking a day free also drops its note.
create or replace function public.players_admin_close_schedule_day(p_day date)
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
  select image_url into previous_image from public.players_schedule_days where day = p_day;
  insert into public.players_schedule_days (day, linked_card, image_url, start_time, buy_in, guaranteed, min_players, note, updated_at, updated_by)
  values (p_day, null, null, null, null, null, null, null, now(), lower(auth.jwt() ->> 'email'))
  on conflict (day) do update set linked_card = null, image_url = null, start_time = null, buy_in = null, guaranteed = null, min_players = null, note = null, updated_at = now(), updated_by = excluded.updated_by;
  update public.players_schedule_weeks set featured_day = null, updated_at = now() where featured_day = p_day;
  return previous_image;
end;
$$;

create or replace function public.players_public_schedule(p_week_start date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with week_days as (
    select (p_week_start + offset_days)::date as day from generate_series(0, 6) as offset_days
  ), all_days as (
    select d.day, d.linked_card, d.image_url, d.start_time, d.buy_in, d.guaranteed, d.min_players, d.note, false as is_default, d.linked_card is null as is_closed
    from public.players_schedule_days d
    where d.day between p_week_start and p_week_start + 6
    union all
    select w.day, t.linked_card, null, t.start_time, t.buy_in, t.guaranteed, t.min_players, null, true, false
    from week_days w
    join public.players_schedule_template t on t.weekday = extract(isodow from w.day)
    where not exists (select 1 from public.players_schedule_days d where d.day = w.day)
  )
  select jsonb_build_object(
    'week_start', p_week_start,
    'image_url', wk.image_url,
    'featured_day', wk.featured_day,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', a.day, 'linked_card', a.linked_card, 'image_url', a.image_url, 'start_time', a.start_time, 'buy_in', a.buy_in, 'guaranteed', a.guaranteed, 'min_players', a.min_players, 'note', a.note, 'is_default', a.is_default, 'is_closed', a.is_closed) order by a.day)
      from all_days a
    ), '[]'::jsonb)
  )
  from (select 1) one
  left join public.players_schedule_weeks wk on wk.week_start = p_week_start;
$$;
