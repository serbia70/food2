export function buildEditShopSuccessMessage(shopName: string): string {
  const name = String(shopName || '').trim();
  if (name) {
    return `已保存 ${name}，页面将刷新以显示最新状态`;
  }
  return '店铺已保存，页面将刷新以显示最新状态';
}
