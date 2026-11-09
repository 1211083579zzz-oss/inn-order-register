const STORAGE_KEY = 'inn-order-records-v1';
const BACKUP_VERSION = 1;

function getOrders() {
  const value = wx.getStorageSync(STORAGE_KEY);
  return Array.isArray(value) ? value : [];
}

function setOrders(orders) {
  wx.setStorageSync(STORAGE_KEY, orders);
  return orders;
}

function saveOrder(order) {
  const orders = getOrders();
  const index = orders.findIndex((item) => item.id === order.id);
  const next = orders.slice();
  if (index === -1) {
    next.unshift(order);
  } else {
    next[index] = order;
  }
  return setOrders(next);
}

function deleteOrder(id) {
  return setOrders(getOrders().filter((item) => item.id !== id));
}

function dateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value, days) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + Number(days || 0));
  return dateString(date);
}

function getOrderStatus(order, today) {
  const current = today || dateString(new Date());
  const checkout = order.checkoutDate || addDays(order.arrivalDate, order.nights);
  if (!order.arrivalDate || !checkout) return '待入住';
  if (current < order.arrivalDate) return '待入住';
  if (current >= checkout) return '已离店';
  return '入住中';
}

function makeBackup(orders) {
  return {
    app: 'wechat-inn-orders',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    orders
  };
}

function parseBackup(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!value || value.app !== 'wechat-inn-orders' || !Array.isArray(value.orders)) {
    throw new Error('剪贴板内容不是有效的订单备份');
  }
  const validOrders = value.orders.filter((order) =>
    order && typeof order.id === 'string' && typeof order.customerName === 'string'
  );
  if (validOrders.length !== value.orders.length) {
    throw new Error('备份中包含无法识别的订单');
  }
  return validOrders;
}

function mergeOrders(imported) {
  const merged = new Map(getOrders().map((order) => [order.id, order]));
  imported.forEach((order) => merged.set(order.id, order));
  return setOrders(Array.from(merged.values()).sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  ));
}

module.exports = {
  STORAGE_KEY,
  addDays,
  dateString,
  deleteOrder,
  getOrderStatus,
  getOrders,
  makeBackup,
  mergeOrders,
  parseBackup,
  saveOrder
};
