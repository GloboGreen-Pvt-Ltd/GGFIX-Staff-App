import { Platform } from 'react-native';
import {
  AUTH_BASE,
  TICKET_BASE,
  SHOP_BASE,
  USER_BASE,
  ORDER_BASE,
} from './config';
import { getToken, clearSession, notifyAuthExpired } from '../auth/session';
import { friendlyApiMessage, transportMessage, logDiagnostic } from '../utils/userMessages';

// Decode a JWT's `exp` claim locally (base64url, no library) to distinguish a
// GENUINE expiry from a signature/verification failure (e.g. JWT_SECRET drift or
// an older service build). A truly-expired token should log the user out from
// ANY service; a still-valid token rejected by one service must NOT. Any decode
// problem returns false so we never force-logout on uncertainty.
export function isJwtExpired(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return false;
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = JSON.parse(atob(b64));
    return typeof json.exp === 'number' && json.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

async function request(baseUrlOrNull, method, path, { query, body, headers, skipAuthExpiry } = {}) {
  let base = baseUrlOrNull && typeof baseUrlOrNull === 'string' ? baseUrlOrNull.trim() : '';
  if (!base || !base.startsWith('http')) base = AUTH_BASE;
  else if (!base.endsWith('/')) base = base + '/';
  // Strip leading slashes from the path: `base` always ends with "/", and
  // new URL('/tickets', 'http://host/gateway/') would resolve to
  // 'http://host/tickets' — silently dropping any path prefix on the base. With
  // the slash stripped it resolves to 'http://host/gateway/tickets'. Root-path
  // bases (today's port-based hosts) are unaffected.
  const url = new URL(String(path).replace(/^\/+/, ''), base);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }

  const token = await getToken();
  const urlString = url.toString();
  let res;
  try {
    res = await fetch(urlString, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers || {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const baseHint =
      baseUrlOrNull && typeof baseUrlOrNull === 'string' && baseUrlOrNull.includes('localhost')
        ? ' (note: localhost on a phone means the phone itself)'
        : '';
    // Users see a plain message; the detail (no host, no token) is for developers.
    const err = new Error(transportMessage(false));
    err.status = 0;
    err.diagnostic = `${method} ${url.pathname}: ${e?.message || 'Network request failed'}${baseHint}`;
    logDiagnostic(err);
    throw err;
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    // A 401 only means "session is dead, log in again" when it comes from the
    // AUTH service — that service is the authority on token validity. A 401 from
    // any OTHER microservice means THAT service can't validate the token (its
    // JWT_SECRET has drifted from auth-service, or it's running an older build);
    // that must NOT clear the session and bounce the whole app to Login. A 403
    // is a real per-resource authorization failure and never clears the session.
    const isAuthService = base === AUTH_BASE;
    // Clear the session (→ Login) on a 401 only when we're sure it's a genuine
    // expiry: either it came from AUTH (the authority on validity) OR the JWT's
    // own exp claim is already past. A 401 from another service with a still-valid
    // token means THAT service can't verify it (secret drift / older build) and
    // must NOT bounce the whole app to Login. Spring services answer an expired
    // token with a bare 403 (unauthenticated), so a 403 + past exp also counts.
    const sessionExpired = token && (
      (res.status === 401 && (isAuthService || isJwtExpired(token)))
      || (res.status === 403 && isJwtExpired(token))
    );
    if (sessionExpired && !skipAuthExpiry) {
      await clearSession();
      notifyAuthExpired();
    }
    // err.message is always a safe, friendly sentence; the server's own text
    // stays on err.serverMessage for logic (never shown unless it's a plain
    // validation sentence) and err.diagnostic for developer logs.
    const serverMessage = (json && (json.message || json.error)) || text || '';
    const err = new Error(friendlyApiMessage({ status: res.status, serverMessage, method, hadToken: !!token, sessionExpired }));
    err.status = res.status;
    err.payload = json;
    err.serverMessage = serverMessage;
    err.diagnostic = `${method} ${url.pathname} → ${res.status}: ${String(serverMessage).slice(0, 300)}`;
    logDiagnostic(err);
    throw err;
  }

  return json;
}

// Multipart file upload. Does NOT set Content-Type so fetch can add the
// multipart boundary itself. `file` is an expo-image-picker asset { uri }.
async function uploadRequest(baseUrlOrNull, path, { uri, name, type, fields } = {}) {
  let base = baseUrlOrNull && typeof baseUrlOrNull === 'string' ? baseUrlOrNull.trim() : '';
  if (!base || !base.startsWith('http')) base = AUTH_BASE;
  else if (!base.endsWith('/')) base = base + '/';
  // Strip leading slashes so a path-prefixed base isn't discarded (see request()).
  const urlString = new URL(String(path).replace(/^\/+/, ''), base).toString();

  const form = new FormData();
  const filename = name || 'upload.jpg';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, filename);
  } else {
    form.append('file', { uri, name: filename, type: type || 'image/jpeg' });
  }
  if (fields) Object.entries(fields).forEach(([k, v]) => { if (v != null) form.append(k, String(v)); });

  const token = await getToken();
  let res;
  try {
    res = await fetch(urlString, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    });
  } catch (e) {
    const err = new Error(transportMessage(false));
    err.status = 0;
    err.diagnostic = `UPLOAD ${new URL(urlString).pathname}: ${e?.message || 'Network request failed'}`;
    logDiagnostic(err);
    throw err;
  }

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    // Same rule as request(): an auth-service 401, or a 401/403 with a past exp, ends the session.
    if (token && ((res.status === 401 && base === AUTH_BASE) || ((res.status === 401 || res.status === 403) && isJwtExpired(token)))) {
      await clearSession(); notifyAuthExpired();
    }
    const serverMessage = (json && (json.message || json.error)) || text || '';
    const err = new Error(friendlyApiMessage({ status: res.status, serverMessage, method: 'POST', hadToken: !!token }));
    err.status = res.status;
    err.serverMessage = serverMessage;
    err.diagnostic = `UPLOAD ${new URL(urlString).pathname} → ${res.status}: ${String(serverMessage).slice(0, 300)}`;
    logDiagnostic(err);
    throw err;
  }
  return json;
}

function createClient(baseUrl) {
  return {
    get: (path, opts) => request(baseUrl, 'GET', path, opts),
    post: (path, opts) => request(baseUrl, 'POST', path, opts),
    put: (path, opts) => request(baseUrl, 'PUT', path, opts),
    patch: (path, opts) => request(baseUrl, 'PATCH', path, opts),
    del: (path, opts) => request(baseUrl, 'DELETE', path, opts),
    upload: (path, opts) => uploadRequest(baseUrl, path, opts),
  };
}

export const authApi = createClient(AUTH_BASE);
export const ticketApi = createClient(TICKET_BASE);
export const shopApi = createClient(SHOP_BASE);
export const userApi = createClient(USER_BASE);
export const orderApi = createClient(ORDER_BASE);
