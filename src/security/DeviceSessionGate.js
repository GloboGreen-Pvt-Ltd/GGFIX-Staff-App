// Single-device session gate for the Employee app (inside the existing PIN /
// biometric AppLockGate, which remains the MPIN unlock). Starts the device
// session after OTP login, shows Device Limit / OTP Session Expired, and
// mounts the TPIN sheet. Falls through when the server lacks /auth/security.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from './SecurityPinPad';
import TpinSheet from './TpinSheet';
import DeviceLimitScreen from './DeviceLimitScreen';
import { getSession } from '../auth/session';
import { startDeviceSession, sessionStatus, pinErrorMessage } from './securityApi';

const Btn = ({ title, onPress, busy, ghost }) => (
  <Pressable onPress={onPress} disabled={busy} style={{ alignSelf: 'stretch', height: 46, borderRadius: 14, marginTop: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: ghost ? C.bg : C.primary, borderWidth: ghost ? 1 : 0, borderColor: C.border, opacity: busy ? 0.6 : 1 }}>
    {busy ? <ActivityIndicator color={ghost ? C.primary : '#FFFFFF'} /> : <Text style={{ color: ghost ? C.text : '#FFFFFF', fontWeight: '800', fontSize: 14 }}>{title}</Text>}
  </Pressable>
);

export default function DeviceSessionGate({ children, onLogout }) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState('boot'); // boot|legacy|otp|device|open
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(null);
  const [device, setDevice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadStatus = useCallback(async () => { const st = await sessionStatus(); setStatus(st); return st; }, []);

  const fail = (e) => {
    if (e?.status === 404 || e?.status === 405) setStage('legacy');
    else if (e?.status === 409 && e?.payload?.status === 'DEVICE_LIMIT') { setDevice(e.payload); setStage('device'); }
    else if (e?.status === 401) setStage('otp');
    else setError(pinErrorMessage(e));
  };

  const start = useCallback(async (replaceExisting) => {
    setBusy(true); setError(null);
    try {
      await startDeviceSession({ replaceExisting });
      setSession(await getSession());
      await loadStatus();
      setStage('open');
    } catch (e) { fail(e); } finally { setBusy(false); }
  }, [loadStatus]);

  useEffect(() => {
    (async () => {
      const s = await getSession();
      setSession(s);
      if (!s?.deviceSessionId) { start(false); return; }
      try { await loadStatus(); setStage('open'); }
      // Never downgrade an established device session to legacy on 404: re-verify OTP.
      catch (e) { if (e?.status === 404 || e?.status === 405 || e?.status === 401) setStage('otp'); else setStage('open'); }
    })();
  }, [start, loadStatus]);

  if (stage === 'legacy') return children;
  if (stage === 'device') return <DeviceLimitScreen device={device} busy={busy} error={error} onConfirm={() => start(true)} onCancel={onLogout} />;
  if (stage === 'open') {
    return (
      <View style={{ flex: 1 }}>
        {children}
        <TpinSheet session={session} tpinSet={!!status?.tpinSet} onTpinCreated={() => loadStatus().catch(() => {})} refreshStatus={loadStatus} />
      </View>
    );
  }

  let body = <ActivityIndicator color={C.primary} />;
  if (stage === 'boot' && error) {
    body = <><Text style={{ color: C.error, textAlign: 'center' }}>{error}</Text><Btn title="Retry" onPress={() => start(false)} busy={busy} /><Btn title="Log out" ghost onPress={onLogout} /></>;
  } else if (stage === 'otp') {
    body = (
      <>
        <Ionicons name="time-outline" size={36} color={C.primary} />
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, marginTop: 10 }}>Session Expired</Text>
        <Text style={{ fontSize: 13, color: C.muted, marginTop: 6, textAlign: 'center' }}>For your security, please log in again with your mobile number and MPIN.</Text>
        <Btn title="Log in again" onPress={onLogout} />
      </>
    );
  } else if (stage === 'device') {
    body = (
      <>
        <Ionicons name="phone-portrait-outline" size={36} color={C.primary} />
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, marginTop: 10 }}>Device Limit Reached</Text>
        <Text style={{ fontSize: 13, color: C.muted, marginTop: 6, textAlign: 'center' }}>Your account is active on another device. Only one device can be logged in.</Text>
        <View style={{ alignSelf: 'stretch', borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12, marginTop: 14 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{device?.deviceName || 'Unknown device'}</Text>
          <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Last active: {device?.lastActiveAt ? new Date(device.lastActiveAt).toLocaleString() : '—'}</Text>
        </View>
        {error ? <Text style={{ color: C.error, marginTop: 8 }}>{error}</Text> : null}
        <Btn title="Log Out Old Device & Continue" onPress={() => start(true)} busy={busy} />
        <Btn title="Cancel" ghost onPress={onLogout} />
      </>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' }}>
      {body}
    </View>
  );
}
