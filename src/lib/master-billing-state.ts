export function applyTopupResultToShopViews(shops: Array<any>, billing: any) {
  const shopId = Number(billing?.shop_id || 0);
  const balanceRsd = Number(billing?.balance_rsd || 0);

  return (shops || []).map((shop) => {
    if (Number(shop?.id || 0) !== shopId) {
      return shop;
    }
    return {
      ...shop,
      balanceRsd,
      sortValueBalance: balanceRsd,
    };
  });
}
