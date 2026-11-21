-- Checks dealer payouts (migration 20261122100000_players_dealer_payouts.sql). Always rolls back; ends with 'ALL PASSED'.
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

create temp table test_ids (name text primary key, id uuid);
grant all on test_ids to authenticated;
insert into public.players_floor_managers (email, added_by) values ('pay.floor@example.invalid', 'test');

-- A dealer signs.
select pg_temp.as_user('00000000-0000-4000-8000-0000000c0001', 'pay.dealer@example.invalid');
insert into test_ids select 'dealer', public.players_dealer_sign('Plata Dealer', 'data:image/png;base64,AAAA');

-- The dealer cannot record a payout.
select pg_temp.expect_error(format($$select public.players_floor_record_payout(%L, 'month', '2026-01', 5000, 0, current_date, null)$$,
  (select id from test_ids where name = 'dealer')), 'Acces interzis');

-- The floor manager records last month's pay and a bonus.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000c0002', 'pay.floor@example.invalid');
insert into test_ids select 'month', public.players_floor_record_payout((select id from test_ids where name = 'dealer'), 'month',
  to_char((now() at time zone 'Europe/Bucharest')::date - interval '1 month', 'YYYY-MM'), 5000, 0, (now() at time zone 'Europe/Bucharest')::date, '  numerar  ');
insert into test_ids select 'bonus', public.players_floor_record_payout((select id from test_ids where name = 'dealer'), 'bonus',
  '2026-05-21', 5200, 1200, (now() at time zone 'Europe/Bucharest')::date, null);

-- Refusals: current month, future date, deposit part on a month, duplicate, bad period, zero amount.
select pg_temp.expect_error(format($$select public.players_floor_record_payout(%L, 'month', %L, 100, 0, current_date, null)$$,
  (select id from test_ids where name = 'dealer'), to_char((now() at time zone 'Europe/Bucharest')::date, 'YYYY-MM')), 'lunile încheiate');
select pg_temp.expect_error(format($$select public.players_floor_record_payout(%L, 'month', '2026-01', 100, 0, current_date + 2, null)$$,
  (select id from test_ids where name = 'dealer')), 'viitor');
select pg_temp.expect_error(format($$select public.players_floor_record_payout(%L, 'month', '2026-01', 100, 50, current_date, null)$$,
  (select id from test_ids where name = 'dealer')), 'depozit');
select pg_temp.expect_error(format($$select public.players_floor_record_payout(%L, 'bonus', '2026-05-21', 100, 0, current_date, null)$$,
  (select id from test_ids where name = 'dealer')), 'deja trecută');
select pg_temp.expect_error(format($$select public.players_floor_record_payout(%L, 'month', '2026-13', 100, 0, current_date, null)$$,
  (select id from test_ids where name = 'dealer')), 'Luna nu este validă');
select pg_temp.expect_error(format($$select public.players_floor_record_payout(%L, 'month', '2026-01', 0, 0, current_date, null)$$,
  (select id from test_ids where name = 'dealer')), 'suma');
select pg_temp.expect_error(format($$select public.players_floor_record_payout(%L, 'bonus', '2026-05-21', 100, 200, current_date, null)$$,
  (select id from test_ids where name = 'dealer')), 'depozit');

-- The bundle carries both payouts; the note is trimmed.
do $$
declare
  bundle jsonb := public.players_floor_dealer((select id from test_ids where name = 'dealer'));
begin
  if jsonb_array_length(bundle -> 'payouts') <> 2 then raise exception 'expected 2 payouts, got %', bundle -> 'payouts'; end if;
  if not exists (select 1 from jsonb_array_elements(bundle -> 'payouts') p where p ->> 'note' = 'numerar') then raise exception 'note not trimmed'; end if;
  if not exists (select 1 from jsonb_array_elements(bundle -> 'payouts') p where p ->> 'kind' = 'bonus' and (p ->> 'from_deposit')::numeric = 1200) then
    raise exception 'bonus deposit part missing';
  end if;
end $$;

-- The dealer sees their payouts; the team board hides who recorded them.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000c0001', 'pay.dealer@example.invalid');
do $$
begin
  if jsonb_array_length(public.players_dealer_me() -> 'payouts') <> 2 then raise exception 'dealer does not see payouts'; end if;
  if public.players_staff_board()::text like '%pay.floor@example.invalid%' then raise exception 'board leaks recorder email'; end if;
  if position('"payouts"' in public.players_staff_board()::text) = 0 then raise exception 'board misses payouts'; end if;
end $$;
select pg_temp.expect_error(format($$select public.players_floor_delete_payout(%L)$$, (select id from test_ids where name = 'month')), 'Acces interzis');

-- The floor manager deletes a payout to correct it; visitors get nothing.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000c0002', 'pay.floor@example.invalid');
select public.players_floor_delete_payout((select id from test_ids where name = 'month'));
select pg_temp.expect_error(format($$select public.players_floor_delete_payout(%L)$$, (select id from test_ids where name = 'month')), 'nu există');
reset role;
set local role anon;
select pg_temp.expect_error($$select public.players_floor_delete_payout(gen_random_uuid())$$, 'permission denied');
select pg_temp.expect_error($$select count(*) from public.players_dealer_payouts$$, 'permission denied');
reset role;

select 'ALL PASSED' as result;
rollback;
