
import { showAdminToast } from './globals';

export function openEditModal(event: any, id: number, categoryId: number) {
  const row = event.target.closest(".prod-row");
  if (!row) return;
  
  (document.getElementById("edit-id") as HTMLInputElement).value = String(id);
  (document.getElementById("edit-name") as HTMLInputElement).value = row.querySelector(".p-name").innerText;
  (document.getElementById("edit-sub") as HTMLInputElement).value = row.querySelector(".p-sub").innerText;
  (document.getElementById("edit-price") as HTMLInputElement).value = row.querySelector("input").value;
  (document.getElementById("edit-img") as HTMLInputElement).value = row.querySelector("img").src;
  
  const catSelect = document.getElementById("edit-cat") as HTMLSelectElement;
  if (catSelect && categoryId) catSelect.value = String(categoryId);
  
  const modal = document.getElementById("edit-modal");
  if (modal) modal.style.display = "flex";
}

export async function saveEditProd() {
  const id = (document.getElementById("edit-id") as HTMLInputElement).value;
  const payload = {
    name: (document.getElementById("edit-name") as HTMLInputElement).value,
    sub_name: (document.getElementById("edit-sub") as HTMLInputElement).value,
    price: parseInt((document.getElementById("edit-price") as HTMLInputElement).value, 10),
    img: (document.getElementById("edit-img") as HTMLInputElement).value,
    category_id: parseInt((document.getElementById("edit-cat") as HTMLSelectElement).value, 10)
  };

  try {
    const res = await fetch(`/api/admin/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showAdminToast("保存成功");
      location.reload();
    } else {
      showAdminToast("保存失败: " + data.error);
    }
  } catch (e) {
    showAdminToast("网络错误");
  }
}

export async function delProd(id: number | string) {
  const pid = String(id || '').trim();
  if (!pid) return;
  if (!confirm('确定删除吗？')) return;
  try {
    const res = await fetch(`/api/admin/products/${encodeURIComponent(pid)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || '删除失败');
    }
    location.reload();
  } catch (e: any) {
    showAdminToast('删除失败: ' + (e?.message || e));
  }
}

export async function addProd(shopId: number | string, categoryId: number | string) {
  const cid = Number.parseInt(String(categoryId || '0'), 10) || 0;
  if (!cid) return showAdminToast('分类无效，请刷新页面后重试');

  const rawName = (document.getElementById(`new-name-${cid}`) as HTMLInputElement)?.value || '';
  let rawSub = (document.getElementById(`new-sub-${cid}`) as HTMLInputElement)?.value || '';
  const name = String(rawName).trim();
  let sub = String(rawSub).trim();
  const price = Number.parseInt((document.getElementById(`new-price-${cid}`) as HTMLInputElement)?.value || '0', 10) || 0;
  const img = (document.getElementById(`new-img-${cid}`) as HTMLInputElement)?.value || '';

  if (!name || !price) return showAdminToast('名称和价格必填');
  sub = sub || name;
  try {
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_id: Number.parseInt(String(shopId || '0'), 10) || 0,
        category_id: cid,
        name,
        sub_name: sub,
        price,
        img,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || '创建失败');
    }
    location.reload();
  } catch (e: any) {
    showAdminToast('保存失败: ' + (e?.message || e));
  }
}

export async function moveProduct(productId: number | string, direction: string, categoryId: number | string) {
  const pid = Number.parseInt(String(productId || '0'), 10) || 0;
  const cid = Number.parseInt(String(categoryId || '0'), 10) || 0;
  if (!pid || !cid) return;
  try {
    const res = await fetch(`/api/admin/products/${encodeURIComponent(String(pid))}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction, category_id: cid }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || '移动失败');
    location.reload();
  } catch (e: any) {
    showAdminToast('移动失败: ' + (e?.message || e));
  }
}

export async function localizeImages() {
  if (!confirm('将远程图片转存到本地/图床，可能需要一些时间。继续？')) return;
  try {
    const res = await fetch('/api/admin/localize-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || '操作失败');
    alert('已开始转存/处理完成');
    location.reload();
  } catch (e: any) {
    alert('操作失败: ' + (e?.message || e));
  }
}

export async function openCreateCategoryModal() {
  const rawName = prompt('新分类名称 (塞语)') || '';
  const name = String(rawName).trim();
  if (!name) return;
  const sub_name = prompt('新分类名称 (中文)') || '';
  const finalSub = String(sub_name).trim() || name;
  try {
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sub_name: finalSub }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || '创建失败');
    location.reload();
  } catch (e: any) {
    alert('创建失败: ' + (e?.message || e));
  }
}

export async function moveCategory(categoryId: number | string, direction: string) {
  const cid = String(categoryId || '').trim();
  if (!cid) return;
  try {
    const res = await fetch(`/api/admin/categories/${encodeURIComponent(cid)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || '移动失败');
    location.reload();
  } catch (e: any) {
    alert('移动失败: ' + (e?.message || e));
  }
}

export async function delCategory(categoryId: number | string, productCount: number | string) {
  const cid = String(categoryId || '').trim();
  if (!cid) return;
  const pc = Number.parseInt(String(productCount || '0'), 10) || 0;
  if (!confirm(`确定删除分类吗？分类下商品数量: ${pc}`)) return;
  try {
    const res = await fetch(`/api/admin/categories/${encodeURIComponent(cid)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || '删除失败');
    location.reload();
  } catch (e: any) {
    alert('删除失败: ' + (e?.message || e));
  }
}
