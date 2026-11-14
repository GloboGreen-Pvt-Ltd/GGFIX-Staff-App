import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ShieldCheck, Smartphone } from 'lucide-react-native';
import { Text, TextInput } from '../../components/Typography';
import { notify } from '../../components/confirm';
import { sendSellOtp, verifySellOtp } from '../../api/pickups';
import { rf } from '../../utils/responsive';
import { SC, SK, SellCta, SellPage, goToSellStage, isGone, sellError, useSellPickup } from './sellKit';

const RESEND_SECONDS = 30;

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

  const mmss = `00:${String(left).padStart(2, '0')}`;
  const canNew = !sentAt || locked;
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
      <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ height: 132, width: 132, borderRadius: 66, backgroundColor: SK.tealSoft, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
          <Smartphone size={58} color={SK.teal} strokeWidth={1.6} />
          <View style={{ position: 'absolute', right: 26, bottom: 30, height: 40, width: 40, borderRadius: 20, backgroundColor: SC.green, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' }}>
            <ShieldCheck size={20} color="#FFFFFF" />
          </View>
        </View>
        <Text style={{ fontSize: rf(19), fontWeight: '800', color: SK.ink, marginTop: 22 }}>Enter Pickup PIN</Text>
        <Text style={{ fontSize: rf(13.5), color: SK.muted, marginTop: 6, textAlign: 'center' }}>Ask the customer for the{'\n'}4-digit PIN</Text>

        <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Pickup PIN" style={{ flexDirection: 'row', gap: 12, marginTop: 26 }}>
          {[0, 1, 2, 3].map((i) => {
            const on = otp.length === i || (i === 3 && otp.length === 4);
            return (
              <View key={i} style={{ height: 58, width: 52, borderRadius: 12, borderWidth: on ? 2 : 1.5, borderColor: error ? SC.red : on ? SK.teal : SK.ring, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: rf(24), fontWeight: '800', color: SK.ink }}>{otp[i] || ''}</Text>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={input}
          value={otp}
          onChangeText={(t) => { setOtp(t.replace(/\D/g, '').slice(0, 4)); setError(null); }}
          keyboardType="number-pad"
          maxLength={4}
          autoFocus
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          style={{ position: 'absolute', height: 1, width: 1, opacity: 0 }}
        />
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
