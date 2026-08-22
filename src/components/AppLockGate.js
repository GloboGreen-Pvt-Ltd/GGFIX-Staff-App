import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { isAppLockEnabled, authenticate, isDeviceSecure } from '../auth/appLock';
import { rf, rlh } from '../utils/responsive';

// Wraps the authenticated app. When App Lock is on, requires the OS unlock
// (fingerprint / pattern / PIN) on cold start and every time the app returns
// to the foreground. Fails OPEN if lock is disabled / the device isn't secure.
export default function AppLockGate({ children, onLogout }) {
  const [enabled, setEnabled] = useState(null); // null = still checking
  const [locked, setLocked] = useState(true);
  const [checking, setChecking] = useState(false);
  // When the app is not "active" (multitasking switcher / partially backgrounded)
  // an opaque cover hides the current screen so customer PII / ticket data isn't
  // captured into the OS recents thumbnail. Works regardless of App Lock.
  const [obscured, setObscured] = useState(false);
  const appState = useRef(AppState.currentState);
  const runningRef = useRef(false);

  const runUnlock = useCallback(async () => {
    // In-flight guard: the biometric prompt itself can flip AppState
    // (inactive → active), which would otherwise re-enter runUnlock and stack a
    // second OS prompt over the first.
    if (runningRef.current) return;
    runningRef.current = true;
    setChecking(true);
    try {
      const ok = await authenticate();
      if (ok) setLocked(false);
    } finally {
      setChecking(false);
      runningRef.current = false;
    }
  }, []);

  // Initial: unlock immediately if lock is off OR the device is no longer
  // secure. Fail OPEN when the user removed their biometric/PIN after enabling
  // App Lock — otherwise authenticate() can never succeed and the user would be
  // permanently trapped on the lock screen with only "Log out" available.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const on = await isAppLockEnabled();
      if (cancelled) return;
      if (!on || !(await isDeviceSecure())) {
        if (!cancelled) { setEnabled(false); setLocked(false); }
        return;
      }
      setEnabled(true);
      setLocked(true);
      runUnlock();
    })();
    return () => { cancelled = true; };
  }, [runUnlock]);

  // Re-lock when the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      // Cover the UI the instant we leave "active" (fires before the OS snapshot).
      setObscured(next !== 'active');
      if (enabled && /inactive|background/.test(prev) && next === 'active') {
        setLocked(true);
        runUnlock();
      }
    });
    return () => sub.remove();
  }, [enabled, runUnlock]);

  if (enabled === null) return null;         // brief boot check
  if (!enabled || !locked) {
    // Unlocked → show the app, with a privacy cover when backgrounded.
    return (
      <View style={{ flex: 1 }}>
        {children}
        {obscured ? <PrivacyCover /> : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#004C40', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Image
        source={require('../../assets/logo.png')}
        style={{ width: 88, height: 88, borderRadius: 20, marginBottom: 18 }}
        resizeMode="contain"
      />
      <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Lock size={20} color="#FFFFFF" />
      </View>
      <Text style={{ color: '#FFFFFF', fontSize: rf(18), fontWeight: '800' }}>App Locked</Text>
      <Text style={{ color: '#D1FAE5', fontSize: rf(13), marginTop: 6, textAlign: 'center', lineHeight: rlh(18) }}>
        Unlock with your fingerprint, pattern or PIN to continue.
      </Text>
      <Pressable
        onPress={runUnlock}
        disabled={checking}
        style={{ marginTop: 22, backgroundColor: '#004C40', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 14, opacity: checking ? 0.6 : 1, minWidth: 150, alignItems: 'center' }}
      >
        {checking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: rf(15) }}>Unlock</Text>}
      </Pressable>
      <Pressable onPress={onLogout} style={{ marginTop: 16 }}>
        <Text style={{ color: '#A7F3D0', fontSize: rf(13), fontWeight: '700' }}>Log out instead</Text>
      </Pressable>
    </View>
  );
}

// Opaque branded overlay shown while the app is backgrounded, so sensitive
// screens don't leak into the OS app-switcher thumbnail.
function PrivacyCover() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#004C40', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Image
        source={require('../../assets/logo.png')}
        style={{ width: 96, height: 96, borderRadius: 22 }}
        resizeMode="contain"
      />
    </View>
  );
}
