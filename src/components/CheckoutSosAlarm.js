// Foreground half of the checkout SOS (see utils/checkoutAlarm.js for the
// OS-scheduled notifications). While the app is open past the duty end and the
// technician is still checked in, this shows a blocking red alert and loops
// the siren until they check out. "Snooze" mutes it for SNOOZE_MS only.
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, TouchableOpacity, View, Vibration } from 'react-native';
import { Text } from './Typography';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { isPastCheckoutAlarm } from '../utils/checkoutAlarm';

const SNOOZE_MS = 5 * 60 * 1000;
const TICK_MS = 15 * 1000;
const sosSound = require('../../assets/sounds/sos_alarm.wav');

export default function CheckoutSosAlarm({ onDuty, busy, onCheckOut }) {
  const [now, setNow] = useState(() => Date.now());
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const playerRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setNow(Date.now()); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);

  const active = onDuty && isPastCheckoutAlarm(new Date(now)) && now >= snoozedUntil;

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
        if (cancelled) return;
        const player = createAudioPlayer(sosSound);
        player.loop = true;
        player.volume = 1;
        player.play();
        playerRef.current = player;
      } catch (e) {
        console.warn('[sos] play failed', e?.message);
      }
    })();
    Vibration.vibrate([0, 800, 400, 800], true);
    return () => {
      cancelled = true;
      Vibration.cancel();
      const p = playerRef.current;
      playerRef.current = null;
      try { p?.pause(); p?.remove(); } catch { /* already released */ }
    };
  }, [active]);

  return (
    <Modal visible={active} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(120,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 380, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22, alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>🚨</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#F32C26', marginTop: 6 }}>SOS: Check-out pending</Text>
          <Text style={{ fontSize: 14, color: '#333', textAlign: 'center', marginTop: 8 }}>
            Your shift has ended and you have not checked out yet. Please check out now.
          </Text>
          <TouchableOpacity
            onPress={onCheckOut}
            disabled={busy}
            activeOpacity={0.85}
            style={{ marginTop: 18, alignSelf: 'stretch', backgroundColor: '#F32C26', borderRadius: 12, paddingVertical: 13, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>{busy ? 'Checking out…' : 'Check Out Now'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSnoozedUntil(Date.now() + SNOOZE_MS)} style={{ marginTop: 12, padding: 6 }}>
            <Text style={{ color: '#666', fontWeight: '700' }}>Snooze 5 min</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
