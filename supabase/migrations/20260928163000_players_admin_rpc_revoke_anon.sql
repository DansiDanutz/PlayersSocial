-- Supabase default privileges grant anon EXECUTE on new functions; admin RPCs are for signed-in admins only.
revoke execute on function public.players_admin_create_event(text, text, date, time, integer, text, text, text) from anon;
revoke execute on function public.players_admin_update_featured_event(text, text, date, time, integer, text, text, text, integer, text, text, boolean) from anon;
revoke execute on function public.players_admin_event_notes() from anon;
revoke execute on function public.players_admin_registrants(text) from anon;
