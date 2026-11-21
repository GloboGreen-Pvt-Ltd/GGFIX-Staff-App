import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { BriefcaseBusiness, CalendarCheck, ClipboardList, Coins, IndianRupee, MapPin, Package } from 'lucide-react-native';
import { interFamily } from '../theme/typography';

/**
 * Employee-app boot screen, shown by RootNavigator while the stored session is
 * restored. Visuals only — it owns no session, timer or navigation logic.
 * Laid out on the 841×1870 brand mockup grid and scaled uniformly to the
 * screen; the logo tile and hero art are cut from that mockup (assets/).
 */
const DW = 841;
const DH = 1870;

const PAGE_BG = '#FFFFFF';
const TEAL = '#035C6C';
const CYAN = '#00B8C6';
const INK = '#181717';
const GREEN = '#057A2C';
const LIME = '#5BB531';
const TILE_BG = '#EAF8F5';

const font = (w) => {
  const f = interFamily(w);
  return f ? { fontFamily: f } : { fontWeight: String(w) };
};

const FEATURES = [
  { cx: 143, label: 'Attendance', render: (z) => <CalendarCheck size={z} color="#03917C" strokeWidth={2.2} /> },
  { cx: 335, label: 'Tasks', render: (z) => <ClipboardList size={z} color="#047F6B" strokeWidth={2.2} /> },
  {
    cx: 522,
    label: 'Pickup',
    render: (z) => (
      <View>
        <Package size={z} color="#0B6E7E" strokeWidth={2.1} />
        <View style={{ position: 'absolute', right: -z * 0.22, bottom: -z * 0.12, backgroundColor: TILE_BG, borderRadius: z }}>
          <MapPin size={z * 0.5} color="#16A34A" fill="#16A34A" strokeWidth={2} />
        </View>
      </View>
    ),
  },
  {
    cx: 708,
    label: 'Salary',
    render: (z) => (
      <View>
        <Coins size={z} color="#16A34A" strokeWidth={2.2} />
        <View style={{ position: 'absolute', right: -z * 0.16, top: -z * 0.14, backgroundColor: '#16A34A', borderRadius: z, padding: z * 0.05 }}>
          <IndianRupee size={z * 0.3} color="#FFFFFF" strokeWidth={3} />
        </View>
      </View>
    ),
  },
];

export default function BootSplash() {
  const { width: W, height: H } = useWindowDimensions();
  const s = Math.min(W / DW, H / DH);
  const fx = (W - DW * s) / 2;
  const fy = Math.max(0, (H - DH * s) / 2);
  const box = (x, y, w, h) => ({ position: 'absolute', left: x * s, top: y * s, width: w * s, height: h * s });
  const row = (cy, h) => ({ ...box(0, cy - h / 2, DW, h), alignItems: 'center', justifyContent: 'center' });
  const txt = (size, weight, color, extra) => ({
    ...font(weight), fontSize: size * s, lineHeight: size * 1.25 * s, color, includeFontPadding: false, ...extra,
  });

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const [dots, setDots] = useState(3);

  useEffect(() => {
    Animated.stagger(150, [
      Animated.timing(fade, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(rise, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    // Fills quickly over the minimum splash time, then creeps while a slow
    // session restore finishes — it never claims 100% before the app is ready.
    const fill = Animated.sequence([
      Animated.timing(bar, { toValue: 0.9, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(bar, { toValue: 0.98, duration: 6000, easing: Easing.linear, useNativeDriver: false }),
    ]);
    fill.start();
    const id = setInterval(() => setDots((d) => (d % 3) + 1), 400);
    return () => { fill.stop(); clearInterval(id); };
  }, [fade, rise, bar]);

  const pop = { opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] };
  const up = { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24 * s, 0] }) }] };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Blue header bowl with the lime swoosh under its right edge */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: fy + 1, backgroundColor: '#025C88' }} />
      <Svg pointerEvents="none" width={W} height={430 * s} viewBox="0 0 841 430" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: fy }}>
        <Defs>
          <SvgGradient id="hdr" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#025C88" />
            <Stop offset="0.45" stopColor="#016E9A" />
            <Stop offset="1" stopColor="#015784" />
          </SvgGradient>
          <SvgGradient id="lime" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#85C648" />
            <Stop offset="1" stopColor="#AFD735" />
          </SvgGradient>
        </Defs>
        <Path d="M0 0 H841 V230 C700 330 470 412 330 412 C200 412 60 300 0 170 Z" fill="url(#lime)" />
        <Path d="M0 0 H841 V177 C700 300 460 404 330 404 C200 404 60 300 0 167 Z" fill="url(#hdr)" />
      </Svg>

      {/* Faint city skyline along the bottom */}
      <Skyline width={W} height={230 * s} />

      {/* Mockup grid, scaled to the screen */}
      <View style={{ position: 'absolute', left: fx, top: fy, width: DW * s, height: DH * s }}>
        <Animated.View style={[box(282, 173, 277, 280), styles.tileShadow, { borderRadius: 56 * s }, pop]}>
          <Image source={require('../../assets/splash-tile.png')} style={{ width: '100%', height: '100%', borderRadius: 56 * s }} resizeMode="cover" />
        </Animated.View>

        <Animated.View style={[row(538, 130), pop]}>
          <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[txt(104, 900, TEAL, { letterSpacing: -2 * s }), { maxWidth: 680 * s }]}>
            NEAR G <Text style={{ color: CYAN }}>FIX</Text>
          </Text>
        </Animated.View>

        <Animated.View style={[row(615, 50), { flexDirection: 'row' }, pop]}>
          <View style={[styles.rule, { width: 95 * s, height: 3 * s }]} />
          <Text allowFontScaling={false} numberOfLines={1} style={[txt(33, 700, '#044C5B', { letterSpacing: 7 * s }), { marginHorizontal: 22 * s }]}>
            BY GLOBO GREEN
          </Text>
          <View style={[styles.rule, { width: 95 * s, height: 3 * s }]} />
        </Animated.View>

        <Animated.View style={[box(197, 668, 448, 75), { borderRadius: 38 * s, overflow: 'hidden' }, pop]}>
          <LinearGradient colors={['#035C6C', '#035C6C']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[StyleSheet.absoluteFill, styles.center, { flexDirection: 'row' }]}>
            <BriefcaseBusiness size={48 * s} color="#FFFFFF" strokeWidth={2.2} />
            <Text allowFontScaling={false} numberOfLines={1} style={[txt(33, 800, '#FFFFFF', { letterSpacing: 3.5 * s }), { marginLeft: 26 * s }]}>
              EMPLOYEE APP
            </Text>
          </LinearGradient>
        </Animated.View>

        <Animated.View style={[box(140, 758, 560, 474), up]}>
          <Image source={require('../../assets/splash-hero.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        </Animated.View>

        <Animated.View style={[box(0, 1235, DW, 160), { alignItems: 'center' }, up]}>
          <View style={{ alignItems: 'center', transform: [{ skewX: '-10deg' }] }}>
            <Text allowFontScaling={false} numberOfLines={1} style={txt(48, 900, INK, { letterSpacing: -0.5 * s })}>Manage Your Work</Text>
            <Text allowFontScaling={false} numberOfLines={1} style={[txt(52, 900, GREEN, { letterSpacing: -0.5 * s }), { marginTop: 2 * s }]}>On The Go</Text>
          </View>
          <Svg width={260 * s} height={34 * s} viewBox="0 0 260 34" style={{ marginTop: -4 * s, marginLeft: 20 * s }}>
            <Path d="M4 30 C70 14 160 8 256 10 C160 14 80 20 4 30 Z" fill={LIME} stroke={LIME} strokeWidth={4} strokeLinejoin="round" />
          </Svg>
        </Animated.View>

        {FEATURES.map((f) => (
          <Animated.View key={f.label} style={[box(f.cx - 95, 1420, 190, 150), { alignItems: 'center' }, up]}>
            <View style={[styles.center, { width: 116 * s, height: 100 * s, borderRadius: 26 * s, backgroundColor: TILE_BG }]}>
              {f.render(56 * s)}
            </View>
            <Text allowFontScaling={false} numberOfLines={1} style={[txt(27, 700, '#111111'), { marginTop: 10 * s }]}>{f.label}</Text>
          </Animated.View>
        ))}
        {[240, 429, 616].map((x) => (
          <View key={x} style={[box(x - 1, 1440, 2, 80), { backgroundColor: '#E2ECEC' }]} />
        ))}

        <View style={[box(150, 1630, 540, 22), { borderRadius: 11 * s, backgroundColor: '#DFDEDE', overflow: 'hidden' }]}>
          <Animated.View style={{ height: '100%', borderRadius: 11 * s, overflow: 'hidden', width: bar.interpolate({ inputRange: [0, 1], outputRange: [0, 540 * s] }) }}>
            <LinearGradient colors={['#00BFCB', '#0193A3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </Animated.View>
        </View>

        <View style={row(1690, 50)}>
          <Text allowFontScaling={false} style={txt(30, 600, '#3F4448')}>
            Loading{'.'.repeat(dots)}
            <Text style={{ color: 'transparent' }}>{'.'.repeat(3 - dots)}</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

// Faint city skyline pinned to the bottom of a screen (also used by Login).
export function Skyline({ width, height }) {
  return (
    <Svg pointerEvents="none" width={width} height={height} viewBox="0 0 841 230" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: 0 }}>
      <Path
        fill="#E3F1F3"
        fillOpacity={0.75}
        d="M0 230 V150 H40 V110 H70 V150 H95 V90 H140 V160 H170 V120 H205 V170 H240 V140 H270 V190 H570 V140 H600 V100 H640 V150 H670 V70 H710 V130 H735 V95 H770 V150 H800 V115 H841 V230 Z"
      />
      <Rect x="0" y="200" width="841" height="30" fill="#EBF6F7" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  center: { alignItems: 'center', justifyContent: 'center' },
  rule: { backgroundColor: '#BEC7C9', borderRadius: 2 },
  tileShadow: {
    backgroundColor: '#035C6C',
    shadowColor: '#7FE3F0', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
});
