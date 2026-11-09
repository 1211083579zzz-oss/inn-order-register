(function () {
  'use strict';

  const STORAGE_KEY = 'inn-order-records-v1';
  const BACKUP_APP = 'wechat-inn-orders';
  const today = localDate(new Date());
  let toastTimer;
  let activeFilter = 'all';
  let previousFocus;
  const filterLabels = { all: '全部登记', upcoming: '待入住', staying: '入住中', finished: '已结束' };
  const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

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
    document.querySelector('#toast-message').textContent = message;
    toast.querySelector('use').setAttribute('href', /失败|不足|不正确|至少|请检查/.test(message) ? '#i-close' : '#i-check');
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function stayState(order) {
    const start = order.arrivalDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { key: 'unknown', label: '待确认' };
    const checkout = new Date(`${start}T12:00:00`);
    if (Number.isNaN(checkout.getTime())) return { key: 'unknown', label: '待确认' };
    checkout.setDate(checkout.getDate() + Math.max(1, Number(order.nights || 1)));
    if (start > today) return { key: 'upcoming', label: '待入住' };
    if (localDate(checkout) > today) return { key: 'staying', label: '入住中' };
    return { key: 'finished', label: '已结束' };
  }

  function render() {
    const orders = readOrders().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const query = searchInput.value.trim().toLocaleLowerCase();
    const visible = orders.filter((order) => (activeFilter === 'all' || stayState(order).key === activeFilter) && (!query || [
      order.hotelOrder, order.base, order.customerName, order.phone, order.arrivalDate,
      order.nights, order.guestCount, order.roomType, order.mealIncluded, order.feeDetails
    ].join(' ').toLocaleLowerCase().includes(query)));
    document.querySelector('#order-count').textContent = `${visible.length} 条记录`;
    document.querySelector('#list-title').textContent = filterLabels[activeFilter];
    document.querySelector('#clear-search').hidden = !searchInput.value;
    document.querySelectorAll('[data-filter]').forEach(button => {
      const selected = button.dataset.filter === activeFilter;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });

    if (!visible.length) {
      const filtered = Boolean(query) || activeFilter !== 'all';
      const title = query ? '没有找到相关登记' : activeFilter !== 'all' ? `暂无${filterLabels[activeFilter]}记录` : '从第一条登记开始';
      const description = query ? '试试客人姓名、电话号码或订单名称' : filtered ? '切换到全部，查看其他入住记录' : '点击上方「新增入住登记」，\n把客人的入住安排记在这里。';
      orderList.innerHTML = `<div class="empty-state"><span class="empty-icon">${icon(query ? 'search' : 'book')}</span><h3>${title}</h3><p>${description.replace(/\n/g, '<br>')}</p>${filtered && orders.length ? '<button class="empty-reset" type="button" data-reset>查看全部登记</button>' : ''}</div>`;
      return;
    }

    orderList.innerHTML = visible.map((order) => {
      const state = stayState(order);
      return `<article class="order-card" data-id="${escapeHtml(order.id)}">
        <div class="record-heading"><h3 class="hotel-order">${escapeHtml(order.hotelOrder || '未填写订单名称')}</h3><span class="status status-${state.key}">${state.label}</span></div>
        <div class="base-line">${icon('pin')}<span>${escapeHtml(order.base || '未填写基地')}</span></div>
        <div class="stay-line"><time datetime="${escapeHtml(order.arrivalDate)}">${escapeHtml(order.arrivalDate.replace(/-/g, '.'))}</time><span class="stay-caption">入住</span><span class="night-tag">${escapeHtml(order.nights)} 晚</span></div>
        <div class="guest-row"><strong class="guest-name">${escapeHtml(order.customerName || '未填写姓名')}</strong>${order.phone ? `<a class="phone-link" data-call href="tel:${encodeURIComponent(order.phone.replace(/[\s-]/g, ''))}" aria-label="拨打 ${escapeHtml(order.customerName)} 的电话 ${escapeHtml(order.phone)}">${icon('phone')}${escapeHtml(order.phone)}</a>` : ''}</div>
        <div class="stay-details"><span>${icon('users')}${escapeHtml(order.guestCount)}</span><span>${icon('bed')}${escapeHtml(order.roomType)}</span><span>${icon('meal')}${order.mealIncluded === '是' ? '含餐' : '不含餐'}</span></div>
        <div class="record-footer"><div class="fee-line">${order.feeDetails ? `<span class="fee-label">费用明细</span><span class="fee-value">${escapeHtml(order.feeDetails)}</span>` : '<span class="fee-empty">未填写费用明细</span>'}</div><button class="record-open" type="button" aria-label="编辑 ${escapeHtml(order.hotelOrder)} 的登记">${icon('chevron')}</button></div>
      </article>`;
    }).join('');
  }

  function openOverlay(id) {
    previousFocus = document.activeElement;
    const overlay = document.querySelector(`#${id}`);
    overlay.hidden = false;
    document.body.classList.add('modal-open');
    document.querySelector('#home-view').inert = true;
    overlay.querySelector('.view-scroll').scrollTop = 0;
    overlay.querySelector('h2').focus({ preventScroll: true });
  }

  function updateFeeCount() {
    document.querySelector('#fee-count').textContent = `${orderForm.elements.feeDetails.value.length} / 200`;
  }

  function openForm(order) {
    orderForm.reset();
    orderForm.classList.remove('submitted');
    document.querySelector('#form-error').hidden = true;
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
      document.querySelector('#save-order span').textContent = '保存修改';
      document.querySelector('#delete-order').hidden = false;
    } else {
      document.querySelector('#form-title').textContent = '新增登记';
      document.querySelector('#save-order span').textContent = '保存登记';
      document.querySelector('#delete-order').hidden = true;
    }
    updateFeeCount();
    openOverlay('form-overlay');
  }

  function closeOverlay(id) {
    document.querySelector(`#${id}`).hidden = true;
    if (formOverlay.hidden && backupOverlay.hidden) {
      document.body.classList.remove('modal-open');
      document.querySelector('#home-view').inert = false;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }
  }

  function getFormOrder() {
    const values = Object.fromEntries(new FormData(orderForm).entries());
    if (['hotelOrder', 'base', 'customerName', 'phone', 'guestCount', 'roomType'].some(key => !values[key].trim())) {
      throw new Error('请填写完整的订单、客户和入住信息');
    }
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

  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  document.querySelector('#add-order').addEventListener('click', () => openForm());
  document.querySelector('#open-backup').addEventListener('click', () => {
    backupData.value = '';
    document.querySelector('#backup-count').textContent = `当前共 ${readOrders().length} 条登记`;
    openOverlay('backup-overlay');
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
    if (event.target.closest('[data-reset]')) {
      searchInput.value = '';
      activeFilter = 'all';
      render();
      return;
    }
    const card = event.target.closest('[data-id]');
    if (!card) return;
    const order = readOrders().find((item) => item.id === card.dataset.id);
    if (order) openForm(order);
  });

  orderForm.addEventListener('submit', (event) => {
    event.preventDefault();
    orderForm.classList.add('submitted');
    if (!orderForm.reportValidity()) return;
    try {
      const order = getFormOrder();
      const orders = readOrders();
      const index = orders.findIndex((item) => item.id === order.id);
      if (index < 0) orders.unshift(order);
      else orders[index] = order;
      writeOrders(orders);
      closeOverlay('form-overlay');
      activeFilter = 'all';
      searchInput.value = '';
      render();
      showToast('登记已保存');
    } catch (error) {
      const message = error.message || '保存失败，请检查本机存储空间';
      document.querySelector('#form-error').textContent = message;
      document.querySelector('#form-error').hidden = false;
      showToast(message);
    }
  });

  document.querySelector('#delete-order').addEventListener('click', () => {
    if (!window.confirm('确认删除这条登记吗？')) return;
    try {
      writeOrders(readOrders().filter((order) => order.id !== orderForm.dataset.id));
      closeOverlay('form-overlay');
      render();
      showToast('已删除');
    } catch {
      showToast('删除失败，请检查本机存储空间');
    }
  });

  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    render();
  }));
  orderForm.elements.feeDetails.addEventListener('input', updateFeeCount);
  document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
    const value = Math.max(1, Math.floor(Number(orderForm.elements.nights.value) || 1) + Number(button.dataset.step));
    orderForm.elements.nights.value = String(value);
  }));
  [formOverlay, backupOverlay].forEach(overlay => overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(overlay.querySelectorAll('button, input, select, textarea')).filter(element => !element.disabled && element.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === overlay.querySelector('h2'))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }));

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
