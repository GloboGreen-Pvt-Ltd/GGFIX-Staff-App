// Device-session / TPIN calls (auth-service /auth/security/*, migration 116).
// The employee app's existing server PIN (/auth/me/pin) remains its MPIN.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../api/client';
import { getSession, getToken, saveSession } from '../auth/session';
import { sha256Hex } from './sha256';
import { setDeviceRefreshToken } from './deviceTokens';

const DEVICE_KEY = 'security.deviceId';
let SecureStore = null;
try { if (Platform.OS !== 'web') SecureStore = require('expo-secure-store'); } catch (_) { SecureStore = null; }

function randomId() {
  const b = new Uint8Array(32);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < b.length; i += 1) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export async function getDeviceId() {
  let id = null;
  try { id = SecureStore ? await SecureStore.getItemAsync(DEVICE_KEY) : await AsyncStorage.getItem(DEVICE_KEY); } catch (_) {}
  if (!id) {
    id = randomId();
    try { if (SecureStore) await SecureStore.setItemAsync(DEVICE_KEY, id); else await AsyncStorage.setItem(DEVICE_KEY, id); } catch (_) {}
  }
  return id;
}

export async function startDeviceSession({ replaceExisting = false } = {}) {
  const token = await getToken();
  const c = Platform.constants || {};
  const res = await authApi.post('/auth/security/session/start', {
    headers: { Authorization: `Bearer ${token}` },
    skipAuthExpiry: true,
    body: {
      deviceId: await getDeviceId(),
      deviceName: [c.Manufacturer || c.Brand, c.Model].filter(Boolean).join(' ') || Platform.OS,
      platform: Platform.OS,
      replaceExisting,
    },
  });
  await setDeviceRefreshToken(res.refreshToken);
  await saveSession({ ...((await getSession()) || {}), accessToken: res.accessToken, deviceSessionId: res.sessionId, otpExpiresAt: res.otpExpiresAt });
  return res;
}

export const sessionStatus = () => authApi.get('/auth/security/session');
export const logoutDeviceSession = () => authApi.post('/auth/security/session/logout', { skipAuthExpiry: true });
export const createPin = (type, pin) => authApi.post(`/auth/security/pin/${type}`, { body: { pin } });
export const resetPin = (type, { otpToken, newPin, verificationMethod }) =>
  authApi.post(`/auth/security/pin/${type}/reset`, { body: { otpToken, newPin, verificationMethod } });

export function authorizeTpin({ pin, action, method, path }) {
  return authApi.post('/auth/security/tpin/authorize', {
    body: { pin, actionType: action, contextHash: sha256Hex(`${method} ${path}`), idempotencyKey: randomId().slice(0, 32) },
  });
}

export async function otpProofToken({ identifier, otp }) {
  const data = await authApi.post('/auth/login', { body: { email: identifier, otp }, skipAuthExpiry: true });
  return data?.accessToken;
}
export const sendResetOtp = ({ identifier }) => authApi.post('/auth/otp/send', { body: { email: identifier } });

export function pinErrorMessage(e) {
  const m = String(e?.serverMessage || e?.devMessage || e?.message || '');
  const left = m.match(/WRONG_PIN:(\d+)/);
  if (left) return `Incorrect PIN. ${left[1]} attempt(s) left.`;
  if (/PIN_LOCKED/.test(m)) return 'Too many wrong attempts. Try again in 15 minutes.';
  if (/check in first/i.test(m)) return 'Please check in first to use your TPIN.';
  if (/Already checked in/i.test(m)) return 'You are already checked in.';
  if (/too simple/i.test(m)) return 'PIN is too simple. Avoid repeated or sequential digits.';
  if (/SESSION_EXPIRED|SESSION_REVOKED/.test(m)) return 'Session expired. Please log in again.';
  return e?.message || 'Something went wrong. Please try again.';
}
