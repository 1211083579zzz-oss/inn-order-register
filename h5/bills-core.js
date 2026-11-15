(function (root) {
  'use strict';
  const money = typeof module === 'object' && module.exports ? require('./money.js') : root.InnMoney;
  const validSecret = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
  const base64 = bytes => { let text = ''; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const bytes = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  const random = () => base64(crypto.getRandomValues(new Uint8Array(32)));
  const encoder = new TextEncoder();
  const monthOf = order => { const date = new Date(order.createdAt); return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : ''; };
  const monthValid = month => /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month);
  const fingerprint = async value => base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value)))));
  async function derive(seed) {
    if (!validSecret(seed)) throw new Error('账单链接不完整，请使用完整链接打开');
    const raw = bytes(seed); if (raw.length !== 32 || base64(raw) !== seed) throw new Error('账单链接格式不正确');
    const material = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits', 'deriveKey']);
    const options = purpose => ({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('inn-readonly-bill-v1'), info: encoder.encode(purpose) });
    const id = base64(new Uint8Array(await crypto.subtle.deriveBits(options('bill-id'), material, 256)));
    const readToken = base64(new Uint8Array(await crypto.subtle.deriveBits(options('read-only'), material, 256)));
    const key = await crypto.subtle.deriveKey(options('encryption'), material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return { id, readToken, key };
  }
  function project(data, companyId, month) {
    if (!monthValid(month)) throw new Error('请选择有效账单月份');
    const company = data.companies.find(item => item.id === companyId);
    if (!company) throw new Error('请先选择一家旅居公司');
    const orders = data.orders.filter(order => order.companyId === companyId && monthOf(order) === month).slice().sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate) || a.id.localeCompare(b.id));
    return {
      version: 1, companyName: company.name, month,
      orders: orders.map(order => ({ id: order.id, customerName: order.customerName, hotelOrder: order.hotelOrder, base: order.base, anchorName: order.anchorName || '', arrivalDate: order.arrivalDate, departureDate: order.departureDate, nights: order.nights, guestCount: order.guestCount, roomType: order.roomType,
        incomeCents: money.cents(order.incomeCents), rateBps: money.basisPoints(order.commissionRateBps), commissionCents: money.commission(order.incomeCents, order.commissionRateBps), legacyCostCents: money.basisPoints(order.commissionRateBps) === '' ? money.cents(order.costCents) : '' }))
    };
  }
  function validate(value) {
    if (!value || value.version !== 1 || typeof value.companyName !== 'string' || value.companyName.length > 80 || !monthValid(value.month) || !Array.isArray(value.orders) || value.orders.length > 10000) throw new Error('账单内容格式不正确');
    for (const order of value.orders) {
      for (const field of ['id', 'customerName', 'hotelOrder', 'base', 'anchorName', 'arrivalDate', 'departureDate', 'guestCount', 'roomType']) if (typeof order[field] !== 'string' || order[field].length > 250) throw new Error('账单明细格式不正确');
      if (!Number.isInteger(order.nights) || order.nights < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(order.arrivalDate) || !/^\d{4}-\d{2}-\d{2}$/.test(order.departureDate)) throw new Error('账单入住日期不正确');
      money.cents(order.incomeCents); money.cents(order.commissionCents); money.cents(order.legacyCostCents); money.basisPoints(order.rateBps);
      if (money.commission(order.incomeCents, order.rateBps) !== order.commissionCents) throw new Error('账单提点金额不一致');
    }
    return value;
  }
  async function encrypt(value, keys) {
    const data = encoder.encode(JSON.stringify(validate(value)));
    if (data.length > 600000) throw new Error('本月账单过大，请减少单个账单的记录');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return { version: 1, iv: base64(iv), ciphertext: base64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('inn-readonly-bill-v1') }, keys.key, data))) };
  }
  async function decrypt(envelope, keys) {
    if (envelope?.version !== 1 || typeof envelope.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(envelope.iv) || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > 850000 || !/^[A-Za-z0-9_-]+$/.test(envelope.ciphertext)) throw new Error('账单格式不正确');
    try { return validate(JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(envelope.iv), additionalData: encoder.encode('inn-readonly-bill-v1') }, keys.key, bytes(envelope.ciphertext))))); }
    catch { throw new Error('账单链接无法解密，请联系账单发送方'); }
  }
  function totals(bill) {
    const result = { income: 0, commission: 0, legacy: 0, net: 0, pending: 0, count: bill.orders.length };
    for (const order of bill.orders) {
      if (order.incomeCents !== '') result.income += order.incomeCents;
      if (order.commissionCents !== '') result.commission += order.commissionCents;
      if (order.legacyCostCents !== '') result.legacy += order.legacyCostCents;
      if (order.incomeCents === '' || (order.commissionCents === '' && order.legacyCostCents === '')) result.pending++;
    }
    result.net = result.income - result.commission - result.legacy;
    return result;
  }
  function grants(company) {
    if (!company?.billingShares) return [];
    let list; try { list = JSON.parse(company.billingShares); } catch { throw new Error('账单分享设置无法读取，请先保留备份'); }
    if (!Array.isArray(list) || list.length > 24 || list.some(item => !validSecret(item.seed) || !validSecret(item.writeToken) || !monthValid(item.month))) throw new Error('账单分享设置格式不正确');
    return list;
  }
  const api = { random, derive, project, validate, encrypt, decrypt, totals, grants, monthValid, validSecret, fingerprint };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.InnBills = api;
}(typeof window === 'undefined' ? globalThis : window));
