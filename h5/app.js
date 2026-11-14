(function () {
  'use strict';

  let today = localDate(new Date());
  let toastTimer;
  let calendarTimer;
  let arrivalView = 'arrivals';
  let arrivalsExpanded = false;
  let highlightedOrderId = '';
  let registrationSaving = false;
  let registrationAttempt = 0;
  let directoryMode = 'companies';
  let selectedAnchorKey = null;
  let anchorMonth = today.slice(0, 7);
  let selectedStayPackage = '7';
  const filterLabels = { all: '全部登记', upcoming: '待入住', staying: '入住中', finished: '已离店' };
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
  const requiredMessages = { companyName: '请填写旅居公司名称', hotelOrder: '请填写旅店或订单名称', base: '请填写入住基地', anchorName: '登记主播最多 30 字', customerName: '请填写客户姓名', phone: '请填写客户电话', arrivalDate: '请选择入住时间', departureDate: '离店日期必须晚于入住日期', nights: '入住天数应为至少 1 晚的整数', guestCount: '请填写入住人数', roomType: '请填写入住房型' };

  function localDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const normalizeOrder = window.InnStorage.normalizeOrder;
  const store = window.InnStorage.createStore(localStorage);
  const money = window.InnMoney;
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

  function confirmAction({ title, message, accept, records = [], destructive = false, opener = document.activeElement }) {
    if (confirmation.open) return Promise.resolve(false);
    document.querySelector('#confirm-title').textContent = title;
    document.querySelector('#confirm-description').textContent = message;
    document.querySelector('#confirm-accept').textContent = accept;
    const duplicates = document.querySelector('#duplicate-records');
    duplicates.hidden = !records.length;
    const companies = store.read().companies;
    duplicates.innerHTML = records.map(({ order, reasons }) => `<article class="duplicate-record"><div><strong>${escapeHtml(order.customerName)}</strong><span>${escapeHtml(reasons.join(' · '))}</span></div><p>${escapeHtml(order.phone)}</p><p>${escapeHtml(companies.find(company => company.id === order.companyId)?.name || '未分类')} · ${escapeHtml(order.hotelOrder)}</p><p>${escapeHtml(order.arrivalDate)} 入住 → ${escapeHtml(window.InnArrivals.departureDate(order))} 离店</p>${order.anchorName ? `<p>主播：${escapeHtml(order.anchorName)}</p>` : ''}</article>`).join('');
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
    if (['incomeAmount', 'costAmount'].includes(control.name)) {
      try { money.parse(control.value); control.setCustomValidity(''); }
      catch (error) { control.setCustomValidity(error.message); }
    }
    const invalid = !control.validity.valid || (control.required && !control.value.trim());
    const message = ['incomeAmount', 'costAmount'].includes(control.name) ? control.validationMessage : control.name === 'phone' && control.value.trim() ? '请输入有效联系电话（6–20 位）' : requiredMessages[control.name];
    setFieldError(control, invalid ? message : '');
    return !invalid;
  }

  function syncNightsStepper() {
    document.querySelector('[data-step="-1"]').disabled = Number(orderForm.elements.nights.value) <= 1;
  }

  function synchronizeStayDates(source) {
    const { arrivalDate, departureDate, nights } = orderForm.elements;
    const calendar = window.InnArrivals;
    const start = calendar.calendarDay(arrivalDate.value);
    const end = calendar.calendarDay(departureDate.value);
    if (['arrivalDate', 'stayPackage'].includes(source) && selectedStayPackage && start !== null) {
      departureDate.value = calendar.packageDeparture(arrivalDate.value, selectedStayPackage);
      const checkout = calendar.calendarDay(departureDate.value);
      if (checkout !== null) nights.value = String(checkout - start);
    }
    else if (source === 'departureDate' && start !== null && end !== null && end > start) nights.value = String(end - start);
    else if (['arrivalDate', 'nights'].includes(source) && start !== null && Number.isInteger(Number(nights.value)) && Number(nights.value) > 0) departureDate.value = calendar.dateAfter(arrivalDate.value, Number(nights.value));
    departureDate.min = calendar.dateAfter(arrivalDate.value, 1);
    const checkout = calendar.calendarDay(departureDate.value);
    departureDate.setCustomValidity(start !== null && checkout !== null && checkout <= start ? requiredMessages.departureDate : '');
    if (start !== null && checkout !== null && checkout > start) selectedStayPackage = calendar.stayPackage({ arrivalDate: arrivalDate.value, departureDate: departureDate.value });
    document.querySelectorAll('[data-stay-package]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.stayPackage === selectedStayPackage)));
    const label = selectedStayPackage === 'month' ? '一个月' : selectedStayPackage ? `${selectedStayPackage} 天` : '按实际日期';
    document.querySelector('#stay-package-note').textContent = start !== null && checkout !== null && checkout > start
      ? `${label} · ${departureDate.value.replace(/-/g, '.')} 离店，共 ${checkout - start} 晚${selectedStayPackage === 'month' ? '。按入住日顺延一个月，遇月末取下月最后一天。' : ''}`
      : '选择入住日期后，自动计算离店日期与实际晚数。';
    syncNightsStepper();
  }

  function monthLabel(month) {
    return month ? `${month.slice(0, 4)}年${Number(month.slice(5))}月` : '全部月份';
  }

  function packageBreakdown(orders, compact = false) {
    const summary = window.InnArrivals.packageSummary(orders);
    const labels = { '7': '7 天', '14': '14 天', month: '一个月' };
    const list = ['7', '14', 'month'].map(key => compact
      ? `<span>${labels[key]} <b>${summary[key]}</b></span>`
      : `<div><dt>${labels[key]}</dt><dd data-package-count="${key}">${summary[key]} <span>单</span></dd>${packageRevenue(orders, key)}</div>`).join('');
    return compact ? `<span class="anchor-package-line">${list}</span>${summary.other ? `<span class="anchor-custom-line">其他天数 ${summary.other} 单</span>` : ''}`
      : `<dl class="package-counts" aria-label="按入住时长统计">${list}</dl>${summary.other ? `<p class="package-other">另有 ${summary.other} 单为其他天数，已计入总单量</p>` : ''}`;
  }

  function renderMonthlySummary(element, orders, subtitle) {
    element.innerHTML = `<div class="anchor-month-overview"><div><p class="anchor-month-caption">${escapeHtml(monthLabel(anchorMonth))}登记</p><p class="anchor-month-number"><strong data-month-order-count>${orders.length}</strong><span>单</span></p></div><p class="anchor-month-context">${subtitle.split(' · ').map(line => `<span>${escapeHtml(line)}</span>`).join('')}</p></div>${revenueSummary(orders)}${packageBreakdown(orders)}`;
  }

  function revenueSummary(orders) {
    const summary = money.summarize(orders);
    const labels = { income: '订单收入', cost: '成本支出', net: '净收益' };
    const entries = Object.entries(labels).map(([key, label]) => `<div><dt>${label}</dt><dd data-revenue="${key}" data-cents="${summary[key]}" class="${key === 'net' && summary.net < 0 ? 'amount-negative' : ''}">${escapeHtml(money.display(summary, key))}</dd></div>`).join('');
    return `<dl class="revenue-totals" aria-label="月度金额汇总">${entries}</dl><p class="revenue-note">${summary.pendingCount ? `${summary.pendingCount} 单待补金额，未填项暂不计入。` : ''}净收益 = 收入 − 成本。</p>`;
  }

  function packageRevenue(orders, key) {
    const summary = money.summarize(orders.filter(order => window.InnArrivals.stayPackage(order) === key));
    return `<dd class="package-money"><span>收入</span><strong data-package-income="${key}" data-cents="${summary.income}">${escapeHtml(money.display(summary, 'income'))}</strong><span>净收益</span><strong data-package-net="${key}" data-cents="${summary.net}" class="${summary.net < 0 ? 'amount-negative' : ''}">${escapeHtml(money.display(summary, 'net'))}</strong></dd>`;
  }

  function anchorRevenue(orders) {
    const summary = money.summarize(orders);
    return `<span class="anchor-revenue-line"><span>收入 <b data-anchor-income data-cents="${summary.income}">${escapeHtml(money.display(summary, 'income'))}</b></span><span>净收益 <b data-anchor-net data-cents="${summary.net}" class="${summary.net < 0 ? 'amount-negative' : ''}">${escapeHtml(money.display(summary, 'net'))}</b></span></span>${summary.pendingCount ? `<span class="anchor-custom-line">${summary.pendingCount} 单待补金额</span>` : ''}`;
  }

  function updateRevenuePreview() {
    const preview = document.querySelector('#revenue-preview');
    try {
      const income = money.parse(orderForm.elements.incomeAmount.value), cost = money.parse(orderForm.elements.costAmount.value);
      preview.textContent = income === '' || cost === '' ? '净收益 = 收入 − 成本。无成本请填 0，未填金额暂不计入汇总。' : `本单净收益 ${money.format(income - cost)}`;
    } catch { preview.textContent = '请输入有效金额，最多保留两位小数。'; }
  }

  function stayState(order) {
    return window.InnArrivals.stayState(order, today);
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
    const inGroup = selectedAnchorKey !== null
      ? orders.filter(order => window.InnStorage.nameKey(order.anchorName) === selectedAnchorKey && (!anchorMonth || window.InnStorage.registrationMonth(order) === anchorMonth))
      : orders.filter(order => companyId ? order.companyId === companyId : !companies.some(company => company.id === order.companyId));
    const visible = inGroup.filter(order => (filterValue === 'all' || stayState(order).key === filterValue) && (!query || [
      order.hotelOrder, order.base, order.anchorName, order.customerName, order.phone, order.arrivalDate, window.InnArrivals.departureDate(order), order.roomType,
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
        <div class="stay-line">${icon('calendar')}<time datetime="${escapeHtml(order.arrivalDate)}">${escapeHtml(order.arrivalDate.replace(/-/g, '.'))}</time><span class="stay-caption">入住</span><span class="night-tag">${escapeHtml(normalizeOrder(order).nights)} 晚</span></div>
        <div class="departure-line"><time datetime="${escapeHtml(window.InnArrivals.departureDate(order))}">${escapeHtml(window.InnArrivals.departureDate(order).replace(/-/g, '.'))}</time><span>离店</span></div>
        ${order.anchorName || selectedAnchorKey !== null ? `<div class="order-attribution">${order.anchorName ? `<span>主播 · ${escapeHtml(order.anchorName)}</span>` : ''}${selectedAnchorKey !== null ? `<span>${escapeHtml(companies.find(company => company.id === order.companyId)?.name || '未分类')}</span>` : ''}</div>` : ''}
        <div class="stay-details"><span class="room-type">${escapeHtml(order.roomType)}</span><span>${escapeHtml(order.guestCount)}</span><span>${order.mealIncluded === '是' ? '含餐' : '不含餐'}</span></div>
        <div class="order-location"><span class="hotel-order">${escapeHtml(order.hotelOrder || '未填写订单名称')}</span><span class="base-line">${escapeHtml(order.base || '未填写基地')}</span></div>
        ${order.feeDetails ? `<div class="fee-line"><span class="fee-label">费用</span><span class="fee-value">${escapeHtml(order.feeDetails)}</span></div>` : ''}
        <div class="order-money">${anchorRevenue([order])}</div>
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

  function updateAnchorRecognition() {
    const name = orderForm.elements.anchorName.value.trim();
    const group = window.InnStorage.groupByAnchor(readOrders(), localDate(new Date()).slice(0, 7)).find(item => item.id === window.InnStorage.nameKey(name));
    document.querySelector('#anchor-recognition').textContent = name ? `自动归入「${group?.name || name}」 · 本月 ${group?.orders.length || 0} 单。保存后下次默认沿用。` : '输入主播姓名或选择已有主播，保存后下次默认沿用。';
    const picker = document.querySelector('#anchor-picker');
    picker.value = Array.from(picker.options).find(option => window.InnStorage.nameKey(option.value) === window.InnStorage.nameKey(name))?.value || '';
  }

  function renderAnchorPicker() {
    const names = window.InnStorage.groupByAnchor(readOrders()).filter(group => group.id).map(group => group.name);
    const remembered = store.preferredAnchor();
    if (remembered && !names.some(name => window.InnStorage.nameKey(name) === window.InnStorage.nameKey(remembered))) names.push(remembered);
    names.sort((a, b) => a.localeCompare(b, 'zh-CN'));
    document.querySelector('#anchor-suggestions').innerHTML = names.map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
    document.querySelector('#anchor-picker').innerHTML = '<option value="">不填写主播</option>' + names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    document.querySelector('#anchor-picker-wrap').hidden = !names.length;
  }

  function renderOverview() {
    const { companies, orders } = store.read();
    const activeCompanies = companies.filter(company => orders.some(order => order.companyId === company.id));
    const summary = document.querySelector('#home-summary');
    summary.hidden = !orders.length || directoryMode === 'anchors';
    const homeRevenue = document.querySelector('#home-revenue');
    homeRevenue.hidden = !orders.length || directoryMode !== 'companies';
    const currentRevenue = money.summarize(orders.filter(order => window.InnStorage.registrationMonth(order) === today.slice(0, 7)));
    document.querySelector('#home-revenue-copy').textContent = `本月收入 ${money.display(currentRevenue, 'income')} · 净收益 ${money.display(currentRevenue, 'net')}`;
    const anchorGroups = directoryMode === 'anchors' ? window.InnStorage.groupByAnchor(orders, anchorMonth).filter(group => group.orders.length) : [];
    summary.textContent = directoryMode === 'anchors' ? `${anchorGroups.length} 个主播分类 · ${anchorMonth ? '所选月份' : '累计'} ${anchorGroups.reduce((sum, group) => sum + group.orders.length, 0)} 单` : `${activeCompanies.length} 家公司 · ${orders.length} 条入住登记`;
    document.querySelector('#home-title').textContent = directoryMode === 'anchors' ? '主播订单' : '旅居公司';
    document.querySelector('#directory-modes').hidden = !orders.length;
    document.querySelectorAll('[data-directory-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.directoryMode === directoryMode)));
    document.querySelector('#anchor-period').hidden = directoryMode !== 'anchors';
    document.querySelector('#anchor-month-summary').hidden = directoryMode !== 'anchors' || !orders.length;
    if (directoryMode === 'anchors') renderMonthlySummary(document.querySelector('#anchor-month-summary'), anchorGroups.flatMap(group => group.orders), `${anchorGroups.filter(group => group.id).length} 位主播${anchorGroups.some(group => !group.id) ? '，含未填写主播记录' : ''} · 按登记时间统计`);
    document.querySelector('#anchor-month').value = anchorMonth;
    document.querySelector('#anchor-all-months').setAttribute('aria-pressed', String(!anchorMonth));
    document.querySelector('#anchor-current-month').setAttribute('aria-pressed', String(anchorMonth === today.slice(0, 7)));
    const search = document.querySelector('#company-query');
    search.placeholder = directoryMode === 'anchors' ? '搜索主播、住客或电话' : '搜索公司或住客';
    search.setAttribute('aria-label', directoryMode === 'anchors' ? '搜索主播或住客' : '搜索旅居公司或住客');
    document.querySelectorAll('[data-home-filter]').forEach(button => {
      const selected = button.dataset.homeFilter === homeFilter;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelector('#directory-filter-selection').style.setProperty('--selected-index', Object.keys(filterLabels).indexOf(homeFilter));
  }

  function renderCompanies() {
    const { companies, orders } = store.read();
    const anchors = directoryMode === 'anchors';
    const groups = anchors ? window.InnStorage.groupByAnchor(orders, anchorMonth) : companies.map(company => ({ ...company, orders: orders.filter(order => order.companyId === company.id) })).filter(company => company.orders.length).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    const unassigned = orders.filter(order => !companies.some(company => company.id === order.companyId));
    if (!anchors && unassigned.length) groups.push({ id: '', name: '未分类', orders: unassigned });
    const search = document.querySelector('#company-query');
    const query = search.value.trim().toLocaleLowerCase();
    const visible = groups.filter(company => {
      const candidates = company.orders.filter(order => homeFilter === 'all' || stayState(order).key === homeFilter);
      return candidates.length && (!query || company.name.toLocaleLowerCase().includes(query) || candidates.some(order => [order.customerName, order.phone, order.anchorName, order.hotelOrder, order.base, order.roomType, order.arrivalDate].join(' ').toLocaleLowerCase().includes(query)));
    });
    const empty = !orders.length;
    document.querySelector('#home-view').dataset.empty = String(empty);
    document.querySelector('#home-onboarding').hidden = !empty;
    document.querySelector('.home-toolbar').hidden = empty;
    document.querySelector('#company-list').hidden = empty;
    document.querySelector('#home-directory-heading').hidden = empty || (homeFilter === 'all' && !query);
    document.querySelector('#company-directory-tools').hidden = empty;
    document.querySelector('#clear-company-query').hidden = !search.value;
    document.querySelector('#company-count').textContent = `${visible.length} 个分类`;
    document.querySelector('#company-statistics-title').textContent = query ? '搜索结果' : anchors ? (anchorMonth ? `${Number(anchorMonth.slice(5))}月登记订单` : '全部主播订单') : homeFilter === 'all' ? '公司分类' : `${filterLabels[homeFilter]}的公司`;
    document.querySelector('#company-list').setAttribute('aria-label', anchors ? '主播订单分类' : '旅居公司分类');
    document.querySelector('#company-list').classList.toggle('directory-is-empty', !visible.length);
    document.querySelector('#company-list').innerHTML = visible.map(company => {
      const summary = counts(company.orders);
      const total = anchors ? `${summary.all} 单` : `${summary.all} 条登记`;
      return `<button class="company-row${anchors ? ' anchor-order-row' : ''}" type="button" ${anchors ? 'data-anchor-key' : 'data-company-id'}="${escapeHtml(company.id)}" aria-label="${escapeHtml(company.name)}，${anchors ? escapeHtml(monthLabel(anchorMonth)) + " " : ""}${total}${anchors ? "，收入 " + escapeHtml(money.display(money.summarize(company.orders), "income")) + "，净收益 " + escapeHtml(money.display(money.summarize(company.orders), "net")) : ""}，待入住 ${summary.upcoming}，入住中 ${summary.staying}，已离店 ${summary.finished}，查看订单"><span class="company-symbol" aria-hidden="true">${escapeHtml(Array.from(company.name)[0])}</span><span class="company-row-copy"><span class="company-row-heading"><strong>${escapeHtml(company.name)}</strong><span class="company-total">${total}</span></span>${anchors ? `<span class="anchor-total">${escapeHtml(monthLabel(anchorMonth))} · 累计 ${company.total} 单</span>${anchorRevenue(company.orders)}${packageBreakdown(company.orders, true)}` : ''}<span class="company-statistics">${companyStates(summary)}</span>${anchors ? '' : nextArrival(company.orders)}</span>${icon('chevron', 'chevron')}</button>`;
    }).join('') || (orders.length
      ? `<div class="empty-state directory-empty"><span class="empty-icon">${icon('search')}</span><h3>${anchors ? '这个月份暂无符合条件的订单' : '没有符合条件的公司'}</h3><p>${anchors ? '换个登记月份，或查看全部月份。' : '换个关键词，或查看全部公司。'}</p><button class="empty-reset" type="button" data-company-reset>${anchors ? '查看全部主播订单' : '查看全部公司'}</button></div>`
      : '');
  }

  function renderCompanyDetail() {
    if (selectedCompanyId === null && selectedAnchorKey === null) return;
    const anchor = selectedAnchorKey === null ? null : window.InnStorage.groupByAnchor(readOrders(), anchorMonth).find(group => group.id === selectedAnchorKey);
    const company = store.read().companies.find(item => item.id === selectedCompanyId);
    const name = selectedAnchorKey !== null ? anchor?.name || '主播订单' : company?.name || (selectedCompanyId === '' ? '未分类' : '公司分类');
    document.querySelector('#company-title').textContent = selectedAnchorKey !== null ? '主播订单' : '住客登记';
    document.querySelector('#company-detail-symbol').textContent = Array.from(name)[0] || '旅';
    document.querySelector('#company-name').textContent = name;
    const companies = store.read().companies;
    const orders = selectedAnchorKey !== null ? anchor?.orders || [] : readOrders().filter(order => selectedCompanyId ? order.companyId === selectedCompanyId : !companies.some(company => company.id === order.companyId));
    document.querySelector('#company-detail-summary').textContent = selectedAnchorKey !== null ? `${anchorMonth ? anchorMonth.replace('-', '年') + '月' : '全部月份'} · ${orders.length} 单 · 累计 ${anchor?.total || 0} 单` : `共 ${orders.length} 条入住登记`;
    document.querySelector('#company-detail-states').innerHTML = companyStates(counts(orders));
    document.querySelector('#anchor-detail-month-summary').hidden = selectedAnchorKey === null;
    if (selectedAnchorKey !== null) renderMonthlySummary(document.querySelector('#anchor-detail-month-summary'), orders, `${name} · 累计 ${anchor?.total || 0} 单`);
    renderOrders(document.querySelector('#company-guest-list'), document.querySelector('#company-guest-search').value, companyFilter, selectedCompanyId);
  }

  function render() {
    const date = localDate(new Date());
    if (anchorMonth === today.slice(0, 7) && date.slice(0, 7) !== today.slice(0, 7)) anchorMonth = date.slice(0, 7);
    today = date;
    renderOverview();
    renderCompanies();
    renderArrivalReminders();
    renderCompanyDetail();
    const data = store.read();
    document.querySelector('#backup-count').textContent = `${data.companies.length} 家公司 · ${data.orders.length} 条客人登记`;
    if (!formOverlay.hidden && !formOverlay.inert) {
      renderAnchorPicker();
      updateAnchorRecognition();
    }
  }

  function openCompany(id, orderId = '') {
    if (id && !store.read().companies.some(company => company.id === id)) return;
    selectedCompanyId = id;
    selectedAnchorKey = null;
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

  function openAnchor(key) {
    selectedCompanyId = null;
    selectedAnchorKey = key;
    highlightedOrderId = '';
    companyFilter = 'all';
    document.querySelector('#company-guest-search').value = '';
    renderCompanyDetail();
    navigation.open('company-overlay', { anchorKey: key, month: anchorMonth });
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
    registrationAttempt++;
    setRegistrationSaving(false);
    const companies = store.read().companies;
    const company = companies.find(item => item.id === (order ? order.companyId : selectedCompanyId));
    orderForm.reset();
    orderForm.classList.remove('submitted');
    Array.from(orderForm.elements).filter(control => control.name).forEach(control => setFieldError(control, ''));
    document.querySelector('#form-error').hidden = true;
    orderForm.elements.arrivalDate.value = localDate(new Date());
    selectedStayPackage = '7';
    orderForm.elements.nights.value = '7';
    orderForm.elements.departureDate.value = window.InnArrivals.dateAfter(orderForm.elements.arrivalDate.value, 7);
    orderForm.elements.anchorName.value = selectedAnchorKey !== null ? window.InnStorage.groupByAnchor(readOrders()).find(group => group.id === selectedAnchorKey)?.orders[0]?.anchorName || '' : store.preferredAnchor();
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
      orderForm.elements.incomeAmount.value = money.input(normalized.incomeCents);
      orderForm.elements.costAmount.value = money.input(normalized.costCents);
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
    updateRevenuePreview();
    renderAnchorPicker();
    updateAnchorRecognition();
    synchronizeStayDates('departureDate');
    navigation.open('form-overlay', { companyId: selectedCompanyId, anchorKey: selectedAnchorKey, orderId: order?.id || '' });
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
      anchorName: values.anchorName.trim(),
      customerName: values.customerName.trim(),
      phone: values.phone.trim(),
      arrivalDate: values.arrivalDate,
      departureDate: values.departureDate,
      nights,
      guestCount: values.guestCount.trim(),
      roomType: values.roomType.trim(),
      mealIncluded: values.mealIncluded,
      feeDetails: values.feeDetails.trim(),
      incomeCents: money.parse(values.incomeAmount), costCents: money.parse(values.costAmount),
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
  document.querySelector('#anchor-picker').addEventListener('change', event => {
    orderForm.elements.anchorName.value = event.target.value;
    orderForm.elements.anchorName.dispatchEvent(new Event('input', { bubbles: true }));
  });
  document.querySelectorAll('[data-directory-mode]').forEach(button => button.addEventListener('click', () => {
    directoryMode = button.dataset.directoryMode;
    homeFilter = 'all';
    document.querySelector('#company-query').value = '';
    renderOverview(); renderCompanies();
  }));
  document.querySelector('#anchor-month').addEventListener('input', event => {
    anchorMonth = /^\d{4}-\d{2}$/.test(event.target.value) ? event.target.value : '';
    renderOverview(); renderCompanies();
  });
  document.querySelector('#anchor-all-months').addEventListener('click', () => { anchorMonth = ''; renderOverview(); renderCompanies(); });
  document.querySelector('#anchor-current-month').addEventListener('click', () => { anchorMonth = today.slice(0, 7); renderOverview(); renderCompanies(); });
  document.querySelector('#home-revenue').addEventListener('click', () => {
    directoryMode = 'anchors'; anchorMonth = today.slice(0, 7); homeFilter = 'all';
    document.querySelector('#company-query').value = ''; renderOverview(); renderCompanies();
  });
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
    if (event.target.closest('[data-company-reset]')) { homeFilter = 'all'; if (directoryMode === 'anchors') anchorMonth = ''; document.querySelector('#company-query').value = ''; renderOverview(); renderCompanies(); return; }
    const anchor = event.target.closest('[data-anchor-key]');
    if (anchor) { openAnchor(anchor.dataset.anchorKey); return; }
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
      selectedAnchorKey = event.detail.context.anchorKey ?? null;
      selectedCompanyId = selectedAnchorKey !== null ? null : event.detail.context.companyId ?? '';
      if (selectedAnchorKey !== null) anchorMonth = event.detail.context.month ?? anchorMonth;
      highlightedOrderId = event.detail.context.orderId || '';
      renderCompanyDetail();
      if (selectedCompanyId && !store.read().companies.some(company => company.id === selectedCompanyId) && document.querySelector('#company-overlay').dataset.state === 'open') closeOverlay('company-overlay');
    } else if (!event.detail.id) {
      selectedCompanyId = null;
      selectedAnchorKey = null;
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

  orderForm.addEventListener('submit', async (event) => {
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
    const attempt = registrationAttempt;
    try {
      const isNew = !orderForm.dataset.id;
      const order = getFormOrder();
      const companyName = orderForm.elements.companyName.value;
      const reviewed = new Set();
      let duplicates = window.InnStorage.findDuplicates(order, readOrders());
      while (duplicates.some(match => !reviewed.has(match.order.id))) {
        const accepted = await confirmAction({ title: '发现相同姓名或电话', message: `有 ${duplicates.length} 条已有登记与本次相同，请核对订单。确认是新订单后再继续保存。`, accept: '确认，继续下单', records: duplicates, opener: event.submitter || document.querySelector('#save-order-top') });
        if (attempt !== registrationAttempt) return;
        if (!accepted || formOverlay.hidden || formOverlay.inert) { setRegistrationSaving(false); return; }
        duplicates.forEach(match => reviewed.add(match.order.id));
        duplicates = window.InnStorage.findDuplicates(order, readOrders());
      }
      const savedOrder = store.saveRegistration(order, companyName);
      orderForm.dataset.id = order.id;
      let remembered = true;
      if (isNew) {
        try { store.rememberAnchor(savedOrder.anchorName); }
        catch { remembered = false; }
      }
      homeFilter = 'all';
      document.querySelector('#company-query').value = '';
      closeOverlay('form-overlay');
      companyFilter = 'all';
      document.querySelector('#company-guest-search').value = '';
      render();
      showToast(remembered ? '登记已保存' : '登记已保存，但未能记住默认主播');
    } catch (error) {
      if (attempt !== registrationAttempt) return;
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
  document.querySelectorAll('[data-stay-package]').forEach(button => button.addEventListener('click', () => {
    selectedStayPackage = button.dataset.stayPackage;
    synchronizeStayDates('stayPackage');
    if (orderForm.classList.contains('submitted')) ['arrivalDate', 'departureDate', 'nights'].forEach(name => validateField(orderForm.elements[name]));
  }));
  orderForm.addEventListener('input', event => {
    if (['incomeAmount', 'costAmount'].includes(event.target.name)) updateRevenuePreview();
    if (['arrivalDate', 'departureDate', 'nights'].includes(event.target.name)) {
      synchronizeStayDates(event.target.name);
      if (orderForm.classList.contains('submitted')) ['arrivalDate', 'departureDate', 'nights'].forEach(name => validateField(orderForm.elements[name]));
    }
    if (event.target.name === 'companyName') updateCompanyShortcuts();
    if (event.target.name === 'anchorName') updateAnchorRecognition();
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
    synchronizeStayDates('nights');
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
