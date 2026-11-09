const { addDays, dateString, deleteOrder, getOrders, saveOrder } = require('../../utils/orders');

function createId() {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

Page({
  data: {
    isEditing: false,
    orderId: '',
    hotelOrder: '',
    base: '',
    customerName: '',
    phone: '',
    arrivalDate: dateString(new Date()),
    nights: '1',
    guestCount: '',
    roomType: '',
    mealIncluded: '否',
    feeDetails: ''
  },

  onLoad(options) {
    if (options.id) {
      const order = getOrders().find((item) => item.id === options.id);
      if (!order) {
        wx.showToast({ title: '订单不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 500);
        return;
      }
      this.setData({
        ...order,
        isEditing: true,
        orderId: order.id,
        nights: String(order.nights || 1)
      });
      wx.setNavigationBarTitle({ title: '修改登记' });
      return;
    }
    wx.setNavigationBarTitle({ title: '新增登记' });
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value });
  },

  onDateChange(event) {
    this.setData({ arrivalDate: event.detail.value });
  },

  onNightsStep(event) {
    const nights = Math.max(1, Math.floor(Number(this.data.nights) || 1) + Number(event.currentTarget.dataset.step));
    this.setData({ nights: String(nights) });
  },

  onMealChange(event) {
    this.setData({ mealIncluded: event.currentTarget.dataset.value });
  },

  getFieldValue(key) {
    return String(this.data[key] || '').trim();
  },

  validate() {
    const required = [
      ['hotelOrder', '请填写旅店和订单名称'],
      ['base', '请填写入住基地'],
      ['customerName', '请填写客户姓名'],
      ['phone', '请填写客户电话'],
      ['arrivalDate', '请选择入住时间'],
      ['guestCount', '请填写入住人数'],
      ['roomType', '请填写入住房型']
    ];
    for (const [key, message] of required) {
      if (!this.getFieldValue(key)) {
        wx.showToast({ title: message, icon: 'none' });
        return false;
      }
    }

    if (!/^[0-9+\-\s]{6,20}$/.test(this.getFieldValue('phone'))) {
      wx.showToast({ title: '请检查客户电话格式', icon: 'none' });
      return false;
    }
    if (!Number.isInteger(Number(this.data.nights)) || Number(this.data.nights) < 1) {
      wx.showToast({ title: '入住天数至少为 1 晚', icon: 'none' });
      return false;
    }
    return true;
  },

  onSave() {
    if (!this.validate()) return;
    const previous = this.data.isEditing ? getOrders().find((item) => item.id === this.data.orderId) : null;
    const now = new Date().toISOString();
    const order = {
      id: this.data.orderId || createId(),
      hotelOrder: this.getFieldValue('hotelOrder'),
      base: this.getFieldValue('base'),
      customerName: this.getFieldValue('customerName'),
      phone: this.getFieldValue('phone'),
      arrivalDate: this.data.arrivalDate,
      nights: Number(this.data.nights),
      guestCount: this.getFieldValue('guestCount'),
      roomType: this.getFieldValue('roomType'),
      mealIncluded: this.data.mealIncluded,
      feeDetails: this.getFieldValue('feeDetails'),
      createdAt: previous ? previous.createdAt : now,
      updatedAt: now
    };

    try {
      saveOrder(order);
    } catch {
      wx.showToast({ title: '本机空间不足，未能保存', icon: 'none' });
      return;
    }
    wx.showToast({ title: '登记已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 450);
  },

  onDelete() {
    wx.showModal({
      title: '删除订单',
      content: '删除后无法从本机恢复，确认删除这条登记吗？',
      confirmText: '删除',
      confirmColor: '#bd3142',
      success: ({ confirm }) => {
        if (!confirm) return;
        deleteOrder(this.data.orderId);
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 400);
      }
    });
  }
});
