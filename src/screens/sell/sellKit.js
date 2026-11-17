import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Check, ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react-native';
import { Text } from '../../components/Typography';
import { listMyAssignedPickups } from '../../api/pickups';
import { sellStageFor } from '../../utils/pickups';
import { isSafeText, userMessage } from '../../utils/userMessages';
import { rf, rs } from '../../utils/responsive';

// Sell inspection (device-purchase pickup, Device Collected): the customer's
// selling pages — Screening → Screen → Functional → Accessories & Warranty —
// in the Employee App teal, pre-filled with what the customer answered.
export const SK = {
  teal: '#035C6C',
  tealSoft: '#E5F3F5',
  ink: '#111111',
  navy: '#1C3053',
  muted: '#6B7280',
  page: '#F3F4F6',
  tile: '#F3F4F6',
  line: '#E5E7EB',
  ring: '#C4CAD1',
  amber: '#FAA700',
  amberSoft: '#FDF6E0',
  disabled: '#9DC2C9',
};

export const cardShadow = {
  shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
};

// Page: header (round back · title + subtitle), scrolling body, sticky CTA.
export function SellPage({ title, subtitle, navigation, children, footer }) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: SK.page }}>
      <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: rs(16), paddingVertical: rs(10), borderBottomWidth: 1, borderBottomColor: '#D5E8EC' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF6F8', borderWidth: 1, borderColor: '#C7E6EA', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={20} color={SK.ink} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center', marginHorizontal: 8 }}>
            <Text style={{ fontSize: rf(17), fontWeight: '800', color: SK.ink }} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={{ fontSize: rf(13), color: '#3F5B7A', marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <View style={{ width: 40 }} />
        </View>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
      {footer ? (
        <View style={{ paddingHorizontal: rs(14), paddingTop: rs(10), paddingBottom: Math.max(insets.bottom, 10) + 6, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: SK.line }}>
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function SellCard({ title, Icon, children, style }) {
  return (
    <View style={[{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: SK.line, padding: 10, marginTop: 8, ...cardShadow }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          {Icon ? (
            <View style={{ height: 34, width: 34, borderRadius: 10, backgroundColor: SK.tealSoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
              <Icon size={17} color={SK.teal} />
            </View>
          ) : null}
          <Text style={{ flex: 1, fontSize: rf(14), fontWeight: '800', color: SK.ink }}>{title}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function SellCta({ title = 'Continue', onPress, disabled, loading }) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={{ height: 44, borderRadius: 22, backgroundColor: off ? SK.disabled : SK.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" /> : (
        <>
          <Text style={{ color: '#FFFFFF', fontSize: rf(14), fontWeight: '800', marginRight: 6 }}>{title}</Text>
          <ChevronRight size={20} color="#FFFFFF" />
        </>
      )}
    </Pressable>
  );
}

// The customer's answers are pre-selected; the pickup person changes what differs.
export function PrefillNote({ text = 'The customer’s answers are pre-selected. Change anything that is different on the device.' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: SK.tealSoft, borderRadius: 12, padding: 10, marginTop: 10 }}>
      <ClipboardCheck size={16} color={SK.teal} />
      <Text style={{ flex: 1, marginLeft: 8, fontSize: rf(12), color: SK.navy }}>{text}</Text>
    </View>
  );
}

export function SellLoader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={SK.teal} />
    </View>
  );
}

// ── Doorstep purchase flow (Verify OTP → Compare & Inspect → Price → Payment) ──

export const SC = { green: '#609138', greenSoft: '#EEF6E8', red: '#F32C26', redSoft: '#FDECEB', amberInk: '#9A6700' };
export const money = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);
/** The server's own sentence when it is safe to show (OTP / price rules), else the app's. */
export const sellError = (e, fallback) => (isSafeText(e?.payload?.message) ? e.payload.message
  // 404 / 405 = the server has no doorstep step routes yet (ticket-service not updated).
  : e?.status === 404 || e?.status === 405 ? 'The server is not updated for sell pickups yet. Ask your admin to deploy the latest ticket-service.'
    : userMessage(e, fallback));
/** Open the screen for the booking's next doorstep step in place of this one. */
export const goToSellStage = (navigation, b) => navigation.replace(sellStageFor(b).route, { bookingId: b.id, booking: b });
/** Back to My Pickups when the pickup changed under us (reassigned / updated elsewhere). */
export const isGone = (e) => ['NOT_ASSIGNED', 'STALE_STATUS'].includes(e?.payload?.code);

/** The pickup row, refreshed from the server on focus (there is no single-booking read). */
export function useSellPickup(route) {
  const id = route?.params?.bookingId || route?.params?.booking?.id;
  const [booking, setBooking] = useState(route?.params?.booking || null);
  const reload = useCallback(async () => {
    const rows = await listMyAssignedPickups();
    const fresh = (rows || []).find((b) => b.id === id) || null;
    if (fresh) setBooking(fresh);
    return fresh;
  }, [id]);
  useFocusEffect(useCallback(() => { reload().catch(() => {}); }, [reload]));
  return { id, booking, setBooking, reload };
}

/** "1 Compare Details → 2 Inspection" header of the device inspection. */
export function SellStepper({ step }) {
  const Item = ({ n, label }) => {
    const done = step > n;
    const on = step === n;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? SK.tealSoft : 'transparent' }}>
        <View style={{ height: 22, width: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: done || on ? SK.teal : '#FFFFFF', borderWidth: 1.5, borderColor: done || on ? SK.teal : SK.ring }}>
          {done ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : <Text style={{ fontSize: rf(11), fontWeight: '800', color: on ? '#FFFFFF' : SK.muted }}>{n}</Text>}
        </View>
        <Text style={{ marginLeft: 6, fontSize: rf(12.5), fontWeight: on ? '800' : '600', color: on ? SK.teal : SK.muted }}>{label}</Text>
      </View>
    );
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: SK.line }}>
      <Item n={1} label="Compare Details" />
      <ChevronRight size={16} color={SK.ring} style={{ marginHorizontal: 4 }} />
      <Item n={2} label="Inspection" />
    </View>
  );
}

/** Secondary actions beside SellCta, same shape: primary (teal), success (green), outline, danger (red outline). */
export function SellButton({ title, Icon, onPress, disabled, loading, variant = 'primary', style }) {
  const off = disabled || loading;
  const filled = variant === 'primary' || variant === 'success';
  const tone = variant === 'success' ? SC.green : variant === 'danger' ? SC.red : SK.teal;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={[{
        minHeight: 40, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
        backgroundColor: filled ? (off ? SK.disabled : tone) : (variant === 'danger' ? SC.redSoft : '#FFFFFF'),
        borderWidth: filled ? 0 : 1.5, borderColor: tone, opacity: !filled && off ? 0.5 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator color={filled ? '#FFFFFF' : tone} /> : (
        <>
          {Icon ? <Icon size={18} color={filled ? '#FFFFFF' : tone} strokeWidth={2.4} /> : null}
          <Text style={{ marginLeft: Icon ? 6 : 0, fontSize: rf(13), fontWeight: '800', color: filled ? '#FFFFFF' : tone, textAlign: 'center' }} numberOfLines={2}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// Radio ring / filled dot used by single-choice rows.
export function Radio({ on }) {
  return (
    <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? SK.teal : SK.ring, alignItems: 'center', justifyContent: 'center' }}>
      {on ? <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: SK.teal }} /> : null}
    </View>
  );
}
