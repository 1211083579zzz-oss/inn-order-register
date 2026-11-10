(function () {
  'use strict';

  let today = localDate(new Date());
  let toastTimer;
  let calendarTimer;
  let arrivalView = 'arrivals';
  let arrivalsExpanded = false;
  let highlightedOrderId = '';
  const filterLabels = { all: '全部登记', upcoming: '待入住', staying: '入住中', finished: '已结束' };
  const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const formOverlay = document.querySelector('#form-overlay');
  const backupOverlay = document.querySelector('#backup-overlay');
  const orderForm = document.querySelector('#order-form');
  const backupData = document.querySelector('#backup-data');
  const allViews = Array.from(document.querySelectorAll('.page-view'));
  const navigation = window.createInnNavigation(document.querySelector('#home-view'), allViews);
  const companyForm = document.querySelector('#company-form');
  let selectedCompanyId = null;
  let pendingCompanyId = null;
  let companyFilter = 'all';
  const confirmation = document.querySelector('#confirm-dialog');
  let pendingConfirmation;
  let confirmationOpener;
  let confirmationEntry;
  const requiredMessages = { hotelOrder: '请填写旅店或订单名称', base: '请填写入住基地', customerName: '请填写客户姓名', phone: '请填写客户电话', arrivalDate: '请选择入住时间', nights: '入住天数应为至少 1 晚的整数', guestCount: '请填写入住人数', roomType: '请填写入住房型' };

  function localDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const normalizeOrder = window.InnStorage.normalizeOrder;
  const store = window.InnStorage.createStore(localStorage);
  function readOrders() { return store.read().orders; }
  function writeOrders(orders) { return store.saveOrders(orders); }

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

  function confirmAction({ title, message, accept, destructive = false, opener = document.activeElement }) {
    if (confirmation.open) return Promise.resolve(false);
    document.querySelector('#confirm-title').textContent = title;
    document.querySelector('#confirm-description').textContent = message;
    document.querySelector('#confirm-accept').textContent = accept;
    confirmation.dataset.destructive = String(destructive);
    confirmation.setAttribute('role', destructive ? 'alertdialog' : 'dialog');
    confirmation.inert = false;
    confirmationOpener = opener;
    confirmationEntry = `confirm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    history.pushState({ ...history.state, innConfirm: confirmationEntry }, '');
    confirmation.showModal();
    return new Promise(resolve => { pendingConfirmation = resolve; });
  }

  function settleConfirmation(accepted, fromHistory = false) {
    if (!pendingConfirmation) return;
    const resolve = pendingConfirmation;
    pendingConfirmation = null;
    confirmation.inert = true;
    let historyReady = Promise.resolve();
    if (!fromHistory && history.state?.innConfirm === confirmationEntry) {
      historyReady = new Promise(done => {
        window.addEventListener('popstate', done, { once: true });
        history.back();
      });
    }
    const finish = () => {
      confirmation.close();
      confirmation.inert = false;
      if (confirmationOpener?.isConnected) confirmationOpener.focus({ preventScroll: true });
      resolve(accepted);
    };
    const animationReady = matchMedia('(prefers-reduced-motion: reduce)').matches ? Promise.resolve() : confirmation.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: 'ease-out' }).finished;
    Promise.all([historyReady, animationReady]).then(finish);
  }

  function setFieldError(control, message) {
    const field = control.closest('.field');
    if (!field) return;
    let error = field.querySelector('.field-error');
    if (!message) {
      delete field.dataset.invalid;
      control.removeAttribute('aria-invalid');
      control.removeAttribute('aria-describedby');
      error?.remove();
      return;
    }
    if (!error) {
      error = document.createElement('span');
      error.className = 'field-error';
      error.id = `error-${control.form?.id || "field"}-${control.name}`;
      field.append(error);
    }
    error.textContent = message;
    field.dataset.invalid = 'true';
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', error.id);
  }

  function validateField(control) {
    const invalid = !control.validity.valid || (control.required && !control.value.trim());
    const message = control.name === 'phone' && control.value.trim() ? '请输入有效联系电话（6–20 位）' : requiredMessages[control.name];
    setFieldError(control, invalid ? message : '');
    return !invalid;
  }

  function syncNightsStepper() {
    document.querySelector('[data-step="-1"]').disabled = Number(orderForm.elements.nights.value) <= 1;
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

  function renderArrivalReminders() {
    const data = store.read();
    const section = document.querySelector('#arrival-reminders');
    section.hidden = !data.orders.length;
    if (section.hidden) return;
    const summary = window.InnArrivals.summarize(data, today);
    if (!summary[arrivalView].length && (summary.arrivals.length || summary.staying.length)) arrivalView = summary.arrivals.length ? 'arrivals' : 'staying';
    document.querySelector('#arrival-date').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(`${today}T12:00:00`));
    document.querySelector('#arrival-count').textContent = summary.arrivals.length;
    document.querySelector('#staying-count').textContent = summary.staying.length;
    const showSwitch = summary.arrivals.length > 0 && summary.staying.length > 0;
    document.querySelector('.arrival-switch').hidden = !showSwitch;
    const overview = document.querySelector('#arrival-overview');
    overview.hidden = showSwitch;
    overview.textContent = summary.arrivals.length ? `${summary.arrivals.length} 条待入住` : summary.staying.length ? `${summary.staying.length} 条在住` : '未来 3 天';
    document.querySelectorAll('[data-arrival-view]').forEach(button => {
      const selected = button.dataset.arrivalView === arrivalView;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const entries = summary[arrivalView];
    document.querySelector('#arrival-summary').textContent = arrivalView === 'arrivals'
      ? summary.todayCount || summary.upcomingCount ? `${summary.todayCount} 条今日入住 · ${summary.upcomingCount} 条即将入住` : '未来 3 天暂无入住安排'
      : summary.staying.length ? `${summary.staying.length} 条入住中的记录` : '暂无入住中的记录';
    document.querySelector('#arrival-list').innerHTML = entries.slice(0, arrivalsExpanded ? undefined : 3).map(({ order, company, days, remaining }) => {
      const label = arrivalView === 'staying' ? '入住中' : ['今天', '明天', '后天', '3天后'][days];
      const arrivalDate = new Date(`${order.arrivalDate}T12:00:00`);
      const date = `${Number(order.arrivalDate.slice(5, 7))}月${Number(order.arrivalDate.slice(8, 10))}日`;
      const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(arrivalDate);
      const deadline = arrivalView === 'staying' ? '入住中' : days === 0 ? '今天入住' : `${days} 天后入住`;
      const context = [order.base, order.roomType, arrivalView === 'staying' ? `还有 ${remaining} 晚` : `${order.nights} 晚`].filter(Boolean).join(' · ');
      return `<button class="arrival-row${arrivalView === 'arrivals' && days === 0 ? ' arrival-today' : ''}${arrivalView === 'staying' ? ' arrival-staying' : ''}" type="button" data-arrival-id="${escapeHtml(order.id)}" aria-label="${escapeHtml(deadline)}，${escapeHtml(order.customerName)}，${escapeHtml(date)}${escapeHtml(weekday)}，${escapeHtml(company?.name || '待归类住客')}，查看登记"><span class="arrival-copy"><span class="arrival-row-heading"><strong class="arrival-guest">${escapeHtml(order.customerName || '未填写姓名')}</strong><span class="arrival-when"><strong class="visually-hidden">${label}</strong><span>${deadline}</span></span></span><span class="arrival-checkin"><time datetime="${escapeHtml(order.arrivalDate)}">${escapeHtml(date)}</time><span>${escapeHtml(weekday)}${arrivalView === 'staying' ? '入住' : '到店'}</span></span><span class="arrival-person">${icon('company')}<span>${escapeHtml(company?.name || '待归类住客')}</span></span><span class="arrival-bottom"><span class="arrival-context">${escapeHtml(context)}</span><span class="arrival-open">查看${icon('chevron', 'chevron')}</span></span></span></button>`;
    }).join('') || '<p class="arrival-empty">未来 3 天没有入住安排</p>';
    const expand = document.querySelector('#arrival-expand');
    expand.hidden = entries.length <= 3;
    expand.textContent = arrivalsExpanded ? '收起提醒' : `查看全部 ${entries.length} 条`;
    expand.setAttribute('aria-expanded', String(arrivalsExpanded));
  }

  function renderOrders(target, queryValue, filterValue, companyId) {
    const orders = readOrders().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const query = queryValue.trim().toLocaleLowerCase();
    const visible = orders.filter((order) => order.companyId === companyId && (filterValue === 'all' || stayState(order).key === filterValue) && (!query || [
      order.hotelOrder, order.base, order.customerName, order.phone, order.arrivalDate,
      order.nights, order.guestCount, order.roomType, order.mealIncluded, order.feeDetails
    ].join(' ').toLocaleLowerCase().includes(query)));
    document.querySelector('#company-guest-count').textContent = `${visible.length} 条入住记录`;
    document.querySelector('#company-list-title').textContent = filterValue === 'all' ? '住客记录' : filterLabels[filterValue];
    document.querySelector('#clear-company-guest-search').hidden = !queryValue;
    document.querySelectorAll('[data-company-filter]').forEach(button => {
      const selected = button.dataset.companyFilter === filterValue;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelector('#company-filter-selection').style.setProperty('--selected-index', Object.keys(filterLabels).indexOf(filterValue));

    if (!visible.length) {
      const filtered = Boolean(query) || filterValue !== 'all';
      const title = query ? '没有找到相关登记' : filterValue !== 'all' ? `暂无${filterLabels[filterValue]}记录` : companyId ? '这家公司还没有住客登记' : '历史住客已归类完成';
      const description = query ? '试试住客姓名、电话号码或订单名称' : filtered ? '切换到全部，查看本公司的入住记录' : companyId ? '轻点下方“新增客人入住”，\n登记会自动保存在这家公司里。' : '返回旅居公司，查看已归类的入住信息。';
      target.innerHTML = `<div class="empty-state"><span class="empty-icon">${icon(query ? 'search' : 'book')}</span><h3>${title}</h3><p>${description.replace(/\n/g, '<br>')}</p>${filtered && orders.some(order => order.companyId === companyId) ? '<button class="empty-reset" type="button" data-reset>查看本公司全部住客</button>' : ''}</div>`;
      return;
    }

    target.innerHTML = visible.map((order) => {
      const state = stayState(order);
      return `<article class="order-card${order.id === highlightedOrderId ? ' reminder-target' : ''}" data-id="${escapeHtml(order.id)}">
        <div class="record-heading"><h3 class="guest-name">${escapeHtml(order.customerName || '未填写姓名')}</h3><span class="status status-${state.key}">${state.label}</span></div>
        <div class="stay-line">${icon('calendar')}<time datetime="${escapeHtml(order.arrivalDate)}">${escapeHtml(order.arrivalDate.replace(/-/g, '.'))}</time><span class="stay-caption">入住</span><span class="night-tag">${escapeHtml(order.nights)} 晚</span></div>
        <div class="stay-details"><span class="room-type">${escapeHtml(order.roomType)}</span><span>${escapeHtml(order.guestCount)}</span><span>${order.mealIncluded === '是' ? '含餐' : '不含餐'}</span></div>
        <div class="order-location"><span class="hotel-order">${escapeHtml(order.hotelOrder || '未填写订单名称')}</span><span class="base-line">${escapeHtml(order.base || '未填写基地')}</span></div>
        ${order.feeDetails ? `<div class="fee-line"><span class="fee-label">费用</span><span class="fee-value">${escapeHtml(order.feeDetails)}</span></div>` : ''}
        <div class="record-footer">${order.phone ? `<a class="phone-link" data-call href="tel:${encodeURIComponent(order.phone.replace(/[\s-]/g, ''))}" aria-label="拨打 ${escapeHtml(order.customerName)} 的电话 ${escapeHtml(order.phone)}">${icon('phone')}${escapeHtml(order.phone)}</a>` : '<span class="fee-empty">未填写电话</span>'}<button class="record-open" type="button" aria-label="编辑 ${escapeHtml(order.customerName)} 的登记">编辑${icon('chevron')}</button></div>
      </article>`;
    }).join('');
  }

  function renderCompanies() {
    const { companies, orders } = store.read();
    const query = document.querySelector('#company-search').value.trim().toLocaleLowerCase();
    const visible = companies.filter(company => !query || [company.name, company.contact, company.phone].join(' ').toLocaleLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    document.querySelector('#company-count').textContent = `${visible.length} 家公司`;
    document.querySelector('#clear-company-search').hidden = !query;
    let markup = visible.map(company => {
      const guests = orders.filter(order => order.companyId === company.id);
      const staying = guests.filter(order => stayState(order).key === 'staying').length;
      return `<button class="company-row" type="button" data-company-id="${escapeHtml(company.id)}" aria-label="进入 ${escapeHtml(company.name)} 的住客列表，${guests.length} 条入住记录"><span class="company-symbol" aria-hidden="true">${escapeHtml(Array.from(company.name)[0] || '旅')}</span><span class="company-row-copy"><strong>${escapeHtml(company.name)}</strong><span>${guests.length} 条入住${staying ? `<i>·</i><span class="current-count">${staying} 条入住中</span>` : ''}</span></span>${icon('chevron', 'chevron')}</button>`;
    }).join('');
    if (!visible.length) markup = `<div class="empty-state"><span class="empty-icon">${icon(query ? 'search' : 'company')}</span><h3>${query ? '没有找到相关公司' : '先添加旅居公司，再登记住客'}</h3><p>${query ? '试试其他公司名称或联系人' : '每家公司的住客分开保存。<br>添加公司后，就能进入登记入住信息。'}</p>${!query ? '<button class="empty-create" type="button" data-create-company>新增旅居公司</button>' : ''}</div>`;
    const unassigned = orders.filter(order => !order.companyId).length;
    if (unassigned && !query) markup += `<button class="company-row unassigned-row" type="button" data-company-id="" aria-label="待归类住客，${unassigned} 条历史记录"><span class="company-symbol">${icon('users')}</span><span class="company-row-copy"><strong>待归类住客</strong><span>${unassigned} 条历史记录待选择公司</span></span>${icon('chevron', 'chevron')}</button>`;
    document.querySelector('#company-list').innerHTML = markup;
  }

  function renderCompanyDetail() {
    if (selectedCompanyId === null) return;
    const company = store.read().companies.find(item => item.id === selectedCompanyId);
    const name = company?.name || (selectedCompanyId === '' ? '待归类住客' : '公司已删除');
    document.querySelector('#company-title').textContent = selectedCompanyId === '' ? '待归类住客' : '住客登记';
    document.querySelector('#company-detail-symbol').textContent = Array.from(name)[0] || '旅';
    document.querySelector('#company-name').textContent = name;
    const contact = document.querySelector('#company-contact');
    contact.textContent = selectedCompanyId === '' ? '这些是旧版留下的记录。打开记录，选择旅居公司后保存归类。' : [company?.contact, company?.phone].filter(Boolean).join(' · ');
    contact.hidden = !contact.textContent;
    document.querySelector('#company-notes').textContent = company?.notes || '';
    document.querySelector('#company-notes').hidden = !company?.notes;
    document.querySelector('#edit-company').hidden = !company;
    document.querySelector('#add-company-guest').hidden = !company;
    document.querySelector('.company-toolbar').hidden = !company;
    renderOrders(document.querySelector('#company-guest-list'), document.querySelector('#company-guest-search').value, companyFilter, selectedCompanyId);
  }

  function render() {
    today = localDate(new Date());
    renderCompanies();
    renderArrivalReminders();
    renderCompanyDetail();
  }

  function openCompany(id, orderId = '') {
    if (id && !store.read().companies.some(company => company.id === id)) return;
    selectedCompanyId = id;
    highlightedOrderId = orderId;
    companyFilter = 'all';
    document.querySelector('#company-guest-search').value = '';
    renderCompanyDetail();
    navigation.open('company-overlay', { companyId: id, orderId });
    if (orderId) {
      const card = Array.from(document.querySelectorAll('#company-guest-list .order-card')).find(item => item.dataset.id === orderId);
      card?.scrollIntoView({ block: 'center' });
      card?.querySelector('.record-open').focus({ preventScroll: true });
    }
  }

  function openCompanyForm(company) {
    companyForm.reset();
    companyForm.dataset.id = company?.id || '';
    companyForm.querySelectorAll('[aria-invalid]').forEach(control => setFieldError(control, ''));
    document.querySelector('#company-form-error').hidden = true;
    if (company) Object.entries(company).forEach(([key, value]) => { if (companyForm.elements.namedItem(key)) companyForm.elements[key].value = value; });
    document.querySelector('#company-form-title').textContent = company ? '编辑公司档案' : '登记旅居公司';
    document.querySelector('#delete-company').hidden = !company;
    navigation.open('company-form-overlay', { companyId: company?.id || null });
  }

  function openOverlay(id) {
    navigation.open(id);
  }

  function updateFeeCount() {
    document.querySelector('#fee-count').textContent = `${orderForm.elements.feeDetails.value.length} / 200`;
  }

  function openForm(order) {
    const companies = store.read().companies;
    const company = companies.find(item => item.id === selectedCompanyId);
    const legacy = Boolean(order && !order.companyId && selectedCompanyId === '');
    if (!company && !legacy) { showToast('请先进入旅居公司，再登记住客'); return; }
    if (order?.companyId && order.companyId !== company?.id) { showToast('请进入住客所属的旅居公司'); return; }
    if (legacy && !companies.length) { showToast('请先新增旅居公司，再归类历史住客'); return; }
    orderForm.reset();
    orderForm.classList.remove('submitted');
    Array.from(orderForm.elements).filter(control => control.name).forEach(control => setFieldError(control, ''));
    document.querySelector('#form-error').hidden = true;
    orderForm.elements.arrivalDate.value = localDate(new Date());
    orderForm.elements.nights.value = '1';
    orderForm.elements.mealIncluded.value = '否';
    orderForm.dataset.id = order ? order.id : '';
    orderForm.dataset.companyId = company?.id || '';
    document.querySelector('#order-company-name').textContent = company?.name || '请选择归属公司';
    document.querySelector('#legacy-company-choice').hidden = !legacy;
    document.querySelector('#order-company').innerHTML = '<option value="">选择旅居公司</option>' + companies.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    document.querySelector('#order-company').value = company?.id || '';

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
    syncNightsStepper();
    navigation.open('form-overlay', { companyId: selectedCompanyId, orderId: order?.id || '' });
  }

  function closeOverlay(id) {
    navigation.close(id);
  }

  function getFormOrder() {
    const companyId = orderForm.dataset.companyId || document.querySelector('#order-company').value;
    if (!companyId) throw new Error('请先选择旅居公司，住客登记必须归属公司');
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
      companyId,
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
  document.querySelectorAll('[data-arrival-view]').forEach(button => button.addEventListener('click', () => {
    arrivalView = button.dataset.arrivalView;
    arrivalsExpanded = false;
    renderArrivalReminders();
  }));
  document.querySelector('#arrival-expand').addEventListener('click', () => {
    arrivalsExpanded = !arrivalsExpanded;
    renderArrivalReminders();
  });
  document.querySelector('#arrival-list').addEventListener('click', event => {
    const button = event.target.closest('[data-arrival-id]');
    if (!button) return;
    const order = readOrders().find(item => item.id === button.dataset.arrivalId);
    if (order) openCompany(order.companyId || '', order.id);
    else renderArrivalReminders();
  });
  document.querySelector('#add-company').addEventListener('click', () => openCompanyForm());
  document.querySelector('#company-search').addEventListener('input', renderCompanies);
  document.querySelector('#clear-company-search').addEventListener('click', () => { document.querySelector('#company-search').value = ''; renderCompanies(); document.querySelector('#company-search').focus(); });
  document.querySelector('#company-list').addEventListener('click', event => {
    if (event.target.closest('[data-create-company]')) { openCompanyForm(); return; }
    const company = event.target.closest('[data-company-id]');
    if (company) openCompany(company.dataset.companyId);
  });
  document.querySelector('#edit-company').addEventListener('click', () => openCompanyForm(store.read().companies.find(company => company.id === selectedCompanyId)));
  document.querySelector('#add-company-guest').addEventListener('click', () => openForm());
  document.querySelector('#company-guest-search').addEventListener('input', renderCompanyDetail);
  document.querySelector('#clear-company-guest-search').addEventListener('click', () => { document.querySelector('#company-guest-search').value = ''; renderCompanyDetail(); document.querySelector('#company-guest-search').focus(); });
  document.querySelectorAll('[data-company-filter]').forEach(button => button.addEventListener('click', () => { companyFilter = button.dataset.companyFilter; renderCompanyDetail(); }));
  companyForm.addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(companyForm));
    const name = companyForm.elements.namedItem('name');
    const phone = companyForm.elements.namedItem('phone');
    setFieldError(name, name.value.trim() ? '' : '请填写公司名称');
    setFieldError(phone, phone.validity.valid ? '' : '请输入有效的公司联系电话');
    if (!name.value.trim() || !phone.validity.valid) { (!name.value.trim() ? name : phone).focus(); return; }
    try {
      const existing = store.read().companies.find(item => item.id === companyForm.dataset.id);
      const company = store.saveCompany({ ...existing, ...values, id: existing?.id });
      if (!existing) pendingCompanyId = company.id;
      document.querySelector('#company-search').value = '';
      closeOverlay('company-form-overlay');
      render();
      showToast(`已保存 ${company.name}`);
    } catch (error) {
      document.querySelector('#company-form-error').textContent = error.message || '保存失败，请检查本机空间';
      document.querySelector('#company-form-error').hidden = false;
    }
  });
  document.querySelector('#delete-company').addEventListener('click', async event => {
    const id = companyForm.dataset.id;
    const count = readOrders().filter(order => order.companyId === id).length;
    if (!await confirmAction({ title: '删除公司档案？', message: count ? `该公司的 ${count} 条住客登记会移到“待归类住客”，入住信息继续保留。` : '删除后可重新登记该公司。', accept: '删除公司', destructive: true, opener: event.currentTarget })) return;
    try {
      store.removeCompany(id);
      closeOverlay('company-form-overlay');
      render();
      showToast('公司档案已删除，客人登记已保留');
    } catch { showToast('删除失败，请检查本机空间'); }
  });
  window.addEventListener('innviewchange', event => {
    if (event.detail.id === 'company-overlay') {
      selectedCompanyId = event.detail.context.companyId ?? '';
      highlightedOrderId = event.detail.context.orderId || '';
      renderCompanyDetail();
      if (selectedCompanyId && !store.read().companies.some(company => company.id === selectedCompanyId) && document.querySelector('#company-overlay').dataset.state === 'open') closeOverlay('company-overlay');
    } else if (!event.detail.id) {
      selectedCompanyId = null;
      refreshCalendar();
      if (pendingCompanyId) {
        const id = pendingCompanyId;
        pendingCompanyId = null;
        setTimeout(() => openCompany(id), 0);
      }
    }
  });
  document.querySelector('#open-backup').addEventListener('click', () => {
    backupData.value = '';
    const data = store.read();
    document.querySelector('#backup-count').textContent = `${data.companies.length} 家公司 · ${data.orders.length} 条客人登记`;
    openOverlay('backup-overlay');
  });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeOverlay(button.dataset.close)));
  allViews.forEach((overlay) => overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeOverlay(overlay.id);
  }));
  document.querySelector('#company-guest-list').addEventListener('click', (event) => {
    if (event.target.closest('[data-call]')) return;
    if (event.target.closest('[data-reset]')) {
      document.querySelector('#company-guest-search').value = ''; companyFilter = 'all';
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
    const invalid = Array.from(orderForm.elements).filter(control => control.name && !validateField(control));
    if (invalid.length) {
      invalid[0].focus({ preventScroll: true });
      invalid[0].closest('.field').scrollIntoView({ block: 'center' });
      return;
    }
    try {
      const order = getFormOrder();
      store.saveOrder(order, orderForm.dataset.companyId || document.querySelector('#order-company').value);
      closeOverlay('form-overlay');
      companyFilter = 'all';
      document.querySelector('#company-guest-search').value = '';
      render();
      showToast('登记已保存');
    } catch (error) {
      const message = error.message || '保存失败，请检查本机存储空间';
      document.querySelector('#form-error').textContent = message;
      document.querySelector('#form-error').hidden = false;
      showToast(message);
    }
  });

  document.querySelector('#delete-order').addEventListener('click', async event => {
    if (!await confirmAction({ title: '删除这条登记？', message: '删除后无法恢复。', accept: '删除登记', destructive: true, opener: event.currentTarget })) return;
    try {
      writeOrders(readOrders().filter((order) => order.id !== orderForm.dataset.id));
      closeOverlay('form-overlay');
      render();
      showToast('已删除');
    } catch {
      showToast('删除失败，请检查本机存储空间');
    }
  });

  orderForm.elements.feeDetails.addEventListener('input', updateFeeCount);
  orderForm.addEventListener('input', event => {
    if (event.target.name === 'nights') syncNightsStepper();
    if (event.target.name && orderForm.classList.contains('submitted')) validateField(event.target);
  });
  orderForm.addEventListener('keydown', event => {
    const control = event.target;
    if (event.key !== 'Enter' || event.isComposing || control.tagName !== 'INPUT' || control.type === 'date') return;
    event.preventDefault();
    const controls = Array.from(orderForm.querySelectorAll('input, select, textarea'));
    controls[controls.indexOf(control) + 1]?.focus();
  });
  document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
    const value = Math.max(1, Math.floor(Number(orderForm.elements.nights.value) || 1) + Number(button.dataset.step));
    orderForm.elements.nights.value = String(value);
    syncNightsStepper();
    if (orderForm.classList.contains('submitted')) validateField(orderForm.elements.nights);
  }));
  allViews.forEach(overlay => overlay.addEventListener('keydown', event => {
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
    const button = document.querySelector('#copy-backup');
    const label = button.querySelector('.action-copy strong');
    button.disabled = true;
    label.textContent = '正在复制…';
    try {
      const backup = JSON.stringify(store.backup());
      backupData.value = backup;
      showToast(await copyText(backup) ? '备份已复制' : '请长按文本手动复制');
    } catch {
      showToast('请长按文本手动复制');
    } finally {
      button.disabled = false;
      label.textContent = '复制本机备份';
    }
  });

  document.querySelector('#import-backup').addEventListener('click', async event => {
    let imported;
    try {
      imported = store.parseBackup(backupData.value);
    } catch {
      showToast('备份格式不正确');
      return;
    }
    if (!await confirmAction({ title: '合并公司与客人登记？', message: `${imported.companies.length} 家公司、${imported.orders.length} 条客人登记。本机其他记录会保留，相同编号以备份内容为准。`, accept: '合并导入', opener: event.currentTarget })) return;
    try {
      store.mergeBackup(imported);
      closeOverlay('backup-overlay');
      render();
      showToast('备份已导入');
    } catch {
      showToast('本机空间不足，未能导入');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || confirmation.open) return;
    const top = allViews.filter(view => !view.hidden && !view.inert).at(-1);
    if (top) closeOverlay(top.id);
  });

  document.querySelector('#confirm-cancel').addEventListener('click', () => settleConfirmation(false));
  document.querySelector('#confirm-accept').addEventListener('click', () => settleConfirmation(true));
  confirmation.addEventListener('cancel', event => { event.preventDefault(); settleConfirmation(false); });
  window.addEventListener('popstate', event => {
    if (confirmation.open && event.state?.innConfirm !== confirmationEntry) settleConfirmation(false, true);
    else if (!confirmation.open && event.state?.innConfirm) history.back();
  });

  function refreshCalendar() {
    const date = localDate(new Date());
    if (date !== today) {
      today = date;
      try { render(); } catch (error) { showToast(error.message || '本机记录无法读取'); }
    }
    clearTimeout(calendarTimer);
    const next = new Date();
    next.setHours(24, 0, 0, 100);
    calendarTimer = setTimeout(refreshCalendar, Math.max(1000, next.getTime() - Date.now()));
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCalendar(); });
  window.addEventListener('pageshow', refreshCalendar);
  window.addEventListener('focus', refreshCalendar);
  window.addEventListener('storage', event => {
    if (event.key !== null && !['inn-order-data-v2', 'inn-order-records-v1'].includes(event.key)) return;
    try { render(); } catch (error) { showToast(error.message || '本机记录无法读取'); }
  });
  window.addEventListener('innsyncdata', () => {
    try { render(); } catch (error) { showToast(error.message || '本机记录无法读取'); }
  });

  try { render(); } catch (error) {
    document.querySelector('#company-list').textContent = error.message || '本机记录无法读取';
    document.querySelector('#company-list').setAttribute('role', 'alert');
  }
  refreshCalendar();
}());
