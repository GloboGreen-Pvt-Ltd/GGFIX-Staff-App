import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ShieldCheck, Smartphone } from 'lucide-react-native';
import { Text, TextInput } from '../../components/Typography';
import { notify } from '../../components/confirm';
import { sendSellOtp, verifySellOtp } from '../../api/pickups';
import { rf } from '../../utils/responsive';
import { SC, SK, SellCta, SellPage, goToSellStage, isGone, sellError, useSellPickup } from './sellKit';
import PinBoxes from '../../components/PinBoxes';

const RESEND_SECONDS = 120;

// Verify Customer: the 4-digit pickup PIN made when the journey started. The
// customer sees it only on their sell order page in the NearGFix app (no
// notification; it never reaches this app). Five wrong tries lock it until a
// new PIN is generated (the customer's page then shows the new one).
export default function SellVerifyOtpScreen({ navigation, route }) {
  const { booking, setBooking } = useSellPickup(route);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(null); // 'verify' | 'send'
  const [error, setError] = useState(null);
  const [locked, setLocked] = useState(false);
  const [left, setLeft] = useState(0);
  const input = useRef(null);
  const lock = useRef(false);
  const sentAt = booking?.otpSentAt ? new Date(booking.otpSentAt).getTime() : 0;

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((sentAt + RESEND_SECONDS * 1000 - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [sentAt]);

  const run = async (key, fn) => {
    if (lock.current || !booking) return;
    lock.current = true;
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (isGone(e)) {
        notify('Pickup changed', 'This pickup was updated. Showing the latest status.', { type: 'info' });
        navigation.popTo('PickupAssign');
        return;
      }
      setError(sellError(e, key === 'verify' ? 'Could not verify the PIN.' : 'Could not generate a new PIN.'));
      if (key === 'verify') setOtp('');
      if (e?.payload?.code === 'OTP_LOCKED' || e?.payload?.code === 'OTP_NOT_SENT') setLocked(true);
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const verify = () => run('verify', async () => {
    const b = await verifySellOtp(booking.id, otp);
    notify('PIN verified', 'Compare the device with the listing next.', { type: 'success' });
    goToSellStage(navigation, { ...booking, ...b });
  });
  const send = () => run('send', async () => {
    const b = await sendSellOtp(booking.id);
    setBooking((cur) => ({ ...cur, ...b }));
    setOtp('');
    setLocked(false);
    notify('New PIN generated', 'Ask the customer to reopen their sell order page in the NearGFix app.', { type: 'success' });
  });

  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  const canNew = !sentAt || locked || left === 0;
  return (
    <SellPage
      title="Verify Customer"
      navigation={navigation}
      footer={(
        <>
          <SellCta title="Verify & Continue" onPress={verify} disabled={otp.length !== 4 || !!busy || locked} loading={busy === 'verify'} />
          {canNew ? (
            <Pressable onPress={send} disabled={left > 0 || !!busy} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Text style={{ fontSize: rf(13), fontWeight: '700', color: left > 0 || busy ? SK.muted : SK.teal }}>
                {busy === 'send' ? 'Generating…' : left > 0 ? `Generate New PIN (${mmss})` : 'Generate New PIN'}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    >
      <ScrollView contentContainerStyle={{ padding: 14, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ height: 76, width: 76, borderRadius: 38, backgroundColor: SK.tealSoft, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
          <Smartphone size={34} color={SK.teal} strokeWidth={1.6} />
          <View style={{ position: 'absolute', right: -4, bottom: -2, height: 28, width: 28, borderRadius: 14, backgroundColor: SC.green, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' }}>
            <ShieldCheck size={14} color="#FFFFFF" />
          </View>
        </View>
        <Text style={{ fontSize: rf(16), fontWeight: '800', color: SK.ink, marginTop: 12 }}>Enter Pickup PIN</Text>
        <Text style={{ fontSize: rf(13.5), color: SK.muted, marginTop: 6, textAlign: 'center' }}>Ask the customer for the{'\n'}4-digit PIN</Text>

        <PinBoxes value={otp} onChange={(t) => { setOtp(t); setError(null); }} autoFocus error={!!error} accessibilityLabel="Pickup PIN" style={{ marginTop: 18 }} />
        {sentAt ? <Text style={{ fontSize: rf(13), fontWeight: '800', color: left > 0 ? SK.teal : SC.red, marginTop: 14 }}>{left > 0 ? `PIN valid for ${mmss}` : "Didn't get it? Generate a new PIN"}</Text> : null}
        {error ? <Text style={{ fontSize: rf(12.5), color: SC.red, fontWeight: '700', marginTop: 14, textAlign: 'center' }}>{error}</Text> : null}
        {booking?.customerName ? (
          <Text style={{ fontSize: rf(12.5), color: SK.muted, marginTop: 18 }}>Customer: <Text style={{ fontWeight: '800', color: SK.navy }}>{booking.customerName}</Text></Text>
        ) : null}
        <View style={{ backgroundColor: SK.tealSoft, borderRadius: 12, padding: 12, marginTop: 14, alignSelf: 'stretch' }}>
          <Text style={{ fontSize: rf(12), color: SK.navy, textAlign: 'center', lineHeight: rf(17) }}>
            The customer finds the PIN in the NearGFix app on their sell order page{booking?.bookingNumber ? ` (${booking.bookingNumber})` : ''}.
          </Text>
        </View>
      </ScrollView>
    </SellPage>
  );
}
