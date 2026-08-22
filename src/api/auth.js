import { authApi } from './client';
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
export async function requestOtp(identifier) {
  return await authApi.post('/auth/otp/send', { body: { email: identifier } });
}

export async function logout() {
  await clearSession();
}
