// In-memory stand-in for the Supabase REST, auth and storage endpoints the page calls.
// Each test gets its own state; `calls` records request bodies for assertions.
const SUPABASE_ORIGIN = 'https://lxhjfdxowpxzrybxdasi.supabase.co';
const ADMIN_TOKEN = 'admin-access-token';
const ADMIN_EMAIL = 'semebitcoin@gmail.com';
const USER_TOKEN = 'user-access-token';
const USER = { id: 'user-id', email: 'ana.pop@example.com', user_metadata: { full_name: 'Ana Maria Pop', avatar_url: null } };

const CATEGORY_CARDS = ['Seară de Șah', 'Seară de Table', 'Turneu de Ping-Pong', 'Karaoke Club', 'Stand-up Open Mic', 'Remi & Prieteni', 'Campionat de FIFA', 'Seară Champions League', 'Team Building', 'Evenimente Caritabile'];

function categoryRow(name) {
  return { event_name: name, event_date: null, participant_target: 20, status: 'coming_soon', joined_count: 0, accepted_count: 0, linked_card: null, start_time: null, description: null, location: null, banner_url: null, is_featured: false, created_at: '2026-09-01T00:00:00Z', final_participants: null, public_recap: null, is_hidden: false };
}

function featuredRow(overrides) {
  return { ...categoryRow(overrides.event_name), linked_card: 'Remi & Prieteni', start_time: '18:00:00', participant_target: 24, description: 'Turneu de remi pe echipe cu premii.', location: 'Str. Louis Pasteur nr. 75, Cluj-Napoca', banner_url: '/poster-remi.webp', is_featured: true, ...overrides };
}

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const bearer = request => (request.headers().authorization || '').replace('Bearer ', '');
const isAdminRequest = request => bearer(request) === ADMIN_TOKEN;

function rpcHandlers(state) {
  return {
    players_public_events: request => state.events.filter(row => !row.is_hidden || isAdminRequest(request)),
    players_registration_status: () => [],
    players_notifications_for_token: () => [],
    players_public_registrants: () => [],
    is_players_admin: request => isAdminRequest(request) || (bearer(request) === USER_TOKEN && state.admins.includes(USER.email)),
    players_admin_event_notes: () => state.events.filter(row => row.is_featured).map(row => ({ event_name: row.event_name, admin_notes: row.admin_notes || null })),
    players_admin_registrants: () => state.registrants,
    players_register: (request, body) => ({ token: `token-${state.calls.length}`, status: 'registered' }),
    players_admin_create_event: (request, body) => {
      state.events.push(featuredRow({ event_name: body.p_event_name, linked_card: body.p_linked_card, event_date: body.p_event_date, start_time: `${body.p_start_time}:00`, participant_target: body.p_target, description: body.p_description, location: body.p_location, banner_url: body.p_banner_url }));
      return true;
    },
    players_public_videos: () => {
      if (state.videosFail) throw new Error('videos unavailable');
      return state.videos;
    },
    players_admin_add_video: (request, body) => {
      const row = { id: `video-${state.videos.length + 1}`, category: body.p_category, video_type: body.p_type, title: body.p_title, description: body.p_description, video_url: body.p_video_url, poster_url: body.p_poster_url, created_at: '2026-10-01T12:00:00Z' };
      state.videos.unshift(row);
      return row.id;
    },
    players_admin_delete_video: (request, body) => {
      const row = state.videos.find(video => video.id === body.p_id);
      state.videos = state.videos.filter(video => video.id !== body.p_id);
      return [{ video_url: row.video_url, poster_url: row.poster_url }];
    },
    players_public_schedule: (request, body) => {
      const start = new Date(`${body.p_week_start}T00:00:00Z`), end = new Date(start.getTime() + 6 * 86400000);
      const inWeek = day => { const date = new Date(`${day}T00:00:00Z`); return date >= start && date <= end; };
      const week = state.scheduleWeeks[body.p_week_start] || {};
      const days = Object.entries(state.scheduleDays).filter(([day]) => inWeek(day)).sort().map(([day, row]) => ({ day, ...row }));
      return { week_start: body.p_week_start, image_url: week.image_url || null, featured_day: week.featured_day || null, days };
    },
    players_admin_set_schedule_day: (request, body) => {
      const previous = state.scheduleDays[body.p_day]?.image_url || null;
      state.scheduleDays[body.p_day] = { linked_card: body.p_linked_card, image_url: body.p_image_url || null };
      return previous !== (body.p_image_url || null) ? previous : null;
    },
    players_admin_clear_schedule_day: (request, body) => {
      const previous = state.scheduleDays[body.p_day]?.image_url || null;
      delete state.scheduleDays[body.p_day];
      Object.values(state.scheduleWeeks).forEach(week => { if (week.featured_day === body.p_day) week.featured_day = null; });
      return previous;
    },
    players_admin_set_schedule_week: (request, body) => {
      const previous = state.scheduleWeeks[body.p_week_start]?.image_url || null;
      state.scheduleWeeks[body.p_week_start] = { image_url: body.p_image_url || null, featured_day: body.p_featured_day || null };
      return previous !== (body.p_image_url || null) ? previous : null;
    },
    players_admin_list_admins: () => state.admins.map(email => ({ email, added_at: '2026-09-19T10:00:00Z', added_by: null })),
    players_admin_add_admin: (request, body) => {
      const email = String(body.p_email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Adresă de email invalidă');
      if (!state.admins.includes(email)) state.admins.push(email);
      return true;
    },
    players_admin_remove_admin: (request, body) => {
      state.admins = state.admins.filter(email => email !== body.p_email);
      return true;
    },
    players_admin_update_featured_event: (request, body) => {
      state.events = state.events.map(row => row.event_name === body.p_event_name ? { ...row, final_participants: body.p_final_participants, public_recap: body.p_public_recap, admin_notes: body.p_admin_notes, is_hidden: body.p_is_hidden } : row);
      return true;
    },
  };
}

async function handle(route, state) {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  const body = request.postData() && request.headers()['content-type']?.includes('json') ? request.postDataJSON() : null;
  if (path.startsWith('/rest/v1/rpc/')) {
    const name = path.slice('/rest/v1/rpc/'.length), handler = rpcHandlers(state)[name];
    state.calls.push({ name, body, token: bearer(request) });
    if (!handler) return json(route, { message: `unmocked rpc ${name}` }, 404);
    try { return json(route, handler(request, body)); } catch (error) { return json(route, { message: error.message }, 500); }
  }
  if (path === '/auth/v1/user') {
    if (isAdminRequest(request)) return json(route, { id: 'admin-id', email: ADMIN_EMAIL, user_metadata: { full_name: 'David Admin' } });
    return bearer(request) === USER_TOKEN ? json(route, USER) : json(route, { message: 'invalid' }, 401);
  }
  if (path === '/auth/v1/otp') {
    state.calls.push({ name: 'otp', body, redirect: url.searchParams.get('redirect_to') });
    return json(route, {});
  }
  if (path === '/auth/v1/logout') return json(route, {});
  if (path === '/auth/v1/verify') {
    state.calls.push({ name: 'verify', body });
    return body?.token_hash === 'valid-hash' ? json(route, { access_token: ADMIN_TOKEN, refresh_token: 'refresh' }) : json(route, { message: 'expired' }, 403);
  }
  if (path.startsWith('/storage/v1/object/players-event-banners/') || path.startsWith('/storage/v1/object/players-videos/') || path.startsWith('/storage/v1/object/players-schedule/')) {
    state.calls.push({ name: `storage:${request.method()}`, path });
    return json(route, { Key: path });
  }
  return json(route, { message: `unmocked ${request.method()} ${path}` }, 404);
}

async function mockSupabase(page, { events = [], registrants = [], videos = [], videosFail = false, scheduleDays = {}, scheduleWeeks = {}, admin = false, user = false } = {}) {
  const state = { events: [...CATEGORY_CARDS.map(categoryRow), ...events], registrants, videos: [...videos], videosFail, scheduleDays: { ...scheduleDays }, scheduleWeeks: { ...scheduleWeeks }, admins: [ADMIN_EMAIL, 'toma.alinflorin@yahoo.com'], calls: [] };
  await page.route(`${SUPABASE_ORIGIN}/**`, route => handle(route, state));
  await page.route(/fonts\.(googleapis|gstatic)\.com|maps\.google/, route => route.abort());
  const sessionToken = admin ? ADMIN_TOKEN : user ? USER_TOKEN : null;
  if (sessionToken) await page.addInitScript(token => localStorage.setItem('players-admin-session', JSON.stringify({ access_token: token, refresh_token: 'refresh' })), sessionToken);
  return state;
}

// Navigates and waits until the page has rendered the first players_public_events response.
async function gotoLoaded(page, url) {
  const loaded = page.waitForResponse(response => response.url().endsWith('/rest/v1/rpc/players_public_events'));
  await page.goto(url);
  await loaded;
  await page.locator('#eventGrid .event .status-chip').first().waitFor({ state: 'attached' });
}

const VIDEO_BASE = `${SUPABASE_ORIGIN}/storage/v1/object/public/players-videos/`;
function videoRow(overrides) {
  return { id: 'video-db-1', category: 'remi', video_type: 'event', title: 'Seara de Remi · 10 octombrie', description: 'Momente de la turneu.', video_url: `${VIDEO_BASE}seara-remi.mp4`, poster_url: null, created_at: '2026-10-01T12:00:00Z', ...overrides };
}

const SCHEDULE_BASE = `${SUPABASE_ORIGIN}/storage/v1/object/public/players-schedule/`;

// Opens a dashboard section; on phones the sections sit behind the dashboard menu button.
async function openDashboardSection(page, section) {
  const toggle = page.locator('.dashboard-menu-toggle');
  if (await toggle.isVisible()) await toggle.click();
  await page.locator(`.dashboard-nav button[data-section="${section}"]`).click();
}

module.exports = { mockSupabase, openDashboardSection, featuredRow, videoRow, gotoLoaded, ADMIN_TOKEN, ADMIN_EMAIL, USER_TOKEN, USER, VIDEO_BASE, SCHEDULE_BASE };
