const { dateString, getOrderStatus, getOrders, makeBackup, mergeOrders, parseBackup } = require('../../utils/orders');

Page({
  data: {
    query: '',
    orders: [],
    orderCount: 0,
    todayLabel: '',
    hasData: false,
    activeFilter: 'all',
    filterTitle: '全部登记',
    filters: [{ key: 'all', label: '全部' }, { key: 'upcoming', label: '待入住' }, { key: 'staying', label: '入住中' }, { key: 'finished', label: '已结束' }]
  },

  onShow() {
    this.refreshOrders();
  },

  onPullDownRefresh() {
    this.refreshOrders();
    wx.stopPullDownRefresh();
  },

  refreshOrders() {
    const allOrders = getOrders();
    const query = this.data.query.trim().toLowerCase();
    const labels = { '待入住': 'upcoming', '入住中': 'staying', '已离店': 'finished' };
    const prepared = allOrders.map(order => {
      const status = getOrderStatus(order);
      return { ...order, statusKey: labels[status], statusLabel: status === '已离店' ? '已结束' : status, dateDisplay: order.arrivalDate.replace(/-/g, '.') };
    });
    const orders = prepared
      .filter(order => this.data.activeFilter === 'all' || order.statusKey === this.data.activeFilter)
      .filter((order) => !query || [
        order.hotelOrder,
        order.base,
        order.customerName,
        order.phone,
        order.arrivalDate,
        order.guestCount,
        order.roomType,
        order.mealIncluded,
        order.feeDetails
      ].join(' ').toLowerCase().includes(query))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    this.setData({
      orders,
      orderCount: orders.length,
      hasData: allOrders.length > 0,
      filterTitle: this.data.activeFilter === 'all' ? '全部登记' : this.data.filters.find(item => item.key === this.data.activeFilter).label,
      todayLabel: `${new Date().getMonth() + 1}月${new Date().getDate()}日 星期${'日一二三四五六'[new Date().getDay()]}`
    });
  },

  onSearch(event) {
    this.setData({ query: event.detail.value }, () => this.refreshOrders());
  },

  onClearSearch() {
    this.setData({ query: '' }, () => this.refreshOrders());
  },

  onFilter(event) {
    this.setData({ activeFilter: event.currentTarget.dataset.filter }, () => this.refreshOrders());
  },

  onResetFilter() {
    this.setData({ activeFilter: 'all', query: '' }, () => this.refreshOrders());
  },

  onAddOrder() {
    this.setData({ activeFilter: 'all', query: '' });
    wx.navigateTo({ url: '/pages/form/form' });
  },

  onOpenOrder(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/form/form?id=${encodeURIComponent(id)}` });
  },

  onCallCustomer(event) {
    const phoneNumber = event.currentTarget.dataset.phone;
    if (!phoneNumber) return;
    wx.makePhoneCall({ phoneNumber: String(phoneNumber).replace(/[\s-]/g, '') });
  },

  onBackupMenu() {
    wx.showActionSheet({
      itemList: ['复制本机备份', '从剪贴板导入'],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) this.copyBackup();
        if (tapIndex === 1) this.importFromClipboard();
      }
    });
  },

  copyBackup() {
    const orders = getOrders();
    wx.setClipboardData({
      data: JSON.stringify(makeBackup(orders)),
      success: () => wx.showToast({ title: `已复制 ${orders.length} 条`, icon: 'success' }),
      fail: () => wx.showToast({ title: '备份复制失败', icon: 'none' })
    });
  },

  importFromClipboard() {
    wx.getClipboardData({
      success: ({ data }) => {
        let imported;
        try {
          imported = parseBackup(data);
        } catch (error) {
          wx.showToast({ title: error.message || '备份格式不正确', icon: 'none' });
          return;
        }
        wx.showModal({
          title: '导入备份',
          content: `将合并 ${imported.length} 条登记；相同编号的订单以备份内容为准。`,
          confirmText: '导入',
          success: ({ confirm }) => {
            if (!confirm) return;
            mergeOrders(imported);
            this.refreshOrders();
            wx.showToast({ title: '备份已导入', icon: 'success' });
          }
        });
      },
      fail: () => wx.showToast({ title: '读取剪贴板失败', icon: 'none' })
    });
  },

  onShareAppMessage() {
    return { title: '住宿订单登记', path: '/pages/index/index' };
  }
});
