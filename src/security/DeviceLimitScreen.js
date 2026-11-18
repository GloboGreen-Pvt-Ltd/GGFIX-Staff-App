// Device Limit Reached: shows the account's active device (from the server) with
// a Log Out button. Logging it out needs an explicit confirmation; only then the
// server (fresh-OTP-proof, atomic replace) revokes the old session and starts
// this one. Cancel never touches the old session and grants no access here.
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY = '#035C6C';
const LIGHT = { bg: '#FFFFFF', card: '#F7F9FA', border: '#E5E7EB', text: '#111827', muted: '#6B7280', tint: '#E6F2F4', error: '#DC2626', overlay: 'rgba(17,24,39,0.45)' };
const DARK = { bg: '#0F1419', card: '#1A2128', border: '#2A333C', text: '#F3F4F6', muted: '#9CA3AF', tint: '#12343B', error: '#F87171', overlay: 'rgba(0,0,0,0.6)' };

function ago(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return '—';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

function platformLabel(p) {
  const v = String(p || '').toLowerCase();
  if (v === 'android') return 'Android phone';
  if (v === 'ios') return 'iPhone';
  return v ? v : 'Mobile device';
}

export default function DeviceLimitScreen({ device, busy, error, onConfirm, onCancel }) {
  const insets = useSafeAreaInsets();
  const c = useColorScheme() === 'dark' ? DARK : LIGHT;
  const [confirming, setConfirming] = useState(false);
  const devices = device ? [device] : [];

  const confirm = async () => {
    setConfirming(false);
    await onConfirm?.();
  };

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingHorizontal: 20 }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="shield-checkmark-outline" size={24} color={PRIMARY} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.text, marginTop: 12 }}>Device Limit Reached</Text>
          <Text style={{ fontSize: 13, color: c.muted, marginTop: 4, textAlign: 'center' }}>Your account is currently active on another device.</Text>
        </View>

        <Text style={{ fontSize: 12, fontWeight: '700', color: c.muted, marginTop: 22, marginBottom: 8, letterSpacing: 0.4 }}>LOG OUT 1 DEVICE TO CONTINUE</Text>
        {devices.map((d, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Ionicons name="phone-portrait-outline" size={20} color={PRIMARY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }} numberOfLines={1}>{d.deviceName || 'Unknown device'}</Text>
              <Text style={{ fontSize: 11.5, color: c.muted, marginTop: 2 }} numberOfLines={1}>{platformLabel(d.platform)} · Last active {ago(d.lastActiveAt)}</Text>
            </View>
            <Pressable onPress={() => setConfirming(true)} disabled={busy} style={{ paddingHorizontal: 12, height: 32, borderRadius: 9, borderWidth: 1, borderColor: c.error, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
              {busy ? <ActivityIndicator size="small" color={c.error} /> : <Text style={{ fontSize: 12.5, fontWeight: '800', color: c.error }}>Log Out</Text>}
            </Pressable>
          </View>
        ))}
        {error ? <Text style={{ color: c.error, fontSize: 12.5, marginTop: 10, textAlign: 'center' }}>{error}</Text> : null}

        <View style={{ flexDirection: 'row', marginTop: 22 }}>
          <Pressable onPress={onCancel} disabled={busy} style={{ flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: c.text }}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: PRIMARY, opacity: 0.4, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Continue</Text>
          </View>
        </View>
        <Text style={{ fontSize: 11, color: c.muted, textAlign: 'center', marginTop: 8 }}>Continue is available after the other device is logged out.</Text>
      </ScrollView>

      <Modal transparent visible={confirming} animationType="fade" onRequestClose={() => setConfirming(false)}>
        <View style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: c.bg, borderRadius: 16, padding: 18 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: c.text }}>Log Out Other Device?</Text>
            <Text style={{ fontSize: 13, color: c.muted, marginTop: 6 }}>This will end the active session on the selected device.</Text>
            <View style={{ flexDirection: 'row', marginTop: 18 }}>
              <Pressable onPress={() => setConfirming(false)} style={{ flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                <Text style={{ fontWeight: '800', color: c.text }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirm} style={{ flex: 1.4, height: 42, borderRadius: 10, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}>
                <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>Confirm & Continue</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
