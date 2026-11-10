const assert = require('node:assert/strict');
const { calendarDay, summarize } = require('../h5/arrivals.js');
const record = (id, date, nights = 1, companyId = 'c1') => ({ id, arrivalDate: date, nights, companyId, customerName: id });
const data = {
  companies: [{ id: 'c1', name: '云栖旅居' }],
  orders: [record('third-day', '2026-11-13'), record('tomorrow', '2026-11-11'), record('today', '2026-11-10'), record('second-day', '2026-11-12'), record('later', '2026-11-14'), record('staying', '2026-11-09', 3), record('checkout-today', '2026-11-08', 2), record('finished', '2026-11-01'), record('bad-date', '2026-02-30'), record('bad-nights', '2026-11-10', 0), record('unknown-parent', '2026-11-10', 1, 'missing'), record('legacy', '2026-11-11', 1, '')]
};
const original = JSON.stringify(data);
const summary = summarize(data, '2026-11-10');
assert.deepEqual(summary.arrivals.map(x => x.order.id), ['today', 'legacy', 'tomorrow', 'second-day', 'third-day']);
assert.equal(summary.todayCount, 1);
assert.equal(summary.upcomingCount, 4);
assert.deepEqual(summary.staying.map(x => x.order.id), ['staying']);
assert.equal(summary.staying[0].remaining, 2);
assert.equal(summary.arrivals.find(x => x.order.id === 'legacy').company, null);
assert.equal(JSON.stringify(data), original);
const nextDay = summarize(data, '2026-11-11');
assert.equal(nextDay.todayCount, 2);
assert.ok(!nextDay.arrivals.some(x => x.order.id === 'today'));
assert.ok(nextDay.arrivals.some(x => x.order.id === 'later'));
assert.equal(calendarDay('2026-03-09') - calendarDay('2026-03-08'), 1);
assert.equal(calendarDay('2026-11-02') - calendarDay('2026-11-01'), 1);
assert.equal(calendarDay('2027-01-01') - calendarDay('2026-12-31'), 1);
assert.equal(calendarDay('2028-03-01') - calendarDay('2028-02-28'), 2);
for (const invalid of ['2026-02-29', '2026-00-01', '2026-13-01', '2026-04-31', '2026-1-02', '', null]) assert.equal(calendarDay(invalid), null);
assert.deepEqual(summarize(data, 'invalid').arrivals, []);
console.log('PASS arrival window today through +3 days; sorted reminders; staying excludes departure date; legacy data; invalid dates/parents; no mutation; DST/leap/year boundaries; midnight recomputation');
