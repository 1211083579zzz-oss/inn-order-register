const assert = require('node:assert/strict');
const api = require('../h5/storage.js');
const fixture = { version:2,settings:{ownCompanyName:'我司旅居'},companies:[{id:'a',name:'我司旅居'},{id:'b',name:'其他公司'}],orders:[
 {id:'1',companyId:'a',anchorName:'依依',createdAt:'2026-11-16T04:00:00Z'},
 {id:'2',companyId:'b',anchorName:'外司主播',createdAt:'2026-11-16T04:00:00Z'}] };
for (const corrupt of ['broken-json','null','[]','123','"string"','{"我司旅居":null}','{"我司旅居":123}','{"我司旅居":"'+ '字'.repeat(31)+'"}']) {
  const values = new Map([[api.DATA_KEY,JSON.stringify(fixture)],['inn-order-company-anchors-v1',corrupt]]);
  const device={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const store=api.createStore(device),original=device.getItem(api.DATA_KEY);
  assert.equal(store.preferredAnchor('我司旅居'),'依依');
  assert.equal(store.preferredAnchor('其他公司'),'外司主播');
  assert.equal(store.preferredAnchor('新公司'),'');
  assert.equal(device.getItem(api.DATA_KEY),original);
  store.rememberAnchor('新主播','我司旅居');assert.equal(store.preferredAnchor('我司旅居'),'新主播');assert.equal(device.getItem(api.DATA_KEY),original);
  store.rememberAnchor('','我司旅居');assert.equal(store.preferredAnchor('我司旅居'),'');
}
console.log('PASS_REGISTRATION_RELIABILITY: invalid optional anchor JSON/types/values cannot block lookup; each company uses its own last known anchor; new preferences and explicit blank persist; primary company/order/settings bytes remain unchanged');
