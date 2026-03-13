export async function fetchUpstreamUpload(options: {
  apiBaseUrl: string;
  filename: string;
  fetchImpl?: (url: string) => Promise<Response>;
}): Promise<Response | null> {
  const { apiBaseUrl, filename } = options;
  const fetchImpl = options.fetchImpl || fetch;

  const safeBase = String(apiBaseUrl || '').replace(/\/+$/, '');
  const safeFilename = encodeURIComponent(String(filename || ''));

  // Candidate paths observed in different backend deployments.
  const candidates = [`${safeBase}/assets/uploads/${safeFilename}`, `${safeBase}/uploads/${safeFilename}`];

  for (const url of candidates) {
    const res = await fetchImpl(url);
    if (res.ok) return res;
  }

  return null;
}
