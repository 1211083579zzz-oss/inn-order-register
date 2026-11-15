(function () {
  'use strict';
  const core = window.InnBills, store = window.InnStorage.createStore(localStorage), panel = document.getElementById('company-billing');
  const element = name => document.getElementById('bill-' + name);
  const endpoint = window.InnCloudConfig.endpoint;
  let selectedCompany = null, busy = false, timer, running = false, pending = false;
  const nowMonth = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; };
  element('month').value = nowMonth();
  const data = () => { const value = store.read(); return { ...value, orders: value.orders.map(window.InnStorage.normalizeOrder) }; };
  const link = grant => { const url = new URL('bill.html', location.href); url.search = '?v=company-bills-25'; url.hash = 'b=' + grant.seed; return url.href; };
  const message = (text, error = false) => { element('status').textContent = text; element('status').classList.toggle('bill-error', error); };
  function current() { return store.read().companies.find(company => company.id === selectedCompany); }
  function show() {
    const company = current(); panel.hidden = !company;
    if (!company) return;
    try {
      const grant = core.grants(company).find(item => item.month === element('month').value);
      const month = element('month').value;
      const state = busy ? '正在处理' : element('status').classList.contains('bill-error') ? '待处理' : grant?.publishedAt ? '已分享' : '未分享';
      element('entry-summary').textContent = core.monthValid(month) ? `${Number(month.slice(5))}月 · ${state}` : '选择月份 · 对方只读';
      panel.setAttribute('aria-busy', String(busy));
      element('link-wrap').hidden = !grant?.publishedAt;
      element('publish').textContent = busy ? '处理中…' : grant?.publishedAt ? '更新账单' : '生成链接';
      element('publish').disabled = busy || !endpoint;
      element('copy').disabled = busy; element('stop').disabled = busy;
      if (grant?.publishedAt) { element('link').value = link(grant); element('updated').textContent = '已更新于 ' + new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(grant.publishedAt)); }
      else element('link').value = '';
    } catch (error) { message(error.message, true); }
  }
  function saveGrant(companyId, grant, remove = false) {
    const company = store.read().companies.find(item => item.id === companyId);
    if (!company) return;
    const list = core.grants(company).filter(item => item.month !== grant.month);
    if (!remove) list.push(grant);
    if (list.length > 24) throw new Error('最多同时分享24个月的账单，请先停用旧账单');
    store.saveCompany({ ...company, billingShares: JSON.stringify(list) });
  }
  async function request(method, keys, token, body) {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch(endpoint + '/v1/bills/' + keys.id, { method, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: abort.signal, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json();
      if (![200, 201, 404, 409, 410].includes(response.status)) throw new Error('账单未发布成功，请稍后重试；本机登记仍已保存');
      return { status: response.status, ...result };
    } finally { clearTimeout(timeout); }
  }
  async function publish(companyId, supplied, force = false) {
    const keys = await core.derive(supplied.seed);
    for (let attempt = 0; attempt < 3; attempt++) {
      const company = store.read().companies.find(item => item.id === companyId);
      const grant = core.grants(company).find(item => item.seed === supplied.seed);
      if (!company || !grant) return;
      const snapshot = core.project(data(), companyId, grant.month);
      const fingerprint = await core.fingerprint(snapshot);
      if (!force && grant.fingerprint === fingerprint) return;
      const remote = await request('GET', keys, grant.writeToken);
      if (remote.status === 410) { saveGrant(companyId, grant, true); return; }
      if (![200, 404].includes(remote.status)) throw new Error('账单暂时无法更新');
      if (remote.status === 200) {
        const previous = await core.decrypt(remote.envelope, keys);
        const { updatedAt, ...content } = previous;
        if (await core.fingerprint(content) === fingerprint) {
          saveGrant(companyId, { ...grant, publishedAt: updatedAt, fingerprint });
          return;
        }
      }
      const updatedAt = new Date().toISOString();
      const result = await request('PUT', keys, grant.writeToken, { readToken: keys.readToken, expectedRevision: remote.revision || 0, envelope: await core.encrypt({ ...snapshot, updatedAt }, keys) });
      if (result.status === 409) continue;
      if (result.status === 410) { saveGrant(companyId, grant, true); return; }
      if (![200, 201].includes(result.status)) throw new Error('账单未更新，请重试');
      saveGrant(companyId, { ...grant, fingerprint, publishedAt: updatedAt });
      return;
    }
    throw new Error('另一台设备正在更新账单，请稍后重试');
  }
  async function publishAll() {
    if (running) { pending = true; return; }
    if (!endpoint || !navigator.onLine) return;
    running = true;
    try {
      if (window.InnSync?.connected()) {
        await window.InnSync.synchronize();
        if (window.InnSync.status().state !== 'synced') return;
      }
      for (const company of store.read().companies) for (const grant of core.grants(company)) await publish(company.id, grant);
    } catch (error) { if (selectedCompany) message('账单待更新，登记已保存。可点击“更新账单”重试。', true); }
    finally { running = false; show(); if (pending) { pending = false; schedule(); } }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(publishAll, 1000); }
  element('month').addEventListener('input', () => { message(''); show(); });
  element('publish').addEventListener('click', async () => {
    if (busy || !selectedCompany) return;
    busy = true; const companyId = selectedCompany, month = element('month').value; show(); message('正在生成账单…');
    try {
      if (!core.monthValid(month)) throw new Error('请先选择账单月份');
      if (!navigator.onLine) throw new Error('联网后才能生成可分享的账单；本机登记仍已保存');
      if (window.InnSync?.connected()) { await window.InnSync.synchronize(); if (window.InnSync.status().state !== 'synced') throw new Error('请先完成共享空间同步后再发布账单'); }
      let grant = core.grants(store.read().companies.find(item => item.id === companyId)).find(item => item.month === month);
      if (!grant) { grant = { month, seed: core.random(), writeToken: core.random() }; saveGrant(companyId, grant); }
      await publish(companyId, grant, true); message('账单已发布，对方只能查看这家公司所选月份的账单。');
    } catch (error) { message(error.message, true); }
    finally { busy = false; show(); }
  });
  element('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(element('link').value); message('只读链接已复制，可以发给旅居公司。'); }
    catch { element('link').focus(); element('link').select(); message(document.execCommand('copy') ? '只读链接已复制。' : '请长按链接选择复制。'); }
  });
  element('stop').addEventListener('click', async () => {
    if (busy || !confirm('停用后，对方将无法再打开这条账单链接。确定停用？')) return;
    const companyId = selectedCompany, grant = core.grants(current()).find(item => item.month === element('month').value);
    if (!grant) return;
    busy = true; show();
    try { const result = await request('DELETE', await core.derive(grant.seed), grant.writeToken); if (![200, 410].includes(result.status)) throw new Error('链接暂未停用，请稍后重试'); saveGrant(companyId, grant, true); message('链接已停用，对方不能再打开。已查看或另行保存的内容无法收回。'); }
    catch (error) { message(error.message, true); }
    finally { busy = false; show(); }
  });
  for (const event of ['innrecordschange', 'innsyncdata']) window.addEventListener(event, () => { show(); schedule(); });
  window.addEventListener('online', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  window.addEventListener('innviewchange', event => { if (!event.detail.id) panel.open = false; });
  window.InnBillOwner = { show(companyId) { if (selectedCompany !== companyId) { selectedCompany = companyId; panel.open = false; element('month').value = nowMonth(); message(''); } show(); }, refresh: publishAll };
  schedule();
}());
