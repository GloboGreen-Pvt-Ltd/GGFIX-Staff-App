import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { ClipboardCheck, Fingerprint, ShieldCheck } from 'lucide-react-native';
import { rf, rs } from '../utils/responsive';

/**
 * Employee-app boot screen, shown by RootNavigator while the stored session is
 * restored. Visuals only — it owns no session, timer or navigation logic.
 * Layout follows the GGFIX brand splash: a deep-green header that curves into
 * a light page, device hero art across the curve, tagline, progress and a
 * trust row. Device art comes from the CDN so it can change without a release.
 */
const DEVICE_URL = 'https://media.ggfix.in/GGFIX-Partner-App/Device.png';

// Warm the image cache as soon as this module loads (best-effort, never blocks).
Image.prefetch(DEVICE_URL).catch(() => {});

const PAGE_BG = '#F8F8F8';
const GREEN = '#09AD2A';
const GREEN_BRIGHT = '#3BE07A'; // "FIX" + ring on the dark header
const GREEN_DEEP = '#07662A';
const YELLOW = '#F3BF23';
const INK = '#1E1E1E';
const MINT = '#E6F7EA';

const tierFor = (h) => (h < 700 ? 0 : h < 850 ? 1 : 2);

function TrustItem({ icon: Icon, label, size, font }) {
  return (
    <View style={styles.trustItem}>
      <View style={[styles.trustDisc, { width: size, height: size, borderRadius: size / 2 }]}>
        <Icon size={size * 0.48} color={GREEN} strokeWidth={2.2} />
      </View>
      <Text style={[styles.trustLabel, { fontSize: font, lineHeight: font * 1.3 }]}>{label}</Text>
    </View>
  );
}

export default function BootSplash() {
  const { width, height } = useWindowDimensions();
  const t = tierFor(height);
  const pick = (a, b, c) => [a, b, c][t];
  const contentW = Math.min(width, 460);

  const logo = rs(pick(78, 90, 100));
  const titleFont = rf(pick(40, 46, 52));
  const headerH = height * pick(0.5, 0.48, 0.47);
  const [ratio, setRatio] = useState(0.62);
  const deviceW = Math.min(contentW * 0.86, (height * pick(0.2, 0.23, 0.25)) / ratio);

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.stagger(160, [
      Animated.timing(fade, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(rise, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.timing(bar, { toValue: 1, duration: 1200, delay: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.5, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [fade, rise, bar, glow]);

  // Curved bottom edge of the green header (drawn in page colour on top of it).
  const curve = `M0 ${headerH * 0.78} C${width * 0.28} ${headerH * 0.98} ${width * 0.62} ${headerH * 0.7} ${width} ${headerH * 0.86} L${width} ${headerH + 2} L0 ${headerH + 2} Z`;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Green header with soft light swirls and a curved edge */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: headerH }}>
        <LinearGradient colors={[GREEN_DEEP, '#0A8A36', '#10A548']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Svg width={width} height={headerH + 2} style={StyleSheet.absoluteFill}>
          <Circle cx={width * 0.95} cy={headerH * 0.05} r={width * 0.32} fill="#FFFFFF" fillOpacity={0.05} stroke="#FFFFFF" strokeOpacity={0.18} strokeWidth={1} />
          <Circle cx={-width * 0.1} cy={headerH * 0.62} r={width * 0.42} fill="#FFFFFF" fillOpacity={0.05} />
          <Circle cx={width * 1.02} cy={headerH * 0.7} r={width * 0.3} fill="#FFFFFF" fillOpacity={0.06} />
          <Path d={curve} fill={PAGE_BG} />
        </Svg>
      </View>

      {/* Soft mint waves grounding the footer */}
      <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
        <Path d={`M0 ${height * 0.9} C${width * 0.35} ${height * 0.85} ${width * 0.65} ${height * 0.95} ${width} ${height * 0.88} L${width} ${height} L0 ${height} Z`} fill={MINT} fillOpacity={0.7} />
      </Svg>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.content, { maxWidth: contentW }]}>
          <Animated.View style={{ alignItems: 'center', opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
            {/* Logo in a glowing ring */}
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={[styles.glow, { width: logo + rs(34), height: logo + rs(34), borderRadius: (logo + rs(34)) / 2, opacity: glow }]} />
              <View style={[styles.ring, { width: logo + rs(14), height: logo + rs(14), borderRadius: (logo + rs(14)) / 2 }]}>
                <View style={{ width: logo, height: logo, borderRadius: logo / 2, overflow: 'hidden', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={require('../../assets/logo.png')} style={{ width: logo * 1.04, height: logo * 1.04 }} resizeMode="contain" />
                </View>
              </View>
            </View>

            <Text style={[styles.wordmark, { fontSize: titleFont, marginTop: rs(pick(10, 14, 16)) }]}>
              GG<Text style={{ color: GREEN_BRIGHT }}>FIX</Text>
            </Text>
            <Text style={[styles.byline, { fontSize: rf(pick(13, 14, 15)) }]}>BY GLOBO GREEN</Text>
            <View style={[styles.appChip, { marginTop: rs(pick(6, 8, 10)) }]}>
              <Text style={styles.appChipText}>EMPLOYEE APP</Text>
            </View>
            <Text style={[styles.services, { fontSize: rf(pick(14, 15, 16)), marginTop: rs(pick(6, 8, 10)) }]}>
              Attendance <Text style={styles.dot}>•</Text> Tasks <Text style={styles.dot}>•</Text> Pickup <Text style={styles.dot}>•</Text> Salary
            </Text>
          </Animated.View>

          {/* Device hero art across the curve */}
          <Animated.View
            style={{
              width: deviceW, aspectRatio: 1 / ratio, marginTop: rs(pick(8, 14, 18)),
              opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            }}
          >
            <Image
              source={{ uri: DEVICE_URL }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
              onLoad={(e) => {
                const { width: w, height: h } = e?.nativeEvent?.source || {};
                if (w > 0 && h > 0) setRatio(h / w);
              }}
            />
          </Animated.View>

          {/* Tagline */}
          <View style={{ alignItems: 'center', marginTop: rs(pick(8, 12, 16)) }}>
            <Text style={[styles.tagline, { fontSize: rf(pick(22, 25, 28)) }]}>YOUR WORKDAY,</Text>
            <Text style={[styles.tagline, { fontSize: rf(pick(22, 25, 28)), color: GREEN }]}>SIMPLIFIED.</Text>
            <Svg width={rs(150)} height={rs(10)} style={{ marginTop: -rs(2) }}>
              <Path d={`M4 ${rs(7)} Q${rs(75)} ${rs(1)} ${rs(146)} ${rs(6)}`} stroke={YELLOW} strokeWidth={3.5} strokeLinecap="round" fill="none" />
            </Svg>
          </View>

          {/* Progress */}
          <View style={{ width: Math.min(contentW * 0.66, rs(270)), marginTop: rs(pick(12, 18, 22)), alignItems: 'center' }}>
            <View style={styles.track}>
              <Animated.View style={{ height: '100%', borderRadius: 999, overflow: 'hidden', width: bar.interpolate({ inputRange: [0, 1], outputRange: ['4%', '72%'] }) }}>
                <LinearGradient colors={['#1DC94A', GREEN]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
              </Animated.View>
            </View>
            <Text style={styles.loading}>LOADING...</Text>
          </View>

          {/* Trust row */}
          <View style={[styles.trustRow, { marginTop: rs(pick(14, 20, 26)) }]}>
            <TrustItem icon={Fingerprint} label={'SMART\nATTENDANCE'} size={rs(pick(44, 50, 54))} font={rf(pick(11, 12, 12.5))} />
            <View style={styles.divider} />
            <TrustItem icon={ClipboardCheck} label={'TASK\nTRACKING'} size={rs(pick(44, 50, 54))} font={rf(pick(11, 12, 12.5))} />
            <View style={styles.divider} />
            <TrustItem icon={ShieldCheck} label={'SECURE\n& PRIVATE'} size={rs(pick(44, 50, 54))} font={rf(pick(11, 12, 12.5))} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', alignItems: 'center', paddingHorizontal: rs(20) },
  glow: { position: 'absolute', backgroundColor: GREEN_BRIGHT, opacity: 0.35 },
  ring: {
    alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: GREEN_BRIGHT,
    backgroundColor: 'rgba(255,255,255,0.12)',
    shadowColor: GREEN_BRIGHT, shadowOpacity: 0.8, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  wordmark: { fontWeight: '900', letterSpacing: -0.5, color: '#FFFFFF' },
  byline: { fontWeight: '700', letterSpacing: 3, color: '#FFFFFF', marginTop: rs(2) },
  appChip: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: rs(12), paddingVertical: rs(3) },
  appChipText: { fontSize: rf(11), fontWeight: '800', letterSpacing: 1.6, color: '#FFFFFF' },
  services: { fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },
  dot: { color: YELLOW, fontWeight: '900' },
  tagline: { textAlign: 'center', fontWeight: '900', letterSpacing: 0.6, color: INK },
  track: {
    width: '100%', height: rs(12), borderRadius: 999, backgroundColor: '#FFFFFF', padding: rs(2),
    borderWidth: 1, borderColor: '#ECECEC',
    shadowColor: INK, shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  loading: { fontSize: rf(13), fontWeight: '700', letterSpacing: 5, color: '#4A4A4A', marginTop: rs(10) },
  trustRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', width: '100%' },
  trustItem: { flex: 1, alignItems: 'center', maxWidth: rs(120) },
  trustDisc: { backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' },
  trustLabel: { textAlign: 'center', fontWeight: '800', color: INK, marginTop: rs(7) },
  divider: { width: 1, height: rs(46), backgroundColor: '#E2E2E2', marginTop: rs(6) },
});
