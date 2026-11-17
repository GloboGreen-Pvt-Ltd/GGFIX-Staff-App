import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { Delete, Fingerprint, Lock } from 'lucide-react-native';
import { Text } from './Typography';
import { rf } from '../utils/responsive';
import { verifyPin } from '../api/pin';
import { authenticateBiometric, getLockPrefs } from '../auth/appLock';
import { userMessage } from '../utils/userMessages';

const TEAL = '#035C6C';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'];

/**
 * 6-digit PIN pad. mode 'verify' checks the employee's own PIN on the server
 * (lockout handled there) and calls onDone(true). mode 'entry' just returns
 * the digits (create / confirm / change). Never stores the PIN.
 */
export function PinPadBody({ title, subtitle, mode = 'verify', onDone, onCancel, cancelLabel = 'Cancel', biometric = false, footer }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const tryBio = async () => { if (await authenticateBiometric(title)) onDone(true); };
  useEffect(() => { if (biometric) tryBio(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pin.length !== 6) return;
    if (mode === 'entry') { const p = pin; setPin(''); onDone(p); return; }
    let alive = true;
    setBusy(true);
    verifyPin(pin)
      .then(() => { if (alive) onDone(true); })
      .catch((e) => { if (alive) { setError(userMessage(e, 'Could not check the PIN.')); setPin(''); } })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = (k) => {
    if (busy) return;
    setError(null);
    if (k === 'del') setPin((p) => p.slice(0, -1));
    else if (k === 'bio') { if (biometric) tryBio(); }
    else setPin((p) => (p.length < 6 ? p + k : p));
  };

  return (
    <View style={{ alignItems: 'center', padding: 20 }}>
      <View style={{ height: 48, width: 48, borderRadius: 24, backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' }}>
        <Lock size={22} color={TEAL} />
      </View>
      <Text style={{ fontSize: rf(17), fontWeight: '800', color: '#111111', marginTop: 10, textAlign: 'center' }}>{title}</Text>
      {subtitle ? <Text style={{ fontSize: rf(12.5), color: '#6B7280', marginTop: 4, textAlign: 'center' }}>{subtitle}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ height: 14, width: 14, borderRadius: 7, borderWidth: 1.5, borderColor: error ? '#F32C26' : TEAL, backgroundColor: i < pin.length ? TEAL : 'transparent' }} />
        ))}
      </View>
      <View style={{ height: 22, justifyContent: 'center', marginTop: 6 }}>
        {busy ? <ActivityIndicator size="small" color={TEAL} />
          : error ? <Text style={{ fontSize: rf(12), color: '#F32C26', fontWeight: '700', textAlign: 'center' }}>{error}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 252, justifyContent: 'center' }}>
        {KEYS.map((k) => (
          <Pressable key={k} onPress={() => press(k)} accessibilityLabel={k === 'del' ? 'Delete' : k === 'bio' ? 'Use biometrics' : k}
            style={({ pressed }) => ({ width: 72, height: 54, margin: 6, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: k === 'bio' || k === 'del' ? 'transparent' : pressed ? '#D6ECEF' : '#F3F4F6', opacity: k === 'bio' && !biometric ? 0 : 1 })}>
            {k === 'del' ? <Delete size={22} color="#111111" />
              : k === 'bio' ? <Fingerprint size={24} color={TEAL} />
                : <Text style={{ fontSize: rf(20), fontWeight: '700', color: '#111111' }}>{k}</Text>}
          </Pressable>
        ))}
      </View>
      {footer}
      {onCancel ? (
        <Pressable onPress={onCancel} style={{ marginTop: 10, padding: 8 }}>
          <Text style={{ fontSize: rf(13), fontWeight: '700', color: '#6B7280' }}>{cancelLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---- Fresh authentication for sensitive actions ------------------------------
let show = null;
/** Mounted once (AppLockGate). requireFreshAuth() opens it. */
export function PinPromptHost() {
  const [req, setReq] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    show = (r) => new Promise((resolve) => { ref.current = resolve; setReq(r); });
    return () => { show = null; };
  }, []);
  const done = (ok) => { ref.current?.(ok); ref.current = null; setReq(null); };
  return (
    <Modal visible={!!req} transparent animationType="fade" onRequestClose={() => done(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 12 }}>
          {req ? <PinPadBody title={req.title} subtitle="Enter your 6-digit employee PIN" biometric={req.biometric} onDone={() => done(true)} onCancel={() => done(false)} /> : null}
        </View>
      </View>
    </Modal>
  );
}
export const openPinPrompt = (r) => (show ? show(r) : Promise.resolve(false));

export { getLockPrefs };
