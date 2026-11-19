// App Lock + biometric unlock, per signed-in employee.
// Prefs live in device secure storage under the employee's user id; any other
// id (account switch) reads as "off", and logout wipes them (clearLockPrefs).
// Unlock = biometric (if this employee turned it on) with the employee's own
// server-checked PIN as the fallback. No PIN or biometric data is ever stored
// here or sent anywhere — the OS keeps the biometric, the server the PIN hash.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { store } from '../store';

const KEY = 'lock.prefs';
let SecureStore = null;
try {
  // eslint-disable-next-line global-require
  if (Platform.OS !== 'web') SecureStore = require('expo-secure-store');
} catch (_) { SecureStore = null; }
const read = () => (SecureStore?.getItemAsync ? SecureStore.getItemAsync(KEY) : AsyncStorage.getItem(KEY));
const write = (v) => (SecureStore?.setItemAsync ? SecureStore.setItemAsync(KEY, v) : AsyncStorage.setItem(KEY, v));

const me = () => store.getState()?.auth?.userId || null;

/** { lock, biometric } for the signed-in employee. Throws on a storage error. */
export async function getLockPrefsStrict() {
  const uid = me();
  const raw = await read();
  const p = raw ? JSON.parse(raw) : null;
  if (!uid || !p || p.userId !== uid) return { lock: false, biometric: false };
  return { lock: !!p.lock, biometric: !!p.biometric };
}
export async function getLockPrefs() {
  try { return await getLockPrefsStrict(); } catch { return { lock: false, biometric: false }; }
}
export async function setLockPrefs(patch) {
  const uid = me();
  if (!uid) return;
  const cur = await getLockPrefs();
  const next = { ...cur, ...patch };
  await write(JSON.stringify({ ...next, userId: uid }));
  emitLockPrefsChange(next);
}
/** Logout / account switch: drop every unlock permission. */
export async function clearLockPrefs() {
  try { await (SecureStore?.deleteItemAsync ? SecureStore.deleteItemAsync(KEY) : AsyncStorage.removeItem(KEY)); } catch (_) {}
  emitLockPrefsChange({ lock: false, biometric: false });
}

// Back-compat for AppLockGate's strict check.
export async function isAppLockEnabledStrict() {
  return (await getLockPrefsStrict()).lock;
}

/** Phone has any lock (biometric or passcode / pattern / PIN). */
export async function isDeviceSecure() {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return !!level && level !== LocalAuthentication.SecurityLevel.NONE;
  } catch { return false; }
}

/** null when usable, else why biometrics can't be used here (shown to the employee). */
export async function biometricUnavailableReason() {
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return 'This phone has no fingerprint / face sensor.';
    if (!(await LocalAuthentication.isEnrolledAsync())) return 'No fingerprint / face saved. Add one in phone Settings → Security, then come back.';
    return null;
  } catch {
    return 'Biometrics are not available in this app build.';
  }
}

/** Fingerprint / face enrolled on this phone. */
export async function hasBiometrics() {
  try {
    return !!((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()));
  } catch { return false; }
}

/** Biometric only (PIN fallback is ours, not the phone's passcode). */
export async function authenticateBiometric(promptMessage = 'Unlock NearGFix') {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage, cancelLabel: 'Use PIN', disableDeviceFallback: true,
    });
    return !!res?.success;
  } catch {
    return false;
  }
}

// Old name: device-credential prompt (kept for callers without an employee PIN).
export async function authenticate() {
  try {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock NearGFix', cancelLabel: 'Cancel', disableDeviceFallback: false });
    return !!res?.success;
  } catch {
    return false;
  }
}

// AppLockGate follows a change made in Security settings without a restart.
const listeners = new Set();
export const onLockPrefsChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const emitLockPrefsChange = (p) => listeners.forEach((fn) => { try { fn(p); } catch (_) {} });
