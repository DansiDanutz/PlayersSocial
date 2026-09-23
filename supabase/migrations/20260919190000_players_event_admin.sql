create table if not exists public.players_event_dates (
  event_name text primary key,
  event_date date not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.players_admins (
  email text primary key check (email = lower(email))
);

insert into public.players_admins (email)
values
  ('semebitcoin@gmail.com'),
  ('toma.alinflorin@yahoo.com')
on conflict (email) do nothing;

alter table public.players_event_dates enable row level security;
alter table public.players_admins enable row level security;

create or replace function public.is_players_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.players_admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_players_admin() from public;
grant execute on function public.is_players_admin() to authenticated;

drop policy if exists "Anyone can read event dates" on public.players_event_dates;
create policy "Anyone can read event dates"
on public.players_event_dates for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert event dates" on public.players_event_dates;
create policy "Admins can insert event dates"
on public.players_event_dates for insert
to authenticated
with check (public.is_players_admin() and updated_by = auth.uid());

drop policy if exists "Admins can update event dates" on public.players_event_dates;
create policy "Admins can update event dates"
on public.players_event_dates for update
to authenticated
using (public.is_players_admin())
with check (public.is_players_admin() and updated_by = auth.uid());

drop policy if exists "Admins can delete event dates" on public.players_event_dates;
create policy "Admins can delete event dates"
on public.players_event_dates for delete
to authenticated
using (public.is_players_admin());

grant select on public.players_event_dates to anon, authenticated;
grant insert, update, delete on public.players_event_dates to authenticated;
revoke all on public.players_admins from anon, authenticated;
