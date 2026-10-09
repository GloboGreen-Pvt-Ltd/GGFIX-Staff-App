import React, { useLayoutEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { rf, rs } from '../utils/responsive';

// In-screen header for the mint-styled attendance screens: soft circular back
// button, centred title, and faint mint curves in the top-right corner. The
// screen hides the stack's native header for itself only (see
// useHideNativeHeader), so the navigator's shared options stay untouched.
// Back behaviour mirrors the navigator's headerLeft: shown only when the stack
// can go back, and it simply calls goBack().

export function useHideNativeHeader(navigation) {
  useLayoutEffect(() => {
    navigation?.setOptions?.({ headerShown: false });
  }, [navigation]);
}

export function MintBackdrop() {
  const big = rs(260);
  const small = rs(170);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: rs(220), overflow: 'hidden' }}>
      <View style={{ position: 'absolute', top: -big * 0.55, right: -big * 0.35, width: big, height: big, borderRadius: big / 2, backgroundColor: '#ECF8EE' }} />
      <View style={{ position: 'absolute', top: -small * 0.45, right: -small * 0.2, width: small, height: small, borderRadius: small / 2, backgroundColor: '#E1F4E5', opacity: 0.7 }} />
    </View>
  );
}

export default function MintScreenHeader({ title, navigation }) {
  const size = rs(42);
  const canGoBack = navigation?.canGoBack?.();
  return (
    <View className="flex-row items-center" style={{ paddingHorizontal: rs(16), paddingTop: rs(4), paddingBottom: rs(6) }}>
      <View style={{ width: size }}>
        {canGoBack ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            activeOpacity={0.6}
            style={{
              width: size, height: size, borderRadius: size / 2, backgroundColor: '#F3FBF4',
              borderWidth: 1, borderColor: '#E1F3E5', alignItems: 'center', justifyContent: 'center',
              shadowColor: '#1E1E1E', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
            }}
          >
            <ChevronLeft size={rs(22)} color="#1E1E1E" strokeWidth={2.4} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Text
        className="flex-1 text-center font-extrabold"
        style={{ fontSize: rf(18), color: '#1E1E1E', marginHorizontal: rs(8) }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {title}
      </Text>
      <View style={{ width: size }} />
    </View>
  );
}
