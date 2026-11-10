const assert = require('node:assert/strict');
const { createStore, DATA_KEY } = require('../h5/storage.js');

const values = new Map();
let writes = 0;
let rejectWrites = false;
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    if (rejectWrites) throw new Error('QuotaExceededError');
    writes += 1;
    values.set(key, value);
  }
};
const store = createStore(storage);
assert.deepEqual(store.read(), { version: 2, companies: [], orders: [] });
const guest = {
  id: 'direct-guest', hotelOrder: '湖畔酒店', base: '安吉基地', customerName: '测试客人',
  phone: '13800138000', arrivalDate: '2026-11-12', nights: 3,
  guestCount: '2大1小', roomType: '亲子房', mealIncluded: '是', feeDetails: '费用1600元'
};

writes = 0;
const first = store.saveRegistration(guest, '云栖旅居');
assert.equal(writes, 1);
assert.equal(store.read().companies.length, 1);
assert.equal(store.read().orders.length, 1);
assert.equal(first.companyId, store.read().companies[0].id);
const originalCompany = store.read().companies[0];
store.saveCompany({ ...originalCompany, notes: '原有公司备注' });

const edited = store.saveRegistration({ ...first, customerName: '修改后客人' }, '  云栖旅居  ');
assert.equal(edited.companyId, originalCompany.id);
assert.equal(edited.createdAt, first.createdAt);
assert.equal(store.read().companies.length, 1);
assert.equal(store.read().companies[0].notes, '原有公司备注');
assert.equal(store.read().orders.length, 1);

const reassigned = store.saveRegistration(edited, '山海旅居');
assert.notEqual(reassigned.companyId, originalCompany.id);
assert.equal(store.read().orders.length, 1);
assert.equal(store.read().companies.length, 2);
assert.equal(store.backup().companies.find(company => company.id === originalCompany.id).notes, '原有公司备注');

const snapshot = values.get(DATA_KEY);
for (const [input, company] of [
  [guest, '   '],
  [{ ...guest, nights: 0 }, '不应生成的公司'],
  [{ ...guest, arrivalDate: '2026-02-30' }, '不应生成的公司'],
  [{ ...guest, phone: 'invalid' }, '不应生成的公司'],
  [{ ...guest, customerName: '' }, '不应生成的公司']
]) {
  assert.throws(() => store.saveRegistration(input, company));
  assert.equal(values.get(DATA_KEY), snapshot);
}
rejectWrites = true;
assert.throws(() => store.saveRegistration({ ...guest, id: 'failed-new' }, '空间不足公司'), /Quota/);
assert.throws(() => store.saveRegistration(reassigned, '空间不足时移动公司'), /Quota/);
assert.equal(values.get(DATA_KEY), snapshot);
rejectWrites = false;
assert.deepEqual(createStore(storage).read(), JSON.parse(snapshot));
console.log('PASS direct first registration; one atomic company/guest write; existing company reuse; metadata and creation time retained; company reassignment; invalid input and quota failures leave original data unchanged');
