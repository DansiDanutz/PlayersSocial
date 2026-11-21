// /sef-de-sala/: the floor manager approves or corrects every dealer's arrival and departure (by the next day
// at the latest), enters each dealer's daily tips and any penalties, records what was paid, and opens any dealer's card.
// Admins also manage the list of floor managers here. Every permission is enforced by the database.
(function () {
  const { currentUser, rpc, requestFloorAccess, cleanName, isFullName, loginPrompt, signOutTo, el, money, hours, time, dateLabel, monthLabel, toInput, fromInput, today, STATUS_LABELS } = window.Staff;
  const app = document.getElementById('app');
  const view = el('div', { style: 'display:contents' });
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  let isAdmin = false;
  let active = 'pending';

  function statusLine() { return el('p', { class: 'status', role: 'status' }); }

  async function run(button, status, action, doneMessage, after) {
    button.disabled = true;
    status.className = 'status';
    status.textContent = 'Se salvează…';
    try {
      await action();
      status.className = 'status ok';
      status.textContent = doneMessage;
      if (after) await after();
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  // ---------- De aprobat ----------
  function shiftReview(shift, refresh) {
    const status = statusLine();
    const checkIn = el('input', { type: 'datetime-local', value: toInput(shift.check_in), 'aria-label': `Sosire ${shift.full_name}` });
    const checkOut = el('input', { type: 'datetime-local', value: shift.check_out ? toInput(shift.check_out) : '', 'aria-label': `Plecare ${shift.full_name}` });
    const approve = el('button', { class: 'btn small', type: 'button' }, 'Aprobă');
    const reject = el('button', { class: 'btn danger small', type: 'button' }, 'Respinge');
    approve.addEventListener('click', () => run(approve, status,
      () => rpc('players_floor_review_shift', { p_shift: shift.id, p_check_in: fromInput(checkIn.value), p_check_out: fromInput(checkOut.value), p_approve: true }),
      'Aprobat.', refresh));
    reject.addEventListener('click', () => {
      if (confirm(`Respingi tura lui ${shift.full_name} din ${dateLabel(shift.check_in)}? Orele nu se vor număra.`)) {
        run(reject, status, () => rpc('players_floor_review_shift', { p_shift: shift.id, p_check_in: null, p_check_out: null, p_approve: false }), 'Respins.', refresh);
      }
    });
    return el('div', { class: `item ${shift.overdue ? 'late' : ''}` },
      el('div', { class: 'who' }, el('span', {}, `${shift.full_name} · ${dateLabel(shift.check_in)}`),
        el('span', {}, shift.overdue ? el('span', { class: 'chip late' }, 'Întârziat') : null, ' ', el('span', { class: `chip ${shift.status}` }, STATUS_LABELS[shift.status]))),
      el('label', {}, 'Venit', checkIn), el('label', {}, 'Plecat', checkOut), approve, reject, status);
  }

  async function renderPending() {
    const shifts = await rpc('players_floor_pending_shifts');
    setCount('pending', shifts.length);
    const overdue = shifts.filter(shift => shift.overdue).length;
    view.replaceChildren(el('section', { class: 'panel' },
      el('h2', {}, 'Pontaje de aprobat'),
      el('p', { class: 'muted' }, 'Verifică ora de venire și de plecare a fiecărui dealer. Corectează dacă e nevoie, apoi aprobă. Termen: cel târziu a doua zi.'),
      overdue ? el('p', { class: 'status error' }, overdue === 1 ? '1 pontaj a trecut de termen.' : `${overdue} pontaje au trecut de termen.`) : null,
      shifts.length ? el('div', { class: 'card-list' }, shifts.map(shift => shiftReview(shift, renderPending))) : el('p', { class: 'empty' }, 'Nimic de aprobat. Totul este la zi.')));
  }

  // ---------- Ziua: tips + ore pentru fiecare dealer ----------
  function dayRow(day, row, refresh) {
    const status = statusLine();
    const tipsInput = el('input', { type: 'number', min: '0', step: '1', inputmode: 'decimal', value: row.tips ?? '', placeholder: 'ex. 1500', 'aria-label': `Tips ${row.full_name}` });
    const preview = el('span', { class: 'split' });
    const showSplit = () => {
      if (tipsInput.value === '') { preview.textContent = ''; return; }
      const split = window.DealerMath.splitTips(Number(tipsInput.value));
      preview.replaceChildren('Dealer ', el('b', {}, money(split.dealer)), ` · club ${money(split.club)}`, split.deposit ? ` · depozit ${money(split.deposit)}` : '');
    };
    tipsInput.addEventListener('input', showSplit);
    showSplit();
    const saveTips = el('button', { class: 'btn small', type: 'button' }, 'Salvează tips');
    saveTips.addEventListener('click', () => run(saveTips, status,
      () => rpc('players_floor_set_tips', { p_dealer: row.dealer_id, p_day: day, p_total: tipsInput.value === '' ? null : Number(tipsInput.value) }), 'Tips salvat.'));

    const approvedHours = row.shifts.filter(shift => shift.status === 'approved').reduce((total, shift) => total + window.DealerMath.shiftHours(shift), 0);
    const shiftText = row.shifts.length
      ? row.shifts.map(shift => `${time(shift.check_in)}–${time(shift.check_out)} (${STATUS_LABELS[shift.status].toLowerCase()})`).join(', ')
      : 'fără pontaj';

    const checkIn = el('input', { type: 'datetime-local', value: `${day}T18:00`, 'aria-label': `Sosire ${row.full_name}` });
    const checkOut = el('input', { type: 'datetime-local', value: '', 'aria-label': `Plecare ${row.full_name}` });
    const addShift = el('button', { class: 'btn ghost small', type: 'button' }, 'Adaugă ore');
    addShift.addEventListener('click', () => run(addShift, status,
      () => rpc('players_floor_add_shift', { p_dealer: row.dealer_id, p_check_in: fromInput(checkIn.value), p_check_out: fromInput(checkOut.value) }), 'Ore adăugate.', refresh));

    return el('div', { class: 'item' },
      el('div', { class: 'who' }, el('span', {}, row.full_name), el('span', { class: 'muted' }, `${hours(approvedHours)} aprobate · ${shiftText}`)),
      el('label', {}, 'Tips total (RON)', tipsInput), saveTips, preview,
      el('details', { style: 'flex:1 1 100%' }, el('summary', { class: 'muted' }, 'Dealerul nu s-a pontat? Trece tu orele'),
        el('div', { class: 'row' }, el('label', {}, 'Venit', checkIn), el('label', {}, 'Plecat', checkOut), addShift)),
      status);
  }

  async function renderDay(day = today()) {
    const picker = el('input', { type: 'date', value: day, max: today(), 'aria-label': 'Ziua' });
    picker.addEventListener('change', () => renderDay(picker.value || today()));
    const rows = await rpc('players_floor_day', { p_day: day });
    const refresh = () => renderDay(day);
    view.replaceChildren(el('section', { class: 'panel' },
      el('div', { class: 'row', style: 'justify-content:space-between' }, el('h2', {}, `Ziua ${dateLabel(day)}`), el('label', {}, 'Alege ziua', picker)),
      el('p', { class: 'muted' }, 'Scrie tipsul total făcut de fiecare dealer în ziua respectivă. Împărțirea se calculează automat după grilă.'),
      rows.length ? el('div', { class: 'card-list' }, rows.map(row => dayRow(day, row, refresh))) : el('p', { class: 'empty' }, 'Niciun dealer înregistrat încă.')));
  }

  // ---------- Dealeri ----------
  function penaltyForm(dealerId, refresh) {
    const status = statusLine();
    const day = el('input', { type: 'date', value: today(), max: today() });
    const amount = el('input', { type: 'number', min: '1', step: '1', required: true, placeholder: 'ex. 100' });
    const reason = el('input', { type: 'text', required: true, maxlength: '300', placeholder: 'ex. Întârziere 30 min' });
    const button = el('button', { class: 'btn danger', type: 'submit' }, 'Adaugă penalizarea');
    const form = el('form', { class: 'row' }, el('label', {}, 'Ziua', day), el('label', {}, 'Suma (RON)', amount), el('label', { style: 'flex:2 1 220px' }, 'Motiv', reason), button);
    form.addEventListener('submit', event => {
      event.preventDefault();
      run(button, status, () => rpc('players_floor_add_penalty', { p_dealer: dealerId, p_day: day.value, p_amount: Number(amount.value), p_reason: reason.value }), 'Penalizare adăugată.', refresh);
    });
    return el('section', { class: 'panel' }, el('h2', {}, 'Penalizare din depozit'), el('p', { class: 'muted' }, 'Se scade din depozit. Orice penalizare anulează bonusul pentru perioada respectivă.'), form, status);
  }

  async function renderDealer(dealerId) {
    const bundle = await rpc('players_floor_dealer', { p_dealer: dealerId });
    const refresh = () => renderDealer(dealerId);
    const body = el('div', { style: 'display:contents' });
    view.replaceChildren(
      el('div', { class: 'row', style: 'justify-content:space-between' },
        el('h1', {}, bundle.dealer.full_name),
        el('button', { class: 'btn ghost small', type: 'button', onclick: () => renderDealers() }, '← Toți dealerii')),
      el('p', { class: 'muted' }, `${bundle.dealer.email} · a semnat pe ${dateLabel(bundle.dealer.signed_at)}`),
      body);
    window.DealerCard.renderCard(body, bundle, {
      viewer: 'other',
      after: penaltyForm(dealerId, refresh),
      onDeletePenalty: async penalty => {
        if (!confirm(`Ștergi penalizarea de ${money(penalty.amount)} (${penalty.reason})?`)) return;
        try { await rpc('players_floor_delete_penalty', { p_penalty: penalty.id }); await refresh(); } catch (error) { alert(error.message); }
      },
      onDeletePayout: payout => deletePayout(payout, refresh),
    });
  }

  async function renderDealers() {
    const dealers = await rpc('players_floor_dealers');
    view.replaceChildren(el('section', { class: 'panel' },
      el('h2', {}, 'Dealeri'),
      el('p', { class: 'muted' }, 'Un dealer apare aici după ce semnează regulamentul pe playersclub.live/dealers-payout.'),
      dealers.length ? el('div', { class: 'card-list' }, dealers.map(dealer => el('button', {
        class: 'item', type: 'button', style: 'text-align:left;background:#fff;cursor:pointer;font:inherit', onclick: () => renderDealer(dealer.id),
      }, el('div', { class: 'who' }, el('span', {}, dealer.full_name),
        el('span', {}, dealer.open_shift ? el('span', { class: 'chip open' }, 'La lucru') : null, ' ', dealer.pending_shifts > 0 ? el('span', { class: 'chip pending' }, `${dealer.pending_shifts} de aprobat`) : null)),
      el('span', { class: 'muted' }, `de la ${dateLabel(dealer.start_date)} · ${dealer.email}`)))) : el('p', { class: 'empty' }, 'Niciun dealer încă.')));
  }

  // ---------- Plăți ----------
  // Every closed month still unpaid and every bonus reached and earned, with the amount prefilled from the rules.
  // The floor manager writes what was actually paid; a wrong entry is deleted and written again.
  async function deletePayout(payout, refresh) {
    if (!confirm(`Ștergi plata „${window.DealerCard.payoutLabel(payout)}” de ${money(payout.amount)}?`)) return;
    try { await rpc('players_floor_delete_payout', { p_payout: payout.id }); await refresh(); } catch (error) { alert(error.message); }
  }

  function payForm(row, due, refresh) {
    const status = statusLine();
    const isBonus = due.kind === 'bonus';
    const title = isBonus ? `${due.label} (din ${window.DealerCard.longDay(due.period)})` : `Luna ${monthLabel(due.period)}`;
    const amount = el('input', { type: 'number', min: '1', step: '1', inputmode: 'decimal', required: true, value: String(due.amount), 'aria-label': `Suma ${row.name} ${title}` });
    const fromDeposit = isBonus ? el('input', { type: 'number', min: '0', step: '1', inputmode: 'decimal', value: String(due.fromDeposit), 'aria-label': `Din depozit ${row.name}` }) : null;
    const paidOn = el('input', { type: 'date', value: today(), max: today(), required: true, 'aria-label': `Data plății ${row.name}` });
    const note = el('input', { type: 'text', maxlength: '300', placeholder: 'ex. numerar / transfer', 'aria-label': `Notă ${row.name}` });
    const button = el('button', { class: 'btn small', type: 'submit', 'aria-label': `Marchează plătit: ${row.name}, ${title}` }, 'Marchează plătit');
    const form = el('form', { class: 'item' },
      el('div', { class: 'who' }, el('span', {}, `${row.name} · ${title}`), el('span', { class: 'muted' }, due.hint)),
      el('label', {}, 'Suma plătită (RON)', amount),
      fromDeposit ? el('label', {}, 'Din care din depozit', fromDeposit) : null,
      el('label', {}, 'Plătit pe', paidOn),
      el('label', { style: 'flex:2 1 180px' }, 'Notă', note),
      button, status);
    form.addEventListener('submit', event => {
      event.preventDefault();
      run(button, status, () => rpc('players_floor_record_payout', {
        p_dealer: row.bundle.dealer.id, p_kind: due.kind, p_period: due.period, p_amount: Number(amount.value),
        p_from_deposit: fromDeposit ? Number(fromDeposit.value || 0) : 0, p_paid_on: paidOn.value, p_note: note.value,
      }), 'Plată trecută.', refresh);
    });
    return form;
  }

  function dueItems(row) {
    const months = row.card.pay.dueMonths.map(month => ({
      kind: 'month', period: month.key, amount: month.remaining,
      hint: month.paid ? `de primit ${money(month.payout)} · plătit deja ${money(month.paid)}` : `de primit ${money(month.payout)} după regulament`,
    }));
    const bonuses = row.card.pay.dueBonuses.map(bonus => ({
      kind: 'bonus', period: bonus.date, label: bonus.label, amount: bonus.total, fromDeposit: bonus.fromDeposit,
      hint: `bonus ${money(bonus.amount)} + din depozit peste ${money(bonus.keep)}: ${money(bonus.fromDeposit)}`,
    }));
    return [...months, ...bonuses].map(due => ({ row, due }));
  }

  async function loadPayRows() {
    const board = await rpc('players_staff_board');
    return (board || []).map(bundle => ({ bundle, name: bundle.dealer.full_name, card: window.DealerMath.summarize(bundle) }));
  }

  async function renderPay() {
    const rows = await loadPayRows();
    const due = rows.flatMap(dueItems);
    setCount('pay', due.length);
    const owed = rows.reduce((total, row) => total + row.card.pay.owed, 0);
    const history = rows.flatMap(row => (row.bundle.payouts || []).map(payout => ({ row, payout })))
      .sort((a, b) => String(b.payout.paid_on).localeCompare(String(a.payout.paid_on))).slice(0, 40);
    view.replaceChildren(
      el('section', { class: 'panel' },
        el('h2', {}, 'De plătit'),
        el('p', { class: 'muted' }, 'Lunile încheiate și bonusurile ajunse la termen. Suma vine din regulament; dacă ai plătit altceva, scrie suma reală.'),
        due.length ? el('p', {}, 'Total de plătit: ', el('b', {}, money(owed))) : null,
        due.length ? el('div', { class: 'card-list' }, due.map(item => payForm(item.row, item.due, renderPay))) : el('p', { class: 'empty' }, 'Toate plățile sunt la zi.')),
      el('section', { class: 'panel' },
        el('h2', {}, 'Plăți trecute'),
        history.length ? el('div', { class: 'card-list' }, history.map(({ row, payout }) => el('div', { class: 'item' },
          el('div', { class: 'who' }, el('span', {}, `${row.name} · ${window.DealerCard.payoutLabel(payout)}`), el('span', {}, money(payout.amount))),
          el('span', { class: 'muted' }, [`plătit ${dateLabel(payout.paid_on)}`, Number(payout.from_deposit) ? `din depozit ${money(payout.from_deposit)}` : '', payout.note || ''].filter(Boolean).join(' · ')),
          el('button', { class: 'btn danger small', type: 'button', 'aria-label': `Șterge plata: ${row.name}, ${window.DealerCard.payoutLabel(payout)}`, onclick: () => deletePayout(payout, renderPay) }, 'Șterge'))))
          : el('p', { class: 'empty' }, 'Nicio plată trecută încă.')));
  }

  // ---------- Șefi de sală (doar admin) ----------
  // Requests sent from "Cere acces de șef de sală"; the same decision as the emailed approval link.
  function requestsPanel(requests) {
    const status = statusLine();
    const decide = (row, approve) => async event => {
      const buttons = event.currentTarget.parentElement.querySelectorAll('button');
      buttons.forEach(button => { button.disabled = true; });
      try {
        await rpc('players_admin_decide_floor_request', { p_id: row.id, p_approve: approve });
        await renderManagers();
      } catch (error) {
        status.textContent = error.message; status.className = 'status error';
        buttons.forEach(button => { button.disabled = false; });
      }
    };
    return el('section', { class: 'panel' },
      el('h2', {}, 'Cereri de acces'),
      el('p', { class: 'muted' }, 'Cererile vin și pe email. Le poți aproba de aici sau din email: contează prima decizie.'),
      requests.length ? el('div', { class: 'card-list' }, requests.map(row => el('div', { class: 'item' },
        el('div', { class: 'who' }, el('span', {}, `${row.full_name} · ${row.email}`), el('span', { class: 'muted' }, `trimisă ${dateLabel(row.created_at)}, ${time(row.created_at)}`)),
        el('button', { class: 'btn small', type: 'button', 'aria-label': `Aprobă ${row.full_name}`, onclick: decide(row, true) }, 'Aprobă'),
        el('button', { class: 'btn danger small', type: 'button', 'aria-label': `Respinge ${row.full_name}`, onclick: decide(row, false) }, 'Respinge'))))
        : el('p', { class: 'empty' }, 'Nicio cerere în așteptare.'),
      status);
  }

  async function renderManagers() {
    const status = statusLine();
    const email = el('input', { type: 'email', required: true, placeholder: 'email@exemplu.ro', 'aria-label': 'Emailul șefului de sală' });
    const button = el('button', { class: 'btn', type: 'submit' }, 'Adaugă');
    const form = el('form', { class: 'row' }, el('label', { style: 'flex:1 1 240px' }, 'Email (contul cu care intră pe site)', email), button);
    form.addEventListener('submit', event => {
      event.preventDefault();
      run(button, status, () => rpc('players_admin_add_floor_manager', { p_email: email.value }), `${email.value.trim().toLowerCase()} este acum șef de sală.`, renderManagers);
    });
    const [managers, requests] = await Promise.all([rpc('players_admin_list_floor_managers'), rpc('players_admin_list_floor_requests').catch(() => [])]);
    setCount('managers', requests.length);
    view.replaceChildren(requestsPanel(requests), el('section', { class: 'panel' },
      el('h2', {}, 'Șefi de sală'),
      el('p', { class: 'muted' }, 'Pot aproba pontajul, trece tipsul și penalizările. Nu au acces la evenimente, video sau administratori.'),
      form, status,
      managers.length ? el('div', { class: 'card-list' }, managers.map(row => el('div', { class: 'item' },
        el('div', { class: 'who' }, el('span', {}, row.email), el('span', { class: 'muted' }, row.added_by ? `adăugat de ${row.added_by}` : '')),
        el('button', { class: 'btn danger small', type: 'button', onclick: async () => {
          if (!confirm(`Elimini accesul de șef de sală pentru ${row.email}?`)) return;
          try { await rpc('players_admin_remove_floor_manager', { p_email: row.email }); await renderManagers(); } catch (error) { alert(error.message); }
        } }, 'Elimină')))) : el('p', { class: 'empty' }, 'Niciun șef de sală adăugat.')));
  }

  const SECTIONS = { pending: ['De aprobat', renderPending], day: ['Tips & ore pe zi', () => renderDay()], dealers: ['Dealeri', renderDealers], pay: ['Plăți', renderPay], managers: ['Șefi de sală', renderManagers] };

  function setCount(key, count) {
    const badge = tabs.querySelector(`[data-tab="${key}"] .count`);
    if (badge) { badge.textContent = count; badge.hidden = count === 0; }
  }

  async function show(key) {
    active = key;
    tabs.querySelectorAll('button').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === key)));
    view.replaceChildren(el('p', { class: 'muted' }, 'Se încarcă…'));
    try { await SECTIONS[key][1](); } catch (error) { view.replaceChildren(el('p', { class: 'status error' }, error.message)); }
  }

  // Accounts without access can ask for it; the super admin approves the request from an email link.
  async function refuse(user) {
    const request = await rpc('players_floor_request_mine').catch(() => null);
    const heading = el('h1', {}, 'Acces doar pentru șefii de sală');
    if (request?.status === 'pending') {
      app.replaceChildren(el('div', { class: 'notice' }, heading,
        el('p', {}, `Cererea ta (${request.full_name}) a fost trimisă pe ${dateLabel(request.created_at)} și așteaptă aprobarea administratorului.`),
        el('p', { class: 'muted' }, 'După aprobare, reîncarcă pagina.')));
      return;
    }
    const metaName = String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim();
    const name = el('input', { type: 'text', autocomplete: 'name', maxlength: '120', value: metaName });
    const status = statusLine();
    if (request?.status === 'rejected') { status.textContent = 'Cererea ta anterioară a fost respinsă. Poți trimite una nouă.'; status.className = 'status error'; }
    const send = el('button', { class: 'btn', type: 'submit' }, 'Cere acces de șef de sală');
    const form = el('form', { class: 'row', onsubmit: async event => {
      event.preventDefault();
      const fullName = cleanName(name.value);
      if (!isFullName(fullName)) { status.textContent = 'Scrie numele și prenumele.'; status.className = 'status error'; return; }
      send.disabled = true;
      status.textContent = 'Se trimite cererea…'; status.className = 'status';
      try {
        await requestFloorAccess(fullName);
        await refuse(user);
      } catch (error) {
        status.textContent = error.message; status.className = 'status error';
        send.disabled = false;
      }
    } }, el('label', {}, 'Nume și prenume', name), send);
    app.replaceChildren(el('div', { class: 'notice' }, heading,
      el('p', {}, `Contul ${user.email} nu are încă acces. Trimite o cerere: administratorul o primește pe email și o aprobă.`),
      form, status));
  }

  async function start() {
    const user = await currentUser();
    if (!user) { loginPrompt(app, 'Intră în cont cu adresa de email de șef de sală.'); return; }
    document.getElementById('who').textContent = user.email;
    const signOut = document.getElementById('signOut');
    signOut.hidden = false;
    signOut.addEventListener('click', () => signOutTo('/'));
    const [allowed, admin] = await Promise.all([rpc('is_players_floor_manager').catch(() => false), rpc('is_players_admin').catch(() => false)]);
    if (allowed !== true) {
      await refuse(user);
      return;
    }
    isAdmin = admin === true;
    Object.entries(SECTIONS).filter(([key]) => key !== 'managers' || isAdmin).forEach(([key, [label]]) => {
      tabs.append(el('button', { type: 'button', role: 'tab', 'data-tab': key, onclick: () => show(key) }, label, ['pending', 'pay', 'managers'].includes(key) ? el('span', { class: 'count', hidden: true }) : null));
    });
    app.replaceChildren(el('h1', {}, 'Panoul șefului de sală'), tabs, view);
    await show(active);
    loadPayRows().then(rows => setCount('pay', rows.flatMap(dueItems).length)).catch(() => {});
    if (isAdmin && active !== 'managers') rpc('players_admin_list_floor_requests').then(rows => setCount('managers', rows.length)).catch(() => {});
  }

  start();
})();
