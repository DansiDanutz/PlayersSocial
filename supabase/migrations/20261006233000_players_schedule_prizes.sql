-- Buy-in and guaranteed prize of a programme day, set by admins and always shown on the day card.
-- Whole lei, optional. players_admin_set_schedule_day gains two optional parameters (callers that pass
-- only the first three keep working and clear both amounts).
alter table public.players_schedule_days
  add column if not exists buy_in integer check (buy_in is null or buy_in between 0 and 100000),
  add column if not exists guaranteed integer check (guaranteed is null or guaranteed between 0 and 1000000);

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
      select jsonb_agg(jsonb_build_object('day', d.day, 'linked_card', d.linked_card, 'image_url', d.image_url, 'buy_in', d.buy_in, 'guaranteed', d.guaranteed) order by d.day)
      from public.players_schedule_days d
      where d.day between p_week_start and p_week_start + 6
    ), '[]'::jsonb)
  )
  from (select 1) one
  left join public.players_schedule_weeks w on w.week_start = p_week_start;
$$;

drop function if exists public.players_admin_set_schedule_day(date, text, text);
create function public.players_admin_set_schedule_day(p_day date, p_linked_card text, p_image_url text, p_buy_in integer default null, p_guaranteed integer default null)
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
  insert into public.players_schedule_days (day, linked_card, image_url, buy_in, guaranteed, updated_at, updated_by)
  values (p_day, p_linked_card, nullif(p_image_url, ''), p_buy_in, p_guaranteed, now(), lower(auth.jwt() ->> 'email'))
  on conflict (day) do update set linked_card = excluded.linked_card, image_url = excluded.image_url, buy_in = excluded.buy_in, guaranteed = excluded.guaranteed, updated_at = now(), updated_by = excluded.updated_by;
  return case when previous_image is distinct from nullif(p_image_url, '') then previous_image end;
exception
  when check_violation then raise exception 'Imaginea, buy-in-ul sau garantatul nu sunt valide';
end;
$$;

revoke all on function public.players_admin_set_schedule_day(date, text, text, integer, integer) from public, anon;
grant execute on function public.players_admin_set_schedule_day(date, text, text, integer, integer) to authenticated;
