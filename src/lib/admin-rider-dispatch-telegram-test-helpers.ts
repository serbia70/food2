import type { TestContext } from 'node:test';

type FetchHandler = (request: Request) => Promise<Response>;

export type MockCall = {
  url: string;
  method: string;
  body: string;
  headers: Headers;
};

export function useTestEnv(t: TestContext): void {
  const originalCallbackSecret = process.env.TELEGRAM_CALLBACK_SECRET;
  process.env.TELEGRAM_CALLBACK_SECRET = 'test-secret';
  t.after(() => {
    if (typeof originalCallbackSecret === 'string') {
      process.env.TELEGRAM_CALLBACK_SECRET = originalCallbackSecret;
    } else {
      delete process.env.TELEGRAM_CALLBACK_SECRET;
    }
  });
}

export function useMockFetch(t: TestContext, handler: FetchHandler): MockCall[] {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push({
      url: request.url,
      method: request.method,
      body: await request.clone().text(),
      headers: request.headers,
    });
    return handler(request);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return calls;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function findTelegramButton(markup: unknown, text: string): { text: string; url?: string; callback_data?: string } | undefined {
  if (Array.isArray(markup)) {
    for (const item of markup) {
      const button = findTelegramButton(item, text);
      if (button) return button;
    }
    return undefined;
  }

  if (!markup || typeof markup !== 'object') return undefined;
  const candidate = markup as { text?: unknown; url?: unknown; callback_data?: unknown };
  if (candidate.text === text) {
    return {
      text,
      url: typeof candidate.url === 'string' ? candidate.url : undefined,
      callback_data: typeof candidate.callback_data === 'string' ? candidate.callback_data : undefined,
    };
  }

  for (const value of Object.values(markup)) {
    const button = findTelegramButton(value, text);
    if (button) return button;
  }
  return undefined;
}
