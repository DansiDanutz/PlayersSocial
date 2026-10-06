-- Admins manage the admin list from the dashboard. Every admin capability (events, banners, videos)
-- already checks public.is_players_admin(), so a newly added email gets full access on next sign-in.
alter table public.players_admins
  add column if not exists added_at timestamptz not null default now(),
  add column if not exists added_by text;

create or replace function public.players_admin_list_admins()
returns table (email text, added_at timestamptz, added_by text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  return query select a.email, a.added_at, a.added_by from public.players_admins a order by a.added_at, a.email;
end;
$$;

create or replace function public.players_admin_add_admin(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  email_clean text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if char_length(email_clean) > 254 or email_clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresă de email invalidă'; end if;
  insert into public.players_admins (email, added_by)
  values (email_clean, lower(auth.jwt() ->> 'email'))
  on conflict (email) do nothing;
  if not found then raise exception 'Adresa este deja administrator'; end if;
  return true;
end;
$$;

create or replace function public.players_admin_remove_admin(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  email_clean text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if email_clean = lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'Nu îți poți elimina propriul acces'; end if;
  if (select count(*) from public.players_admins) <= 1 then raise exception 'Trebuie să rămână cel puțin un administrator'; end if;
  delete from public.players_admins where email = email_clean;
  if not found then raise exception 'Adresa nu este administrator'; end if;
  return true;
end;
$$;

revoke all on function public.players_admin_list_admins() from public, anon;
grant execute on function public.players_admin_list_admins() to authenticated;
revoke all on function public.players_admin_add_admin(text) from public, anon;
grant execute on function public.players_admin_add_admin(text) to authenticated;
revoke all on function public.players_admin_remove_admin(text) from public, anon;
grant execute on function public.players_admin_remove_admin(text) to authenticated;
