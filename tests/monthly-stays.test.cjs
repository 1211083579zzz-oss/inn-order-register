const assert = require('node:assert/strict');
const calendar = require('../h5/arrivals.js');
const storage = require('../h5/storage.js');
const core = require('../h5/sync-core.js');

const vectors = [
  ['2027-01-01','2027-02-01',31], ['2027-01-31','2027-02-28',28],
  ['2028-01-31','2028-02-29',29], ['2027-02-01','2027-03-01',28],
  ['2028-02-01','2028-03-01',29], ['2028-02-29','2028-03-29',29],
  ['2026-03-31','2026-04-30',30], ['2026-04-15','2026-05-15',30],
  ['2026-05-15','2026-06-15',31], ['2026-08-31','2026-09-30',30],
  ['2026-12-31','2027-01-31',31], ['2026-04-30','2026-05-30',30]
];
for (const [arrivalDate, departureDate, nights] of vectors) {
  assert.equal(calendar.dateAfterMonth(arrivalDate), departureDate);
  assert.equal(calendar.packageDeparture(arrivalDate,'month'), departureDate);
  assert.equal(calendar.calendarDay(departureDate)-calendar.calendarDay(arrivalDate), nights);
  assert.equal(calendar.stayPackage({arrivalDate,departureDate}), 'month');
  assert.equal(calendar.stayState({arrivalDate,departureDate},departureDate).key, 'finished');
}
for (const invalid of ['', '2027-02-29', '2026-04-31', 'not-a-date', null]) assert.equal(calendar.dateAfterMonth(invalid),'');
assert.equal(calendar.dateAfterMonth('9999-12-15'),'');
assert.equal(calendar.packageDeparture('2026-12-28','7'),'2027-01-04');
assert.equal(calendar.packageDeparture('2026-12-28','14'),'2027-01-11');
assert.equal(calendar.packageDeparture('2026-12-28','30'),'');
assert.equal(calendar.stayPackage({arrivalDate:'2027-01-31',departureDate:'2027-03-02'}),'');
assert.equal(calendar.stayPackage({arrivalDate:'2027-01-31',departureDate:'invalid'}),'');

function memory() {
  const values = new Map();
  return {getItem:key=>values.get(key) || null,setItem:(key,value)=>values.set(key,value)};
}
const store = storage.createStore(memory());
const common={hotelOrder:'自然月验证酒店',base:'安吉基地',anchorName:'依依',customerName:'月度客人',phone:'13800138000',guestCount:'2人',roomType:'双床房',createdAt:'2026-11-15T04:00:00Z'};
vectors.forEach(([arrivalDate,departureDate,nights], index)=>store.saveRegistration({...common,id:'month'+index,arrivalDate,departureDate,nights},index%2?'公司甲':'公司乙'));
for (const [id,nights] of [['week',7],['fortnight',14],['custom',3]]) store.saveRegistration({...common,id,arrivalDate:'2026-11-15',departureDate:calendar.dateAfter('2026-11-15',nights),nights},'公司甲');
const before=store.read();
const summary=calendar.packageSummary(before.orders);
assert.deepEqual(summary,{'7':1,'14':1,month:12,other:1});
assert.equal(storage.groupByAnchor(before.orders,'2026-11')[0].orders.length,15);
assert.equal(storage.groupByAnchor(before.orders,'2026-12')[0].orders.length,0);
assert.deepEqual(store.read(),before);
const restored=storage.createStore(memory());restored.mergeBackup(restored.parseBackup(JSON.stringify(store.backup())));
assert.deepEqual(calendar.packageSummary(restored.read().orders),summary);
for (const original of before.orders) {
  const value=restored.read().orders.find(o=>o.id===original.id);
  assert.equal(value.departureDate,original.departureDate);assert.equal(value.nights,original.nights);
}
const actorA='AAAAAAAAAAAAAAAA', actorB='BBBBBBBBBBBBBBBB';
const initial=core.capture(core.empty(),core.emptyData(),before,actorA);
const remote=structuredClone(core.project(initial).data);
const added=structuredClone(remote.orders.find(o=>o.id==='month0'));
added.id='remote-month';remote.orders.push(added);
const merged=core.merge(initial,core.capture(initial,core.project(initial).data,remote,actorB));
assert.deepEqual(calendar.packageSummary(core.project(merged).data.orders),{'7':1,'14':1,month:13,other:1});
assert.equal(core.project(merged).conflicts.length,0);
assert.deepEqual(calendar.packageSummary(core.project(core.merge(merged,merged)).data.orders),{'7':1,'14':1,month:13,other:1});
console.log('PASS calendar-month 28/29/30/31 nights, leap/month-end/year boundaries; 7/14-day choices; exact legacy dates; monthly cross-company counts; backup and schema-preserving cloud merge without mutation or duplicate counts');
