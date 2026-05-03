export function shouldRetryStream(status: number, contentType: string): boolean {
  if (status === 404 || status === 410) {
    return false;
  }

  if (contentType.includes('application/json') && status >= 400 && status < 500) {
    return false;
  }

  return true;
}
