create or replace function public.players_admin_update_event(p_event_name text, p_target integer, p_event_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if p_target < 2 or p_target > 500 then raise exception 'Număr invalid'; end if;

  update public.players_events
  set participant_target = p_target,
      event_date = p_event_date,
      updated_at = now()
  where event_name = p_event_name;
  return found;
end;
$$;

revoke all on function public.players_admin_update_event(text,integer,date) from public;
grant execute on function public.players_admin_update_event(text,integer,date) to authenticated;
