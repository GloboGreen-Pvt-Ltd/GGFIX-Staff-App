import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, LogIn, LogOut, MapPinOff, MapPinCheck, Truck, CircleHelp } from 'lucide-react-native';
import { Text } from '../components/Typography';
import MintScreenHeader, { MintBackdrop, useHideNativeHeader } from '../components/MintScreenHeader';
import { getMyPresence } from '../api/presence';
import { PRESENCE_LABEL, fmtClock, fmtDuration } from '../utils/presenceStore';
import { userMessage } from '../utils/userMessages';
import { rf, rs } from '../utils/responsive';

// Shop Presence History — the employee's own day: manual check-in / out, exits,
// returns and authorized duty, all server timestamps (read only). Open
// intervals stay open; nothing is estimated.
const TEAL = '#035C6C';
const INK = '#111827';
const MUTED = '#6B7280';
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const hhmm = (t) => {
  if (!t) return '—';
  const [h, m] = String(t).split(':').map(Number);
  return `${pad(h % 12 || 12)}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};

export const EVENT = {
  CHECKED_IN: { label: 'Checked In', Icon: LogIn, color: '#1E8E4E' },
  CHECKED_OUT: { label: 'Checked Out', Icon: LogOut, color: '#6B7280' },
  EXITED: { label: 'Left Shop', Icon: MapPinOff, color: '#D97706' },
  RETURNED: { label: 'Returned to Shop', Icon: MapPinCheck, color: '#1E8E4E' },
  OUTSIDE_ENDED: { label: 'Outside time ended (duty started)', Icon: MapPinCheck, color: '#0788C9' },
  DUTY_STARTED: { label: 'Authorized Duty Started', Icon: Truck, color: '#0788C9' },
  DUTY_ENDED: { label: 'Authorized Duty Ended', Icon: Truck, color: '#0788C9' },
  LOCATION_UNVERIFIED: { label: 'Location Unverified', Icon: CircleHelp, color: '#B7791F' },
};

function Tile({ label, value, bg }) {
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: rs(12), padding: rs(12) }}>
      <Text style={{ fontSize: rf(12), color: MUTED }}>{label}</Text>
      <Text style={{ fontSize: rf(16), fontWeight: '800', color: INK, marginTop: rs(4) }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function PresenceDayView({ d }) {
  return (
    <>
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: rs(16), padding: rs(12), borderWidth: 1, borderColor: '#E6ECEE' }}>
        <View style={{ flexDirection: 'row', gap: rs(8) }}>
          <Tile label="Check In" value={hhmm(d?.checkInTime)} bg="#E8F3EA" />
          <Tile label="Check Out" value={hhmm(d?.checkOutTime)} bg="#FCEBEC" />
        </View>
        <View style={{ flexDirection: 'row', gap: rs(8), marginTop: rs(8) }}>
          <Tile label="Outside Visits" value={pad(d?.outsideVisits ?? 0)} bg="#E1F2F6" />
          <Tile label="Outside Duration" value={`${fmtDuration(d?.outsideSeconds)}${d?.outsideOpen ? ' (open)' : ''}`} bg="#FFF2DA" />
        </View>
        <View style={{ flexDirection: 'row', gap: rs(8), marginTop: rs(8) }}>
          <Tile label="Authorized Duty" value={fmtDuration(d?.dutySeconds)} bg="#E6F0FA" />
          <Tile label="Status" value={PRESENCE_LABEL[d?.presence] || '—'} bg="#F1F3F5" />
        </View>
        {d?.lastVerifiedAt ? <Text style={{ fontSize: rf(11.5), color: MUTED, marginTop: rs(8) }}>{`Last verified location ${fmtClock(d.lastVerifiedAt)}${d.stale ? ' · not live' : ''}`}</Text> : null}
      </View>
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: rs(16), padding: rs(14), borderWidth: 1, borderColor: '#E6ECEE', marginTop: rs(12) }}>
        <Text style={{ fontSize: rf(14), fontWeight: '800', color: INK, marginBottom: rs(6) }}>Movements</Text>
        {(d?.timeline || []).length === 0 ? (
          <Text style={{ fontSize: rf(12.5), color: MUTED, paddingVertical: rs(8) }}>{d?.checkInTime ? 'No movements recorded.' : 'Not checked in on this day.'}</Text>
        ) : d.timeline.map((e, i) => {
          const m = EVENT[e.type] || { label: e.type, Icon: CircleHelp, color: MUTED };
          return (
            <View key={`${e.type}-${e.at}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: rs(9) }}>
              <m.Icon size={rs(18)} color={m.color} />
              <View style={{ flex: 1, marginLeft: rs(10) }}>
                <Text style={{ fontSize: rf(13.5), fontWeight: '700', color: INK }}>{m.label}</Text>
                {e.durationSeconds != null ? <Text style={{ fontSize: rf(11.5), color: MUTED }}>{`Duration ${fmtDuration(e.durationSeconds)}`}</Text> : null}
              </View>
              <Text style={{ fontSize: rf(12.5), color: MUTED }}>{fmtClock(e.at)}</Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

export default function ShopPresenceHistoryScreen({ navigation }) {
  useHideNativeHeader(navigation);
  const [day, setDay] = useState(() => new Date());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const today = ymd(new Date());
  const key = ymd(day);

  const load = useCallback(async () => {
    try {
      setData(await getMyPresence(key));
      setError(null);
    } catch (e) {
      setError(userMessage(e, 'Could not load shop presence.'));
    }
  }, [key]);
  useFocusEffect(useCallback(() => { setData(null); load(); }, [load]));
  const shift = (n) => { const d = new Date(day); d.setDate(d.getDate() + n); setDay(d); };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <MintBackdrop />
      <MintScreenHeader title="Shop Presence" navigation={navigation} />
      <ScrollView contentContainerStyle={{ padding: rs(16), paddingBottom: rs(40) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[TEAL]} tintColor={TEAL} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rs(12) }}>
          <TouchableOpacity onPress={() => shift(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous day"><ChevronLeft size={rs(22)} color={TEAL} /></TouchableOpacity>
          <Text style={{ fontSize: rf(14), fontWeight: '800', color: INK }}>{`${DAYS[day.getDay()]}, ${day.getDate()} ${MONTHS[day.getMonth()]}`}{data?.shopName ? ` · ${data.shopName}` : ''}</Text>
          <TouchableOpacity onPress={() => shift(1)} disabled={key >= today} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next day" style={{ opacity: key >= today ? 0.3 : 1 }}><ChevronRight size={rs(22)} color={TEAL} /></TouchableOpacity>
        </View>
        {error ? (
          <TouchableOpacity onPress={load} style={{ backgroundColor: '#FEECEC', borderRadius: rs(12), padding: rs(12) }}>
            <Text style={{ color: '#B42318', fontSize: rf(12.5) }}>{`${error} Tap to retry.`}</Text>
          </TouchableOpacity>
        ) : !data ? <ActivityIndicator color={TEAL} style={{ marginTop: rs(30) }} /> : <PresenceDayView d={data} />}
        <Text style={{ fontSize: rf(11), color: MUTED, marginTop: rs(14) }}>
          Recorded from your phone's GPS while the app is open. Times are server records and cannot be edited.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
