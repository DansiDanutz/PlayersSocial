-- A date can be marked as having no event even when the weekly default programme has one for its
-- weekday: a players_schedule_days row with no linked_card. The public schedule lists it as is_closed
-- (no event shown) and does not fill it from the template; clearing the row brings the default back.
alter table public.players_schedule_days alter column linked_card drop not null;

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
  insert into public.players_schedule_days (day, linked_card, image_url, start_time, buy_in, guaranteed, min_players, updated_at, updated_by)
  values (p_day, null, null, null, null, null, null, now(), lower(auth.jwt() ->> 'email'))
  on conflict (day) do update set linked_card = null, image_url = null, start_time = null, buy_in = null, guaranteed = null, min_players = null, updated_at = now(), updated_by = excluded.updated_by;
  update public.players_schedule_weeks set featured_day = null, updated_at = now() where featured_day = p_day;
  return previous_image;
end;
$$;
revoke all on function public.players_admin_close_schedule_day(date) from public, anon;
grant execute on function public.players_admin_close_schedule_day(date) to authenticated;

-- The event of the week must be a day that has an event of its own.
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
    select 1 from public.players_schedule_days where day = p_featured_day and linked_card is not null and day between p_week_start and p_week_start + 6
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
    select d.day, d.linked_card, d.image_url, d.start_time, d.buy_in, d.guaranteed, d.min_players, false as is_default, d.linked_card is null as is_closed
    from public.players_schedule_days d
    where d.day between p_week_start and p_week_start + 6
    union all
    select w.day, t.linked_card, null, t.start_time, t.buy_in, t.guaranteed, t.min_players, true, false
    from week_days w
    join public.players_schedule_template t on t.weekday = extract(isodow from w.day)
    where not exists (select 1 from public.players_schedule_days d where d.day = w.day)
  )
  select jsonb_build_object(
    'week_start', p_week_start,
    'image_url', wk.image_url,
    'featured_day', wk.featured_day,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', a.day, 'linked_card', a.linked_card, 'image_url', a.image_url, 'start_time', a.start_time, 'buy_in', a.buy_in, 'guaranteed', a.guaranteed, 'min_players', a.min_players, 'is_default', a.is_default, 'is_closed', a.is_closed) order by a.day)
      from all_days a
    ), '[]'::jsonb)
  )
  from (select 1) one
  left join public.players_schedule_weeks wk on wk.week_start = p_week_start;
$$;
