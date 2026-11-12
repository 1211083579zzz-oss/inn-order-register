(function () {
  'use strict';

  let today = localDate(new Date());
  let toastTimer;
  let calendarTimer;
  let arrivalView = 'arrivals';
  let arrivalsExpanded = false;
  let highlightedOrderId = '';
  let registrationSaving = false;
  const filterLabels = { all: '全部登记', upcoming: '待入住', staying: '入住中', finished: '已结束' };
  const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const formOverlay = document.querySelector('#form-overlay');
  const backupOverlay = document.querySelector('#backup-overlay');
  const orderForm = document.querySelector('#order-form');
  const backupData = document.querySelector('#backup-data');
  const allViews = Array.from(document.querySelectorAll('.page-view'));
  const navigation = window.createInnNavigation(document.querySelector('#home-view'), allViews);
  let selectedCompanyId = null;
  let companyFilter = 'all';
  let homeFilter = 'all';
  const confirmation = document.querySelector('#confirm-dialog');
  let pendingConfirmation;
  let confirmationOpener;
  let confirmationEntry;
  const requiredMessages = { companyName: '请填写旅居公司名称', hotelOrder: '请填写旅店或订单名称', base: '请填写入住基地', customerName: '请填写客户姓名', phone: '请填写客户电话', arrivalDate: '请选择入住时间', nights: '入住天数应为至少 1 晚的整数', guestCount: '请填写入住人数', roomType: '请填写入住房型' };

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
      const context = [weekday, order.roomType, arrivalView === 'staying' ? `剩余 ${remaining} 晚` : `${order.nights} 晚`].filter(Boolean).join(' · ');
      return `<button class="arrival-row${arrivalView === 'arrivals' && days === 0 ? ' arrival-today' : ''}${arrivalView === 'staying' ? ' arrival-staying' : ''}" type="button" data-arrival-id="${escapeHtml(order.id)}" aria-label="${escapeHtml(deadline)}，${escapeHtml(order.customerName)}，${escapeHtml(date)}${escapeHtml(weekday)}，${escapeHtml(company?.name || '未分类')}，查看登记"><time class="arrival-calendar" datetime="${escapeHtml(order.arrivalDate)}" aria-hidden="true"><span>${Number(order.arrivalDate.slice(5, 7))}月</span><strong>${Number(order.arrivalDate.slice(8, 10))}</strong></time><span class="arrival-copy"><span class="arrival-row-heading"><strong class="arrival-guest">${escapeHtml(order.customerName || '未填写姓名')}</strong><span class="arrival-when"><strong class="visually-hidden">${label}</strong><span>${deadline}</span></span></span><span class="arrival-person">${escapeHtml(company?.name || '未分类')}</span><span class="arrival-context">${escapeHtml(context)}</span></span>${icon('chevron', 'arrival-chevron')}</button>`;
    }).join('') || '<p class="arrival-empty">未来 3 天没有入住安排</p>';
    const expand = document.querySelector('#arrival-expand');
    expand.hidden = entries.length <= 3;
    expand.textContent = arrivalsExpanded ? '收起提醒' : `查看全部 ${entries.length} 条`;
    expand.setAttribute('aria-expanded', String(arrivalsExpanded));
  }

  function renderOrders(target, queryValue, filterValue, companyId) {
    const { orders, companies } = store.read();
    const query = queryValue.trim().toLocaleLowerCase();
    const inGroup = orders.filter(order => companyId ? order.companyId === companyId : !companies.some(company => company.id === order.companyId));
    const visible = inGroup.filter(order => (filterValue === 'all' || stayState(order).key === filterValue) && (!query || [
      order.hotelOrder, order.base, order.customerName, order.phone, order.arrivalDate, order.roomType,
      companies.find(company => company.id === order.companyId)?.name || '未分类'
    ].join(' ').toLocaleLowerCase().includes(query)));
    document.querySelector('#company-guest-count').textContent = `${visible.length} 条记录`;
    document.querySelector('#company-list-title').textContent = filterLabels[filterValue];
    document.querySelector('#clear-company-guest-search').hidden = !queryValue;
    {
      document.querySelectorAll('[data-company-filter]').forEach(button => {
        const selected = button.dataset.companyFilter === filterValue;
        button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
      });
      document.querySelector('#company-filter-selection').style.setProperty('--selected-index', Object.keys(filterLabels).indexOf(filterValue));
    }
    if (!visible.length) {
      const filtered = Boolean(query) || filterValue !== 'all';
      target.innerHTML = `<div class="empty-state"><span class="empty-icon">${icon(query ? 'search' : 'book')}</span><h3>${filtered ? '没有符合条件的登记' : '还没有入住登记'}</h3><p>${filtered ? '换个关键词，或查看全部登记。' : '轻点下方“新增入住登记”，填写住客和旅居公司。'}</p>${filtered && inGroup.length ? '<button class="empty-reset" type="button" data-reset>查看全部登记</button>' : ''}</div>`;
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

  function counts(orders) {
    return { all: orders.length, upcoming: orders.filter(order => stayState(order).key === 'upcoming').length, staying: orders.filter(order => stayState(order).key === 'staying').length, finished: orders.filter(order => stayState(order).key === 'finished').length };
  }

  function companyStates(summary) {
    return ['upcoming', 'staying', 'finished'].filter(key => summary[key] > 0).map(key => `<span class="company-state company-state-${key}">${filterLabels[key]} <b>${summary[key]}</b></span>`).join('') || '<span class="company-state">入住信息待确认</span>';
  }

  function nextArrival(orders) {
    const date = orders.map(order => order.arrivalDate).filter(date => date >= today && window.InnArrivals.calendarDay(date) !== null).sort()[0];
    if (!date) return '';
    const todayCount = orders.filter(order => order.arrivalDate === today).length;
    const label = date === today ? `今天 ${todayCount} 条入住` : `下次入住 ${date.slice(0, 4) === today.slice(0, 4) ? '' : date.slice(0, 4) + '年'}${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
    return `<span class="company-next${date === today ? ' company-next-today' : ''}">${icon('calendar')}<span>${label}</span></span>`;
  }

  function updateCompanyShortcuts() {
    const name = orderForm.elements.companyName.value.trim();
    document.querySelectorAll('[data-company-shortcut]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.companyShortcut === name)));
  }

  function renderOverview() {
    const { companies, orders } = store.read();
    const activeCompanies = companies.filter(company => orders.some(order => order.companyId === company.id));
    const summary = document.querySelector('#home-summary');
    summary.hidden = !orders.length;
    summary.textContent = `${activeCompanies.length} 家公司 · ${orders.length} 条入住登记`;
    document.querySelectorAll('[data-home-filter]').forEach(button => {
      const selected = button.dataset.homeFilter === homeFilter;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelector('#directory-filter-selection').style.setProperty('--selected-index', Object.keys(filterLabels).indexOf(homeFilter));
  }

  function renderCompanies() {
    const { companies, orders } = store.read();
    const groups = companies.map(company => ({ ...company, orders: orders.filter(order => order.companyId === company.id) })).filter(company => company.orders.length).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    const unassigned = orders.filter(order => !companies.some(company => company.id === order.companyId));
    if (unassigned.length) groups.push({ id: '', name: '未分类', orders: unassigned });
    const search = document.querySelector('#company-query');
    const query = search.value.trim().toLocaleLowerCase();
    const visible = groups.filter(company => {
      const candidates = company.orders.filter(order => homeFilter === 'all' || stayState(order).key === homeFilter);
      return candidates.length && (!query || company.name.toLocaleLowerCase().includes(query) || candidates.some(order => [order.customerName, order.phone, order.hotelOrder, order.base, order.roomType, order.arrivalDate].join(' ').toLocaleLowerCase().includes(query)));
    });
    const empty = !groups.length;
    document.querySelector('#home-view').dataset.empty = String(empty);
    document.querySelector('#home-onboarding').hidden = !empty;
    document.querySelector('.home-toolbar').hidden = empty;
    document.querySelector('#company-list').hidden = empty;
    document.querySelector('#home-directory-heading').hidden = empty || (homeFilter === 'all' && !query);
    document.querySelector('#company-directory-tools').hidden = empty;
    document.querySelector('#clear-company-query').hidden = !search.value;
    document.querySelector('#company-count').textContent = `${visible.length} 个分类`;
    document.querySelector('#company-statistics-title').textContent = query ? '搜索结果' : homeFilter === 'all' ? '公司分类' : `${filterLabels[homeFilter]}的公司`;
    document.querySelector('#company-list').classList.toggle('directory-is-empty', !visible.length);
    document.querySelector('#company-list').innerHTML = visible.map(company => {
      const summary = counts(company.orders);
      return `<button class="company-row" type="button" data-company-id="${escapeHtml(company.id)}" aria-label="${escapeHtml(company.name)}，${summary.all} 条登记，待入住 ${summary.upcoming}，入住中 ${summary.staying}，已结束 ${summary.finished}，查看住客"><span class="company-symbol" aria-hidden="true">${escapeHtml(Array.from(company.name)[0])}</span><span class="company-row-copy"><span class="company-row-heading"><strong>${escapeHtml(company.name)}</strong><span class="company-total">${summary.all} 条登记</span></span><span class="company-statistics">${companyStates(summary)}</span>${nextArrival(company.orders)}</span>${icon('chevron', 'chevron')}</button>`;
    }).join('') || (groups.length
      ? `<div class="empty-state directory-empty"><span class="empty-icon">${icon('search')}</span><h3>没有符合条件的公司</h3><p>换个关键词，或查看全部公司。</p><button class="empty-reset" type="button" data-company-reset>查看全部公司</button></div>`
      : '');
  }

  function renderCompanyDetail() {
    if (selectedCompanyId === null) return;
    const company = store.read().companies.find(item => item.id === selectedCompanyId);
    const name = company?.name || (selectedCompanyId === '' ? '未分类' : '公司分类');
    document.querySelector('#company-title').textContent = '住客登记';
    document.querySelector('#company-detail-symbol').textContent = Array.from(name)[0] || '旅';
    document.querySelector('#company-name').textContent = name;
    const companies = store.read().companies;
    const orders = readOrders().filter(order => selectedCompanyId ? order.companyId === selectedCompanyId : !companies.some(company => company.id === order.companyId));
    document.querySelector('#company-detail-summary').textContent = `共 ${orders.length} 条入住登记`;
    document.querySelector('#company-detail-states').innerHTML = companyStates(counts(orders));
    renderOrders(document.querySelector('#company-guest-list'), document.querySelector('#company-guest-search').value, companyFilter, selectedCompanyId);
  }

  function render() {
    today = localDate(new Date());
    renderOverview();
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

  function openOverlay(id) {
    navigation.open(id);
  }

  function updateFeeCount() {
    document.querySelector('#fee-count').textContent = `${orderForm.elements.feeDetails.value.length} / 200`;
  }

  function setRegistrationSaving(saving) {
    registrationSaving = saving;
    orderForm.setAttribute('aria-busy', String(saving));
    document.querySelectorAll('#save-order, #save-order-top').forEach(button => { button.disabled = saving; });
  }

  function openForm(order) {
    setRegistrationSaving(false);
    const companies = store.read().companies;
    const company = companies.find(item => item.id === (order ? order.companyId : selectedCompanyId));
    orderForm.reset();
    orderForm.classList.remove('submitted');
    Array.from(orderForm.elements).filter(control => control.name).forEach(control => setFieldError(control, ''));
    document.querySelector('#form-error').hidden = true;
    orderForm.elements.arrivalDate.value = localDate(new Date());
    orderForm.elements.nights.value = '1';
    orderForm.elements.mealIncluded.value = '否';
    orderForm.dataset.id = order ? order.id : '';
    orderForm.elements.companyName.value = company?.name || '';
    document.querySelector('#company-suggestions').innerHTML = companies.map(item => `<option value="${escapeHtml(item.name)}"></option>`).join('');
    const usedIds = [...new Set([company?.id, ...readOrders().map(item => item.companyId)].filter(Boolean))];
    const recentCompanies = usedIds.map(id => companies.find(item => item.id === id)).filter(Boolean).slice(0, 4);
    const shortcuts = document.querySelector('#company-shortcuts');
    shortcuts.hidden = !recentCompanies.length;
    shortcuts.innerHTML = recentCompanies.map(item => `<button type="button" data-company-shortcut="${escapeHtml(item.name)}" aria-pressed="false" aria-label="使用旅居公司：${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>`).join('');
    updateCompanyShortcuts();

    if (order) {
      const normalized = normalizeOrder(order);
      for (const [key, value] of Object.entries(normalized)) {
        if (orderForm.elements.namedItem(key)) orderForm.elements[key].value = value ?? '';
      }
      document.querySelector('#form-title').textContent = '修改登记';
      document.querySelector('#save-order span').textContent = '保存修改';
      document.querySelector('#save-order-top').setAttribute('aria-label', '保存修改');
      document.querySelector('#delete-order').hidden = false;
    } else {
      document.querySelector('#form-title').textContent = '新增登记';
      document.querySelector('#save-order span').textContent = '保存登记';
      document.querySelector('#save-order-top').setAttribute('aria-label', '保存登记');
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
      companyId: old?.companyId || '',
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
  document.querySelector('#add-order').addEventListener('click', () => openForm());
  document.querySelector('#company-query').addEventListener('input', renderCompanies);
  document.querySelector('#clear-company-query').addEventListener('click', () => { document.querySelector('#company-query').value = ''; renderCompanies(); document.querySelector('#company-query').focus(); });
  document.querySelectorAll('[data-home-filter]').forEach(button => button.addEventListener('click', () => { homeFilter = button.dataset.homeFilter; renderOverview(); renderCompanies(); }));
  document.querySelector('#home-onboarding').addEventListener('click', event => {
    const button = event.target.closest('[data-home-action]');
    if (!button) return;
    button.focus({ preventScroll: true });
    const action = button.dataset.homeAction;
    if (action === 'register') openForm();
    else if (action === 'join' || action === 'restore') openBackup(action);
  });
  document.querySelector('#company-list').addEventListener('click', event => {
    if (event.target.closest('[data-company-reset]')) { homeFilter = 'all'; document.querySelector('#company-query').value = ''; renderOverview(); renderCompanies(); return; }
    const company = event.target.closest('[data-company-id]');
    if (company) openCompany(company.dataset.companyId);
  });
  document.querySelector('#company-shortcuts').addEventListener('click', event => {
    const button = event.target.closest('[data-company-shortcut]');
    if (!button) return;
    orderForm.elements.companyName.value = button.dataset.companyShortcut;
    orderForm.elements.companyName.dispatchEvent(new Event('input', { bubbles: true }));
  });
  document.querySelector('#add-company-guest').addEventListener('click', () => openForm());
  document.querySelector('#company-guest-search').addEventListener('input', renderCompanyDetail);
  document.querySelector('#clear-company-guest-search').addEventListener('click', () => { document.querySelector('#company-guest-search').value = ''; renderCompanyDetail(); document.querySelector('#company-guest-search').focus(); });
  document.querySelectorAll('[data-company-filter]').forEach(button => button.addEventListener('click', () => { companyFilter = button.dataset.companyFilter; renderCompanyDetail(); }));
  window.addEventListener('innviewchange', event => {
    if (event.detail.id === 'company-overlay') {
      selectedCompanyId = event.detail.context.companyId ?? '';
      highlightedOrderId = event.detail.context.orderId || '';
      renderCompanyDetail();
      if (selectedCompanyId && !store.read().companies.some(company => company.id === selectedCompanyId) && document.querySelector('#company-overlay').dataset.state === 'open') closeOverlay('company-overlay');
    } else if (!event.detail.id) {
      selectedCompanyId = null;
      refreshCalendar();
    }
  });
  function openBackup(section = '') {
    backupData.value = '';
    const data = store.read();
    document.querySelector('#backup-count').textContent = `${data.companies.length} 家公司 · ${data.orders.length} 条客人登记`;
    if (section) {
      // Wait for the sheet to finish opening so navigation cannot steal the input focus.
      const observer = new MutationObserver(() => {
        if (backupOverlay.dataset.state === 'open') {
          observer.disconnect();
          if (section === 'restore') {
            backupData.closest('.import-section').scrollIntoView({ block: 'start' });
            backupData.focus({ preventScroll: true });
          } else if (!window.InnSync?.status().connected) {
            document.querySelector('#sync-open-join').click();
            document.querySelector('#sync-join-form').scrollIntoView({ block: 'center' });
          } else {
            document.querySelector('#sync-connected').scrollIntoView({ block: 'center' });
            document.querySelector('#sync-now').focus({ preventScroll: true });
          }
        } else if (backupOverlay.hidden) observer.disconnect();
      });
      observer.observe(backupOverlay, { attributes: true, attributeFilter: ['data-state', 'hidden'] });
    }
    openOverlay('backup-overlay');
  }
  document.querySelector('#open-backup').addEventListener('click', () => openBackup());
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
    if (registrationSaving || formOverlay.hidden || formOverlay.inert) return;
    orderForm.classList.add('submitted');
    const invalid = Array.from(orderForm.elements).filter(control => control.name && !validateField(control));
    if (invalid.length) {
      invalid[0].focus({ preventScroll: true });
      invalid[0].closest('.field').scrollIntoView({ block: 'center' });
      return;
    }
    setRegistrationSaving(true);
    try {
      const order = getFormOrder();
      store.saveRegistration(order, orderForm.elements.companyName.value);
      orderForm.dataset.id = order.id;
      homeFilter = 'all';
      document.querySelector('#company-query').value = '';
      closeOverlay('form-overlay');
      companyFilter = 'all';
      document.querySelector('#company-guest-search').value = '';
      render();
      showToast('登记已保存');
    } catch (error) {
      setRegistrationSaving(false);
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
    if (event.target.name === 'companyName') updateCompanyShortcuts();
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
