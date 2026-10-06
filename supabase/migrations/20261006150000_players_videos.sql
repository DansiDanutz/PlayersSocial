-- Event videos uploaded from the admin dashboard. They appear in the site's Video tab next to the
-- videos shipped with the site (dist/videos/videos.json). Reads go through players_public_videos();
-- writes only through admin RPCs. Files live in the public "players-videos" bucket.
create table if not exists public.players_videos (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('club', 'sah', 'remi', 'table', 'ping-pong')),
  video_type text not null check (video_type in ('promo', 'premium', 'event')),
  title text not null check (char_length(title) between 3 and 90),
  description text check (description is null or char_length(description) <= 400),
  video_url text not null check (video_url ~ '^https://lxhjfdxowpxzrybxdasi\.supabase\.co/storage/v1/object/public/players-videos/[A-Za-z0-9._-]+\.mp4$'),
  poster_url text check (poster_url is null or poster_url ~ '^https://lxhjfdxowpxzrybxdasi\.supabase\.co/storage/v1/object/public/players-videos/[A-Za-z0-9._-]+\.(jpg|png|webp)$'),
  created_at timestamptz not null default now()
);

alter table public.players_videos enable row level security;
revoke all on table public.players_videos from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('players-videos', 'players-videos', true, 52428800, array['video/mp4', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "players admins upload videos" on storage.objects;
create policy "players admins upload videos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'players-videos' and public.is_players_admin());

drop policy if exists "players admins delete videos" on storage.objects;
create policy "players admins delete videos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'players-videos' and public.is_players_admin());

create or replace function public.players_public_videos()
returns table (id uuid, category text, video_type text, title text, description text, video_url text, poster_url text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.category, v.video_type, v.title, v.description, v.video_url, v.poster_url, v.created_at
  from public.players_videos v
  order by v.created_at desc;
$$;

create or replace function public.players_admin_add_video(
  p_category text,
  p_type text,
  p_title text,
  p_description text,
  p_video_url text,
  p_poster_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  title_clean text := btrim(coalesce(p_title, ''));
  description_clean text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  if p_category is null or p_category not in ('club', 'sah', 'remi', 'table', 'ping-pong') then raise exception 'Categorie invalidă'; end if;
  if p_type is null or p_type not in ('promo', 'premium', 'event') then raise exception 'Tip de video invalid'; end if;
  if char_length(title_clean) not between 3 and 90 then raise exception 'Titlul trebuie să aibă 3–90 de caractere'; end if;
  if description_clean is not null and char_length(description_clean) > 400 then raise exception 'Descrierea poate avea maximum 400 de caractere'; end if;

  insert into public.players_videos (category, video_type, title, description, video_url, poster_url)
  values (p_category, p_type, title_clean, description_clean, p_video_url, nullif(p_poster_url, ''))
  returning players_videos.id into new_id;
  return new_id;
exception
  when check_violation then raise exception 'Fișierul video nu este valid';
end;
$$;

-- Returns the deleted row's file URLs so the dashboard can remove them from storage.
create or replace function public.players_admin_delete_video(p_id uuid)
returns table (video_url text, poster_url text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_players_admin() then raise exception 'Acces interzis'; end if;
  return query delete from public.players_videos v where v.id = p_id returning v.video_url, v.poster_url;
  if not found then raise exception 'Videoclipul nu există'; end if;
end;
$$;

revoke all on function public.players_public_videos() from public;
grant execute on function public.players_public_videos() to anon, authenticated;
revoke all on function public.players_admin_add_video(text, text, text, text, text, text) from public, anon;
grant execute on function public.players_admin_add_video(text, text, text, text, text, text) to authenticated;
revoke all on function public.players_admin_delete_video(uuid) from public, anon;
grant execute on function public.players_admin_delete_video(uuid) to authenticated;
