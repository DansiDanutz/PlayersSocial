-- Floor managers edit the site content: events, banners, schedule, videos and notifications.
-- is_players_admin() guards every content function and storage policy, so it now also accepts floor managers
-- (players_floor_managers). Who gets access stays with the Super Admins (players_admins): the functions that
-- add or remove admins and floor managers, decide access requests and list every account now check
-- is_players_super_admin() instead.

create or replace function public.is_players_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.players_admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.is_players_super_admin() from public, anon;
grant execute on function public.is_players_super_admin() to authenticated;

-- ---------- access management: Super Admin only ----------

create or replace function public.players_admin_add_admin(p_email text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  email_clean text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_players_super_admin() then raise exception 'Acces interzis'; end if;
  if char_length(email_clean) > 254 or email_clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresă de email invalidă'; end if;
  insert into public.players_admins (email, added_by)
  values (email_clean, lower(auth.jwt() ->> 'email'))
  on conflict (email) do nothing;
  return true;
end $$;

create or replace function public.players_admin_list_admins()
returns table(email text, added_at timestamptz, added_by text) language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_players_super_admin() then raise exception 'Acces interzis'; end if;
  return query select a.email, a.added_at, a.added_by from public.players_admins a order by a.added_at, a.email;
end $$;

create or replace function public.players_admin_remove_admin(p_email text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  email_clean text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_players_super_admin() then raise exception 'Acces interzis'; end if;
  if email_clean = lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'Nu îți poți elimina propriul acces'; end if;
  if (select count(*) from public.players_admins) <= 1 then raise exception 'Trebuie să rămână cel puțin un administrator'; end if;
  delete from public.players_admins where email = email_clean;
  if not found then raise exception 'Adresa nu este administrator'; end if;
  return true;
end $$;

create or replace function public.players_admin_add_floor_manager(p_email text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  email_clean text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_players_super_admin() then raise exception 'Acces interzis'; end if;
  if char_length(email_clean) > 254 or email_clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresă de email invalidă'; end if;
  insert into public.players_floor_managers (email, added_by) values (email_clean, public.players_current_email())
  on conflict (email) do nothing;
  return true;
end $$;

create or replace function public.players_admin_list_floor_managers()
returns table(email text, added_at timestamptz, added_by text) language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_players_super_admin() then raise exception 'Acces interzis'; end if;
  return query select f.email, f.added_at, f.added_by from public.players_floor_managers f order by f.added_at, f.email;
end $$;

create or replace function public.players_admin_remove_floor_manager(p_email text)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_players_super_admin() then raise exception 'Acces interzis'; end if;
  delete from public.players_floor_managers where email = lower(btrim(coalesce(p_email, '')));
  if not found then raise exception 'Adresa nu este șef de sală'; end if;
  return true;
end $$;

create or replace function public.players_admin_list_floor_requests()
returns table(id uuid, full_name text, email text, created_at timestamptz, expires_at timestamptz) language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_players_super_admin() then raise exception 'Acces interzis'; end if;
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
  if not public.is_players_super_admin() then raise exception 'Acces interzis'; end if;
  return public.players_floor_request_apply(p_id, p_approve, public.players_current_email());
end $$;

create or replace function public.players_admin_staff_directory()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_players_super_admin() then raise exception 'Acces interzis'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('email', people.email,
                                        'full_name', (select full_name from public.players_dealers where email = people.email order by is_active desc limit 1),
                                        'roles', public.players_roles_of(people.email))
                     order by people.email)
    from (select email from public.players_dealers where is_active
          union select email from public.players_floor_managers
          union select email from public.players_admins) people), '[]'::jsonb);
end $$;

-- ---------- content editing: Super Admins and floor managers ----------
-- Reads the tables directly (never is_players_floor_manager(), which calls this function).
create or replace function public.is_players_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.players_admins where email = lower(coalesce(auth.jwt() ->> 'email', '')))
      or exists (select 1 from public.players_floor_managers where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
