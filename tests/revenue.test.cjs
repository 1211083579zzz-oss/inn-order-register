const assert = require('node:assert/strict');
const money = require('../h5/money.js');
const storage = require('../h5/storage.js');
const core = require('../h5/sync-core.js');
const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const clone = value => structuredClone(value);
const common = {
  hotelOrder: '金额验证酒店', base: '安吉基地', customerName: '金额验证住客',
  phone: '13800138000', arrivalDate: '2027-01-31', departureDate: '2027-02-28', nights: 28,
  guestCount: '2人', roomType: '双床房', mealIncluded: '否', anchorName: '依依',
  feeDetails: '房费9800元，餐费200元，备注不计入金额', createdAt: '2026-11-15T04:00:00Z'
};

for (const [text, expected] of [['0', 0], ['0.10', 10], ['.03', 3], ['１２０．５０', 12050], ['99999999.99', 9999999999], ['', '']]) {
  assert.equal(money.parse(text), expected);
  if (expected !== '') assert.equal(money.parse(money.input(expected)), expected);
}
for (const input of ['-1', '0.001', '100000000', '1e3', 'NaN', 'Infinity', '1,000.00', '12元']) assert.throws(() => money.parse(input));
for (const input of [-1, 0.1, Number.NaN, Number.POSITIVE_INFINITY, 10000000000, '10']) assert.throws(() => money.cents(input));
assert.equal(money.summarize([{ incomeCents: 10, costCents: 3 }, { incomeCents: 20, costCents: 0 }]).net, 27);
assert.equal(money.summarize([{ incomeCents: 0, costCents: 100 }]).net, -100);
assert.match(money.format(-100), /−¥1\.00/);
assert.equal(money.display(money.summarize([{ feeDetails: '收入9800元' }]), 'income'), '待补金额');
assert.equal(money.summarize([{ incomeCents: 0, costCents: 0 }]).pendingCount, 0);
assert.equal(money.display(money.summarize([]), 'net'), '¥0.00');

const local = memory(), store = storage.createStore(local);
store.saveRegistration({ ...common, id: 'a', incomeCents: 10, costCents: 3 }, '云栖旅居');
store.saveRegistration({ ...common, id: 'b', incomeCents: 20, costCents: 0 }, '山海旅居');
store.saveRegistration({ ...common, id: 'older', anchorName: '小雪', createdAt: '2026-10-31T04:00:00Z', incomeCents: 12345, costCents: 2345 }, '云栖旅居');
store.saveRegistration({ ...common, id: 'legacy' }, '云栖旅居');
const monthly = () => money.summarize(store.read().orders.filter(order => storage.registrationMonth(order) === '2026-11'));
assert.equal(monthly().income, 30); assert.equal(monthly().cost, 3); assert.equal(monthly().net, 27); assert.equal(monthly().pendingCount, 1);
assert.equal(storage.groupByAnchor(store.read().orders, '2026-11').find(group => group.id === '依依').orders.length, 3);
const original = clone(store.read());
const restored = storage.createStore(memory());
restored.mergeBackup(restored.parseBackup(JSON.stringify(store.backup())));
assert.deepEqual(restored.read(), original);
restored.mergeBackup(restored.parseBackup(JSON.stringify(store.backup())));
assert.equal(restored.read().orders.length, original.orders.length);

const rawBefore = local.getItem(storage.DATA_KEY), corrupt = clone(store.backup());
corrupt.orders[0].incomeCents = 0.1;
assert.throws(() => store.mergeBackup(store.parseBackup(corrupt)));
assert.equal(local.getItem(storage.DATA_KEY), rawBefore);
assert.throws(() => store.saveRegistration({ ...common, id: 'a', incomeCents: -1, costCents: 3 }, '新公司'));
assert.equal(local.getItem(storage.DATA_KEY), rawBefore);
const legacyBackup = clone(store.backup());
legacyBackup.orders = [{ ...legacyBackup.orders[0], id: 'old-format' }];
delete legacyBackup.orders[0].incomeCents; delete legacyBackup.orders[0].costCents;
restored.mergeBackup(restored.parseBackup(legacyBackup));
assert.equal(restored.read().orders.find(order => order.id === 'old-format').incomeCents, '');

const saved = store.read().orders.find(order => order.id === 'a');
store.saveRegistration({ ...saved, incomeCents: 100, costCents: 30 }, '山海旅居');
assert.equal(monthly().net, 90); assert.equal(store.read().orders.find(order => order.id === 'a').createdAt, common.createdAt);
store.saveOrders(store.read().orders.filter(order => order.id !== 'a'));
assert.equal(monthly().income, 20); assert.equal(monthly().cost, 0); assert.equal(monthly().net, 20);
console.log('PASS_MONEY: exact decimal cents and maximum; invalid amounts reject atomically; zero/loss/unknown stay distinct; registration-month/anchor totals; backup roundtrip/idempotence/legacy import; edit/reassignment/delete update totals');

(async () => {
  const actorA = 'aaaaaaaaaaaaaaaa', actorB = 'bbbbbbbbbbbbbbbb';
  const base = core.capture(core.empty(), core.emptyData(), original, actorA);
  const projected = core.project(base).data, left = clone(projected), right = clone(projected);
  left.orders.find(order => order.id === 'a').incomeCents = 12345;
  right.orders.find(order => order.id === 'a').costCents = 2345;
  const merged = core.merge(core.capture(base, projected, left, actorA), core.capture(base, projected, right, actorB));
  const result = core.project(merged);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.data.orders.find(order => order.id === 'a').incomeCents, 12345);
  assert.equal(result.data.orders.find(order => order.id === 'a').costCents, 2345);
  assert.deepEqual(core.project(core.merge(merged, merged)), result);
  assert.equal(money.summarize(result.data.orders.filter(order => storage.registrationMonth(order) === '2026-11')).net, 10020);

  left.orders.find(order => order.id === 'a').incomeCents = 100;
  right.orders.find(order => order.id === 'a').incomeCents = 200;
  const conflicting = core.merge(core.capture(base, projected, left, actorA), core.capture(base, projected, right, actorB));
  const conflict = core.project(conflicting).conflicts.find(item => item.field === 'incomeCents');
  assert.deepEqual(new Set(conflict.choices.map(item => item.value)), new Set([100, 200]));
  const resolved = core.project(core.resolve(conflicting, conflict, 200, actorA));
  assert.equal(resolved.conflicts.length, 0);
  assert.equal(resolved.data.orders.find(order => order.id === 'a').incomeCents, 200);
  assert.equal(resolved.data.orders.length, original.orders.length);
  const deleted = clone(projected); deleted.orders = deleted.orders.filter(order => order.id !== 'a');
  assert.equal(core.project(core.merge(core.capture(base, projected, deleted, actorA), merged)).data.orders.some(order => order.id === 'a'), false);

  const keys = await core.derive(core.code()), encrypted = await core.encrypt(merged, keys);
  assert.deepEqual(await core.decrypt(encrypted, keys), merged);
  assert.ok(!JSON.stringify(encrypted).includes('incomeCents'));
  assert.ok(!JSON.stringify(encrypted).includes('云栖'));
  console.log('PASS_MONEY_SYNC: concurrent income/cost merge exactly once; conflicting income retained and resolvable; deletions propagate; encrypted amounts roundtrip without plaintext fields');
})().catch(error => { console.error(error); process.exitCode = 1; });
