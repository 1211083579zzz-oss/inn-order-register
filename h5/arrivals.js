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

  function dateAfter(value, nights) {
    const start = calendarDay(value);
    if (start === null || !Number.isSafeInteger(Number(nights))) return '';
    const date = new Date((start + Number(nights)) * DAY);
    if (!Number.isFinite(date.getTime())) return '';
    const result = date.toISOString().slice(0, 10);
    return calendarDay(result) === null ? '' : result;
  }

  function dateAfterMonth(value) {
    if (calendarDay(value) === null) return '';
    const [year, month, day] = value.split('-').map(Number);
    const last = new Date(0);
    last.setUTCHours(0, 0, 0, 0);
    last.setUTCFullYear(year, month + 1, 0);
    const end = new Date(0);
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCFullYear(year, month, Math.min(day, last.getUTCDate()));
    const result = end.toISOString().slice(0, 10);
    return calendarDay(result) === null ? '' : result;
  }

  function packageDeparture(value, key) {
    return key === 'month' ? dateAfterMonth(value) : ['7', '14'].includes(key) ? dateAfter(value, Number(key)) : '';
  }

  function stayPackage(order) {
    const end = departureDate(order), startDay = calendarDay(order.arrivalDate), endDay = calendarDay(end);
    if (startDay === null || endDay === null || endDay <= startDay) return '';
    const days = endDay - startDay;
    if (days === 7 || days === 14) return String(days);
    return dateAfterMonth(order.arrivalDate) === end ? 'month' : '';
  }

  function packageSummary(orders) {
    const result = { '7': 0, '14': 0, month: 0, other: 0 };
    orders.forEach(order => { result[stayPackage(order) || 'other']++; });
    return result;
  }

  function departureDate(order) {
    if (order.departureDate) return String(order.departureDate);
    const nights = Number(order.nights);
    return Number.isInteger(nights) && nights > 0 ? dateAfter(order.arrivalDate, nights) : '';
  }

  function stayState(order, date) {
    const start = calendarDay(order.arrivalDate), end = calendarDay(departureDate(order)), today = calendarDay(date);
    if (start === null || end === null || today === null || end <= start) return { key: 'unknown', label: '待确认' };
    if (today < start) return { key: 'upcoming', label: '待入住' };
    if (today < end) return { key: 'staying', label: '入住中' };
    return { key: 'finished', label: '已离店' };
  }

  function summarize(data, date) {
    const today = calendarDay(date);
    const companies = new Map(data.companies.map(company => [company.id, company]));
    const arrivals = [], staying = [];
    if (today === null) return { date, arrivals, staying, todayCount: 0, upcomingCount: 0 };
    data.orders.forEach(order => {
      const start = calendarDay(order.arrivalDate);
      if (start === null || (order.companyId && !companies.has(order.companyId))) return;
      const end = calendarDay(departureDate(order));
      if (end === null || end <= start) return;
      const days = start - today;
      const entry = { order, company: companies.get(order.companyId) || null, days, remaining: end - today };
      if (days >= 0 && days <= 3) arrivals.push(entry);
      else if (days < 0 && entry.remaining > 0) staying.push(entry);
    });
    const byName = (a, b) => String(a.order.customerName || '').localeCompare(String(b.order.customerName || ''), 'zh-CN') || String(a.order.id).localeCompare(String(b.order.id));
    arrivals.sort((a, b) => a.days - b.days || byName(a, b));
    staying.sort((a, b) => a.remaining - b.remaining || byName(a, b));
    const todayCount = arrivals.filter(item => item.days === 0).length;
    return { date, arrivals, staying, todayCount, upcomingCount: arrivals.length - todayCount };
  }

  const api = { calendarDay, dateAfter, dateAfterMonth, packageDeparture, stayPackage, packageSummary, departureDate, stayState, summarize };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InnArrivals = api;
}(typeof window === 'undefined' ? globalThis : window));
