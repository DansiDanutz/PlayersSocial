// Shared plumbing for the staff pages (/dealer/, /sef-de-sala/, the signing form on /dealers-payout/).
// The session is the one the main site stores after "Intră în cont"; signing in always happens on the home page,
// which sends the visitor back here (see the staff login handoff in /app-shell.js).
(function () {
  const SUPABASE_URL = 'https://lxhjfdxowpxzrybxdasi.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_JoxC66D5pZiyxWmSVB2Vrw_A9nL2B9C';
  const SESSION_KEY = 'players-admin-session';
  const RETURN_KEY = 'players-return-to';

  const headers = token => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${token || SUPABASE_KEY}`, 'Content-Type': 'application/json' });
  let tokens = null;

  function readTokens() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  async function refresh(saved) {
    if (!saved?.refresh_token) return null;
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: headers(), body: JSON.stringify({ refresh_token: saved.refresh_token }) });
    if (!response.ok) return null;
    const session = await response.json();
    const next = { access_token: session.access_token, refresh_token: session.refresh_token };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return next;
  }

  async function fetchUser(saved) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: headers(saved.access_token) });
    return response.ok ? response.json() : null;
  }

  // Returns the signed-in user, refreshing an expired token once; null when nobody is signed in.
  async function currentUser() {
    const saved = readTokens();
    if (!saved?.access_token) return null;
    let user = await fetchUser(saved).catch(() => null);
    tokens = saved;
    if (!user) {
      tokens = await refresh(saved).catch(() => null);
      user = tokens ? await fetchUser(tokens).catch(() => null) : null;
    }
    if (user) showMyRoles();
    return user;
  }

  // The signed-in account's role icons in the page header, once per page.
  let rolesShown = false;
  async function showMyRoles() {
    const topbar = document.querySelector('.topbar');
    if (rolesShown || !topbar || !window.PlayersRoles) return;
    rolesShown = true;
    const roles = await rpc('players_my_roles').catch(() => null);
    if (!roles) return;
    const icons = window.PlayersRoles.render(roles);
    icons.id = 'myRoles';
    const who = topbar.querySelector('.who');
    if (who) who.before(icons); else topbar.append(icons);
  }

  async function rpc(name, body = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: headers(tokens?.access_token), body: JSON.stringify(body) });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.message || 'A apărut o eroare. Încearcă din nou.');
    return data;
  }

  // Floor manager access goes through /api/floor-request, which emails the approval link to the super admin.
  async function requestFloorAccess(fullName) {
    const response = await fetch('/api/floor-request', { method: 'POST', headers: { Authorization: `Bearer ${tokens?.access_token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName }) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'Cererea nu a putut fi trimisă. Încearcă din nou.');
    return data;
  }

  const cleanName = value => String(value || '').trim().replace(/\s+/g, ' ');
  const isFullName = name => name.length >= 3 && name.includes(' ');

  function goToLogin() {
    localStorage.setItem(RETURN_KEY, JSON.stringify({ path: location.pathname, at: Date.now() }));
    location.assign('/?login=1');
  }

  function signOutTo(path) {
    localStorage.removeItem(SESSION_KEY);
    location.assign(path);
  }

  const money = value => `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 }).format(Number(value) || 0)} RON`;
  const signedMoney = value => (value > 0 ? `+${money(value)}` : value < 0 ? `−${money(-value)}` : money(0));
  const hours = value => `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 }).format(Number(value) || 0)} h`;
  const time = iso => (iso ? new Date(iso).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) : '—');
  const dateLabel = iso => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short' });
  const monthLabel = key => new Date(`${key}-15T12:00:00`).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' });
  const pad = value => String(value).padStart(2, '0');
  // datetime-local inputs work in the device's time; the club's devices run on Romanian time.
  const toInput = iso => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fromInput = value => (value ? new Date(value).toISOString() : null);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  const STATUS_LABELS = { open: 'La lucru', pending: 'De aprobat', approved: 'Aprobat', rejected: 'Respins' };

  // Traffic-light tone for a progress percentage (deposit towards its target): red, orange, yellow, green.
  const toneFor = percent => (percent >= 75 ? 'tone-green' : percent >= 50 ? 'tone-yellow' : percent >= 25 ? 'tone-orange' : 'tone-red');

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    children.flat().forEach(child => { if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : String(child)); });
    return node;
  }

  function loginPrompt(container, message) {
    container.replaceChildren(el('div', { class: 'notice' },
      el('p', {}, message),
      el('button', { class: 'btn', type: 'button', onclick: goToLogin }, 'Intră în cont')));
  }

  // Highlights the header link of the page being viewed.
  document.querySelectorAll('.topbar a[href]').forEach(link => {
    if (new URL(link.href, location.href).pathname === location.pathname) link.setAttribute('aria-current', 'page');
  });

  window.Staff = { currentUser, rpc, requestFloorAccess, cleanName, isFullName, goToLogin, signOutTo, loginPrompt, el, money, signedMoney, hours, time, dateLabel, monthLabel, toInput, fromInput, today, STATUS_LABELS, toneFor };
})();
