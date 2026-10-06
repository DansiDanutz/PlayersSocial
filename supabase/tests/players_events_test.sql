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

  -- Admin management: only admins list/add/remove; no self-removal; new admins get admin access.
  perform set_config('role', 'postgres', true);
  assert not has_function_privilege('anon', 'public.players_admin_list_admins()', 'execute'), 'anon can list admins';
  assert not has_function_privilege('anon', 'public.players_admin_add_admin(text)', 'execute'), 'anon can add admins';
  assert not has_function_privilege('anon', 'public.players_admin_remove_admin(text)', 'execute'), 'anon can remove admins';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', admin_claims, true);
  assert exists (select 1 from public.players_admin_list_admins() a where a.email = 'semebitcoin@gmail.com'), 'admin list missing owner';
  perform public.players_admin_add_admin('  Regression.Admin@Example.com ');
  assert exists (select 1 from public.players_admin_list_admins() a where a.email = 'regression.admin@example.com' and a.added_by = 'semebitcoin@gmail.com'), 'added admin not normalised/recorded';
  assert public.players_admin_add_admin('regression.admin@example.com'), 'adding an existing admin should simply succeed';
  assert (select count(*) from public.players_admin_list_admins() a where a.email = 'regression.admin@example.com') = 1, 'existing admin duplicated';
  failed := false; begin perform public.players_admin_add_admin('not-an-email'); exception when others then failed := true; end;
  assert failed, 'invalid admin email accepted';
  failed := false; begin perform public.players_admin_remove_admin('semebitcoin@gmail.com'); exception when others then failed := true; end;
  assert failed, 'admin removed themselves';
  perform set_config('request.jwt.claims', '{"email":"regression.admin@example.com","role":"authenticated"}', true);
  assert public.is_players_admin(), 'new admin has no admin access';
  perform set_config('request.jwt.claims', visitor_claims, true);
  failed := false; begin perform public.players_admin_add_admin('hacker@example.com'); exception when others then failed := true; end;
  assert failed, 'non-admin added an admin';
  failed := false; begin perform public.players_admin_list_admins(); exception when others then failed := true; end;
  assert failed, 'non-admin listed admins';
  perform set_config('request.jwt.claims', admin_claims, true);
  perform public.players_admin_remove_admin('regression.admin@example.com');
  assert not exists (select 1 from public.players_admin_list_admins() a where a.email = 'regression.admin@example.com'), 'admin not removed';

  -- Weekly programme: public read, admin-only writes, events limited to category cards, featured day within the week.
  perform set_config('role', 'postgres', true);
  assert has_function_privilege('anon', 'public.players_public_schedule(date)', 'execute'), 'anon cannot read the schedule';
  assert not has_function_privilege('anon', 'public.players_admin_set_schedule_day(date,text,text,time,integer,integer,integer,text)', 'execute'), 'anon can set schedule days';
  assert not has_function_privilege('anon', 'public.players_admin_clear_schedule_day(date)', 'execute'), 'anon can clear schedule days';
  assert not has_function_privilege('anon', 'public.players_admin_set_schedule_week(date,text,date)', 'execute'), 'anon can set the schedule week';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', admin_claims, true);
  declare
    week constant date := date_trunc('week', current_date + 3650)::date;
    schedule_base constant text := 'https://lxhjfdxowpxzrybxdasi.supabase.co/storage/v1/object/public/players-schedule/';
    schedule jsonb;
    monday_default text;
  begin
    perform set_config('role', 'postgres', true);
    select linked_card into monday_default from public.players_schedule_template where weekday = 1;
    perform set_config('role', 'authenticated', true);
    assert public.players_admin_set_schedule_day(week + 2, 'Remi & Prieteni', schedule_base || 'remi.jpg') is null, 'first save returned an old image';
    assert public.players_admin_set_schedule_day(week + 2, 'Seară de Șah', schedule_base || 'sah.jpg') = schedule_base || 'remi.jpg', 'replaced image not returned';
    perform public.players_admin_set_schedule_day(week + 4, 'Karaoke Club', null);
    perform public.players_admin_set_schedule_day(week + 3, 'Seară de Table', null, '18:30', 10, 500, 12, '  Studenți: 130 lei  ');
    failed := false; begin perform public.players_admin_set_schedule_day(week + 5, 'Remi & Prieteni', null, null, null, null, null, repeat('x', 201)); exception when others then failed := true; end;
    assert failed, 'note over 200 characters accepted';
    failed := false; begin perform public.players_admin_set_schedule_day(week + 5, 'Remi & Prieteni', null, null, null, null, 0); exception when others then failed := true; end;
    assert failed, 'zero minimum players accepted';
    failed := false; begin perform public.players_admin_set_schedule_day(week + 5, 'Remi & Prieteni', null, null, -1, null); exception when others then failed := true; end;
    assert failed, 'negative buy-in accepted';
    failed := false; begin perform public.players_admin_set_schedule_day(week + 5, 'Turneu inventat', null); exception when others then failed := true; end;
    assert failed, 'unknown event accepted';
    failed := false; begin perform public.players_admin_set_schedule_day(week + 5, 'Remi & Prieteni', 'https://evil.example/x.jpg'); exception when others then failed := true; end;
    assert failed, 'foreign schedule image accepted';
    perform public.players_admin_set_schedule_week(week, schedule_base || 'week.jpg', week + 2);
    failed := false; begin perform public.players_admin_set_schedule_week(week, null, week + 5); exception when others then failed := true; end;
    assert failed, 'featured day without an event accepted';
    failed := false; begin perform public.players_admin_set_schedule_week(week + 1, null, null); exception when others then failed := true; end;
    assert failed, 'week not starting on Monday accepted';

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    schedule := public.players_public_schedule(week);
    assert schedule ->> 'image_url' = schedule_base || 'week.jpg', 'week image not public';
    assert (schedule ->> 'featured_day')::date = week + 2, 'featured day not public';
    -- 7 days: the 3 saved ones plus the weekly default programme for the others.
    assert jsonb_array_length(schedule -> 'days') = 7, 'week does not have 7 days';
    assert (select count(*) from jsonb_array_elements(schedule -> 'days') d where not (d ->> 'is_default')::boolean) = 3, 'saved days not public';
    assert schedule -> 'days' -> 2 ->> 'linked_card' = 'Seară de Șah' and not (schedule -> 'days' -> 2 ->> 'is_default')::boolean, 'saved day not public or not ordered';
    assert (schedule -> 'days' -> 3 ->> 'buy_in')::int = 10 and (schedule -> 'days' -> 3 ->> 'guaranteed')::int = 500, 'buy-in and guaranteed not public';
    assert schedule -> 'days' -> 3 ->> 'start_time' = '18:30:00', 'start time not public';
    assert (schedule -> 'days' -> 3 ->> 'min_players')::int = 12, 'minimum players not public';
    assert schedule -> 'days' -> 3 ->> 'note' = 'Studenți: 130 lei', 'note not public or not trimmed';
    assert (schedule -> 'days' -> 0 ->> 'is_default')::boolean and schedule -> 'days' -> 0 ->> 'linked_card' = monday_default, 'Monday does not follow the default programme';
    assert not has_table_privilege('anon', 'public.players_schedule_template', 'select'), 'anon can read the template directly';

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', visitor_claims, true);
    failed := false; begin perform public.players_admin_set_schedule_day(week + 3, 'Remi & Prieteni', null); exception when others then failed := true; end;
    assert failed, 'non-admin set a schedule day';

    perform set_config('request.jwt.claims', admin_claims, true);
    assert public.players_admin_clear_schedule_day(week + 2) = schedule_base || 'sah.jpg', 'clear did not return the image';
    assert public.players_public_schedule(week) ->> 'featured_day' is null, 'featured day kept after its day was cleared';
    assert (public.players_public_schedule(week) -> 'days' -> 2 ->> 'is_default')::boolean, 'cleared day does not fall back to the default programme';

    -- A day can be marked free even when the default programme has an event; clearing it brings the default back.
    perform public.players_admin_close_schedule_day(week + 1);
    assert (public.players_public_schedule(week) -> 'days' -> 1 ->> 'is_closed')::boolean and public.players_public_schedule(week) -> 'days' -> 1 ->> 'linked_card' is null, 'closed day not public';
    failed := false; begin perform public.players_admin_set_schedule_week(week, null, week + 1); exception when others then failed := true; end;
    assert failed, 'a free day accepted as event of the week';
    perform public.players_admin_clear_schedule_day(week + 1);
    assert (public.players_public_schedule(week) -> 'days' -> 1 ->> 'is_default')::boolean, 'cleared free day does not fall back to the default programme';
    perform set_config('request.jwt.claims', visitor_claims, true);
    failed := false; begin perform public.players_admin_close_schedule_day(week + 1); exception when others then failed := true; end;
    assert failed, 'non-admin marked a day free';
    perform set_config('request.jwt.claims', admin_claims, true);

    -- Admins edit the default programme; visitors cannot.
    assert (select count(*) from public.players_admin_list_schedule_template()) between 0 and 7, 'admin cannot list the default programme';
    perform public.players_admin_set_schedule_template_day(1::smallint, 'Campionat de FIFA', '21:00', 20, 1000, 8);
    assert public.players_public_schedule(week) -> 'days' -> 0 ->> 'linked_card' = 'Campionat de FIFA' and public.players_public_schedule(week) -> 'days' -> 0 ->> 'start_time' = '21:00:00', 'default programme change not applied';
    assert (public.players_public_schedule(week) -> 'days' -> 0 ->> 'buy_in')::int = 20 and (public.players_public_schedule(week) -> 'days' -> 0 ->> 'guaranteed')::int = 1000 and (public.players_public_schedule(week) -> 'days' -> 0 ->> 'min_players')::int = 8, 'default terms not public';
    failed := false; begin perform public.players_admin_set_schedule_template_day(1::smallint, 'Campionat de FIFA', null, null, null, 0); exception when others then failed := true; end;
    assert failed, 'zero default minimum players accepted';
    perform public.players_admin_set_schedule_template_day(1::smallint, null, null);
    assert not exists (select 1 from jsonb_array_elements(public.players_public_schedule(week) -> 'days') d where d ->> 'day' = week::text), 'cleared weekday still has a default event';
    failed := false; begin perform public.players_admin_set_schedule_template_day(1::smallint, 'Turneu inventat', null); exception when others then failed := true; end;
    assert failed, 'unknown default event accepted';
    failed := false; begin perform public.players_admin_set_schedule_template_day(8::smallint, 'Seară de Șah', null); exception when others then failed := true; end;
    assert failed, 'weekday 8 accepted';
    perform set_config('request.jwt.claims', visitor_claims, true);
    failed := false; begin perform public.players_admin_set_schedule_template_day(2::smallint, 'Seară de Table', null); exception when others then failed := true; end;
    assert failed, 'non-admin changed the default programme';
    failed := false; begin perform public.players_admin_list_schedule_template(); exception when others then failed := true; end;
    assert failed, 'non-admin listed the default programme';
    perform set_config('request.jwt.claims', admin_claims, true);
  end;

  -- Storage deletes need admins to see the object first: each admin bucket has an admin-only SELECT policy.
  declare
    bucket text;
  begin
    foreach bucket in array array['players-event-banners', 'players-videos', 'players-schedule'] loop
      assert exists (
        select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT' and roles = '{authenticated}'
          and qual like '%' || bucket || '%' and qual like '%is_players_admin()%'
      ), 'admins cannot read (and so cannot delete) objects in ' || bucket;
    end loop;
  end;

  raise exception 'ALL PASSED';
end $$;
