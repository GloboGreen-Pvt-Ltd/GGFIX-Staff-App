import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, TouchableOpacity, View, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Text, TextInput } from './Typography';
import { notify } from './confirm';
import { declinePickup } from '../api/pickups';
import { DECLINE_REASONS, trackingId } from '../utils/pickups';
import { userMessage } from '../utils/userMessages';
import { rf, rs } from '../utils/responsive';

// Decline an assigned pickup (same sheet look as PickupProblemSheet). A
// reason is required ("Other" needs a note). The server returns the booking
// to the shop to reassign — the customer's booking is not cancelled. One
// request at a time; the toast follows the API's answer.
export default function PickupDeclineSheet({ booking, visible, onClose, onDone }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => { if (visible) { setReason(''); setNote(''); setBusy(false); } }, [visible]);

  const needsNote = reason === 'Other';
  const ready = !!reason && (!needsNote || note.trim().length >= 3);

  const submit = async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await declinePickup(booking.id, { reason, note: note.trim() || undefined });
      notify('Pickup declined', 'The shop will reassign it.', { type: 'success' });
      onClose?.();
      await onDone?.();
    } catch (e) {
      const code = e?.payload?.code;
      const changed = code === 'STALE_STATUS' || code === 'NOT_ASSIGNED' || e?.status === 403;
      notify('Could not decline pickup', changed ? 'This pickup was already updated. Refreshing…' : userMessage(e, 'Please try again.'), { type: 'error' });
      if (changed) { onClose?.(); await onDone?.(); }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => !busy && onClose?.()}>
      <Pressable style={s.backdrop} onPress={() => !busy && onClose?.()}>
        <Pressable style={[s.sheet, { width: Math.min(width, 560), paddingBottom: insets.bottom + rs(16) }]} onPress={() => {}}>
          <View style={s.handle} />
          <View style={s.head}>
            <Text style={s.title}>Decline pickup</Text>
            <TouchableOpacity onPress={onClose} disabled={busy} hitSlop={8} accessibilityLabel="Close"><X size={rs(18)} color="#6B7280" /></TouchableOpacity>
          </View>
          <Text style={s.sub}>{trackingId(booking)} goes back to the shop to reassign. The customer's booking is not cancelled.</Text>

          <Text style={s.label}>Reason <Text style={{ color: '#F32C26' }}>*</Text></Text>
          <View style={s.chips}>
            {DECLINE_REASONS.map((r) => {
              const on = r === reason;
              return (
                <TouchableOpacity key={r} onPress={() => setReason(on ? '' : r)} disabled={busy} activeOpacity={0.85}
                  style={[s.chip, on && s.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Text style={[s.chipText, on && { color: '#FFFFFF' }]} numberOfLines={1}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.label}>{needsNote ? <>Note <Text style={{ color: '#F32C26' }}>*</Text></> : 'Note (optional)'}</Text>
          <TextInput value={note} onChangeText={setNote} editable={!busy} multiline
            placeholder={needsNote ? 'Tell the shop why you can’t take it' : 'Anything the shop should know'}
            placeholderTextColor="#9CA3AF" style={s.input} maxLength={300} />

          <View style={s.row}>
            <TouchableOpacity onPress={onClose} disabled={busy} activeOpacity={0.85} accessibilityRole="button"
              style={[s.btn, { borderWidth: 1.5, borderColor: '#035C6C', backgroundColor: '#FFFFFF' }]}>
              <Text style={[s.btnText, { color: '#035C6C' }]}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={submit} disabled={!ready || busy} activeOpacity={0.85} accessibilityRole="button"
              style={[s.btn, { backgroundColor: '#F32C26' }, !ready && { opacity: 0.5 }]}>
              {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={[s.btnText, { color: '#FFFFFF' }]}>Decline</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  row: { flexDirection: 'row', gap: rs(10), marginTop: rs(14) },
  btn: { flex: 1, minHeight: rs(46), borderRadius: rs(13), alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: rf(14), fontWeight: '800' },
});
