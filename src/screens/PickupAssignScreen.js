import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, AppState } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle, Ban, CalendarDays, CalendarRange, ChartColumn, CircleAlert, CircleCheck, CircleX, ClipboardCheck, History, MapPin,
  Navigation, Package, Phone, RefreshCw, Repeat, Search, Truck, WifiOff, Wrench,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listMyAssignedPickups } from '../api/pickups';
import { listMyDeliveries } from '../api/buyDeliveries';
import { rf, rs } from '../utils/responsive';
import { useHideNativeHeader } from '../components/MintScreenHeader';
import { SearchBar } from '../components/rnr';
import { JobHeader, JobRail, JobPictureCard, KIT, toneOf } from '../components/JobCardKit';
import { callCustomer, openDirections } from '../components/PickupCard';
import usePickupAdvance from '../utils/usePickupAdvance';
import { syncPickupReminders } from '../utils/checkoutAlarm';
import {
  PICKUP_STEPS, awaitingAccept, bucketOf, bySchedule, cancelInfo, customerPhone, dayKey, deviceLabel, isActive, isPastPickup, isReassigned, issueLabel,
  nextStepFor, overlapsFor, pickupDay, serverAcceptance, slotLabel, slotStartAt, statusMeta, stepIndex, todayKey, trackingId,
} from '../utils/pickups';
import { userMessage } from '../utils/userMessages';
import { notify } from '../components/confirm';
import PickupDeclineSheet from '../components/PickupDeclineSheet';

// The estimate / verification step: from here on the pickup has a saved estimate.
const ESTIMATE_STEP = PICKUP_STEPS.findIndex((st) => st.key === 'ESTIMATE');
// Verify (the saved estimate / verification) only while it matters: an
// estimate is on record and the device isn't handed over yet. Finished
// pickups show it under View instead.
const hasVerification = (b) => b?.kind !== 'SELL' && isActive(b) && stepIndex(b.status) >= ESTIMATE_STEP;
// Quick date filters (across every pickup).
const DATE_FILTERS = [
  { key: 'all', label: 'All dates' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'Next 7 days' },
];

const SYNC_MS = 30000; // re-read while open so the owner's assignments show up
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "2026-10-27" → "27 Oct 2026" (My Jobs card date).
// The year only when it isn't this year, so date + slot fit one row.
const cardDate = (key) => {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!(y && m && d)) return null;
  return `${d} ${MONTHS[m - 1].slice(0, 3)}${y === new Date().getFullYear() ? '' : ` ${y}`}`;
};

// Status rail (My Jobs JobRail): unique-pickup counts over every pickup; Today is
// always today. Filters can overlap (a reassigned pickup that was completed
// is in both) but All counts each pickup once. Failed = cancelled by the
// pickup person; Cancelled = by the shop or customer (last CANCELLED event).
// Tap one to list just those pickups; tap it again for the normal sections.
const TILES = [
  { key: 'total', label: 'All', title: 'All Pickups', icon: ChartColumn, tone: 'teal', color: '#035C6C', match: () => true, empty: 'No pickups.' },
  { key: 'today', label: 'Today', title: "Today's Pickups", icon: CalendarDays, tone: 'blue', color: '#0788C9', empty: 'No pickups scheduled for today.' },
  { key: 'assigned', label: 'Assigned', title: 'Assigned Pickups', icon: Package, tone: toneOf('#1C3053'), color: '#1C3053', match: (b) => bucketOf(b.status) === 'ASSIGNED', empty: 'No assigned pickups.' },
  { key: 'inProgress', label: 'In Progress', title: 'In Progress Pickups', icon: Truck, tone: 'orange', color: '#FAA700', match: (b) => bucketOf(b.status) === 'IN_PROGRESS', empty: 'No pickups in progress.' },
  { key: 'completed', label: 'Completed', title: 'Completed Pickups', icon: CircleCheck, tone: 'green', color: '#609138', match: (b) => bucketOf(b.status) === 'COMPLETED', empty: 'No completed pickups.' },
  { key: 'failed', label: 'Failed', title: 'Failed Pickups', icon: CircleX, tone: 'red', color: '#F32C26', match: (b) => cancelInfo(b)?.byMe === true, empty: 'No failed pickups.' },
  { key: 'cancelled', label: 'Cancelled', title: 'Cancelled Pickups', icon: Ban, tone: toneOf('#6B7280'), color: '#6B7280', match: (b) => cancelInfo(b)?.byMe === false, empty: 'No cancelled pickups.' },
  { key: 'reassigned', label: 'Reassigned', title: 'Reassigned Pickups', icon: Repeat, tone: 'orange', color: '#FAA700', match: (b) => isReassigned(b), empty: 'No reassigned pickups.' },
];

// My Pickups — the pickup person's dashboard: status summary, then Today's
// pickups, pickups reassigned to them and their other active assignments.
export default function PickupAssignScreen({ navigation, route }) {
  useHideNativeHeader(navigation);
  const sellOnly = route?.params?.kind === 'SELL';
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const loadedOnce = useRef(false);

  // GET /technicians/me/pickup-bookings — the server scopes it to the caller
  // (JWT userId + shopId → their pickup-person row). A failed re-read keeps
  // the last list on screen and shows the error above it.
  // Fixed-price Buy deliveries assigned to me (marketplace) — separate list, shown as a card here.
  const [buyOpen, setBuyOpen] = useState(null);
  useFocusEffect(useCallback(() => {
    listMyDeliveries()
      .then((rows) => setBuyOpen((Array.isArray(rows) ? rows : []).filter((o) => ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(o.status)).length))
      .catch(() => setBuyOpen(null));
  }, []));

  const load = useCallback(async (mode = 'silent') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const items = await listMyAssignedPickups();
      // One entry per server pickup id (distinct pickups are never merged).
      const seen = new Set();
      const rows = (Array.isArray(items) ? items : []).filter((b) => b?.id && !seen.has(b.id) && seen.add(b.id));
      // Repair pickups vs device-purchase (kind SELL) pickups: separate screens.
      setList(rows.filter((b) => (sellOnly ? b.kind === 'SELL' : b.kind !== 'SELL')));
      // 30 / 15-minute reminders for pickups not yet started (OS notifications;
      // a no-op in Expo Go). Re-synced every load, so changes drop stale ones.
      syncPickupReminders(rows.filter((b) => bucketOf(b.status) === 'ASSIGNED').map((b) => ({
        id: b.id,
        startAt: slotStartAt(b),
        title: b.customerName || trackingId(b),
        body: [deviceLabel(b), slotLabel(b), b.pickupAddressText].filter(Boolean).join(' · '),
      })));
      setError(null);
    } catch (e) {
      setError(userMessage(e, 'Could not load pickups.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sellOnly]);

  useFocusEffect(useCallback(() => {
    if (!loadedOnce.current) setLoading(true);
    loadedOnce.current = true;
    load();
    const id = setInterval(() => { if (AppState.currentState === 'active') load(); }, SYNC_MS);
    return () => clearInterval(id);
  }, [load]));

  const { advance, busyId } = usePickupAdvance({ navigation, onDone: load });

  const today = todayKey();
  // Every assigned pickup (no month filter, same as My Jobs); the rail tiles
  // and date chips narrow it down.
  const scoped = list;

  // Completed / failed pickups stay listed (with their status) instead of
  // dropping off once handed over; only "Reassigned to You" is in-hand only.
  const todayList = useMemo(() => scoped.filter((b) => pickupDay(b) === today).sort(bySchedule), [scoped, today]);
  const reassignList = useMemo(() => scoped.filter((b) => isActive(b) && isReassigned(b) && pickupDay(b) !== today).sort(bySchedule), [scoped, today]);
  const recentList = useMemo(() => scoped.filter((b) => !(isActive(b) && isReassigned(b)) && pickupDay(b) !== today).sort(bySchedule), [scoped, today]);

  const counts = useMemo(() => Object.fromEntries(TILES.map((t) => [
    t.key, t.key === 'today' ? todayList.length : scoped.filter(t.match).length,
  ])), [scoped, todayList]);

  const [filter, setFilter] = useState(route?.params?.filter || null); // a TILES key, or null for the sections
  // Home's Pickup Overview opens this screen on a status (params.filter).
  const paramFilter = route?.params?.filter;
  useEffect(() => {
    if (!paramFilter) return;
    setFilter(paramFilter);
    navigation.setParams({ filter: undefined });
  }, [paramFilter, navigation]);
  const activeTile = TILES.find((t) => t.key === filter) || null;
  // Quick search (ID / customer / device / phone / address) and date filter
  // run across every pickup; the rail filter still applies.
  const [showSearch, setShowSearch] = useState(false);
  const [declineFor, setDeclineFor] = useState(null); // booking in the Decline sheet
  const [q, setQ] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const term = q.trim().toLowerCase();
  const filtering = !!activeTile || !!term || dateFilter !== 'all';
  const filteredList = useMemo(() => {
    if (!filtering) return [];
    const plus = (n) => dayKey(new Date(Date.now() + n * 86400000));
    const dateOk = (b) => {
      const k = pickupDay(b);
      if (dateFilter === 'today') return k === today;
      if (dateFilter === 'tomorrow') return k === plus(1);
      if (dateFilter === 'week') return k >= today && k <= plus(6);
      return true;
    };
    const searchOk = (b) => !term || [trackingId(b), b.bookingNumber, b.customerName, deviceLabel(b), customerPhone(b), b.pickupAddressText]
      .some((v) => String(v || '').toLowerCase().includes(term));
    const base = term || dateFilter !== 'all' ? list : activeTile?.key === 'today' ? todayList : scoped;
    const tileOk = (b) => !activeTile || (activeTile.key === 'today' ? pickupDay(b) === today : activeTile.match(b));
    return base.filter((b) => tileOk(b) && dateOk(b) && searchOk(b)).sort(bySchedule);
  }, [filtering, activeTile, term, dateFilter, list, scoped, todayList, today]);
  const filterTitle = term ? 'Search Results'
    : [activeTile?.title, dateFilter !== 'all' ? DATE_FILTERS.find((d) => d.key === dateFilter).label : null].filter(Boolean).join(' · ');
  const clearFilters = () => { setFilter(null); setDateFilter('all'); setQ(''); setShowSearch(false); };

  // A pickup opens only once accepted; before that the card's Accept is the way in.
  const acceptFirst = () => notify('Accept the pickup first', 'Tap "Accept & Start Journey" to open its details.', { type: 'warning' });
  const open = (b) => (awaitingAccept(b) ? acceptFirst() : navigation.navigate('PickupDetails', { bookingId: b.id, booking: b }));
  // My Jobs picture card. VIEW = Pickup Details; the pill is the next step the
  // server allows (tap = advance), shown only when there is one; History under
  // it opens the full event timeline.
  // Call + Directions, right of the status line. Not accepted yet: the
  // customer details are hidden, so a tap asks to accept first.
  const contactIcons = (b, locked = false) => (
          <>
            {locked || customerPhone(b) ? (
              <TouchableOpacity onPress={() => (locked ? acceptFirst() : callCustomer(b))} hitSlop={6} accessibilityRole="button" accessibilityLabel="Call customer"
                style={{ width: rs(26), height: rs(26), borderRadius: rs(13), backgroundColor: '#E4EFDA', alignItems: 'center', justifyContent: 'center', marginLeft: rs(8) }}>
                <Phone size={rs(13)} color="#609138" strokeWidth={2.4} />
              </TouchableOpacity>
            ) : null}
            {locked || b.pickupAddressText ? (
              <TouchableOpacity onPress={() => (locked ? acceptFirst() : openDirections(b))} hitSlop={6} accessibilityRole="button" accessibilityLabel="Directions"
                style={{ width: rs(26), height: rs(26), borderRadius: rs(13), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center', marginLeft: rs(8) }}>
                <Navigation size={rs(13)} color="#035C6C" strokeWidth={2.4} />
              </TouchableOpacity>
            ) : null}
          </>
  );
  const renderCards = (rows) => rows.map((b) => {
    const st = statusMeta(b.status);
    const re = isReassigned(b) && isActive(b);
    const next = nextStepFor(b);
    const busy = busyId === b.id;
    const clash = overlapsFor(b, list);
    // Not accepted yet: assignment preview only (api/pickups previewOf) — ID,
    // schedule and Accept; no customer, address, device or card actions.
    if (b.preview) {
      return (
        <JobPictureCard
          key={b.id}
          compact
          ticket={b}
          tab={re ? 'Reassigned' : 'New Assignment'}
          tabColor={re ? '#FAA700' : st.color}
          refText={trackingId(b)}
          model="Pickup assigned to you"
          lines={[
            { text: 'Accept to see the customer, address and device.' },
            { icon: AlertTriangle, text: clash.length ? `Overlaps ${clash.map((o) => `${trackingId(o)} (${slotLabel(o)})`).join(', ')}` : null },
          ]}
          date={[cardDate(pickupDay(b)), slotLabel(b).replace(/ – /g, '–')].filter(Boolean).join(' · ')}
          time={null}
          bottomPill={next ? { text: busy ? 'Updating…' : next.label, onPress: busy ? () => {} : () => advance(b) } : null}
          statusLine={re ? 'Reassigned to you' : 'Awaiting your acceptance'}
          statusColor={re ? '#FAA700' : st.color}
          statusRight={contactIcons(b, true)}
          footer={serverAcceptance(b) ? (
            <TouchableOpacity onPress={() => setDeclineFor(b)} disabled={busy} activeOpacity={0.85} accessibilityRole="button"
              accessibilityLabel="Decline pickup" style={styles.declineBtn}>
              <CircleX size={rs(14)} color="#F32C26" strokeWidth={2.4} />
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          ) : null}
          onPress={acceptFirst}
        />
      );
    }
    return (
      <JobPictureCard
        key={b.id}
        compact
        ticket={b}
        tab={re ? 'Reassigned' : stepIndex(b.status) === 0 && b.accepted ? 'Accepted' : st.label}
        tabColor={re ? '#FAA700' : st.color}
        refText={trackingId(b)}
        model={deviceLabel(b)}
        lines={[
          { text: b.customerName || 'Customer' },
          { text: issueLabel(b) },
          { text: b.pickupAddressText },
          { icon: CircleAlert, text: cancelInfo(b)?.note },
          // Schedule clash with another pickup still in hand the same day.
          { icon: AlertTriangle, text: clash.length ? `Overlaps ${clash.map((o) => `${trackingId(o)} (${slotLabel(o)})`).join(', ')}` : null },
        ]}
        date={[cardDate(pickupDay(b)), slotLabel(b).replace(/ – /g, '–')].filter(Boolean).join(' · ')}
        time={null}
        {...{ [b.kind === 'SELL' ? 'bottomPill' : 'pill']: next ? { text: busy ? 'Updating…' : next.label, onPress: busy ? () => {} : () => advance(b) } : null }}
        statusLine={st.label}
        statusColor={st.color}
        statusRight={contactIcons(b)}
        footer={(
          <PickupActions
            booking={b}
            onHistory={() => (awaitingAccept(b) ? acceptFirst() : navigation.navigate('PickupHistory', { booking: b }))}
            onVerify={hasVerification(b) ? () => navigation.navigate('PickupEstimateDetail', { booking: b, bookingId: b.id }) : null}
          />
        )}
        onPress={() => open(b)}
      />
    );
  });
  const firstLoad = loading && list.length === 0;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <JobHeader
        navigation={navigation}
        title={sellOnly ? 'Purchase Pickups' : 'My Pickups'}
        sub={sellOnly ? 'Marketplace' : 'Repair Pickups'}
        searchOn={showSearch}
        onSearch={() => { if (showSearch) setQ(''); setShowSearch(!showSearch); }}
        right={sellOnly ? null : (
          <>
            <TouchableOpacity onPress={() => navigation.navigate('PickupCalendar')} hitSlop={6} accessibilityLabel="Pickup calendar" activeOpacity={0.8} style={styles.headBtn}>
              <CalendarRange size={rs(17)} color={KIT.teal} strokeWidth={2.3} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('PickupRecords')} hitSlop={6} accessibilityLabel="Pickup history" activeOpacity={0.8} style={styles.headBtn}>
              <History size={rs(17)} color={KIT.teal} strokeWidth={2.3} />
            </TouchableOpacity>
          </>
        )}
      />

      {showSearch ? (
        <View style={styles.searchWrap}>
          <SearchBar className="rounded-full py-2.5" value={q} onChangeText={setQ} placeholder="Search pickup ID, customer, device, phone…" onClear={() => setQ('')} />
        </View>
      ) : null}

      <View style={styles.body}>
        <JobRail items={TILES} counts={firstLoad ? {} : counts} active={filter} onPick={(k) => setFilter((f) => (f === k ? null : k))} softBorder />
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} colors={[KIT.teal]} tintColor={KIT.teal} />}
        showsVerticalScrollIndicator={false}
      >
        <View>

          {error ? (
            <TouchableOpacity onPress={() => load('refresh')} activeOpacity={0.85} style={styles.errorCard} accessibilityRole="button">
              <WifiOff size={rs(16)} color="#F32C26" />
              <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
              <View style={styles.retry}><RefreshCw size={rs(12)} color="#FFFFFF" strokeWidth={2.6} /><Text style={styles.retryText}>Retry</Text></View>
            </TouchableOpacity>
          ) : null}

          {firstLoad ? <ActivityIndicator color={KIT.teal} style={{ marginTop: rs(24) }} /> : filtering ? (
            <Section hideHead title={filterTitle} icon={term ? Search : activeTile?.icon || CalendarDays}
              color={activeTile?.color || '#035C6C'} count={filteredList.length}
              empty={term ? `No pickups match "${q.trim()}".` : activeTile && dateFilter === 'all' ? activeTile.empty : 'No pickups for this filter.'}
              onClear={activeTile?.key === 'total' && !term && dateFilter === 'all' ? null : clearFilters}>
              {renderCards(filteredList)}
            </Section>
          ) : (
            // Only sections with pickups; one line when there are none.
            todayList.length + reassignList.length + recentList.length === 0 ? (
              <Text style={[styles.emptyLine, { marginTop: rs(4) }]}>No pickups assigned yet.</Text>
            ) : (
            <>
              {todayList.length ? (
                <>{renderCards(todayList)}</>
              ) : null}
              {reassignList.length ? (
                <Section title="Reassigned to You" icon={Repeat} color="#FAA700" count={reassignList.length}>{renderCards(reassignList)}</Section>
              ) : null}
              {recentList.length ? (
                <>{renderCards(recentList)}</>
              ) : null}
            </>
            )
          )}
        </View>
      </ScrollView>
      </View>
      <PickupDeclineSheet booking={declineFor} visible={!!declineFor} onClose={() => setDeclineFor(null)} onDone={load} />
    </SafeAreaView>
  );
}

// Call / Directions / History (+ Verify once an estimate is saved) under the
// phase pill: icon circle, short label below.
function PickupActions({ booking, onHistory, onVerify }) {
  const phone = customerPhone(booking);
  const btns = [
    ...(onVerify ? [{ key: 'verify', Icon: ClipboardCheck, color: '#0788C9', text: 'Verify', label: 'Pickup verification', onPress: onVerify }] : []),
  ];
  return (
    <View style={styles.actions}>
      {btns.map(({ key, Icon, color, text, label, onPress, off }) => (
        <TouchableOpacity key={key} onPress={onPress} disabled={off} hitSlop={4} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={label}
          style={[styles.action, off && { opacity: 0.45 }]}>
          <View style={[styles.actionBtn, { backgroundColor: `${color}12`, borderColor: `${color}33` }]}>
            <Icon size={rs(14)} color={color} strokeWidth={2.4} />
          </View>
          <Text style={[styles.actionText, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{text}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Section title with a count; an empty section is a single muted line.
// onClear (filtered list): a "Show all" link back to the normal sections.
export function Section({ title, icon: Icon, color, count, empty, onClear, children, hideHead = false }) {
  return (
    <View style={styles.section}>
      {hideHead ? null : <View style={styles.sectionHead}>
        <View style={[styles.sectionDisc, { backgroundColor: color }]}><Icon size={rs(12)} color="#FFFFFF" strokeWidth={2.5} /></View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={[styles.countPill, { backgroundColor: `${color}1A` }]}><Text style={[styles.countText, { color }]}>{count}</Text></View>
        {onClear ? (
          <TouchableOpacity onPress={onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Show all pickups" style={styles.clearBtn}>
            <Text style={styles.clearText}>Show all</Text>
          </TouchableOpacity>
        ) : null}
      </View>}
      {count ? children : <Text style={styles.emptyLine}>{empty}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  // Layout values from My Jobs (JobReportScreen).
  safe: { flex: 1, backgroundColor: KIT.white },
  body: { flex: 1, flexDirection: 'row', backgroundColor: KIT.white },
  list: { flex: 1 },
  content: { paddingTop: rs(10), paddingLeft: rs(11), paddingRight: rs(9), paddingBottom: rs(24) },
  searchWrap: { paddingHorizontal: rs(12), paddingVertical: rs(8), backgroundColor: KIT.white, borderBottomWidth: 1, borderBottomColor: KIT.line },
  chips: { gap: rs(6), paddingBottom: rs(4) },
  chip: { paddingHorizontal: rs(11), paddingVertical: rs(5), borderRadius: 999, borderWidth: 1, borderColor: KIT.line, backgroundColor: KIT.white },
  chipOn: { backgroundColor: KIT.teal, borderColor: KIT.teal },
  chipText: { fontSize: rf(11.5), fontWeight: '800', color: '#1C3053' },
  headBtn: { width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: KIT.tealTint, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: rs(4), marginTop: rs(6) },
  declineBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: rs(5), marginTop: rs(6),
    paddingHorizontal: rs(10), paddingVertical: rs(5), borderRadius: rs(9), borderWidth: 1.2, borderColor: '#F32C26', backgroundColor: '#FFFFFF',
  },
  declineText: { fontSize: rf(12), fontWeight: '800', color: '#F32C26' },
  action: { flex: 1, alignItems: 'center' },
  actionBtn: { width: rs(28), height: rs(28), borderRadius: rs(14), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionText: { marginTop: rs(2), fontSize: rf(9.5), fontWeight: '700' },
  clearBtn: { paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: 999, borderWidth: 1, borderColor: '#035C6C' },
  clearText: { fontSize: rf(11), fontWeight: '800', color: '#035C6C' },
  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8), marginTop: rs(10), padding: rs(10), borderRadius: rs(12),
    backgroundColor: '#FEECEC', borderWidth: 1, borderColor: '#FBD5D4',
  },
  errorText: { flex: 1, fontSize: rf(12), fontWeight: '700', color: '#B42318' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: rs(4), backgroundColor: '#F32C26', borderRadius: 999, paddingHorizontal: rs(10), paddingVertical: rs(5) },
  retryText: { fontSize: rf(11), fontWeight: '800', color: '#FFFFFF' },
  section: { marginTop: rs(6), marginBottom: rs(4) },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: rs(7), marginBottom: rs(7) },
  sectionDisc: { width: rs(22), height: rs(22), borderRadius: rs(11), alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: rf(14.5), fontWeight: '800', color: '#1C3053' },
  countPill: { minWidth: rs(26), paddingHorizontal: rs(8), paddingVertical: rs(2), borderRadius: 999, alignItems: 'center' },
  countText: { fontSize: rf(11.5), fontWeight: '800' },
  emptyLine: {
    fontSize: rf(12), color: '#6B7280', backgroundColor: '#FFFFFF', borderRadius: rs(12), borderWidth: 1, borderColor: '#EEF0F2',
    paddingVertical: rs(10), paddingHorizontal: rs(12),
  },
});
