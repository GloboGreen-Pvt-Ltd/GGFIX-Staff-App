// Drop-in replacements for react-native's Text / TextInput that apply the Inter
// family (by fontWeight) and snap font sizes onto the app type scale.
import React, { forwardRef } from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet } from 'react-native';
import { cssInterop } from 'nativewind';
import { interFamily, snapFontSize } from '../theme/typography';

function normalize(style) {
  const flat = StyleSheet.flatten(style) || {};
  // Web: nativewind className styles arrive as compiled-CSS objects ($$css);
  // flattening those into inline numbers breaks react-native-web, so leave them.
  if (flat.$$css) return style;
  // Nested spans like <Text style={{ color }}>FIX</Text> must inherit the
  // parent's size/weight/family — don't stamp defaults onto them.
  if (flat.fontSize == null && flat.fontWeight == null && flat.fontFamily == null) return style;
  const { fontWeight, fontFamily, fontSize, lineHeight, ...rest } = flat;
  const size = snapFontSize(fontSize ?? 13);
  const out = { ...rest, fontFamily: fontFamily && !fontFamily.startsWith('Inter') ? fontFamily : interFamily(fontWeight), fontSize: size };
  // Keep line heights proportional when the size was snapped.
  if (lineHeight != null) out.lineHeight = fontSize ? Math.round(lineHeight * (size / fontSize)) : lineHeight;
  return out;
}

export const Text = forwardRef(({ style, ...props }, ref) => (
  <RNText ref={ref} {...props} style={normalize(style)} />
));
Text.displayName = 'Text';

export const TextInput = forwardRef(({ style, ...props }, ref) => (
  <RNTextInput ref={ref} {...props} style={normalize(style)} />
));
TextInput.displayName = 'TextInput';

// Resolve nativewind className (e.g. "font-bold text-sm") into `style` before
// normalize() runs, so Tailwind weights map to Inter too.
cssInterop(Text, { className: 'style' });
cssInterop(TextInput, { className: 'style' });
