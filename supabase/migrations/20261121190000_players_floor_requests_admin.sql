-- Admins can also see and decide floor manager requests from /sef-de-sala/ ("Șefi de sală" tab),
-- besides the emailed link. Both paths share one decision function, so the rules stay identical:
-- only pending, unexpired requests change; approving adds the email to players_floor_managers.

create or replace function public.players_floor_request_apply(p_id uuid, p_approve boolean, p_by text)
returns text language plpgsql security definer set search_path = public
as $$
declare
  request public.players_floor_requests%rowtype;
  effective text;
begin
  select * into request from public.players_floor_requests where id = p_id for update;
  if not found then raise exception 'Linkul nu este valid'; end if;
  effective := public.players_floor_request_status(request.status, request.expires_at);
  if effective = 'expired' then raise exception 'Linkul a expirat. Persoana trebuie să trimită o cerere nouă.'; end if;
  if effective <> 'pending' then return effective; end if;
  if p_approve then
    insert into public.players_floor_managers (email, added_by) values (request.email, p_by)
    on conflict (email) do nothing;
  end if;
  update public.players_floor_requests
  set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
  where id = request.id;
  return case when p_approve then 'approved' else 'rejected' end;
end $$;

create or replace function public.players_floor_request_decide(p_token text, p_approve boolean)
returns text language plpgsql security definer set search_path = public
as $$
declare
  request_id uuid := (select id from public.players_floor_requests where token_hash = public.players_sha256(p_token));
begin
  if request_id is null then raise exception 'Linkul nu este valid'; end if;
  return public.players_floor_request_apply(request_id, p_approve, 'aprobare prin email');
end $$;

create or replace function public.players_admin_list_floor_requests()
returns table (id uuid, full_name text, email text, created_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  return query
    select r.id, r.full_name, r.email, r.created_at, r.expires_at
    from public.players_floor_requests r
    where r.status = 'pending' and r.expires_at >= now()
    order by r.created_at;
end $$;

create or replace function public.players_admin_decide_floor_request(p_id uuid, p_approve boolean)
returns text language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  return public.players_floor_request_apply(p_id, p_approve, public.players_current_email());
end $$;

revoke all on function public.players_floor_request_apply(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.players_admin_list_floor_requests() from public, anon;
revoke all on function public.players_admin_decide_floor_request(uuid, boolean) from public, anon;
grant execute on function public.players_admin_list_floor_requests() to authenticated;
grant execute on function public.players_admin_decide_floor_request(uuid, boolean) to authenticated;
