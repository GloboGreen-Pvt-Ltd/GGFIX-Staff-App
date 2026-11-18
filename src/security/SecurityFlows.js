// Create / Reset MPIN & TPIN flows (shared by the gate, TPIN sheet and settings).
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import PinPad, { C } from './SecurityPinPad';
import { createPin, resetPin, sendResetOtp, otpProofToken, pinErrorMessage } from './securityApi';
import { authenticate, isAppLockEnabledStrict as isAppLockEnabled, isDeviceSecure } from '../auth/appLock';

const label = (t) => (t === 'TPIN' ? 'Transaction PIN' : 'MPIN');

/** Enter → confirm → save. mode 'create' calls createPin; mode 'reset' calls onSubmit(pin). */
export function NewPinFlow({ type, onDone, onSubmit, subtitle }) {
  const [first, setFirst] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);

  const complete = async (pin) => {
    setError(null);
    if (!first) { setFirst(pin); setKey((k) => k + 1); return; }
    if (pin !== first) { setFirst(null); setError('PINs did not match. Try again.'); return; }
    setBusy(true);
    try {
      if (onSubmit) await onSubmit(pin); else await createPin(type, pin);
      onDone?.();
    } catch (e) {
      setFirst(null);
      setError(pinErrorMessage(e));
    } finally { setBusy(false); }
  };

  return (
    <PinPad
      resetKey={key}
      title={first ? `Confirm ${label(type)}` : `Create 6-digit ${label(type)}`}
      subtitle={first ? 'Re-enter the same PIN' : (subtitle || 'Avoid repeated or sequential digits')}
      error={error}
      busy={busy}
      onComplete={complete}
    />
  );
}

/** Reset: OTP verification → native biometric (if enabled) → new PIN → confirm. */
export function ResetPinFlow({ type, session, onDone, onCancel }) {
  const shopLogin = false;
  const [identifier, setIdentifier] = useState(shopLogin ? (session?.mobile || '') : (session?.email || session?.mobile || ''));
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('otp');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const proof = useRef({ token: null, method: 'OTP' });

  const send = async () => {
    setBusy(true); setError(null);
    try { await sendResetOtp({ identifier: identifier.trim(), shopLogin }); setSent(true); }
    catch (e) { setError(pinErrorMessage(e)); } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true); setError(null);
    try {
      const token = await otpProofToken({ identifier: identifier.trim(), otp: otp.trim(), shopLogin });
      if (!token) throw new Error('OTP verification failed');
      proof.current.token = token;
      if ((await isAppLockEnabled()) && (await isDeviceSecure())) {
        if (!(await authenticate())) throw new Error('Biometric verification failed');
        proof.current.method = 'OTP_BIOMETRIC';
      }
      setStep('pin');
    } catch (e) { setError(pinErrorMessage(e)); } finally { setBusy(false); }
  };

  if (step === 'pin') {
    return (
      <NewPinFlow
        type={type}
        subtitle="OTP verified. Set your new PIN."
        onSubmit={(pin) => resetPin(type, { otpToken: proof.current.token, newPin: pin, verificationMethod: proof.current.method })}
        onDone={onDone}
      />
    );
  }

  const input = { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, height: 44, color: C.text, fontSize: 14, marginTop: 10 };
  return (
    <View style={{ width: '100%' }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, textAlign: 'center' }}>Reset {label(type)}</Text>
      <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 4, textAlign: 'center' }}>Verify with OTP sent to your registered {shopLogin ? 'shop mobile' : 'mobile / email'}.</Text>
      <TextInput value={identifier} onChangeText={setIdentifier} editable={!sent} placeholder="Mobile or email" autoCapitalize="none" style={input} />
      {sent ? (
        <TextInput value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit OTP" keyboardType="number-pad" style={input} />
      ) : null}
      {error ? <Text style={{ color: C.error, fontSize: 12, marginTop: 8 }}>{error}</Text> : null}
      <Pressable
        onPress={sent ? verify : send}
        disabled={busy || !identifier.trim() || (sent && otp.length !== 6)}
        style={{ marginTop: 14, height: 44, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{sent ? 'Verify OTP' : 'Send OTP'}</Text>}
      </Pressable>
      {onCancel ? (
        <Pressable onPress={onCancel} style={{ marginTop: 10, alignItems: 'center' }}>
          <Text style={{ color: C.muted, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
