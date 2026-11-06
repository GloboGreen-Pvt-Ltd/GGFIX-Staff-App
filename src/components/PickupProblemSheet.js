import React, { useEffect, useState } from 'react';
import { Modal, Pressable, TouchableOpacity, View, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Info, Phone, X } from 'lucide-react-native';
import { Text, TextInput } from './Typography';
import { confirm, notify } from './confirm';
import { callCustomer } from './PickupCard';
import { updatePickupStatus } from '../api/pickups';
import { PROBLEM_REASONS, customerPhone, trackingId } from '../utils/pickups';
import { userMessage } from '../utils/userMessages';
import { rf, rs } from '../utils/responsive';

// Failed pickup / reschedule. A reason is required. "Customer cancelled" is
// saved as CANCELLED + reason (the pickup person's one supported outcome; the
// Partner App and the customer see it). The other reasons have no backend
// endpoint yet, so nothing is changed — the sheet says so and offers a call.
export default function PickupProblemSheet({ booking, visible, onClose, onDone }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setCode(''); setNote(''); setBusy(false); } }, [visible]);

  const reason = PROBLEM_REASONS.find((r) => r.code === code);
  const phone = customerPhone(booking);

  const submitCancel = async () => {
    if (busy || !reason) return;
    const ok = await confirm({
      title: 'Cancel this pickup?',
      message: `Booking ${trackingId(booking)} will be cancelled for the customer and the shop.`,
      confirmText: 'Cancel Pickup',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const text = [reason.label, note.trim()].filter(Boolean).join(' — ');
      await updatePickupStatus(booking.id, 'CANCELLED', { note: text });
      notify('Pickup cancelled', 'The shop can see the reason.', { type: 'success' });
      onClose?.();
      await onDone?.();
    } catch (e) {
      notify('Could not cancel pickup', userMessage(e, 'Please try again.'), { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => !busy && onClose?.()}>
      <Pressable style={s.backdrop} onPress={() => !busy && onClose?.()}>
        <Pressable style={[s.sheet, { width: Math.min(width, 560), paddingBottom: insets.bottom + rs(16) }]} onPress={() => {}}>
          <View style={s.handle} />
          <View style={s.head}>
            <Text style={s.title}>Pickup problem</Text>
            <TouchableOpacity onPress={onClose} disabled={busy} hitSlop={8} accessibilityLabel="Close"><X size={rs(18)} color="#6B7280" /></TouchableOpacity>
          </View>
          <Text style={s.sub}>{trackingId(booking)} · {booking?.customerName || 'Customer'}</Text>

          <Text style={s.label}>Reason <Text style={{ color: '#F32C26' }}>*</Text></Text>
          <View style={s.chips}>
            {PROBLEM_REASONS.map((r) => {
              const on = r.code === code;
              return (
                <TouchableOpacity key={r.code} onPress={() => setCode(on ? '' : r.code)} disabled={busy} activeOpacity={0.85}
                  style={[s.chip, on && s.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Text style={[s.chipText, on && { color: '#FFFFFF' }]} numberOfLines={1}>{r.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {reason?.cancels ? (
            <>
              <Text style={s.label}>Note (optional)</Text>
              <TextInput value={note} onChangeText={setNote} editable={!busy} multiline placeholder="What did the customer say?"
                placeholderTextColor="#9CA3AF" style={s.input} maxLength={300} />
              <View style={s.row}>
                <Btn label="Back" outline onPress={onClose} disabled={busy} />
                <Btn label="Cancel Pickup" color="#F32C26" onPress={submitCancel} busy={busy} />
              </View>
            </>
          ) : reason ? (
            <>
              <View style={s.info}>
                <Info size={rs(15)} color="#0788C9" />
                <Text style={s.infoText}>
                  {reason.code === 'RESCHEDULE'
                    ? 'A new time can only be set by the customer or the shop. The booking stays as it is — tell your shop so they can reschedule it.'
                    : 'This reason can’t be saved from the app yet, so the booking stays as it is. Tell your shop so they can reschedule or reassign it.'}
                </Text>
              </View>
              <View style={s.row}>
                <Btn label="Close" outline onPress={onClose} />
                <Btn label="Call Customer" icon={Phone} color="#609138" onPress={() => callCustomer(booking)} disabled={!phone} />
              </View>
            </>
          ) : (
            <Text style={s.hint}>Choose a reason to continue.</Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Btn({ label, icon: Icon, color = '#035C6C', outline, onPress, busy, disabled }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={busy || disabled} activeOpacity={0.85} accessibilityRole="button"
      style={[s.btn, outline ? { borderWidth: 1.5, borderColor: '#035C6C', backgroundColor: '#FFFFFF' } : { backgroundColor: color }, disabled && { opacity: 0.5 }]}>
      {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(6) }}>
          {Icon ? <Icon size={rs(14)} color={outline ? '#035C6C' : '#FFFFFF'} strokeWidth={2.4} /> : null}
          <Text style={[s.btnText, { color: outline ? '#035C6C' : '#FFFFFF' }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: rs(22), borderTopRightRadius: rs(22), paddingTop: rs(8), paddingHorizontal: rs(16) },
  handle: { alignSelf: 'center', width: rs(40), height: rs(5), borderRadius: rs(3), backgroundColor: '#E5E7EB', marginBottom: rs(10) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: rf(16), fontWeight: '800', color: '#111111' },
  sub: { fontSize: rf(12), color: '#6B7280', marginTop: 2 },
  label: { fontSize: rf(12), fontWeight: '800', color: '#1C3053', marginTop: rs(12), marginBottom: rs(6) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6) },
  chip: { paddingHorizontal: rs(11), paddingVertical: rs(7), borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  chipOn: { backgroundColor: '#035C6C', borderColor: '#035C6C' },
  chipText: { fontSize: rf(12), fontWeight: '700', color: '#1C3053' },
  input: { minHeight: rs(64), borderWidth: 1, borderColor: '#E5E7EB', borderRadius: rs(12), padding: rs(10), fontSize: rf(13), color: '#111111', textAlignVertical: 'top' },
  info: { flexDirection: 'row', gap: rs(8), backgroundColor: '#E6F3FA', borderRadius: rs(12), padding: rs(10), marginTop: rs(12) },
  infoText: { flex: 1, fontSize: rf(12), color: '#1C3053', lineHeight: rf(17) },
  hint: { fontSize: rf(12), color: '#6B7280', marginTop: rs(12) },
  row: { flexDirection: 'row', gap: rs(10), marginTop: rs(14) },
  btn: { flex: 1, minHeight: rs(46), borderRadius: rs(13), alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: rf(14), fontWeight: '800' },
});
