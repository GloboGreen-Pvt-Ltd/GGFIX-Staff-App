import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Phone-only break log. The backend has no break API, so today's breaks are
// kept in AsyncStorage per user per day: { start: epoch ms | null, totalMs }.
const keyFor = (userKey, d = new Date()) =>
  `ggfix.break.${userKey || 'anon'}.${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// `date` (optional) reads another day's log, e.g. for the shift timeline.
export function useBreak(userKey, date) {
  const [state, setState] = useState({ start: null, totalMs: 0 });
  const key = keyFor(userKey, date || new Date());

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!active) return;
        const s = raw ? JSON.parse(raw) : null;
        setState({ start: s?.start || null, totalMs: s?.totalMs || 0, lastStart: s?.lastStart || null, lastEnd: s?.lastEnd || null });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [key]);

  const save = useCallback((next) => {
    setState(next);
    AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
  }, [key]);

  const startBreak = () => { if (!state.start) { const now = Date.now(); save({ ...state, start: now, lastStart: now, lastEnd: null }); } };
  const endBreak = () => { if (state.start) { const now = Date.now(); save({ ...state, start: null, totalMs: state.totalMs + (now - state.start), lastEnd: now }); } };

  return {
    onBreak: !!state.start,
    lastStart: state.lastStart || state.start || null,
    lastEnd: state.lastEnd || null,
    // Minutes on break today, including a break still running at `now`.
    breakMinutes: (now = new Date()) => Math.floor((state.totalMs + (state.start ? now.getTime() - state.start : 0)) / 60000),
    startBreak,
    endBreak,
  };
}

export function formatMinutes(min) {
  return min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`;
}
