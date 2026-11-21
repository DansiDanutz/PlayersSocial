// /echipa/: every dealer's card, visible to all staff (dealers and floor managers). The database returns the raw
// facts for all active dealers (players_staff_board); every figure is computed by DealerMath like on /dealer/.
(function () {
  const { currentUser, rpc, loginPrompt, el, money, hours, monthLabel } = window.Staff;
  const app = document.getElementById('app');
  const sheet = document.getElementById('sheet');
  const SORTS = {
    hours: ['Cele mai multe ore', (a, b) => b.card.hours.month - a.card.hours.month],
    payout: ['Cel mai mult de primit', (a, b) => (b.card.current?.payout || 0) - (a.card.current?.payout || 0)],
    deposit: ['Cel mai mare depozit', (a, b) => b.card.deposit.balance - a.card.deposit.balance],
    name: ['Nume', (a, b) => a.name.localeCompare(b.name, 'ro')],
  };
  let rows = [];
  let query = '';
  let sort = 'hours';

  const shortDate = day => new Date(`${day}T12:00:00`).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  const initials = name => name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
  const sumBy = (list, pick) => list.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
  const badge = (text, kind = '') => el('span', { class: `b-badge ${kind}` }, text);

  function statCard(label, value, note) {
    return el('div', { class: 'b-card b-stat' }, el('span', {}, label), el('b', {}, value), note ? el('small', {}, note) : null);
  }

  function dealerBadges(row) {
    const { card, bundle } = row;
    const list = [];
    if (card.pendingShifts) list.push(badge(`${card.pendingShifts} ${card.pendingShifts === 1 ? 'tură' : 'ture'} de aprobat`, 'warn'));
    list.push(bundle.penalties.length
      ? badge(`${bundle.penalties.length} ${bundle.penalties.length === 1 ? 'penalizare' : 'penalizări'}`, 'bad')
      : badge('Fără penalizări', 'good'));
    list.push(badge(`Bonus ${shortDate(card.nextBonus.date)}`, card.nextBonus.eligible ? 'good' : ''));
    return list;
  }

  function dealerCard(row) {
    const { card, bundle, name } = row;
    const current = card.current;
    const progress = Math.min(100, Math.round((card.deposit.balance / card.deposit.target) * 100)) || 0;
    return el('button', { class: 'b-card b-dealer', type: 'button', 'aria-label': `Deschide cardul lui ${name}`, onclick: () => openSheet(row) },
      el('div', { class: 'b-dealer-head' },
        el('span', { class: 'b-avatar', 'aria-hidden': 'true' }, initials(name)),
        el('div', { class: 'b-name' }, el('b', {}, name), el('p', { class: 'b-muted' }, `Din ${shortDate(bundle.dealer.start_date)}`)),
        card.openShift ? badge('La lucru', 'live') : null),
      el('dl', { class: 'b-figures' },
        el('div', {}, el('dt', {}, 'Ore luna aceasta'), el('dd', {}, hours(card.hours.month))),
        el('div', {}, el('dt', {}, 'Tips luna aceasta'), el('dd', {}, money(current?.tips || 0))),
        el('div', {}, el('dt', {}, 'Partea dealerului'), el('dd', {}, money(current?.dealerShare || 0))),
        el('div', {}, el('dt', {}, 'De primit (estimat)'), el('dd', {}, money(current?.payout || 0)))),
      el('div', { class: 'b-progress' },
        el('div', { class: 'b-progress-row' }, el('span', {}, 'Depozit'), el('span', {}, `${money(card.deposit.balance)} / ${money(card.deposit.target)}`)),
        el('div', { class: 'b-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(progress), 'aria-label': `Depozit ${name}` }, el('i', { style: `width:${progress}%` }))),
      el('div', { class: 'b-foot' }, ...dealerBadges(row)));
  }

  function openSheet(row) {
    document.getElementById('sheetTitle').textContent = row.name;
    document.getElementById('sheetSub').textContent = `Dealer din ${shortDate(row.bundle.dealer.start_date)}`;
    window.DealerCard.renderCard(document.getElementById('sheetBody'), row.bundle);
    sheet.showModal();
  }
  document.getElementById('sheetClose').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', event => { if (event.target === sheet) sheet.close(); });

  function renderGrid(grid) {
    const needle = query.trim().toLocaleLowerCase('ro');
    const visible = rows.filter(row => row.name.toLocaleLowerCase('ro').includes(needle)).sort(SORTS[sort][1]);
    grid.replaceChildren(...(visible.length ? visible.map(dealerCard) : [el('div', { class: 'b-card b-empty' }, el('p', { class: 'b-muted' }, 'Niciun dealer nu se potrivește căutării.'))]));
  }

  function render() {
    const month = rows[0]?.card.current?.key;
    const grid = el('div', { class: 'b-grid' });
    const search = el('input', { class: 'b-input', type: 'search', placeholder: 'Caută dealer…', 'aria-label': 'Caută dealer', oninput: event => { query = event.target.value; renderGrid(grid); } });
    const select = el('select', { class: 'b-select', 'aria-label': 'Ordonează', onchange: event => { sort = event.target.value; renderGrid(grid); } },
      ...Object.entries(SORTS).map(([key, [label]]) => el('option', { value: key, selected: key === sort }, label)));
    const atWork = rows.filter(row => row.card.openShift).length;
    app.replaceChildren(
      el('div', { class: 'b-title' }, el('h1', {}, 'Echipa de dealeri'),
        el('p', { class: 'b-muted' }, 'Toate cardurile, la vedere pentru toată echipa. Cifrele se calculează după regulament; orele intră după aprobarea șefului de sală.')),
      el('div', { class: 'b-stats' },
        statCard('Dealeri activi', String(rows.length), atWork ? `${atWork} la lucru acum` : 'nimeni la lucru acum'),
        statCard('Ore luna aceasta', hours(sumBy(rows, row => row.card.hours.month)), month ? monthLabel(month) : null),
        statCard('Tips luna aceasta', money(sumBy(rows, row => row.card.current?.tips)), 'total la mese'),
        statCard('Depozite', money(sumBy(rows, row => row.card.deposit.balance)), 'suma tuturor depozitelor')),
      el('div', { class: 'b-toolbar' }, search, select),
      grid);
    renderGrid(grid);
  }

  function refuse(message) {
    app.replaceChildren(el('div', { class: 'b-card b-empty' },
      el('div', { class: 'b-title' }, el('h1', {}, 'Echipa de dealeri')),
      el('p', {}, message),
      el('p', {}, el('a', { href: '/dealers-payout/#semnare' }, 'Îmi fac contul de dealer'), ' · ', el('a', { href: '/cum-functioneaza/' }, 'Cum funcționează'))));
  }

  async function start() {
    const user = await currentUser();
    if (!user) { loginPrompt(app, 'Intră în cont ca să vezi echipa.'); return; }
    try {
      const board = await rpc('players_staff_board');
      rows = (board || []).map(bundle => ({ bundle, name: bundle.dealer.full_name, card: window.DealerMath.summarize(bundle) }));
      render();
    } catch (error) {
      refuse(error.message);
    }
  }

  start();
})();
