(function () {
  'use strict';
  const core = window.InnBills, money = window.InnMoney, el = id => document.getElementById('bill-' + id);
  const seed = new URLSearchParams(location.hash.slice(1)).get('b');
  let bill, running = false;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const amount = value => value === '' ? '待补金额' : money.format(value);
  function clear(message) {
    bill = null; el('company').textContent = '公司对账单'; el('timestamp').textContent = '';
    el('figures').hidden = true; el('figures').replaceChildren(); el('details').hidden = true; el('orders').replaceChildren();
    el('view-status').hidden = false; el('view-status').textContent = message;
  }
  function renderOrders() {
    if (!bill) return;
    const query = el('search').value.trim().toLocaleLowerCase();
    const orders = bill.orders.filter(order => [order.customerName, order.anchorName, order.hotelOrder, order.base].join(' ').toLocaleLowerCase().includes(query));
    el('order-count').textContent = `${orders.length} 单`;
    el('orders').innerHTML = orders.map(order => {
      const deduction = order.commissionCents !== '' ? order.commissionCents : order.legacyCostCents;
      const net = order.incomeCents === '' || deduction === '' ? '' : order.incomeCents - deduction;
      const details = [['主播', order.anchorName || '未填写'], ['旅店 / 订单', order.hotelOrder], ['入住基地', order.base], ['离店日期', order.departureDate], ['房型 / 人数', `${order.roomType} · ${order.guestCount}`], ['收款金额', amount(order.incomeCents)], ['提点比例', order.rateBps === '' ? '未填写' : money.rateInput(order.rateBps) + '%'], ['提点金额', amount(order.commissionCents)], ...(order.legacyCostCents !== '' ? [['历史支出', amount(order.legacyCostCents)]] : []), ['扣除后金额', net === '' ? '待补金额' : money.format(net)]];
      return `<details class="bill-order"><summary><span><strong>${escape(order.customerName)}</strong><span>${escape(order.arrivalDate)} 入住 · ${escape(order.nights)} 晚</span></span><span class="bill-order-amount">${escape(amount(order.incomeCents))}<span aria-hidden="true">⌄</span></span></summary><dl>${details.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></details>`;
    }).join('') || `<p class="bill-empty">${query ? '没有匹配的账单明细' : '这个月份暂无登记订单'}</p>`;
  }
  function render() {
    const totals = core.totals(bill);
    document.title = bill.companyName + ' · ' + bill.month + '账单';
    el('period').textContent = bill.month.replace('-', '年') + '月 · 登记账单'; el('company').textContent = bill.companyName;
    el('timestamp').textContent = bill.updatedAt ? '更新于 ' + new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(bill.updatedAt)) : '';
    el('figures').hidden = false; el('details').hidden = false;
    el('figures').innerHTML = `<dl><div><dt>收款合计</dt><dd data-bill-income data-cents="${totals.income}">${money.format(totals.income)}</dd></div><div><dt>提点合计</dt><dd data-bill-commission data-cents="${totals.commission}">${money.format(totals.commission)}</dd></div><div class="bill-net"><dt>扣除后金额</dt><dd data-bill-net data-cents="${totals.net}">${money.format(totals.net)}</dd></div></dl><p>${totals.count} 单${totals.pending ? ` · ${totals.pending} 单金额待补，未填金额暂不计入合计` : ''}${totals.legacy ? ` · 另扣历史支出 ${money.format(totals.legacy)}` : ''}</p>`;
    renderOrders();
  }
  async function refresh() {
    if (running) return;
    running = true; el('refresh').disabled = true;
    try {
      const keys = await core.derive(seed), abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 15000);
      let response;
      try { response = await fetch(window.InnCloudConfig.endpoint + '/v1/bills/' + keys.id, { headers: { Authorization: 'Bearer ' + keys.readToken }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: abort.signal }); }
      finally { clearTimeout(timeout); }
      if ([401, 403, 404, 410].includes(response.status)) { clear(response.status === 410 ? '这条账单链接已停用，请联系账单发送方。' : '账单链接无效或账单尚未发布，请联系账单发送方。'); return; }
      if (!response.ok) throw new Error('账单暂时无法读取，请稍后刷新。');
      bill = await core.decrypt((await response.json()).envelope, keys);
      render(); el('view-status').hidden = true;
    } catch (error) {
      if (!bill) clear(core.validSecret(seed) ? '暂时无法读取账单，请联网后刷新；或联系账单发送方。' : '账单链接不完整，请使用发送方提供的完整链接。');
      else { el('view-status').hidden = false; el('view-status').textContent = '暂时无法刷新，当前显示上次读取的账单。'; }
    } finally { running = false; el('refresh').disabled = false; }
  }
  el('search').addEventListener('input', renderOrders); el('refresh').addEventListener('click', refresh);
  window.addEventListener('online', refresh); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  refresh();
}());
