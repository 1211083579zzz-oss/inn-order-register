(function (root) {
  'use strict';
  const fields = {
    companies: ['name', 'category', 'contact', 'phone', 'notes', 'createdAt', 'updatedAt'],
    orders: ['companyId', 'hotelOrder', 'base', 'anchorName', 'customerName', 'phone', 'arrivalDate', 'departureDate', 'nights', 'guestCount', 'roomType', 'mealIncluded', 'feeDetails', 'createdAt', 'updatedAt']
  };
  const labels = { name: '公司名称', category: '分类', contact: '联系人', phone: '电话', notes: '备注', companyId: '所属公司', hotelOrder: '旅店/订单', base: '入住基地', anchorName: '登记主播', customerName: '姓名', arrivalDate: '入住日期', departureDate: '离店日期', nights: '入住天数', guestCount: '入住人数', roomType: '房型', mealIncluded: '含餐', feeDetails: '费用明细', $deleted: '删除状态' };
  const clone = value => JSON.parse(JSON.stringify(value));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const nameKey = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const emptyData = () => ({ version: 2, companies: [], orders: [] });
  const empty = () => ({ version: 1, clock: {}, companies: {}, orders: {} });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const safeId = value => typeof value === 'string' && value.length > 0 && value.length <= 250 && !['__proto__', 'constructor', 'prototype'].includes(value);

  function dotParts(dot) {
    const match = /^([A-Za-z0-9_-]{16})\.([1-9]\d*)$/.exec(dot);
    if (!match || !Number.isSafeInteger(Number(match[2]))) throw new Error('同步版本格式不正确');
    return [match[1], Number(match[2])];
  }

  function maxClock(a, b) {
    const result = { ...a };
    Object.entries(b || {}).forEach(([actor, counter]) => { result[actor] = Math.max(result[actor] || 0, counter); });
    return result;
  }

  function mergeCell(a = { values: {}, seen: {} }, b = { values: {}, seen: {} }) {
    const values = {};
    for (const [left, right] of [[a, b], [b, a]]) Object.entries(left.values).forEach(([dot, value]) => {
      const [actor, counter] = dotParts(dot);
      if (own(right.values, dot) || counter > (right.seen[actor] || 0)) {
        if (own(values, dot) && !same(values[dot], value)) throw new Error('同步版本冲突，已保留本机数据');
        values[dot] = value;
      }
    });
    return { values, seen: maxClock(a.seen, b.seen) };
  }

  function validate(state) {
    if (!state || state.version !== 1 || !state.clock || !state.companies || !state.orders) throw new Error('同步数据格式不正确');
    for (const [actor, counter] of Object.entries(state.clock)) if (!/^[A-Za-z0-9_-]{16}$/.test(actor) || !Number.isSafeInteger(counter) || counter < 0) throw new Error('同步计数格式不正确');
    for (const kind of Object.keys(fields)) {
      if (Object.keys(state[kind]).length > 10000) throw new Error('同步记录数量超出限制');
      for (const [id, record] of Object.entries(state[kind])) {
        if (!safeId(id) || !record?.fields) throw new Error('同步记录编号不正确');
        for (const [field, cell] of Object.entries(record.fields)) {
          if (![...fields[kind], '$deleted'].includes(field) || !cell?.values || !cell.seen) throw new Error('同步字段不正确');
          for (const [actor, count] of Object.entries(cell.seen)) if (!/^[A-Za-z0-9_-]{16}$/.test(actor) || !Number.isSafeInteger(count) || count < 0 || count > (state.clock[actor] || 0)) throw new Error('同步字段版本不正确');
          for (const [dot, value] of Object.entries(cell.values)) {
            const [actor, count] = dotParts(dot);
            if ((cell.seen[actor] || 0) < count || !['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'string' && value.length > 10000)) throw new Error('同步字段内容不正确');
          }
        }
      }
    }
    return state;
  }

  function merge(a, b) {
    validate(a); validate(b);
    const state = empty(); state.clock = maxClock(a.clock, b.clock);
    for (const kind of Object.keys(fields)) for (const id of new Set([...Object.keys(a[kind]), ...Object.keys(b[kind])])) {
      const left = a[kind][id]?.fields || {}, right = b[kind][id]?.fields || {}, record = { fields: {} };
      for (const field of new Set([...Object.keys(left), ...Object.keys(right)])) record.fields[field] = mergeCell(left[field], right[field]);
      state[kind][id] = record;
    }
    return state;
  }

  function values(cell) {
    return Object.entries(cell?.values || {}).sort(([a], [b]) => {
      const [aa, an] = dotParts(a), [ba, bn] = dotParts(b); return an - bn || aa.localeCompare(ba);
    });
  }
  function valueOf(cell, fallback = '') { return values(cell).at(-1)?.[1] ?? fallback; }
  function deleted(record) { return Object.values(record?.fields.$deleted?.values || {}).some(value => value === true); }
  function recordValue(id, record, kind) {
    const value = { id };
    for (const field of fields[kind]) value[field] = valueOf(record.fields[field], field === 'nights' ? 1 : '');
    return value;
  }

  function project(state) {
    validate(state);
    const data = emptyData(), conflicts = [], aliases = new Map(), groups = new Map();
    for (const id of Object.keys(state.companies).sort()) {
      const record = state.companies[id]; if (deleted(record)) continue;
      const name = nameKey(valueOf(record.fields.name)); if (!name) continue;
      if (!groups.has(name)) groups.set(name, []); groups.get(name).push(id);
    }
    function addConflicts(kind, id, combined, targets, title) {
      for (const [field, cell] of Object.entries(combined.fields)) {
        if (['createdAt', 'updatedAt'].includes(field)) continue;
        const choices = values(cell).filter(([, value], index, array) => array.findIndex(([, other]) => same(value, other)) === index);
        if (choices.length > 1) conflicts.push({ kind, id, field, targets, title, label: labels[field] || field, choices: choices.map(([dot, value]) => ({ dot, value })) });
      }
    }
    for (const ids of groups.values()) {
      const id = ids[0], combined = { fields: {} };
      for (const member of ids) {
        aliases.set(member, id);
        for (const [field, cell] of Object.entries(state.companies[member].fields)) combined.fields[field] = mergeCell(combined.fields[field], cell);
      }
      const company = recordValue(id, combined, 'companies'); data.companies.push(company);
      addConflicts('companies', id, combined, ids, company.name);
    }
    for (const id of Object.keys(state.orders).sort()) {
      const record = state.orders[id]; if (deleted(record)) continue;
      const order = recordValue(id, record, 'orders'); order.companyId = aliases.get(order.companyId) || '';
      data.orders.push(order); addConflicts('orders', id, record, [id], order.customerName || order.hotelOrder || '住客登记');
    }
    return { data, conflicts };
  }

  function write(state, actor, kind, ids, field, value) {
    const number = (state.clock[actor] || 0) + 1; state.clock[actor] = number;
    let previous = { values: {}, seen: {} };
    for (const id of ids) previous = mergeCell(previous, state[kind][id]?.fields[field]);
    const cell = { values: { [actor + '.' + number]: value }, seen: { ...previous.seen, [actor]: number } };
    for (const id of ids) {
      if (!own(state[kind], id)) state[kind][id] = { fields: {} };
      state[kind][id].fields[field] = clone(cell);
    }
  }

  function capture(input, before, after, actor) {
    if (!/^[A-Za-z0-9_-]{16}$/.test(actor)) throw new Error('设备编号不正确');
    const state = clone(validate(input));
    for (const kind of Object.keys(fields)) {
      const oldMap = new Map(before[kind].map(value => [value.id, value])), newMap = new Map(after[kind].map(value => [value.id, value]));
      for (const id of new Set([...oldMap.keys(), ...newMap.keys()])) {
        if (!safeId(id)) throw new Error('登记编号不正确');
        const previous = oldMap.get(id), next = newMap.get(id);
        let targets = [id];
        if (kind === 'companies' && previous) targets = [...new Set([id, ...Object.keys(state.companies).filter(other => !deleted(state.companies[other]) && nameKey(valueOf(state.companies[other].fields.name)) === nameKey(previous.name))])];
        if (!next) { write(state, actor, kind, targets, '$deleted', true); continue; }
        if (!previous) write(state, actor, kind, targets, '$deleted', false);
        for (const field of fields[kind]) {
          const value = next[field] ?? (field === 'nights' ? 1 : '');
          if (!previous || !same(previous[field] ?? (field === 'nights' ? 1 : ''), value)) write(state, actor, kind, targets, field, value);
        }
      }
    }
    return state;
  }

  function resolve(state, conflict, choice, actor) {
    const next = clone(validate(state));
    if (!conflict.choices.some(item => same(item.value, choice))) throw new Error('请选择一个已有修改');
    write(next, actor, conflict.kind, conflict.targets, conflict.field, choice);
    return next;
  }

  function base64(bytes) {
    let text = ''; for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unbase64(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('配对码或加密内容格式不正确');
    const text = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(text, char => char.charCodeAt(0));
  }
  function random(size) { return base64(crypto.getRandomValues(new Uint8Array(size))); }
  function code() { return 'INN1-' + random(32); }
  async function derive(input) {
    const normalized = String(input).trim();
    if (!/^INN1-[A-Za-z0-9_-]{43}$/.test(normalized)) throw new Error('配对码格式不正确，请复制完整配对码');
    const seed = unbase64(normalized.slice(5)); if (seed.length !== 32) throw new Error('配对码长度不正确');
    const material = await crypto.subtle.importKey('raw', seed, 'HKDF', false, ['deriveBits', 'deriveKey']);
    const options = purpose => ({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('inn-order-sync-v1'), info: new TextEncoder().encode(purpose) });
    const room = base64(new Uint8Array(await crypto.subtle.deriveBits(options('room'), material, 256)));
    const token = base64(new Uint8Array(await crypto.subtle.deriveBits(options('authorization'), material, 256)));
    const key = await crypto.subtle.deriveKey(options('encryption'), material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return { room, token, key, code: normalized };
  }
  async function encrypt(state, keys) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(validate(state)));
    if (plaintext.length > 600000) throw new Error('同步数据超过当前空间容量，请先导出备份');
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('inn-order-sync-v1') }, keys.key, plaintext);
    return { version: 1, iv: base64(iv), ciphertext: base64(new Uint8Array(encrypted)) };
  }
  async function decrypt(envelope, keys) {
    if (envelope?.version !== 1 || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > 850000) throw new Error('云端加密数据格式不正确');
    const iv = unbase64(envelope.iv); if (iv.length !== 12) throw new Error('云端加密数据格式不正确');
    let plaintext;
    try { plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('inn-order-sync-v1') }, keys.key, unbase64(envelope.ciphertext)); }
    catch { throw new Error('配对码无法解密该空间，已保留本机数据'); }
    return validate(JSON.parse(new TextDecoder().decode(plaintext)));
  }

  const api = { empty, emptyData, merge, project, capture, resolve, validate, code, derive, encrypt, decrypt, random };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.InnSyncCore = api;
}(typeof window === 'undefined' ? globalThis : window));
