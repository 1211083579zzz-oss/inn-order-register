(function (root) {
  'use strict';

  const DATA_KEY = 'inn-order-data-v2';
  const LEGACY_KEY = 'inn-order-records-v1';
  const APP = 'wechat-inn-orders';
  const text = value => String(value ?? '').trim();
  const identifier = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const nameKey = value => text(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ');

  function normalizeOrder(order) {
    return {
      id: text(order.id) || identifier('ord'),
      companyId: text(order.companyId),
      hotelOrder: text(order.hotelOrder || [order.hotelName, order.orderTitle || order.orderSource].filter(Boolean).join('：')),
      base: text(order.base), customerName: text(order.customerName), phone: text(order.phone),
      arrivalDate: text(order.arrivalDate), nights: Math.max(1, Number(order.nights) || 1),
      guestCount: text(order.guestCount || `${Number(order.adults || 0)}大${Number(order.children || 0)}小`),
      roomType: text(order.roomType), mealIncluded: order.mealIncluded === '是' ? '是' : '否',
      feeDetails: text(order.feeDetails),
      createdAt: order.createdAt || new Date().toISOString(),
      updatedAt: order.updatedAt || order.createdAt || new Date().toISOString()
    };
  }

  function normalizeCompany(company) {
    return {
      id: text(company.id) || identifier('co'), name: text(company.name), category: text(company.category),
      contact: text(company.contact), phone: text(company.phone), notes: text(company.notes),
      createdAt: company.createdAt || new Date().toISOString(),
      updatedAt: company.updatedAt || company.createdAt || new Date().toISOString()
    };
  }

  function createStore(storage) {
    function commit(data) {
      storage.setItem(DATA_KEY, JSON.stringify(data));
      if (typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') root.dispatchEvent(new root.CustomEvent('innrecordschange'));
      return data;
    }

    function read() {
      const raw = storage.getItem(DATA_KEY);
      if (raw !== null) {
        let value;
        try { value = JSON.parse(raw); } catch { throw new Error('本机记录无法读取，请先保留数据并从备份恢复'); }
        if (!value || value.version !== 2 || !Array.isArray(value.companies) || !Array.isArray(value.orders)) throw new Error('本机数据格式无法识别');
        return value;
      }
      const legacy = storage.getItem(LEGACY_KEY);
      let orders;
      try { orders = legacy === null ? [] : JSON.parse(legacy); } catch { throw new Error('旧登记无法读取，请先保留数据并从备份恢复'); }
      if (!Array.isArray(orders)) throw new Error('旧登记格式无法识别');
      const companies = [];
      const migrated = orders.filter(order => order && typeof order === 'object').map(order => {
        const normalized = normalizeOrder(order);
        const legacyCompany = text(order.company || order.companyName || order.travelCompany);
        if (legacyCompany) {
          let company = companies.find(item => nameKey(item.name) === nameKey(legacyCompany));
          if (!company) { company = normalizeCompany({ name: legacyCompany }); companies.push(company); }
          normalized.companyId = company.id;
        } else if (normalized.companyId && !companies.some(company => company.id === normalized.companyId)) normalized.companyId = '';
        return normalized;
      });
      const data = { version: 2, companies, orders: migrated };
      // One write commits company membership with the stay; the original legacy key remains untouched.
      return commit(data);
    }

    function saveCompany(input) {
      const data = read();
      const company = normalizeCompany(input);
      if (!company.name || company.name.length > 80) throw new Error('请填写 1–80 字的公司名称');
      if (company.category.length > 30 || company.contact.length > 30 || company.notes.length > 200) throw new Error('公司信息超过长度限制');
      if (company.phone && !/^[0-9+\-\s]{6,20}$/.test(company.phone)) throw new Error('请输入有效的公司联系电话');
      if (data.companies.some(item => item.id !== company.id && nameKey(item.name) === nameKey(company.name))) throw new Error('这家公司已经登记，请修改已有档案');
      const existing = data.companies.find(item => item.id === company.id);
      company.createdAt = existing?.createdAt || company.createdAt;
      company.updatedAt = new Date().toISOString();
      commit({ ...data, companies: existing ? data.companies.map(item => item.id === company.id ? company : item) : [...data.companies, company] });
      return company;
    }

    function saveOrders(orders) {
      const data = read();
      const normalized = orders.map(normalizeOrder);
      if (normalized.some(order => order.companyId && !data.companies.some(company => company.id === order.companyId))) throw new Error('所属公司不存在，请重新选择');
      return commit({ ...data, orders: normalized });
    }

    function saveOrder(input, parentCompanyId) {
      const data = read();
      const order = normalizeOrder(input);
      if (!parentCompanyId || order.companyId !== parentCompanyId || !data.companies.some(company => company.id === parentCompanyId)) throw new Error('请先进入旅居公司，再登记该公司的住客');
      const existing = data.orders.find(item => item.id === order.id);
      if (existing?.companyId && existing.companyId !== parentCompanyId) throw new Error('请进入住客所属的旅居公司修改登记');
      order.createdAt = existing?.createdAt || order.createdAt;
      order.updatedAt = new Date().toISOString();
      commit({ ...data, orders: existing ? data.orders.map(item => item.id === order.id ? order : item) : [order, ...data.orders] });
      return order;
    }

    function saveRegistration(input, companyName) {
      const data = read();
      const name = text(companyName);
      if (!name || name.length > 80) throw new Error('请填写 1–80 字的旅居公司名称');
      const limits = { hotelOrder: 80, base: 40, customerName: 30, phone: 20, guestCount: 20, roomType: 30 };
      if (Object.entries(limits).some(([key, limit]) => !text(input[key]) || text(input[key]).length > limit)) throw new Error('请填写完整有效的客户和入住信息');
      if (!/^[0-9+\-\s]{6,20}$/.test(text(input.phone))) throw new Error('请输入有效联系电话');
      if (!Number.isInteger(Number(input.nights)) || Number(input.nights) < 1) throw new Error('入住天数至少为 1 晚');
      const date = new Date(String(input.arrivalDate) + 'T12:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.arrivalDate)) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.arrivalDate) throw new Error('请选择有效的入住日期');
      if (text(input.feeDetails).length > 200) throw new Error('费用明细最多 200 字');
      const company = data.companies.find(item => nameKey(item.name) === nameKey(name)) || normalizeCompany({ name });
      const existing = data.orders.find(item => item.id === input.id);
      const order = normalizeOrder({ ...input, companyId: company.id, createdAt: existing?.createdAt || input.createdAt, updatedAt: new Date().toISOString() });
      const companies = data.companies.some(item => item.id === company.id) ? data.companies : [...data.companies, company];
      const orders = existing ? data.orders.map(item => item.id === order.id ? order : item) : [order, ...data.orders];
      // Company classification and guest must be one write, including offline or quota failures.
      commit({ ...data, companies, orders });
      return order;
    }

    function removeCompany(id) {
      const data = read();
      return commit({ ...data, companies: data.companies.filter(company => company.id !== id), orders: data.orders.map(order => order.companyId === id ? { ...order, companyId: '', updatedAt: new Date().toISOString() } : order) });
    }

    function backup() {
      const data = read();
      return { app: APP, version: 2, exportedAt: new Date().toISOString(), companies: data.companies, orders: data.orders };
    }

    function parseBackup(raw) {
      let value;
      try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new Error('备份格式不正确'); }
      if (!value || value.app !== APP || !Array.isArray(value.orders) || (value.version !== undefined && ![1, 2].includes(value.version))) throw new Error('备份格式不正确');
      if (value.orders.some(order => !order || typeof order !== 'object' || typeof order.id !== 'string' || !order.id)) throw new Error('备份格式不正确');
      if (value.version === 2 && !Array.isArray(value.companies)) throw new Error('公司备份格式不正确');
      if (value.companies !== undefined && (!Array.isArray(value.companies) || value.companies.some(company => !company || typeof company !== 'object' || typeof company.id !== 'string' || !company.id || typeof company.name !== 'string' || !company.name.trim()))) throw new Error('公司备份格式不正确');
      const companies = (value.companies || []).map(normalizeCompany);
      if (new Set(companies.map(company => company.id)).size !== companies.length || new Set(value.orders.map(order => order.id)).size !== value.orders.length) throw new Error('备份含有重复编号');
      return { companies, orders: value.orders.map(normalizeOrder), version: value.version || 1 };
    }

    function mergeBackup(parsed) {
      const data = read();
      const companies = new Map(data.companies.map(company => [company.id, company]));
      const remapped = new Map();
      parsed.companies.forEach(company => {
        const sameName = [...companies.values()].find(existing => existing.id !== company.id && nameKey(existing.name) === nameKey(company.name));
        if (sameName) remapped.set(company.id, sameName.id);
        else companies.set(company.id, company);
      });
      const orders = new Map(data.orders.map(order => [order.id, order]));
      parsed.orders.forEach(input => {
        const order = normalizeOrder(input);
        order.companyId = remapped.get(order.companyId) || order.companyId;
        if (!order.companyId && parsed.version === 1) order.companyId = orders.get(order.id)?.companyId || '';
        if (order.companyId && !companies.has(order.companyId)) order.companyId = '';
        orders.set(order.id, order);
      });
      return commit({ version: 2, companies: [...companies.values()], orders: [...orders.values()] });
    }

    return { read, saveCompany, saveOrder, saveOrders, saveRegistration, removeCompany, backup, parseBackup, mergeBackup };
  }

  const api = { DATA_KEY, LEGACY_KEY, APP, createStore, normalizeOrder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InnStorage = api;
}(typeof window !== 'undefined' ? window : globalThis));
