(function () {
  'use strict';
  const element = id => document.getElementById(id);
  const message = value => { element('sync-error').textContent = value; element('sync-error').hidden = !value; };
  const labels = { unconfigured: '同步服务尚未连接，本机记录正常保存', local: '当前仅保存在本机', syncing: '正在同步…', pending: '已保存在本机，等待同步', synced: '已同步', conflict: '有同时修改的内容需要确认', error: '修改已保存在本机，同步暂未完成' };
  let busy = false, lastConflictView = '';
  const client = window.InnCloudSync.createClient({
    storage: localStorage, endpoint: window.InnCloudConfig.endpoint,
    onChange() { window.dispatchEvent(new CustomEvent('innsyncdata')); },
    onStatus(status) {
      const time = status.lastSync && new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(status.lastSync));
      element('sync-status').textContent = (status.message || labels[status.state]) + (status.state === 'synced' && time ? ' · ' + time : '');
      element('device-storage-label').textContent = !status.connected ? '本机保存' : status.state === 'synced' ? '已同步' : status.state === 'conflict' ? '待确认' : '本机已存';
      element('sync-setup').hidden = Boolean(status.connected);
      element('sync-connected').hidden = !status.connected;
      element('sync-description').hidden = Boolean(status.connected);
      if (status.connected) element('sync-join-form').hidden = true;
      const conflicts = status.conflicts || [];
      element('sync-conflicts').hidden = !conflicts.length;
      const signature = JSON.stringify(conflicts);
      if (signature !== lastConflictView) {
        lastConflictView = signature;
        element('sync-conflict-fields').replaceChildren();
        conflicts.forEach((conflict, index) => {
          const label = document.createElement('label'); label.className = 'sync-conflict-field';
          const title = document.createElement('span'); title.textContent = conflict.title + ' · ' + conflict.label;
          const select = document.createElement('select'); select.dataset.index = String(index); select.setAttribute('aria-label', title.textContent);
          conflict.choices.forEach(choice => {
            const option = document.createElement('option'); option.value = choice.dot;
            option.textContent = conflict.field === '$deleted' ? choice.value ? '删除这条记录' : '保留这条记录' : String(choice.value || '（空白）');
            select.append(option);
          });
          label.append(title, select); element('sync-conflict-fields').append(label);
        });
      }
      element('sync-create').disabled = busy || !client.configured();
      element('sync-open-join').disabled = busy || !client.configured();
      element('sync-now').disabled = busy || status.state === 'syncing';
    }
  });
  window.InnSync = client;

  async function action(button, operation) {
    if (busy) return;
    busy = true; const previous = button.textContent; button.disabled = true; button.textContent = '正在处理…'; message('');
    try { await operation(); }
    catch (error) { message(error.message || '未能完成，原有记录已保留'); }
    finally { busy = false; button.textContent = previous; button.disabled = false; }
  }
  element('sync-create').addEventListener('click', event => action(event.currentTarget, () => client.connect(window.InnSyncCore.code(), true)));
  element('sync-open-join').addEventListener('click', () => { element('sync-join-form').hidden = false; element('sync-setup').hidden = true; element('sync-code-input').focus(); });
  element('sync-cancel-join').addEventListener('click', () => { element('sync-join-form').hidden = true; element('sync-setup').hidden = false; message(''); });
  element('sync-join-form').addEventListener('submit', event => { event.preventDefault(); action(element('sync-join'), () => client.connect(element('sync-code-input').value)); });
  element('sync-now').addEventListener('click', event => action(event.currentTarget, () => client.synchronize()));
  element('sync-copy-code').addEventListener('click', async () => {
    const code = client.pairingCode();
    try { await navigator.clipboard.writeText(code); element('sync-copy-code').textContent = '配对码已复制'; setTimeout(() => { element('sync-copy-code').textContent = '复制配对码'; }, 2000); }
    catch { element('sync-code-output').value = code; element('sync-code-output').hidden = false; element('sync-code-output').focus(); element('sync-code-output').select(); }
  });
  element('sync-disconnect').addEventListener('click', () => {
    if (confirm('断开后，这台设备保留现有登记，并停止自动同步。确定断开？')) { client.disconnect(); element('sync-code-output').value = ''; element('sync-code-output').hidden = true; }
  });
  element('sync-conflicts').addEventListener('submit', event => {
    event.preventDefault();
    const choices = [...element('sync-conflict-fields').querySelectorAll('select')].map(select => ({ index: Number(select.dataset.index), dot: select.value }));
    action(element('sync-resolve'), () => client.resolveChoices(choices));
  });
  window.addEventListener('innrecordschange', () => client.schedule());
  window.addEventListener('online', () => client.synchronize());
  window.addEventListener('pageshow', () => client.synchronize());
  window.addEventListener('storage', event => { if (event.key === 'inn-order-data-v2') client.schedule(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) client.synchronize(); });
  setInterval(() => { if (!document.hidden) client.synchronize(); }, 20000);
  client.start();
}());
