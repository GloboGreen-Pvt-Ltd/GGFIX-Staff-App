import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The auth token is the crown-jewel credential, so it lives in the OS secure
// enclave (iOS Keychain / Android Keystore) via expo-secure-store — NOT in
// plaintext AsyncStorage where a rooted device / adb backup / another app could
// lift it. The non-secret profile (name/role/shop ids) stays in AsyncStorage.
//
// expo-secure-store is a native module: it's loaded lazily so the JS keeps
// running (falling back to AsyncStorage) in environments where the native side
// isn't present yet — Expo Go, web, or a build made before this dependency was
// added. Once a dev/production build includes it, the token silently upgrades
// to secure storage and is migrated out of AsyncStorage on next read.
const TOKEN_KEY = 'auth.token';
const USER_KEY = 'auth.user';
// SecureStore keys must match [A-Za-z0-9._-]; the dotted key above is fine.
const SECURE_TOKEN_KEY = 'auth.token';

let SecureStore = null;
try {
  // Not available on web; require lazily so an absent native module can't crash
  // the bundle on startup.
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line global-require
    SecureStore = require('expo-secure-store');
  }
} catch (_) {
  SecureStore = null;
}

function secureAvailable() {
  return !!(SecureStore && typeof SecureStore.setItemAsync === 'function');
}

async function writeToken(token) {
  const value = token || '';
  if (secureAvailable()) {
    try {
      if (value) await SecureStore.setItemAsync(SECURE_TOKEN_KEY, value);
      else await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
      // Ensure no plaintext copy lingers from a previous app version.
      await AsyncStorage.removeItem(TOKEN_KEY);
      return;
    } catch (_) {
      // fall through to AsyncStorage so login never hard-fails on a secure-store
      // hiccup (e.g. no device lock on some Android OEMs)
    }
  }
  await AsyncStorage.setItem(TOKEN_KEY, value);
}

async function readToken() {
  if (secureAvailable()) {
    try {
      const secure = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
      if (secure) return secure;
      // One-time migration: an older build stored the token in AsyncStorage.
      // Move it into secure storage and scrub the plaintext copy.
      const legacy = await AsyncStorage.getItem(TOKEN_KEY);
      if (legacy) {
        try { await SecureStore.setItemAsync(SECURE_TOKEN_KEY, legacy); } catch (_) {}
        await AsyncStorage.removeItem(TOKEN_KEY);
        return legacy;
      }
      return null;
    } catch (_) {
      // fall through to AsyncStorage
    }
  }
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function deleteToken() {
  if (secureAvailable()) {
    try { await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY); } catch (_) {}
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function saveSession(session) {
  const token = session?.accessToken || '';
  // Persist the profile WITHOUT the token so the secret isn't duplicated into
  // plaintext AsyncStorage under auth.user.
  const { accessToken, ...profile } = session || {};
  await Promise.all([
    writeToken(token),
    AsyncStorage.setItem(USER_KEY, JSON.stringify(profile || {})),
  ]);
}

export async function clearSession() {
  await Promise.all([
    deleteToken(),
    AsyncStorage.removeItem(USER_KEY),
  ]);
}

export async function getToken() {
  return readToken();
}

export async function getSession() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Lets the API client notify the app when a token is rejected (expired/invalid)
// so it can clear state and route back to Login.
let authExpiredHandler = null;
export function setAuthExpiredHandler(fn) { authExpiredHandler = fn; }
export function notifyAuthExpired() {
  try { if (authExpiredHandler) authExpiredHandler(); } catch (_) {}
}
