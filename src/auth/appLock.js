// App Lock — gate the app behind the device's own biometric / pattern / PIN
// (PhonePe / Google Pay style). Opt-in: disabled by default; the user can turn
// it on in Settings when their device has a secure lock. Uses the OS credential,
// so we never store a PIN ourselves.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const KEY = 'appLock.enabled';

// True when the phone can authenticate the user — biometric enrolled OR a
// device passcode/pattern/PIN is set (getEnrolledLevelAsync > NONE).
export async function isDeviceSecure() {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level && level !== LocalAuthentication.SecurityLevel.NONE) return true;
    const hw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return !!(hw && enrolled);
  } catch {
    return false;
  }
}

// Disabled by default until the user explicitly turns it on in Settings.
export async function isAppLockEnabled() {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === null) return false;
    return v === '1';
  } catch {
    return false;
  }
}

export async function setAppLockEnabled(on) {
  try { await AsyncStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {}
}

// Trigger the OS unlock prompt. disableDeviceFallback:false lets the user use
// their pattern / PIN / password when biometric fails or isn't set up.
export async function authenticate() {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock GGFIX',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return !!res?.success;
  } catch {
    return false;
  }
}
