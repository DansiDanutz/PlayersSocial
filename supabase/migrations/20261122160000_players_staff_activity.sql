-- Activity history for the floor manager panel: every change to shifts, tips, penalties and payouts is logged by
-- triggers with who did it, so the panel can show that a click took effect (and what changed, even after a value
-- is overwritten or deleted). Read only through players_floor_activity() (floor managers and admins).

create table if not exists public.players_staff_activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null default '',
  action text not null,
  dealer_id uuid,
  details jsonb not null default '{}'::jsonb
);
create index if not exists players_staff_activity_at_idx on public.players_staff_activity (at desc, id desc);
alter table public.players_staff_activity enable row level security;
revoke all on public.players_staff_activity from public, anon, authenticated;

create or replace function public.players_log_staff_activity()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  act text;
  dealer uuid;
  info jsonb;
begin
  if tg_table_name = 'players_dealer_shifts' then
    if tg_op = 'INSERT' then
      dealer := new.dealer_id;
      act := case when new.status = 'open' then 'check_in' else 'shift_added' end;
      info := jsonb_build_object('check_in', new.check_in, 'check_out', new.check_out, 'status', new.status);
    elsif tg_op = 'UPDATE' then
      dealer := new.dealer_id;
      if new.status is distinct from old.status then
        act := case new.status when 'pending' then 'check_out' when 'approved' then 'shift_approved' when 'rejected' then 'shift_rejected' else 'shift_changed' end;
      elsif new.check_in is distinct from old.check_in or new.check_out is distinct from old.check_out then
        act := 'shift_changed';
      else
        return null;
      end if;
      info := jsonb_build_object('check_in', new.check_in, 'check_out', new.check_out, 'status', new.status,
                                 'corrected', new.status = 'approved'
                                   and (new.check_in is distinct from coalesce(old.dealer_check_in, old.check_in)
                                        or new.check_out is distinct from coalesce(old.dealer_check_out, old.check_out)));
    else
      dealer := old.dealer_id;
      act := 'shift_deleted';
      info := jsonb_build_object('check_in', old.check_in, 'check_out', old.check_out);
    end if;
  elsif tg_table_name = 'players_dealer_tips' then
    if tg_op = 'DELETE' then
      dealer := old.dealer_id; act := 'tips_deleted';
      info := jsonb_build_object('day', old.day, 'total', old.total);
    else
      if tg_op = 'UPDATE' and new.total = old.total then return null; end if;
      dealer := new.dealer_id; act := 'tips_set';
      info := jsonb_build_object('day', new.day, 'total', new.total, 'previous', case when tg_op = 'UPDATE' then old.total end);
    end if;
  elsif tg_table_name = 'players_dealer_penalties' then
    if tg_op = 'DELETE' then
      dealer := old.dealer_id; act := 'penalty_removed';
      info := jsonb_build_object('day', old.day, 'amount', old.amount, 'reason', old.reason);
    else
      dealer := new.dealer_id; act := case tg_op when 'INSERT' then 'penalty_added' else 'penalty_changed' end;
      info := jsonb_build_object('day', new.day, 'amount', new.amount, 'reason', new.reason);
    end if;
  elsif tg_table_name = 'players_dealer_payouts' then
    if tg_op = 'DELETE' then
      dealer := old.dealer_id; act := 'payout_deleted';
      info := jsonb_build_object('kind', old.kind, 'period', old.period, 'amount', old.amount, 'paid_on', old.paid_on);
    else
      dealer := new.dealer_id; act := case tg_op when 'INSERT' then 'payout_recorded' else 'payout_changed' end;
      info := jsonb_build_object('kind', new.kind, 'period', new.period, 'amount', new.amount, 'paid_on', new.paid_on);
    end if;
  else
    return null;
  end if;
  insert into public.players_staff_activity (actor, action, dealer_id, details)
  values (public.players_current_email(), act, dealer, info);
  return null;
end $$;
revoke all on function public.players_log_staff_activity() from public, anon, authenticated;

drop trigger if exists players_dealer_shifts_activity on public.players_dealer_shifts;
create trigger players_dealer_shifts_activity after insert or update or delete on public.players_dealer_shifts
  for each row execute function public.players_log_staff_activity();
drop trigger if exists players_dealer_tips_activity on public.players_dealer_tips;
create trigger players_dealer_tips_activity after insert or update or delete on public.players_dealer_tips
  for each row execute function public.players_log_staff_activity();
drop trigger if exists players_dealer_penalties_activity on public.players_dealer_penalties;
create trigger players_dealer_penalties_activity after insert or update or delete on public.players_dealer_penalties
  for each row execute function public.players_log_staff_activity();
drop trigger if exists players_dealer_payouts_activity on public.players_dealer_payouts;
create trigger players_dealer_payouts_activity after insert or update or delete on public.players_dealer_payouts
  for each row execute function public.players_log_staff_activity();

-- Seed the history once from what the tables already hold, so the panel does not start empty.
insert into public.players_staff_activity (at, actor, action, dealer_id, details)
select s.created_at, coalesce(d.email, ''), 'check_in', s.dealer_id, jsonb_build_object('check_in', s.check_in, 'status', 'open')
from public.players_dealer_shifts s join public.players_dealers d on d.id = s.dealer_id
where s.dealer_check_in is not null and not exists (select 1 from public.players_staff_activity)
union all
select s.reviewed_at, coalesce(s.reviewed_by, ''), case s.status when 'approved' then 'shift_approved' else 'shift_rejected' end, s.dealer_id,
       jsonb_build_object('check_in', s.check_in, 'check_out', s.check_out, 'status', s.status)
from public.players_dealer_shifts s
where s.reviewed_at is not null and s.status in ('approved', 'rejected') and not exists (select 1 from public.players_staff_activity)
union all
select t.entered_at, coalesce(t.entered_by, ''), 'tips_set', t.dealer_id, jsonb_build_object('day', t.day, 'total', t.total)
from public.players_dealer_tips t where not exists (select 1 from public.players_staff_activity)
union all
select p.created_at, coalesce(p.created_by, ''), 'penalty_added', p.dealer_id, jsonb_build_object('day', p.day, 'amount', p.amount, 'reason', p.reason)
from public.players_dealer_penalties p where not exists (select 1 from public.players_staff_activity)
union all
select o.recorded_at, coalesce(o.recorded_by, ''), 'payout_recorded', o.dealer_id,
       jsonb_build_object('kind', o.kind, 'period', o.period, 'amount', o.amount, 'paid_on', o.paid_on)
from public.players_dealer_payouts o where not exists (select 1 from public.players_staff_activity);

-- Latest entries, newest first, with names instead of emails; "mine" marks the caller's own actions.
create or replace function public.players_floor_activity(p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_players_floor_manager() then raise exception 'Acces interzis'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(entry) order by entry.at desc, entry.id desc)
    from (
      select a.id, a.at, a.action, a.details,
             d.full_name as dealer,
             coalesce((select full_name from public.players_dealers where email = a.actor order by is_active desc limit 1),
                      nullif(split_part(a.actor, '@', 1), ''), 'Sistem') as actor,
             a.actor <> '' and a.actor = public.players_current_email() as mine
      from public.players_staff_activity a
      left join public.players_dealers d on d.id = a.dealer_id
      order by a.at desc, a.id desc
      limit least(greatest(coalesce(p_limit, 40), 1), 200)) entry), '[]'::jsonb);
end $$;
revoke all on function public.players_floor_activity(integer) from public, anon;
grant execute on function public.players_floor_activity(integer) to authenticated;
