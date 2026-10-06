-- Admins edit the weekly default programme from the dashboard: list it, and set or clear one weekday
-- (an empty event removes that weekday's default, so the day shows no event unless one is saved for it).
create or replace function public.players_admin_list_schedule_template()
returns table (weekday smallint, linked_card text, start_time time)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  return query select t.weekday, t.linked_card, t.start_time from public.players_schedule_template t order by t.weekday;
end;
$$;

create or replace function public.players_admin_set_schedule_template_day(p_weekday smallint, p_linked_card text, p_start_time time default null)
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
  insert into public.players_schedule_template (weekday, linked_card, start_time, updated_at)
  values (p_weekday, p_linked_card, p_start_time, now())
  on conflict (weekday) do update set linked_card = excluded.linked_card, start_time = excluded.start_time, updated_at = now();
end;
$$;

revoke all on function public.players_admin_list_schedule_template() from public, anon;
grant execute on function public.players_admin_list_schedule_template() to authenticated;
revoke all on function public.players_admin_set_schedule_template_day(smallint, text, time) from public, anon;
grant execute on function public.players_admin_set_schedule_template_day(smallint, text, time) to authenticated;
