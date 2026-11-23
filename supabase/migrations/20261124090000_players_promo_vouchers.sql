-- Promo vouchers (500 lei = 5 x 100 lei Bonus Cash Game) issued by Mirela, the AI voice assistant on /promotions.
-- DRAFT — NOT APPLIED. Needs Dan's approval before it runs on the production Supabase project.
--
-- Flow (no code beforehand):
--   1. Mirela asks 3 questions + confirms first/last name, then calls the browser client tool issue_voucher.
--   2. The page POSTs to /api/promo-voucher, which checks the ElevenLabs conversation server-side and calls
--      players_promo_voucher_issue (server key). The serial (PPC-V-000123) + a 4-char check are returned.
--   3. The page shows a WhatsApp button: "Confirm voucher PPC-V-000123 (K7QM) – Andrei Popescu".
--   4. When that message reaches the club number, Memo (after Dan approves that change) calls
--      players_promo_voucher_attach_phone with serial + check + sender phone. Only then is the voucher confirmed.
-- Pattern follows players_floor_requests: RLS on, no table grants, access only through security definer functions.
-- Server keys: 'promo-voucher' (Vercel function) and 'promo-voucher-memo' (Memo), hashes inserted outside migrations.

create sequence if not exists public.players_promo_voucher_serial_seq start 1;

create table if not exists public.players_promo_vouchers (
  id uuid primary key default gen_random_uuid(),
  serial text not null unique default ('PPC-V-' || lpad(nextval('public.players_promo_voucher_serial_seq')::text, 6, '0')),
  check_code text not null check (check_code ~ '^[A-HJ-NP-Z2-9]{4}$'),         -- stops anyone claiming a guessed sequential serial
  full_name text not null check (char_length(full_name) between 3 and 120),
  first_name text not null check (char_length(first_name) between 1 and 60),
  q1_preference text not null check (q1_preference in ('cash', 'tournaments', 'both', 'other')),
  q2_stakes text not null check (q2_stakes in ('low_2_5', 'high_5_10_plus', 'both', 'not_applicable', 'other')),
  invite_consent boolean not null,                                            -- answer to question 3
  consent_text text not null default 'Când clubul reia jocurile de poker, vă putem invita la turnee și cash games?',
  source text not null default 'voice_agent' check (source in ('voice_agent', 'admin')),
  conversation_id text unique,                                                -- ElevenLabs conversation (one voucher per conversation)
  created_at timestamptz not null default now(),                              -- issued (serial generated)
  phone text check (phone ~ '^\+[0-9]{8,15}$'),                               -- attached when the WhatsApp confirmation arrives
  whatsapp_confirmed_at timestamptz,
  redeemed_count smallint not null default 0 check (redeemed_count between 0 and 5),   -- 5 coupons x 100 lei
  last_redeemed_at timestamptz,
  opted_out_at timestamptz,
  void_reason text,
  notes text,
  check ((phone is null) = (whatsapp_confirmed_at is null))
);
-- One confirmed voucher per phone number.
create unique index if not exists players_promo_vouchers_phone_uq on public.players_promo_vouchers (phone) where phone is not null;
create index if not exists players_promo_vouchers_created_idx on public.players_promo_vouchers (created_at desc);

alter table public.players_promo_vouchers enable row level security;
revoke all on public.players_promo_vouchers from public, anon, authenticated;
revoke all on sequence public.players_promo_voucher_serial_seq from public, anon, authenticated;

create or replace function public.players_promo_new_check()
returns text language sql volatile set search_path = public
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 4)
$$;

-- Called only by /api/promo-voucher (server key 'promo-voucher') after it verified the ElevenLabs conversation.
-- Idempotent per conversation: a second call returns the same serial. Soft cap on unconfirmed issues per hour.
create or replace function public.players_promo_voucher_issue(
  p_server_key text, p_conversation_id text, p_full_name text, p_first_name text,
  p_q1 text, p_q2 text, p_invite_consent boolean)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  clean_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  clean_first text := regexp_replace(btrim(coalesce(p_first_name, '')), '\s+', ' ', 'g');
  v public.players_promo_vouchers;
begin
  perform public.players_require_server_key('promo-voucher', p_server_key);
  if coalesce(p_conversation_id, '') !~ '^conv_[a-z0-9]{10,60}$' then raise exception 'Conversație invalidă'; end if;
  if char_length(clean_name) < 3 or char_length(clean_name) > 120 then raise exception 'Nume invalid'; end if;
  if clean_first = '' then clean_first := split_part(clean_name, ' ', 1); end if;
  if p_invite_consent is null then raise exception 'Lipsește răspunsul la întrebarea 3'; end if;
  select * into v from public.players_promo_vouchers where conversation_id = p_conversation_id;
  if found then
    return jsonb_build_object('serial', v.serial, 'check', v.check_code, 'first_name', v.first_name, 'already_issued', true);
  end if;
  if (select count(*) from public.players_promo_vouchers
      where whatsapp_confirmed_at is null and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Prea multe cereri, încercați mai târziu';
  end if;
  insert into public.players_promo_vouchers (check_code, full_name, first_name, q1_preference, q2_stakes, invite_consent, conversation_id)
  values (public.players_promo_new_check(), clean_name, left(clean_first, 60),
          case when p_q1 in ('cash', 'tournaments', 'both') then p_q1 else 'other' end,
          case when p_q2 in ('low_2_5', 'high_5_10_plus', 'both', 'not_applicable') then p_q2 else 'other' end,
          p_invite_consent, p_conversation_id)
  returning * into v;
  return jsonb_build_object('serial', v.serial, 'check', v.check_code, 'first_name', v.first_name, 'already_issued', false);
end $$;

-- Called only by Memo (server key 'promo-voucher-memo') when "Confirm voucher PPC-V-000123 (K7QM) – Nume" arrives.
-- Result status: confirmed | already_confirmed (same phone) | phone_has_voucher | claimed_by_other | not_found | opted_out.
create or replace function public.players_promo_voucher_attach_phone(
  p_server_key text, p_serial text, p_check text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v public.players_promo_vouchers;
  other public.players_promo_vouchers;
begin
  perform public.players_require_server_key('promo-voucher-memo', p_server_key);
  if coalesce(p_phone, '') !~ '^\+[0-9]{8,15}$' then raise exception 'Telefon invalid'; end if;
  select * into v from public.players_promo_vouchers
    where serial = upper(btrim(p_serial)) and check_code = upper(btrim(coalesce(p_check, '')))
    for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v.opted_out_at is not null or v.void_reason is not null then
    return jsonb_build_object('status', 'opted_out', 'serial', v.serial);
  end if;
  if v.phone is not null then
    return jsonb_build_object('status', case when v.phone = p_phone then 'already_confirmed' else 'claimed_by_other' end,
                              'serial', v.serial, 'first_name', v.first_name);
  end if;
  select * into other from public.players_promo_vouchers where phone = p_phone;
  if found then
    return jsonb_build_object('status', 'phone_has_voucher', 'serial', other.serial, 'first_name', other.first_name);
  end if;
  update public.players_promo_vouchers set phone = p_phone, whatsapp_confirmed_at = now()
    where id = v.id returning * into v;
  return jsonb_build_object('status', 'confirmed', 'serial', v.serial, 'first_name', v.first_name,
                            'invite_consent', v.invite_consent);
end $$;

-- Public winners list: ONLY serial, first name and date, and only WhatsApp-confirmed vouchers.
create or replace view public.players_promo_winners_public
with (security_invoker = false) as
  select serial, first_name, (whatsapp_confirmed_at at time zone 'Europe/Bucharest')::date as issued_on
  from public.players_promo_vouchers
  where whatsapp_confirmed_at is not null and opted_out_at is null and void_reason is null
  order by whatsapp_confirmed_at desc;
revoke all on public.players_promo_winners_public from public;
grant select on public.players_promo_winners_public to anon, authenticated;

-- Admin "Voucher list": full history. Super admins only (phones are personal data).
create or replace function public.players_admin_promo_vouchers()
returns setof public.players_promo_vouchers language plpgsql stable security definer set search_path = public
as $$
begin
  if not coalesce(public.is_players_super_admin(), false) then raise exception 'Acces interzis'; end if;
  return query select * from public.players_promo_vouchers order by created_at desc;
end $$;

-- Actions: redeem (+1 of 5 coupons), opt_out (STOP), void (with reason), note.
create or replace function public.players_admin_promo_voucher_update(p_serial text, p_action text, p_notes text default null)
returns public.players_promo_vouchers language plpgsql security definer set search_path = public
as $$
declare v public.players_promo_vouchers;
begin
  if not coalesce(public.is_players_super_admin(), false) then raise exception 'Acces interzis'; end if;
  if p_action not in ('redeem', 'opt_out', 'void', 'note') then raise exception 'Acțiune invalidă'; end if;
  select * into v from public.players_promo_vouchers where serial = p_serial for update;
  if not found then raise exception 'Voucher inexistent'; end if;
  if p_action = 'redeem' and v.whatsapp_confirmed_at is null then raise exception 'Voucherul nu e confirmat pe WhatsApp'; end if;
  if p_action = 'redeem' and (v.void_reason is not null or v.opted_out_at is not null) then raise exception 'Voucherul este închis (STOP sau anulat)'; end if;
  update public.players_promo_vouchers set
    redeemed_count   = case when p_action = 'redeem' then redeemed_count + 1 else redeemed_count end,
    last_redeemed_at = case when p_action = 'redeem' then now() else last_redeemed_at end,
    opted_out_at     = case when p_action = 'opt_out' then now() else opted_out_at end,
    void_reason      = case when p_action = 'void' then coalesce(nullif(left(p_notes, 200), ''), 'anulat') else void_reason end,
    notes            = case when p_action = 'note' then left(p_notes, 500) else notes end
  where id = v.id
  returning * into v;
  return v;   -- redeemed_count > 5 is refused by the check constraint (all 5 coupons used)
end $$;

revoke all on function public.players_promo_new_check() from public, anon, authenticated;
revoke all on function public.players_promo_voucher_issue(text, text, text, text, text, text, boolean) from public, authenticated;
grant execute on function public.players_promo_voucher_issue(text, text, text, text, text, text, boolean) to anon;      -- still needs the server key
revoke all on function public.players_promo_voucher_attach_phone(text, text, text, text) from public, authenticated;
grant execute on function public.players_promo_voucher_attach_phone(text, text, text, text) to anon;                  -- still needs the Memo key
revoke all on function public.players_admin_promo_vouchers() from public, anon;
revoke all on function public.players_admin_promo_voucher_update(text, text, text) from public, anon;
grant execute on function public.players_admin_promo_vouchers() to authenticated;
grant execute on function public.players_admin_promo_voucher_update(text, text, text) to authenticated;

-- After applying (outside migrations, never committed):
--   insert into public.players_server_keys(name, key_hash) values
--     ('promo-voucher',      public.players_sha256('<PROMO_VOUCHER_KEY>')),
--     ('promo-voucher-memo', public.players_sha256('<PROMO_VOUCHER_MEMO_KEY>'));
