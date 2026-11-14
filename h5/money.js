(function (root) {
  'use strict';
  const MAX_CENTS = 9999999999;
  function cents(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) throw new Error('金额最多 8 位整数、2 位小数，且不能为负数');
    return value;
  }
  function parse(value) {
    const text = String(value ?? '').trim().normalize('NFKC');
    if (!text) return '';
    if (!/^(?:\d{1,8}(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)) throw new Error('金额最多 8 位整数、2 位小数，且不能为负数');
    const [whole, fraction = ''] = text.split('.');
    return cents(Number(whole || 0) * 100 + Number(fraction.padEnd(2, '0')));
  }
  function input(value) {
    const number = cents(value);
    return number === '' ? '' : `${Math.floor(number / 100)}.${String(number % 100).padStart(2, '0')}`;
  }
  function format(value) {
    if (!Number.isSafeInteger(value)) throw new Error('金额格式不正确');
    const absolute = Math.abs(value);
    return `${value < 0 ? '−' : ''}¥${Math.floor(absolute / 100).toLocaleString('zh-CN')}.${String(absolute % 100).padStart(2, '0')}`;
  }
  function summarize(orders) {
    const result = { income: 0, cost: 0, net: 0, incomeCount: 0, costCount: 0, pendingCount: 0, count: orders.length };
    orders.forEach(order => {
      const income = cents(order.incomeCents), cost = cents(order.costCents);
      if (income !== '') { result.income += income; result.incomeCount++; }
      if (cost !== '') { result.cost += cost; result.costCount++; }
      if (income === '' || cost === '') result.pendingCount++;
    });
    result.net = result.income - result.cost;
    return result;
  }
  function display(summary, key) {
    const known = !summary.count || (key === 'net' ? summary.incomeCount + summary.costCount : summary[key + 'Count']);
    return known ? format(summary[key]) : '待补金额';
  }
  const api = { MAX_CENTS, cents, parse, input, format, summarize, display };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InnMoney = api;
}(typeof window === 'undefined' ? globalThis : window));
