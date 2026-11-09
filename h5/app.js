(function () {
  'use strict';

  const STORAGE_KEY = 'inn-order-records-v1';
  const BACKUP_APP = 'wechat-inn-orders';
  const today = localDate(new Date());
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

  function normalizeOrder(order) {
    const legacyHotelOrder = [order.hotelName, order.orderTitle || order.orderSource].filter(Boolean).join('：');
    const guestCount = order.guestCount || `${Number(order.adults || 0)}大${Number(order.children || 0)}小`;
    return {
      id: String(order.id || `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      hotelOrder: String(order.hotelOrder || legacyHotelOrder),
      base: String(order.base || ''),
      customerName: String(order.customerName || ''),
      phone: String(order.phone || ''),
      arrivalDate: String(order.arrivalDate || ''),
      nights: Math.max(1, Number(order.nights || 1)),
      guestCount: String(guestCount),
      roomType: String(order.roomType || ''),
      mealIncluded: order.mealIncluded === '是' ? '是' : '否',
      feeDetails: String(order.feeDetails || ''),
      createdAt: order.createdAt || new Date().toISOString(),
      updatedAt: order.updatedAt || order.createdAt || new Date().toISOString()
    };
  }

  function readOrders() {
    let value;
    try {
      value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
    if (!Array.isArray(value)) return [];
    const normalized = value.map(normalizeOrder);
    if (JSON.stringify(value) !== JSON.stringify(normalized)) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch { /* Keep readable legacy data if local storage is full. */ }
    }
    return normalized;
  }

  function writeOrders(orders) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders.map(normalizeOrder)));
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
    const orders = readOrders().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const query = searchInput.value.trim().toLocaleLowerCase();
    const visible = orders.filter((order) => !query || [
      order.hotelOrder, order.base, order.customerName, order.phone, order.arrivalDate,
      order.nights, order.guestCount, order.roomType, order.mealIncluded, order.feeDetails
    ].join(' ').toLocaleLowerCase().includes(query));
    document.querySelector('#order-count').textContent = `${visible.length} 条`;
    document.querySelector('#clear-search').hidden = !searchInput.value;

    if (!visible.length) {
      const hasOrders = orders.length > 0;
      orderList.innerHTML = `<div class="empty-state"><span class="empty-mark">＋</span><strong>${hasOrders ? '没有匹配的订单' : '暂无订单记录'}</strong><span>${hasOrders ? '试试其他搜索内容' : '新增一条住宿登记'}</span></div>`;
      return;
    }

    orderList.innerHTML = visible.map((order) => `<article class="order-card" data-id="${escapeHtml(order.id)}">
      <div class="hotel-order">${escapeHtml(order.hotelOrder || '未填写订单名称')}</div>
      <div class="base-line"><i class="base-mark"></i>入住基地：${escapeHtml(order.base || '未填写')}</div>
      <div class="guest-row"><strong class="guest-name">${escapeHtml(order.customerName || '未填写姓名')}</strong>${order.phone ? `<a class="phone-link" data-call href="tel:${encodeURIComponent(order.phone.replace(/[\s-]/g, ''))}">${escapeHtml(order.phone)}</a>` : ''}</div>
      <div class="detail-grid">
        <div class="detail-item"><span>入住时间</span><strong>${escapeHtml(order.arrivalDate)}</strong></div>
        <div class="detail-item"><span>入住天数</span><strong>${escapeHtml(order.nights)} 晚</strong></div>
        <div class="detail-item"><span>入住人数</span><strong>${escapeHtml(order.guestCount)}</strong></div>
        <div class="detail-item"><span>入住房型</span><strong>${escapeHtml(order.roomType)}</strong></div>
        <div class="detail-item"><span>是否含餐</span><strong class="meal-value">${escapeHtml(order.mealIncluded)}</strong></div>
      </div>
      <div class="fee-line"><span class="fee-label">费用明细</span><span class="fee-value">${escapeHtml(order.feeDetails || '未填写')}</span></div>
      <div class="card-footer"><span>住宿订单</span><span class="edit-label">修改 ›</span></div>
    </article>`).join('');
  }

  function openForm(order) {
    orderForm.reset();
    orderForm.elements.arrivalDate.value = today;
    orderForm.elements.nights.value = '1';
    orderForm.elements.mealIncluded.value = '否';
    orderForm.dataset.id = order ? order.id : '';

    if (order) {
      const normalized = normalizeOrder(order);
      for (const [key, value] of Object.entries(normalized)) {
        if (orderForm.elements.namedItem(key)) orderForm.elements[key].value = value ?? '';
      }
      document.querySelector('#form-title').textContent = '修改登记';
      document.querySelector('#save-order').textContent = '保存修改';
      document.querySelector('#delete-order').hidden = false;
    } else {
      document.querySelector('#form-title').textContent = '新增登记';
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
    const values = Object.fromEntries(new FormData(orderForm).entries());
    const nights = Number(values.nights);
    if (!Number.isInteger(nights) || nights < 1) throw new Error('入住天数至少为 1 晚');
    const old = readOrders().find((order) => order.id === orderForm.dataset.id);
    const now = new Date().toISOString();
    return normalizeOrder({
      id: orderForm.dataset.id || `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      hotelOrder: values.hotelOrder.trim(),
      base: values.base.trim(),
      customerName: values.customerName.trim(),
      phone: values.phone.trim(),
      arrivalDate: values.arrivalDate,
      nights,
      guestCount: values.guestCount.trim(),
      roomType: values.roomType.trim(),
      mealIncluded: values.mealIncluded,
      feeDetails: values.feeDetails.trim(),
      createdAt: old ? old.createdAt : now,
      updatedAt: now
    });
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
      const order = getFormOrder();
      const orders = readOrders();
      const index = orders.findIndex((item) => item.id === order.id);
      if (index < 0) orders.unshift(order);
      else orders[index] = order;
      writeOrders(orders);
      closeOverlay('form-overlay');
      render();
      showToast('登记已保存');
    } catch (error) {
      showToast(error.message || '保存失败，请检查本机存储空间');
    }
  });

  document.querySelector('#delete-order').addEventListener('click', () => {
    if (!window.confirm('确认删除这条登记吗？')) return;
    writeOrders(readOrders().filter((order) => order.id !== orderForm.dataset.id));
    closeOverlay('form-overlay');
    render();
    showToast('已删除');
  });

  document.querySelector('#copy-backup').addEventListener('click', async () => {
    const backup = JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), orders: readOrders() });
    backupData.value = backup;
    try {
      showToast(await copyText(backup) ? '备份已复制' : '请长按文本手动复制');
    } catch {
      showToast('请长按文本手动复制');
    }
  });

  document.querySelector('#import-backup').addEventListener('click', () => {
    let imported;
    try {
      const value = JSON.parse(backupData.value);
      if (!value || value.app !== BACKUP_APP || !Array.isArray(value.orders)) throw new Error();
      if (value.orders.some((order) => !order || typeof order !== 'object' || typeof order.id !== 'string')) throw new Error();
      imported = value.orders.map(normalizeOrder);
    } catch {
      showToast('备份格式不正确');
      return;
    }
    if (!window.confirm(`将合并 ${imported.length} 条登记；相同编号的订单以备份内容为准。`)) return;
    const merged = new Map(readOrders().map((order) => [order.id, order]));
    imported.forEach((order) => merged.set(order.id, order));
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
    if (event.key !== 'Escape') return;
    if (!formOverlay.hidden) closeOverlay('form-overlay');
    if (!backupOverlay.hidden) closeOverlay('backup-overlay');
  });

  render();
}());
