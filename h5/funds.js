(function (root) {
  'use strict';
  const calendar = typeof module === 'object' && module.exports ? require('./arrivals.js') : root.InnArrivals;
  const shanghai = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });

  function dateAt(value) {
    if (value === null || value === undefined || value === '') return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const parts = Object.fromEntries(shanghai.formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function range(start, end) {
    if (calendar.calendarDay(start) === null || calendar.calendarDay(end) === null) throw new Error('请选择完整的开始日期和结束日期');
    if (start > end) throw new Error('结束日期不能早于开始日期');
    return { start, end };
  }

  function period(key, today, custom) {
    if (calendar.calendarDay(today) === null) throw new Error('统计日期不正确');
    if (key === 'all') return { key, start: '', end: '' };
    if (key === 'custom') return { key, ...range(custom?.start, custom?.end) };
    if (key === 'last7' || key === 'last30') return { key, ...range(calendar.dateAfter(today, key === 'last7' ? -6 : -29), today) };
    let start = today.slice(0, 7) + '-01';
    if (key === 'previous') start = calendar.dateAfter(start, -1).slice(0, 7) + '-01';
    else if (key !== 'month') throw new Error('统计期间不正确');
    return { key, ...range(start, calendar.dateAfter(calendar.dateAfterMonth(start), -1)) };
  }

  function filter(orders, selected) {
    if (selected.key === 'all') return orders.slice();
    return orders.filter(order => {
      // Business dates stay in Shanghai even if a device travels to another timezone.
      const date = dateAt(order.createdAt);
      return date && date >= selected.start && date <= selected.end;
    });
  }

  function nights(order) {
    const start = calendar.calendarDay(order.arrivalDate), end = calendar.calendarDay(calendar.departureDate(order));
    if (start !== null && end !== null && end > start) return end - start;
    const value = Number(order.nights);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  function groupNights(orders) {
    const groups = new Map();
    for (const order of orders) {
      const count = nights(order);
      if (!groups.has(count)) groups.set(count, { nights: count, orders: [], monthCount: 0 });
      const group = groups.get(count);
      group.orders.push(order);
      if (calendar.stayPackage(order) === 'month') group.monthCount++;
    }
    return [...groups.values()].sort((a, b) => (a.nights ?? Infinity) - (b.nights ?? Infinity));
  }

  const api = { dateAt, range, period, filter, nights, groupNights };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InnFunds = api;
}(typeof window === 'undefined' ? globalThis : window));
