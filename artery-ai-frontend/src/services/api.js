/** FastAPI-backed service layer for the Artery AI frontend. */
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';
const TOKEN_KEY = 'artery_app_auth_token';
const USER_KEY = 'artery_app_user';

function token() { return localStorage.getItem(TOKEN_KEY); }
async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token()) headers.set('Authorization', `Bearer ${token()}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(payload?.detail || payload?.message || `Request failed (${response.status})`);
  return payload;
}
function saveAuth(result) {
  if (result?.token) localStorage.setItem(TOKEN_KEY, result.token);
  if (result?.user) localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  return result;
}
export function isAuthenticated() { return Boolean(token()); }

export async function login(credentials) { return saveAuth(await request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) })); }
export async function register(userData) { return saveAuth(await request('/auth/register', { method: 'POST', body: JSON.stringify(userData) })); }
export async function logout() {
  try { await request('/auth/logout', { method: 'POST' }); } finally {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
  }
  return { success: true };
}

export async function getCases(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') query.set(k, v); });
  return request(`/cases${query.toString() ? `?${query}` : ''}`);
}
export async function getCase(caseId) { return request(`/cases/${encodeURIComponent(caseId)}`); }
export async function createCase(caseData) { return request('/cases', { method: 'POST', body: JSON.stringify(caseData) }); }
export async function updateCase(caseId, updates) { return request(`/cases/${encodeURIComponent(caseId)}`, { method: 'PATCH', body: JSON.stringify(updates) }); }

export async function uploadMedicalImage(caseId, fileMetadata, onProgress) {
  const file = fileMetadata?.file;
  if (!(file instanceof File)) throw new Error('The selected file was not provided to the upload service. Please reselect it.');
  const form = new FormData(); form.append('file', file, file.name);
  // Fetch does not expose upload progress; show honest start/end progress in the current UI.
  if (onProgress) onProgress(10);
  const result = await request(`/cases/${encodeURIComponent(caseId)}/upload`, { method: 'POST', body: form });
  if (onProgress) onProgress(100);
  return result;
}

export async function getNotifications() { return request('/notifications'); }
export async function markNotificationAsRead(id) { await request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }); return getNotifications(); }
export async function markAllNotificationsAsRead() { await request('/notifications/read-all', { method: 'POST' }); return getNotifications(); }
export async function clearNotifications() { return request('/notifications', { method: 'DELETE' }); }
export async function getReports() { return request('/reports'); }
export async function getProfile() { return request('/profile'); }
export async function updateProfile(updatedData) { const user = await request('/profile', { method: 'PATCH', body: JSON.stringify(updatedData) }); localStorage.setItem(USER_KEY, JSON.stringify(user)); return user; }
export async function changePassword(passwordData) { return request('/profile/change-password', { method: 'POST', body: JSON.stringify(passwordData) }); }

export async function runInitialPreprocessing(caseId) { return request(`/preprocessing/${encodeURIComponent(caseId)}`, { method: 'POST' }); }
export async function getAnalysisStatus(caseId) { return request(`/analysis/${encodeURIComponent(caseId)}`); }
