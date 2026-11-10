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

    return { read, saveCompany, saveOrders, removeCompany, backup, parseBackup, mergeBackup };
  }

  const api = { DATA_KEY, LEGACY_KEY, APP, createStore, normalizeOrder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InnStorage = api;
}(typeof window !== 'undefined' ? window : globalThis));
