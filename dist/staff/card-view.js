// Dealer card: every amount the rules produce for one dealer, shown the same way to the dealer and to the
// floor manager. Amounts come from DealerMath.summarize(); this file only lays them out.
(function () {
  const { el, money, signedMoney, hours, time, dateLabel, monthLabel, STATUS_LABELS } = window.Staff;

  // The dealer reads their own card in the second person; floor managers and teammates read it in the third.
  const WORDS = {
    self: { deposit: 'Depozitul tău', share: 'Partea ta', lost: 'ai penalizări din', typed: 'scris de tine', note: '„De primit” = partea ta ± garanția − contribuția lunară la depozit.' },
    other: { deposit: 'Depozit', share: 'Partea dealerului', lost: 'are penalizări din', typed: 'scris de dealer', note: '„De primit” = partea dealerului ± garanția − contribuția lunară la depozit.' },
  };

  function tile(label, value, note, extra = {}) {
    return el('div', { class: `tile ${extra.gold ? 'gold' : ''}` }, el('small', {}, label), el('b', {}, value), note ? el('span', {}, note) : null, extra.bar || null);
  }

  function progress(value, target) {
    const percent = Math.max(0, Math.min(100, (value / target) * 100));
    return el('div', { class: 'bar', role: 'img', 'aria-label': `${Math.round(percent)}% din ${money(target)}` }, el('i', { style: `width:${percent}%` }));
  }

  function tiles(card, words) {
    const month = card.current;
    const bonus = card.nextBonus;
    return el('div', { class: 'tiles' },
      tile('Luna aceasta', month ? money(month.dealerShare) : money(0), month ? `din ${money(month.tips)} tips · ${month.days} ${month.days === 1 ? 'zi' : 'zile'}` : ''),
      tile('Ore aprobate', hours(card.hours.month), `luna aceasta · total ${hours(card.hours.total)}`),
      tile(words.deposit, money(card.deposit.balance), `Etapa ${card.deposit.stage}: ținta ${money(card.deposit.target)}`, { gold: true, bar: progress(card.deposit.balance, card.deposit.target) }),
      tile(bonus.label, bonus.eligible ? money(bonus.estimate) : 'Pierdut', bonus.eligible ? `estimat la ${dateLabel(bonus.date)}` : `${words.lost} ${dateLabel(bonus.since)}`, { gold: true }));
  }

  function monthsTable(card, words) {
    const td = (label, value) => el('td', { class: 'num', 'data-label': label }, value);
    // Months without hours, tips or guarantee stay out of the list; the current month always shows.
    const active = card.months.filter(month => !month.closed || month.hours || month.tips || month.adjustment);
    const rows = [...active].reverse().map(month => el('tr', {},
      el('td', { class: 'lead', 'data-label': 'Luna' }, monthLabel(month.key), month.closed ? null : el('div', { class: 'muted' }, 'în curs (estimat)')),
      td('Ore', hours(month.hours)),
      td('Tips total', money(month.tips)),
      td(words.share, money(month.dealerShare)),
      td('Garanție', month.adjustment ? signedMoney(month.adjustment) : '—'),
      td('Depozit zilnic', month.dailyDeposit ? money(month.dailyDeposit) : '—'),
      td('Contribuție', month.contribution ? `−${money(month.contribution)}` : '—'),
      td('De primit', el('b', {}, money(month.payout)))));
    return el('div', { class: 'panel' },
      el('h2', {}, 'Lună de lună'),
      el('p', { class: 'muted' }, `Garanția: minim 5.000 RON pe lună, socotit pe perioade de 3 luni. ${words.note}`),
      el('div', { class: 'table-wrap' }, el('table', { class: 'stack' },
        el('thead', {}, el('tr', {}, ...['Luna', 'Ore', 'Tips total', words.share, 'Garanție', 'Depozit zilnic', 'Contribuție', 'De primit'].map((name, index) => el('th', { class: index ? 'num' : '' }, name)))),
        el('tbody', {}, rows))));
  }

  function shiftsTable(shifts, words) {
    const recent = shifts.slice(0, 30);
    const changed = shift => shift.dealer_check_in && (shift.dealer_check_in !== shift.check_in || shift.dealer_check_out !== shift.check_out) && shift.status === 'approved';
    return el('div', { class: 'panel' },
      el('h2', {}, 'Pontaj'),
      recent.length ? el('div', { class: 'table-wrap' }, el('table', { class: 'stack' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Ziua'), el('th', {}, 'Venit'), el('th', {}, 'Plecat'), el('th', { class: 'num' }, 'Ore'), el('th', {}, 'Stare'))),
        el('tbody', {}, recent.map(shift => el('tr', {},
          el('td', { class: 'lead', 'data-label': 'Ziua' }, dateLabel(shift.check_in)),
          el('td', { 'data-label': 'Venit' }, time(shift.check_in)),
          el('td', { 'data-label': 'Plecat' }, time(shift.check_out)),
          el('td', { class: 'num', 'data-label': 'Ore' }, shift.check_out ? hours(window.DealerMath.shiftHours(shift)) : '—'),
          el('td', { 'data-label': 'Stare' }, el('span', { class: `chip ${shift.status}` }, STATUS_LABELS[shift.status]),
            changed(shift) ? el('div', { class: 'muted' }, `${words.typed}: ${time(shift.dealer_check_in)}–${time(shift.dealer_check_out)}`) : null))))))
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
    const words = WORDS[options.viewer === 'other' ? 'other' : 'self'];
    container.replaceChildren(
      tiles(card, words),
      options.before || '',
      monthsTable(card, words),
      shiftsTable(bundle.shifts, words),
      penaltiesPanel(bundle.penalties, options.onDeletePenalty),
      options.after || '');
    return card;
  }

  window.DealerCard = { renderCard };
})();
