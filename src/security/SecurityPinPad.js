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

  const Key = ({ children, onPress, label }) => (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 72, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? C.tint : 'transparent',
      })}
    >
      {children}
    </Pressable>
  );

  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      {title ? <Text style={{ fontSize: 17, fontWeight: '800', color: C.text }}>{title}</Text> : null}
      {subtitle ? <Text style={{ fontSize: 12.5, color: C.muted, marginTop: 4, textAlign: 'center' }}>{subtitle}</Text> : null}
      <View style={{ flexDirection: 'row', marginTop: 18, marginBottom: 6 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={{
              width: 14, height: 14, borderRadius: 7, marginHorizontal: 7,
              borderWidth: 1.5, borderColor: error ? C.error : C.primary,
              backgroundColor: i < pin.length ? (error ? C.error : C.primary) : 'transparent',
            }}
          />
        ))}
      </View>
      <View style={{ height: 20, justifyContent: 'center' }}>
        {busy ? <ActivityIndicator size="small" color={C.primary} />
          : error ? <Text style={{ color: C.error, fontSize: 12, fontWeight: '600' }}>{error}</Text> : null}
      </View>
      <View style={{ width: 240, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 4 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onPress={() => press(d)} label={d}>
            <Text style={{ fontSize: 22, fontWeight: '600', color: C.text }}>{d}</Text>
          </Key>
        ))}
        <Key onPress={onBiometric} label="Biometric">
          {onBiometric ? <Ionicons name="finger-print" size={26} color={C.primary} /> : null}
        </Key>
        <Key onPress={() => press('0')} label="0">
          <Text style={{ fontSize: 22, fontWeight: '600', color: C.text }}>0</Text>
        </Key>
        <Key onPress={back} label="Delete">
          <Ionicons name="backspace-outline" size={24} color={C.text} />
        </Key>
      </View>
      {footer}
    </View>
  );
}
