type ImportCategory = {
  category?: string;
  categorySub?: string;
  items?: any[];
};

function getShopSlugFromPath(): string {
  if (typeof window !== "undefined" && (window as any).shopSlug) {
    return String((window as any).shopSlug || "");
  }
  const parts = window.location.pathname.split("/").filter(Boolean);
  const adminIndex = parts.indexOf("admin");
  if (adminIndex >= 0 && parts[adminIndex + 1]) return parts[adminIndex + 1];
  return parts[0] || "";
}

function readEmbeddedJSON(id: string): any {
  const el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) return null;
  const text = String(el.textContent || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function unwrapMenuPayload(payload: unknown) {
  if (
    payload
    && typeof payload === 'object'
    && 'ok' in payload
    && (payload as { ok?: unknown }).ok === true
    && 'data' in payload
    && Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: unknown[] }).data;
  }

  return Array.isArray(payload) ? payload : [];
}

async function fetchMenuFromServer() {
  const slug = getShopSlugFromPath();
  if (!slug) return [];
  const res = await fetch(`/${encodeURIComponent(slug)}/menu`, { cache: "no-store" });
  if (!res.ok) return [];
  const payload = await res.json().catch(() => []);
  return unwrapMenuPayload(payload);
}

async function ensureCategoryIdByName(name: string, subName: string) {
  if (!name) return 0;
  const res = await fetch("/api/admin/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, subName: subName || name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false || data?.ok === false) return 0;
  return Number(data?.id || data?.data?.id || 0) || 0;
}

async function createProduct(payload: any) {
  const res = await fetch("/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok && data?.success !== false && data?.ok !== false;
}

export async function exportData() {
  const menu = await fetchMenuFromServer();
  let categories: any[] = [];
  let products: any[] = [];
  if (Array.isArray(menu) && menu.length > 0) {
    categories = menu.map((c: any) => ({
      id: Number(c?.id || 0),
      name: String(c?.name || ""),
      subName: String(c?.subName || ""),
    }));
    products = menu.flatMap((c: any) =>
      Array.isArray(c?.products)
        ? c.products.map((p: any) => ({
            ...p,
            categoryId: Number(p?.categoryId || c?.id || 0),
          }))
        : [],
    );
  } else {
    const embeddedCategories = readEmbeddedJSON("categories-data") || [];
    const embeddedProducts = readEmbeddedJSON("products-data") || [];
    if (Array.isArray(embeddedCategories)) categories = embeddedCategories;
    if (Array.isArray(embeddedProducts)) products = embeddedProducts;
  }

  if (!categories.length) {
    alert("暂无菜单数据");
    return;
  }

  const payload = categories.map((cat: any) => {
    const items = products
      .filter((p: any) => Number(p?.categoryId || 0) === Number(cat?.id || 0))
      .map((p: any) => ({
        name: String(p?.name || ""),
        subName: String(p?.subName || ""),
        price: Number(p?.price || 0),
        img: String(p?.img || ""),
        description: String(p?.description || ""),
        stock: Number(p?.stock || 0),
        isAvailable: Number(p?.isAvailable ?? 1),
      }));
    return {
      category: String(cat?.name || ""),
      categorySub: String(cat?.subName || ""),
      items,
    };
  });

  const area = document.getElementById("import-area") as HTMLTextAreaElement | null;
  if (area) {
    area.value = JSON.stringify(payload, null, 2);
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `menu_export_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function importData() {
  const area = document.getElementById("import-area") as HTMLTextAreaElement | null;
  const raw = String(area?.value || "").trim();
  if (!raw) {
    alert("请输入JSON数据");
    return;
  }

  let data: ImportCategory[] = [];
  try {
    data = JSON.parse(raw);
  } catch (e: any) {
    alert("JSON解析失败: " + (e?.message || e));
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    alert("JSON格式不正确");
    return;
  }

  let success = 0;
  let failed = 0;
  for (const c of data) {
    const name = String(c?.category || "").trim();
    const subName = String(c?.categorySub || "").trim() || name;
    if (!name) {
      failed++;
      continue;
    }

    const categoryId = await ensureCategoryIdByName(name, subName);
    if (!categoryId) {
      failed++;
      continue;
    }

    const items = Array.isArray(c?.items) ? c.items : [];
    for (const item of items) {
      const productName = String(item?.name || "").trim();
      if (!productName) {
        failed++;
        continue;
      }
      const payload = {
        name: productName,
        subName: String(item?.subName || "").trim() || productName,
        price: Number(item?.price || 0),
        img: String(item?.img || ""),
        description: String(item?.description || ""),
        stock: Number(item?.stock || 0),
        isAvailable: Number(item?.isAvailable ?? 1),
        categoryId: categoryId,
      };

      const ok = await createProduct(payload);
      if (ok) success++;
      else failed++;
    }
  }

  alert(`导入完成：成功 ${success}，失败 ${failed}`);
  location.reload();
}

if (typeof window !== "undefined") {
  const registry = (window.__adminHandlers ||= {});
  Object.assign(registry, { "import-data": importData, "export-data": exportData });
}
