export function classifyShopResponseStatus(status: number): number {
  if (status === 404) {
    return 404;
  }

  if (status === 401 || status === 403) {
    return 502;
  }

  return 502;
}
