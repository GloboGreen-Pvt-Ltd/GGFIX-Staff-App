// Employee session gate (MPIN login, no OTP):
// - fresh MPIN login → optional biometric opt-in → app,
// - app open / back from background ≥ 2 min → MPIN (server-verified) or biometrics,
// - server session validated in the background: expired / revoked / replaced → login again,
// - mounts the TPIN sheet for check-in / check-out and protected actions.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PinPad, { C } from './SecurityPinPad';
import TpinSheet from './TpinSheet';
import { getSession } from '../auth/session';
import { authenticateBiometric, getLockPrefs, hasBiometrics, setLockPrefs } from '../auth/appLock';
import { consumeFreshLogin, sessionStatus, verifyMpin, pinErrorMessage } from './securityApi';

const LOCK_S = 120; // Employee: 2 minutes in background

const Btn = ({ title, onPress, busy, ghost }) => (
  <Pressable onPress={onPress} disabled={busy} style={{ alignSelf: 'stretch', height: 46, borderRadius: 14, marginTop: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: ghost ? C.bg : C.primary, borderWidth: ghost ? 1 : 0, borderColor: C.border, opacity: busy ? 0.6 : 1 }}>
    {busy ? <ActivityIndicator color={ghost ? C.primary : '#FFFFFF'} /> : <Text style={{ color: ghost ? C.text : '#FFFFFF', fontWeight: '800', fontSize: 14 }}>{title}</Text>}
  </Pressable>
);

export default function DeviceSessionGate({ children, onLogout }) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState('boot'); // boot|locked|bio|expired|open
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [bioOn, setBioOn] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const bgAt = useRef(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const loadStatus = useCallback(async () => {
    try {
      const st = await sessionStatus();
      setStatus(st);
    } catch (e) {
      if (e?.status === 401 || e?.status === 404) {
        setReplaced(/SESSION_REPLACED/.test(String(e?.serverMessage || e?.message || '')));
        setStage('expired');
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const s = await getSession();
      setSession(s);
      const prefs = await getLockPrefs();
      setBioOn(!!prefs.biometric);
      // No device-bound session (old OTP login) → log in again with the MPIN.
      if (!s?.deviceSessionId) { setStage('expired'); return; }
      if (consumeFreshLogin()) {
        setStage(!prefs.biometric && (await hasBiometrics()) ? 'bio' : 'open');
      } else {
        setStage('locked');
      }
      loadStatus();
    })();
  }, [loadStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (/inactive|background/.test(next)) { if (!bgAt.current) bgAt.current = Date.now(); return; }
      if (next === 'active' && bgAt.current) {
        const away = (Date.now() - bgAt.current) / 1000;
        bgAt.current = null;
        if (stageRef.current === 'open' && away >= LOCK_S) setStage('locked');
        if (stageRef.current === 'open') loadStatus();
      }
    });
    return () => sub.remove();
  }, [loadStatus]);

  const tryBiometric = useCallback(async () => {
    if (!bioOn) return;
    if (await authenticateBiometric('Unlock NearGFix Staff')) { setError(null); setStage('open'); }
  }, [bioOn]);
  useEffect(() => { if (stage === 'locked') tryBiometric(); }, [stage, tryBiometric]);

  const unlock = async (pin) => {
    setBusy(true); setError(null);
    try { await verifyMpin(pin); setStage('open'); }
    catch (e) {
      if (e?.status === 401 && /SESSION/.test(String(e?.serverMessage || e?.message || ''))) {
        setReplaced(/SESSION_REPLACED/.test(String(e?.serverMessage || e?.message || '')));
        setStage('expired');
        return;
      }
      setError(pinErrorMessage(e));
    } finally { setBusy(false); }
  };

  const enableBio = async () => {
    setBusy(true);
    try {
      if (await authenticateBiometric('Confirm fingerprint / face')) { await setLockPrefs({ biometric: true }); setBioOn(true); }
    } finally { setBusy(false); setStage('open'); }
  };

  let overlay = null;
  if (stage === 'boot') {
    overlay = <ActivityIndicator color={C.primary} />;
  } else if (stage === 'expired') {
    overlay = (
      <>
        <Ionicons name="time-outline" size={36} color={C.primary} />
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, marginTop: 10 }}>Session Expired</Text>
        <Text style={{ fontSize: 13, color: C.muted, marginTop: 6, textAlign: 'center' }}>
          {replaced ? 'You were logged in on another device.' : 'For your security, please log in again with your mobile number and Login MPIN.'}
        </Text>
        <Btn title="Log in again" onPress={onLogout} />
      </>
    );
  } else if (stage === 'bio') {
    overlay = (
      <>
        <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="finger-print" size={28} color={C.primary} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, marginTop: 12 }}>Enable Biometric Unlock?</Text>
        <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 6, textAlign: 'center' }}>Unlock with fingerprint or face. Your Login MPIN always works as a fallback.</Text>
        <Btn title="Enable Biometrics" onPress={enableBio} busy={busy} />
        <Btn title="Not Now" ghost onPress={() => setStage('open')} />
      </>
    );
  } else if (stage === 'locked') {
    overlay = (
      <PinPad
        title="Enter Login MPIN"
        subtitle="Unlock NearGFix Staff"
        error={error}
        busy={busy}
        onComplete={unlock}
        onBiometric={bioOn ? tryBiometric : undefined}
        footer={(
          <Pressable onPress={onLogout} style={{ marginTop: 10 }}><Text style={{ color: C.error, fontWeight: '700', fontSize: 13 }}>Log out</Text></Pressable>
        )}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {stage === 'boot' || stage === 'expired' ? null : children}
      {stage === 'open' || stage === 'locked' || stage === 'bio'
        ? <TpinSheet session={session} tpinSet={!!status?.tpinSet} onTpinCreated={() => loadStatus()} />
        : null}
      {overlay ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999, backgroundColor: C.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' }}>
          {overlay}
        </View>
      ) : null}
    </View>
  );
}
