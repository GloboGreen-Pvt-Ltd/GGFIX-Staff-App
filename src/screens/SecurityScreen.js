import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight, Fingerprint, KeyRound, Lock, RotateCcw, ShieldCheck } from 'lucide-react-native';
import { Text } from '../components/Typography';
import MintScreenHeader from '../components/MintScreenHeader';
import { PinPadBody } from '../components/PinPad';
import { notify } from '../components/confirm';
import { selectSession } from '../store/authSlice';
import { getPinStatus, resetPin, savePin } from '../api/pin';
import { requestOtp } from '../api/auth';
import { authenticateBiometric, biometricUnavailableReason, getLockPrefs, setLockPrefs } from '../auth/appLock';
import { requireFreshAuth } from '../auth/freshAuth';
import { userMessage } from '../utils/userMessages';
import { rf } from '../utils/responsive';
import { NewPinFlow, ResetPinFlow } from '../security/SecurityFlows';
import { sessionStatus } from '../security/securityApi';

const TEAL = '#035C6C';
const card = { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', marginHorizontal: 16, marginTop: 12, overflow: 'hidden' };

// My Account → Security & Biometrics: the employee's own 6-digit PIN (server
// hash, tied to their user id), optional fingerprint / face unlock, App Lock.
export default function SecurityScreen({ navigation }) {
  const session = useSelector(selectSession);
  const [status, setStatus] = useState(null); // server PIN status, null = loading / unknown
  const [loadErr, setLoadErr] = useState(null);
  const [prefs, setPrefs] = useState({ lock: false, biometric: false });
  const [bioWhy, setBioWhy] = useState('Checking…'); // null = biometrics usable
  const bioOk = bioWhy == null;
  const [flow, setFlow] = useState(null); // PIN flow state (see Flow)
  const [tpinReset, setTpinReset] = useState(false);
  const [tpinSet, setTpinSet] = useState(null); // null = unknown (keeps Reset)

  const load = useCallback(async () => {
    setLoadErr(null);
    setStatus(null);
    try { setStatus(await getPinStatus()); } catch (e) { setLoadErr(userMessage(e, 'Could not load security status.')); }
    setPrefs(await getLockPrefs());
    setBioWhy(await biometricUnavailableReason());
    sessionStatus().then((st) => setTpinSet(!!st?.tpinSet), () => setTpinSet(null));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pinSet = !!status?.pinSet;
  const fresh = async (title) => { try { return await requireFreshAuth(title); } catch (e) { notify('Not changed', userMessage(e, 'Confirmation cancelled.'), { type: 'info' }); return false; } };

  const toggleLock = async (on) => {
    if (!pinSet) { notify('Create a PIN first', 'App Lock needs your employee PIN.', { type: 'info' }); return; }
    if (!(await fresh('Confirm to change App Lock'))) return;
    await setLockPrefs({ lock: on });
    setPrefs((p) => ({ ...p, lock: on }));
  };
  const toggleBio = async (on) => {
    if (on && !bioOk) { notify('Biometrics unavailable', bioWhy || 'Not available on this phone.', { type: 'info' }); return; }
    if (!pinSet) { notify('Create a PIN first', 'Biometric unlock needs your employee PIN as the fallback.', { type: 'info' }); return; }
    if (on) {
      // Verify the employee (PIN) first, then the phone's biometric.
      if (!(await fresh('Confirm to enable biometrics'))) return;
      if (!(await authenticateBiometric('Confirm fingerprint / face'))) { notify('Not enabled', 'Biometric check failed.', { type: 'error' }); return; }
    }
    await setLockPrefs({ biometric: on });
    setPrefs((p) => ({ ...p, biometric: on }));
  };

  const finish = async (fn, okMsg) => {
    setFlow((f) => ({ ...f, busy: true }));
    try {
      setStatus(await fn());
      setFlow(null);
      notify(okMsg, '', { type: 'success' });
    } catch (e) {
      setFlow((f) => ({ ...f, busy: false, step: f.reset ? 'new' : f.current != null ? 'current' : 'new', pin: null, current: f.reset ? f.current : null, error: userMessage(e, 'Could not save the PIN.') }));
    }
  };
  // Steps: [current] → new → confirm → save. Reset: otp → new → confirm.
  const onEntry = (digits) => {
    const f = flow;
    if (f.step === 'current') return setFlow({ ...f, step: 'new', current: digits, error: null });
    if (f.step === 'new') return setFlow({ ...f, step: 'confirm', pin: digits, error: null });
    if (digits !== f.pin) return setFlow({ ...f, step: 'new', pin: null, error: 'PINs did not match. Try again.' });
    if (f.reset) return finish(() => resetPin(f.identifier, f.otp, digits), 'PIN reset');
    return finish(() => savePin(digits, f.current), pinSet ? 'PIN changed' : 'PIN created');
  };
  const startReset = async () => {
    const identifier = session?.mobile || session?.email;
    if (!identifier) { notify('Not available', 'No mobile number or email on your account.', { type: 'error' }); return; }
    try {
      await requestOtp(identifier);
      setFlow({ reset: true, step: 'otp', identifier, otp: '' });
    } catch (e) { notify('Could not send OTP', userMessage(e, 'Please try again.'), { type: 'error' }); }
  };

  const Row = ({ icon: Icon, label, sub, onPress, right, last }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F1F5F9' }}>
      <View style={{ height: 36, width: 36, borderRadius: 10, backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <Icon size={18} color={TEAL} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: rf(14), fontWeight: '700', color: '#111111' }}>{label}</Text>
        {sub ? <Text style={{ fontSize: rf(12), color: '#6B7280', marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {right || (onPress ? <ChevronRight size={18} color="#9CA3AF" /> : null)}
    </Pressable>
  );

  const stateText = status == null ? (loadErr || 'Checking…')
    : status.locked ? 'PIN locked after wrong attempts — try later or reset'
      : pinSet ? `PIN set · App Lock ${prefs.lock ? 'on' : 'off'} · Biometrics ${prefs.biometric ? 'on' : 'off'}` : 'No PIN yet — create one to secure your account';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F3F4F6' }} edges={['top']}>
      <MintScreenHeader title="Security & Biometrics" navigation={navigation} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={[card, { padding: 14, flexDirection: 'row', alignItems: 'center' }]}>
          <ShieldCheck size={22} color={pinSet && !status?.locked ? '#16A34A' : '#F59E0B'} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ fontSize: rf(14), fontWeight: '800', color: '#111111' }}>Security Status</Text>
            <Text style={{ fontSize: rf(12), color: '#6B7280', marginTop: 2 }}>{stateText}</Text>
          </View>
          {status == null && !loadErr ? <ActivityIndicator color={TEAL} />
            : loadErr ? <Pressable onPress={load} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: TEAL }}><Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: rf(12) }}>Retry</Text></Pressable> : null}
        </View>
        <View style={card}>
          {/* Login MPIN is owner-managed (Partner App → Employee Profile); no self create/change/reset. */}
          <Row icon={KeyRound} label="Login MPIN" sub="Set and reset only by your shop owner. Forgot it? Ask your shop owner." last />
        </View>
        <View style={card}>
          <Row icon={Lock} label="App Lock" sub="Ask for PIN / biometrics when reopening the app"
            right={<Switch value={prefs.lock} onValueChange={toggleLock} trackColor={{ true: TEAL }} />} />
          <Row icon={Fingerprint} label="Fingerprint / Face Unlock" sub={bioOk ? 'Uses this phone’s biometrics; PIN as fallback' : bioWhy} last
            right={<Switch value={prefs.biometric} onValueChange={toggleBio} trackColor={{ true: TEAL }} />} />
        </View>
        <View style={card}>
          <Row icon={ShieldCheck} label={tpinSet === false ? 'Create Transaction PIN (TPIN)' : 'Reset Transaction PIN (TPIN)'} sub="Used for check-in, check-out and protected actions" onPress={() => setTpinReset(true)} last />
        </View>
      </ScrollView>

      <Modal visible={!!flow} transparent animationType="slide" onRequestClose={() => !flow?.busy && setFlow(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 12 }}>
            {flow?.step === 'otp' ? (
              <View style={{ padding: 20 }}>
                <Text style={{ fontSize: rf(17), fontWeight: '800', color: '#111111', textAlign: 'center' }}>Reset PIN</Text>
                <Text style={{ fontSize: rf(12.5), color: '#6B7280', textAlign: 'center', marginTop: 4 }}>Enter the OTP sent to your registered number / email</Text>
                <TextInput value={flow.otp} onChangeText={(t) => setFlow({ ...flow, otp: t.replace(/\D/g, '').slice(0, 6) })} keyboardType="number-pad" maxLength={6} autoFocus
                  style={{ borderWidth: 1.5, borderColor: TEAL, borderRadius: 12, marginTop: 16, padding: 12, fontSize: rf(18), textAlign: 'center', letterSpacing: 6, color: '#111111' }} />
                <Pressable disabled={flow.otp.length < 4} onPress={() => setFlow({ ...flow, step: 'new', error: null })}
                  style={{ backgroundColor: TEAL, opacity: flow.otp.length < 4 ? 0.5 : 1, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 14 }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Continue</Text>
                </Pressable>
                <Pressable onPress={() => setFlow(null)} style={{ alignItems: 'center', padding: 10 }}><Text style={{ color: '#6B7280', fontWeight: '700' }}>Cancel</Text></Pressable>
              </View>
            ) : flow ? (
              <PinPadBody
                key={`${flow.step}-${flow.error || ''}`}
                mode="entry"
                title={flow.step === 'current' ? 'Enter current PIN' : flow.step === 'new' ? 'Enter new PIN' : 'Confirm new PIN'}
                subtitle={flow.busy ? 'Saving…' : flow.error || (flow.step === 'new' ? 'Avoid easy PINs like 123456 or 000000' : null)}
                onDone={flow.busy ? () => {} : onEntry}
                onCancel={flow.busy ? undefined : () => setFlow(null)}
              />
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={tpinReset} transparent animationType="slide" onRequestClose={() => setTpinReset(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, alignItems: 'center' }}>
            {tpinReset && tpinSet === false ? (
              <>
                <NewPinFlow type="TPIN" subtitle="Used for check-in, check-out and protected actions" onDone={() => { setTpinReset(false); setTpinSet(true); notify('TPIN created', '', { type: 'success' }); }} />
                <Pressable onPress={() => setTpinReset(false)} style={{ padding: 10 }}><Text style={{ color: '#6B7280', fontWeight: '700' }}>Cancel</Text></Pressable>
              </>
            ) : tpinReset ? (
              <ResetPinFlow
                type="TPIN"
                session={session}
                onCancel={() => setTpinReset(false)}
                onDone={() => { setTpinReset(false); notify('TPIN reset successfully', '', { type: 'success' }); }}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
