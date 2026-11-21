// Signing form at the end of /dealers-payout/. The person first picks the account type:
// - Dealer: types the name, draws a signature and signs. Signing creates the dealer card (players_dealer_sign)
//   and opens /dealer/ straight away.
// - Șef de sală: types the name and sends an access request; the super admin approves it from an email link.
// On paper the form prints as blank lines.
(function () {
  const { currentUser, rpc, requestFloorAccess, cleanName, isFullName, goToLogin } = window.Staff;
  const form = document.getElementById('semnare');
  const title = form.querySelector('h4');
  const intro = form.querySelector('h4 + p');
  const nameInput = form.querySelector('input[name="fullName"]');
  const dateInput = form.querySelector('input[name="date"]');
  const canvas = form.querySelector('canvas');
  const submit = form.querySelector('button[type="submit"]');
  const status = form.querySelector('.sign-status');
  const note = form.querySelector('.role-note');
  const MAX_PIXEL_RATIO = 2;
  const ROLES = {
    dealer: { title: 'Confirmare dealer', intro: intro.textContent, button: 'Semnez și îmi creez cardul' },
    floor: { title: 'Cerere acces șef de sală', intro: 'Șefii de sală aprobă orele dealerilor și trec tipsul zilnic.', button: 'Trimite cererea de acces' },
  };
  let drawn = false;
  let user = null;
  let state = { dealer: null, manager: false, request: null };

  dateInput.value = new Date().toLocaleDateString('ro-RO');

  function sizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    const context = canvas.getContext('2d');
    context.scale(ratio, ratio);
    context.lineWidth = 2.2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#10233f';
    drawn = false;
  }

  function point(event) {
    const box = canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  }

  let drawing = false;
  canvas.addEventListener('pointerdown', event => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext('2d');
    context.beginPath();
    context.moveTo(...point(event));
  });
  canvas.addEventListener('pointermove', event => {
    if (!drawing) return;
    const context = canvas.getContext('2d');
    context.lineTo(...point(event));
    context.stroke();
    drawn = true;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => canvas.addEventListener(type, () => { drawing = false; }));
  form.querySelector('.clear-sig').addEventListener('click', sizeCanvas);
  window.addEventListener('resize', () => { if (!drawn) sizeCanvas(); });

  function say(message, kind = '') {
    status.textContent = message;
    status.className = `sign-status ${kind}`;
  }

  const role = () => form.querySelector('input[name="role"]:checked').value;

  const REQUEST_MESSAGES = {
    pending: ['Cererea ta a fost trimisă și așteaptă aprobarea.', 'ok'],
    rejected: ['Cererea ta anterioară a fost respinsă. Poți trimite una nouă.', 'error'],
    expired: ['Cererea ta anterioară a expirat. Poți trimite una nouă.', ''],
  };

  // Puts the form in the state for the chosen role and what the account already has.
  function render() {
    const current = role();
    const copy = ROLES[current];
    form.classList.toggle('floor', current === 'floor');
    title.textContent = copy.title;
    intro.textContent = copy.intro;
    note.hidden = current !== 'floor';
    submit.disabled = false;
    nameInput.readOnly = false;
    say('');
    if (!user) {
      submit.textContent = current === 'floor' ? 'Intră în cont ca să ceri acces' : 'Intră în cont ca să semnezi';
      say('Folosește contul tău de pe playersclub.live.');
      return;
    }
    if (current === 'dealer' && state.dealer) {
      nameInput.value = state.dealer.full_name;
      nameInput.readOnly = true;
      dateInput.value = new Date(state.dealer.signed_at).toLocaleDateString('ro-RO');
      submit.textContent = 'Ai semnat. Deschide cardul tău';
      say('Ai semnat deja regulamentul.', 'ok');
      return;
    }
    if (current === 'floor' && state.manager) {
      submit.textContent = 'Deschide pagina șefului de sală';
      say('Ai deja acces de șef de sală.', 'ok');
      return;
    }
    submit.textContent = copy.button;
    if (current === 'floor' && state.request) {
      const [message, kind] = REQUEST_MESSAGES[state.request.status] || ['', ''];
      say(message, kind);
      if (state.request.status === 'pending') submit.disabled = true;
    }
  }

  async function signAsDealer(fullName) {
    if (!drawn) { say('Semnează în chenarul „Semnătura”.', 'error'); return; }
    submit.disabled = true;
    say('Se salvează semnătura…');
    try {
      await rpc('players_dealer_sign', { p_full_name: fullName, p_signature: canvas.toDataURL('image/png') });
      say('Gata! Cardul tău a fost creat.', 'ok');
      location.assign('/dealer/');
    } catch (error) {
      say(error.message, 'error');
      submit.disabled = false;
    }
  }

  async function askFloorAccess(fullName) {
    submit.disabled = true;
    say('Se trimite cererea…');
    try {
      await requestFloorAccess(fullName);
      state = { ...state, request: { status: 'pending', full_name: fullName } };
      render();
      say('Cererea a fost trimisă. Primești acces după ce administratorul o aprobă.', 'ok');
    } catch (error) {
      say(error.message, 'error');
      submit.disabled = false;
    }
  }

  form.addEventListener('change', event => {
    if (event.target.name !== 'role') return;
    render();
    if (role() === 'dealer' && !drawn) sizeCanvas();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!user) { goToLogin(); return; }
    const current = role();
    if (current === 'dealer' && state.dealer) { location.assign('/dealer/'); return; }
    if (current === 'floor' && state.manager) { location.assign('/sef-de-sala/'); return; }
    const fullName = cleanName(nameInput.value);
    if (!isFullName(fullName)) { say('Scrie numele și prenumele.', 'error'); nameInput.focus(); return; }
    if (current === 'floor') await askFloorAccess(fullName);
    else await signAsDealer(fullName);
  });

  async function start() {
    sizeCanvas();
    user = await currentUser();
    if (user) {
      const metaName = String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim();
      if (metaName && !nameInput.value) nameInput.value = metaName;
      const [mine, manager, request] = await Promise.all([
        rpc('players_dealer_me').catch(() => null),
        rpc('is_players_floor_manager').catch(() => false),
        rpc('players_floor_request_mine').catch(() => null),
      ]);
      state = { dealer: mine?.dealer || null, manager: manager === true, request };
      const pickFloor = !state.dealer && (state.manager || request?.status === 'pending');
      if (pickFloor) form.querySelector('input[name="role"][value="floor"]').checked = true;
    }
    render();
  }

  start();
})();
