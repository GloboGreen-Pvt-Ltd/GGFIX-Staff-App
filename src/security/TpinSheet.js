// One-time TPIN bottom sheet. Registered with the API client while a secure
// session is open: protected requests pause here, get a single-use
// authorization, then continue. One sheet at a time (no duplicate modals).
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PinPad, { C } from './SecurityPinPad';
import { NewPinFlow, ResetPinFlow } from './SecurityFlows';
import { authorizeTpin, pinErrorMessage } from './securityApi';
import { setTpinHandler } from './tpinBridge';

const ACTION_LABEL = {
  CHECK_IN: 'Confirm Check-in', CHECK_OUT: 'Confirm Check-out',
  REPAIR_BOOKING: 'Confirm repair booking', TICKET_STATUS: 'Update repair status', PICKUP_DELIVERY: 'Confirm pickup / delivery',
  PAYMENT: 'Confirm payment', SELL_CONFIRM: 'Confirm sell transaction', BUY_ORDER: 'Confirm buy order',
};

export default function TpinSheet({ session, tpinSet, onTpinCreated, refreshStatus }) {
  const insets = useSafeAreaInsets();
  const [req, setReq] = useState(null); // { action, method, path }
  const [mode, setMode] = useState('verify');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(null);
  const pending = useRef(null);
  const hasTpin = useRef(tpinSet);
  hasTpin.current = tpinSet;
  const refreshRef = useRef(refreshStatus);
  refreshRef.current = refreshStatus;

  // Backend is the source of truth: re-check TPIN status before every protected
  // action. A failed status call must never be read as "no TPIN" (that opened
  // Create TPIN for employees who already had one) — show Retry instead.
  const resolveMode = async () => {
    if (!refreshRef.current) { setMode(hasTpin.current ? 'verify' : 'create'); return; }
    setMode('loading'); setError(null);
    try {
      const st = await refreshRef.current();
      if (typeof st?.tpinSet !== 'boolean') throw new Error('TPIN status unavailable');
      setMode(st.tpinSet ? 'verify' : 'create');
    } catch (e) {
      setError(pinErrorMessage(e) || 'Could not check your Transaction PIN. Please retry.');
      setMode('status-error');
    }
  };

  useEffect(() => {
    setTpinHandler((r) => new Promise((resolve, reject) => {
      if (pending.current) { reject(new Error('Another TPIN verification is in progress')); return; }
      pending.current = { resolve, reject };
      setError(null); setVerified(null); setBusy(false);
      setReq(r);
      resolveMode();
    }));
    return () => setTpinHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (token, err) => {
    const p = pending.current;
    pending.current = null;
    setReq(null);
    if (!p) return;
    if (err) p.reject(err); else p.resolve(token);
  };

  const cancel = () => { if (!busy) finish(null, Object.assign(new Error('TPIN verification cancelled'), { status: 0, cancelled: true })); };

  const submit = async (pin) => {
    setBusy(true); setError(null);
    try {
      const res = await authorizeTpin({ pin, ...req });
      setVerified(res.actorName || 'Verified');
      setTimeout(() => finish(res.authorizationToken), 700);
    } catch (e) {
      setError(pinErrorMessage(e));
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={!!req} transparent animationType="slide" onRequestClose={cancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' }}>
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 + insets.bottom, alignItems: 'center' }}>
          <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: '#D1D5DB', marginBottom: 14 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingBottom: 14, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#EEF2F3' }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="shield-checkmark" size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.text }}>{ACTION_LABEL[req?.action] || 'Authorize transaction'}</Text>
              <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Secured with your Transaction PIN</Text>
            </View>
            <Pressable onPress={cancel} hitSlop={10} accessibilityLabel="Close"
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={20} color={C.text} />
            </Pressable>
          </View>
          {verified ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="checkmark-circle" size={44} color={C.primary} />
              <Text style={{ marginTop: 8, fontSize: 15, fontWeight: '800', color: C.text }}>Verified: {verified}</Text>
            </View>
          ) : mode === 'loading' ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator color={C.primary} />
            </View>
          ) : mode === 'status-error' ? (
            <View style={{ alignItems: 'center', alignSelf: 'stretch', paddingVertical: 20 }}>
              <Text style={{ color: C.error, textAlign: 'center' }}>{error}</Text>
              <Pressable onPress={resolveMode} style={{ alignSelf: 'stretch', height: 46, borderRadius: 14, marginTop: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>Retry</Text>
              </Pressable>
            </View>
          ) : mode === 'create' ? (
            <NewPinFlow type="TPIN" subtitle="Set your permanent Transaction PIN once" onDone={() => { onTpinCreated?.(); resolveMode(); }} />
          ) : mode === 'reset' ? (
            <ResetPinFlow type="TPIN" session={session} onDone={() => setMode('verify')} onCancel={() => setMode('verify')} />
          ) : (
            <PinPad
              title="Enter Transaction PIN"
              subtitle="Required for every protected action"
              error={error}
              busy={busy}
              onComplete={submit}
              footer={(
                <Pressable onPress={() => setMode('reset')} style={{ marginTop: 6 }}>
                  <Text style={{ color: C.primary, fontWeight: '700', fontSize: 12.5 }}>Reset TPIN</Text>
                </Pressable>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
