/** Infosys Artery AI — Enterprise API Service Layer. */
// In Vite development, use the same-origin proxy so port fallbacks (3000,
// 3001, etc.) still reach the API. Production Docker builds set an absolute URL.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'artery_app_auth_token';
const USER_KEY = 'artery_app_user';
function token() { return localStorage.getItem(TOKEN_KEY); }
function isArcadeCase(caseId) { return /^ARCADE-(syntax|stenosis)-(train|val|test)-\d{4}$/.test(caseId); }
function isCadicaCase(caseId) { return /^CADICA-p\d+-v\d+-\d+$/.test(caseId); }

export function datasetImageUrl(fileName) { return `${API_BASE}/dataset/images/${encodeURIComponent(fileName)}?auth=${encodeURIComponent(token() || '')}`; }
export function caseScanUrl(caseId) { return `${API_BASE}/files/${encodeURIComponent(caseId)}?auth=${encodeURIComponent(token() || '')}`; }
export function caseDicomFrameUrl(caseId, frameIndex = 0) { return `${API_BASE}/files/${encodeURIComponent(caseId)}/dicom-frames/${frameIndex}?auth=${encodeURIComponent(token() || '')}`; }

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token()) headers.set('Authorization', `Bearer ${token()}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/register') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      window.location.assign('/login');
    }
    throw new Error(payload?.detail || payload?.message || `Request failed (${response.status})`);
  }
  return payload;
}

function saveAuth(result) {
  if (result?.token) localStorage.setItem(TOKEN_KEY, result.token);
  if (result?.user) localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  return result;
}

export function isAuthenticated() { return Boolean(token()); }

export async function getApiHealth() {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) throw new Error(`API health check failed (${response.status})`);
  return response.json();
}

export async function login(credentials) {
  return saveAuth(await request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }));
}

export async function register(userData) {
  const result = await request('/auth/register', { method: 'POST', body: JSON.stringify(userData) });
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  return result;
}

export async function logout() {
  try {
    await request('/auth/logout', { method: 'POST' });
  } finally {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  return { success: true };
}

export async function getCases(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') query.set(k, v);
  });
  return request(`/cases${query.toString() ? `?${query}` : ''}`);
}

export async function getCase(caseId) {
  const path = isArcadeCase(caseId)
    ? `/arcade/cases/${encodeURIComponent(caseId)}`
    : isCadicaCase(caseId) ? `/cadica/cases/${encodeURIComponent(caseId)}` : `/cases/${encodeURIComponent(caseId)}`;
  return request(path);
}

export async function createCase(caseData) {
  return request('/cases', { method: 'POST', body: JSON.stringify(caseData) });
}

export async function updateCase(caseId, updates) {
  return request(`/cases/${encodeURIComponent(caseId)}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export async function uploadMedicalImage(caseId, fileMetadata, onProgress) {
  const file = fileMetadata?.file;
  if (!(file instanceof File)) {
    throw new Error('The selected file was not provided to the upload service. Please reselect it.');
  }
  const form = new FormData();
  form.append('file', file, file.name);
  if (onProgress) onProgress(20);
  const result = await request(`/cases/${encodeURIComponent(caseId)}/upload`, { method: 'POST', body: form });
  if (onProgress) onProgress(100);
  return result;
}

// ----------------- AI DIAGNOSTIC INFERENCE -----------------
export async function analyzeCase(caseId) {
  const path = isArcadeCase(caseId)
    ? `/arcade/cases/${encodeURIComponent(caseId)}/analyze`
    : isCadicaCase(caseId) ? `/cadica/cases/${encodeURIComponent(caseId)}/analyze` : `/cases/${encodeURIComponent(caseId)}/analyze`;
  return request(path, { method: 'POST' });
}

export async function analyzeVideoFrame(caseId, timeSeconds) {
  return request(`/cases/${encodeURIComponent(caseId)}/analyze-video-frame`, {
    method: 'POST',
    body: JSON.stringify({ timeSeconds }),
  });
}

export async function createDenoisedPreview(caseId) {
  const path = isArcadeCase(caseId)
    ? `/arcade/cases/${encodeURIComponent(caseId)}/denoise-preview`
    : isCadicaCase(caseId) ? `/cadica/cases/${encodeURIComponent(caseId)}/denoise-preview` : `/cases/${encodeURIComponent(caseId)}/denoise-preview`;
  return request(path, { method: 'POST' });
}

export async function getCaseAnalysis(caseId) {
  const path = isArcadeCase(caseId)
    ? `/arcade/cases/${encodeURIComponent(caseId)}/analysis`
    : isCadicaCase(caseId) ? `/cadica/cases/${encodeURIComponent(caseId)}/analysis` : `/cases/${encodeURIComponent(caseId)}/analysis`;
  return request(path);
}

export async function approveCaseReport(caseId, approval) {
  return request(`/cases/${encodeURIComponent(caseId)}/approve-report`, { method: 'POST', body: JSON.stringify(approval) });
}

export async function getReviewAnnotations(caseId) {
  return request(`/cases/${encodeURIComponent(caseId)}/review-annotations`);
}

export async function saveReviewAnnotation(caseId, annotation) {
  return request(`/cases/${encodeURIComponent(caseId)}/review-annotations`, { method: 'PUT', body: JSON.stringify(annotation) });
}

export async function getPatientReports() {
  return request('/patient/reports');
}

export async function getModelStatus() {
  return request('/model/status');
}

export async function getModelRegistry() {
  return request('/model/registry');
}

export async function getActivityLogs(limit = 100) {
  const query = new URLSearchParams({ limit: String(limit) });
  return request(`/activity-logs?${query}`);
}

export async function getFeatureSettings() {
  return request('/features/settings');
}

export async function getFeatureAccess() {
  return request('/features/access');
}

export async function getFeatureEnvironments() {
  return request('/features/environments');
}

export async function createFeatureEnvironment(name) {
  return request('/features/environments', { method: 'POST', body: JSON.stringify({ name }) });
}

export async function getFeatureSummary(environmentId) {
  const query = new URLSearchParams({ environment_id: environmentId });
  return request(`/features/summary?${query}`);
}

export async function getFeatureFlags(environmentId, search = '') {
  const query = new URLSearchParams({ environment_id: environmentId });
  if (search.trim()) query.set('search', search.trim());
  return request(`/features/flags?${query}`);
}

export async function createFeatureFlag(flag) {
  return request('/features/flags', { method: 'POST', body: JSON.stringify(flag) });
}

export async function getFeatureFlag(flagKey, environmentId = 'development') {
  const query = new URLSearchParams({ environment_id: environmentId });
  return request(`/features/flags/${encodeURIComponent(flagKey)}?${query}`);
}

export async function updateFeatureFlag(flagKey, patch) {
  return request(`/features/flags/${encodeURIComponent(flagKey)}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function deleteFeatureFlag(flagKey) {
  return request(`/features/flags/${encodeURIComponent(flagKey)}`, { method: 'DELETE' });
}

export async function updateFeatureFlagConfig(flagKey, environmentId, config) {
  return request(`/features/flags/${encodeURIComponent(flagKey)}/environments/${encodeURIComponent(environmentId)}`, { method: 'PUT', body: JSON.stringify(config) });
}

export async function evaluateFeatureFlag(evaluation) {
  return request('/features/evaluate', { method: 'POST', body: JSON.stringify(evaluation) });
}

export async function getFeatureAnalytics(environmentId) {
  const query = new URLSearchParams({ environment_id: environmentId });
  return request(`/features/analytics?${query}`);
}

export async function retrainModel() {
  return request('/model/retrain', { method: 'POST' });
}

export async function runModelTest() {
  return request('/model/test', { method: 'POST' });
}

export async function trainSegmentationModels() {
  return request('/model/train-segmentation', { method: 'POST' });
}

export async function trainCadicaDetector() {
  return request('/model/train-cadica-detector', { method: 'POST' });
}

export async function trainCadicaDenoiser() {
  return request('/model/train-denoiser', { method: 'POST' });
}

export async function getSegmentationComparison() {
  return request('/model/segmentation-comparison');
}

export async function generateSegmentationComparison() {
  return request('/model/segmentation-comparison', { method: 'POST' });
}

export async function getModelReports() {
  return request('/model/reports');
}

export async function getSegmentationGallery({ split = 'all', offset = 0, limit = 6 } = {}) {
  const query = new URLSearchParams({ split, offset: String(offset), limit: String(limit) });
  return request(`/model/segmentation-gallery?${query.toString()}`);
}

export async function generateClassifierLearningCurves() {
  return request('/model/classifier-learning-curves', { method: 'POST' });
}

export async function getModelRocCurve() {
  return request('/model/roc-curve');
}

export async function getDatasetSummary() {
  return request('/dataset/summary');
}

export async function getDatasetImages() {
  return request('/dataset/images');
}

export async function getCadicaImages({ search = '', limit = 100, offset = 0, annotatedOnly = false } = {}) {
  const query = new URLSearchParams({ search, limit: String(limit), offset: String(offset), annotated_only: String(annotatedOnly) });
  return request(`/cadica/images?${query}`);
}

export async function askAssistant(message) {
  return request('/assistant', { method: 'POST', body: JSON.stringify({ message }) });
}

// ----------------- NOTIFICATIONS, REPORTS, PROFILE -----------------
export async function getNotifications() {
  return request('/notifications');
}

export async function getEmailAlertStatus() {
  return request('/notifications/email-status');
}

export async function markNotificationAsRead(id) {
  await request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
  return getNotifications();
}

export async function markAllNotificationsAsRead() {
  await request('/notifications/read-all', { method: 'POST' });
  return getNotifications();
}

export async function clearNotifications() {
  return request('/notifications', { method: 'DELETE' });
}

export async function getReports() {
  return request('/reports');
}

export async function getProfile() {
  return request('/profile');
}

export async function getDoctors() {
  return request('/doctors');
}

export async function getPharmacies(latitude, longitude, radiusKm = 10) {
  const query = new URLSearchParams();
  if (latitude != null && longitude != null) {
    query.set('lat', latitude);
    query.set('lon', longitude);
    query.set('radius_km', radiusKm);
  }
  const result = await request(`/pharmacies${query.size ? `?${query}` : ''}`);
  return result.pharmacies || [];
}

export async function savePharmacies(pharmacies) {
  return request('/pharmacies/cache', { method: 'POST', body: JSON.stringify({ pharmacies }) });
}

export async function getHospitals(latitude, longitude, radiusKm = 15) {
  const query = new URLSearchParams();
  if (latitude != null && longitude != null) {
    query.set('lat', latitude);
    query.set('lon', longitude);
    query.set('radius_km', radiusKm);
  }
  const result = await request(`/hospitals${query.size ? `?${query}` : ''}`);
  return result.hospitals || [];
}

export async function saveHospitals(hospitals) {
  return request('/hospitals/cache', { method: 'POST', body: JSON.stringify({ hospitals }) });
}

export async function getAppointments() {
  return request('/appointments');
}

export async function createAppointment(appointment) {
  return request('/appointments', { method: 'POST', body: JSON.stringify(appointment) });
}

export async function updateAppointment(appointmentId, status) {
  return request(`/appointments/${encodeURIComponent(appointmentId)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function getMessageThreads() {
  return request('/messages');
}

export async function getMessageThread(userId) {
  return request(`/messages/${encodeURIComponent(userId)}`);
}

export async function sendPatientMessage(recipientId, message) {
  return request('/messages', { method: 'POST', body: JSON.stringify({ recipientId, message }) });
}

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

export async function updateProfile(updatedData) {
  const user = await request('/profile', { method: 'PATCH', body: JSON.stringify(updatedData) });
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export async function changePassword(passwordData) {
  return request('/profile/change-password', { method: 'POST', body: JSON.stringify(passwordData) });
}

export async function runVerificationSuite() {
  return request('/testing/verification-suite');
}

