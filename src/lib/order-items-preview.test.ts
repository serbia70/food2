import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOrderItemsPreview } from './order-items-preview.ts';

test('可从 items_json 生成中/塞语菜品摘要，并限制数量', () => {
  const order = {
    items_json: JSON.stringify([
      { name: '宫保鸡丁', sub_name: 'Kung Pao piletina', quantity: 1 },
      { name: '酸辣汤', sub_name: 'Kisela ljuta supa', quantity: 2 },
      { name: '米饭', sub_name: 'Pirinač', quantity: 1 },
      { name: '可乐', sub_name: 'Kola', quantity: 1 },
    ]),
  };

  const p = buildOrderItemsPreview(order, { maxItems: 3 });
  assert.equal(p.totalItems, 4);
  assert.equal(p.zh, '宫保鸡丁、酸辣汤 x2、米饭 +1');
  assert.equal(p.sr, 'Kung Pao piletina, Kisela ljuta supa x2, Pirinač +1');
});

test('items_json 为对象时也可解析', () => {
  const order = {
    items_json: JSON.stringify({
      11: { name: '鱼香肉丝', subName: 'Svinjetina sa ljutim sosom', qty: 2 },
    }),
  };
  const p = buildOrderItemsPreview(order, { maxItems: 3 });
  assert.equal(p.zh, '鱼香肉丝 x2');
  assert.equal(p.sr, 'Svinjetina sa ljutim sosom x2');
});

test('name/sub_name 反转时应自动纠正 zh/sr', () => {
  const order = {
    items_json: JSON.stringify([
      { name: 'Svinjetina riblji miris na trakice', sub_name: '鱼香肉丝', quantity: 1 },
    ]),
  };
  const p = buildOrderItemsPreview(order, { maxItems: 3 });
  assert.equal(p.zh, '鱼香肉丝');
  assert.equal(p.sr, 'Svinjetina riblji miris na trakice');
});
