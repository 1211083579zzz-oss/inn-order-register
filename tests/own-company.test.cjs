const assert = require('node:assert/strict');
const storage = require('../h5/storage.js'), core = require('../h5/sync-core.js'), money = require('../h5/money.js');
const own = '缘缘抱团旅居', clone = value => JSON.parse(JSON.stringify(value));
const memory = initial => { const map = new Map(Object.entries(initial || {})); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) }; };
const data = {version:2, companies:[{id:'a',name:own},{id:'b',name:'海燕旅居'},{id:'c',name:own+'分店'}], orders:[
 {id:'1',companyId:'a',anchorName:'依依',incomeCents:149000,commissionRateBps:2000,createdAt:'2026-11-10T04:00:00Z'},
 {id:'2',companyId:'b',anchorName:'依依',incomeCents:999900,commissionRateBps:2000,createdAt:'2026-11-10T04:00:00Z'},
 {id:'3',companyId:'c',anchorName:'依依',incomeCents:999900,commissionRateBps:2000,createdAt:'2026-11-10T04:00:00Z'},
 {id:'4',companyId:'b',anchorName:'外司主播',createdAt:'2026-11-10T04:00:00Z'}]};
const device = memory({[storage.DATA_KEY]:JSON.stringify(data)}), store = storage.createStore(device);
assert.equal(store.ownCompanyName(),''); assert.deepEqual(store.ownOrders(),[]);
store.setOwnCompanyName('  '+own+'　');
assert.deepEqual(store.ownOrders().map(o=>o.id),['1']); assert.deepEqual(store.read().orders,data.orders);
assert.equal(money.summarizeCommission(store.ownOrders()).amount,29800);
store.setOwnCompanyName('海燕旅居'); assert.deepEqual(store.ownOrders().map(o=>o.id),['2','4']);
store.setOwnCompanyName(own); assert.deepEqual(store.read().companies,data.companies);
assert.throws(()=>store.setOwnCompanyName('  ')); assert.throws(()=>store.setOwnCompanyName('字'.repeat(81))); assert.equal(store.ownCompanyName(),own);
const normalized={...data,settings:{ownCompanyName:' AＢC　旅居 '},companies:[{id:'a',name:'ＡBＣ  旅居'},{id:'b',name:'ABC旅居'},{id:'c',name:'ABC 旅居分店'}]};
assert.deepEqual(storage.ownOrders(normalized).map(o=>o.id),['1']);
store.rememberAnchor('依依',own); store.rememberAnchor('外司主播','海燕旅居');
assert.equal(store.preferredAnchor(own),'依依'); assert.equal(store.preferredAnchor('海燕旅居'),'外司主播'); assert.equal(store.preferredAnchor('未登记公司'),'');
const backup=store.backup(), recovered=storage.createStore(memory()); recovered.mergeBackup(recovered.parseBackup(JSON.stringify(backup)));
assert.equal(recovered.ownCompanyName(),own); assert.deepEqual(recovered.ownOrders().map(o=>o.id),['1']);
const legacy=clone(backup); delete legacy.settings; recovered.mergeBackup(recovered.parseBackup(legacy)); assert.equal(recovered.ownCompanyName(),own);
assert.throws(()=>store.parseBackup({...backup,settings:{ownCompanyName:100}}));
const quota=storage.createStore({getItem:k=>device.getItem(k),setItem(){throw Error('quota');}}); assert.throws(()=>quota.setOwnCompanyName('海燕旅居'),/quota/); assert.equal(store.ownCompanyName(),own);
const old=core.capture(core.empty(),core.emptyData(),data,'aaaaaaaaaaaaaaaa'); assert.equal(core.project(old).data.settings,undefined);
const initial=core.project(old).data, configured={...initial,settings:{ownCompanyName:own}};
const first=core.capture(old,initial,configured,'aaaaaaaaaaaaaaaa'); assert.equal(core.project(first).data.settings.ownCompanyName,own);
const otherEdit=clone(initial);otherEdit.orders[1].customerName='其他手机修改';
const merged=core.merge(first,core.capture(old,initial,otherEdit,'bbbbbbbbbbbbbbbb'));
assert.equal(core.project(merged).data.settings.ownCompanyName,own); assert.deepEqual(storage.ownOrders(core.project(merged).data).map(o=>o.id),['1']);
assert.deepEqual(core.project(merged),core.project(core.merge(core.capture(old,initial,otherEdit,'bbbbbbbbbbbbbbbb'),first)));
const next=core.project(merged).data, a={...next,settings:{ownCompanyName:'海燕旅居'}}, b={...next,settings:{ownCompanyName:'新我司名称'}};
const collision=core.merge(core.capture(merged,next,a,'aaaaaaaaaaaaaaaa'),core.capture(merged,next,b,'bbbbbbbbbbbbbbbb'));
const conflict=core.project(collision).conflicts.find(c=>c.field==='ownCompanyName'); assert.ok(conflict); assert.equal(conflict.kind,'settings');
assert.equal(core.project(core.resolve(collision,conflict,'海燕旅居','aaaaaaaaaaaaaaaa')).data.settings.ownCompanyName,'海燕旅居');
assert.deepEqual(core.project(core.merge(first,first)),core.project(first));
assert.throws(()=>core.capture(old,initial,{...initial,settings:{ownCompanyName:'字'.repeat(81)}},'aaaaaaaaaaaaaaaa') && core.validate(core.capture(old,initial,{...initial,settings:{ownCompanyName:'字'.repeat(81)}},'aaaaaaaaaaaaaaaa')));
(async()=>{const keys=await core.derive(core.code()), envelope=await core.encrypt(first,keys);assert.ok(!JSON.stringify(envelope).includes(own));assert.equal(core.project(await core.decrypt(envelope,keys)).data.settings.ownCompanyName,own);console.log('PASS_OWN_COMPANY: exact normalized company match; same-name external anchors excluded; existing orders unchanged; 1490 at 20 percent = 298; independent company defaults; backup and legacy import; quota atomicity; old sync documents; concurrent setting/guest edits; conflict resolution; commutative/idempotent encrypted sync');})().catch(e=>{console.error(e);process.exitCode=1;});
