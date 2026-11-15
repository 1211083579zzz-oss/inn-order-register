const assert = require('node:assert/strict');
const money = require('../h5/money.js');
const storage = require('../h5/storage.js');
const source = [
  { id: 'a', companyId: 'c1', anchorName: '依依', incomeCents: 149000, commissionRateBps: 2000, createdAt: '2026-11-15T04:00:00Z' },
  { id: 'b', companyId: 'c2', anchorName: ' 依依 ', incomeCents: 200000, commissionRateBps: 1000, createdAt: '2026-11-15T04:00:00Z' },
  { id: 'legacy', anchorName: '依依', incomeCents: 100000, costCents: 12345, createdAt: '2026-11-15T04:00:00Z' },
  { id: 'pending', anchorName: '依依', incomeCents: 120000, createdAt: '2026-11-15T04:00:00Z' },
  { id: 'other', anchorName: '小雪', incomeCents: 300000, commissionRateBps: 1000, createdAt: '2026-11-15T04:00:00Z' },
  { id: 'older', anchorName: '依依', incomeCents: 50000, commissionRateBps: 2000, createdAt: '2026-10-15T04:00:00Z' }
];
const original = structuredClone(source);
const yiyi = storage.groupByAnchor(source, '2026-11').find(group => group.id === '依依');
const result = money.summarizeCommission(yiyi.orders);
assert.deepEqual(result, { amount: 49800, knownCount: 2, pendingCount: 1, legacyCount: 1, legacyCost: 12345, count: 4 });
assert.equal(money.commissionDisplay(result), '¥498.00');
assert.equal(money.summarize(yiyi.orders).cost, 62145);
assert.equal(money.summarizeCommission(storage.groupByAnchor(source).find(group => group.id === '依依').orders).amount, 59800);
assert.equal(money.summarizeCommission(storage.groupByAnchor(source, '2026-11').find(group => group.id === '小雪').orders).amount, 30000);
assert.equal(money.commissionDisplay(money.summarizeCommission([])), '¥0.00');
assert.equal(money.commissionDisplay(money.summarizeCommission([{ incomeCents: 10000 }])), '待补提点');
assert.equal(money.commissionDisplay(money.summarizeCommission([{ incomeCents: 10000, costCents: 0 }])), '待补提点');
assert.equal(money.commissionDisplay(money.summarizeCommission([{ incomeCents: 10000, commissionRateBps: 0 }])), '¥0.00');
assert.equal(money.summarizeCommission([{ incomeCents: 3, commissionRateBps: 2000 }, { incomeCents: 3, commissionRateBps: 2000 }]).amount, 2);
assert.equal(money.summarizeCommission([{ incomeCents: money.MAX_CENTS, commissionRateBps: 10000 }, { incomeCents: money.MAX_CENTS, commissionRateBps: 10000 }]).amount, 19999999998);
assert.deepEqual(source, original);
console.log('PASS_ANCHOR_COMMISSION: normalized anchor across companies and calendar registration months; actual commission excludes preserved historical costs; pending and zero distinct; per-order rounding; maximum values; no source mutation');
