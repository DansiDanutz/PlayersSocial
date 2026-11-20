// Rules from /dealers-payout: daily tips split, monthly deposit share, 3-month guarantee, deposit balance, bonuses.
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitTips, monthlyContribution, settleGuarantee, summarize } = require('../../dist/staff/dealer-math.js');

test('splits daily tips by the grid', () => {
  assert.deepEqual(splitTips(0), { dealer: 0, club: 0, deposit: 0 });
  assert.deepEqual(splitTips(300), { dealer: 240, club: 60, deposit: 0 });
  assert.deepEqual(splitTips(500), { dealer: 400, club: 100, deposit: 0 });
  assert.deepEqual(splitTips(550), { dealer: 400, club: 150, deposit: 0 });
  assert.deepEqual(splitTips(1000), { dealer: 700, club: 300, deposit: 0 });
  assert.deepEqual(splitTips(1100), { dealer: 750, club: 350, deposit: 0 });
  assert.deepEqual(splitTips(1200), { dealer: 850, club: 350, deposit: 0 });
  assert.deepEqual(splitTips(2000), { dealer: 1200, club: 500, deposit: 300 });
  assert.deepEqual(splitTips(3000), { dealer: 1800, club: 500, deposit: 700 });
});

test('monthly deposit share follows the earnings brackets', () => {
  assert.equal(monthlyContribution(5999), 0);
  assert.equal(monthlyContribution(6000), 500);
  assert.equal(monthlyContribution(7500), 750);
  assert.equal(monthlyContribution(9999), 1000);
  assert.equal(monthlyContribution(10000), 1500);
});

test('guarantee tops up weak months and recovers only inside the same 3 months', () => {
  assert.deepEqual(settleGuarantee([4000, 5500, 6000]).map(m => m.guaranteed), [5000, 5000, 5500]);
  assert.deepEqual(settleGuarantee([4000, 4000, 4000, 5000, 5000, 6000]).map(m => m.guaranteed), [5000, 5000, 5000, 5000, 5000, 6000]);
  assert.deepEqual(settleGuarantee([4000, 5500]).map(m => m.adjustment), [1000, -500]);
});

test('summarizes a dealer card', () => {
  const data = {
    dealer: { start_date: '2026-09-01' },
    tips: [
      { day: '2026-09-05', total: 2000 },
      { day: '2026-09-06', total: 500 },
      { day: '2026-10-02', total: 1000 },
    ],
    shifts: [
      { check_in: '2026-10-02T15:00:00Z', check_out: '2026-10-02T23:30:00Z', status: 'approved' },
      { check_in: '2026-10-03T15:00:00Z', check_out: '2026-10-03T20:00:00Z', status: 'pending' },
    ],
    penalties: [{ day: '2026-10-10', amount: 100, reason: 'Întârziere' }],
  };

  const card = summarize(data, '2026-11-21');

  assert.equal(card.months.length, 3);
  assert.equal(card.months[0].dealerShare, 1600);
  assert.equal(card.months[0].dailyDeposit, 300);
  assert.equal(card.months[0].guaranteed, 5000);
  assert.equal(card.months[1].hours, 8.5);
  assert.equal(card.months[2].closed, false);
  assert.equal(card.deposit.balance, 200);
  assert.equal(card.pendingShifts, 1);
  assert.equal(card.nextBonus.date, '2027-03-01');
  assert.equal(card.nextBonus.eligible, false);
});
