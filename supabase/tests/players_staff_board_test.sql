-- Checks the staff board (migration 20261121170000_players_staff_board.sql). Always rolls back; ends with 'ALL PASSED'.
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

-- Two dealers sign; each sees both cards, without emails or signatures.
select pg_temp.as_user('00000000-0000-4000-8000-0000000b0001', 'board.one@example.invalid');
select public.players_dealer_sign('Board Unu', 'data:image/png;base64,AAAA');
select public.players_dealer_check_in(now() - interval '2 hours');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000b0002', 'board.two@example.invalid');
select public.players_dealer_sign('Board Doi', 'data:image/png;base64,AAAA');
do $$
declare
  board jsonb := public.players_staff_board();
  names text := (select string_agg(card -> 'dealer' ->> 'full_name', ',') from jsonb_array_elements(board) card);
begin
  if position('Board Unu' in names) = 0 or position('Board Doi' in names) = 0 then raise exception 'board misses a dealer: %', names; end if;
  if board::text like '%@example.invalid%' then raise exception 'board leaks emails'; end if;
  if board::text like '%data:image%' then raise exception 'board leaks signatures'; end if;
end $$;

-- Signed-in people who are not staff, and visitors, see nothing.
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000b0003', 'stranger.board@example.invalid');
select pg_temp.expect_error($$select public.players_staff_board()$$, 'Acces doar');
reset role;
set local role anon;
select pg_temp.expect_error($$select public.players_staff_board()$$, 'permission denied');
reset role;

select 'ALL PASSED' as result;
rollback;
