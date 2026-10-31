import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Keyboard, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCheck, CircleX, TriangleAlert, Info } from 'lucide-react-native';

// App-wide toast: one compact card above the floating bottom navigation (and
// above the keyboard when it's open). One slot only — a new toast replaces the
// current one, and the same toast again just restarts its timer, so repeated
// or simultaneous failures never stack.
//
//   showToast({ type: 'success' | 'error' | 'warning' | 'info', title, message, duration })
//   <ToastHost /> once, inside SafeAreaProvider (App.js).

export const TOAST_TYPES = {
  success: { color: '#609138', tint: '#F1F7EC', Icon: CircleCheck },
  error: { color: '#F32C26', tint: '#FEF1F0', Icon: CircleX },
  warning: { color: '#FAA700', tint: '#FFF8E8', Icon: TriangleAlert },
  info: { color: '#035C6C', tint: '#EEF7F8', Icon: Info },
};

const DEFAULT_MS = 3000;
// Clears the floating bottom navigation (bar + its gap) on phones and tablets.
const NAV_CLEARANCE = 96;

let host = null; // the mounted ToastHost's show()
let pending = null; // a toast fired before the host mounted

export function showToast({ type = 'info', title = '', message = '', duration = DEFAULT_MS } = {}) {
  const t = { type: TOAST_TYPES[type] ? type : 'info', title: String(title || ''), message: message ? String(message) : '', duration };
  if (!t.title && !t.message) return;
  if (host) host(t); else pending = t;
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [toast, setToast] = useState(null);
  const [keyboard, setKeyboard] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);
  const current = useRef(null);

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
        if (finished) { current.current = null; setToast(null); }
      });
    };
    const show = (t) => {
      const key = `${t.type}|${t.title}|${t.message}`;
      clearTimeout(timer.current);
      if (current.current !== key) {
        current.current = key;
        setToast({ ...t, key, hide });
        anim.setValue(0);
        AccessibilityInfo.announceForAccessibility?.([t.title, t.message].filter(Boolean).join('. '));
      }
      // Same toast again: stays up (also cancels a fade-out in progress).
      Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, t.duration || DEFAULT_MS);
    };
    host = show;
    if (pending) { show(pending); pending = null; }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, (e) => setKeyboard(e?.endCoordinates?.height || 0));
    const s2 = Keyboard.addListener(hideEvt, () => setKeyboard(0));
    return () => {
      if (host === show) host = null;
      clearTimeout(timer.current);
      s1.remove();
      s2.remove();
    };
  }, [anim]);

  if (!toast) return null;
  const meta = TOAST_TYPES[toast.type];
  const { Icon } = meta;
  const bottom = Math.max(insets.bottom + NAV_CLEARANCE, keyboard + 12);
  const maxWidth = Math.min(width - 32, 520);

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center' }]}>
      <Animated.View
        style={{
          marginBottom: bottom,
          width: maxWidth,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
        }}
      >
        <Pressable
          onPress={toast.hide}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityHint="Tap to dismiss"
          style={[s.card, { backgroundColor: meta.tint, borderColor: `${meta.color}33` }]}
        >
          <View style={[s.icon, { backgroundColor: meta.color }]}>
            <Icon size={16} color="#FFFFFF" strokeWidth={2.4} />
          </View>
          <View style={s.texts}>
            {toast.title ? <Text style={s.title} numberOfLines={2}>{toast.title}</Text> : null}
            {toast.message ? <Text style={[s.message, !toast.title && s.messageOnly]} numberOfLines={2}>{toast.message}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 12,
    shadowColor: '#111111', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 13.5, lineHeight: 18, color: '#111111' },
  message: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 16, color: '#4B5563', marginTop: 1 },
  messageOnly: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 18, color: '#111111', marginTop: 0 },
});
