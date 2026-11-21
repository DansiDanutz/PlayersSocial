-- Checks floor manager requests approved by email link (migration 20261121150000_players_floor_requests.sql).
-- Always rolls back and ends with 'ALL PASSED'.
begin;

insert into public.players_server_keys (name, key_hash) values ('floor-request', public.players_sha256('test-server-key'))
on conflict (name) do update set key_hash = excluded.key_hash;
create or replace function pg_temp.h(p_value text) returns text language sql immutable as $$ select encode(sha256(convert_to(p_value, 'UTF8')), 'hex') $$;
create temporary table test_ids (id uuid);
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

-- Without the server key nobody can create a request, so nobody can choose their own token.
select pg_temp.as_user('00000000-0000-4000-8000-0000000fe001', 'Sef.Nou@Example.invalid');
select pg_temp.expect_error($$select public.players_floor_request_create('wrong', 'Maria Ionescu', repeat('a', 64))$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_floor_request_create('test-server-key', 'Maria', repeat('a', 64))$$, 'Scrie numele');
select pg_temp.expect_error($$select public.players_floor_request_create('test-server-key', 'Maria Ionescu', 'abc')$$, 'Cerere invalidă');
select public.players_floor_request_create('test-server-key', '  Maria   Ionescu ', pg_temp.h('token-1'));
select pg_temp.expect_error($$select public.players_floor_request_create('test-server-key', 'Maria Ionescu', repeat('b', 64))$$, 'Ai trimis deja');
select pg_temp.expect_error($$select * from public.players_floor_requests$$, 'permission denied');
select pg_temp.expect_error($$select * from public.players_server_keys$$, 'permission denied');
select pg_temp.expect_error($$select public.players_floor_request_decide('token-1', true)$$, 'permission denied');
do $$ begin
  if public.players_floor_request_mine() ->> 'status' <> 'pending' then raise exception 'request should be pending'; end if;
  if public.players_floor_request_mine() ->> 'full_name' <> 'Maria Ionescu' then raise exception 'name not cleaned'; end if;
  if public.is_players_floor_manager() then raise exception 'access before approval'; end if;
end $$;

-- The emailed link: a wrong token shows nothing, the right one approves once.
reset role;
set local role anon;
do $$ begin
  if public.players_floor_request_view('nope') is not null then raise exception 'wrong token sees a request'; end if;
  if public.players_floor_request_view('token-1') ->> 'email' <> 'sef.nou@example.invalid' then raise exception 'view broken'; end if;
end $$;
select pg_temp.expect_error($$select public.players_floor_request_decide('nope', true)$$, 'nu este valid');
select pg_temp.expect_error($$select public.players_floor_request_mine()$$, 'permission denied');
do $$ begin
  if public.players_floor_request_decide('token-1', true) <> 'approved' then raise exception 'not approved'; end if;
  if public.players_floor_request_decide('token-1', false) <> 'approved' then raise exception 'second click changed the decision'; end if;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000fe001', 'sef.nou@example.invalid');
do $$ begin
  if not public.is_players_floor_manager() then raise exception 'approval did not grant access'; end if;
end $$;
select pg_temp.expect_error($$select public.players_floor_request_create('test-server-key', 'Maria Ionescu', repeat('c', 64))$$, 'Ai deja acces');

-- A rejected request grants nothing; the person may ask again; expired links cannot be used.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000fe002', 'altul@example.invalid');
select public.players_floor_request_create('test-server-key', 'Ion Vasile', pg_temp.h('token-2'));
reset role;
select public.players_floor_request_decide('token-2', false);
select pg_temp.as_user('00000000-0000-4000-8000-0000000fe002', 'altul@example.invalid');
do $$ begin
  if public.is_players_floor_manager() then raise exception 'rejected request granted access'; end if;
  if public.players_floor_request_mine() ->> 'status' <> 'rejected' then raise exception 'status not rejected'; end if;
end $$;
select public.players_floor_request_create('test-server-key', 'Ion Vasile', pg_temp.h('token-3'));
reset role;
update public.players_floor_requests set expires_at = now() - interval '1 minute' where token_hash = pg_temp.h('token-3');
select pg_temp.expect_error($$select public.players_floor_request_decide('token-3', true)$$, 'a expirat');
select pg_temp.as_user('00000000-0000-4000-8000-0000000fe002', 'altul@example.invalid');
insert into test_ids select public.players_floor_request_create('test-server-key', 'Ion Vasile', pg_temp.h('token-4'));
select pg_temp.expect_error($$select public.players_floor_request_create('test-server-key', 'Ion Vasile', repeat('d', 64))$$, 'Ai trimis deja');
do $$ begin
  if not public.players_floor_request_cancel('test-server-key', (select id from test_ids)) then raise exception 'cancel failed'; end if;
end $$;
select public.players_floor_request_create('test-server-key', 'Ion Vasile', pg_temp.h('token-5'));
reset role;
select public.players_floor_request_decide('token-5', false);
select pg_temp.as_user('00000000-0000-4000-8000-0000000fe002', 'altul@example.invalid');
select pg_temp.expect_error($$select public.players_floor_request_create('test-server-key', 'Ion Vasile', repeat('e', 64))$$, 'prea multe cereri');
reset role;

-- Admins see pending requests in the panel and decide them there; others cannot.
select pg_temp.as_user('00000000-0000-4000-8000-0000000fe003', 'panel.cerere@example.invalid');
insert into test_ids select public.players_floor_request_create('test-server-key', 'Ana Panel', pg_temp.h('token-6'));
select pg_temp.expect_error($$select * from public.players_admin_list_floor_requests()$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_admin_decide_floor_request((select id from test_ids order by id limit 1), true)$$, 'Acces interzis');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000fe004', (select email from public.players_admins limit 1));
do $$
declare
  pending_id uuid := (select id from public.players_admin_list_floor_requests() where full_name = 'Ana Panel');
begin
  if pending_id is null then raise exception 'admin does not see the pending request'; end if;
  if public.players_admin_decide_floor_request(pending_id, true) <> 'approved' then raise exception 'panel approval failed'; end if;
  if exists (select 1 from public.players_admin_list_floor_requests() where id = pending_id) then raise exception 'decided request still listed'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.players_floor_managers where email = 'panel.cerere@example.invalid') then raise exception 'panel approval did not grant access'; end if;
end $$;

select 'ALL PASSED' as result;
rollback;
