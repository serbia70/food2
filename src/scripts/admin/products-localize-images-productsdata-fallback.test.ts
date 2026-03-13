import test from 'node:test';
import assert from 'node:assert/strict';

function deriveProductsFromMenu(menu: any): any[] {
  if (!Array.isArray(menu)) return [];
  return menu.flatMap((c: any) => (Array.isArray(c?.products) ? c.products : []));
}

test('localizeImages fallback: derive products from menu categories', () => {
  const menu = [
    { id: 1, products: [{ id: 10 }, { id: 11 }] },
    { id: 2, products: [] },
    { id: 3, products: [{ id: 12 }] },
  ];
  assert.deepEqual(
    deriveProductsFromMenu(menu).map((p) => p.id),
    [10, 11, 12],
  );
});
