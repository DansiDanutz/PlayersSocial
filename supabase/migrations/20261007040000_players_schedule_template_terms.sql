-- The weekly default programme also carries buy-in, guaranteed prize and minimum players per weekday;
-- days that follow the template show them (empty values fall back to the club defaults on the site).
alter table public.players_schedule_template
  add column if not exists buy_in integer check (buy_in is null or buy_in between 0 and 100000),
  add column if not exists guaranteed integer check (guaranteed is null or guaranteed between 0 and 1000000),
  add column if not exists min_players integer check (min_players is null or min_players between 1 and 1000);

drop function if exists public.players_admin_list_schedule_template();
create function public.players_admin_list_schedule_template()
returns table (weekday smallint, linked_card text, start_time time, buy_in integer, guaranteed integer, min_players integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  return query select t.weekday, t.linked_card, t.start_time, t.buy_in, t.guaranteed, t.min_players from public.players_schedule_template t order by t.weekday;
end;
$$;

drop function if exists public.players_admin_set_schedule_template_day(smallint, text, time);
create function public.players_admin_set_schedule_template_day(p_weekday smallint, p_linked_card text, p_start_time time default null, p_buy_in integer default null, p_guaranteed integer default null, p_min_players integer default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if p_weekday is null or p_weekday not between 1 and 7 then raise exception 'Ziua săptămânii nu este validă'; end if;
  if nullif(p_linked_card, '') is null then
    delete from public.players_schedule_template where weekday = p_weekday;
    return;
  end if;
  if not exists (select 1 from public.players_events where event_name = p_linked_card and not is_featured) then raise exception 'Alege unul dintre evenimentele noastre'; end if;
  insert into public.players_schedule_template (weekday, linked_card, start_time, buy_in, guaranteed, min_players, updated_at)
  values (p_weekday, p_linked_card, p_start_time, p_buy_in, p_guaranteed, p_min_players, now())
  on conflict (weekday) do update set linked_card = excluded.linked_card, start_time = excluded.start_time, buy_in = excluded.buy_in, guaranteed = excluded.guaranteed, min_players = excluded.min_players, updated_at = now();
exception
  when check_violation then raise exception 'Buy-in-ul, garantatul sau minimul de jucători nu sunt valide';
end;
$$;

revoke all on function public.players_admin_list_schedule_template() from public, anon;
grant execute on function public.players_admin_list_schedule_template() to authenticated;
revoke all on function public.players_admin_set_schedule_template_day(smallint, text, time, integer, integer, integer) from public, anon;
grant execute on function public.players_admin_set_schedule_template_day(smallint, text, time, integer, integer, integer) to authenticated;

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
    select d.day, d.linked_card, d.image_url, d.start_time, d.buy_in, d.guaranteed, d.min_players, false as is_default
    from public.players_schedule_days d
    where d.day between p_week_start and p_week_start + 6
    union all
    select w.day, t.linked_card, null, t.start_time, t.buy_in, t.guaranteed, t.min_players, true
    from week_days w
    join public.players_schedule_template t on t.weekday = extract(isodow from w.day)
    where not exists (select 1 from public.players_schedule_days d where d.day = w.day)
  )
  select jsonb_build_object(
    'week_start', p_week_start,
    'image_url', wk.image_url,
    'featured_day', wk.featured_day,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', a.day, 'linked_card', a.linked_card, 'image_url', a.image_url, 'start_time', a.start_time, 'buy_in', a.buy_in, 'guaranteed', a.guaranteed, 'min_players', a.min_players, 'is_default', a.is_default) order by a.day)
      from all_days a
    ), '[]'::jsonb)
  )
  from (select 1) one
  left join public.players_schedule_weeks wk on wk.week_start = p_week_start;
$$;
