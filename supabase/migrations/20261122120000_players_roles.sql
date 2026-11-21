-- Account roles for the role icons: dealer (active dealer card), floor manager (șef de sală; admins are floor
-- managers automatically) and super admin (players_admins). One account may hold all three.

-- Roles of one email; private helper.
create or replace function public.players_roles_of(p_email text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'dealer', exists (select 1 from public.players_dealers where email = lower(p_email) and is_active),
    'floor', exists (select 1 from public.players_floor_managers where email = lower(p_email))
             or exists (select 1 from public.players_admins where email = lower(p_email)),
    'admin', exists (select 1 from public.players_admins where email = lower(p_email)));
$$;

-- The signed-in account's own roles (header icons on every page).
create or replace function public.players_my_roles()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.players_current_email() = '' then
    return jsonb_build_object('dealer', false, 'floor', false, 'admin', false);
  end if;
  return public.players_roles_of(public.players_current_email());
end $$;

-- Team board: each dealer also carries their roles (no emails leave the database).
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
      'roles', public.players_roles_of(d.email),
      'shifts', coalesce((select jsonb_agg(item - 'reviewed_by' - 'reviewed_at' - 'dealer_check_in' - 'dealer_check_out')
                          from jsonb_array_elements(bundle -> 'shifts') as shift(item)), '[]'::jsonb),
      'tips', bundle -> 'tips',
      'penalties', bundle -> 'penalties',
      'payouts', coalesce((select jsonb_agg(item - 'recorded_by')
                           from jsonb_array_elements(bundle -> 'payouts') as payout(item)), '[]'::jsonb)) order by d.full_name)
    from public.players_dealers d
    cross join lateral (select public.players_dealer_bundle(d.id) as bundle) b
    where d.is_active), '[]'::jsonb);
end $$;

-- Admin directory: every staff account (dealers, floor managers, admins) with its roles.
create or replace function public.players_admin_staff_directory()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('email', people.email,
                                        'full_name', (select full_name from public.players_dealers where email = people.email order by is_active desc limit 1),
                                        'roles', public.players_roles_of(people.email))
                     order by people.email)
    from (select email from public.players_dealers where is_active
          union select email from public.players_floor_managers
          union select email from public.players_admins) people), '[]'::jsonb);
end $$;

revoke all on function public.players_roles_of(text) from public, anon, authenticated;
revoke all on function public.players_my_roles() from public, anon;
revoke all on function public.players_admin_staff_directory() from public, anon;
grant execute on function public.players_my_roles() to authenticated;
grant execute on function public.players_admin_staff_directory() to authenticated;
