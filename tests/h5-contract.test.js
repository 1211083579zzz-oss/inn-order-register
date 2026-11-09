const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'h5');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
assert.match(html, /href="\.\/styles\.css"/);
assert.match(html, /src="\.\/app\.js"/);
assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//i);
assert.doesNotMatch(html, /<link[^>]+href="https?:\/\//i);
assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|\bwx\.request\s*\(/);
assert.match(script, /localStorage\.getItem\(STORAGE_KEY\)/);
assert.match(script, /localStorage\.setItem\(STORAGE_KEY/);

for (const label of ['旅店名称', '订单标题', '订单来源', '入住基地', '旅民公司', '主播', '登记日期', '客户姓名', '客户电话', '入住日期', '入住晚数', '入住人数', '入住房型', '是否含餐', '费用明细', '订单总额', '已收款', '收款方式']) {
  assert.ok(html.includes(label), `H5 contains ${label}`);
}

console.log('PASS H5 mobile viewport, local assets, local-only storage, and required fields');
