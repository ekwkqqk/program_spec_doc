async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.message || '요청 실패');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  if (!res.ok) {
    throw new Error('요청 실패');
  }
  return res;
}

export const api = {
  meta: () => request('/api/projects/meta'),
  list: () => request('/api/projects'),
  create: (name) => request('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  get: (id) => request(`/api/projects/${id}`),
  remove: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  setSource: (id, body) =>
    request(`/api/projects/${id}/source`, { method: 'PUT', body: JSON.stringify(body) }),
  analyze: (id) => request(`/api/projects/${id}/analyze`, { method: 'POST', body: '{}' }),
  generate: (id, body = {}) =>
    request(`/api/projects/${id}/generate`, { method: 'POST', body: JSON.stringify(body) }),
  saveSections: (id, sections) =>
    request(`/api/projects/${id}/document/sections`, {
      method: 'PUT',
      body: JSON.stringify({ sections }),
    }),
  confirm: (id, confirmed = true) =>
    request(`/api/projects/${id}/document/confirm`, {
      method: 'POST',
      body: JSON.stringify({ confirmed }),
    }),
  exportUrl: (id) => `/api/projects/${id}/export`,
};
