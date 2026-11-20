-- Checks the dealer staff functions and permissions (migration 20261121120000_players_dealers.sql).
-- Run in the Supabase SQL editor: it always rolls back and ends with 'ALL PASSED'.
begin;

insert into public.players_floor_managers (email) values ('sef.test@example.invalid');

create temporary table test_ids (name text primary key, id uuid);
grant all on test_ids to authenticated, anon;

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

-- Dealer signs, then checks in and out.
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001', 'dealer.test@example.invalid');
insert into test_ids values ('dealer', public.players_dealer_sign('Ion Popescu', 'data:image/png;base64,AAAA'));
select pg_temp.expect_error($$select public.players_dealer_sign('Ion Popescu', 'data:image/png;base64,AAAA')$$, 'Ai semnat deja');
select pg_temp.expect_error($$select public.players_dealer_sign('Io', 'data:image/png;base64,AAAA')$$, 'Scrie numele');
select public.players_dealer_check_in(now() - interval '3 hours');
select pg_temp.expect_error($$select public.players_dealer_check_in()$$, 'Ai deja o tură');
insert into test_ids values ('shift', public.players_dealer_check_out(now() - interval '1 hour'));
select pg_temp.expect_error($$select public.players_floor_dealers()$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_floor_set_tips((select id from test_ids where name = 'dealer'), current_date, 100)$$, 'Acces interzis');
select pg_temp.expect_error($$select * from public.players_dealers$$, 'permission denied');
select pg_temp.expect_error($$select * from public.players_dealer_tips$$, 'permission denied');
do $$ begin
  if (public.players_dealer_me() -> 'shifts' -> 0 ->> 'status') <> 'pending' then raise exception 'shift should be pending'; end if;
end $$;

-- Floor manager approves with corrected times, enters tips and a penalty.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000f001', 'sef.test@example.invalid');
do $$ begin
  if not public.is_players_floor_manager() then raise exception 'manager not recognised'; end if;
  if not exists (select 1 from public.players_floor_pending_shifts() where id = (select id from test_ids where name = 'shift')) then raise exception 'pending shift missing'; end if;
end $$;
select public.players_floor_review_shift((select id from test_ids where name = 'shift'), now() - interval '4 hours', now() - interval '1 hour', true);
select public.players_floor_set_tips((select id from test_ids where name = 'dealer'), (now() at time zone 'Europe/Bucharest')::date, 2000);
select public.players_floor_set_tips((select id from test_ids where name = 'dealer'), (now() at time zone 'Europe/Bucharest')::date, 2500);
select public.players_floor_add_penalty((select id from test_ids where name = 'dealer'), null, 100, 'Întârziere');
select pg_temp.expect_error($$select public.players_floor_review_shift((select id from test_ids where name = 'shift'), now(), now() - interval '1 hour', true)$$, 'după sosire');
select pg_temp.expect_error($$select public.players_floor_set_tips((select id from test_ids where name = 'dealer'), current_date + 5, 10)$$, 'Data nu este validă');
select pg_temp.expect_error($$select public.players_admin_add_floor_manager('alt@example.invalid')$$, 'Acces interzis');

-- Dealer sees the approved shift, the tips and the penalty.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001', 'dealer.test@example.invalid');
do $$
declare
  me jsonb := public.players_dealer_me();
begin
  if (me -> 'shifts' -> 0 ->> 'status') <> 'approved' then raise exception 'shift not approved'; end if;
  if (me -> 'tips' -> 0 ->> 'total')::numeric <> 2500 then raise exception 'tips not updated'; end if;
  if jsonb_array_length(me -> 'penalties') <> 1 then raise exception 'penalty missing'; end if;
end $$;

-- Another signed-in user is not a dealer and sees nothing.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000a001', 'altcineva@example.invalid');
do $$ begin
  if public.players_dealer_me() is not null then raise exception 'stranger sees a dealer card'; end if;
end $$;
select pg_temp.expect_error($$select public.players_dealer_check_in()$$, 'Nu ești înregistrat');

-- Anonymous visitors cannot call anything.
reset role;
set local role anon;
select pg_temp.expect_error($$select public.players_dealer_me()$$, 'permission denied');
select pg_temp.expect_error($$select public.players_floor_dealers()$$, 'permission denied');
reset role;

select 'ALL PASSED' as result;
rollback;
