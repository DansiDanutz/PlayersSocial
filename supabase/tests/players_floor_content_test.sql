-- Checks floor managers as content editors (migration 20261122140000_players_floor_content_editors.sql).
-- Always rolls back; ends with 'ALL PASSED'.
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

insert into public.players_floor_managers (email, added_by) values ('content.floor@example.invalid', 'test');
insert into public.players_admins (email) values ('content.boss@example.invalid');

-- A floor manager edits content: events, schedule, notifications.
select pg_temp.as_user('00000000-0000-4000-8000-0000000c0001', 'content.floor@example.invalid');
do $$
declare
  future_day date := (now() at time zone 'Europe/Bucharest')::date + 40;
begin
  if not public.is_players_admin() then raise exception 'floor manager is not a content editor'; end if;
  if public.is_players_super_admin() then raise exception 'floor manager became super admin'; end if;
  if not public.is_players_floor_manager() then raise exception 'floor manager lost floor access'; end if;
  perform public.players_admin_create_event('Content Event', 'Remi & Prieteni', future_day, '18:00', 24,
                                            'Descriere de test suficient de lungă.', 'Loc', '/poster-remi.webp');
  if not exists (select 1 from public.players_public_events() where event_name = 'Content Event') then
    raise exception 'floor manager could not create an event';
  end if;
  perform public.players_admin_set_schedule_day(future_day + 1, 'Remi & Prieteni', null);
  perform public.players_admin_clear_schedule_day(future_day + 1);
end $$;

-- ...but cannot manage access.
select pg_temp.expect_error($$select public.players_admin_add_admin('x@example.invalid')$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_admin_list_admins()$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_admin_remove_admin('content.boss@example.invalid')$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_admin_add_floor_manager('x@example.invalid')$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_admin_list_floor_managers()$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_admin_remove_floor_manager('content.floor@example.invalid')$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_admin_list_floor_requests()$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_admin_decide_floor_request(gen_random_uuid(), true)$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_admin_staff_directory()$$, 'Acces interzis');

-- The super admin still manages access.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000c0002', 'content.boss@example.invalid');
do $$
begin
  if not public.is_players_super_admin() or not public.is_players_admin() then raise exception 'super admin lost access'; end if;
  perform public.players_admin_add_floor_manager('content.new@example.invalid');
  if not exists (select 1 from public.players_admin_list_floor_managers() where email = 'content.new@example.invalid') then
    raise exception 'super admin could not add a floor manager';
  end if;
  perform public.players_admin_remove_floor_manager('content.new@example.invalid');
  perform public.players_admin_list_admins();
  perform public.players_admin_staff_directory();
end $$;

-- A signed-in visitor has neither.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000c0003', 'content.visitor@example.invalid');
do $$
begin
  if public.is_players_admin() or public.is_players_super_admin() then raise exception 'visitor got editor access'; end if;
end $$;
select pg_temp.expect_error($$select public.players_admin_clear_schedule_day(current_date)$$, 'Acces interzis');

-- Visitors cannot call the check.
reset role;
set local role anon;
select pg_temp.expect_error($$select public.is_players_super_admin()$$, 'permission denied');
reset role;

select 'ALL PASSED' as result;
rollback;
