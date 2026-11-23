// Super admin "Voucher list" (/staff/vouchere/): every promo voucher issued by Mirela on /promotions.
// Data comes only from players_admin_promo_vouchers (super admins; phones are personal data).
(function () {
  const { el, rpc, currentUser, loginPrompt, signOutTo, dateLabel, time } = window.Staff;
  const app = document.getElementById('app');
  const Q1 = { cash: 'Cash', tournaments: 'Turnee', both: 'Ambele', other: 'Altceva' };
  const Q2 = { low_2_5: '2-5 lei', high_5_10_plus: '5-10+ lei', both: 'Ambele', not_applicable: '—', other: 'Altceva' };
  const when = iso => (iso ? `${dateLabel(iso)}, ${time(iso)}` : '—');
  let rows = [];
  let filter = 'all';
  let query = '';

  function state(v) {
    if (v.void_reason) return ['rejected', 'Anulat'];
    if (v.opted_out_at) return ['rejected', 'STOP'];
    if (v.redeemed_count >= 5) return ['approved', 'Folosit complet'];
    if (v.whatsapp_confirmed_at) return ['approved', 'Confirmat'];
    return ['pending', 'Așteaptă WhatsApp'];
  }

  async function act(v, action) {
    let notes = null;
    if (action === 'void') { notes = prompt(`Motivul anulării pentru ${v.serial}:`); if (!notes) return; }
    else if (action === 'note') { notes = prompt(`Notă pentru ${v.serial}:`, v.notes || ''); if (notes === null) return; }
    else if (!confirm(action === 'redeem' ? `Marchezi încă un cupon de 100 lei folosit pentru ${v.serial}?` : `Marchezi STOP pentru ${v.serial}?`)) return;
    try { await rpc('players_admin_promo_voucher_update', { p_serial: v.serial, p_action: action, p_notes: notes }); await load(); }
    catch (error) { alert(error.message); }
  }

  function row(v) {
    const [tone, label] = state(v);
    const phone = v.phone
      ? el('a', { href: `https://wa.me/${v.phone.replace('+', '')}`, target: '_blank', rel: 'noopener' }, v.phone)
      : el('span', { class: 'muted' }, 'așteaptă WhatsApp');
    const closed = Boolean(v.void_reason || v.opted_out_at);
    return el('tr', {},
      el('td', {}, el('b', {}, v.serial), el('br'), el('small', { class: 'muted' }, `control ${v.check_code}`)),
      el('td', {}, v.full_name, v.notes ? el('div', { class: 'muted' }, v.notes) : null, v.void_reason ? el('div', { class: 'muted' }, `Anulat: ${v.void_reason}`) : null),
      el('td', {}, phone),
      el('td', {}, Q1[v.q1_preference] || v.q1_preference),
      el('td', {}, Q2[v.q2_stakes] || v.q2_stakes),
      el('td', {}, v.invite_consent ? 'da' : 'nu'),
      el('td', {}, when(v.created_at)),
      el('td', {}, when(v.whatsapp_confirmed_at)),
      el('td', { class: 'num' }, `${v.redeemed_count}/5`),
      el('td', {}, el('span', { class: `chip ${tone}` }, label)),
      el('td', {},
        el('button', { class: 'btn small', type: 'button', disabled: closed || !v.whatsapp_confirmed_at || v.redeemed_count >= 5, onclick: () => act(v, 'redeem') }, '+1 folosit'), ' ',
        el('button', { class: 'btn ghost small', type: 'button', onclick: () => act(v, 'note') }, 'Notă'), ' ',
        el('button', { class: 'btn ghost small', type: 'button', disabled: closed, onclick: () => act(v, 'opt_out') }, 'STOP'), ' ',
        el('button', { class: 'btn danger small', type: 'button', disabled: closed, onclick: () => act(v, 'void') }, 'Anulează')));
  }

  function render() {
    const q = query.toLowerCase();
    const list = rows.filter(v => (filter === 'all' || (filter === 'pending' ? !v.whatsapp_confirmed_at : Boolean(v.whatsapp_confirmed_at)))
      && (!q || [v.serial, v.full_name, v.phone || ''].join(' ').toLowerCase().includes(q)));
    const confirmed = rows.filter(v => v.whatsapp_confirmed_at).length;
    const used = rows.reduce((sum, v) => sum + v.redeemed_count, 0);
    const search = el('input', { type: 'search', placeholder: 'Caută serie, nume sau telefon', value: query, 'aria-label': 'Caută' });
    search.addEventListener('input', () => { query = search.value; render(); search.focus(); });
    const select = el('select', { 'aria-label': 'Filtru' },
      ...[['all', 'Toate'], ['confirmed', 'Confirmate pe WhatsApp'], ['pending', 'Așteaptă WhatsApp']].map(([value, label]) => el('option', { value, selected: filter === value }, label)));
    select.addEventListener('change', () => { filter = select.value; render(); });
    app.replaceChildren(
      el('h1', {}, 'Vouchere promoție'),
      el('p', { class: 'muted' }, 'Voucher 500 lei = 5 × 100 lei Bonus Cash Game. Seria e emisă de Mirela; telefonul se atașează când jucătorul trimite voucherul pe WhatsApp.'),
      el('div', { class: 'tiles' },
        el('div', { class: 'tile' }, el('small', {}, 'Emise'), el('b', {}, String(rows.length))),
        el('div', { class: 'tile' }, el('small', {}, 'Confirmate WhatsApp'), el('b', {}, String(confirmed))),
        el('div', { class: 'tile' }, el('small', {}, 'Cupoane folosite'), el('b', {}, String(used)))),
      el('div', { class: 'panel' },
        el('div', { class: 'row' }, search, select),
        list.length ? el('div', { class: 'table-wrap' }, el('table', {},
          el('thead', {}, el('tr', {}, ...['Serie', 'Nume', 'Telefon', 'Cash/Turnee', 'Mize', 'Invitații', 'Emis', 'Confirmat', 'Folosit', 'Stare', ''].map(h => el('th', {}, h)))),
          el('tbody', {}, ...list.map(row))))
          : el('p', { class: 'empty' }, rows.length ? 'Niciun voucher pentru filtrul ales.' : 'Încă nu sunt vouchere.')));
  }

  async function load() { rows = await rpc('players_admin_promo_vouchers'); render(); }

  (async () => {
    const user = await currentUser();
    if (!user) return loginPrompt(app, 'Intră în cont ca super admin ca să vezi voucherele.');
    document.getElementById('who').textContent = user.email || '';
    const signOut = document.getElementById('signOut');
    signOut.hidden = false;
    signOut.addEventListener('click', () => signOutTo('/'));
    try { await load(); }
    catch (error) { app.replaceChildren(el('div', { class: 'notice' }, el('p', {}, error.message === 'Acces interzis' ? 'Doar super adminii văd lista de vouchere.' : error.message))); }
  })();
})();
