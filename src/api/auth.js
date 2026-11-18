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
 * Employee login: registered mobile + owner-set 6-digit MPIN (no OTP).
 * auth-service /auth/security/employee/login (PR #73) returns the device
 * session directly; a new phone while another is active needs owner approval.
 */
export async function mpinLogin(mobile, mpin) {
  const { getDeviceId } = require('../security/securityApi');
  const { setDeviceRefreshToken } = require('../security/deviceTokens');
  const { Platform } = require('react-native');
  const c = Platform.constants || {};
  const data = await authApi.post('/auth/security/employee/login', {
    skipAuthExpiry: true,
    body: {
      mobile,
      mpin,
      deviceId: await getDeviceId(),
      deviceName: [c.Manufacturer || c.Brand, c.Model].filter(Boolean).join(' ') || Platform.OS,
      platform: Platform.OS,
    },
  });
  if (data?.status === 'DEVICE_APPROVAL_REQUIRED') {
    const msg = `New phone detected. Ask your shop owner to approve this device${data.deviceName ? ` (currently signed in on ${data.deviceName})` : ''}, then log in again.`;
    throw Object.assign(new Error(msg), { status: 202, code: 'DEVICE_APPROVAL_REQUIRED', userFacing: true, payload: { message: msg } });
  }
  await setDeviceRefreshToken(data.refreshToken);
  await saveSession({ ...data, refreshToken: undefined });
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
