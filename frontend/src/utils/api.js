const BASE = import.meta.env.VITE_API_URL || '/api';

function token() {
  try { return localStorage.getItem('airnotes_token'); } catch { return null; }
}

async function req(path, opts = {}) {
  const t = token();
  const headers = {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...opts.headers,
  };

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    try { localStorage.removeItem('airnotes_token'); } catch {}
    window.location.reload();
    return;
  }

  // Parse body regardless of status so we can surface error messages
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(body?.message || body?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data   = body;
    throw err;
  }
  return body;
}

export const api = {
  login:        pwd  => req('/auth/login', { method: 'POST', body: JSON.stringify({ password: pwd }) }),
  verify:       ()   => req('/auth/verify'),
  getFiles:     ()   => req('/files'),
  refreshFiles: ()   => req('/files/refresh', { method: 'POST' }),
  search:       q    => req(`/search?q=${encodeURIComponent(q)}`),
  telegramInfo: ()   => req('/telegram/info'),

  // Returns a plain URL string (no auth header needed — auth is in the path token)
  // We embed the JWT in a query param for streaming so the browser can load it directly
  getStreamUrl: (fileId) => {
    const t = token();
    const encoded = encodeURIComponent(fileId);
    // Pass token as query param so pdf.js can stream without custom headers on redirect
    return `${BASE}/files/${encoded}/stream${t ? `?t=${t}` : ''}`;
  },
};
