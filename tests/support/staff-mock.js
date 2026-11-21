// In-memory stand-in for the dealer staff RPCs (migrations 20261121120000_players_dealers.sql and later), layered on top of
// the main Supabase mock. Later page.route() handlers win, so only the staff RPCs are intercepted here.
const { mockSupabase, ADMIN_TOKEN, USER_TOKEN, USER, ADMIN_EMAIL } = require('./supabase-mock');

const SUPABASE_ORIGIN = 'https://lxhjfdxowpxzrybxdasi.supabase.co';
const DEALER_ID = 'dealer-1';

function dealerRow(overrides = {}) {
  return { id: DEALER_ID, full_name: 'Ana Maria Pop', email: USER.email, signed_at: '2026-09-01T10:00:00Z', start_date: '2026-09-01', is_active: true, ...overrides };
}

const bearer = request => (request.headers().authorization || '').replace('Bearer ', '');

function handlers(staff) {
  const isManager = request => bearer(request) === ADMIN_TOKEN || (bearer(request) === USER_TOKEN && staff.managers.includes(USER.email));
  const requireManager = request => { if (!isManager(request)) throw new Error('Acces interzis'); };
  const bundle = () => ({ dealer: staff.dealer, shifts: staff.shifts, tips: staff.tips, penalties: staff.penalties, payouts: staff.payouts });
  const boardBundle = () => ({ ...bundle(), roles: { dealer: true, floor: staff.managers.includes(staff.dealer.email), admin: false } });
  return {
    is_players_floor_manager: request => isManager(request),
    // Floor managers edit site content (is_players_admin) but only the admin token is a Super Admin.
    is_players_admin: request => isManager(request),
    is_players_super_admin: request => bearer(request) === ADMIN_TOKEN,
    players_dealer_sign: (request, body) => {
      if (staff.dealer) throw new Error('Ai semnat deja regulamentul');
      staff.dealer = dealerRow({ full_name: body.p_full_name, start_date: '2026-11-21', signed_at: new Date().toISOString() });
      return DEALER_ID;
    },
    players_dealer_me: request => (bearer(request) === USER_TOKEN && staff.dealer ? bundle() : null),
    players_dealer_check_in: (request, body) => {
      staff.shifts.unshift({ id: `shift-${staff.shifts.length + 1}`, check_in: body.p_at, check_out: null, status: 'open', dealer_check_in: body.p_at, dealer_check_out: null });
      return staff.shifts[0].id;
    },
    players_dealer_check_out: (request, body) => {
      const open = staff.shifts.find(shift => shift.status === 'open');
      Object.assign(open, { check_out: body.p_at, dealer_check_out: body.p_at, status: 'pending' });
      return open.id;
    },
    players_dealer_add_shift: (request, body) => {
      staff.shifts.unshift({ id: `shift-${staff.shifts.length + 1}`, check_in: body.p_check_in, check_out: body.p_check_out, status: 'pending' });
      return staff.shifts[0].id;
    },
    players_floor_pending_shifts: request => {
      requireManager(request);
      return staff.shifts.filter(shift => ['open', 'pending'].includes(shift.status)).map(shift => ({ ...shift, dealer_id: DEALER_ID, full_name: staff.dealer.full_name, overdue: Boolean(shift.overdue) }));
    },
    players_floor_review_shift: (request, body) => {
      requireManager(request);
      const shift = staff.shifts.find(row => row.id === body.p_shift);
      Object.assign(shift, body.p_approve ? { check_in: body.p_check_in, check_out: body.p_check_out, status: 'approved' } : { status: 'rejected' });
      return true;
    },
    players_floor_day: request => {
      requireManager(request);
      return staff.dealer ? [{ dealer_id: DEALER_ID, full_name: staff.dealer.full_name, tips: null, shifts: [] }] : [];
    },
    players_floor_set_tips: (request, body) => {
      requireManager(request);
      staff.tips.push({ day: body.p_day, total: body.p_total });
      return true;
    },
    players_floor_add_shift: request => { requireManager(request); return 'shift-x'; },
    players_floor_dealers: request => {
      requireManager(request);
      return staff.dealer ? [{ ...staff.dealer, open_shift: false, pending_shifts: staff.shifts.filter(shift => shift.status === 'pending').length }] : [];
    },
    players_floor_dealer: request => { requireManager(request); return bundle(); },
    players_floor_add_penalty: (request, body) => {
      requireManager(request);
      staff.penalties.unshift({ id: `penalty-${staff.penalties.length + 1}`, day: body.p_day, amount: body.p_amount, reason: body.p_reason });
      return staff.penalties[0].id;
    },
    players_floor_record_payout: (request, body) => {
      requireManager(request);
      if (staff.payouts.some(row => row.kind === body.p_kind && row.period === body.p_period)) throw new Error('Plata este deja trecută. Șterge-o întâi dacă vrei s-o corectezi.');
      const note = String(body.p_note || '').trim() || null;
      staff.payouts.unshift({ id: `payout-${staff.payouts.length + 1}`, kind: body.p_kind, period: body.p_period, amount: body.p_amount, from_deposit: body.p_from_deposit, paid_on: body.p_paid_on, note });
      return staff.payouts[0].id;
    },
    players_floor_delete_payout: (request, body) => {
      requireManager(request);
      staff.payouts = staff.payouts.filter(row => row.id !== body.p_payout);
      return true;
    },
    players_my_roles: request => {
      if (bearer(request) === ADMIN_TOKEN) return { dealer: Boolean(staff.adminIsDealer), floor: true, admin: true };
      if (bearer(request) === USER_TOKEN) return { dealer: Boolean(staff.dealer), floor: staff.managers.includes(USER.email), admin: false };
      throw new Error('permission denied for function players_my_roles');
    },
    players_admin_staff_directory: request => {
      if (bearer(request) !== ADMIN_TOKEN) throw new Error('Acces interzis');
      const people = new Map([[ADMIN_EMAIL, { email: ADMIN_EMAIL, full_name: null, roles: { dealer: false, floor: true, admin: true } }]]);
      if (staff.dealer) people.set(staff.dealer.email, { email: staff.dealer.email, full_name: staff.dealer.full_name, roles: { dealer: true, floor: staff.managers.includes(staff.dealer.email), admin: false } });
      staff.managers.forEach(email => { if (!people.has(email)) people.set(email, { email, full_name: null, roles: { dealer: false, floor: true, admin: false } }); });
      return [...people.values()];
    },
    players_staff_board: request => {
      const isDealer = bearer(request) === USER_TOKEN && staff.dealer;
      if (!isDealer && !isManager(request)) throw new Error('Acces doar pentru dealeri și șefi de sală');
      return [...(staff.dealer ? [boardBundle()] : []), ...staff.team];
    },
    players_floor_request_mine: request => (bearer(request) === USER_TOKEN ? staff.request : null),
    players_floor_request_view: (request, body) => staff.approvals[body.p_token] || null,
    players_floor_request_decide: (request, body) => {
      const pending = staff.approvals[body.p_token];
      if (!pending) throw new Error('Linkul nu este valid');
      if (pending.status !== 'pending') return pending.status;
      pending.status = body.p_approve ? 'approved' : 'rejected';
      if (body.p_approve) staff.managers.push(pending.email);
      return pending.status;
    },
    players_admin_list_floor_requests: request => {
      if (bearer(request) !== ADMIN_TOKEN) throw new Error('Acces interzis');
      return staff.adminRequests.filter(row => row.status === 'pending');
    },
    players_admin_decide_floor_request: (request, body) => {
      if (bearer(request) !== ADMIN_TOKEN) throw new Error('Acces interzis');
      const row = staff.adminRequests.find(entry => entry.id === body.p_id);
      row.status = body.p_approve ? 'approved' : 'rejected';
      if (body.p_approve) staff.managers.push(row.email);
      return row.status;
    },
    players_admin_list_floor_managers: request => {
      if (bearer(request) !== ADMIN_TOKEN) throw new Error('Acces interzis');
      return staff.managers.map(email => ({ email, added_at: '2026-11-01T00:00:00Z', added_by: ADMIN_EMAIL }));
    },
    players_admin_add_floor_manager: (request, body) => {
      if (bearer(request) !== ADMIN_TOKEN) throw new Error('Acces interzis');
      staff.managers.push(body.p_email.trim().toLowerCase());
      return true;
    },
  };
}

async function mockStaff(page, { admin = false, user = false, dealer = null, managers = [], shifts = [], tips = [], penalties = [], request = null, approvals = {}, floorRequestError = null, team = [], adminRequests = [], payouts = [], adminIsDealer = false } = {}) {
  const state = await mockSupabase(page, { admin, user });
  const staff = { dealer, managers: [...managers], shifts: [...shifts], tips: [...tips], penalties: [...penalties], request, approvals: structuredClone(approvals), floorRequests: [], team: structuredClone(team), adminRequests: structuredClone(adminRequests), payouts: structuredClone(payouts), adminIsDealer, calls: [] };
  const table = handlers(staff);
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/rpc/**`, async route => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split('/').pop();
    if (!table[name]) return route.fallback();
    const body = request.postData() ? request.postDataJSON() : {};
    staff.calls.push({ name, body });
    try {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(table[name](request, body)) });
    } catch (error) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: error.message }) });
    }
  });
  // The Vercel function /api/floor-request (api/floor-request.js) does not run under the static test server.
  await page.route('**/api/floor-request', async route => {
    const request = route.request();
    staff.floorRequests.push({ authorization: request.headers().authorization, body: request.postDataJSON() });
    if (floorRequestError) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: floorRequestError }) });
    staff.request = { status: 'pending', full_name: request.postDataJSON().fullName, created_at: '2026-11-21T10:00:00Z' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  return { state, staff };
}

module.exports = { mockStaff, dealerRow, DEALER_ID };
