// Dealer pay rules from /dealers-payout, as pure functions shared by the dealer card, the floor manager panel
// and the unit tests. The database stores only raw facts (daily tips, shifts, penalties); every amount shown
// is derived here, so a rule change is one edit in this file.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DealerMath = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const GUARANTEED_MONTHLY = 5000;
  const GUARANTEE_PERIOD_MONTHS = 3;
  const CLUB_DAILY_CAP = 500;
  const BONUS_EVERY_MONTHS = 6;
  const BONUS_HALF_YEAR = { amount: 4000, keep: 5000, label: 'Bonus 6 luni' };
  const BONUS_YEAR = { amount: 8000, keep: 10000, label: 'Bonus anual' };
  const DEPOSIT_STAGES = [5000, 10000];
  const CONTRIBUTION_BRACKETS = [[10000, 1500], [8000, 1000], [7000, 750], [6000, 500]];
  const TIME_ZONE = 'Europe/Bucharest';

  const round = value => Math.round(value * 100) / 100;
  const sum = (rows, pick) => round(rows.reduce((total, row) => total + pick(row), 0));

  // Club share of one day's tips; above 1.200 RON the club keeps at most 500 and the rest goes to the deposit.
  function splitTips(total) {
    const tips = Math.max(0, Number(total) || 0);
    let clubShare;
    if (tips <= 500) clubShare = tips * 0.2;
    else if (tips <= 600) clubShare = 150;
    else if (tips <= 1000) clubShare = tips * 0.3;
    else if (tips <= 1200) clubShare = 350;
    else clubShare = tips * 0.4;
    const club = Math.min(clubShare, CLUB_DAILY_CAP);
    return { dealer: round(tips - clubShare), club: round(club), deposit: round(clubShare - club) };
  }

  function monthlyContribution(earned) {
    const bracket = CONTRIBUTION_BRACKETS.find(([floor]) => earned >= floor);
    return bracket ? bracket[1] : 0;
  }

  // Each month pays at least 5.000 RON; the top-up is taken back only from later months above 5.000 RON in the
  // same 3-month period, and whatever is still owed when the period ends is the club's loss.
  function settleGuarantee(earnings, worked = earnings.map(() => true)) {
    let owed = 0;
    return earnings.map((earned, index) => {
      if (index % GUARANTEE_PERIOD_MONTHS === 0) owed = 0;
      if (!worked[index]) return { guaranteed: earned, adjustment: 0, owed };
      if (earned < GUARANTEED_MONTHLY) {
        const topUp = round(GUARANTEED_MONTHLY - earned);
        owed = round(owed + topUp);
        return { guaranteed: GUARANTEED_MONTHLY, adjustment: topUp, owed };
      }
      const held = Math.min(round(earned - GUARANTEED_MONTHLY), owed);
      owed = round(owed - held);
      return { guaranteed: round(earned - held), adjustment: -held, owed };
    });
  }

  function localDay(timestamp) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
  }

  function shiftHours(shift) {
    if (!shift.check_out) return 0;
    return round((new Date(shift.check_out) - new Date(shift.check_in)) / 3600000);
  }

  function addMonths(isoDay, months) {
    const [year, month, day] = isoDay.split('-').map(Number);
    const target = new Date(Date.UTC(year, month - 1 + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target.toISOString().slice(0, 10);
  }

  function monthKeys(startDay, today) {
    const keys = [];
    for (let key = startDay.slice(0, 7); key <= today.slice(0, 7); key = addMonths(`${key}-01`, 1).slice(0, 7)) keys.push(key);
    return keys;
  }

  function buildMonths(data, today) {
    const keys = monthKeys(data.dealer.start_date, today);
    const approved = data.shifts.filter(shift => shift.status === 'approved');
    const rows = keys.map(key => {
      const tips = data.tips.filter(row => row.day.startsWith(key));
      const splits = tips.map(row => splitTips(row.total));
      const shifts = approved.filter(shift => localDay(shift.check_in).startsWith(key));
      return {
        key,
        tips: sum(tips, row => Number(row.total)),
        days: tips.length,
        dealerShare: sum(splits, split => split.dealer),
        clubShare: sum(splits, split => split.club),
        dailyDeposit: sum(splits, split => split.deposit),
        hours: sum(shifts, shiftHours),
        shifts: shifts.length,
        closed: key < today.slice(0, 7),
      };
    });
    const settled = settleGuarantee(rows.map(row => row.dealerShare), rows.map(row => row.days > 0 || row.shifts > 0));
    return rows.map((row, index) => {
      const contribution = monthlyContribution(row.dealerShare);
      const { guaranteed, adjustment, owed } = settled[index];
      return { ...row, period: Math.floor(index / GUARANTEE_PERIOD_MONTHS) + 1, guaranteed, adjustment, owed, contribution, payout: round(guaranteed - contribution) };
    });
  }

  function nextBonus(data, today, balance) {
    let step = 1;
    while (addMonths(data.dealer.start_date, step * BONUS_EVERY_MONTHS) <= today) step += 1;
    const date = addMonths(data.dealer.start_date, step * BONUS_EVERY_MONTHS);
    const since = addMonths(data.dealer.start_date, (step - 1) * BONUS_EVERY_MONTHS);
    const rule = step % 2 === 0 ? BONUS_YEAR : BONUS_HALF_YEAR;
    const eligible = !data.penalties.some(penalty => penalty.day >= since);
    return { date, since, label: rule.label, amount: rule.amount, keep: rule.keep, eligible, estimate: round(Math.max(0, balance - rule.keep) + rule.amount) };
  }

  function summarize(data, today = localDay(Date.now())) {
    const months = buildMonths(data, today);
    const daily = sum(months, month => month.dailyDeposit);
    const monthly = sum(months.filter(month => month.closed), month => month.contribution);
    const penalties = sum(data.penalties, penalty => Number(penalty.amount));
    const balance = round(daily + monthly - penalties);
    const current = months[months.length - 1] || null;
    return {
      months,
      current,
      deposit: { daily, monthly, penalties, balance, stage: balance >= DEPOSIT_STAGES[0] ? 2 : 1, target: balance >= DEPOSIT_STAGES[0] ? DEPOSIT_STAGES[1] : DEPOSIT_STAGES[0] },
      hours: { month: current ? current.hours : 0, total: sum(months, month => month.hours) },
      pendingShifts: data.shifts.filter(shift => shift.status === 'pending').length,
      openShift: data.shifts.find(shift => shift.status === 'open') || null,
      nextBonus: nextBonus(data, today, balance),
    };
  }

  return { splitTips, monthlyContribution, settleGuarantee, summarize, shiftHours, localDay, addMonths, GUARANTEED_MONTHLY };
});
