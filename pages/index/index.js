const {
  dateString,
  getOrderStatus,
  getOrders,
  makeBackup,
  mergeOrders,
  parseBackup
} = require('../../utils/orders');

const FILTERS = ['全部', '待入住', '入住中', '已离店'];

function money(value) {
  return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2);
}

Page({
  data: {
    filters: FILTERS,
    activeFilter: '全部',
    query: '',
    orders: [],
    orderCount: 0,
    todayLabel: '',
    stats: { monthCount: 0, outstanding: '0.00', received: '0.00' },
    hasData: false
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
    const today = dateString(new Date());
    const month = today.slice(0, 7);
    const query = this.data.query.trim().toLowerCase();
    const activeFilter = this.data.activeFilter;
    const orders = allOrders
      .map((order) => ({
        ...order,
        recordDate: order.recordDate || String(order.createdAt || '').slice(0, 10),
        status: getOrderStatus(order, today)
      }))
      .filter((order) => activeFilter === '全部' || order.status === activeFilter)
      .filter((order) => {
        if (!query) return true;
        const searchable = [
          order.hotelName,
          order.orderTitle,
          order.orderSource,
          order.base,
          order.company,
          order.anchor,
          order.customerName,
          order.phone,
          order.roomType
        ].join(' ').toLowerCase();
        return searchable.includes(query);
      })
      .sort((a, b) => {
        const rank = { 入住中: 0, 待入住: 1, 已离店: 2 };
        return rank[a.status] - rank[b.status] || String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || ''));
      });

    const outstanding = allOrders.reduce((sum, order) =>
      sum + Math.max(0, Number(order.totalAmount || 0) - Number(order.receivedAmount || 0)), 0
    );
    const received = allOrders.reduce((sum, order) => sum + Number(order.receivedAmount || 0), 0);

    this.setData({
      orders,
      orderCount: orders.length,
      hasData: allOrders.length > 0,
      todayLabel: today.replace(/-/g, '/'),
      stats: {
        monthCount: allOrders.filter((order) => String(order.arrivalDate || '').startsWith(month)).length,
        outstanding: money(outstanding),
        received: money(received)
      }
    });
  },

  onSearch(event) {
    this.setData({ query: event.detail.value }, () => this.refreshOrders());
  },

  onClearSearch() {
    this.setData({ query: '' }, () => this.refreshOrders());
  },

  onChooseFilter(event) {
    this.setData({ activeFilter: event.currentTarget.dataset.value }, () => this.refreshOrders());
  },

  onAddOrder() {
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
