-- Public pages read events only through players_public_events(); direct table reads exposed
-- admin_notes and hidden events to anonymous visitors. Admins keep full access via their policy.
drop policy if exists "Anyone can read event workflow" on public.players_events;

-- Admin RPCs already reject non-admins internally; also deny anonymous callers at the privilege level.
revoke execute on function public.is_players_admin() from anon;
revoke execute on function public.players_admin_notify_all(text) from anon;
revoke execute on function public.players_admin_set_target(text, integer) from anon;
revoke execute on function public.players_admin_update_event(text, integer, date) from anon;
revoke execute on function public.players_create_notification(text, text, text) from anon;

-- Trigger functions are never called through the API (triggers don't need EXECUTE to fire).
revoke execute on function public.players_maybe_start_confirmation() from anon, authenticated;
revoke execute on function public.players_validate_event_status() from anon, authenticated;
