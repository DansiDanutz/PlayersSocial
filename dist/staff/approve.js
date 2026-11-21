// /aprobare/#t=<token>: the page the super admin opens from the approval email. The token stays in the URL
// fragment (never sent to a server log); the database finds the request by the token's hash. Nothing changes
// until "Aprobă" or "Respinge" is pressed, so link scanners in mail apps cannot approve anyone.
(function () {
  const { rpc, el, dateLabel, time } = window.Staff;
  const app = document.getElementById('app');
  const token = new URLSearchParams(location.hash.slice(1)).get('t') || '';
  const RESULT = {
    approved: ['approved', 'Aprobat', 'are acum acces de șef de sală. Intră pe /sef-de-sala/ cu acest email.'],
    rejected: ['rejected', 'Respins', 'nu a primit acces.'],
    expired: ['rejected', 'Expirat', 'trebuie să trimită o cerere nouă: linkul a expirat.'],
  };

  function fail(message) {
    app.replaceChildren(el('div', { class: 'notice' }, el('h1', {}, 'Cererea nu poate fi deschisă'), el('p', {}, message)));
  }

  function render(request) {
    const details = el('div', {},
      el('p', {}, el('b', {}, request.full_name), ` · ${request.email}`),
      el('p', { class: 'muted' }, `Cerere trimisă ${dateLabel(request.created_at)}, ora ${time(request.created_at)}`));
    if (request.status !== 'pending') {
      const [chip, label, text] = RESULT[request.status] || RESULT.rejected;
      app.replaceChildren(el('div', { class: 'notice' }, el('h1', {}, 'Cerere acces șef de sală'), details,
        el('p', {}, el('span', { class: `chip ${chip}` }, label), ` ${request.full_name} ${text}`)));
      return;
    }
    const status = el('p', { class: 'status', role: 'status' });
    const decide = approve => async () => {
      buttons.forEach(button => { button.disabled = true; });
      status.textContent = 'Se salvează…';
      try {
        const result = await rpc('players_floor_request_decide', { p_token: token, p_approve: approve });
        render({ ...request, status: result });
      } catch (error) {
        status.textContent = error.message;
        status.className = 'status error';
        buttons.forEach(button => { button.disabled = false; });
      }
    };
    const buttons = [
      el('button', { class: 'btn', type: 'button', onclick: decide(true) }, 'Aprobă'),
      el('button', { class: 'btn danger', type: 'button', onclick: decide(false) }, 'Respinge'),
    ];
    app.replaceChildren(el('div', { class: 'notice' }, el('h1', {}, 'Cerere acces șef de sală'), details,
      el('p', {}, 'Dacă aprobi, persoana poate aproba orele dealerilor, trece tipsul și penalizările.'),
      el('div', { class: 'row' }, ...buttons), status));
  }

  async function start() {
    if (!token) { fail('Linkul este incomplet. Deschide-l din nou din email.'); return; }
    try {
      const request = await rpc('players_floor_request_view', { p_token: token });
      if (!request) { fail('Linkul nu este valid.'); return; }
      render(request);
    } catch (error) {
      fail(error.message);
    }
  }

  start();
})();
