const { addDays, dateString, deleteOrder, getOrders, saveOrder } = require('../../utils/orders');

const SOURCE_OPTIONS = ['选择订单来源', '吉讯', '携程', '美团', '抖音', '微信', '其他'];
const ROOM_OPTIONS = ['选择房型', '大床房', '双床房', '亲子房', '套房', '民宿整套', '其他'];
const PAYMENT_OPTIONS = ['选择收款方式', '微信', '支付宝', '现金', '银行卡', '其他'];

function selectedIndex(options, value) {
  const index = options.indexOf(value);
  return index < 0 ? 0 : index;
}

function createId() {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

Page({
  data: {
    isEditing: false,
    orderId: '',
    sourceOptions: SOURCE_OPTIONS,
    sourceIndex: 0,
    roomOptions: ROOM_OPTIONS,
    roomIndex: 0,
    paymentOptions: PAYMENT_OPTIONS,
    paymentIndex: 0,
    mealOptions: ['否', '是'],
    mealIncluded: '否',
    hotelName: '',
    orderTitle: '',
    orderSource: '',
    sourceOther: '',
    base: '',
    company: '',
    anchor: '',
    recordDate: dateString(new Date()),
    customerName: '',
    phone: '',
    arrivalDate: dateString(new Date()),
    nights: '1',
    adults: '2',
    children: '0',
    roomType: '',
    roomOther: '',
    feeDetails: '',
    totalAmount: '',
    receivedAmount: '',
    paymentMethod: ''
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
        recordDate: order.recordDate || (order.createdAt ? String(order.createdAt).slice(0, 10) : dateString(new Date())),
        nights: String(order.nights || 1),
        adults: String(order.adults || 0),
        children: String(order.children || 0),
        totalAmount: String(order.totalAmount ?? ''),
        receivedAmount: String(order.receivedAmount ?? ''),
        sourceIndex: SOURCE_OPTIONS.includes(order.orderSource) ? selectedIndex(SOURCE_OPTIONS, order.orderSource) : (order.orderSource ? SOURCE_OPTIONS.length - 1 : 0),
        sourceOther: SOURCE_OPTIONS.includes(order.orderSource) ? '' : (order.orderSource || ''),
        roomIndex: ROOM_OPTIONS.includes(order.roomType) ? selectedIndex(ROOM_OPTIONS, order.roomType) : (order.roomType ? ROOM_OPTIONS.length - 1 : 0),
        roomOther: ROOM_OPTIONS.includes(order.roomType) ? '' : (order.roomType || ''),
        paymentIndex: PAYMENT_OPTIONS.includes(order.paymentMethod) ? selectedIndex(PAYMENT_OPTIONS, order.paymentMethod) : (order.paymentMethod ? PAYMENT_OPTIONS.length - 1 : 0),
        paymentOther: PAYMENT_OPTIONS.includes(order.paymentMethod) ? '' : (order.paymentMethod || '')
      });
      wx.setNavigationBarTitle({ title: '订单详情' });
      return;
    }
    wx.setNavigationBarTitle({ title: '新增订单' });
  },

  onInput(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value });
  },

  onSourceChange(event) {
    const sourceIndex = Number(event.detail.value);
    this.setData({ sourceIndex, orderSource: SOURCE_OPTIONS[sourceIndex] === '其他' ? '' : SOURCE_OPTIONS[sourceIndex] });
  },

  onRoomChange(event) {
    const roomIndex = Number(event.detail.value);
    this.setData({ roomIndex, roomType: ROOM_OPTIONS[roomIndex] === '其他' ? '' : ROOM_OPTIONS[roomIndex] });
  },

  onPaymentChange(event) {
    const paymentIndex = Number(event.detail.value);
    this.setData({ paymentIndex, paymentMethod: PAYMENT_OPTIONS[paymentIndex] === '其他' ? '' : PAYMENT_OPTIONS[paymentIndex] });
  },

  onDateChange(event) {
    this.setData({ arrivalDate: event.detail.value });
  },

  onRecordDateChange(event) {
    this.setData({ recordDate: event.detail.value });
  },

  onMealChange(event) {
    this.setData({ mealIncluded: event.currentTarget.dataset.value });
  },

  getFieldValue(key) {
    return String(this.data[key] || '').trim();
  },

  validate() {
    const required = [
      ['hotelName', '請填写旅店名称'],
      ['base', '请填写入住基地'],
      ['customerName', '请填写客户姓名'],
      ['phone', '请填写客户电话'],
      ['arrivalDate', '请选择入住日期'],
      ['totalAmount', '请填写订单总额']
    ];
    for (const [key, message] of required) {
      if (!this.getFieldValue(key)) {
        wx.showToast({ title: message, icon: 'none' });
        return false;
      }
    }

    const phone = this.getFieldValue('phone');
    if (!/^[0-9+\-\s]{6,20}$/.test(phone)) {
      wx.showToast({ title: '请检查客户电话格式', icon: 'none' });
      return false;
    }

    const nights = Number(this.data.nights);
    const adults = Number(this.data.adults || 0);
    const children = Number(this.data.children || 0);
    const totalAmount = Number(this.data.totalAmount);
    const receivedAmount = Number(this.data.receivedAmount || 0);
    if (!Number.isInteger(nights) || nights < 1) {
      wx.showToast({ title: '入住晚数至少为 1 晚', icon: 'none' });
      return false;
    }
    if (!Number.isInteger(adults) || !Number.isInteger(children) || adults < 0 || children < 0 || adults + children < 1) {
      wx.showToast({ title: '请检查入住人数', icon: 'none' });
      return false;
    }
    if (!Number.isFinite(totalAmount) || totalAmount < 0 || !Number.isFinite(receivedAmount) || receivedAmount < 0) {
      wx.showToast({ title: '金额需为不小于 0 的数字', icon: 'none' });
      return false;
    }
    return true;
  },

  onSave() {
    if (!this.validate()) return;
    const now = new Date().toISOString();
    const previous = this.data.isEditing ? getOrders().find((item) => item.id === this.data.orderId) : null;
    const source = this.data.sourceIndex === SOURCE_OPTIONS.length - 1
      ? this.getFieldValue('sourceOther')
      : this.data.orderSource;
    const room = this.data.roomIndex === ROOM_OPTIONS.length - 1
      ? this.getFieldValue('roomOther')
      : this.data.roomType;
    const payment = this.data.paymentIndex === PAYMENT_OPTIONS.length - 1
      ? this.getFieldValue('paymentOther')
      : this.data.paymentMethod;
    const order = {
      id: this.data.orderId || createId(),
      hotelName: this.getFieldValue('hotelName'),
      orderTitle: this.getFieldValue('orderTitle'),
      orderSource: source,
      base: this.getFieldValue('base'),
      company: this.getFieldValue('company'),
      anchor: this.getFieldValue('anchor'),
      recordDate: this.data.recordDate,
      customerName: this.getFieldValue('customerName'),
      phone: this.getFieldValue('phone'),
      arrivalDate: this.data.arrivalDate,
      nights: Number(this.data.nights),
      checkoutDate: addDays(this.data.arrivalDate, this.data.nights),
      adults: Number(this.data.adults || 0),
      children: Number(this.data.children || 0),
      roomType: room,
      mealIncluded: this.data.mealIncluded,
      feeDetails: this.getFieldValue('feeDetails'),
      totalAmount: normalizeAmount(this.data.totalAmount),
      receivedAmount: normalizeAmount(this.data.receivedAmount),
      paymentMethod: payment,
      createdAt: previous ? previous.createdAt : now,
      updatedAt: now
    };

    try {
      saveOrder(order);
    } catch (error) {
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
      confirmColor: '#b54842',
      success: ({ confirm }) => {
        if (!confirm) return;
        deleteOrder(this.data.orderId);
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 400);
      }
    });
  }
});
