import React from 'react';
import { Image, Text, View } from 'react-native';
import { rf, rs } from '../utils/responsive';

// GGFIX logo roundel + "GGFIX" wordmark + "BY GLOBO GREEN" byline, used on the
// light auth / gate screens. `services` adds the "A • B • C" line under it.
export default function BrandMark({ size = 84, services, style }) {
  const s = rs(size);
  return (
    <View style={[{ alignItems: 'center' }, style]}>
      {/* The PNG is a teal roundel on a white square — clip it to a circle. */}
      <View style={{
        width: s, height: s, borderRadius: s / 2, overflow: 'hidden', backgroundColor: '#FFFFFF',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#07662A', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
      }}>
        <Image source={require('../../assets/logo.png')} style={{ width: s * 1.04, height: s * 1.04 }} resizeMode="contain" />
      </View>
      <Text style={{ fontSize: rf(size * 0.44), fontWeight: '900', color: '#1E1E1E', letterSpacing: -0.5, marginTop: rs(8) }}>
        GG<Text style={{ color: '#09AD2A' }}>FIX</Text>
      </Text>
      <Text style={{ fontSize: rf(12), fontWeight: '700', color: '#4A4A4A', letterSpacing: 2.6, marginTop: rs(1) }}>BY GLOBO GREEN</Text>
      {services ? (
        <Text style={{ fontSize: rf(13.5), fontWeight: '600', color: '#4A4A4A', marginTop: rs(10) }}>
          {services.map((label, i) => (
            <Text key={label}>
              {i > 0 ? <Text style={{ color: '#09AD2A', fontWeight: '900' }}>{'  •  '}</Text> : null}
              {label}
            </Text>
          ))}
        </Text>
      ) : null}
    </View>
  );
}
