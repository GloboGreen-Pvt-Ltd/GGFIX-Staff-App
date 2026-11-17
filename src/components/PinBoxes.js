import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { TextInput } from './Typography';
import { rf } from '../utils/responsive';

const TEAL = '#035C6C';
const RED = '#F32C26';

/**
 * Four separate 44×44 digit boxes for a customer PIN / OTP. Numeric keypad,
 * auto-advance, backspace to the previous box, paste of the whole code into
 * any box. `value` / `onChange` carry the digits only (string). Pure input —
 * verification stays with the caller's server call.
 */
export default function PinBoxes({ value = '', onChange, length = 4, autoFocus = false, error = false, accessibilityLabel = 'PIN', style }) {
  const refs = useRef([]);
  const [focus, setFocus] = useState(autoFocus ? 0 : -1);
  const digits = String(value || '').replace(/\D/g, '').slice(0, length);

  useEffect(() => { if (autoFocus) setTimeout(() => refs.current[0]?.focus(), 250); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (i, t) => {
    const clean = String(t || '').replace(/\D/g, '');
    if (clean.length > 1) { // paste (or SMS autofill) — fill from this box
      const next = (digits.slice(0, i) + clean).slice(0, length);
      onChange(next);
      refs.current[Math.min(next.length, length - 1)]?.focus();
      return;
    }
    const arr = digits.padEnd(length, ' ').split('');
    arr[i] = clean || ' ';
    const next = arr.join('').replace(/\s+$/, '').replace(/\s/g, '');
    onChange(next);
    if (clean && i < length - 1) refs.current[i + 1]?.focus();
  };
  const key = (i, e) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[i] && i > 0) {
      onChange(digits.slice(0, i - 1));
      refs.current[i - 1]?.focus();
    }
  };

  return (
    <View accessibilityLabel={accessibilityLabel} style={[{ flexDirection: 'row', justifyContent: 'center', gap: 12 }, style]}>
      {Array.from({ length }).map((_, i) => (
        <TextInput
          key={i}
          ref={(r) => { refs.current[i] = r; }}
          value={digits[i] || ''}
          onChangeText={(t) => set(i, t)}
          onKeyPress={(e) => key(i, e)}
          onFocus={() => setFocus(i)}
          onBlur={() => setFocus((f) => (f === i ? -1 : f))}
          keyboardType="number-pad"
          textContentType={i === 0 ? 'oneTimeCode' : 'none'}
          autoComplete={i === 0 ? 'sms-otp' : 'off'}
          maxLength={i === 0 ? length : 1}
          selectTextOnFocus
          accessibilityLabel={`${accessibilityLabel} digit ${i + 1}`}
          style={{
            width: 44, height: 44, borderRadius: 10, textAlign: 'center', fontSize: rf(18), fontWeight: '800', color: '#111111',
            borderWidth: focus === i ? 2 : 1.2, borderColor: error ? RED : focus === i ? TEAL : '#C9CED6', backgroundColor: '#FFFFFF', padding: 0,
          }}
        />
      ))}
    </View>
  );
}
