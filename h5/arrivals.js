(function (root) {
  'use strict';

  const DAY = 86400000;

  function calendarDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    // Calendar days avoid UTC parsing and 23/25-hour daylight-saving days.
    return date.getTime() / DAY;
  }

  function summarize(data, date) {
    const today = calendarDay(date);
    const companies = new Map(data.companies.map(company => [company.id, company]));
    const arrivals = [], staying = [];
    if (today === null) return { date, arrivals, staying, todayCount: 0, upcomingCount: 0 };
    data.orders.forEach(order => {
      const start = calendarDay(order.arrivalDate);
      if (start === null || (order.companyId && !companies.has(order.companyId))) return;
      const nights = Number(order.nights);
      if (!Number.isInteger(nights) || nights < 1) return;
      const days = start - today;
      const entry = { order, company: companies.get(order.companyId) || null, days, remaining: start + nights - today };
      if (days >= 0 && days <= 3) arrivals.push(entry);
      else if (days < 0 && entry.remaining > 0) staying.push(entry);
    });
    const byName = (a, b) => String(a.order.customerName || '').localeCompare(String(b.order.customerName || ''), 'zh-CN') || String(a.order.id).localeCompare(String(b.order.id));
    arrivals.sort((a, b) => a.days - b.days || byName(a, b));
    staying.sort((a, b) => a.remaining - b.remaining || byName(a, b));
    const todayCount = arrivals.filter(item => item.days === 0).length;
    return { date, arrivals, staying, todayCount, upcomingCount: arrivals.length - todayCount };
  }

  const api = { calendarDay, summarize };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InnArrivals = api;
}(typeof window === 'undefined' ? globalThis : window));
