import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from './Typography';
import { authApi } from '../api/client';
import { rf, rs } from '../utils/responsive';

// Real FROM → TO route from the server (auth-service /auth/places/route →
// Google Routes API, server key). Reports the decoded polyline to the map and
// shows distance + ETA. Nothing is shown (markers only) when either point is
// missing or the route call fails — distance / time are never estimated here.

// Google encoded polyline → [{ latitude, longitude }].
export function decodePolyline(s) {
  const out = [];
  let i = 0; let lat = 0; let lng = 0;
  while (s && i < s.length) {
    for (const k of [0, 1]) {
      let shift = 0; let res = 0; let c;
      do { c = s.charCodeAt(i++) - 63; res |= (c & 0x1f) << shift; shift += 5; } while (c >= 0x20 && i < s.length);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return out;
}

const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);
const mins = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.max(1, Math.round(s / 60))} min`);

export default function RouteInfo({ from, to, onRoute }) {
  const [r, setR] = useState(null);
  const key = from && to ? `${from.latitude},${from.longitude}>${to.latitude},${to.longitude}` : '';
  useEffect(() => {
    let live = true;
    setR(null); onRoute?.(null);
    if (!key) return undefined;
    authApi.get('/auth/places/route', { query: { oLat: from.latitude, oLng: from.longitude, dLat: to.latitude, dLng: to.longitude }, skipAuthExpiry: true })
      .then((x) => {
        if (!live || !x || !(x.distanceMeters > 0)) return;
        const v = { distanceMeters: x.distanceMeters, durationSeconds: x.durationSeconds, points: decodePolyline(x.polyline) };
        setR(v); onRoute?.(v);
      })
      .catch(() => {}); // markers-only fallback
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: rs(12), bottom: rs(30), flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: rs(12), paddingVertical: rs(6), elevation: 3 }}>
      <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: '#111111' }}>{km(r.distanceMeters)}</Text>
      {r.durationSeconds > 0 ? <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: '#374151' }}>{`  ·  ~${mins(r.durationSeconds)}`}</Text> : null}
    </View>
  );
}
