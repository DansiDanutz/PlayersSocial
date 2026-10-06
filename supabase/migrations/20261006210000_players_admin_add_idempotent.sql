-- Adding an admin is instant and frictionless: adding an address that is already an admin simply succeeds.
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
  return true;
end;
$$;

revoke all on function public.players_admin_add_admin(text) from public, anon;
grant execute on function public.players_admin_add_admin(text) to authenticated;
