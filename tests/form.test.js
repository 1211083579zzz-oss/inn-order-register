const assert = require('node:assert/strict');

const store = new Map();
const notices = [];
global.wx = {
  getStorageSync(key) { return store.get(key); },
  setStorageSync(key, value) { store.set(key, value); },
  showToast(options) { notices.push(options.title); },
  navigateBack() {},
  setNavigationBarTitle() {},
  showModal() {}
};

let page;
global.Page = (definition) => { page = definition; };
require('../pages/form/form');

function contextWith(data) {
  const context = Object.create(page);
  context.data = { ...page.data, ...data };
  context.setData = (update) => { context.data = { ...context.data, ...update }; };
  return context;
}

const form = contextWith({
  hotelOrder: '测试旅店：样例订单',
  base: '测试基地',
  customerName: '测试客人',
  phone: '12345678',
  arrivalDate: '2026-11-09',
  nights: '7',
  guestCount: '2大2小',
  roomType: '亲子套房',
  mealIncluded: '是',
  feeDetails: '测试费用说明',
});

page.onSave.call(form);
const [saved] = store.get('inn-order-records-v1');
assert.equal(saved.hotelOrder, '测试旅店：样例订单');
assert.equal(saved.checkoutDate, undefined);
assert.equal(saved.arrivalDate, '2026-11-09');
assert.equal(saved.nights, 7);
assert.equal(saved.guestCount, '2大2小');
assert.equal(saved.roomType, '亲子套房');
assert.equal(saved.mealIncluded, '是');
assert.equal(saved.feeDetails, '测试费用说明');

const edit = contextWith({ orderId: saved.id });
page.onLoad.call(edit, { id: saved.id });
assert.equal(edit.data.hotelOrder, '测试旅店：样例订单');
assert.equal(edit.data.guestCount, '2大2小');
assert.equal(edit.data.roomType, '亲子套房');

console.log('PASS simplified form save and edit round trip');
