-- Regression checks for the Players event workflow. Run against the project with a privileged role
-- (e.g. Supabase SQL editor). Everything happens inside one DO block that always ends by raising, so
-- no data is kept: "ALL PASSED" means success, any other error names the failing check.
do $$
declare
  admin_claims constant text := '{"email":"semebitcoin@gmail.com","role":"authenticated"}';
  visitor_claims constant text := '{"email":"someone@example.com","role":"authenticated"}';
  future_day constant date := (now() at time zone 'Europe/Bucharest')::date + 10;
  row_found record;
  failed boolean;
begin
  -- Privileges: admin RPCs and the admin check are not callable anonymously; public reads go through the RPC only.
  assert not has_function_privilege('anon', 'public.players_admin_create_event(text,text,date,time,integer,text,text,text)', 'execute'), 'anon can create events';
  assert not has_function_privilege('anon', 'public.players_admin_update_featured_event(text,text,date,time,integer,text,text,text,integer,text,text,boolean)', 'execute'), 'anon can update events';
  assert not has_function_privilege('anon', 'public.players_admin_registrants(text)', 'execute'), 'anon can list registrants';
  assert not has_function_privilege('anon', 'public.players_admin_event_notes()', 'execute'), 'anon can read notes';
  assert not has_function_privilege('anon', 'public.is_players_admin()', 'execute'), 'anon can call is_players_admin';
  assert has_function_privilege('anon', 'public.players_public_events()', 'execute'), 'anon lost public events';
  assert has_function_privilege('anon', 'public.players_register(text,text,text,text,boolean)', 'execute'), 'anon lost registration';
  assert not exists (select 1 from pg_policies where tablename = 'players_events' and 'anon' = any(roles)), 'anon has a direct policy on players_events';

  perform set_config('role', 'authenticated', true);

  -- Admin can create a featured event; validation rejects bad input.
  perform set_config('request.jwt.claims', admin_claims, true);
  perform public.players_admin_create_event('Regression Event', 'Remi & Prieteni', future_day, '18:00', 24, 'Descriere de test suficient de lungă.', 'Str. Louis Pasteur nr. 75', '/poster-remi.webp');
  select * into row_found from public.players_public_events() where event_name = 'Regression Event';
  assert row_found.is_featured and row_found.linked_card = 'Remi & Prieteni', 'created event not featured/linked';

  failed := false; begin perform public.players_admin_create_event('Regression Event', 'Remi & Prieteni', future_day, '18:00', 24, 'Descriere de test suficient de lungă.', 'Loc', '/poster-remi.webp'); exception when others then failed := true; end;
  assert failed, 'duplicate event name accepted';
  failed := false; begin perform public.players_admin_create_event('Foreign Banner', 'Remi & Prieteni', future_day, '18:00', 24, 'Descriere de test suficient de lungă.', 'Loc', 'https://evil.example/x.jpg'); exception when others then failed := true; end;
  assert failed, 'foreign banner URL accepted';
  failed := false; begin perform public.players_admin_create_event('Past Event', 'Remi & Prieteni', future_day - 20, '18:00', 24, 'Descriere de test suficient de lungă.', 'Loc', '/poster-remi.webp'); exception when others then failed := true; end;
  assert failed, 'past date accepted';

  -- Post-event edit, hiding and private notes.
  perform public.players_admin_update_featured_event('Regression Event', 'Remi & Prieteni', future_day, '18:00', 24, 'Descriere actualizată de test.', 'Str. Louis Pasteur nr. 75', '/poster-remi.webp', 12, 'Recap', 'Notă privată', true);
  select * into row_found from public.players_public_events() where event_name = 'Regression Event';
  assert row_found.final_participants = 12 and row_found.public_recap = 'Recap' and row_found.is_hidden, 'update not applied';
  assert (select admin_notes from public.players_admin_event_notes() where event_name = 'Regression Event') = 'Notă privată', 'notes not stored';

  -- A signed-in non-admin is refused and cannot see hidden events.
  perform set_config('request.jwt.claims', visitor_claims, true);
  failed := false; begin perform public.players_admin_event_notes(); exception when others then failed := true; end;
  assert failed, 'non-admin read notes';
  failed := false; begin perform public.players_admin_create_event('Hack', 'Remi & Prieteni', future_day, '18:00', 24, 'Descriere de test suficient de lungă.', 'Loc', '/poster-remi.webp'); exception when others then failed := true; end;
  assert failed, 'non-admin created an event';
  assert not exists (select 1 from public.players_public_events() where event_name = 'Regression Event'), 'hidden event visible to non-admin';

  -- Registration still works for visitors and closes once the event date has passed.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform public.players_register('Remi & Prieteni', 'Test', 'Regression', 'regression@example.invalid', false);
  failed := false; begin perform public.players_register('Turneu de Șah Amatori', 'Test', 'Regression', 'regression@example.invalid', false); exception when others then failed := true; end;
  assert failed, 'registration accepted for a past event';

  -- Event videos: public read via RPC only, admin-only writes, validated categories, types and storage URLs.
  perform set_config('role', 'postgres', true);
  assert has_function_privilege('anon', 'public.players_public_videos()', 'execute'), 'anon cannot list videos';
  assert not has_function_privilege('anon', 'public.players_admin_add_video(text,text,text,text,text,text)', 'execute'), 'anon can add videos';
  assert not has_function_privilege('anon', 'public.players_admin_delete_video(uuid)', 'execute'), 'anon can delete videos';
  assert not has_table_privilege('anon', 'public.players_videos', 'select'), 'anon can read players_videos directly';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', admin_claims, true);
  declare
    video_id uuid;
    video_base constant text := 'https://lxhjfdxowpxzrybxdasi.supabase.co/storage/v1/object/public/players-videos/';
  begin
    video_id := public.players_admin_add_video('remi', 'event', 'Regression video', 'Seara de test', video_base || 'regression.mp4', video_base || 'regression.jpg');
    assert exists (select 1 from public.players_public_videos() v where v.id = video_id and v.category = 'remi' and v.video_type = 'event'), 'uploaded video not listed';
    failed := false; begin perform public.players_admin_add_video('poker', 'event', 'Bad category', null, video_base || 'x.mp4', null); exception when others then failed := true; end;
    assert failed, 'invalid category accepted';
    failed := false; begin perform public.players_admin_add_video('remi', 'event', 'Foreign file', null, 'https://evil.example/x.mp4', null); exception when others then failed := true; end;
    assert failed, 'foreign video URL accepted';
    perform set_config('request.jwt.claims', visitor_claims, true);
    failed := false; begin perform public.players_admin_add_video('remi', 'event', 'Hack video', null, video_base || 'hack.mp4', null); exception when others then failed := true; end;
    assert failed, 'non-admin added a video';
    failed := false; begin perform public.players_admin_delete_video(video_id); exception when others then failed := true; end;
    assert failed, 'non-admin deleted a video';
    perform set_config('request.jwt.claims', admin_claims, true);
    assert (select d.video_url from public.players_admin_delete_video(video_id) d) = video_base || 'regression.mp4', 'delete did not return the file URL';
    assert not exists (select 1 from public.players_public_videos() v where v.id = video_id), 'deleted video still listed';
  end;

  raise exception 'ALL PASSED';
end $$;
