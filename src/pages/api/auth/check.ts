import type { APIContext } from "astro";
import { API_BASE_URL } from "../../../config";

export const GET = async ({ cookies }: APIContext) => {
  const token = cookies.get("admin_token")?.value;
  if (!token) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data: any = await res.json().catch(() => ({}));
    return new Response(
      JSON.stringify({
        authenticated: true,
        shopId: data?.shop_id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch {
    return new Response(JSON.stringify({ authenticated: false, error: "Backend unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
};
