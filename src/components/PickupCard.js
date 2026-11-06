import React from 'react';
import { View, TouchableOpacity, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import {
  ArrowRightCircle, CalendarDays, ChevronRight, History, MapPin, Navigation, Package, Phone, Repeat,
} from 'lucide-react-native';
import { Text } from './Typography';
import { notify } from './confirm';
import {
  cancelInfo, customerPhone, deviceLabel, isReassigned, issueLabel, nextStatusFor, pickupDay, relDay, slotLabel,
  statusMeta, trackingId,
} from '../utils/pickups';
import { rf, rs } from '../utils/responsive';

export function callCustomer(booking) {
  const phone = customerPhone(booking);
  if (phone) Linking.openURL(`tel:${phone}`).catch(() => notify('Could not call', 'No phone app is available.', { type: 'error' }));
}
export function openDirections(booking) {
  if (!booking?.pickupAddressText) return;
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.pickupAddressText)}`)
    .catch(() => notify('Could not open Maps', 'No maps app is available.', { type: 'error' }));
}

// Compact pickup card: ID + status, customer, device · issue, when + where,
// the next-step button (when there is one) and Call / Directions / History.
// `readOnly` (history lists) hides the next-step button; `stamp` adds a
// final-status time line.
export default function PickupCard({ booking, onOpen, onAdvance, onHistory, busy, readOnly, stamp }) {
  const st = statusMeta(booking.status);
  const next = readOnly ? null : nextStatusFor(booking.status, booking.kind);
  const re = isReassigned(booking) && !readOnly;
  const slot = slotLabel(booking);
  const cancel = cancelInfo(booking);
  const phone = customerPhone(booking);
  const Icon = re ? Repeat : Package;
  return (
    <TouchableOpacity onPress={onOpen} activeOpacity={0.9} style={s.card} accessibilityRole="button"
      accessibilityLabel={`${trackingId(booking)}, ${booking.customerName || 'Customer'}, ${st.label}`}>
      <View style={s.top}>
        <View style={[s.disc, { backgroundColor: re ? '#FAA700' : st.color }]}>
          <Icon size={rs(15)} color="#FFFFFF" strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.idRow}>
            <Text style={s.id} numberOfLines={1}>{trackingId(booking)}</Text>
            <View style={[s.pill, { backgroundColor: st.bg }]}>
              <Text style={[s.pillText, { color: st.color }]} numberOfLines={1}>{st.label}</Text>
            </View>
          </View>
          <Text style={s.customer} numberOfLines={1}>{booking.customerName || 'Customer'}</Text>
          <Text style={s.device} numberOfLines={1}>
            {deviceLabel(booking)}<Text style={s.muted}>  ·  {issueLabel(booking)}</Text>
          </Text>
        </View>
        <ChevronRight size={rs(16)} color="#9CA3AF" />
      </View>

      <View style={s.meta}>
        <View style={s.metaItem}>
          <CalendarDays size={rs(12)} color="#6B7280" />
          <Text style={s.metaText} numberOfLines={1}>{relDay(pickupDay(booking))}{slot ? ` · ${slot}` : ''}</Text>
        </View>
        {booking.pickupAddressText ? (
          <View style={[s.metaItem, { flex: 1 }]}>
            <MapPin size={rs(12)} color="#6B7280" />
            <Text style={s.metaText} numberOfLines={1}>{booking.pickupAddressText}</Text>
          </View>
        ) : null}
      </View>
      {cancel?.note ? <Text style={s.cancelNote} numberOfLines={2}>{cancel.note}</Text> : null}
      {stamp ? <Text style={s.stamp} numberOfLines={1}>{stamp}</Text> : null}

      {next ? (
        <TouchableOpacity onPress={onAdvance} disabled={busy} activeOpacity={0.85} style={[s.next, busy && { opacity: 0.6 }]} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
            <>
              <ArrowRightCircle size={rs(16)} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={s.nextText} numberOfLines={1}>{next.label}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      <View style={s.actions}>
        <Shortcut icon={Phone} label="Call" color="#609138" onPress={() => callCustomer(booking)} disabled={!phone} />
        <Shortcut icon={Navigation} label="Directions" color="#035C6C" onPress={() => openDirections(booking)} disabled={!booking.pickupAddressText} />
        <Shortcut icon={History} label="History" color="#1C3053" onPress={onHistory} />
      </View>
    </TouchableOpacity>
  );
}

function Shortcut({ icon: Icon, label, color, onPress, disabled }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={label}
      style={[s.shortcut, { backgroundColor: `${color}12`, borderColor: `${color}33` }, disabled && { opacity: 0.45 }]}>
      <Icon size={rs(13)} color={color} strokeWidth={2.4} />
      <Text style={[s.shortcutText, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: rs(14), borderWidth: 1, borderColor: '#EEF0F2', padding: rs(11), marginBottom: rs(8),
    shadowColor: '#111111', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: rs(9) },
  disc: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: 'center', justifyContent: 'center' },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  id: { flexShrink: 1, fontSize: rf(12), fontWeight: '800', color: '#035C6C' },
  pill: { paddingHorizontal: rs(8), paddingVertical: rs(2), borderRadius: 999, maxWidth: '55%' },
  pillText: { fontSize: rf(10), fontWeight: '800' },
  customer: { fontSize: rf(14), fontWeight: '800', color: '#111111', marginTop: rs(2) },
  device: { fontSize: rf(12), fontWeight: '700', color: '#1C3053', marginTop: 1 },
  muted: { fontWeight: '500', color: '#6B7280' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: rs(12), marginTop: rs(8) },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: rs(4), minWidth: 0 },
  metaText: { flexShrink: 1, fontSize: rf(11.5), color: '#475467' },
  cancelNote: { fontSize: rf(11.5), color: '#F32C26', marginTop: rs(6) },
  stamp: { fontSize: rf(11), fontWeight: '700', color: '#6B7280', marginTop: rs(5) },
  next: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6), height: rs(40), borderRadius: rs(12),
    backgroundColor: '#035C6C', marginTop: rs(9),
  },
  nextText: { color: '#FFFFFF', fontSize: rf(13), fontWeight: '800' },
  actions: { flexDirection: 'row', gap: rs(6), marginTop: rs(8) },
  shortcut: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(5), height: rs(34),
    borderRadius: rs(10), borderWidth: 1,
  },
  shortcutText: { fontSize: rf(11.5), fontWeight: '800' },
});
