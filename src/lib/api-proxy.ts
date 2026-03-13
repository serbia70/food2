import { API_PROXY_TIMEOUT_MS } from "./clientConfig.ts";

function buildProxyErrorResponse(status: number, error: string, code: string, extra?: Record<string, any>) {
  return new Response(
    JSON.stringify({ success: false, error, code, ...(extra || {}) }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function classifyProxyError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e || "");
  const errorName = e instanceof Error ? e.name : "";
  const lower = message.toLowerCase();

  if (errorName === "AbortError") {
    return {
      status: 504,
      error: "Backend request timeout",
      code: "backend_timeout",
    };
  }

  if (lower.includes("terminated") || lower.includes("other side closed") || lower.includes("socket")) {
    return {
      status: 502,
      error: "Backend connection closed unexpectedly",
      code: "backend_connection_closed",
    };
  }

  return {
    status: 503,
    error: "Backend unavailable",
    code: "backend_unavailable",
  };
}

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

    let body = "";
    try {
      body = await res.text();
    } catch (e) {
      const classified = classifyProxyError(e);
      return buildProxyErrorResponse(
        classified.status,
        classified.error,
        classified.code,
      );
    }

    const contentType = res.headers.get("content-type") || "";

    // If upstream returns an HTML error page (common with 502/504), wrap it into JSON
    // so browser code that expects JSON doesn't crash on JSON.parse.
    if (res.status >= 500 && !contentType.includes('application/json')) {
      return buildProxyErrorResponse(
        res.status,
        `Upstream error (${res.status})`,
        'upstream_non_json',
        { upstreamStatus: res.status },
      );
    }

    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": contentType || "application/json",
      },
    });
  } catch (e: unknown) {
    const classified = classifyProxyError(e);
    return buildProxyErrorResponse(
      classified.status,
      classified.error,
      classified.code,
    );
  } finally {
    clearTimeout(timer);
  }
}
