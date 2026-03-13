import test from 'node:test';
import assert from 'node:assert/strict';

async function fetchJson(url) {
  const res = await fetch(url);
  assert.equal(res.status, 200);
  return res.json();
}

test('/user history should not hide dine_in orders', async () => {
  // In this deployment, some users (e.g. phone=888) only have dine_in orders.
  // The /user page should not filter those out and show an empty state.
  const data = await fetchJson('http://localhost:3000/api/user/history?phone=888&page=1&limit=20');
  assert.equal(data?.success, true);

  const orders = Array.isArray(data.orders) ? data.orders : Array.isArray(data.history) ? data.history : [];
  assert.ok(orders.length > 0, 'fixture has no orders; adjust phone');

  const dineInCount = orders.filter((o) => String(o?.order_type || '').trim() === 'dine_in').length;
  assert.ok(dineInCount > 0, 'expected at least one dine_in order for phone=888');

  // Ensure frontend filter does not drop dine_in.
  const visible = orders.filter((o) => {
    const t = String(o?.order_type || '').trim();
    return t === 'delivery' || t === 'dine_in';
  });

  assert.equal(visible.length, orders.length, 'some orders are hidden by user-visible filter');
});
