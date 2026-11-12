const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'h5');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const storage = fs.readFileSync(path.join(root, 'storage.js'), 'utf8');

assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
assert.match(html, /href="\.\/styles\.css(?:\?[^"]*)?"/);
assert.match(html, /src="\.\/app\.js(?:\?[^"]*)?"/);
assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//i);
assert.doesNotMatch(html, /<link[^>]+href="https?:\/\//i);
assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|\bwx\.request\s*\(/);
assert.match(storage, /storage\.getItem\(LEGACY_KEY\)/);
assert.match(storage, /storage\.setItem\(DATA_KEY/);

for (const label of ['旅店/订单', '入住基地', '客户姓名', '客户电话', '入住时间', '入住天数', '入住人数', '入住房型', '是否含餐', '费用明细']) {
  assert.ok(html.includes(label), `H5 contains ${label}`);
}
const formMarkup = html.match(/<form\b(?=[^>]*\bid="order-form")[^>]*>([\s\S]*?)<\/form>/)[1];
assert.deepEqual(new Set(Array.from(formMarkup.matchAll(/name="([^"]+)"/g), (match) => match[1])), new Set([
  'companyName', 'hotelOrder', 'base', 'anchorName', 'customerName', 'phone', 'arrivalDate', 'departureDate', 'nights', 'guestCount', 'roomType', 'mealIncluded', 'feeDetails'
]));
assert.doesNotMatch(html, /累计已收|待收金额|旅民公司|订单总额|收款方式/);

console.log('PASS H5 mobile viewport, local assets, local-only storage, and required fields');
