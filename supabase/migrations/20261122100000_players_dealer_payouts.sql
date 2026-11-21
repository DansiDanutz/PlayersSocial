-- Dealer payouts: what the club actually paid, recorded by a floor manager.
-- kind 'month' pays one closed month (period 'YYYY-MM'); kind 'bonus' pays a loyalty bonus (period = the bonus
-- date 'YYYY-MM-DD'), and from_deposit is the part of it taken out of the deposit. Amounts owed are still
-- computed in dist/staff/dealer-math.js; this table only stores the facts.

create table if not exists public.players_dealer_payouts (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.players_dealers(id) on delete cascade,
  kind text not null check (kind in ('month', 'bonus')),
  period text not null,
  amount numeric(10, 2) not null check (amount > 0 and amount <= 1000000),
  from_deposit numeric(10, 2) not null default 0 check (from_deposit >= 0 and from_deposit <= amount),
  paid_on date not null,
  note text check (note is null or char_length(note) <= 300),
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  unique (dealer_id, kind, period),
  check ((kind = 'month' and period ~ '^\d{4}-(0[1-9]|1[0-2])$' and from_deposit = 0)
      or (kind = 'bonus' and period ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'))
);
create index if not exists players_dealer_payouts_by_dealer on public.players_dealer_payouts (dealer_id, paid_on desc);

alter table public.players_dealer_payouts enable row level security;
revoke all on public.players_dealer_payouts from public, anon, authenticated;

-- The dealer bundle now carries the payouts (the dealer sees their own; floor managers see any).
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
                           from public.players_dealer_penalties p where p.dealer_id = p_dealer), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'period', x.period, 'amount', x.amount,
                                                             'from_deposit', x.from_deposit, 'paid_on', x.paid_on, 'note', x.note,
                                                             'recorded_by', x.recorded_by) order by x.paid_on desc, x.recorded_at desc)
                         from public.players_dealer_payouts x where x.dealer_id = p_dealer), '[]'::jsonb)
  );
$$;

-- The team board shows payouts too, without who recorded them (no emails on the board).
create or replace function public.players_staff_board()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if public.players_my_dealer_id() is null and not public.is_players_floor_manager() then
    raise exception 'Acces doar pentru dealeri și șefi de sală';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'dealer', (bundle -> 'dealer') - 'email',
      'shifts', coalesce((select jsonb_agg(item - 'reviewed_by' - 'reviewed_at' - 'dealer_check_in' - 'dealer_check_out')
                          from jsonb_array_elements(bundle -> 'shifts') as shift(item)), '[]'::jsonb),
      'tips', bundle -> 'tips',
      'penalties', bundle -> 'penalties',
      'payouts', coalesce((select jsonb_agg(item - 'recorded_by')
                           from jsonb_array_elements(bundle -> 'payouts') as payout(item)), '[]'::jsonb)) order by d.full_name)
    from public.players_dealers d
    cross join lateral (select public.players_dealer_bundle(d.id) as bundle) b
    where d.is_active), '[]'::jsonb);
end $$;

create or replace function public.players_floor_record_payout(p_dealer uuid, p_kind text, p_period text, p_amount numeric,
                                                              p_from_deposit numeric, p_paid_on date, p_note text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  local_today date := (now() at time zone 'Europe/Bucharest')::date;
  clean_note text := nullif(btrim(coalesce(p_note, '')), '');
  new_id uuid;
begin
  perform public.players_require_floor_manager();
  if not exists (select 1 from public.players_dealers where id = p_dealer) then raise exception 'Dealerul nu există'; end if;
  if p_kind not in ('month', 'bonus') then raise exception 'Tip de plată necunoscut'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Scrie suma plătită'; end if;
  if p_paid_on is null or p_paid_on > local_today then raise exception 'Data plății nu poate fi în viitor'; end if;
  if p_kind = 'month' then
    if coalesce(p_period, '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Luna nu este validă'; end if;
    if p_period >= to_char(local_today, 'YYYY-MM') then raise exception 'Se plătesc doar lunile încheiate'; end if;
    if coalesce(p_from_deposit, 0) <> 0 then raise exception 'Plata lunară nu se ia din depozit'; end if;
  else
    if coalesce(p_period, '') !~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' then raise exception 'Data bonusului nu este validă'; end if;
    if p_period::date > local_today then raise exception 'Bonusul se plătește după data lui'; end if;
    if coalesce(p_from_deposit, 0) < 0 or coalesce(p_from_deposit, 0) > p_amount then raise exception 'Partea din depozit nu este validă'; end if;
  end if;
  if exists (select 1 from public.players_dealer_payouts where dealer_id = p_dealer and kind = p_kind and period = p_period) then
    raise exception 'Plata este deja trecută. Șterge-o întâi dacă vrei s-o corectezi.';
  end if;
  insert into public.players_dealer_payouts (dealer_id, kind, period, amount, from_deposit, paid_on, note, recorded_by)
  values (p_dealer, p_kind, p_period, round(p_amount, 2), round(coalesce(p_from_deposit, 0), 2), p_paid_on, left(clean_note, 300), public.players_current_email())
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.players_floor_delete_payout(p_payout uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  perform public.players_require_floor_manager();
  delete from public.players_dealer_payouts where id = p_payout;
  if not found then raise exception 'Plata nu există'; end if;
  return true;
end $$;

revoke all on function public.players_floor_record_payout(uuid, text, text, numeric, numeric, date, text) from public, anon;
revoke all on function public.players_floor_delete_payout(uuid) from public, anon;
grant execute on function public.players_floor_record_payout(uuid, text, text, numeric, numeric, date, text) to authenticated;
grant execute on function public.players_floor_delete_payout(uuid) to authenticated;
