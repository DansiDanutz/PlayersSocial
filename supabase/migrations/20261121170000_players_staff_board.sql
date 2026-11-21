-- Transparent staff board (/echipa/): every active dealer and every floor manager sees all active dealers'
-- cards (hours, tips, deposit, penalties). Emails and reviewer details are left out; signatures never leave
-- the database. Visitors and accounts that are not staff get nothing.
create or replace function public.players_staff_board()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if public.players_my_dealer_id() is null and not public.is_players_floor_manager() then
    raise exception 'Acces doar pentru dealeri și șefi de sală';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'dealer', (bundle -> 'dealer') - 'email',
      'shifts', coalesce((select jsonb_agg(item - 'reviewed_by' - 'reviewed_at' - 'dealer_check_in' - 'dealer_check_out')
                          from jsonb_array_elements(bundle -> 'shifts') as shift(item)), '[]'::jsonb),
      'tips', bundle -> 'tips',
      'penalties', bundle -> 'penalties') order by d.full_name)
    from public.players_dealers d
    cross join lateral (select public.players_dealer_bundle(d.id) as bundle) b
    where d.is_active), '[]'::jsonb);
end $$;

revoke all on function public.players_staff_board() from public, anon;
grant execute on function public.players_staff_board() to authenticated;
