// Dealer card: every amount the rules produce for one dealer, shown the same way to the dealer and to the
// floor manager. Amounts come from DealerMath.summarize(); this file only lays them out.
(function () {
  const { el, money, signedMoney, hours, time, dateLabel, monthLabel, STATUS_LABELS } = window.Staff;

  function tile(label, value, note, extra = {}) {
    return el('div', { class: `tile ${extra.gold ? 'gold' : ''}` }, el('small', {}, label), el('b', {}, value), note ? el('span', {}, note) : null, extra.bar || null);
  }

  function progress(value, target) {
    const percent = Math.max(0, Math.min(100, (value / target) * 100));
    return el('div', { class: 'bar', role: 'img', 'aria-label': `${Math.round(percent)}% din ${money(target)}` }, el('i', { style: `width:${percent}%` }));
  }

  function tiles(card) {
    const month = card.current;
    const bonus = card.nextBonus;
    return el('div', { class: 'tiles' },
      tile('Luna aceasta', month ? money(month.dealerShare) : money(0), month ? `din ${money(month.tips)} tips · ${month.days} ${month.days === 1 ? 'zi' : 'zile'}` : ''),
      tile('Ore aprobate', hours(card.hours.month), `luna aceasta · total ${hours(card.hours.total)}`),
      tile('Depozitul tău', money(card.deposit.balance), `Etapa ${card.deposit.stage}: ținta ${money(card.deposit.target)}`, { gold: true, bar: progress(card.deposit.balance, card.deposit.target) }),
      tile(bonus.label, bonus.eligible ? money(bonus.estimate) : 'Pierdut', bonus.eligible ? `estimat la ${dateLabel(bonus.date)}` : `ai penalizări din ${dateLabel(bonus.since)}`, { gold: true }));
  }

  function monthsTable(card) {
    const rows = [...card.months].reverse().map(month => el('tr', {},
      el('td', {}, monthLabel(month.key), month.closed ? null : el('div', { class: 'muted' }, 'în curs (estimat)')),
      el('td', { class: 'num' }, hours(month.hours)),
      el('td', { class: 'num' }, money(month.tips)),
      el('td', { class: 'num' }, money(month.dealerShare)),
      el('td', { class: 'num' }, month.adjustment ? signedMoney(month.adjustment) : '—'),
      el('td', { class: 'num' }, month.dailyDeposit ? money(month.dailyDeposit) : '—'),
      el('td', { class: 'num' }, month.contribution ? `−${money(month.contribution)}` : '—'),
      el('td', { class: 'num' }, el('b', {}, money(month.payout)))));
    return el('div', { class: 'panel' },
      el('h2', {}, 'Lună de lună'),
      el('p', { class: 'muted' }, 'Garanția: minim 5.000 RON pe lună, socotit pe perioade de 3 luni. „De primit” = partea ta ± garanția − contribuția lunară la depozit.'),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ...['Luna', 'Ore', 'Tips total', 'Partea ta', 'Garanție', 'Depozit zilnic', 'Contribuție', 'De primit'].map((name, index) => el('th', { class: index ? 'num' : '' }, name)))),
        el('tbody', {}, rows))));
  }

  function shiftsTable(shifts) {
    const recent = shifts.slice(0, 30);
    const changed = shift => shift.dealer_check_in && (shift.dealer_check_in !== shift.check_in || shift.dealer_check_out !== shift.check_out) && shift.status === 'approved';
    return el('div', { class: 'panel' },
      el('h2', {}, 'Pontaj'),
      recent.length ? el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Ziua'), el('th', {}, 'Venit'), el('th', {}, 'Plecat'), el('th', { class: 'num' }, 'Ore'), el('th', {}, 'Stare'))),
        el('tbody', {}, recent.map(shift => el('tr', {},
          el('td', {}, dateLabel(shift.check_in)),
          el('td', {}, time(shift.check_in)),
          el('td', {}, time(shift.check_out)),
          el('td', { class: 'num' }, shift.check_out ? hours(window.DealerMath.shiftHours(shift)) : '—'),
          el('td', {}, el('span', { class: `chip ${shift.status}` }, STATUS_LABELS[shift.status]),
            changed(shift) ? el('div', { class: 'muted' }, `scris de tine: ${time(shift.dealer_check_in)}–${time(shift.dealer_check_out)}`) : null))))))
        : el('p', { class: 'empty' }, 'Nicio tură încă.'));
  }

  function penaltiesPanel(penalties, onDelete) {
    return el('div', { class: 'panel' },
      el('h2', {}, 'Penalizări'),
      penalties.length ? el('div', { class: 'card-list' }, penalties.map(penalty => el('div', { class: 'item' },
        el('div', { class: 'who' }, el('span', {}, `${dateLabel(penalty.day)} · ${penalty.reason}`), el('span', {}, `−${money(penalty.amount)}`)),
        onDelete ? el('button', { class: 'btn danger small', type: 'button', onclick: () => onDelete(penalty) }, 'Șterge') : null)))
        : el('p', { class: 'empty' }, 'Nicio penalizare. Bravo!'));
  }

  function renderCard(container, bundle, options = {}) {
    const card = window.DealerMath.summarize(bundle);
    container.replaceChildren(
      tiles(card),
      options.before || '',
      monthsTable(card),
      shiftsTable(bundle.shifts),
      penaltiesPanel(bundle.penalties, options.onDeletePenalty),
      options.after || '');
    return card;
  }

  window.DealerCard = { renderCard };
})();
