import { useEffect } from 'react';

// Block OS screenshots / screen-recording while a screen that renders highly
// sensitive data is mounted — KYC Aadhaar/PAN images and the customer's device
// unlock PIN/pattern. On Android this sets FLAG_SECURE (also hides the screen
// from the app-switcher thumbnail); on iOS it blanks screen-recordings.
//
// expo-screen-capture is a native module, loaded lazily so the JS keeps working
// (as a no-op) in Expo Go / web / a build made before the dependency was added.
// It activates automatically once a native build includes it.
let ScreenCapture = null;
try {
  // eslint-disable-next-line global-require
  ScreenCapture = require('expo-screen-capture');
} catch (_) {
  ScreenCapture = null;
}

let tagSeq = 0;

export function useSecureScreen() {
  useEffect(() => {
    if (!ScreenCapture || typeof ScreenCapture.preventScreenCaptureAsync !== 'function') {
      return undefined;
    }
    // Tag each mount so releasing one secure screen doesn't re-enable capture
    // while another secure screen is still open.
    const tag = `secure-${tagSeq++}`;
    ScreenCapture.preventScreenCaptureAsync(tag).catch(() => {});
    return () => {
      try { ScreenCapture.allowScreenCaptureAsync?.(tag); } catch (_) {}
    };
  }, []);
}
