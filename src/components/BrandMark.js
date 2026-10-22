import React from 'react';
import { Image, View } from 'react-native';
import { Text } from './Typography';
import { rf, rs } from '../utils/responsive';

// Near G Fix logo roundel + "Near G Fix" wordmark + "BY GLOBO GREEN" byline, used on the
// light auth / gate screens. `services` adds the "A • B • C" line under it.
export default function BrandMark({ size = 84, services, style }) {
  const s = rs(size);
  return (
    <View style={[{ alignItems: 'center' }, style]}>
      {/* The PNG is a teal roundel on a white square — clip it to a circle. */}
      <View style={{
        width: s, height: s, borderRadius: s / 2, overflow: 'hidden', backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#024A57', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
      }}>
        <Image source={require('../../assets/logo.png')} style={{ width: s * 1.04, height: s * 1.04 }} resizeMode="contain" />
      </View>
      <Text style={{ fontSize: rf(size * 0.44), fontWeight: '900', color: '#111111', letterSpacing: -0.5, marginTop: rs(8) }}>
        NEAR G <Text style={{ color: '#035C6C' }}>FIX</Text>
      </Text>
      <Text style={{ fontSize: rf(12), fontWeight: '700', color: '#6B7280', letterSpacing: 2.6, marginTop: rs(1) }}>BY GLOBO GREEN</Text>
      {services ? (
        <Text style={{ fontSize: rf(13.5), fontWeight: '600', color: '#6B7280', marginTop: rs(10) }}>
          {services.map((label, i) => (
            <Text key={label}>
              {i > 0 ? <Text style={{ color: '#035C6C', fontWeight: '900' }}>{'  •  '}</Text> : null}
              {label}
            </Text>
          ))}
        </Text>
      ) : null}
    </View>
  );
}
