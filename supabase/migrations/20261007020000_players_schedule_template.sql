-- Weekly default programme: every day without its own row in players_schedule_days follows the event of
-- its weekday here (marked is_default in players_public_schedule). Saving a day from the admin dashboard
-- gives it its own row, which replaces the default for that date only.
create table if not exists public.players_schedule_template (
  weekday smallint primary key check (weekday between 1 and 7), -- ISO: 1 = Monday … 7 = Sunday
  linked_card text not null,
  start_time time,
  updated_at timestamptz not null default now()
);
alter table public.players_schedule_template enable row level security;
revoke all on table public.players_schedule_template from anon, authenticated;

insert into public.players_schedule_template (weekday, linked_card, start_time) values
  (1, 'Remi & Prieteni', null),
  (2, 'Seară de Șah', '18:00'),
  (3, 'Seară de Table', null),
  (4, 'Seară de Șah', '18:00'),
  (5, 'Turneu de Ping-Pong', null),
  (6, 'Karaoke Club', '20:00'),
  (7, 'Remi & Prieteni', null)
on conflict (weekday) do nothing;

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
    select w.day, t.linked_card, null, t.start_time, null, null, null, true
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
