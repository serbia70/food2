import { localizeImagesBatch } from '../../../lib/admin-localize-images.ts';

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleLocalizeImagesBatchRequest(options: {
  request: Request;
  authHeader: string;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const fetchImpl = options.fetchImpl || fetch;

  let payload: any = null;
  try {
    payload = await options.request.json();
  } catch {
    payload = null;
  }

  const products = Array.isArray(payload?.products) ? payload.products : [];
  const cursor = Number.isFinite(Number(payload?.cursor)) ? Number(payload.cursor) : 0;
  const batchSizeRaw = Number(payload?.batchSize);
  const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? Math.min(30, Math.floor(batchSizeRaw)) : 10;

  const authHeader = String(options.authHeader || '').trim();
  if (!authHeader) {
    return json({ success: false, error: 'Authorization header required' }, 401);
  }

  const result = await localizeImagesBatch({
    products: products
      .map((p: any) => ({
        ...p,
        id: Number(p?.id || 0) || 0,
        categoryId: Number(p?.categoryId || 0) || 0,
        name: String(p?.name || ''),
        subName: String(p?.subName || ''),
        price: Number(p?.price || 0) || 0,
        img: String(p?.img || ''),
      }))
      .filter((p: any) => p.id > 0),
    cursor,
    batchSize,

    canFetchImage: async (url) => {
      const res = await fetchImpl(url, { method: 'GET' });
      return res.ok;
    },

    uploadImageFromUrl: async (_productId, url, filenameHint) => {
      const imgRes = await fetchImpl(url, { method: 'GET' });
      if (!imgRes.ok) throw new Error(`download failed: ${imgRes.status}`);

      const contentType = imgRes.headers.get('content-type') || 'application/octet-stream';
      const buf = await imgRes.arrayBuffer();

      const form = new FormData();
      form.append('file', new Blob([buf], { type: contentType }), filenameHint || 'image');

      // fetch() in Node/Workers requires absolute URLs; use the incoming request URL as base.
      const uploadUrl = new URL('/api/upload', options.request.url).toString();

      const uploadRes = await fetchImpl(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
        },
        body: form,
      } as any);

      const uploadText = await uploadRes.text();
      let uploadJson: any = null;
      try {
        uploadJson = uploadText ? JSON.parse(uploadText) : null;
      } catch {
        uploadJson = null;
      }

      if (!uploadRes.ok || uploadJson?.success === false || !uploadJson?.url) {
        throw new Error(uploadJson?.error || `upload failed: ${uploadRes.status}`);
      }

      return { url: String(uploadJson.url) };
    },

    updateProductImage: async (product, newUrl) => {
      const updateUrl = new URL('/api/admin/products', options.request.url).toString();

      const body = JSON.stringify({
        id: Number(product?.id || 0) || 0,
        categoryId: Number(product?.categoryId || 0) || 0,
        name: String(product?.name || ''),
        subName: String(product?.subName || ''),
        price: Number(product?.price || 0) || 0,
        img: newUrl,
      });

      const res = await fetchImpl(updateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body,
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok || data?.success === false) return false;
      return true;
    },
  });

  return json(result, 200);
}

