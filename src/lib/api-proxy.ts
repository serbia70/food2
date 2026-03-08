import { API_PROXY_TIMEOUT_MS } from "./clientConfig";

export async function proxyFetch(
  url: string,
  init: RequestInit,
  timeoutMs = API_PROXY_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    return new Response(await res.text(), {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (e: unknown) {
    const errorName = e instanceof Error ? e.name : "";
    const msg =
      errorName === "AbortError"
        ? "Backend request timeout"
        : "Backend unavailable";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}
