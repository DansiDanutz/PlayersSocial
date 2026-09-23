create table if not exists public.players_notifications (
  id uuid primary key default gen_random_uuid(),
  event_name text not null references public.players_events(event_name) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  message text not null check (char_length(message) between 2 and 600),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists players_notifications_event_created_idx
on public.players_notifications(event_name, created_at desc);

create unique index if not exists players_registrations_event_email_idx
on public.players_registrations(event_name, lower(email));

alter table public.players_notifications enable row level security;

drop policy if exists "Admins manage notifications" on public.players_notifications;
create policy "Admins manage notifications" on public.players_notifications
for all to authenticated
using (public.is_players_admin())
with check (public.is_players_admin() and created_by = auth.uid());

grant select, insert, delete on public.players_notifications to authenticated;

create or replace function public.players_create_notification(p_event_name text, p_title text, p_message text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_id uuid;
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if not exists (select 1 from public.players_events where event_name = p_event_name) then
    raise exception 'Eveniment inexistent';
  end if;
  insert into public.players_notifications(event_name, title, message, created_by)
  values (p_event_name, trim(p_title), trim(p_message), auth.uid())
  returning id into notification_id;
  return notification_id;
end;
$$;

create or replace function public.players_notifications_for_token(p_token uuid)
returns table(id uuid, event_name text, title text, message text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.event_name, n.title, n.message, n.created_at
  from public.players_notifications n
  join public.players_registrations r on r.event_name = n.event_name
  where r.client_token = p_token
  order by n.created_at desc
  limit 20;
$$;

revoke all on function public.players_create_notification(text,text,text) from public;
revoke all on function public.players_notifications_for_token(uuid) from public;
grant execute on function public.players_create_notification(text,text,text) to authenticated;
grant execute on function public.players_notifications_for_token(uuid) to anon, authenticated;
