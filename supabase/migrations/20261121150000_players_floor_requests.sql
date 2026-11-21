-- Floor manager access requests, approved from an email link.
-- A signed-in person asks for floor manager access through /api/floor-request. That server function holds a
-- private key (players_server_keys), stores only the SHA-256 of a one-time token and emails the token link to
-- the super admin. Opening /aprobare/#t=<token> and pressing "Aprobă" adds the email to players_floor_managers.
-- The server key's hash is inserted outside migrations, so the public repository never holds it.

create table if not exists public.players_server_keys (
  name text primary key,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.players_floor_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null check (email = lower(email) and email <> ''),
  full_name text not null check (char_length(full_name) between 3 and 120),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  decided_at timestamptz
);
create unique index if not exists players_floor_requests_one_pending on public.players_floor_requests (user_id) where status = 'pending';

alter table public.players_server_keys enable row level security;
alter table public.players_floor_requests enable row level security;
revoke all on public.players_server_keys, public.players_floor_requests from public, anon, authenticated;

create or replace function public.players_sha256(p_value text)
returns text language sql immutable set search_path = public
as $$ select encode(sha256(convert_to(coalesce(p_value, ''), 'UTF8')), 'hex') $$;

create or replace function public.players_require_server_key(p_name text, p_key text)
returns void language plpgsql stable security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.players_server_keys where name = p_name and key_hash = public.players_sha256(p_key)) then
    raise exception 'Acces interzis';
  end if;
end $$;

-- Effective status: a pending request past its expiry counts as expired.
create or replace function public.players_floor_request_status(p_status text, p_expires_at timestamptz)
returns text language sql stable set search_path = public
as $$ select case when p_status = 'pending' and p_expires_at < now() then 'expired' else p_status end $$;

create or replace function public.players_floor_request_create(p_server_key text, p_full_name text, p_token_hash text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  clean_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  new_id uuid;
begin
  perform public.players_require_server_key('floor-request', p_server_key);
  if auth.uid() is null or public.players_current_email() = '' then raise exception 'Intră în cont ca să ceri acces'; end if;
  if public.is_players_floor_manager() then raise exception 'Ai deja acces de șef de sală'; end if;
  if char_length(clean_name) < 3 or position(' ' in clean_name) = 0 or char_length(clean_name) > 120 then raise exception 'Scrie numele și prenumele'; end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then raise exception 'Cerere invalidă'; end if;
  update public.players_floor_requests set status = 'rejected', decided_at = now()
  where user_id = auth.uid() and status = 'pending' and expires_at < now();
  if exists (select 1 from public.players_floor_requests where user_id = auth.uid() and status = 'pending') then
    raise exception 'Ai trimis deja o cerere. Așteaptă aprobarea.';
  end if;
  if (select count(*) from public.players_floor_requests where user_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Ai trimis prea multe cereri azi. Încearcă mâine.';
  end if;
  insert into public.players_floor_requests (user_id, email, full_name, token_hash)
  values (auth.uid(), public.players_current_email(), clean_name, p_token_hash)
  returning id into new_id;
  return new_id;
end $$;

-- Used by the server function when the email could not be sent, so the person can try again.
create or replace function public.players_floor_request_cancel(p_server_key text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  perform public.players_require_server_key('floor-request', p_server_key);
  delete from public.players_floor_requests where id = p_id and user_id = auth.uid() and status = 'pending';
  return found;
end $$;

create or replace function public.players_floor_request_mine()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('full_name', full_name, 'created_at', created_at, 'status', public.players_floor_request_status(status, expires_at))
  from public.players_floor_requests where user_id = auth.uid()
  order by created_at desc limit 1;
$$;

-- The approval page: whoever holds the emailed token may see and decide that one request.
create or replace function public.players_floor_request_view(p_token text)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('full_name', full_name, 'email', email, 'created_at', created_at, 'decided_at', decided_at,
                            'status', public.players_floor_request_status(status, expires_at))
  from public.players_floor_requests where token_hash = public.players_sha256(p_token);
$$;

create or replace function public.players_floor_request_decide(p_token text, p_approve boolean)
returns text language plpgsql security definer set search_path = public
as $$
declare
  request public.players_floor_requests%rowtype;
  effective text;
begin
  select * into request from public.players_floor_requests where token_hash = public.players_sha256(p_token) for update;
  if not found then raise exception 'Linkul nu este valid'; end if;
  effective := public.players_floor_request_status(request.status, request.expires_at);
  if effective = 'expired' then raise exception 'Linkul a expirat. Persoana trebuie să trimită o cerere nouă.'; end if;
  if effective <> 'pending' then return effective; end if;
  if p_approve then
    insert into public.players_floor_managers (email, added_by) values (request.email, 'aprobare prin email')
    on conflict (email) do nothing;
  end if;
  update public.players_floor_requests
  set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
  where id = request.id;
  return case when p_approve then 'approved' else 'rejected' end;
end $$;

revoke all on function public.players_sha256(text) from public, anon, authenticated;
revoke all on function public.players_require_server_key(text, text) from public, anon, authenticated;
revoke all on function public.players_floor_request_status(text, timestamptz) from public, anon, authenticated;
revoke all on function public.players_floor_request_create(text, text, text) from public, anon;
revoke all on function public.players_floor_request_cancel(text, uuid) from public, anon;
revoke all on function public.players_floor_request_mine() from public, anon;
grant execute on function public.players_floor_request_create(text, text, text) to authenticated;
grant execute on function public.players_floor_request_cancel(text, uuid) to authenticated;
grant execute on function public.players_floor_request_mine() to authenticated;
revoke all on function public.players_floor_request_view(text) from public;
revoke all on function public.players_floor_request_decide(text, boolean) from public;
grant execute on function public.players_floor_request_view(text) to anon, authenticated;
grant execute on function public.players_floor_request_decide(text, boolean) to anon, authenticated;
