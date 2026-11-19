import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut } from 'lucide-react-native';
import { Text } from './Typography';
import { rf, rs } from '../utils/responsive';

// Logout confirmation as a bottom sheet (My Account): drag handle, red
// logout icon on a light red disc, message, Cancel (outlined) + Log Out
// (solid teal). Slides up over a dimmed backdrop; tap outside or Back cancels.
const TEAL = '#035C6C';

export default function LogoutSheet({ visible, onCancel, onConfirm }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [shown, setShown] = useState(visible);
  const [busy, setBusy] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setShown(true);
      setBusy(false);
      Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (shown) {
      Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true })
        .start(({ finished }) => { if (finished) setShown(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const confirm = () => {
    if (busy) return;
    setBusy(true);
    onConfirm?.();
  };

  return (
    <Modal visible={shown} transparent animationType="none" statusBarTranslucent onRequestClose={busy ? undefined : onCancel}>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onCancel} accessibilityLabel="Cancel" />
      </Animated.View>
      <View pointerEvents="box-none" style={s.bottom}>
        <Animated.View
          accessibilityViewIsModal
          style={[s.sheet, {
            width: Math.min(width, 520),
            paddingBottom: insets.bottom + rs(18),
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [360, 0] }) }],
          }]}
        >
          <View style={s.handle} />
          <View style={s.iconDisc}>
            <LogOut size={rs(26)} color="#F32C26" strokeWidth={2.2} />
          </View>
          <Text style={s.title} accessibilityRole="header">Log out from your account?</Text>
          <Text style={s.message}>You will be signed out from the Employee App. You can log in again anytime.</Text>
          <View style={s.row}>
            <TouchableOpacity onPress={onCancel} disabled={busy} activeOpacity={0.8} accessibilityRole="button" style={[s.btn, s.cancel]}>
              <Text style={[s.btnText, { color: TEAL }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirm} disabled={busy} activeOpacity={0.85} accessibilityRole="button" style={[s.btn, s.logout, busy && { opacity: 0.7 }]}>
              <Text style={[s.btnText, { color: '#FFFFFF' }]}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(17,17,17,0.45)' },
  bottom: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24),
    paddingTop: rs(10), paddingHorizontal: rs(20), alignItems: 'center',
    shadowColor: '#111111', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  handle: { width: rs(40), height: rs(5), borderRadius: rs(3), backgroundColor: '#E5E7EB', marginBottom: rs(18) },
  iconDisc: { width: rs(64), height: rs(64), borderRadius: rs(32), backgroundColor: '#FEECEC', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: rf(17), fontWeight: '800', color: '#111111', textAlign: 'center', marginTop: rs(14) },
  message: { fontSize: rf(13), color: '#6B7280', textAlign: 'center', marginTop: rs(6), lineHeight: rf(19), paddingHorizontal: rs(6) },
  row: { flexDirection: 'row', gap: rs(12), alignSelf: 'stretch', marginTop: rs(20) },
  btn: { flex: 1, minHeight: rs(48), borderRadius: rs(14), alignItems: 'center', justifyContent: 'center' },
  cancel: { borderWidth: 1.5, borderColor: TEAL, backgroundColor: '#FFFFFF' },
  logout: { backgroundColor: TEAL },
  btnText: { fontSize: rf(14.5), fontWeight: '800' },
});
