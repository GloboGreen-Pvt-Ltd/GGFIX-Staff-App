import React, { useCallback, useEffect, useRef, useState } from 'react';
import BootSplash from './BootSplash';
import { ActivityIndicator, AppState, Image, Platform, Pressable, View } from 'react-native';
import { Text } from './Typography';
import { Lock } from 'lucide-react-native';
import { isAppLockEnabledStrict, authenticate, getLockPrefs, hasBiometrics, onLockPrefsChange } from '../auth/appLock';
import { getPinStatus } from '../api/pin';
import { PinPadBody, PinPromptHost } from './PinPad';

// A lock check that hangs counts as a failed check (locked + Retry), never as "off".
const LOCK_CHECK_TIMEOUT_MS = 8000;
const BACKGROUND_LOCK_MS = 2 * 60 * 1000; // employee app: lock after 2 min in background
const withTimeout = (p) => Promise.race([
  p, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), LOCK_CHECK_TIMEOUT_MS)),
]);
import { rf, rlh } from '../utils/responsive';

// Recents-thumbnail cover: iOS only. iOS turns 'inactive' as the app switcher
// opens, so the cover is up before its card is drawn. Android reports
// 'background' for the app's OWN camera / gallery / permission / dialer /
// maps intents too, so the cover flashed a full green screen on every photo
// or permission prompt, and it landed too late for the thumbnail anyway.
// Android thumbnails of sensitive screens are blanked natively by FLAG_SECURE
// (utils/secureScreen).
const USE_PRIVACY_COVER = Platform.OS === 'ios';

// Wraps the authenticated app. When App Lock is on, requires the OS unlock
// (fingerprint / pattern / PIN) on cold start and every time the app returns
// to the foreground. Fails OPEN if lock is disabled / the device isn't secure.
export default function AppLockGate({ children, onLogout }) {
  const [enabled, setEnabled] = useState(null); // null = still checking
  const [locked, setLocked] = useState(true);
  const [checking, setChecking] = useState(false);
  // The lock setting / device check itself failed: stay locked, offer Retry.
  const [checkFailed, setCheckFailed] = useState(false);
  // When the app is not "active" (multitasking switcher / partially backgrounded)
  // an opaque cover hides the current screen so customer PII / ticket data isn't
  // captured into the OS recents thumbnail. Works regardless of App Lock.
  const [obscured, setObscured] = useState(false);
  const [pinMode, setPinMode] = useState(null); // { bio } while the PIN pad is shown
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
      // Employee PIN set → own PIN pad (biometric first if enabled); else the phone lock.
      let st = null;
      // Server unreachable: stay locked with Retry — never fall back to the phone lock.
      try { st = await withTimeout(getPinStatus()); } catch (_) { setCheckFailed(true); return; }
      if (st?.pinSet) { const p = await getLockPrefs(); setPinMode({ bio: p.biometric && (await hasBiometrics()) }); return; }
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
  // Errors never unlock: a failed or timed-out read of the setting keeps the
  // app locked with Retry (it also bounds the blank boot check). Only a
  // successful "lock off" read, or a device confirmed to have no
  // biometric/PIN at all (the documented fail-open), opens without unlock.
  const cancelledRef = useRef(false);
  const runCheck = useCallback(async () => {
    setChecking(true); // Retry shows a spinner while the setting is re-read
    let on;
    try {
      on = await withTimeout(isAppLockEnabledStrict());
    } catch (_) {
      if (cancelledRef.current) return;
      setChecking(false);
      setEnabled(true); setLocked(true); setCheckFailed(true);
      return;
    }
    if (cancelledRef.current) return;
    setChecking(false);
    setCheckFailed(false);
    if (!on) { setEnabled(false); setLocked(false); return; }
    setEnabled(true);
    setLocked(true);
    runUnlock();
  }, [runUnlock]);

  useEffect(() => {
    cancelledRef.current = false;
    runCheck();
    return () => { cancelledRef.current = true; };
  }, [runCheck]);

  // Security settings changed (or logout cleared them): follow without locking now.
  useEffect(() => onLockPrefsChange((p) => { setEnabled(!!p.lock); setCheckFailed(false); setLocked(false); }), []);

  // Re-lock when the app returns to the foreground after >= 2 minutes in background.
  const bgSinceRef = useRef(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      // Cover the UI the instant we leave "active" (fires before the OS snapshot).
      setObscured(USE_PRIVACY_COVER && next !== 'active');
      if (next === 'background' && bgSinceRef.current == null) bgSinceRef.current = Date.now();
      if (next !== 'active') return;
      const away = bgSinceRef.current == null ? 0 : Date.now() - bgSinceRef.current;
      bgSinceRef.current = null;
      if (enabled && /inactive|background/.test(prev) && (away >= BACKGROUND_LOCK_MS || checkFailed)) {
        setLocked(true);
        if (checkFailed) runCheck(); else runUnlock();
      }
    });
    return () => sub.remove();
  }, [enabled, checkFailed, runUnlock, runCheck]);

  if (enabled === null) return <BootSplash />; // brief boot check (no blank flash)
  if (!enabled || !locked) {
    // Unlocked → show the app, with a privacy cover when backgrounded.
    return (
      <View style={{ flex: 1 }}>
        {children}
        <PinPromptHost />
        {obscured ? <PrivacyCover /> : null}
      </View>
    );
  }

  // Locked: keep the app mounted underneath so device-session / geofence
  // checks finish while the MPIN is entered — no loading page after unlock.
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} pointerEvents="none" importantForAccessibility="no-hide-descendants">{children}</View>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>{renderLock()}</View>
    </View>
  );

  function renderLock() {
  if (pinMode && !checkFailed) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center' }}>
        <PinPadBody
          title="App Locked"
          subtitle="Enter your 6-digit MPIN"
          biometric={pinMode.bio}
          onDone={() => { setPinMode(null); setLocked(false); }}
          onCancel={onLogout}
          cancelLabel="Log out instead"
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#609138', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Image
        source={require('../../assets/logo.png')}
        style={{ width: 88, height: 88, borderRadius: 20, marginBottom: 18 }}
        resizeMode="contain"
      />
      <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Lock size={20} color="#FFFFFF" />
      </View>
      <Text style={{ color: '#FFFFFF', fontSize: rf(18), fontWeight: '800' }}>App Locked</Text>
      <Text style={{ color: '#E5F3F5', fontSize: rf(13), marginTop: 6, textAlign: 'center', lineHeight: rlh(18) }}>
        {checkFailed
          ? 'Could not check App Lock on this device. Tap Retry to continue.'
          : 'Unlock with your fingerprint, pattern or PIN to continue.'}
      </Text>
      <Pressable
        onPress={checkFailed ? runCheck : runUnlock}
        disabled={checking}
        style={{ marginTop: 22, backgroundColor: '#609138', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 14, opacity: checking ? 0.6 : 1, minWidth: 150, alignItems: 'center' }}
      >
        {checking ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: rf(15) }}>{checkFailed ? 'Retry' : 'Unlock'}</Text>}
      </Pressable>
      <Pressable onPress={onLogout} style={{ marginTop: 16 }}>
        <Text style={{ color: '#E5F3F5', fontSize: rf(13), fontWeight: '700' }}>Log out instead</Text>
      </Pressable>
    </View>
  );
  }
}

// Opaque overlay shown while the app is backgrounded (iOS), so sensitive
// screens don't leak into the OS app-switcher thumbnail. Same look as the
// native splash (page grey + logo, app.config splash), not a green screen.
function PrivacyCover() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
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
