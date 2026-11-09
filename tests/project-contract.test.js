const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
assert.deepEqual(app.pages, ['pages/index/index', 'pages/form/form']);

for (const pagePath of app.pages) {
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert.ok(fs.existsSync(path.join(root, `${pagePath}.${extension}`)), `${pagePath}.${extension} exists`);
  }

  const markup = fs.readFileSync(path.join(root, `${pagePath}.wxml`), 'utf8');
  const controller = fs.readFileSync(path.join(root, `${pagePath}.js`), 'utf8');
  const methods = new Set(Array.from(controller.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*\(/gm), (match) => match[1]));
  const bindings = Array.from(markup.matchAll(/(?:bindtap|catchtap|bindinput|bindchange)="([A-Za-z_$][\w$]*)"/g), (match) => match[1]);
  for (const binding of bindings) assert.ok(methods.has(binding), `${pagePath} handler ${binding} exists`);

  const stack = [];
  for (const match of markup.matchAll(/<\/?([a-z][\w-]*)(?:\s[^<>]*?)?\s*(\/?)>/g)) {
    const [, tag, selfClosing] = match;
    if (match[0].startsWith('</')) {
      assert.equal(stack.pop(), tag, `${pagePath} closes ${tag}`);
    } else if (!selfClosing) {
      stack.push(tag);
    }
  }
  assert.deepEqual(stack, [], `${pagePath} has balanced WXML tags`);
}

for (const file of ['app.js', 'pages/index/index.js', 'pages/form/form.js', 'utils/orders.js']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.doesNotMatch(source, /\bwx\.request\s*\(|\bfetch\s*\(|XMLHttpRequest/);
}

const formMarkup = fs.readFileSync(path.join(root, 'pages/form/form.wxml'), 'utf8');
const requiredLabels = ['旅店/订单', '入住基地', '客户姓名', '客户电话', '入住时间', '入住天数', '入住人数', '入住房型', '是否含餐', '费用明细'];
for (const label of requiredLabels) {
  assert.ok(formMarkup.includes(label), `form contains ${label}`);
}
const fieldKeys = Array.from(formMarkup.matchAll(/data-key="([^"]+)"/g), (match) => match[1]);
assert.deepEqual(new Set(fieldKeys), new Set(['hotelOrder', 'base', 'customerName', 'phone', 'nights', 'guestCount', 'roomType', 'feeDetails']));
assert.match(formMarkup, /bindchange="onDateChange"/);
assert.equal((formMarkup.match(/data-value="是"/g) || []).length, 1);
assert.equal((formMarkup.match(/data-value="否"/g) || []).length, 1);

console.log('PASS page files, event bindings, WXML tags, offline-only contract, and screenshot fields');
