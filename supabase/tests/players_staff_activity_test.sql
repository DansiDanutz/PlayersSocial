-- Checks the activity history (migration 20261122160000_players_staff_activity.sql). Always rolls back; ends with 'ALL PASSED'.
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

create temp table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;
insert into public.players_floor_managers (email, added_by) values ('activity.floor@example.invalid', 'test');

-- The dealer signs, arrives and leaves.
select pg_temp.as_user('00000000-0000-4000-8000-0000000a0001', 'activity.dealer@example.invalid');
insert into ids select 'dealer', public.players_dealer_sign('Ion Activitate', 'data:image/png;base64,AAAA');
select public.players_dealer_check_in(now() - interval '6 hours');
select public.players_dealer_check_out(now() - interval '1 hour');
select pg_temp.expect_error($$select public.players_floor_activity()$$, 'Acces interzis');
reset role;
insert into ids select 'shift', id from public.players_dealer_shifts where dealer_id = (select id from ids where name = 'dealer');

-- The floor manager corrects and approves the shift, enters and overwrites tips, adds and removes a penalty.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a0002', 'activity.floor@example.invalid');
do $$
declare
  dealer uuid := (select id from ids where name = 'dealer');
  shift uuid := (select id from ids where name = 'shift');
  today date := (now() at time zone 'Europe/Bucharest')::date;
begin
  perform public.players_floor_review_shift(shift, now() - interval '7 hours', now() - interval '1 hour', true);
  perform public.players_floor_set_tips(dealer, today, 1000);
  perform public.players_floor_set_tips(dealer, today, 1500);
  perform public.players_floor_set_tips(dealer, today, 1500);
  perform public.players_floor_add_penalty(dealer, today, 50, 'Întârziere');
end $$;
reset role;
insert into ids select 'penalty', id from public.players_dealer_penalties where dealer_id = (select id from ids where name = 'dealer');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a0002', 'activity.floor@example.invalid');
select public.players_floor_delete_penalty((select id from ids where name = 'penalty'));
do $$
declare
  log jsonb;
  mine jsonb;
begin
  log := (select jsonb_agg(e) from jsonb_array_elements(public.players_floor_activity(50)) e where e ->> 'dealer' = 'Ion Activitate');
  if (select jsonb_agg(e ->> 'action') from jsonb_array_elements(log) e)
     <> '["penalty_removed", "penalty_added", "tips_set", "tips_set", "shift_approved", "check_out", "check_in"]'::jsonb then
    raise exception 'unexpected history: %', (select jsonb_agg(e ->> 'action') from jsonb_array_elements(log) e);
  end if;
  mine := log -> 2;
  if (mine -> 'details' ->> 'total')::numeric <> 1500 or (mine -> 'details' ->> 'previous')::numeric <> 1000 then raise exception 'tips overwrite not recorded: %', mine; end if;
  if not (mine ->> 'mine')::boolean then raise exception 'own action not marked mine'; end if;
  if (log -> 4 -> 'details' ->> 'corrected')::boolean is not true then raise exception 'correction not flagged: %', log -> 4; end if;
  if log -> 6 ->> 'actor' <> 'Ion Activitate' or (log -> 6 ->> 'mine')::boolean then raise exception 'dealer action wrongly attributed: %', log -> 6; end if;
  if log::text like '%@example.invalid%' then raise exception 'history leaks full emails'; end if;
end $$;

-- Nobody reads or writes the log table directly.
select pg_temp.expect_error($$select * from public.players_staff_activity$$, 'permission denied');
select pg_temp.expect_error($$insert into public.players_staff_activity (action) values ('x')$$, 'permission denied');
reset role;
set local role anon;
select pg_temp.expect_error($$select public.players_floor_activity()$$, 'permission denied');
reset role;

select 'ALL PASSED' as result;
rollback;
