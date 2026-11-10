(function (root) {
  'use strict';
  const core = typeof module === 'object' && module.exports ? require('./sync-core.js') : root.InnSyncCore;
  const DATA = 'inn-order-data-v2', META = 'inn-order-sync-v1';
  const canonical = value => JSON.stringify(value, function (key, item) {
    return item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item;
  });
  const equal = (a, b) => canonical(a) === canonical(b);

  function endpointOf(value) {
    if (!value) return '';
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('同步服务必须使用 HTTPS');
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('同步服务地址格式不正确');
    return url.origin;
  }

  function createClient({ storage, endpoint, onChange = () => {}, onStatus = () => {}, fetcher = (...args) => fetch(...args) }) {
    const configured = endpointOf(endpoint);
    let session = null, keys = null, status = { state: configured ? 'local' : 'unconfigured' }, running = null, pending = false, epoch = 0, timer;
    const requests = new Set();
    try {
      const value = JSON.parse(storage.getItem(META) || 'null');
      if (value) {
        if (value.version !== 1 || endpointOf(value.endpoint) !== configured || !/^[A-Za-z0-9_-]{16}$/.test(value.actor)) throw new Error('同步设置需要重新连接');
        core.validate(value.document);
        if (value.pendingProjection && equal(JSON.parse(storage.getItem(DATA)), value.pendingProjection)) value.mirror = value.pendingProjection;
        delete value.pendingProjection;
        session = value;
      }
    } catch (error) { status = { state: 'error', message: error.message, recovery: true }; }

    const local = () => {
      const data = JSON.parse(storage.getItem(DATA) || 'null');
      if (!data || data.version !== 2 || !Array.isArray(data.companies) || !Array.isArray(data.orders)) throw new Error('请先保留并检查本机登记数据');
      return data;
    };
    const persist = () => storage.setItem(META, JSON.stringify(session));
    function report(state, message = '') {
      const conflicts = session ? core.project(session.document).conflicts : [];
      status = { state, message, connected: Boolean(session), lastSync: session?.lastSync || '', conflicts, pending: Boolean(session?.dirty), configured: Boolean(configured) };
      onStatus(status);
    }
    function capture() {
      const data = local();
      const next = core.capture(session.document, session.mirror, data, session.actor);
      if (!equal(next, session.document)) { session.document = next; session.dirty = true; }
      session.mirror = data; persist();
    }
    function apply() {
      const projection = core.project(session.document);
      if (!equal(projection.data, local())) {
        session.pendingProjection = projection.data; persist();
        storage.setItem(DATA, JSON.stringify(projection.data));
        session.mirror = projection.data; delete session.pendingProjection; persist();
        onChange(projection.data);
      }
    }
    async function request(method, credentials, body) {
      const abort = new AbortController(); requests.add(abort);
      const timeout = setTimeout(() => abort.abort(), 15000);
      try {
        const response = await fetcher(configured + '/v1/spaces/' + credentials.room, {
          method, headers: { Authorization: 'Bearer ' + credentials.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined, signal: abort.signal, credentials: 'omit', redirect: 'error', cache: 'no-store'
        });
        const result = await response.json();
        if ([200, 201, 404, 409].includes(response.status)) return { status: response.status, ...result };
        if (response.status === 401) throw new Error('配对码无法访问该空间，请重新连接');
        if (response.status === 413) throw new Error('同步空间已满，请先导出备份');
        throw new Error('同步服务暂时不可用，本机登记已保留');
      } finally { clearTimeout(timeout); requests.delete(abort); }
    }
    async function synchronize() {
      if (!session || !configured) return;
      if (running) { pending = true; return running; }
      const operationEpoch = epoch;
      running = (async () => {
        try {
          keys ||= await core.derive(session.code);
          report('syncing');
          for (let attempt = 0; attempt < 5; attempt++) {
            if (operationEpoch !== epoch) return;
            capture();
            const remote = await request('GET', keys);
            if (operationEpoch !== epoch) return;
            if (remote.status === 404 && !session.allowCreate) throw new Error('同步空间不存在，本机数据已保留');
            if (remote.status !== 200 && remote.status !== 404) throw new Error('同步空间暂时无法读取');
            const cloud = remote.status === 200 ? await core.decrypt(remote.envelope, keys) : core.empty();
            if (operationEpoch !== epoch) return;
            capture();
            session.document = core.merge(session.document, cloud); apply();
            let revision = remote.revision || 0;
            const sent = session.document;
            if (!equal(sent, cloud) || remote.status === 404) {
              const envelope = await core.encrypt(sent, keys);
              if (operationEpoch !== epoch) return;
              const response = await request('PUT', keys, { expectedRevision: revision, envelope });
              if (operationEpoch !== epoch) return;
              if (response.status === 409) continue;
              if (![200, 201].includes(response.status)) throw new Error('同步未完成，本机登记已保留');
              revision = response.revision;
            }
            capture(); session.dirty = !equal(sent, session.document);
            session.revision = revision; session.allowCreate = false; session.lastSync = new Date().toISOString(); persist();
            report(core.project(session.document).conflicts.length ? 'conflict' : session.dirty ? 'pending' : 'synced');
            if (session.dirty) continue;
            return;
          }
          report('pending', '其他设备正在更新，稍后会自动重试');
        } catch (error) {
          if (operationEpoch === epoch) report('error', /fetch|network|abort|load failed/i.test(error.message) ? '暂时无法联网，修改已保存在本机' : error.message);
        }
      })().finally(() => {
        running = null;
        if (pending && session) { pending = false; schedule(1000); }
      });
      return running;
    }
    function schedule(delay = 700) {
      if (!session) return;
      clearTimeout(timer);
      try { capture(); report('pending'); } catch (error) { report('error', error.message); return; }
      timer = setTimeout(synchronize, delay);
    }
    async function connect(code, create = false) {
      if (!configured) throw new Error('同步服务尚未连接');
      if (session) throw new Error('此设备已经连接同步空间');
      const credentials = await core.derive(code);
      const remote = await request('GET', credentials);
      if (!create && remote.status === 404) throw new Error('未找到这个同步空间，请检查配对码');
      if (create && remote.status !== 404) throw new Error('空间已存在，请使用加入空间');
      const cloud = remote.status === 200 ? await core.decrypt(remote.envelope, credentials) : core.empty();
      const actor = core.random(12), data = local();
      session = { version: 1, endpoint: configured, code: credentials.code, actor, document: core.merge(core.capture(core.empty(), core.emptyData(), data, actor), cloud), mirror: data, dirty: true, allowCreate: create, revision: remote.revision || 0, lastSync: '' };
      keys = credentials; persist(); apply(); await synchronize();
      return status;
    }
    function disconnect() {
      epoch++; for (const request of requests) request.abort();
      clearTimeout(timer); session = null; keys = null; pending = false; storage.removeItem(META); report(configured ? 'local' : 'unconfigured');
    }
    async function resolveChoices(choices) {
      if (!session) return;
      capture();
      const conflicts = core.project(session.document).conflicts;
      for (const { index, dot } of choices) {
        const conflict = conflicts[index], choice = conflict?.choices.find(value => value.dot === dot);
        if (!choice) throw new Error('修改内容已更新，请重新选择');
        session.document = core.resolve(session.document, conflict, choice.value, session.actor);
      }
      session.dirty = true; apply(); persist(); await synchronize();
    }
    function start() { if (session) synchronize(); else onStatus(status); }
    return { start, connect, synchronize, schedule, disconnect, resolveChoices, status: () => status, connected: () => Boolean(session), pairingCode: () => session?.code || '', configured: () => Boolean(configured), document: () => session?.document || null };
  }
  const api = { createClient, META_KEY: META };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.InnCloudSync = api;
}(typeof window === 'undefined' ? globalThis : window));
