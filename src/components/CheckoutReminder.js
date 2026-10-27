// In-app half of the 6:30 PM check-out reminder, for builds without OS
// notifications (Expo Go, web). Dev / release builds get the same popup from
// the OS (utils/checkoutAlarm.js), so this renders nothing there. Replaces the
// retired SOS alarm: no siren, no vibration, nothing blocking — a small card
// at the top, once a day, that hides itself after AUTO_HIDE_MS.
import React, { useEffect, useState } from 'react';
import { AppState, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellRing, X } from 'lucide-react-native';
import { Text } from './Typography';
import {
  isPastCheckoutAlarm, checkoutReminderUsesOs, CHECKOUT_REMINDER_TITLE, CHECKOUT_REMINDER_BODY,
} from '../utils/checkoutAlarm';

const TICK_MS = 30 * 1000;
const AUTO_HIDE_MS = 10 * 1000;
// Day the popup last appeared, for this app run.
let shownOn = '';

export default function CheckoutReminder({ onDuty }) {
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(false);
  const inApp = !checkoutReminderUsesOs();

  useEffect(() => {
    if (!inApp) return undefined;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setNow(Date.now()); });
    return () => { clearInterval(id); sub.remove(); };
  }, [inApp]);

  useEffect(() => {
    if (!inApp || !onDuty) { setVisible(false); return; }
    const d = new Date(now);
    if (isPastCheckoutAlarm(d) && shownOn !== d.toDateString()) {
      shownOn = d.toDateString();
      setVisible(true);
    }
  }, [inApp, onDuty, now]);

  useEffect(() => {
    if (!visible) return undefined;
    const id = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(id);
  }, [visible]);

  if (!visible) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, alignItems: 'center', zIndex: 50, elevation: 8 }}
    >
      <View
        accessibilityRole="alert"
        style={{
          width: '100%', maxWidth: 480, flexDirection: 'row', alignItems: 'center',
          backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12,
          borderWidth: 1, borderColor: '#E5E7EB',
          shadowColor: '#111111', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
        }}
      >
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' }}>
          <BellRing size={16} color="#035C6C" />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#111111' }}>{CHECKOUT_REMINDER_TITLE}</Text>
          <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{CHECKOUT_REMINDER_BODY}</Text>
        </View>
        <TouchableOpacity onPress={() => setVisible(false)} hitSlop={8} accessibilityLabel="Dismiss" style={{ marginLeft: 8 }}>
          <X size={16} color="#6B7280" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
