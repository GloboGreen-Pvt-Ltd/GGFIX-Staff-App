import { Alert, Platform, ToastAndroid } from 'react-native';

// `burnt` is a THIRD-PARTY native module (custom toasts). It runs
// `requireNativeModule('Burnt')` at import time, which THROWS
// ("Cannot find native module 'Burnt'") on any client that wasn't built with
// it — Expo Go, or a dev client made before burnt was added — crashing the app
// on launch. Load it defensively so the app runs everywhere; when Burnt is
// absent, notify() falls back to a native Android toast / iOS alert so the user
// still sees the message. A proper EAS build bundles Burnt and uses it natively.
let Burnt = null;
try {
  // eslint-disable-next-line global-require
  Burnt = require('burnt');
} catch (e) {
  Burnt = null;
}

/**
 * Cross-platform confirm dialog. Works on iOS, Android AND web (Expo Web).
 *
 * Usage:
 *   confirm({ title: 'Delete', message: 'Are you sure?', confirmText: 'Yes', destructive: true })
 *     .then((ok) => { if (ok) doDelete(); });
 */
export function confirm({ title = 'Confirm', message = '', confirmText = 'OK', cancelText = 'Cancel', destructive = false } = {}) {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return resolve(false);
      const composed = message ? `${title}\n\n${message}` : title;
      resolve(window.confirm(composed));
      return;
    }
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

/**
 * Cross-platform notification. Renders as a native iOS/Android toast on device
 * via Burnt, falls back to window.alert on web (Burnt has no web target).
 *
 * Signature stays (title, message) for backward compatibility with all existing
 * call sites. Optional third arg lets callers opt into richer styling:
 *   notify('Saved', 'Booking created', { preset: 'done' })
 *   notify('Network error', '', { preset: 'error', haptic: 'error' })
 *
 *   preset:   'done' | 'error' | 'none'   (default: 'none')
 *   duration: seconds (default 2)
 *   haptic:   'success' | 'warning' | 'error' | 'none'
 *   from:     'top' | 'bottom'            (default: 'bottom')
 */
export function notify(title, message = '', options = {}) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    const composed = message ? `${title}\n\n${message}` : title;
    window.alert(composed);
    return;
  }
  const {
    preset = 'none',
    duration = 2,
    haptic = 'none',
    from = 'bottom',
  } = options;
  if (Burnt && typeof Burnt.toast === 'function') {
    Burnt.toast({
      title: String(title || ''),
      message: message ? String(message) : undefined,
      preset,
      duration,
      haptic,
      from,
    });
    return;
  }
  // Fallback when the Burnt native module isn't in this build (e.g. Expo Go).
  const t = String(title || '');
  const m = message ? String(message) : '';
  if (Platform.OS === 'android') {
    ToastAndroid.show(m ? `${t}: ${m}` : t, ToastAndroid.SHORT);
  } else {
    Alert.alert(t, m || undefined);
  }
}
