// Signing form at the end of /dealers-payout/: the dealer types their name, draws a signature and signs.
// Signing creates the dealer card (players_dealer_sign) and opens /dealer/. On paper the form prints as blank lines.
(function () {
  const { currentUser, rpc, goToLogin } = window.Staff;
  const form = document.getElementById('semnare');
  const nameInput = form.querySelector('input[name="fullName"]');
  const dateInput = form.querySelector('input[name="date"]');
  const canvas = form.querySelector('canvas');
  const submit = form.querySelector('button[type="submit"]');
  const status = form.querySelector('.sign-status');
  const MAX_PIXEL_RATIO = 2;
  let drawn = false;
  let user = null;

  dateInput.value = new Date().toLocaleDateString('ro-RO');

  function sizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const box = canvas.getBoundingClientRect();
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

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!user) { goToLogin(); return; }
    const fullName = nameInput.value.trim().replace(/\s+/g, ' ');
    if (fullName.length < 3 || !fullName.includes(' ')) { say('Scrie numele și prenumele.', 'error'); nameInput.focus(); return; }
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
  });

  async function start() {
    sizeCanvas();
    user = await currentUser();
    if (!user) {
      submit.textContent = 'Intră în cont ca să semnezi';
      say('Semnarea se face din contul tău de pe playersclub.live.');
      return;
    }
    const metaName = String(user.user_metadata?.full_name || user.user_metadata?.name || '').trim();
    if (metaName && !nameInput.value) nameInput.value = metaName;
    const mine = await rpc('players_dealer_me').catch(() => null);
    if (mine?.dealer) {
      nameInput.value = mine.dealer.full_name;
      nameInput.readOnly = true;
      dateInput.value = new Date(mine.dealer.signed_at).toLocaleDateString('ro-RO');
      submit.textContent = 'Ai semnat. Deschide cardul tău';
      submit.type = 'button';
      submit.addEventListener('click', () => location.assign('/dealer/'));
      say('Ai semnat deja regulamentul.', 'ok');
    }
  }

  start();
})();
