-- Dealer staff app: dealers sign the /dealers-payout rules, record arrival and departure every day, and floor
-- managers (șefi de sală) approve or correct those hours and enter each dealer's daily tips and penalties.
-- Tables hold raw facts only; every amount is derived in dist/staff/dealer-math.js.
-- No table is readable or writable directly: all access goes through the security definer functions below.

create table if not exists public.players_floor_managers (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now(),
  added_by text
);

create table if not exists public.players_dealers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text not null,
  full_name text not null check (char_length(btrim(full_name)) between 3 and 120),
  signature text not null check (signature like 'data:image/png;base64,%' and char_length(signature) <= 300000),
  signed_at timestamptz not null default now(),
  start_date date not null default (now() at time zone 'Europe/Bucharest')::date,
  is_active boolean not null default true
);

create table if not exists public.players_dealer_shifts (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.players_dealers(id) on delete cascade,
  check_in timestamptz not null,
  check_out timestamptz,
  status text not null default 'open' check (status in ('open', 'pending', 'approved', 'rejected')),
  dealer_check_in timestamptz,
  dealer_check_out timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (check_out is null or check_out > check_in),
  check (check_out is null or check_out - check_in <= interval '16 hours'),
  check (status = 'open' or check_out is not null)
);
create unique index if not exists players_dealer_one_open_shift on public.players_dealer_shifts (dealer_id) where status = 'open';
create index if not exists players_dealer_shifts_by_dealer on public.players_dealer_shifts (dealer_id, check_in desc);

create table if not exists public.players_dealer_tips (
  dealer_id uuid not null references public.players_dealers(id) on delete cascade,
  day date not null,
  total numeric(10, 2) not null check (total >= 0 and total <= 100000),
  entered_by text not null,
  entered_at timestamptz not null default now(),
  primary key (dealer_id, day)
);

create table if not exists public.players_dealer_penalties (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.players_dealers(id) on delete cascade,
  day date not null,
  amount numeric(10, 2) not null check (amount > 0 and amount <= 100000),
  reason text not null check (char_length(btrim(reason)) between 2 and 300),
  created_by text not null,
  created_at timestamptz not null default now()
);

alter table public.players_floor_managers enable row level security;
alter table public.players_dealers enable row level security;
alter table public.players_dealer_shifts enable row level security;
alter table public.players_dealer_tips enable row level security;
alter table public.players_dealer_penalties enable row level security;
revoke all on public.players_floor_managers, public.players_dealers, public.players_dealer_shifts,
  public.players_dealer_tips, public.players_dealer_penalties from public, anon, authenticated;

-- ---------- helpers ----------

create or replace function public.players_current_email()
returns text language sql stable set search_path = public
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_players_floor_manager()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_players_admin()
      or exists (select 1 from public.players_floor_managers where email = public.players_current_email());
$$;

create or replace function public.players_require_floor_manager()
returns void language plpgsql stable security definer set search_path = public
as $$ begin if not public.is_players_floor_manager() then raise exception 'Acces interzis'; end if; end $$;

create or replace function public.players_validate_shift_times(p_check_in timestamptz, p_check_out timestamptz)
returns void language plpgsql immutable
as $$
begin
  if p_check_in is null then raise exception 'Ora de sosire lipsește'; end if;
  if p_check_out is not null and p_check_out <= p_check_in then raise exception 'Plecarea trebuie să fie după sosire'; end if;
  if p_check_out is not null and p_check_out - p_check_in > interval '16 hours' then raise exception 'O tură poate avea cel mult 16 ore'; end if;
end $$;

create or replace function public.players_dealer_bundle(p_dealer uuid)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'dealer', (select jsonb_build_object('id', d.id, 'full_name', d.full_name, 'email', d.email, 'signed_at', d.signed_at,
                                         'start_date', d.start_date, 'is_active', d.is_active)
               from public.players_dealers d where d.id = p_dealer),
    'shifts', coalesce((select jsonb_agg(to_jsonb(s) - 'dealer_id' order by s.check_in desc)
                        from public.players_dealer_shifts s where s.dealer_id = p_dealer), '[]'::jsonb),
    'tips', coalesce((select jsonb_agg(jsonb_build_object('day', t.day, 'total', t.total) order by t.day)
                      from public.players_dealer_tips t where t.dealer_id = p_dealer), '[]'::jsonb),
    'penalties', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'day', p.day, 'amount', p.amount, 'reason', p.reason) order by p.day desc)
                           from public.players_dealer_penalties p where p.dealer_id = p_dealer), '[]'::jsonb)
  );
$$;

create or replace function public.players_my_dealer_id()
returns uuid language sql stable security definer set search_path = public
as $$ select id from public.players_dealers where user_id = auth.uid() and is_active $$;

-- ---------- dealer ----------

create or replace function public.players_dealer_sign(p_full_name text, p_signature text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Intră în cont ca să semnezi'; end if;
  if char_length(btrim(coalesce(p_full_name, ''))) < 3 then raise exception 'Scrie numele și prenumele'; end if;
  if coalesce(p_signature, '') not like 'data:image/png;base64,%' or char_length(p_signature) > 300000 then raise exception 'Semnătura lipsește'; end if;
  if exists (select 1 from public.players_dealers where user_id = auth.uid()) then raise exception 'Ai semnat deja regulamentul'; end if;
  insert into public.players_dealers (user_id, email, full_name, signature)
  values (auth.uid(), public.players_current_email(), btrim(p_full_name), p_signature)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.players_dealer_me()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  me uuid := public.players_my_dealer_id();
begin
  if me is null then return null; end if;
  return public.players_dealer_bundle(me);
end $$;

create or replace function public.players_dealer_check_in(p_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  me uuid := public.players_my_dealer_id();
  at_time timestamptz := coalesce(p_at, now());
  new_id uuid;
begin
  if me is null then raise exception 'Nu ești înregistrat ca dealer'; end if;
  if at_time > now() + interval '5 minutes' or at_time < now() - interval '2 days' then raise exception 'Ora de sosire nu este validă'; end if;
  if exists (select 1 from public.players_dealer_shifts where dealer_id = me and status = 'open') then raise exception 'Ai deja o tură începută'; end if;
  insert into public.players_dealer_shifts (dealer_id, check_in, dealer_check_in, status)
  values (me, at_time, at_time, 'open') returning id into new_id;
  return new_id;
end $$;

create or replace function public.players_dealer_check_out(p_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  me uuid := public.players_my_dealer_id();
  at_time timestamptz := coalesce(p_at, now());
  shift public.players_dealer_shifts;
begin
  if me is null then raise exception 'Nu ești înregistrat ca dealer'; end if;
  select * into shift from public.players_dealer_shifts where dealer_id = me and status = 'open';
  if not found then raise exception 'Nu ai o tură începută'; end if;
  if at_time > now() + interval '5 minutes' then raise exception 'Ora de plecare nu este validă'; end if;
  perform public.players_validate_shift_times(shift.check_in, at_time);
  update public.players_dealer_shifts set check_out = at_time, dealer_check_out = at_time, status = 'pending' where id = shift.id;
  return shift.id;
end $$;

-- A dealer who forgot to press the buttons writes the times afterwards; it still waits for approval.
create or replace function public.players_dealer_add_shift(p_check_in timestamptz, p_check_out timestamptz)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  me uuid := public.players_my_dealer_id();
  new_id uuid;
begin
  if me is null then raise exception 'Nu ești înregistrat ca dealer'; end if;
  perform public.players_validate_shift_times(p_check_in, p_check_out);
  if p_check_out is null then raise exception 'Ora de plecare lipsește'; end if;
  if p_check_out > now() + interval '5 minutes' or p_check_in < now() - interval '7 days' then raise exception 'Poți adăuga doar ture din ultimele 7 zile'; end if;
  insert into public.players_dealer_shifts (dealer_id, check_in, check_out, dealer_check_in, dealer_check_out, status)
  values (me, p_check_in, p_check_out, p_check_in, p_check_out, 'pending') returning id into new_id;
  return new_id;
end $$;

-- ---------- floor manager ----------

create or replace function public.players_floor_dealers()
returns table (id uuid, full_name text, email text, start_date date, is_active boolean, open_shift boolean, pending_shifts bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.players_require_floor_manager();
  return query
    select d.id, d.full_name, d.email, d.start_date, d.is_active,
           exists (select 1 from public.players_dealer_shifts s where s.dealer_id = d.id and s.status = 'open'),
           (select count(*) from public.players_dealer_shifts s where s.dealer_id = d.id and s.status = 'pending')
    from public.players_dealers d order by d.is_active desc, d.full_name;
end $$;

create or replace function public.players_floor_dealer(p_dealer uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.players_require_floor_manager();
  if not exists (select 1 from public.players_dealers where id = p_dealer) then raise exception 'Dealerul nu există'; end if;
  return public.players_dealer_bundle(p_dealer);
end $$;

-- Everything the floor manager handles for one day: each active dealer's shifts and tips.
create or replace function public.players_floor_day(p_day date)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.players_require_floor_manager();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'dealer_id', d.id, 'full_name', d.full_name,
      'tips', (select t.total from public.players_dealer_tips t where t.dealer_id = d.id and t.day = p_day),
      'shifts', coalesce((select jsonb_agg(to_jsonb(s) - 'dealer_id' order by s.check_in)
                          from public.players_dealer_shifts s
                          where s.dealer_id = d.id and (s.check_in at time zone 'Europe/Bucharest')::date = p_day), '[]'::jsonb)
    ) order by d.full_name)
    from public.players_dealers d where d.is_active), '[]'::jsonb);
end $$;

-- Shifts still waiting for the floor manager, oldest first; "overdue" once the day after the shift has passed.
create or replace function public.players_floor_pending_shifts()
returns table (id uuid, dealer_id uuid, full_name text, check_in timestamptz, check_out timestamptz, status text, overdue boolean)
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.players_require_floor_manager();
  return query
    select s.id, s.dealer_id, d.full_name, s.check_in, s.check_out, s.status,
           (s.check_in at time zone 'Europe/Bucharest')::date < (now() at time zone 'Europe/Bucharest')::date - 1
    from public.players_dealer_shifts s join public.players_dealers d on d.id = s.dealer_id
    where s.status in ('open', 'pending') order by s.check_in;
end $$;

create or replace function public.players_floor_review_shift(p_shift uuid, p_check_in timestamptz, p_check_out timestamptz, p_approve boolean)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  perform public.players_require_floor_manager();
  if p_approve then
    perform public.players_validate_shift_times(p_check_in, p_check_out);
    if p_check_out is null then raise exception 'Completează ora de plecare'; end if;
  end if;
  update public.players_dealer_shifts
     set check_in = case when p_approve then p_check_in else check_in end,
         check_out = case when p_approve then p_check_out else coalesce(check_out, check_in + interval '1 minute') end,
         status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = public.players_current_email(), reviewed_at = now()
   where id = p_shift;
  if not found then raise exception 'Tura nu există'; end if;
  return true;
end $$;

-- The floor manager enters a shift for a dealer directly; it counts as approved.
create or replace function public.players_floor_add_shift(p_dealer uuid, p_check_in timestamptz, p_check_out timestamptz)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  new_id uuid;
begin
  perform public.players_require_floor_manager();
  perform public.players_validate_shift_times(p_check_in, p_check_out);
  if p_check_out is null then raise exception 'Completează ora de plecare'; end if;
  if not exists (select 1 from public.players_dealers where id = p_dealer) then raise exception 'Dealerul nu există'; end if;
  insert into public.players_dealer_shifts (dealer_id, check_in, check_out, status, reviewed_by, reviewed_at)
  values (p_dealer, p_check_in, p_check_out, 'approved', public.players_current_email(), now()) returning id into new_id;
  return new_id;
end $$;

create or replace function public.players_floor_set_tips(p_dealer uuid, p_day date, p_total numeric)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  perform public.players_require_floor_manager();
  if p_day is null or p_day > (now() at time zone 'Europe/Bucharest')::date then raise exception 'Data nu este validă'; end if;
  if p_total is null then
    delete from public.players_dealer_tips where dealer_id = p_dealer and day = p_day;
    return true;
  end if;
  if p_total < 0 or p_total > 100000 then raise exception 'Suma nu este validă'; end if;
  insert into public.players_dealer_tips (dealer_id, day, total, entered_by)
  values (p_dealer, p_day, round(p_total, 2), public.players_current_email())
  on conflict (dealer_id, day) do update set total = excluded.total, entered_by = excluded.entered_by, entered_at = now();
  return true;
end $$;

create or replace function public.players_floor_add_penalty(p_dealer uuid, p_day date, p_amount numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  new_id uuid;
begin
  perform public.players_require_floor_manager();
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Suma nu este validă'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 2 then raise exception 'Scrie motivul penalizării'; end if;
  insert into public.players_dealer_penalties (dealer_id, day, amount, reason, created_by)
  values (p_dealer, coalesce(p_day, (now() at time zone 'Europe/Bucharest')::date), round(p_amount, 2), btrim(p_reason), public.players_current_email())
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.players_floor_delete_penalty(p_penalty uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  perform public.players_require_floor_manager();
  delete from public.players_dealer_penalties where id = p_penalty;
  if not found then raise exception 'Penalizarea nu există'; end if;
  return true;
end $$;

-- ---------- admin: floor manager list ----------

create or replace function public.players_admin_list_floor_managers()
returns table (email text, added_at timestamptz, added_by text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  return query select f.email, f.added_at, f.added_by from public.players_floor_managers f order by f.added_at, f.email;
end $$;

create or replace function public.players_admin_add_floor_manager(p_email text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  email_clean text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if char_length(email_clean) > 254 or email_clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresă de email invalidă'; end if;
  insert into public.players_floor_managers (email, added_by) values (email_clean, public.players_current_email())
  on conflict (email) do nothing;
  return true;
end $$;

create or replace function public.players_admin_remove_floor_manager(p_email text)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  delete from public.players_floor_managers where email = lower(btrim(coalesce(p_email, '')));
  if not found then raise exception 'Adresa nu este șef de sală'; end if;
  return true;
end $$;

-- ---------- grants: signed-in users only; helpers stay private ----------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.players_current_email()', 'public.players_require_floor_manager()',
    'public.players_validate_shift_times(timestamptz, timestamptz)', 'public.players_dealer_bundle(uuid)', 'public.players_my_dealer_id()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.is_players_floor_manager()',
    'public.players_dealer_sign(text, text)', 'public.players_dealer_me()',
    'public.players_dealer_check_in(timestamptz)', 'public.players_dealer_check_out(timestamptz)',
    'public.players_dealer_add_shift(timestamptz, timestamptz)',
    'public.players_floor_dealers()', 'public.players_floor_dealer(uuid)', 'public.players_floor_day(date)',
    'public.players_floor_pending_shifts()', 'public.players_floor_review_shift(uuid, timestamptz, timestamptz, boolean)',
    'public.players_floor_add_shift(uuid, timestamptz, timestamptz)', 'public.players_floor_set_tips(uuid, date, numeric)',
    'public.players_floor_add_penalty(uuid, date, numeric, text)', 'public.players_floor_delete_penalty(uuid)',
    'public.players_admin_list_floor_managers()', 'public.players_admin_add_floor_manager(text)',
    'public.players_admin_remove_floor_manager(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
