import { authApi } from './client';
import { guardOtp } from './otpCooldown';
import { saveSession, clearSession } from '../auth/session';

export async function login(email, { password, otp, shopSlug } = {}) {
  const body = { email };
  if (otp) body.otp = otp;
  else if (password) body.password = password;
  if (shopSlug) body.shopSlug = shopSlug;
  const data = await authApi.post('/auth/login', { body });
  await saveSession(data);
  return data;
}

/**
 * Request a login OTP for a mobile number (or email). The server refuses with
 * "No account found…" when nothing matches, so the login screen uses this as
 * the existence check BEFORE moving the user to the code step.
 *
 * Returns { channel: 'EMAIL'|'MOBILE', sent, target, ttlMinutes?, devOtp?,
 * defaultOtp?, email }. There is no SMS gateway yet, so MOBILE identifiers
 * resolve to the account's static users.otp_code (123456 by default).
 * The wire field is `email` but accepts an email OR a mobile number.
 */
async function _requestOtp(identifier) {
  return await authApi.post('/auth/otp/send', { body: { email: identifier } });
}

export async function logout() {
  try { await require('../utils/checkoutAlarm').unregisterPush(); } catch (_) {}
  try {
    const { getSession } = require('../auth/session');
    if ((await getSession())?.deviceSessionId) await authApi.post('/auth/security/session/logout', { skipAuthExpiry: true });
  } catch (_) {}
  try { await require('../security/deviceTokens').setDeviceRefreshToken(null); } catch (_) {}
  await clearSession();
}

// OTP sends go through the cooldown / in-flight guard (see otpCooldown.js).
export const requestOtp = (identifier) => guardOtp(identifier, () => _requestOtp(identifier));
