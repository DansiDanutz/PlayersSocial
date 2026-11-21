// Floor manager panel: "Istoric" column with the latest changes saved in the database (players_floor_activity),
// so every approve / tips / penalty / payment click shows up as proof that it took effect.
(function () {
  const { el, rpc, money, time, dateLabel, monthLabel } = window.Staff;

  const REFRESH_MS = 60000;
  const interval = details => (details.check_out ? `${time(details.check_in)}–${time(details.check_out)}` : time(details.check_in));
  const shiftDay = details => dateLabel(details.check_in);
  const payoutWhat = details => (details.kind === 'month' ? `luna ${monthLabel(details.period)}` : 'bonus');

  // [tone, title, detail] for each logged action.
  const DESCRIBE = {
    check_in: d => ['yellow', 'a venit', `${shiftDay(d)} · ${time(d.check_in)}`],
    check_out: d => ['yellow', 'a plecat', `${shiftDay(d)} · ${interval(d)}`],
    shift_added: d => ['yellow', 'tură adăugată', `${shiftDay(d)} · ${interval(d)}`],
    shift_approved: d => ['green', 'tură aprobată', `${shiftDay(d)} · ${interval(d)}${d.corrected ? ' · ore corectate' : ''}`],
    shift_rejected: d => ['red', 'tură respinsă', `${shiftDay(d)} · ${interval(d)}`],
    shift_changed: d => ['yellow', 'tură modificată', `${shiftDay(d)} · ${interval(d)}`],
    shift_deleted: d => ['red', 'tură ștearsă', `${shiftDay(d)} · ${interval(d)}`],
    tips_set: d => ['blue', `tips ${money(Number(d.total))}`, `${dateLabel(d.day)}${d.previous !== null && d.previous !== undefined ? ` · înainte ${money(Number(d.previous))}` : ''}`],
    tips_deleted: d => ['red', 'tips șters', `${dateLabel(d.day)} · ${money(Number(d.total))}`],
    penalty_added: d => ['red', `penalizare ${money(Number(d.amount))}`, `${dateLabel(d.day)} · ${d.reason}`],
    penalty_changed: d => ['red', `penalizare modificată ${money(Number(d.amount))}`, `${dateLabel(d.day)} · ${d.reason}`],
    penalty_removed: d => ['gray', 'penalizare ștearsă', `${money(Number(d.amount))} · ${d.reason}`],
    payout_recorded: d => ['green', `plată ${money(Number(d.amount))}`, payoutWhat(d)],
    payout_changed: d => ['green', `plată modificată ${money(Number(d.amount))}`, payoutWhat(d)],
    payout_deleted: d => ['gray', 'plată ștearsă', `${money(Number(d.amount))} · ${payoutWhat(d)}`],
  };

  function ago(iso) {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'acum';
    if (minutes < 60) return `acum ${minutes} min`;
    if (minutes < 12 * 60) return `acum ${Math.round(minutes / 60)} h`;
    return `${dateLabel(iso)}, ${time(iso)}`;
  }

  function entry(row, fresh) {
    const [tone, title, detail] = (DESCRIBE[row.action] || (() => ['gray', row.action, '']))(row.details || {});
    return el('li', { class: `activity-item tone-${tone}${fresh ? ' fresh' : ''}`, 'data-action': row.action },
      el('span', { class: 'activity-dot', 'aria-hidden': 'true' }),
      el('div', {},
        el('p', { class: 'activity-title' }, row.dealer ? el('b', {}, row.dealer) : null, row.dealer ? ' · ' : '', title),
        detail ? el('p', { class: 'activity-detail' }, detail) : null,
        el('p', { class: 'activity-meta' }, row.mine ? 'Tu' : row.actor, ' · ', el('time', { datetime: row.at, title: new Date(row.at).toLocaleString('ro-RO') }, ago(row.at)))));
  }

  function create() {
    const list = el('ol', { class: 'activity-list', 'aria-live': 'polite' });
    const status = el('p', { class: 'muted activity-status' }, 'Se încarcă…');
    const node = el('aside', { class: 'panel activity', 'aria-labelledby': 'activityTitle' },
      el('h2', { id: 'activityTitle' }, 'Istoric'),
      el('p', { class: 'muted' }, 'Ultimele modificări salvate: pontaje, aprobări, tips, penalizări și plăți.'),
      status, list);
    let seen = null;

    async function reload() {
      try {
        const rows = await rpc('players_floor_activity', { p_limit: 40 });
        const known = seen;
        seen = new Set(rows.map(row => row.id));
        list.replaceChildren(...rows.map(row => entry(row, known !== null && !known.has(row.id))));
        status.hidden = rows.length > 0;
        status.textContent = 'Nicio modificare încă.';
      } catch (error) {
        status.hidden = false;
        status.textContent = `Istoricul nu s-a putut încărca: ${error.message}`;
      }
    }

    const timer = setInterval(() => { if (!node.isConnected) clearInterval(timer); else if (!document.hidden) reload(); }, REFRESH_MS);
    reload();
    return { node, reload };
  }

  window.StaffActivity = { create };
})();
