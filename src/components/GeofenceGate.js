import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LockKeyhole, RefreshCw, LogOut, MapPin } from 'lucide-react-native';
import { useDispatch } from 'react-redux';
import { getMyTechnicianProfile } from '../api/technician';
import { mergeTechnicianProfile } from '../store/authSlice';
import { readCurrentLocation, haversineMeters, GEOFENCE_RADIUS_METERS } from '../utils/geo';
import { rf } from '../utils/responsive';

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
  const checking = status === 'checking';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8">
        <View
          className="h-24 w-24 rounded-full items-center justify-center mb-6"
          style={{ backgroundColor: checking ? '#E0E7FF' : '#FEE2E2' }}
        >
          {checking
            ? <MapPin size={40} color="#00008B" />
            : <LockKeyhole size={40} color="#DC2626" />}
        </View>

        <Text className="font-extrabold text-text text-center" style={{ fontSize: rf(20) }}>
          {checking ? 'Checking your location…' : 'App locked'}
        </Text>

        {!checking ? (
          <Text className="text-text-muted text-center mt-2 leading-5" style={{ fontSize: rf(13) }}>
            {message}
          </Text>
        ) : (
          <Text className="text-text-muted text-center mt-2" style={{ fontSize: rf(13) }}>
            Confirming you’re at the shop.
          </Text>
        )}

        {distance != null && status === 'outside' ? (
          <View className="flex-row items-center bg-danger/10 rounded-full px-4 py-1.5 mt-4">
            <MapPin size={13} color="#DC2626" />
            <Text className="text-danger font-bold ml-1.5" style={{ fontSize: rf(12) }}>
              {distance}m away · limit {GEOFENCE_RADIUS_METERS}m
            </Text>
          </View>
        ) : null}

        {checking ? (
          <ActivityIndicator color="#00008B" style={{ marginTop: 28 }} />
        ) : (
          <>
            <Pressable
              onPress={retry}
              className="mt-8 rounded-xl py-3.5 px-8 flex-row items-center justify-center w-full"
              style={{ backgroundColor: '#00008B' }}
            >
              <RefreshCw size={16} color="#fff" />
              <Text className="text-white font-extrabold tracking-wide ml-2" style={{ fontSize: rf(14) }}>Check again</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Escape hatch — the employee can always sign out from the lock screen. */}
      <Pressable
        onPress={onLogout}
        className="items-center justify-center flex-row py-4"
        hitSlop={10}
      >
        <LogOut size={15} color="#6B7280" />
        <Text className="text-text-muted font-semibold ml-2" style={{ fontSize: rf(13) }}>Log out</Text>
      </Pressable>
    </SafeAreaView>
  );
}
