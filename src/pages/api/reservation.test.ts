import test from 'node:test';
import assert from 'node:assert/strict';

import { POST } from './reservation.ts';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('reservation api allows submit when shop settings enable reservation', async () => {
  let callCount = 0;
  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    callCount += 1;
    const url = String(input);

    if (url.endsWith('/102/info')) {
      return new Response(
        JSON.stringify({
          slug: '102',
          settings: JSON.stringify({ reservation_enabled: 1 }),
          enable_reservation: 0,
          billing_plan_type: '<nil>',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (url.endsWith('/102/reservation')) {
      return new Response(JSON.stringify({ reservation_id: 88 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  const response = await POST({
    request: new Request('http://localhost/api/reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: '102',
        guest_count: 2,
        reservation_time: '2026-03-28T18:00:00',
        customer_phone: '381600000000',
      }),
    }),
  } as any);

  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.reservation_id, 88);
  assert.equal(callCount, 2);
});

test('reservation api rejects submit when shop settings disable reservation', async () => {
  let forwarded = false;
  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/102/info')) {
      return new Response(
        JSON.stringify({
          slug: '102',
          settings: JSON.stringify({ reservation_enabled: 0 }),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (url.endsWith('/102/reservation')) {
      forwarded = true;
      return new Response('{}', { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  const response = await POST({
    request: new Request('http://localhost/api/reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: '102',
        guest_count: 2,
        reservation_time: '2026-03-28T18:00:00',
        customer_phone: '381600000000',
      }),
    }),
  } as any);

  const data = await response.json();
  assert.equal(response.status, 403);
  assert.equal(data.success, false);
  assert.equal(data.error, 'reservation disabled');
  assert.equal(forwarded, false);
});

test('reservation api returns 502 when shop info is unavailable', async () => {
  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/102/info')) {
      throw new Error('network down');
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const response = await POST({
    request: new Request('http://localhost/api/reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: '102',
        guest_count: 2,
        reservation_time: '2026-03-28T18:00:00',
        customer_phone: '381600000000',
      }),
    }),
  } as any);

  const data = await response.json();
  assert.equal(response.status, 502);
  assert.equal(data.success, false);
  assert.equal(data.error, 'shop info unavailable');
});

test('reservation api falls back to subscription_enabled when reservation_enabled is missing', async () => {
  let forwarded = false;
  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/102/info')) {
      return new Response(
        JSON.stringify({
          slug: '102',
          settings: JSON.stringify({ subscription_enabled: 0 }),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (url.endsWith('/102/reservation')) {
      forwarded = true;
      return new Response('{}', { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  const response = await POST({
    request: new Request('http://localhost/api/reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: '102',
        guest_count: 2,
        reservation_time: '2026-03-28T18:00:00',
        customer_phone: '381600000000',
      }),
    }),
  } as any);

  const data = await response.json();
  assert.equal(response.status, 403);
  assert.equal(data.error, 'reservation disabled');
  assert.equal(forwarded, false);
});

test('reservation api defaults to enabled when reservation settings are missing', async () => {
  let forwarded = false;
  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/102/info')) {
      return new Response(
        JSON.stringify({
          slug: '102',
          settings: JSON.stringify({}),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (url.endsWith('/102/reservation')) {
      forwarded = true;
      return new Response(JSON.stringify({ reservation_id: 99 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  const response = await POST({
    request: new Request('http://localhost/api/reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: '102',
        guest_count: 2,
        reservation_time: '2026-03-28T18:00:00',
        customer_phone: '381600000000',
      }),
    }),
  } as any);

  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.reservation_id, 99);
  assert.equal(forwarded, true);
});

test('reservation api rejects submit when legacy enable_reservation disables reservation', async () => {
  let forwarded = false;
  globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/102/info')) {
      return new Response(
        JSON.stringify({
          slug: '102',
          settings: JSON.stringify({}),
          enable_reservation: 0,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    if (url.endsWith('/102/reservation')) {
      forwarded = true;
      return new Response('{}', { status: 200 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  const response = await POST({
    request: new Request('http://localhost/api/reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: '102',
        guest_count: 2,
        reservation_time: '2026-03-28T18:00:00',
        customer_phone: '381600000000',
      }),
    }),
  } as any);

  const data = await response.json();
  assert.equal(response.status, 403);
  assert.equal(data.success, false);
  assert.equal(data.error, 'reservation disabled');
  assert.equal(forwarded, false);
});
