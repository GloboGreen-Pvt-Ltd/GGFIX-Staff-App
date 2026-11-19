import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { BriefcaseBusiness } from 'lucide-react-native';
import { Text } from './Typography';
import { rf, rs } from '../utils/responsive';
import { brand, UI } from '../theme/tokens';

// Compact GGFIX confirm for accepting a job: teal icon disc, title, short
// message, Cancel (outlined) + Accept (solid teal). Accept shows a spinner
// while the request runs; the screen closes the dialog once the API answers,
// so the success / error toast only ever follows a real response.
// `inline`: draw as an overlay instead of its own Modal — for use inside
// another Modal (iOS won't present a second Modal from a sibling).
export default function AcceptJobDialog({
  visible,
  busy = false,
  title = 'Accept this job?',
  message = 'The job moves to your working jobs and you can start the repair.',
  onCancel,
  onConfirm,
  inline = false,
}) {
  const { width } = useWindowDimensions();
  if (inline && !visible) return null;
  const cancel = busy ? undefined : onCancel;

  const body = (
    <View style={s.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel="Cancel" />
      <View accessibilityViewIsModal style={[s.card, { width: Math.min(width - rs(48), 340) }]}>
        <View style={s.disc}>
          <BriefcaseBusiness size={rs(24)} color={brand.teal} strokeWidth={2.2} />
        </View>
        <Text style={s.title} accessibilityRole="header">{title}</Text>
        {message ? <Text style={s.message}>{message}</Text> : null}
        <View style={s.row}>
          <TouchableOpacity
            onPress={cancel}
            disabled={busy}
            activeOpacity={0.8}
            accessibilityRole="button"
            style={[s.btn, s.cancel, busy && { opacity: 0.5 }]}
          >
            <Text style={[s.btnText, { color: brand.teal }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={busy ? undefined : onConfirm}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ busy }}
            style={[s.btn, s.accept]}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={[s.btnText, { color: '#FFFFFF' }]}>Accept</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (inline) return <View style={StyleSheet.absoluteFill}>{body}</View>;
  return (
    <Modal visible={!!visible} transparent animationType="fade" statusBarTranslucent onRequestClose={cancel}>
      {body}
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: rs(20), padding: rs(20), alignItems: 'center',
    shadowColor: '#111111', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  disc: { width: rs(56), height: rs(56), borderRadius: rs(28), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: rf(16), fontWeight: '800', color: brand.black, textAlign: 'center', marginTop: rs(12) },
  message: { fontSize: rf(13), color: brand.muted, textAlign: 'center', marginTop: rs(4), lineHeight: rf(18) },
  row: { flexDirection: 'row', gap: rs(10), alignSelf: 'stretch', marginTop: rs(18) },
  btn: { flex: 1, minHeight: UI.buttonHeight, borderRadius: rs(12), alignItems: 'center', justifyContent: 'center' },
  cancel: { borderWidth: 1.5, borderColor: brand.teal, backgroundColor: '#FFFFFF' },
  accept: { backgroundColor: brand.teal },
  btnText: { fontSize: rf(14), fontWeight: '800' },
});
