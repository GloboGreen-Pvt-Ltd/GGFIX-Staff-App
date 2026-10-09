import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  LockKeyhole, RefreshCw, LogOut, MapPin, ShieldCheck, ShoppingCart, Smartphone, Store, Users, Wrench,
} from 'lucide-react-native';
import BrandMark from './BrandMark';
import { useDispatch } from 'react-redux';
import { getMyTechnicianProfile } from '../api/technician';
import { mergeTechnicianProfile } from '../store/authSlice';
import { readCurrentLocation, haversineMeters, GEOFENCE_RADIUS_METERS } from '../utils/geo';
import { rf, rs } from '../utils/responsive';

// Full-screen attendance geofence. Rendered right after login (wraps the whole
// authenticated app): the employee can only use the app while physically within
// GEOFENCE_RADIUS_METERS of their shop. Out of range → a blocking lock screen.
//
// Fail-open cases (render the app rather than trap the user):
//   * the shop has no saved coordinates, or
//   * the profile/GPS lookup errors in a way that isn't "you're too far".
// The server still geofences the actual check-in / check-out punch, so a lenient
// lock screen never lets an out-of-range punch through.

const RECHECK_MS = 12_000; // auto re-check cadence while locked

export default function GeofenceGate({ onLogout, children }) {
  const dispatch = useDispatch();
  // 'checking' | 'inside' | 'outside' | 'denied' | 'error'
  const [status, setStatus] = useState('checking');
  const [distance, setDistance] = useState(null);
  const [message, setMessage] = useState('');
  const mountedRef = useRef(true);
  // null = shop coords not resolved yet; false = shop has none (fail open);
  // { latitude, longitude } = enforce against these.
  const shopRef = useRef(null);
  const runningRef = useRef(false);

  const runCheck = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      // 1. Resolve the shop's coordinates once. Any failure fails OPEN.
      if (shopRef.current === null) {
        try {
          const me = await getMyTechnicianProfile();
          dispatch(mergeTechnicianProfile(me));
          if (me?.shopLatitude != null && me?.shopLongitude != null) {
            shopRef.current = {
              latitude: Number(me.shopLatitude),
              longitude: Number(me.shopLongitude),
            };
          } else {
            shopRef.current = false; // shop has no coordinates
          }
        } catch (_) {
          if (mountedRef.current) setStatus('inside'); // network blip → don't trap
          return;
        }
      }
      if (shopRef.current === false) {
        if (mountedRef.current) setStatus('inside');
        return;
      }

      // 2. Read GPS and compare against the shop.
      let pos;
      try {
        pos = await readCurrentLocation();
      } catch (e) {
        if (!mountedRef.current) return;
        // GPS permission-denied or a transient read error → fail OPEN (render the
        // app) instead of trapping an on-site employee behind a full-screen lock.
        // This matches this gate's documented intent, and the server still
        // geofences the actual check-in / check-out punch, so an out-of-range
        // punch can never slip through even while the app is usable.
        setStatus('inside');
        return;
      }
      const meters = haversineMeters(
        pos.latitude, pos.longitude,
        shopRef.current.latitude, shopRef.current.longitude,
      );
      const rounded = Math.round(meters);
      if (!mountedRef.current) return;
      setDistance(rounded);
      // Compare the ROUNDED distance (the value shown to the user), not the raw
      // float — otherwise 100.4m locks while the pill reads "100m away · limit
      // 100m", which looks like a bug. The server still geofences the actual
      // punch, so this sub-metre leniency can't let an out-of-range punch through.
      if (rounded > GEOFENCE_RADIUS_METERS) {
        setStatus('outside');
        setMessage(`You are ${rounded}m from the shop. Move within ${GEOFENCE_RADIUS_METERS}m to unlock.`);
      } else {
        setStatus('inside');
      }
    } finally {
      runningRef.current = false;
    }
  }, [dispatch]);

  // Initial check right after login.
  useEffect(() => {
    mountedRef.current = true;
    runCheck();
    return () => { mountedRef.current = false; };
  }, [runCheck]);

  // Re-check when the app comes back to the foreground (they may have moved).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') runCheck(); });
    return () => sub.remove();
  }, [runCheck]);

  // While locked, poll so arriving at the shop auto-unlocks without a tap.
  useEffect(() => {
    if (status === 'inside' || status === 'checking') return undefined;
    const id = setInterval(runCheck, RECHECK_MS);
    return () => clearInterval(id);
  }, [status, runCheck]);

  if (status === 'inside') return children;

  const retry = () => { setStatus('checking'); runCheck(); };
  return (
    <GateView
      checking={status === 'checking'}
      message={message}
      distance={status === 'outside' ? distance : null}
      onRetry={retry}
      onLogout={onLogout}
    />
  );
}

/* ----------------------------------------------------------------- visuals */

const GREEN = '#09AD2A';
const INK = '#1E1E1E';
const MUTED = '#6E6E6E';
const RED = '#F84141';

// Soft green shapes in the corners — decorative only.
function GateBackdrop({ width, height }) {
  return (
    <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
      <Circle cx={width * 1.02} cy={height * 0.03} r={width * 0.32} fill="#DDF4E2" />
      <Circle cx={-width * 0.12} cy={height * 0.3} r={width * 0.26} fill="#EAF8EC" />
      <Circle cx={-width * 0.05} cy={height * 1.0} r={width * 0.3} fill="#CDEFD3" />
      <Circle cx={width * 1.05} cy={height * 0.98} r={width * 0.28} fill="#CDEFD3" />
      <Circle cx={width * 0.9} cy={height * 0.25} r={6} fill="#BDEBC6" />
    </Svg>
  );
}

// Map tile with a pulsing pin and four orbiting service badges.
function LocationArt({ size, locked, pulse }) {
  const W = size;
  const H = size * 0.72;
  const cx = W / 2;
  const cy = H * 0.52;
  const pin = W * 0.22;
  const pinColor = locked ? RED : GREEN;
  const badge = W * 0.15;
  const Badge = ({ x, y, bg, children }) => (
    <View style={{
      position: 'absolute', left: x - badge / 2, top: y - badge / 2, width: badge, height: badge, borderRadius: badge / 2,
      backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF',
      shadowColor: INK, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    }}>
      {children}
    </View>
  );
  return (
    <View style={{ width: W, height: H }}>
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        {/* faint street grid */}
        {[0.18, 0.4, 0.62, 0.84].map((f) => (
          <Path key={`h${f}`} d={`M${W * 0.05} ${H * f} L${W * 0.95} ${H * (f - 0.08)}`} stroke="#E7EEE8" strokeWidth={6} strokeLinecap="round" />
        ))}
        {[0.2, 0.45, 0.7].map((f) => (
          <Path key={`v${f}`} d={`M${W * f} ${H * 0.05} L${W * (f + 0.1)} ${H * 0.95}`} stroke="#EEF3EF" strokeWidth={5} strokeLinecap="round" />
        ))}
        {/* orbit */}
        <Ellipse cx={cx} cy={cy} rx={W * 0.36} ry={H * 0.4} fill="none" stroke={pinColor} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="5 6" />
        {/* ground rings */}
        <Ellipse cx={cx} cy={cy + pin * 0.55} rx={W * 0.2} ry={W * 0.07} fill={pinColor} fillOpacity={0.1} />
        <Ellipse cx={cx} cy={cy + pin * 0.55} rx={W * 0.13} ry={W * 0.045} fill={pinColor} fillOpacity={0.16} stroke="#FFFFFF" strokeWidth={2} />
      </Svg>
      {/* pulsing halo */}
      <Animated.View style={{
        position: 'absolute', left: cx - W * 0.17, top: cy + pin * 0.55 - W * 0.06, width: W * 0.34, height: W * 0.12,
        borderRadius: W, backgroundColor: pinColor, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) }],
      }} />
      {/* pin */}
      <Svg width={pin} height={pin * 1.3} viewBox="0 0 24 31" style={{ position: 'absolute', left: cx - pin / 2, top: cy - pin * 0.85 }}>
        <Path d="M12 0C5.4 0 0 5.3 0 11.8 0 20.6 12 31 12 31s12-10.4 12-19.2C24 5.3 18.6 0 12 0z" fill={pinColor} />
        <Path d="M12 0C5.4 0 0 5.3 0 11.8c0 1.8.5 3.6 1.3 5.4C3 9 7 4 12 4s9 5 10.7 13.2c.8-1.8 1.3-3.6 1.3-5.4C24 5.3 18.6 0 12 0z" fill="#FFFFFF" fillOpacity={0.18} />
        <Circle cx={12} cy={11.5} r={5} fill="#FFFFFF" />
      </Svg>
      {/* orbit badges */}
      <Badge x={cx - W * 0.3} y={cy - H * 0.3} bg="#E6F7EA"><Store size={badge * 0.45} color={GREEN} strokeWidth={2.2} /></Badge>
      <Badge x={cx + W * 0.27} y={cy - H * 0.34} bg="#FDF6E0"><Smartphone size={badge * 0.45} color="#C99500" strokeWidth={2.2} /></Badge>
      <Badge x={cx - W * 0.36} y={cy + H * 0.12} bg="#FEECEC"><Wrench size={badge * 0.45} color={RED} strokeWidth={2.2} /></Badge>
      <Badge x={cx + W * 0.34} y={cy + H * 0.2} bg={INK}><ShoppingCart size={badge * 0.45} color="#FFFFFF" strokeWidth={2.2} /></Badge>
      {locked ? (
        <View style={{ position: 'absolute', left: cx + pin * 0.25, top: cy - pin * 0.95, width: pin * 0.5, height: pin * 0.5, borderRadius: pin, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 3 }}>
          <LockKeyhole size={pin * 0.28} color={RED} strokeWidth={2.4} />
        </View>
      ) : null}
    </View>
  );
}

function TrustCard({ icon: Icon, title, sub }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: rs(10), paddingHorizontal: rs(4) }}>
      <View style={{ width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: '#E6F7EA', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={rs(19)} color={GREEN} strokeWidth={2.2} />
      </View>
      <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: INK, marginTop: rs(6) }} numberOfLines={1}>{title}</Text>
      <Text style={{ fontSize: rf(10.5), color: MUTED, marginTop: 1, textAlign: 'center' }} numberOfLines={2}>{sub}</Text>
    </View>
  );
}

function GateView({ checking, message, distance, onRetry, onLogout }) {
  const { width, height } = useWindowDimensions();
  const contentW = Math.min(width, 460) - rs(36);
  const short = height < 720;
  const pulse = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const p = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    p.start();
    // Indeterminate progress: sweep 15% → 85% and back while checking.
    const b = Animated.loop(Animated.sequence([
      Animated.timing(bar, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(bar, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    if (checking) b.start();
    return () => { p.stop(); b.stop(); };
  }, [pulse, bar, checking]);

  const fillW = bar.interpolate({ inputRange: [0, 1], outputRange: ['15%', '85%'] });

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F8F8' }}>
      <GateBackdrop width={width} height={height} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: rs(12) }} showsVerticalScrollIndicator={false}>
          <View style={{ width: contentW, alignItems: 'center' }}>
            <BrandMark size={short ? 70 : 84} services={['Attendance', 'Tasks', 'Pickup']} />

            <View style={{ marginTop: rs(short ? 6 : 12) }}>
              <LocationArt size={Math.min(contentW, rs(short ? 270 : 320))} locked={!checking} pulse={pulse} />
            </View>

            {checking ? (
              <>
                <Text style={styles.title}>
                  Checking <Text style={{ color: GREEN }}>your location...</Text>
                </Text>
                <Text style={styles.sub}>Confirming you’re at the shop.</Text>
                <View style={styles.track}>
                  <Animated.View style={[styles.fill, { width: fillW }]} />
                  <Animated.View style={[styles.knob, { left: fillW }]} />
                </View>
                <Text style={styles.hint}>Please wait, this may take a few seconds.</Text>
              </>
            ) : (
              <>
                <Text style={styles.title}>
                  You’re <Text style={{ color: RED }}>away from the shop</Text>
                </Text>
                <Text style={styles.sub}>{message}</Text>
                {distance != null ? (
                  <View style={styles.distancePill}>
                    <MapPin size={rs(13)} color={RED} />
                    <Text style={styles.distanceText}>{distance}m away · limit {GEOFENCE_RADIUS_METERS}m</Text>
                  </View>
                ) : null}
                <TouchableOpacity onPress={onRetry} activeOpacity={0.85} style={styles.retryBtn}>
                  <RefreshCw size={rs(16)} color="#FFFFFF" />
                  <Text style={styles.retryText}>CHECK AGAIN</Text>
                </TouchableOpacity>
                <Text style={styles.hint}>Unlocks automatically when you reach the shop.</Text>
              </>
            )}

            <View style={styles.trustCard}>
              <TrustCard icon={ShieldCheck} title="Secure" sub="Trusted service" />
              <View style={styles.trustDivider} />
              <TrustCard icon={MapPin} title="Geo-verified" sub={`Within ${GEOFENCE_RADIUS_METERS}m of shop`} />
              <View style={styles.trustDivider} />
              <TrustCard icon={Users} title="Pan India" sub="Service network" />
            </View>

            {/* Escape hatch — the employee can always sign out from this screen. */}
            <TouchableOpacity onPress={onLogout} hitSlop={10} activeOpacity={0.7} style={styles.logout}>
              <LogOut size={rs(15)} color={MUTED} />
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: rf(24), fontWeight: '900', color: INK, textAlign: 'center', marginTop: rs(10) },
  sub: { fontSize: rf(14), color: MUTED, textAlign: 'center', marginTop: rs(4), lineHeight: rf(20) },
  track: { width: '88%', height: rs(8), borderRadius: 999, backgroundColor: '#E3F2E6', marginTop: rs(18), justifyContent: 'center' },
  fill: { height: '100%', borderRadius: 999, backgroundColor: GREEN },
  knob: {
    position: 'absolute', width: rs(16), height: rs(16), borderRadius: rs(8), marginLeft: -rs(8),
    backgroundColor: GREEN, borderWidth: 3, borderColor: '#FFFFFF',
    shadowColor: GREEN, shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  hint: { fontSize: rf(12), color: MUTED, textAlign: 'center', marginTop: rs(10) },
  distancePill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEECEC', borderRadius: 999,
    paddingHorizontal: rs(12), paddingVertical: rs(5), marginTop: rs(10),
  },
  distanceText: { fontSize: rf(12), fontWeight: '700', color: RED, marginLeft: rs(6) },
  retryBtn: {
    marginTop: rs(14), height: rs(48), borderRadius: 999, alignSelf: 'stretch', backgroundColor: GREEN,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    shadowColor: GREEN, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5,
  },
  retryText: { color: '#FFFFFF', fontSize: rf(14), fontWeight: '900', letterSpacing: 1.5, marginLeft: rs(8) },
  trustCard: {
    flexDirection: 'row', alignSelf: 'stretch', marginTop: rs(18), backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: rs(18), borderWidth: 1, borderColor: '#EEF2EE',
    shadowColor: INK, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  trustDivider: { width: 1, backgroundColor: '#EEF0EE', marginVertical: rs(12) },
  logout: { flexDirection: 'row', alignItems: 'center', marginTop: rs(14), paddingVertical: rs(6) },
  logoutText: { fontSize: rf(13), fontWeight: '600', color: MUTED, marginLeft: rs(6) },
});
