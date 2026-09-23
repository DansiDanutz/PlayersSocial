-- Existing registrations remain private until their owners opt in.
alter table public.players_registrations
add column if not exists public_display_consent boolean not null default false;

alter table public.players_registrations
add column if not exists public_display_consented_at timestamptz;

-- The existing four-argument registration endpoint remains valid and private by default.
create or replace function public.players_register(
  p_event_name text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_public_display_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  result := public.players_register(p_event_name, p_first_name, p_last_name, p_email);
  if coalesce(p_public_display_consent, false) then
    update public.players_registrations
    set public_display_consent = true,
        public_display_consented_at = now()
    where client_token = (result->>'token')::uuid;
  end if;
  return result;
end;
$$;

create or replace function public.players_public_registrants(p_event_name text)
returns table(display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select concat_ws(' ', trim(r.first_name), trim(r.last_name))
  from public.players_registrations r
  where r.event_name = p_event_name and r.public_display_consent = true
  order by r.created_at, r.id;
$$;

-- A registration token lets its owner change the choice on the original device.
create or replace function public.players_public_display_choice(p_token uuid, p_consent boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  choice boolean;
begin
  if p_consent is null then
    select public_display_consent into choice
    from public.players_registrations where client_token = p_token;
  else
    update public.players_registrations
    set public_display_consent = p_consent,
        public_display_consented_at = case when p_consent then coalesce(public_display_consented_at, now()) else null end
    where client_token = p_token
    returning public_display_consent into choice;
  end if;
  return choice;
end;
$$;

revoke all on function public.players_register(text,text,text,text,boolean) from public;
revoke all on function public.players_public_registrants(text) from public;
revoke all on function public.players_public_display_choice(uuid,boolean) from public;
grant execute on function public.players_register(text,text,text,text,boolean) to anon, authenticated;
grant execute on function public.players_public_registrants(text) to anon, authenticated;
grant execute on function public.players_public_display_choice(uuid,boolean) to anon, authenticated;
