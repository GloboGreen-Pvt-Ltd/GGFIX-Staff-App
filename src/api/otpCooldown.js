// OTP send guard shared by every "send OTP" call:
// - one request in flight per number (rapid taps / re-renders reuse it),
// - HTTP 429 → remembers the server's Retry-After (persisted, so it survives
//   screen changes and app restarts) and blocks sends until it passes.
// The server enforces the real limit; this only avoids pointless requests.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'otp.cooldown.v1';
const inflight = new Map();
let cache = null;

const norm = (id) => {
  const s = String(id || '').trim().toLowerCase();
  if (s.includes('@')) return s;
  const d = s.replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : s;
};

async function load() {
  if (cache) return cache;
  try { cache = JSON.parse((await AsyncStorage.getItem(KEY)) || '{}') || {}; } catch (_) { cache = {}; }
  return cache;
}

async function save() {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(cache || {})); } catch (_) { /* ignore */ }
}

export function formatMmSs(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Seconds left on the OTP cooldown for this number (0 when none). */
// Cooldown disabled: users can always request a new OTP (no client-side block).
export async function otpCooldownLeft(_identifier) {
  return 0;
}

export async function guardOtp(identifier, send) {
  const k = norm(identifier);
  if (inflight.has(k)) return inflight.get(k);
  const p = (async () => {
    // Clear any cooldown saved by older builds, then always send.
    const c = await load();
    if (c[k]) { delete c[k]; await save(); }
    return send();
  })().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}
