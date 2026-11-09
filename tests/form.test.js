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
  hotelName: '测试旅店',
  orderTitle: '样例订单',
  sourceIndex: 6,
  sourceOther: '测试来源',
  base: '测试基地',
  company: '测试公司',
  anchor: '测试主播',
  recordDate: '2026-11-08',
  customerName: '测试客人',
  phone: '12345678',
  arrivalDate: '2026-11-09',
  nights: '7',
  adults: '2',
  children: '2',
  roomIndex: 6,
  roomOther: '亲子套房',
  mealIncluded: '是',
  feeDetails: '测试费用说明',
  totalAmount: '888',
  receivedAmount: '888',
  paymentIndex: 5,
  paymentOther: '前台收款'
});

page.onSave.call(form);
const [saved] = store.get('inn-order-records-v1');
assert.equal(saved.hotelName, '测试旅店');
assert.equal(saved.company, '测试公司');
assert.equal(saved.anchor, '测试主播');
assert.equal(saved.recordDate, '2026-11-08');
assert.equal(saved.checkoutDate, '2026-11-16');
assert.equal(saved.roomType, '亲子套房');
assert.equal(saved.orderSource, '测试来源');
assert.equal(saved.paymentMethod, '前台收款');
assert.equal(saved.receivedAmount, 888);

const edit = contextWith({ orderId: saved.id });
page.onLoad.call(edit, { id: saved.id });
assert.equal(edit.data.sourceIndex, 6);
assert.equal(edit.data.sourceOther, '测试来源');
assert.equal(edit.data.roomIndex, 6);
assert.equal(edit.data.roomOther, '亲子套房');
assert.equal(edit.data.paymentIndex, 5);
assert.equal(edit.data.paymentOther, '前台收款');

console.log('PASS form save, checkout calculation, and custom-value edit round trip');
