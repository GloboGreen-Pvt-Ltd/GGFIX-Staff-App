// TEMPORARY debug logging for the "profile not found (404)" investigation.
// Dev builds only (__DEV__) — release builds log nothing. Never logs the token
// itself, only its decoded (non-secret) claims. Remove once the employee ↔ login
// mapping is confirmed fixed on the server.
import { store } from '../store';
import { normalizeIndianMobile } from './mobile';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Minimal base64url decode (no dependency on atob/Buffer being present).
function b64urlDecode(input) {
  const s = String(input).replace(/-/g, '+').replace(/_/g, '/');
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    if (ch === '=') break;
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  try { return decodeURIComponent(escape(out)); } catch { return out; }
}

export function jwtClaims(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const c = JSON.parse(b64urlDecode(part));
    // Only identity-related claims; nothing else is useful here.
    const pick = {};
    ['sub', 'userId', 'uid', 'id', 'shopId', 'shop_id', 'roles', 'role', 'email', 'mobile', 'phone', 'exp'].forEach((k) => {
      if (c[k] !== undefined) pick[k] = c[k];
    });
    return pick;
  } catch {
    return null;
  }
}

// Snapshot of who the app thinks is logged in, from the redux session.
export function sessionIdentity() {
  const s = store.getState()?.auth || {};
  return {
    userId: s.userId ?? null,
    shopId: s.shopId ?? null,
    roles: s.roles ?? [],
    roleLabel: s.roleLabel ?? null,
    email: s.email ?? null,
    mobile: s.mobile ?? null,
    normalizedMobile: s.mobile ? normalizeIndianMobile(s.mobile) : null,
    technicianId: s.technicianId ?? null,
    jwt: jwtClaims(s.accessToken),
  };
}

export function isShopOwnerSession() {
  const roles = (store.getState()?.auth?.roles || []).map((r) => String(r).toUpperCase());
  return roles.includes('SHOP_OWNER') && !roles.includes('TECHNICIAN') && !roles.includes('STAFF') && !roles.includes('PICKUP_PERSON');
}

export function logProfileDebug(stage, extra = {}) {
  if (!__DEV__) return;
  try {
    // One line so it's easy to grep in the Metro log.
    console.log(`[profile-debug] ${stage} ${JSON.stringify({ ...sessionIdentity(), ...extra })}`);
  } catch {
    /* never let logging break the screen */
  }
}
