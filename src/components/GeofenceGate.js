import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Image, Linking, Platform, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions, Text as RNText } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  LockKeyhole, RefreshCw, LogOut, MapPin, ShieldCheck, ShoppingCart, Smartphone, Store, Users, Wrench,
} from 'lucide-react-native';
import { interFamily } from '../theme/typography';
import { Skyline } from './BootSplash';
import { useDispatch, useSelector } from 'react-redux';
import { selectSession } from '../store/authSlice';
import { resolveRoleKey } from '../config/categories';
import { getMyTechnicianProfile } from '../api/technician';
import { mergeTechnicianProfile } from '../store/authSlice';
import { readCurrentLocation, haversineMeters, GEOFENCE_RADIUS_METERS } from '../utils/geo';
import { rs } from '../utils/responsive';
import { notifyNow } from '../utils/checkoutAlarm';
import { hasActiveJourney } from '../utils/activeJourney';
import { pingPresence } from '../api/presence';
import { setPresence, setPresenceRecheck, PRESENCE_LABEL, fmtClock } from '../utils/presenceStore';

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
const INSIDE_RECHECK_MS = 60_000; // re-check cadence while the app is in use
const MONITOR_RECHECK_MS = 30_000; // checked in: often enough for the exit grace period

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
  const presRef = useRef(null); // last server presence response
  const localOutRef = useRef(null); // offline fallback: first outside reading (ms)
  const manualRef = useRef(false); // Retry tapped (lets a return unlock when auto-unlock is off)
  const isPickupPerson = resolveRoleKey(useSelector(selectSession)) === 'PICKUP_PERSON';

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

      // 2. Read GPS once; the server presence check and the local rule both use it.
      let pos = null;
      let posErr = null;
      try { pos = await readCurrentLocation(); } catch (e) { posErr = e; }

      // 3. Checked in → shop presence is SERVER-decided (grace period, hysteresis,
      // authorized duty, exit / return records). The session and attendance are
      // never touched here: a confirmed exit only pauses the app.
      let pres = null;
      try {
        pres = await pingPresence(pos
          ? { latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy ?? null, observedAt: Date.now(), manual: manualRef.current }
          : { error: posErr?.code || 'LOCATION_UNAVAILABLE' });
        presRef.current = pres;
        setPresence(pres);
      } catch (_) {
        pres = null; // offline / server error: never treated as "outside"
      }
      manualRef.current = false;
      if (!mountedRef.current) return;
      const monitored = (p) => !!p?.checkedIn && p.state !== 'MONITORING_OFF';
      if (pres && monitored(pres)) {
        localOutRef.current = null;
        setDistance(pres.distanceMeters ?? null);
        if (pres.state === 'ON_AUTHORIZED_DUTY') { setStatus('inside'); return; }
        if (!pos) {
          if (Platform.OS === 'web') { setStatus('inside'); return; }
          setStatus('denied');
          setMessage('Turn on location (GPS) and allow NearGFix to access it to use the app.');
          return;
        }
        setStatus(pres.freeze ? 'paused' : 'inside');
        return;
      }
      // Server unreachable while checked in: same grace rule locally (no records).
      if (!pres && monitored(presRef.current) && pos) {
        if (isPickupPerson && (await hasActiveJourney().catch(() => null)) === true) { setStatus('inside'); return; }
        const cfg = presRef.current.settings || {};
        const radius = Number(cfg.radiusMeters) || GEOFENCE_RADIUS_METERS;
        const graceMs = (Number(cfg.graceSeconds) || 120) * 1000;
        const m = Math.round(haversineMeters(pos.latitude, pos.longitude, shopRef.current.latitude, shopRef.current.longitude));
        setDistance(m);
        if (m > radius + 10) {
          if (!localOutRef.current) localOutRef.current = Date.now();
          setStatus(Date.now() - localOutRef.current >= graceMs && cfg.autoFreeze !== false ? 'paused' : 'inside');
        } else {
          localOutRef.current = null;
          setStatus('inside');
        }
        return;
      }

      // 4. Not checked in / monitoring off: the existing rules, unchanged.
      // Pickup person on a started journey (server data, fetched fresh):
      // no distance limit and no geofence lock until every journey is back at
      // the shop. Unknown (offline / API error) → normal rules below.
      if (isPickupPerson && (await hasActiveJourney().catch(() => null)) === true) {
        if (mountedRef.current) setStatus('inside');
        return;
      }
      if (!pos) {
        if (!mountedRef.current) return;
        // Web (desktop browser) has no reliable GPS — don't lock it out.
        if (Platform.OS === 'web') { setStatus('inside'); return; }
        // GPS off / permission denied → LOCK. Failing open here would let anyone
        // bypass the radius rule just by switching location off.
        setDistance(null);
        setStatus('denied');
        setMessage('Turn on location (GPS) and allow NearGFix to access it to use the app.');
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
  }, [dispatch, isPickupPerson]);

  useEffect(() => { setPresenceRecheck(runCheck); return () => setPresenceRecheck(null); }, [runCheck]);

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

  // Poll while locked (auto-unlock on arrival) and while in use (lock as soon
  // as they walk out of range).
  useEffect(() => {
    if (status === 'checking') return undefined;
    const monitoredNow = !!presRef.current?.checkedIn && presRef.current?.state !== 'MONITORING_OFF';
    const id = setInterval(runCheck, status === 'inside' ? (monitoredNow ? MONITOR_RECHECK_MS : INSIDE_RECHECK_MS) : RECHECK_MS);
    return () => clearInterval(id);
  }, [status, runCheck]);

  // Notify once each time the employee becomes locked out.
  const lockedRef = useRef(false);
  useEffect(() => {
    const locked = status === 'outside' || status === 'denied' || status === 'paused';
    if (locked && !lockedRef.current) {
      notifyNow(
        '📍 Outside shop area',
        status === 'paused'
          ? 'You are outside the shop area. The app is paused; your attendance remains active.'
          : status === 'denied'
          ? 'Location is off. NearGFix works only within ' + GEOFENCE_RADIUS_METERS + 'm of the shop.'
          : `You are ${distance ?? '?'}m from the shop. NearGFix works only within ${GEOFENCE_RADIUS_METERS}m.`,
      );
    }
    if (status !== 'checking') lockedRef.current = locked;
  }, [status, distance]);

  if (status === 'inside') return children;

  const retry = () => { setStatus('checking'); runCheck(); };
  if (status === 'paused') {
    const retryPaused = () => { manualRef.current = true; runCheck(); };
    return <PausedView presence={presRef.current} distance={distance} onRetry={retryPaused} />;
  }
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

// Laid out on the 941px-wide brand mockup grid, scaled to the screen.
const GDW = 941;
const TEAL = '#035C6C';
const INK = '#050607';
const MUTED = '#5C6170';
const RED = '#F32C26';

// Inter by weight (exact sizes — skips the shared type-scale snapping).
const gf = (w) => {
  const f = interFamily(w);
  return f ? { fontFamily: f } : { fontWeight: String(w) };
};

// Tools → the phone's location settings (GPS off / permission problems). The
// gate re-checks automatically when the app comes back to the foreground.
function openLocationSettings() {
  if (Platform.OS === 'android') {
    Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings().catch(() => {}));
  } else {
    Linking.openSettings().catch(() => {});
  }
}

// Blue header bowl with the lime swoosh under its right edge.
function GateBowl({ width, k, shift }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width }}>
      {shift > 0 ? <View style={{ height: shift, backgroundColor: '#025D89' }} /> : null}
      <Svg width={width} height={290 * k} viewBox="0 0 941 290" preserveAspectRatio="none">
        <Defs>
          <SvgGradient id="ghdr" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#025D89" />
            <Stop offset="0.5" stopColor="#03779D" />
            <Stop offset="1" stopColor="#006692" />
          </SvgGradient>
          <SvgGradient id="glime" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#85C648" />
            <Stop offset="1" stopColor="#BDE739" />
          </SvgGradient>
        </Defs>
        <Path d="M0 0 H941 V148 C830 175 660 272 440 275 C280 275 110 255 0 58 Z" fill="url(#glime)" />
        <Path d="M0 0 H941 V104 C820 150 640 268 440 268 C280 268 110 250 0 56 Z" fill="url(#ghdr)" />
      </Svg>
    </View>
  );
}

// Map tile with the shop pin, a lime orbit swoosh and four service badges.
function LocationArt({ k, locked, pulse }) {
  const W = 640 * k;
  const H = 405 * k;
  const pinScale = 145 / 24;
  const Badge = ({ x, y, bg, children }) => {
    const d = 100 * k;
    return (
      <View style={[gx.badge, { left: x * k - d / 2, top: y * k - d / 2, width: d, height: d, borderRadius: d / 2, backgroundColor: bg, borderWidth: 5 * k }]}>
        {children}
      </View>
    );
  };
  const icon = 44 * k;
  return (
    <View style={{ width: W, height: H }}>
      {/* pulsing halo on the ground */}
      <Animated.View style={{
        position: 'absolute', left: 220 * k, top: 262 * k, width: 200 * k, height: 60 * k, borderRadius: W,
        backgroundColor: locked ? RED : '#239199',
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] }) }],
      }} />
      <Svg width={W} height={H} viewBox="0 0 640 405" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="gpin" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={locked ? '#F76B66' : '#035C6C'} />
            <Stop offset="1" stopColor={locked ? '#C81E1A' : '#035C6C'} />
          </SvgGradient>
          <SvgGradient id="gswoosh" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor="#5DB33F" />
            <Stop offset="1" stopColor="#A9D83A" />
          </SvgGradient>
        </Defs>
        {/* faint street grid */}
        {[[20, 75, 600, 40], [10, 170, 615, 135], [10, 265, 625, 225], [10, 360, 630, 320], [290, 10, 330, 400], [450, 0, 500, 400]].map(([x1, y1, x2, y2]) => (
          <Path key={`${x1}-${y1}`} d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#E4F5EC" strokeWidth={12} strokeLinecap="round" />
        ))}
        {/* dashed orbit */}
        <Ellipse cx={320} cy={215} rx={228} ry={180} fill="none" stroke="#1C8C93" strokeOpacity={0.55} strokeWidth={2} strokeDasharray="8 8" />
        {/* ground rings */}
        <Ellipse cx={320} cy={292} rx={135} ry={42} fill={locked ? RED : '#71C9CB'} fillOpacity={0.3} />
        <Ellipse cx={320} cy={290} rx={86} ry={25} fill={locked ? RED : '#239199'} fillOpacity={0.3} stroke="#FFFFFF" strokeWidth={4} />
        {/* pin */}
        <Path
          d="M12 0C5.4 0 0 5.3 0 11.8 0 20.6 12 31 12 31s12-10.4 12-19.2C24 5.3 18.6 0 12 0z"
          fill="url(#gpin)"
          transform={`translate(${320 - 72.5} 88) scale(${pinScale})`}
        />
        <Circle cx={320} cy={88 + 11.5 * pinScale} r={5 * pinScale} fill="#FFFFFF" />
        {/* lime orbit swoosh */}
        <Path d="M175 248 C200 190 360 140 452 148 C380 162 232 205 175 248 Z" fill="url(#gswoosh)" />
      </Svg>
      <Badge x={130} y={73} bg="#E9F8F1"><Store size={icon} color="#00555A" strokeWidth={2} /></Badge>
      <Badge x={500} y={70} bg="#FEF5E4"><Smartphone size={icon} color="#F5A524" strokeWidth={2} /></Badge>
      <Badge x={95} y={285} bg="#E7F9F7"><Wrench size={icon} color="#026567" strokeWidth={2} /></Badge>
      <Badge x={535} y={305} bg="#078B7D"><ShoppingCart size={icon} color="#FFFFFF" strokeWidth={2} /></Badge>
      {locked ? (
        <View style={[gx.badge, { left: 368 * k, top: 70 * k, width: 70 * k, height: 70 * k, borderRadius: 35 * k, backgroundColor: '#FFFFFF' }]}>
          <LockKeyhole size={36 * k} color={RED} strokeWidth={2.4} />
        </View>
      ) : null}
    </View>
  );
}

// Flexible gap: at least `min` design px, grows to share spare screen height.
function Gap({ k, min }) {
  return <View style={{ flexGrow: 1, minHeight: min * k }} />;
}

function TrustItem({ k, t, icon: Icon, title, sub }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 6 * k }}>
      <LinearGradient colors={['#E6F8F4', '#D6F2EC']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ width: 90 * k, height: 90 * k, borderRadius: 45 * k, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={44 * k} color="#005A60" strokeWidth={2} />
      </LinearGradient>
      <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[t(29, 800, '#000000'), { marginTop: 14 * k }]}>{title}</RNText>
      <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[t(26, 400, '#49505D'), { marginTop: 4 * k }]}>{sub}</RNText>
    </View>
  );
}

function GateView({ checking, message, distance, onRetry, onLogout }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Scaled to the width (capped for tablets) and shrunk further on short
  // screens so the whole page fits; spare height goes to flexible gaps.
  const availH = height - insets.bottom - Math.max(0, insets.top - rs(24));
  const k = Math.min(Math.min(width, 520) / GDW, availH / (checking ? 1620 : 1800));
  // Push everything below a tall status bar / notch.
  const shift = Math.max(0, insets.top + rs(6) - 97 * k);
  const side = Math.max(0, (width - GDW * k) / 2);
  const t = (size, weight, color, extra) => ({
    ...gf(weight), fontSize: size * k, lineHeight: size * 1.3 * k, color, includeFontPadding: false, ...extra,
  });

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

  const trackW = 728 * k;
  const fillW = bar.interpolate({ inputRange: [0, 1], outputRange: [trackW * 0.15, trackW * 0.85] });
  const dot = { color: '#035C6C' };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingBottom: insets.bottom + 34 * k }} showsVerticalScrollIndicator={false}>
        <Skyline width={width} height={230 * k} />
        <GateBowl width={width} k={k} shift={shift} />

        <TouchableOpacity onPress={openLocationSettings} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Tools: open location settings"
          style={[gx.tools, { top: 97 * k + shift, right: side + 41 * k, height: 63 * k, borderRadius: 32 * k, paddingHorizontal: 22 * k }]}>
          <MaterialCommunityIcons name="cog" size={40 * k} color="#005565" />
          <RNText allowFontScaling={false} style={[t(28, 600, '#003B4A'), { marginLeft: 12 * k }]}>Tools</RNText>
        </TouchableOpacity>

        <View style={{ width: GDW * k, alignItems: 'center', flexGrow: 1 }}>
          {/* Brand */}
          <View style={[gx.tile, { marginTop: 112 * k + shift, width: 184 * k, height: 184 * k, borderRadius: 38 * k }]}>
            <Image source={require('../../assets/splash-tile.png')} style={{ width: '100%', height: '100%', borderRadius: 38 * k }} resizeMode="cover" />
          </View>
          <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[t(84, 900, '#014755', { letterSpacing: -1.6 * k, lineHeight: 98 * k }), { marginTop: 14 * k, maxWidth: 560 * k }]}>
            NEAR G <RNText style={{ color: '#00BEBC' }}>FIX</RNText>
          </RNText>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[gx.rule, { width: 75 * k }]} />
            <RNText allowFontScaling={false} numberOfLines={1} style={[t(24, 700, '#01414C', { letterSpacing: 5.5 * k }), { marginHorizontal: 16 * k }]}>BY GLOBO GREEN</RNText>
            <View style={[gx.rule, { width: 75 * k }]} />
          </View>
          <RNText allowFontScaling={false} numberOfLines={1} style={[t(31, 600, '#49515F'), { marginTop: 18 * k }]}>
            Attendance<RNText style={dot}>{'  •  '}</RNText>Tasks<RNText style={dot}>{'  •  '}</RNText>Pickup
          </RNText>

          <Gap k={k} min={28} />
          <LocationArt k={k} locked={!checking} pulse={pulse} />

          {checking ? (
            <>
              <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[t(50, 900, INK, { letterSpacing: -0.6 * k, lineHeight: 62 * k }), { marginTop: 22 * k, maxWidth: 860 * k }]}>
                Checking <RNText style={{ color: TEAL }}>your location...</RNText>
              </RNText>
              <RNText allowFontScaling={false} style={[t(32, 400, MUTED), { marginTop: 4 * k, textAlign: 'center' }]}>Confirming you’re at the shop.</RNText>
              <View style={[gx.track, { width: trackW, height: 20 * k, marginTop: 36 * k }]}>
                <Animated.View style={{ height: '100%', borderRadius: 999, backgroundColor: '#035C6C', width: fillW }} />
                <Animated.View style={[gx.knob, { width: 34 * k, height: 34 * k, borderRadius: 17 * k, borderWidth: 6 * k, marginLeft: -17 * k, left: fillW }]} />
              </View>
              <RNText allowFontScaling={false} style={[t(27, 400, '#4D555F'), { marginTop: 22 * k, textAlign: 'center' }]}>Please wait, this may take a few seconds.</RNText>
              <RNText allowFontScaling={false} style={[t(28, 700, '#4A5464'), { marginTop: 14 * k, textAlign: 'center' }]}>
                Powered by <RNText style={{ color: '#035C6C' }}>Globo Green</RNText>
              </RNText>
            </>
          ) : (
            <>
              <RNText allowFontScaling={false} style={[t(48, 900, INK, { letterSpacing: -0.6 * k, lineHeight: 60 * k }), { marginTop: 22 * k, textAlign: 'center', maxWidth: 860 * k }]}>
                You’re <RNText style={{ color: RED }}>away from the shop</RNText>
              </RNText>
              <RNText allowFontScaling={false} style={[t(29, 400, MUTED), { marginTop: 8 * k, textAlign: 'center', maxWidth: 820 * k }]}>{message}</RNText>
              {distance != null ? (
                <View style={[gx.distancePill, { marginTop: 18 * k, paddingHorizontal: 26 * k, paddingVertical: 10 * k }]}>
                  <MapPin size={28 * k} color={RED} strokeWidth={2.2} />
                  <RNText allowFontScaling={false} style={[t(26, 700, RED), { marginLeft: 10 * k }]}>{distance}m away · limit {GEOFENCE_RADIUS_METERS}m</RNText>
                </View>
              ) : null}
              <TouchableOpacity onPress={onRetry} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Check again"
                style={[gx.cta, { width: trackW, height: 85 * k, borderRadius: 43 * k, marginTop: 26 * k }]}>
                <LinearGradient colors={['#035C6C', '#035C6C', '#035C6C']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={{ flex: 1, borderRadius: 43 * k, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <RefreshCw size={34 * k} color="#FFFFFF" strokeWidth={2.4} />
                  <RNText allowFontScaling={false} style={[t(30, 800, '#FFFFFF', { letterSpacing: 4 * k }), { marginLeft: 16 * k }]}>CHECK AGAIN</RNText>
                </LinearGradient>
              </TouchableOpacity>
              <RNText allowFontScaling={false} style={[t(27, 400, '#4D555F'), { marginTop: 20 * k, textAlign: 'center' }]}>Unlocks automatically when you reach the shop.</RNText>
            </>
          )}

          {/* Trust card */}
          <Gap k={k} min={34} />
          <View style={[gx.trustCard, { width: 838 * k, borderRadius: 36 * k, paddingVertical: 30 * k }]}>
            <TrustItem k={k} t={t} icon={ShieldCheck} title="Secure" sub="Trusted service" />
            <View style={[gx.divider, { height: 150 * k }]} />
            <TrustItem k={k} t={t} icon={MapPin} title="Geo-verified" sub={`Within ${GEOFENCE_RADIUS_METERS}m of shop`} />
            <View style={[gx.divider, { height: 150 * k }]} />
            <TrustItem k={k} t={t} icon={Users} title="Pan India" sub="Service network" />
          </View>

          {/* Escape hatch — the employee can always sign out from this screen. */}
          <Gap k={k} min={36} />
          <TouchableOpacity onPress={onLogout} hitSlop={10} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Log out"
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 * k }}>
            <LogOut size={36 * k} color="#545F6E" strokeWidth={2} />
            <RNText allowFontScaling={false} style={[t(32, 600, '#535C66'), { marginLeft: 14 * k }]}>Log out</RNText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const gx = StyleSheet.create({
  tools: {
    position: 'absolute', zIndex: 2, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    shadowColor: '#0B3B40', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  tile: {
    backgroundColor: '#035C6C',
    shadowColor: '#7FE3F0', shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  rule: { height: 2, backgroundColor: '#BBC6CC', borderRadius: 1 },
  badge: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center', borderColor: '#FFFFFF',
    shadowColor: '#0B3B40', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 6,
  },
  track: { borderRadius: 999, backgroundColor: '#D9F5E6', justifyContent: 'center' },
  knob: {
    position: 'absolute', backgroundColor: '#035C6C', borderColor: '#DBF2F1',
    shadowColor: '#035C6C', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  distancePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEECEC', borderRadius: 999 },
  cta: {
    backgroundColor: '#035C6C',
    shadowColor: '#035C6C', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  trustCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EEF2F2',
    shadowColor: '#111111', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  divider: { width: 1.5, backgroundColor: '#D4E4E5' },
});

/* ------------------------------------------------- checked-in pause screen */

// Shown only to a checked-in employee whose exit the SERVER confirmed (after
// the grace period). Nothing behind it is reachable; login and attendance
// stay intact and the gate unlocks itself on a verified return.
function PausedView({ presence, distance, onRetry }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const p = presence || {};
  const radius = p.radiusMeters ?? p.settings?.radiusMeters ?? GEOFENCE_RADIUS_METERS;
  const retry = async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } };
  const Row = ({ label, value, tone }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
      <RNText style={{ fontSize: 13, color: MUTED }}>{label}</RNText>
      <RNText style={{ fontSize: 13, fontWeight: '700', color: tone || INK, flexShrink: 1, textAlign: 'right', marginLeft: 12 }} numberOfLines={1}>{value}</RNText>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: '#F4F6F7', paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#E6ECEE' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <RNText style={{ fontSize: 14, fontWeight: '800', color: TEAL, letterSpacing: 0.5 }}>NearGFix Employee</RNText>
            <View style={{ backgroundColor: '#E3F5EA', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
              <RNText style={{ fontSize: 11.5, fontWeight: '800', color: '#1E8E4E' }}>Checked In</RNText>
            </View>
          </View>
          <View style={{ alignSelf: 'center', width: 88, height: 88, borderRadius: 44, backgroundColor: '#E6F1F3', alignItems: 'center', justifyContent: 'center', marginTop: 22 }}>
            <LockKeyhole size={34} color={TEAL} />
          </View>
          <RNText accessibilityRole="header" style={{ fontSize: 19, fontWeight: '800', color: INK, textAlign: 'center', marginTop: 16 }}>App Temporarily Paused</RNText>
          <RNText style={{ fontSize: 13.5, color: MUTED, textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
            You are outside your shop's permitted area. Your attendance remains active.
          </RNText>
          <View style={{ backgroundColor: '#F4F6F7', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6, marginTop: 16 }}>
            {p.shopName ? <Row label="Shop" value={p.shopName} /> : null}
            <Row label="Shop Distance Limit" value={`${radius}m`} />
            <Row label="Current Location" value={distance != null ? `${distance}m away · ${PRESENCE_LABEL[p.state] || 'Outside Shop'}` : (PRESENCE_LABEL[p.state] || 'Outside Shop')} />
            {p.lastExitAt ? <Row label="Left Shop At" value={fmtClock(p.lastExitAt)} /> : null}
            <Row label="App Status" value="Paused" tone="#B7791F" />
          </View>
          <TouchableOpacity onPress={retry} disabled={busy} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Retry location"
            style={{ marginTop: 18, height: 50, borderRadius: 14, backgroundColor: TEAL, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.7 : 1 }}>
            <RefreshCw size={18} color="#FFFFFF" />
            <RNText style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginLeft: 8 }}>{busy ? 'Checking…' : 'Retry Location'}</RNText>
          </TouchableOpacity>
          <RNText style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 10 }}>
            Location is re-checked automatically every few seconds. The app unlocks by itself when your verified location is inside the shop.
          </RNText>
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 14, gap: 18 }}>
            <TouchableOpacity onPress={openLocationSettings} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open location settings" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MapPin size={15} color={TEAL} />
              <RNText style={{ fontSize: 12.5, fontWeight: '700', color: TEAL, marginLeft: 4 }}>Location settings</RNText>
            </TouchableOpacity>
            {p.shopPhone ? (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${String(p.shopPhone).replace(/[^0-9+]/g, '')}`).catch(() => {})} hitSlop={8}
                accessibilityRole="button" accessibilityLabel="Call the shop" style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Smartphone size={15} color={TEAL} />
                <RNText style={{ fontSize: 12.5, fontWeight: '700', color: TEAL, marginLeft: 4 }}>Call shop</RNText>
              </TouchableOpacity>
            ) : null}
          </View>
          <RNText style={{ fontSize: 11.5, color: MUTED, textAlign: 'center', marginTop: 12 }}>
            GPS not updating? Turn location on, set it to High accuracy and allow NearGFix "While using the app".
          </RNText>
        </View>
      </ScrollView>
    </View>
  );
}
