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

console.log('PASS local CRUD, stay status, backup validation, and merge behavior');
