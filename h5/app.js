(function () {
  'use strict';

  const STORAGE_KEY = 'inn-order-records-v1';
  const BACKUP_APP = 'wechat-inn-orders';
  const today = localDate(new Date());
  let activeFilter = '全部';
  let toastTimer;

  const formOverlay = document.querySelector('#form-overlay');
  const backupOverlay = document.querySelector('#backup-overlay');
  const orderForm = document.querySelector('#order-form');
  const orderList = document.querySelector('#order-list');
  const searchInput = document.querySelector('#search');
  const backupData = document.querySelector('#backup-data');

  function localDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function readOrders() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeOrders(orders) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }

  function money(value) {
    return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2);
  }

  function addDays(dateText, count) {
    const [year, month, day] = String(dateText || '').split('-').map(Number);
    if (!year || !month || !day) return '';
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + Number(count || 0));
    return localDate(date);
  }

  function statusOf(order) {
    const checkout = order.checkoutDate || addDays(order.arrivalDate, order.nights);
    if (!order.arrivalDate || !checkout) return '待入住';
    if (today < order.arrivalDate) return '待入住';
    if (today >= checkout) return '已离店';
    return '入住中';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function showToast(message) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function render() {
    const orders = readOrders();
    const query = searchInput.value.trim().toLocaleLowerCase();
    const visible = orders
      .map((order) => ({ ...order, status: statusOf(order), recordDate: order.recordDate || String(order.createdAt || '').slice(0, 10) }))
      .filter((order) => activeFilter === '全部' || order.status === activeFilter)
      .filter((order) => !query || [
        order.hotelName, order.orderTitle, order.orderSource, order.base, order.company,
        order.anchor, order.customerName, order.phone, order.roomType
      ].join(' ').toLocaleLowerCase().includes(query))
      .sort((a, b) => {
        const rank = { 入住中: 0, 待入住: 1, 已离店: 2 };
        return rank[a.status] - rank[b.status] || String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || ''));
      });

    const outstanding = orders.reduce((sum, order) => sum + Math.max(0, Number(order.totalAmount || 0) - Number(order.receivedAmount || 0)), 0);
    const received = orders.reduce((sum, order) => sum + Number(order.receivedAmount || 0), 0);
    document.querySelector('#month-count').innerHTML = `${orders.filter((order) => String(order.arrivalDate || '').startsWith(today.slice(0, 7))).length}<small> 单</small>`;
    document.querySelector('#outstanding').textContent = `¥${money(outstanding)}`;
    document.querySelector('#received').textContent = `¥${money(received)}`;
    document.querySelector('#order-count').textContent = `${visible.length} 条`;
    document.querySelector('#clear-search').hidden = !searchInput.value;

    if (!visible.length) {
      const hasOrders = orders.length > 0;
      orderList.innerHTML = `<div class="empty-state"><span class="empty-mark">＋</span><strong>${hasOrders ? '没有匹配的订单' : '还没有订单记录'}</strong><span>${hasOrders ? '换个关键词或筛选条件试试' : '新增一条住宿订单开始登记'}</span></div>`;
      return;
    }

    orderList.innerHTML = visible.map((order) => {
      const statusClass = order.status === '入住中' ? 'live' : order.status === '已离店' ? 'done' : 'wait';
      const meta = [order.company, order.anchor ? `主播 ${order.anchor}` : '', order.recordDate ? `登记 ${order.recordDate}` : ''].filter(Boolean);
      return `<article class="order-card" data-id="${escapeHtml(order.id)}">
        <div class="card-top"><strong class="hotel-name">${escapeHtml(order.hotelName || '未填写旅店')}</strong><span class="status status-${statusClass}">${order.status}</span></div>
        <div class="order-subtitle">${escapeHtml(order.orderTitle || order.orderSource || '住宿订单')}${order.base ? ` · ${escapeHtml(order.base)}` : ''}</div>
        ${meta.length ? `<div class="meta-line">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
        <div class="guest-row"><strong class="guest-name">${escapeHtml(order.customerName || '未填写姓名')}</strong>${order.phone ? `<a class="phone-link" data-call href="tel:${encodeURIComponent(order.phone.replace(/[\s-]/g, ''))}">拨打</a>` : ''}</div>
        <div class="detail-grid">
          <div class="detail-item"><span>入住</span>${escapeHtml(order.arrivalDate || '')} · ${escapeHtml(order.nights || 0)}晚</div>
          <div class="detail-item"><span>房型</span>${escapeHtml(order.roomType || '未填写')}</div>
          <div class="detail-item"><span>人数</span>${escapeHtml(order.adults || 0)}大${escapeHtml(order.children || 0)}小</div>
          <div class="detail-item"><span>含餐</span>${escapeHtml(order.mealIncluded || '否')}</div>
        </div>
        <div class="card-footer"><div>已收 <strong class="received-value">¥${money(order.receivedAmount)}</strong><span class="total-value"> / ¥${money(order.totalAmount)}</span></div><span class="open-label">查看详情 ›</span></div>
      </article>`;
    }).join('');
  }

  function openForm(order) {
    orderForm.reset();
    orderForm.elements.recordDate.value = today;
    orderForm.elements.arrivalDate.value = today;
    orderForm.elements.nights.value = '1';
    orderForm.elements.adults.value = '2';
    orderForm.elements.children.value = '0';
    orderForm.elements.mealIncluded.value = '否';
    orderForm.elements.receivedAmount.value = '0';
    orderForm.dataset.id = order ? order.id : '';

    if (order) {
      for (const [key, value] of Object.entries(order)) {
        if (orderForm.elements.namedItem(key)) orderForm.elements[key].value = value ?? '';
      }
      orderForm.elements.recordDate.value = order.recordDate || String(order.createdAt || '').slice(0, 10) || today;
      document.querySelector('#form-title').textContent = '订单详情';
      document.querySelector('#save-order').textContent = '保存修改';
      document.querySelector('#delete-order').hidden = false;
    } else {
      document.querySelector('#form-title').textContent = '新增住宿订单';
      document.querySelector('#save-order').textContent = '保存登记';
      document.querySelector('#delete-order').hidden = true;
    }
    formOverlay.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeOverlay(id) {
    document.querySelector(`#${id}`).hidden = true;
    if (formOverlay.hidden && backupOverlay.hidden) document.body.classList.remove('modal-open');
  }

  function getFormOrder() {
    const data = new FormData(orderForm);
    const values = Object.fromEntries(data.entries());
    const nights = Number(values.nights);
    const adults = Number(values.adults || 0);
    const children = Number(values.children || 0);
    const totalAmount = Number(values.totalAmount);
    const receivedAmount = Number(values.receivedAmount || 0);
    if (!Number.isInteger(nights) || nights < 1) throw new Error('入住晚数至少为 1 晚');
    if (!Number.isInteger(adults) || !Number.isInteger(children) || adults < 0 || children < 0 || adults + children < 1) throw new Error('请检查入住人数');
    if (!Number.isFinite(totalAmount) || totalAmount < 0 || !Number.isFinite(receivedAmount) || receivedAmount < 0) throw new Error('金额需为不小于 0 的数字');

    const old = readOrders().find((order) => order.id === orderForm.dataset.id);
    const now = new Date().toISOString();
    return {
      id: orderForm.dataset.id || `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      hotelName: values.hotelName.trim(),
      orderTitle: values.orderTitle.trim(),
      orderSource: values.orderSource.trim(),
      base: values.base.trim(),
      company: values.company.trim(),
      anchor: values.anchor.trim(),
      recordDate: values.recordDate || today,
      customerName: values.customerName.trim(),
      phone: values.phone.trim(),
      arrivalDate: values.arrivalDate,
      nights,
      checkoutDate: addDays(values.arrivalDate, nights),
      adults,
      children,
      roomType: values.roomType.trim(),
      mealIncluded: values.mealIncluded,
      feeDetails: values.feeDetails.trim(),
      totalAmount: Math.round(totalAmount * 100) / 100,
      receivedAmount: Math.round(receivedAmount * 100) / 100,
      paymentMethod: values.paymentMethod.trim(),
      createdAt: old ? old.createdAt : now,
      updatedAt: now
    };
  }

  function saveOrder(order) {
    const orders = readOrders();
    const index = orders.findIndex((item) => item.id === order.id);
    if (index === -1) orders.unshift(order);
    else orders[index] = order;
    writeOrders(orders);
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    backupData.focus();
    backupData.select();
    return document.execCommand('copy');
  }

  document.querySelector('#today-label').textContent = today.replace(/-/g, '/');
  document.querySelector('#add-order').addEventListener('click', () => openForm());
  document.querySelector('#open-backup').addEventListener('click', () => {
    backupData.value = '';
    backupOverlay.hidden = false;
    document.body.classList.add('modal-open');
  });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeOverlay(button.dataset.close)));
  [formOverlay, backupOverlay].forEach((overlay) => overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeOverlay(overlay.id);
  }));
  document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('.filter').forEach((filter) => filter.classList.toggle('active', filter === button));
    render();
  }));
  searchInput.addEventListener('input', render);
  document.querySelector('#clear-search').addEventListener('click', () => {
    searchInput.value = '';
    render();
    searchInput.focus();
  });
  orderList.addEventListener('click', (event) => {
    if (event.target.closest('[data-call]')) return;
    const card = event.target.closest('[data-id]');
    if (!card) return;
    const order = readOrders().find((item) => item.id === card.dataset.id);
    if (order) openForm(order);
  });

  orderForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!orderForm.reportValidity()) return;
    try {
      saveOrder(getFormOrder());
      closeOverlay('form-overlay');
      render();
      showToast('登记已保存');
    } catch (error) {
      showToast(error.message || '保存失败，请检查本机存储空间');
    }
  });

  document.querySelector('#delete-order').addEventListener('click', () => {
    if (!window.confirm('删除后无法从本机恢复，确认删除这条登记吗？')) return;
    writeOrders(readOrders().filter((order) => order.id !== orderForm.dataset.id));
    closeOverlay('form-overlay');
    render();
    showToast('已删除');
  });

  document.querySelector('#copy-backup').addEventListener('click', async () => {
    const backup = JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), orders: readOrders() });
    backupData.value = backup;
    try {
      const copied = await copyText(backup);
      showToast(copied ? '备份已复制' : '请长按文本手动复制');
    } catch {
      showToast('请长按文本手动复制');
    }
  });

  document.querySelector('#import-backup').addEventListener('click', () => {
    let parsed;
    try {
      parsed = JSON.parse(backupData.value);
      if (!parsed || parsed.app !== BACKUP_APP || !Array.isArray(parsed.orders)) throw new Error();
      if (parsed.orders.some((order) => !order || typeof order.id !== 'string' || typeof order.customerName !== 'string')) throw new Error();
    } catch {
      showToast('备份格式不正确');
      return;
    }
    if (!window.confirm(`将合并 ${parsed.orders.length} 条登记；相同编号的订单以备份内容为准。`)) return;
    const merged = new Map(readOrders().map((order) => [order.id, order]));
    parsed.orders.forEach((order) => merged.set(order.id, order));
    try {
      writeOrders(Array.from(merged.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
      closeOverlay('backup-overlay');
      render();
      showToast('备份已导入');
    } catch {
      showToast('本机空间不足，未能导入');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!formOverlay.hidden) closeOverlay('form-overlay');
      if (!backupOverlay.hidden) closeOverlay('backup-overlay');
    }
  });

  render();
}());
