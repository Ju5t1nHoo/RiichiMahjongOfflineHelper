export interface AuthUser {
  id: string;
  username: string;
  signature: string;
}

async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    credentials: 'include',
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const auth = {
  register: (username: string, password: string) =>
    request<AuthUser>('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    request<AuthUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request<AuthUser>('/api/me'),
};

export const players = {
  list: (q = '') => request<any[]>('/api/players?q=' + encodeURIComponent(q)),
  create: (name: string, avatar?: string) => request('/api/players', { method: 'POST', body: JSON.stringify({ name, avatar }) }),
  update: (id: string, data: { name?: string; avatar?: string | null }) => request(`/api/players/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  unbind: (id: string) => request(`/api/players/${id}`, { method: 'DELETE' }),
  bind: (id: string) => request(`/api/players/${id}/bind`, { method: 'POST' }),
};

export const games = {
  mine: (mode?: number) => request<any[]>(`/api/games/mine${mode ? `?mode=${mode}` : ''}`),
  feed: (mode?: number) => request<any[]>(`/api/games/feed${mode ? `?mode=${mode}` : ''}`),
  get: (id: string) => request<any>(`/api/games/${id}`),
  create: (data: { mode: number; ruleSnapshot: unknown; liveState?: unknown; participants: { seat: number; playerId?: string; tempName?: string }[] }) =>
    request<any>('/api/games', { method: 'POST', body: JSON.stringify(data) }),
  addSettlement: (id: string, data: unknown) =>
    request<any>(`/api/games/${id}/settlements`, { method: 'POST', body: JSON.stringify(data) }),
  finish: (id: string, data: { status: string; participants: { id: string; finalRawScore: number; finalScore: number; rank: number }[] }) =>
    request<any>(`/api/games/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  quick: (data: { mode: number; ruleSnapshot: unknown; participants: { seat: number; playerId: string; finalRawScore: number }[] }) =>
    request<any>('/api/games/quick', { method: 'POST', body: JSON.stringify(data) }),
};

export const me = {
  signature: (signature: string) => request('/api/me/signature', { method: 'PATCH', body: JSON.stringify({ signature }) }),
  password: (oldPassword: string, newPassword: string) => request('/api/me/password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) }),
  rules: () => request<Record<string, unknown>>('/api/me/rules'),
  rulesPut: (rules: Record<string, unknown>) => request('/api/me/rules', { method: 'PUT', body: JSON.stringify(rules) }),
};

export const stats = {
  players: (mode: number, sort: string) => request<any[]>(`/api/stats/players?mode=${mode}&sort=${sort}`),
  player: (id: string, mode: number) => request<any>(`/api/stats/players/${id}?mode=${mode}`),
};

export const feedback = {
  submit: (content: string, contact?: string) => request('/api/feedback', { method: 'POST', body: JSON.stringify({ content, contact }) }),
};
