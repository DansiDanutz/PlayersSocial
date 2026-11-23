-- Checks the promo vouchers (migration 20261124090000_players_promo_vouchers.sql). Always rolls back; ends with 'ALL PASSED'.
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

insert into public.players_server_keys(name, key_hash) values
  ('promo-voucher', public.players_sha256('test-issue-key')), ('promo-voucher-memo', public.players_sha256('test-memo-key'))
  on conflict (name) do update set key_hash = excluded.key_hash;

do $$
declare
  a jsonb; again jsonb; b jsonb; r jsonb;
begin
  a := public.players_promo_voucher_issue('test-issue-key', 'conv_test0000000001', ' Andrei   Testescu ', '', 'cash', 'low_2_5', false);
  if a ->> 'serial' !~ '^PPC-V-[0-9]{6}$' or a ->> 'check' !~ '^[A-HJ-NP-Z2-9]{4}$' then raise exception 'bad serial/check: %', a; end if;
  again := public.players_promo_voucher_issue('test-issue-key', 'conv_test0000000001', 'Andrei Testescu', 'Andrei', 'cash', 'low_2_5', false);
  if again ->> 'serial' <> a ->> 'serial' or (again ->> 'already_issued')::boolean is not true then raise exception 'not idempotent per conversation'; end if;
  b := public.players_promo_voucher_issue('test-issue-key', 'conv_test0000000002', 'Elena Probescu', 'Elena', 'tournaments', 'zzz', true);
  if (select q2_stakes from public.players_promo_vouchers where serial = b ->> 'serial') <> 'other' then raise exception 'unknown answer not normalised'; end if;

  r := public.players_promo_voucher_attach_phone('test-memo-key', a ->> 'serial', 'ZZZZ', '+40722000111');
  if r ->> 'status' <> 'not_found' then raise exception 'wrong check accepted: %', r; end if;
  r := public.players_promo_voucher_attach_phone('test-memo-key', lower(a ->> 'serial'), lower(a ->> 'check'), '+40722000111');
  if r ->> 'status' <> 'confirmed' then raise exception 'confirm failed: %', r; end if;
  r := public.players_promo_voucher_attach_phone('test-memo-key', a ->> 'serial', a ->> 'check', '+40722000111');
  if r ->> 'status' <> 'already_confirmed' then raise exception 'repeat: %', r; end if;
  r := public.players_promo_voucher_attach_phone('test-memo-key', a ->> 'serial', a ->> 'check', '+40722000999');
  if r ->> 'status' <> 'claimed_by_other' then raise exception 'other phone: %', r; end if;
  r := public.players_promo_voucher_attach_phone('test-memo-key', b ->> 'serial', b ->> 'check', '+40722000111');
  if r ->> 'status' <> 'phone_has_voucher' then raise exception 'second voucher for one phone: %', r; end if;

  if not exists (select 1 from public.players_promo_winners_public where serial = a ->> 'serial') then raise exception 'confirmed voucher missing from public list'; end if;
  if exists (select 1 from public.players_promo_winners_public where serial = b ->> 'serial') then raise exception 'unconfirmed voucher on public list'; end if;
end $$;

select pg_temp.expect_error($$select public.players_promo_voucher_issue('wrong', 'conv_test0000000003', 'Ab Cd', 'Ab', 'cash', 'low_2_5', true)$$, '');
select pg_temp.expect_error($$select public.players_promo_voucher_attach_phone('test-issue-key', 'PPC-V-000001', 'AAAA', '+40722000111')$$, '');
select pg_temp.expect_error($$select public.players_promo_voucher_issue('test-issue-key', 'not-a-conversation', 'Ab Cd', 'Ab', 'cash', 'low_2_5', true)$$, 'Conversație invalidă');

-- The public sees only serial, first name and date; the table and the admin list stay closed.
set local role anon;
select pg_temp.expect_error($$select * from public.players_promo_vouchers$$, 'permission denied');
select pg_temp.expect_error($$select * from public.players_admin_promo_vouchers()$$, 'permission denied');
do $$ begin
  if (select count(*) from public.players_promo_winners_public) < 1 then raise exception 'anon cannot read the public list'; end if;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000c0001', 'stranger.promo@example.invalid');
select pg_temp.expect_error($$select * from public.players_admin_promo_vouchers()$$, 'Acces interzis');
select pg_temp.expect_error($$select public.players_admin_promo_voucher_update('PPC-V-000001', 'redeem')$$, 'Acces interzis');
reset role;

select 'ALL PASSED' as result;
rollback;
