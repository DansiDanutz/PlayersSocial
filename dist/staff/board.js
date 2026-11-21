// /echipa/: every dealer's card, visible to all staff (dealers and floor managers). The database returns the raw
// facts for all active dealers (players_staff_board); every figure is computed by DealerMath like on /dealer/.
// The board shows one month at a time (current month by default), as cards or as a table.
(function () {
  const { currentUser, rpc, loginPrompt, el, money, signedMoney, hours, monthLabel } = window.Staff;
  const app = document.getElementById('app');
  const sheet = document.getElementById('sheet');
  const VIEW_KEY = 'players-board-view';
  const SORTS = {
    hours: ['Cele mai multe ore', (a, b) => b.month.hours - a.month.hours],
    payout: ['Cel mai mult de primit', (a, b) => b.month.payout - a.month.payout],
    tips: ['Cele mai multe tips', (a, b) => b.month.tips - a.month.tips],
    deposit: ['Cel mai mare depozit', (a, b) => b.card.deposit.balance - a.card.deposit.balance],
    name: ['Nume', (a, b) => a.name.localeCompare(b.name, 'ro')],
  };
  const EMPTY_MONTH = { hours: 0, tips: 0, dealerShare: 0, adjustment: 0, payout: 0, days: 0, closed: true, paid: 0, remaining: 0, payStatus: 'none' };
  const PAY_BADGES = { paid: ['Plătit', 'good'], partial: ['Plătit parțial', 'warn'], due: ['De plătit', 'warn'] };
  const payBadge = row => (PAY_BADGES[row.month.payStatus] ? badge(...PAY_BADGES[row.month.payStatus]) : null);
  let rows = [];
  let months = [];
  let month = null;
  let query = '';
  let sort = 'hours';
  let view = readView();

  function readView() {
    try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards'; } catch { return 'cards'; }
  }
  function saveView(value) {
    view = value;
    try { localStorage.setItem(VIEW_KEY, value); } catch { /* private mode: the choice lasts for this visit */ }
  }

  const shortDate = day => new Date(`${day}T12:00:00`).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  const initials = name => name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
  const sumBy = (list, pick) => list.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
  const badge = (text, kind = '') => el('span', { class: `b-badge ${kind}` }, text);
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

  // Figures of one dealer for the selected month.
  function withMonth(row) {
    const found = row.card.months.find(entry => entry.key === month);
    const penalties = row.bundle.penalties.filter(penalty => String(penalty.day).startsWith(month));
    return { ...row, month: found || EMPTY_MONTH, monthPenalties: penalties };
  }

  function statCard(label, value, note) {
    return el('div', { class: 'b-card b-stat' }, el('span', {}, label), el('b', {}, value), note ? el('small', {}, note) : null);
  }

  function badges(row) {
    const list = [payBadge(row)].filter(Boolean);
    if (row.card.pendingShifts) list.push(badge(plural(row.card.pendingShifts, 'tură de aprobat', 'ture de aprobat'), 'warn'));
    list.push(row.monthPenalties.length ? badge(plural(row.monthPenalties.length, 'penalizare', 'penalizări'), 'bad') : badge('Fără penalizări', 'good'));
    list.push(badge(`Bonus ${shortDate(row.card.nextBonus.date)}`, row.card.nextBonus.eligible ? 'good' : ''));
    return list;
  }

  function depositProgress(row) {
    const { balance, target } = row.card.deposit;
    const percent = Math.max(0, Math.min(100, Math.round((balance / target) * 100))) || 0;
    return el('div', { class: 'b-progress' },
      el('div', { class: 'b-progress-row' }, el('span', {}, 'Depozit'), el('span', {}, `${money(balance)} / ${money(target)}`)),
      el('div', { class: 'b-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent), 'aria-label': `Depozit ${row.name}` }, el('i', { style: `width:${percent}%` })));
  }

  function dealerCard(row) {
    return el('button', { class: 'b-card b-dealer', type: 'button', 'aria-label': `Deschide cardul lui ${row.name}`, onclick: () => openSheet(row) },
      el('div', { class: 'b-dealer-head' },
        el('span', { class: 'b-avatar', 'aria-hidden': 'true' }, initials(row.name)),
        el('div', { class: 'b-name' }, el('b', {}, row.name), el('p', { class: 'b-muted' }, `Din ${shortDate(row.bundle.dealer.start_date)}`)),
        row.card.openShift ? badge('La lucru', 'live') : null),
      el('dl', { class: 'b-figures' },
        el('div', {}, el('dt', {}, 'Ore'), el('dd', {}, hours(row.month.hours))),
        el('div', {}, el('dt', {}, 'Tips la masă'), el('dd', {}, money(row.month.tips))),
        el('div', {}, el('dt', {}, 'Partea dealerului'), el('dd', {}, money(row.month.dealerShare))),
        el('div', {}, el('dt', {}, row.month.closed ? 'De primit' : 'De primit (estimat)'), el('dd', {}, money(row.month.payout)))),
      depositProgress(row),
      el('div', { class: 'b-foot' }, ...badges(row)));
  }

  function dealerTable(list) {
    const td = (label, value, cls = 'num') => el('td', { class: cls, 'data-label': label }, value);
    return el('div', { class: 'table-wrap' }, el('table', { class: 'stack b-table' },
      el('thead', {}, el('tr', {}, ...['Dealer', 'Ore', 'Tips la masă', 'Partea dealerului', 'Garanție', 'De primit', 'Plată', 'Depozit', 'Penalizări']
        .map((name, index) => el('th', { class: index && index !== 6 ? 'num' : '' }, name)))),
      el('tbody', {}, list.map(row => el('tr', {},
        el('td', { class: 'lead', 'data-label': 'Dealer' },
          el('button', { class: 'b-link', type: 'button', onclick: () => openSheet(row) }, row.name),
          row.card.openShift ? badge('La lucru', 'live') : null),
        td('Ore', hours(row.month.hours)),
        td('Tips la masă', money(row.month.tips)),
        td('Partea dealerului', money(row.month.dealerShare)),
        td('Garanție', row.month.adjustment ? signedMoney(row.month.adjustment) : '—'),
        td('De primit', el('b', {}, money(row.month.payout))),
        td('Plată', payBadge(row) || '—', ''),
        td('Depozit', money(row.card.deposit.balance)),
        td('Penalizări', row.monthPenalties.length ? `−${money(sumBy(row.monthPenalties, penalty => penalty.amount))}` : '—'))))));
  }

  function openSheet(row) {
    document.getElementById('sheetTitle').textContent = row.name;
    document.getElementById('sheetSub').textContent = `Dealer din ${shortDate(row.bundle.dealer.start_date)}`;
    window.DealerCard.renderCard(document.getElementById('sheetBody'), row.bundle, { viewer: 'other' });
    sheet.showModal();
  }
  document.getElementById('sheetClose').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', event => { if (event.target === sheet) sheet.close(); });

  function visibleRows() {
    const needle = query.trim().toLocaleLowerCase('ro');
    return rows.map(withMonth).filter(row => row.name.toLocaleLowerCase('ro').includes(needle)).sort(SORTS[sort][1]);
  }

  function renderStats(target) {
    const list = rows.map(withMonth);
    const atWork = rows.filter(row => row.card.openShift).length;
    const current = months[months.length - 1] === month;
    target.replaceChildren(
      statCard('Dealeri activi', String(rows.length), atWork ? `${atWork} la lucru acum` : 'nimeni la lucru acum'),
      statCard('Ore aprobate', hours(sumBy(list, row => row.month.hours)), monthLabel(month)),
      statCard('Tips la mese', money(sumBy(list, row => row.month.tips)), `partea dealerilor ${money(sumBy(list, row => row.month.dealerShare))}`),
      statCard(current ? 'De plătit (estimat)' : 'De plătit', money(sumBy(list, row => row.month.payout)),
        current ? 'cu garanția inclusă' : `plătit ${money(sumBy(list, row => row.month.paid))} · rămas ${money(sumBy(list, row => row.month.remaining))}`),
      statCard('Depozite', money(sumBy(rows, row => row.card.deposit.balance)), 'soldul de azi'));
  }

  function renderList(target) {
    const list = visibleRows();
    if (!list.length) {
      target.replaceChildren(el('div', { class: 'b-card b-empty' }, el('p', { class: 'b-muted' }, rows.length ? 'Niciun dealer nu se potrivește căutării.' : 'Încă nu există dealeri. Cardurile apar după semnarea regulamentului.')));
      return;
    }
    target.replaceChildren(view === 'table' ? dealerTable(list) : el('div', { class: 'b-grid' }, list.map(dealerCard)));
  }

  function render() {
    const stats = el('div', { class: 'b-stats' });
    const list = el('div', {});
    const refresh = () => { renderStats(stats); renderList(list); };
    const index = () => months.indexOf(month);
    const label = el('output', { 'aria-live': 'polite' });
    const prev = el('button', { type: 'button', 'aria-label': 'Luna anterioară', onclick: () => step(-1) }, '‹');
    const next = el('button', { type: 'button', 'aria-label': 'Luna următoare', onclick: () => step(1) }, '›');
    function syncMonth() {
      const current = index() === months.length - 1;
      label.textContent = `${monthLabel(month)}${current ? ' · în curs' : ''}`;
      prev.disabled = index() <= 0;
      next.disabled = current;
    }
    function step(delta) { month = months[index() + delta] || month; syncMonth(); refresh(); }
    const viewTabs = el('div', { class: 'tabs b-view', role: 'tablist', 'aria-label': 'Afișare' },
      ...[['cards', 'Carduri'], ['table', 'Tabel']].map(([key, text]) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(view === key), onclick: event => {
        saveView(key);
        viewTabs.querySelectorAll('button').forEach(button => button.setAttribute('aria-selected', String(button === event.currentTarget)));
        renderList(list);
      } }, text)));
    const search = el('input', { class: 'b-search', type: 'search', placeholder: 'Caută dealer…', 'aria-label': 'Caută dealer', oninput: event => { query = event.target.value; renderList(list); } });
    const order = el('select', { 'aria-label': 'Ordonează', onchange: event => { sort = event.target.value; renderList(list); } },
      ...Object.entries(SORTS).map(([key, [text]]) => el('option', { value: key, selected: key === sort }, text)));
    syncMonth();
    app.removeAttribute('aria-busy');
    app.replaceChildren(
      el('div', { class: 'b-title' }, el('h1', {}, 'Echipa de dealeri'),
        el('p', { class: 'b-muted' }, 'Toate cardurile, la vedere pentru toată echipa. Cifrele se calculează după regulament; orele intră după aprobarea șefului de sală.')),
      el('div', { class: 'b-toolbar' }, el('div', { class: 'b-month' }, prev, label, next), viewTabs),
      stats,
      el('div', { class: 'b-toolbar' }, search, order),
      list);
    refresh();
  }

  function refuse(message) {
    app.removeAttribute('aria-busy');
    app.replaceChildren(el('div', { class: 'notice' },
      el('h1', {}, 'Echipa de dealeri'),
      el('p', {}, message),
      el('div', { class: 'row' },
        el('a', { class: 'btn', href: '/dealers-payout/#semnare' }, 'Îmi fac contul de dealer'),
        el('a', { class: 'btn ghost', href: '/cum-functioneaza/' }, 'Cum funcționează'))));
  }

  async function start() {
    const user = await currentUser();
    if (!user) { app.removeAttribute('aria-busy'); loginPrompt(app, 'Intră în cont ca să vezi echipa.'); return; }
    document.getElementById('who').textContent = user.email;
    try {
      const board = await rpc('players_staff_board');
      rows = (board || []).map(bundle => ({ bundle, name: bundle.dealer.full_name, card: window.DealerMath.summarize(bundle) }));
      months = [...new Set(rows.flatMap(row => row.card.months.map(entry => entry.key)))].sort();
      if (!months.length) months = [window.DealerMath.localDay(Date.now()).slice(0, 7)];
      month = months[months.length - 1];
      render();
    } catch (error) {
      refuse(error.message);
    }
  }

  start();
})();
