// Compact 6-digit PIN pad: masked dots, numeric keypad, auto-submit at 6 digits.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const C = { bg: '#FFFFFF', primary: '#035C6C', border: '#E5E7EB', text: '#1F2937', muted: '#6B7280', error: '#DC2626', tint: '#E6F2F4' };

export default function PinPad({ title, subtitle, error, busy, onComplete, onBiometric, resetKey, footer }) {
  const [pin, setPin] = useState('');
  useEffect(() => { setPin(''); }, [resetKey, error]);

  const press = (d) => {
    if (busy || pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 6) onComplete?.(next);
  };
  const back = () => { if (!busy) setPin((p) => p.slice(0, -1)); };

  // Static styles only (NativeWind's Pressable wrapper drops function styles,
  // which collapsed every key onto one line). Rows are explicit — no flexWrap.
  const Key = ({ children, onPress, label, plain }) => {
    const [down, setDown] = useState(false);
    return (
      <Pressable
        onPress={onPress}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        disabled={!onPress || busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={4}
        style={{
          width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center',
          backgroundColor: down ? '#CFE6EA' : plain ? 'transparent' : '#F3F7F8',
          borderWidth: plain ? 0 : 1, borderColor: down ? C.primary : '#E3ECEE',
        }}
      >
        {children}
      </Pressable>
    );
  };
  const Digit = ({ d }) => (
    <Key onPress={() => press(d)} label={d}>
      <Text style={{ fontSize: 26, fontWeight: '700', color: C.text }}>{d}</Text>
    </Key>
  );
  const Row = ({ children }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: 252, marginTop: 14 }}>{children}</View>
  );
  const dotColor = error ? C.error : C.primary;

  return (
    <View style={{ alignItems: 'center', width: '100%', paddingBottom: 8 }}>
      {title ? <Text style={{ fontSize: 19, fontWeight: '800', color: C.text, textAlign: 'center' }}>{title}</Text> : null}
      {subtitle ? <Text style={{ fontSize: 13, color: C.muted, marginTop: 6, textAlign: 'center', paddingHorizontal: 24 }}>{subtitle}</Text> : null}

      {/* PIN dots */}
      <View style={{ flexDirection: 'row', marginTop: 22, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 16, backgroundColor: error ? '#FEF2F2' : C.tint }}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const filled = i < pin.length;
          return (
            <View
              key={i}
              style={{
                width: 16, height: 16, borderRadius: 8, marginHorizontal: 8,
                borderWidth: 2, borderColor: filled ? dotColor : '#9CB9BF',
                backgroundColor: filled ? dotColor : '#FFFFFF',
              }}
            />
          );
        })}
      </View>

      <View style={{ minHeight: 24, marginTop: 8, justifyContent: 'center', paddingHorizontal: 16 }}>
        {busy ? <ActivityIndicator size="small" color={C.primary} />
          : error ? <Text style={{ color: C.error, fontSize: 12.5, fontWeight: '600', textAlign: 'center' }}>{error}</Text> : null}
      </View>

      {/* 3 × 4 keypad */}
      <Row><Digit d="1" /><Digit d="2" /><Digit d="3" /></Row>
      <Row><Digit d="4" /><Digit d="5" /><Digit d="6" /></Row>
      <Row><Digit d="7" /><Digit d="8" /><Digit d="9" /></Row>
      <Row>
        <Key plain onPress={onBiometric} label="Use biometrics">
          {onBiometric ? <Ionicons name="finger-print" size={28} color={C.primary} /> : null}
        </Key>
        <Digit d="0" />
        <Key plain onPress={pin.length ? back : undefined} label="Delete">
          <Ionicons name="backspace-outline" size={26} color={pin.length ? C.text : '#C4CBD2'} />
        </Key>
      </Row>
      {footer}
    </View>
  );
}
