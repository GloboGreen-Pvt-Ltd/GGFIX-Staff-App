import { useEffect, useState } from 'react';

// Latest shop-presence result from GeofenceGate (server ping response), shared
// with Home without another GPS read or API call. Memory only: after an app
// restart it is empty until the gate's first check.
let latest = null;
const subs = new Set();

export const getPresence = () => latest;
export function setPresence(p) {
  latest = p ? { ...p, receivedAt: Date.now() } : null;
  subs.forEach((fn) => fn(latest));
}
export function usePresence() {
  const [p, setP] = useState(latest);
  useEffect(() => { subs.add(setP); setP(latest); return () => { subs.delete(setP); }; }, []);
  return p;
}

// Display labels for the server presence states.
export const PRESENCE_LABEL = {
  INSIDE_SHOP: 'Inside Shop',
  OUTSIDE_SHOP: 'Outside Shop',
  ON_AUTHORIZED_DUTY: 'On Authorized Duty',
  LOCATION_UNVERIFIED: 'Location Unverified',
  CHECKED_OUT: 'Checked Out',
  NOT_CHECKED_IN: 'Not Checked In',
  MONITORING_OFF: 'Monitoring Off',
};

export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return s ? '< 1 min' : '0 min';
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function fmtClock(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const h = d.getHours();
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// GeofenceGate registers its check; Home calls it right after a check-in /
// check-out so monitoring starts / stops without waiting for the next poll.
let recheck = null;
export const setPresenceRecheck = (fn) => { recheck = fn; };
export const recheckPresence = () => { try { recheck?.(); } catch (_) { /* gate not mounted */ } };
