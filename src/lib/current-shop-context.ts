type ShopRecord = { id?: string; name?: string; slug?: string };

export function resolveCurrentShopContext(pathname: string, shopMap: Record<string, ShopRecord>) {
  const slug = String(pathname || '').replace(/^\//, '').split('/')[0] || '';
  const matchedShop = Object.values(shopMap || {}).find((shop) => String(shop?.slug || '').trim() === slug);

  return {
    id: String(matchedShop?.id || '').trim(),
    slug,
    name: String(matchedShop?.name || '').trim() || '当前店铺',
  };
}
