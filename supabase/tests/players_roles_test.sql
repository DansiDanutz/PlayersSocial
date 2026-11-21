-- Checks account roles (migration 20261122120000_players_roles.sql). Always rolls back; ends with 'ALL PASSED'.
begin;

create or replace function pg_temp.as_user(p_sub text, p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'email', p_email, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function pg_temp.expect_error(p_sql text, p_fragment text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'Expected error containing "%" from: %', p_fragment, p_sql;
exception when others then
  if position(p_fragment in sqlerrm) = 0 then raise exception 'Wrong error for %: %', p_sql, sqlerrm; end if;
end $$;

insert into public.players_floor_managers (email, added_by) values ('roles.floor@example.invalid', 'test');
insert into public.players_admins (email) values ('roles.boss@example.invalid');

-- A plain dealer.
select pg_temp.as_user('00000000-0000-4000-8000-0000000d0001', 'roles.dealer@example.invalid');
select public.players_dealer_sign('Rol Dealer', 'data:image/png;base64,AAAA');
do $$ begin
  if public.players_my_roles() <> '{"dealer": true, "floor": false, "admin": false}'::jsonb then raise exception 'dealer roles: %', public.players_my_roles(); end if;
end $$;
select pg_temp.expect_error($$select public.players_admin_staff_directory()$$, 'Acces interzis');

-- A floor manager who also signed as dealer.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000d0002', 'roles.floor@example.invalid');
select public.players_dealer_sign('Rol Sef', 'data:image/png;base64,AAAA');
do $$ begin
  if public.players_my_roles() <> '{"dealer": true, "floor": true, "admin": false}'::jsonb then raise exception 'floor roles: %', public.players_my_roles(); end if;
end $$;

-- The super admin is a floor manager automatically; the directory lists everyone with roles.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000d0003', 'roles.boss@example.invalid');
do $$
declare
  directory jsonb := public.players_admin_staff_directory();
  board jsonb := public.players_staff_board();
begin
  if public.players_my_roles() <> '{"dealer": false, "floor": true, "admin": true}'::jsonb then raise exception 'admin roles: %', public.players_my_roles(); end if;
  if not exists (select 1 from jsonb_array_elements(directory) p where p ->> 'email' = 'roles.floor@example.invalid'
                 and p ->> 'full_name' = 'Rol Sef' and p -> 'roles' = '{"dealer": true, "floor": true, "admin": false}'::jsonb) then
    raise exception 'directory misses the floor manager: %', directory;
  end if;
  if not exists (select 1 from jsonb_array_elements(directory) p where p ->> 'email' = 'roles.boss@example.invalid' and (p -> 'roles' ->> 'admin')::boolean) then
    raise exception 'directory misses the admin';
  end if;
  if not exists (select 1 from jsonb_array_elements(board) c where c -> 'dealer' ->> 'full_name' = 'Rol Sef' and (c -> 'roles' ->> 'floor')::boolean) then
    raise exception 'board misses roles';
  end if;
  if board::text like '%@example.invalid%' then raise exception 'board leaks emails'; end if;
end $$;

-- Visitors cannot read roles.
reset role;
set local role anon;
select pg_temp.expect_error($$select public.players_my_roles()$$, 'permission denied');
select pg_temp.expect_error($$select public.players_roles_of('x@example.invalid')$$, 'permission denied');
reset role;

select 'ALL PASSED' as result;
rollback;
