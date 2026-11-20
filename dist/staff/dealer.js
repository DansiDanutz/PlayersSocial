// /dealer/: the dealer writes when they arrived and when they left, and sees their card.
// Every shift waits for the floor manager's approval before it counts.
(function () {
  const { currentUser, rpc, loginPrompt, signOutTo, el, time, toInput, fromInput } = window.Staff;
  const app = document.getElementById('app');

  function statusLine() { return el('p', { class: 'status', role: 'status' }); }

  async function run(button, status, action, doneMessage) {
    button.disabled = true;
    status.className = 'status';
    status.textContent = 'Se salvează…';
    try {
      await action();
      status.className = 'status ok';
      status.textContent = doneMessage;
      await load();
    } catch (error) {
      status.className = 'status error';
      status.textContent = error.message;
      button.disabled = false;
    }
  }

  // Arrival/departure: one big button; the time can be changed if the dealer presses it late.
  function clockPanel(bundle) {
    const open = bundle.shifts.find(shift => shift.status === 'open');
    const status = statusLine();
    const when = el('input', { type: 'datetime-local', value: toInput(new Date().toISOString()), 'aria-label': open ? 'Ora plecării' : 'Ora sosirii' });
    const button = el('button', { class: `btn big ${open ? 'gold' : ''}`, type: 'button' }, open ? 'Am plecat (check-out)' : 'Am venit (check-in)');
    button.addEventListener('click', () => {
      const at = fromInput(when.value);
      if (open) run(button, status, () => rpc('players_dealer_check_out', { p_at: at }), 'Plecarea a fost înregistrată. Șeful de sală o va aproba.');
      else run(button, status, () => rpc('players_dealer_check_in', { p_at: at }), 'Sosirea a fost înregistrată.');
    });
    return el('section', { class: 'panel clock', 'aria-labelledby': 'clockTitle' },
      el('h2', { id: 'clockTitle' }, open ? `Ești la lucru de la ${time(open.check_in)}` : 'Pontajul de azi'),
      el('label', {}, open ? 'Ora plecării' : 'Ora sosirii', when),
      button, status,
      el('p', { class: 'muted' }, 'Scrie corect ora la care ai venit și ora la care ai plecat. Șeful de sală aprobă sau corectează pontajul până a doua zi.'));
  }

  function forgotPanel() {
    const status = statusLine();
    const checkIn = el('input', { type: 'datetime-local', required: true });
    const checkOut = el('input', { type: 'datetime-local', required: true });
    const button = el('button', { class: 'btn ghost', type: 'submit' }, 'Trimite la aprobare');
    const form = el('form', { class: 'row' }, el('label', {}, 'Am venit', checkIn), el('label', {}, 'Am plecat', checkOut), button);
    form.addEventListener('submit', event => {
      event.preventDefault();
      run(button, status, () => rpc('players_dealer_add_shift', { p_check_in: fromInput(checkIn.value), p_check_out: fromInput(checkOut.value) }), 'Tura a fost trimisă la aprobare.');
    });
    return el('details', { class: 'panel' }, el('summary', {}, el('b', {}, 'Ai uitat să te pontezi? Adaugă o tură')), el('p', { class: 'muted' }, 'Pentru ture din ultimele 7 zile.'), form, status);
  }

  function notDealer() {
    app.replaceChildren(el('div', { class: 'notice' },
      el('h1', {}, 'Nu ai încă un card de dealer'),
      el('p', {}, 'Cardul se creează când citești și semnezi regulamentul dealerilor.'),
      el('a', { class: 'btn', href: '/dealers-payout/#semnare' }, 'Citește și semnează regulamentul')));
  }

  async function load() {
    const bundle = await rpc('players_dealer_me');
    if (!bundle?.dealer) { notDealer(); return; }
    const body = el('div', { style: 'display:contents' });
    app.replaceChildren(el('h1', {}, bundle.dealer.full_name), clockPanel(bundle), body);
    window.DealerCard.renderCard(body, bundle, { after: forgotPanel() });
  }

  async function start() {
    const user = await currentUser();
    if (!user) { loginPrompt(app, 'Intră în cont ca să îți vezi cardul și să te pontezi.'); return; }
    document.getElementById('who').textContent = user.email;
    const signOut = document.getElementById('signOut');
    signOut.hidden = false;
    signOut.addEventListener('click', () => signOutTo('/'));
    try { await load(); } catch (error) { app.replaceChildren(el('p', { class: 'status error' }, error.message)); }
  }

  start();
})();
