const assert = require('node:assert/strict');

const store = new Map();
global.wx = {
  getStorageSync(key) { return store.get(key); },
  setStorageSync(key, value) { store.set(key, value); }
};

const ordersApi = require('../utils/orders');

const first = {
  id: 'order-1',
  customerName: '测试客户',
  arrivalDate: '2026-11-09',
  nights: 2,
  totalAmount: 880,
  receivedAmount: 400,
  createdAt: '2026-11-01T08:00:00.000Z'
};

assert.deepEqual(ordersApi.getOrders(), []);
ordersApi.saveOrder(first);
assert.equal(ordersApi.getOrders()[0].id, 'order-1');
assert.equal(ordersApi.getOrderStatus(first, '2026-11-09'), '入住中');
assert.equal(ordersApi.getOrderStatus(first, '2026-11-11'), '已离店');
assert.equal(ordersApi.getOrderStatus({ ...first, arrivalDate: '2026-11-12' }, '2026-11-09'), '待入住');

ordersApi.saveOrder({ ...first, customerName: '已修改' });
assert.equal(ordersApi.getOrders().length, 1);
assert.equal(ordersApi.getOrders()[0].customerName, '已修改');

const backup = ordersApi.makeBackup([first, { ...first, id: 'order-2' }]);
assert.equal(ordersApi.parseBackup(JSON.stringify(backup)).length, 2);
assert.throws(() => ordersApi.parseBackup('{"bad":true}'), /不是有效的订单备份/);
ordersApi.mergeOrders(ordersApi.parseBackup(backup));
assert.deepEqual(new Set(ordersApi.getOrders().map((order) => order.id)), new Set(['order-1', 'order-2']));
assert.equal(ordersApi.getOrders().find((order) => order.id === 'order-1').customerName, '测试客户');

ordersApi.deleteOrder('order-2');
assert.deepEqual(ordersApi.getOrders().map((order) => order.id), ['order-1']);

store.set(ordersApi.STORAGE_KEY, [{
  id: 'legacy-order',
  hotelName: '旧旅店',
  orderTitle: '旧平台订单',
  base: '旧基地',
  customerName: '旧客人',
  phone: '12345678',
  arrivalDate: '2026-11-09',
  nights: 2,
  adults: 2,
  children: 2,
  roomType: '亲子房',
  mealIncluded: '是',
  feeDetails: '旧费用说明',
  totalAmount: 1260,
  receivedAmount: 600,
  createdAt: '2026-11-01T08:00:00.000Z'
}]);
const migrated = ordersApi.getOrders()[0];
assert.equal(migrated.hotelOrder, '旧旅店：旧平台订单');
assert.equal(migrated.guestCount, '2大2小');
assert.equal(migrated.feeDetails, '旧费用说明');
assert.equal('totalAmount' in migrated, false);
assert.equal('paymentMethod' in migrated, false);

console.log('PASS local CRUD, stay status, backup merge, and legacy-data migration');
