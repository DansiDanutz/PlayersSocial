-- Supabase Storage only deletes objects the caller can SELECT. The admin buckets had insert/delete
-- policies but no select policy, so replaced banners, videos and programme images were never removed.
-- Public URLs keep working without these policies; they only let admins see (and so delete) objects.
drop policy if exists "players admins read event banners" on storage.objects;
create policy "players admins read event banners" on storage.objects
  for select to authenticated
  using (bucket_id = 'players-event-banners' and public.is_players_admin());

drop policy if exists "players admins read videos" on storage.objects;
create policy "players admins read videos" on storage.objects
  for select to authenticated
  using (bucket_id = 'players-videos' and public.is_players_admin());

drop policy if exists "players admins read schedule images" on storage.objects;
create policy "players admins read schedule images" on storage.objects
  for select to authenticated
  using (bucket_id = 'players-schedule' and public.is_players_admin());
