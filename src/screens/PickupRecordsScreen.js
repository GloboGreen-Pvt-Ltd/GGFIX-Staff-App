import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ban, Camera, ChartColumn, CircleCheck, CircleX, Inbox, MapPin, RefreshCw, Repeat, WifiOff } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { useHideNativeHeader } from '../components/MintScreenHeader';
import { SearchBar } from '../components/rnr';
import { JobHeader, JobRail, MonthBar, JobPictureCard, KIT, toneOf } from '../components/JobCardKit';
import { listMyAssignedPickups } from '../api/pickups';
import {
  bucketOf, cancelInfo, customerPhone, deviceLabel, fmtShortStamp, isActive, isReassigned, issueLabel, pickupDay, sortEvents, statusMeta,
  todayKey, trackingId,
} from '../utils/pickups';
import { rf, rs } from '../utils/responsive';
import { userMessage } from '../utils/userMessages';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Filters (Job Report rail). Failed = cancelled during the pickup by the
// pickup person; Cancelled = by the shop or the customer (the last CANCELLED
// event's actor). Completed = handed over, or since moved on by the shop.
const FILTERS = [
  { key: 'All', label: 'All', icon: ChartColumn, tone: 'teal', match: () => true },
  { key: 'Completed', label: 'Completed', icon: CircleCheck, tone: 'green', match: (b) => bucketOf(b.status) === 'COMPLETED' },
  { key: 'Failed', label: 'Failed', icon: CircleX, tone: 'red', match: (b) => cancelInfo(b)?.byMe === true },
  { key: 'Cancelled', label: 'Cancelled', icon: Ban, tone: toneOf('#6B7280'), match: (b) => cancelInfo(b)?.byMe === false },
  { key: 'Reassigned', label: 'Reassigned', icon: Repeat, tone: 'orange', match: (b) => isReassigned(b) },
];

const proofText = (b) => {
  const n = [b.frontImageUrl, b.backImageUrl].filter(Boolean).length;
  return [n ? `${n} proof ${n === 1 ? 'photo' : 'photos'}` : null, b.videoUrl ? 'video' : null].filter(Boolean).join(' · ') || null;
};
const lastAt = (b, code) => sortEvents(b.events).filter((e) => String(e.status).toUpperCase() === code).pop()?.createdAt;
// The card's final status (tab) and its time line.
function finalOf(b) {
  const cancel = cancelInfo(b);
  if (cancel) return { tab: cancel.byMe ? 'Failed' : 'Cancelled', color: cancel.byMe ? '#F32C26' : '#6B7280', stamp: `${cancel.byMe ? 'Failed' : 'Cancelled'} ${fmtShortStamp(cancel.at)}` };
  const st = statusMeta(b.status);
  if (bucketOf(b.status) === 'COMPLETED') return { tab: st.label, color: st.color, stamp: `Handed over ${fmtShortStamp(lastAt(b, 'RECEIVED_AT_SHOP') || b.updatedAt)}` };
  return { tab: st.label, color: st.color, stamp: b.updatedAt ? `Updated ${fmtShortStamp(b.updatedAt)}` : '' };
}

// Pickup History — every pickup assigned to the caller (the server keeps
// finished ones in the same list), laid out as the Job Report: status rail,
// month bar, picture cards. Search looks across every month.
export default function PickupRecordsScreen({ navigation, route }) {
  useHideNativeHeader(navigation);
  const now = new Date();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(FILTERS.some((f) => f.key === route?.params?.filter) ? route.params.filter : 'All');
  const [showSearch, setShowSearch] = useState(false);
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const rows = await listMyAssignedPickups();
      const seen = new Set();
      setList((Array.isArray(rows) ? rows : []).filter((b) => b?.id && !seen.has(b.id) && seen.add(b.id)));
      setError(null);
    } catch (e) {
      setError(userMessage(e, 'Could not load pickup history.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const term = q.trim().toLowerCase();
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const isThisMonth = ym === todayKey().slice(0, 7);
  // Same month rule as My Pickups (so both show the same pickups and counts):
  // by pickup day, and the current month also carries every pickup still in hand.
  const inRange = useMemo(() => (term
    ? list.filter((b) => [trackingId(b), b.bookingNumber, b.customerName, deviceLabel(b), customerPhone(b)]
      .some((v) => String(v || '').toLowerCase().includes(term)))
    : list.filter((b) => pickupDay(b).startsWith(ym) || (isThisMonth && isActive(b)))), [list, term, ym, isThisMonth]);
  // Rail counts are unique pickups (filters may overlap; All counts each once).
  // History rows are counted separately (one per server event id).
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, inRange.filter(f.match).length])), [inRange]);
  const eventCount = useMemo(() => inRange.reduce((n, b) => n + sortEvents(b.events).length, 0), [inRange]);
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) || FILTERS[0];
    return inRange.filter(f.match)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  }, [inRange, filter]);

  const stepMonth = (d) => {
    const m0 = month - 1 + d;
    setMonth(((m0 % 12) + 12) % 12 + 1);
    setYear(year + Math.floor(m0 / 12));
  };
  const pickFilter = (key) => { setFilter(key); scrollRef.current?.scrollTo?.({ y: 0, animated: true }); };
  const toggleSearch = () => { if (showSearch) setQ(''); setShowSearch(!showSearch); };
  const firstLoad = loading && !list.length;
  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <JobHeader navigation={navigation} title="Pickup History" sub="All your pickups" searchOn={showSearch} onSearch={toggleSearch} />
      {showSearch ? (
        <View style={s.searchWrap}>
          <SearchBar className="rounded-full py-2.5" value={q} onChangeText={setQ} placeholder="Search pickup ID, customer, device…" onClear={() => setQ('')} />
        </View>
      ) : null}

      <View style={s.body}>
        <JobRail items={FILTERS} counts={firstLoad ? {} : counts} active={filter} onPick={pickFilter} softBorder />
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[KIT.teal]} tintColor={KIT.teal} />}
        >
          <MonthBar
            title={term ? 'Search results' : monthLabel}
            sub={`${inRange.length} ${inRange.length === 1 ? 'pickup' : 'pickups'} · ${eventCount} ${eventCount === 1 ? 'event' : 'events'}`}
            onPrev={() => stepMonth(-1)}
            onNext={() => stepMonth(1)}
            disabled={!!term}
          />

          {error ? (
            <TouchableOpacity onPress={() => { setLoading(true); load(); }} activeOpacity={0.85} style={s.errorCard} accessibilityRole="button">
              <WifiOff size={rs(15)} color="#F32C26" />
              <Text style={s.errorText} numberOfLines={2}>{error}</Text>
              <View style={s.retry}><RefreshCw size={rs(11)} color="#FFFFFF" strokeWidth={2.6} /><Text style={s.retryText}>Retry</Text></View>
            </TouchableOpacity>
          ) : null}

          {firstLoad ? (
            <View style={s.state}><ActivityIndicator color={KIT.teal} /><Text style={s.stateText}>Loading pickup history…</Text></View>
          ) : shown.length === 0 ? (
            <View style={s.emptyRow}>
              <Inbox size={rs(18)} color="#9CA3AF" />
              <Text style={s.emptyText}>
                {term ? `No pickups match "${q.trim()}".` : filter === 'All' ? `No pickups in ${monthLabel}.` : `No ${filter.toLowerCase()} pickups in ${monthLabel}.`}
              </Text>
            </View>
          ) : shown.map((b) => {
            const fin = finalOf(b);
            return (
              <JobPictureCard
                key={b.id}
                ticket={b}
                tab={fin.tab}
                tabColor={fin.color}
                refText={trackingId(b)}
                model={deviceLabel(b)}
                lines={[
                  { text: b.customerName || 'Customer' },
                  { icon: MapPin, text: b.pickupAddressText },
                  { text: issueLabel(b) },
                  // Proof saved with the pickup estimate (front / back photos, video).
                  { icon: Camera, text: proofText(b) },
                ]}
                date={fin.stamp}
                time={null}
                pill={{ text: 'View History', onPress: () => navigation.navigate('PickupHistory', { booking: b }) }}
                onPress={() => navigation.navigate('PickupDetails', { bookingId: b.id, booking: b })}
              />
            );
          })}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  // Layout values from Job Report (JobReportScreen).
  safe: { flex: 1, backgroundColor: KIT.white },
  searchWrap: { paddingHorizontal: rs(12), paddingVertical: rs(8), backgroundColor: KIT.white, borderBottomWidth: 1, borderBottomColor: KIT.line },
  body: { flex: 1, flexDirection: 'row', backgroundColor: KIT.white },
  content: { paddingTop: rs(10), paddingLeft: rs(11), paddingRight: rs(9), paddingBottom: rs(24) },
  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8), marginBottom: rs(8), padding: rs(9), borderRadius: rs(12),
    backgroundColor: '#FEECEC', borderWidth: 1, borderColor: '#FBD5D4',
  },
  errorText: { flex: 1, fontSize: rf(12), fontWeight: '700', color: '#B42318' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: rs(4), backgroundColor: '#F32C26', borderRadius: 999, paddingHorizontal: rs(9), paddingVertical: rs(4) },
  retryText: { fontSize: rf(11), fontWeight: '800', color: '#FFFFFF' },
  state: { alignItems: 'center', gap: rs(8), paddingVertical: rs(30) },
  stateText: { fontSize: rf(12.5), color: '#6B7280' },
  emptyRow: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8), padding: rs(12), borderRadius: rs(12),
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EEF0F2',
  },
  emptyText: { flex: 1, fontSize: rf(12.5), color: '#6B7280' },
});
