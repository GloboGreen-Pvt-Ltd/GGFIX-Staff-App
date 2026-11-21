import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, AppState, Linking, FlatList } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle, Ban, CalendarDays, Check, X, CalendarRange, CircleAlert, CircleCheck, CircleX, ClipboardCheck, History, MapPin, Navigation, Phone, RefreshCw, Repeat, Search, Truck, WifiOff, Wrench,
  ArrowLeft, Package, ShoppingCart, User,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listMyAssignedPickups } from '../api/pickups';
import { listMyDeliveries, DELIVERY_STATUS } from '../api/buyDeliveries';
import { listRepairDeliveries } from '../api/repairDeliveries';
import { slotText, statusTone } from './delivery/RepairDeliveriesScreen';
import { rf, rs } from '../utils/responsive';
import { useHideNativeHeader } from '../components/MintScreenHeader';
import { SearchBar } from '../components/rnr';
import { DevicePhoto, KIT, toneOf } from '../components/JobCardKit';
import { callCustomer, openDirections } from '../components/PickupCard';
import usePickupAdvance from '../utils/usePickupAdvance';
import { syncPickupReminders } from '../utils/checkoutAlarm';
import {
  PICKUP_STEPS, awaitingAccept, bucketOf, bySchedule, cancelInfo, customerPhone, dayKey, deviceLabel, isActive, isPastPickup, isReassigned, issueLabel,
  nextStepFor, overlapsFor, pickupDay, serverAcceptance, slotLabel, slotStartAt, statusMeta, stepIndex, tabBucketOf, todayKey, trackingId,
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

// Keep the old array when a re-read brings the same rows, so the 30 s sync doesn't redraw every card.
const same = (prev, next) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
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
  { key: 'total', label: 'All', title: 'All Pickups', icon: Truck, tone: 'teal', color: '#035C6C', match: () => true, empty: 'No pickups.' },
  { key: 'today', label: 'Today', title: "Today's Pickups", icon: CalendarDays, tone: 'blue', color: '#0788C9', empty: 'No pickups scheduled for today.' },
  { key: 'assigned', label: 'Assigned', title: 'Assigned Pickups', icon: ClipboardCheck, tone: toneOf('#1C3053'), color: '#1C3053', match: (b) => tabBucketOf(b) === 'ASSIGNED', empty: 'No assigned pickups.' },
  { key: 'inProgress', label: 'In Progress', title: 'In Progress Pickups', icon: Truck, tone: 'orange', color: '#FAA700', match: (b) => tabBucketOf(b) === 'IN_PROGRESS', empty: 'No pickups in progress.' },
  { key: 'completed', label: 'Completed', title: 'Completed Pickups', icon: CircleCheck, tone: 'green', color: '#609138', match: (b) => tabBucketOf(b) === 'COMPLETED', empty: 'No completed pickups.' },
  { key: 'failed', label: 'Failed', title: 'Failed Pickups', icon: CircleX, tone: 'red', color: '#F32C26', match: (b) => cancelInfo(b)?.byMe === true, empty: 'No failed pickups.' },
  { key: 'cancelled', label: 'Cancelled', title: 'Cancelled Pickups', icon: Ban, tone: toneOf('#6B7280'), color: '#6B7280', match: (b) => cancelInfo(b)?.byMe === false, empty: 'No cancelled pickups.' },
  { key: 'reassigned', label: 'Reassigned', title: 'Reassigned Pickups', icon: Repeat, tone: 'orange', color: '#FAA700', match: (b) => isReassigned(b), empty: 'No reassigned pickups.' },
];

// My Pickups — the pickup person's dashboard: status summary, then Today's
// pickups, pickups reassigned to them and their other active assignments.
export default function MyJobsScreen({ navigation, route }) {
  useHideNativeHeader(navigation);
  const sellOnly = route?.params?.kind === 'SELL';
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const loadedOnce = useRef(false);
  // Last known rail tab per pickup: a server-confirmed move (Accept → In Progress,
  // hand over → Completed) switches the rail to that tab and lists the job first.
  const prevTab = useRef(null);
  const [moved, setMoved] = useState(null); // { id, tab }

  // GET /technicians/me/pickup-bookings — the server scopes it to the caller
  // (JWT userId + shopId → their pickup-person row). A failed re-read keeps
  // the last list on screen and shows the error above it.
  // Fixed-price Buy deliveries assigned to me (marketplace) — separate list, shown as a card here.
  // Marketplace orders + repair return deliveries (own APIs); a failed read keeps the last rows.
  const [market, setMarket] = useState([]);
  const [returns, setReturns] = useState([]);

  const load = useCallback(async (mode = 'silent') => {
    if (mode === 'refresh') setRefreshing(true);
    if (!sellOnly) {
      const uniq = (rows) => { const s = new Set(); return rows.filter((r) => r?.id && !s.has(r.id) && s.add(r.id)); };
      listMyDeliveries().then((r) => { if (Array.isArray(r)) setMarket((p) => same(p, uniq(r))); }).catch(() => {});
      listRepairDeliveries().then((r) => { if (Array.isArray(r)) setReturns((p) => same(p, uniq(r))); }).catch(() => {});
    }
    try {
      const items = await listMyAssignedPickups();
      // One entry per server pickup id (distinct pickups are never merged).
      const seen = new Set();
      const rows = (Array.isArray(items) ? items : []).filter((b) => b?.id && !seen.has(b.id) && seen.add(b.id));
      // Repair pickups vs device-purchase (kind SELL) pickups: separate screens.
      // My Jobs lists repair + selling pickups (tabs split them); the Selling screen only SELL.
      const mine = rows.filter((b) => (sellOnly ? b.kind === 'SELL' : true));
      setList((p) => same(p, mine));
      const tabs = new Map(mine.map((b) => [b.id, tabBucketOf(b)]));
      if (prevTab.current) {
        const hit = mine.find((b) => {
          const was = prevTab.current.get(b.id);
          const now = tabs.get(b.id);
          return (was === 'ASSIGNED' && now === 'IN_PROGRESS') || (was === 'IN_PROGRESS' && now === 'COMPLETED');
        });
        if (hit) setMoved({ id: hit.id, tab: tabs.get(hit.id) === 'COMPLETED' ? 'completed' : 'inProgress' });
      }
      prevTab.current = tabs;
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
  useEffect(() => { if (moved) setFilter(moved.tab); }, [moved]);
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
    const top = (b) => (moved && b.id === moved.id ? 0 : 1);
    return base.filter((b) => tileOk(b) && dateOk(b) && searchOk(b)).sort((a, b) => top(a) - top(b) || bySchedule(a, b));
  }, [filtering, activeTile, term, dateFilter, list, scoped, todayList, today, moved]);
  const filterTitle = term ? 'Search Results'
    : [activeTile?.title, dateFilter !== 'all' ? DATE_FILTERS.find((d) => d.key === dateFilter).label : null].filter(Boolean).join(' · ');
  const clearFilters = () => { setFilter(null); setDateFilter('all'); setQ(''); setShowSearch(false); };

  // A pickup opens only once accepted; before that the card's Accept is the way in.
  const acceptFirst = () => notify('Accept the pickup first', 'Tap "Accept & Start Journey" to open its details.', { type: 'warning' });
  const open = (b) => (awaitingAccept(b) ? acceptFirst() : navigation.navigate('PickupDetails', { bookingId: b.id, booking: b }));
  const nextPill = (b, busy, next) => (next ? (
    <TouchableOpacity onPress={busy ? undefined : () => advance(b)} disabled={busy} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={next.label} style={j.nextBtn}>
      {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={j.nextText} numberOfLines={1}>{next.label}</Text>}
    </TouchableOpacity>
  ) : null);
  // One card per row, whatever the module; each opens its own existing details screen.
  const renderPickup = (b) => {
    const st = statusMeta(b.status);
    const re = isReassigned(b) && isActive(b);
    const next = nextStepFor(b);
    const busy = busyId === b.id;
    const clash = overlapsFor(b, list);
    const clashLine = { icon: AlertTriangle, text: clash.length ? `Overlaps ${clash.map((o) => `${trackingId(o)} (${slotLabel(o)})`).join(', ')}` : null };
    const date = [cardDate(pickupDay(b)), slotLabel(b).replace(/ – /g, '–')].filter(Boolean).join(' · ');
    const cat = b.kind === 'SELL' ? 'SELL' : 'REPAIR';
    if (b.preview) {
      return (
        <MyJobCard key={`p${b.id}`} cat={cat} photo={b} ribbon={re ? 'Reassigned' : 'New Assignment'} ribbonColor={re ? '#FAA700' : st.color}
          refText={trackingId(b)} title="Pickup assigned to you" date={date} assigner={b.assignedByName}
          lines={[{ text: 'Accept to see the customer, address and device.' }, clashLine]}
          onCall={acceptFirst} onNav={acceptFirst} onPress={acceptFirst}
          extra={serverAcceptance(b) ? (
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.rejectBtn} onPress={() => setDeclineFor(b)} disabled={busy} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Reject pickup">
                <View style={styles.rejectDot}><X size={rs(10)} color="#FFFFFF" strokeWidth={3} /></View>
                <Text style={styles.rejectText} numberOfLines={1}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => advance(b)} disabled={busy} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Accept pickup">
                {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
                  <>
                    <View style={styles.acceptDot}><Check size={rs(10)} color="#035C6C" strokeWidth={3} /></View>
                    <Text style={styles.acceptText} numberOfLines={1}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : nextPill(b, busy, next)}
        />
      );
    }
    return (
      <MyJobCard key={`p${b.id}`} cat={cat} photo={b}
        ribbon={re ? 'Reassigned' : stepIndex(b.status) === 0 && b.accepted ? 'Accepted' : st.label} ribbonColor={re ? '#FAA700' : st.color}
        refText={trackingId(b)} title={deviceLabel(b)} date={date} assigner={b.assignedByName}
        lines={[{ text: b.customerName }, { text: issueLabel(b) }, { text: b.pickupAddressText }, { icon: CircleAlert, text: cancelInfo(b)?.note }, clashLine]}
        onCall={customerPhone(b) ? () => callCustomer(b) : null}
        onNav={b.pickupAddressText ? () => openDirections(b) : null}
        onPress={() => open(b)}
        extra={nextPill(b, busy, next)}
      />
    );
  };
  const renderMarket = (o) => (
    <MyJobCard key={`m${o.id}`} cat="MARKET" photo={{ id: o.id, deviceImageUrl: o.productImage, deviceDisplayName: o.productTitle }}
      ribbon={DELIVERY_STATUS[o.status] || o.status} ribbonColor={marketTone(o.status)}
      refText={o.orderNumber ? `#${o.orderNumber}` : null} title={`${o.productTitle || 'Order'}${o.quantity > 1 ? ` × ${o.quantity}` : ''}`}
      lines={[{ text: o.customerName }, { text: o.shopName ? `From ${o.shopName}` : null }, { text: o.deliveryAddress }]}
      date={shortDate(o.updatedAt || o.createdAt)} assigner={o.assignedByName}
      onCall={o.customerPhone ? () => dial(o.customerPhone) : null}
      onNav={o.deliveryAddress ? () => mapsTo(o.deliveryAddress) : null}
      onPress={() => navigation.navigate('BuyDelivery', { id: o.id })}
    />
  );
  const renderReturn = (d) => (
    <MyJobCard key={`d${d.id}`} cat="DELIVERY" photo={{ id: d.id, deviceImageUrl: d.deviceImageUrl, deviceDisplayName: d.device }}
      ribbon={d.statusLabel || d.status} ribbonColor={statusTone(d.status)}
      refText={d.bookingNumber ? `#${d.bookingNumber}` : null} title={d.device || 'Repair delivery'}
      lines={[{ text: d.customerName }, { text: d.amountDue > 0 && d.status !== 'DELIVERED' ? `Collect ₹${d.amountDue}` : null }, { text: d.customerAddress }]}
      date={d.scheduledDate ? slotText(d) : null} assigner={d.assignedByName}
      onCall={d.customerPhone ? () => dial(d.customerPhone) : null}
      onNav={d.customerAddress ? () => mapsTo(d.customerAddress) : null}
      onPress={() => navigation.navigate('RepairDelivery', { id: d.id })}
    />
  );

  // Category tabs (All · Repair · Selling · Market · Delivery) over real rows.
  const [cat, setCat] = useState(sellOnly ? 'SELL' : 'ALL');
  const catCounts = useMemo(() => {
    const sell = list.filter((b) => b.kind === 'SELL').length;
    const c = { REPAIR: list.length - sell, SELL: sell, MARKET: market.length, DELIVERY: returns.length };
    return { ...c, ALL: c.REPAIR + c.SELL + c.MARKET + c.DELIVERY };
  }, [list, market, returns]);
  const has = (vals) => !term || vals.some((v) => String(v || '').toLowerCase().includes(term));
  const pickupRows = (filtering ? filteredList : [...todayList, ...reassignList, ...recentList])
    .filter((b) => cat === 'ALL' || cat === (b.kind === 'SELL' ? 'SELL' : 'REPAIR'));
  // Status / date filters are pickup filters; deliveries follow the tab + search only.
  const extraOk = !activeTile && dateFilter === 'all';
  const marketRows = extraOk && (cat === 'ALL' || cat === 'MARKET') ? market.filter((o) => has([o.orderNumber, o.productTitle, o.customerName, o.customerPhone, o.deliveryAddress])) : [];
  const returnRows = extraOk && (cat === 'ALL' || cat === 'DELIVERY') ? returns.filter((d) => has([d.bookingNumber, d.device, d.customerName, d.customerPhone, d.customerAddress])) : [];
  const total = pickupRows.length + marketRows.length + returnRows.length;

  const firstLoad = loading && list.length === 0;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={j.head}>
        {navigation.canGoBack() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Back" style={{ marginRight: rs(10) }}>
            <ArrowLeft size={rs(22)} color="#111111" strokeWidth={2.3} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={j.title} numberOfLines={1}>{sellOnly ? 'Selling Pickups' : 'My Jobs'}</Text>
          <Text style={j.sub} numberOfLines={1}>Assigned by Partner</Text>
        </View>
        <TouchableOpacity onPress={() => { if (showSearch) setQ(''); setShowSearch(!showSearch); }} hitSlop={6} accessibilityLabel="Search jobs"
          style={[j.headBtn, showSearch && { backgroundColor: KIT.teal }]}>
          <Search size={rs(18)} color={showSearch ? '#FFFFFF' : KIT.teal} strokeWidth={2.3} />
        </TouchableOpacity>
        {sellOnly ? null : (
          <>
            <TouchableOpacity onPress={() => navigation.navigate('PickupCalendar')} hitSlop={6} accessibilityLabel="Pickup calendar" style={j.headBtn}>
              <CalendarRange size={rs(18)} color={KIT.teal} strokeWidth={2.3} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('PickupRecords')} hitSlop={6} accessibilityLabel="Pickup history" style={j.headBtn}>
              <History size={rs(18)} color={KIT.teal} strokeWidth={2.3} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {showSearch ? (
        <View style={styles.searchWrap}>
          <SearchBar className="rounded-full py-2.5" value={q} onChangeText={setQ} placeholder="Search job ID, customer, device, phone…" onClear={() => setQ('')} />
        </View>
      ) : null}

      {sellOnly ? null : (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={j.tabs}>
            {CATS.map((c) => {
              const on = cat === c.key;
              const n = firstLoad ? 0 : catCounts[c.key];
              return (
                <TouchableOpacity key={c.key} onPress={() => setCat(c.key)} activeOpacity={0.85} accessibilityRole="tab" accessibilityState={{ selected: on }}
                  style={[j.tab, on && j.tabOn]}>
                  <Text style={[j.tabText, on && { color: '#FFFFFF' }]} numberOfLines={1}>{c.label}</Text>
                  {n > 0 ? <View style={j.badge}><Text style={j.badgeText}>{n > 99 ? '99+' : n}</Text></View> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {activeTile || dateFilter !== 'all' ? (
        <TouchableOpacity onPress={clearFilters} style={j.filterChip} accessibilityRole="button" accessibilityLabel="Clear filter">
          <Text style={j.filterText} numberOfLines={1}>{filterTitle}</Text>
          <X size={rs(13)} color={KIT.teal} strokeWidth={2.6} />
        </TouchableOpacity>
      ) : null}

      {/* Virtualised: only the cards near the screen are drawn. */}
      <FlatList
        style={styles.list}
        contentContainerStyle={j.content}
        data={firstLoad || total === 0 ? [] : [...pickupRows.map((x) => ['p', x]), ...marketRows.map((x) => ['m', x]), ...returnRows.map((x) => ['d', x])]}
        keyExtractor={([t, x]) => `${t}${x.id}`}
        renderItem={({ item: [t, x] }) => (t === 'p' ? renderPickup(x) : t === 'm' ? renderMarket(x) : renderReturn(x))}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={7}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} colors={[KIT.teal]} tintColor={KIT.teal} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<>
        {error ? (
          <TouchableOpacity onPress={() => load('refresh')} activeOpacity={0.85} style={styles.errorCard} accessibilityRole="button">
            <WifiOff size={rs(16)} color="#F32C26" />
            <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
            <View style={styles.retry}><RefreshCw size={rs(12)} color="#FFFFFF" strokeWidth={2.6} /><Text style={styles.retryText}>Retry</Text></View>
          </TouchableOpacity>
        ) : null}
        {firstLoad ? <ActivityIndicator color={KIT.teal} style={{ marginTop: rs(24) }} /> : total === 0 ? (
          <Text style={[styles.emptyLine, { marginTop: rs(8) }]}>
            {term ? `No jobs match "${q.trim()}".` : activeTile && dateFilter === 'all' ? activeTile.empty : 'No jobs assigned yet.'}
          </Text>
        ) : null}
        </>}
      />
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
function Section({ title, icon: Icon, color, count, empty, onClear, children, hideHead = false }) {
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
  cardActions: { flexDirection: 'row', gap: rs(6), marginTop: rs(6) },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(5),
    backgroundColor: '#FDECEC', borderWidth: 1, borderColor: '#F9C9C7', borderRadius: rs(10),
    paddingVertical: rs(4), paddingLeft: rs(5), paddingRight: rs(8),
  },
  rejectDot: { width: rs(18), height: rs(18), borderRadius: rs(9), backgroundColor: '#F32C26', alignItems: 'center', justifyContent: 'center' },
  rejectText: { color: '#F32C26', fontSize: rf(11.5), fontWeight: '700' },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(5),
    backgroundColor: '#035C6C', borderRadius: rs(10),
    paddingVertical: rs(4), paddingLeft: rs(5), paddingRight: rs(8),
    shadowColor: '#035C6C', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  acceptDot: { width: rs(18), height: rs(18), borderRadius: rs(9), backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  acceptText: { color: '#FFFFFF', fontSize: rf(11.5), fontWeight: '700' },
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


// ---------------------------------------------------------------------------
// My Jobs card (all four modules) + category tabs
// ---------------------------------------------------------------------------
const CATS = [
  { key: 'ALL', label: 'All' },
  { key: 'REPAIR', label: 'Repair' },
  { key: 'SELL', label: 'Selling' },
  { key: 'MARKET', label: 'Market' },
  { key: 'DELIVERY', label: 'Delivery' },
];
const CAT_BADGE = {
  REPAIR: { label: 'Repair', Icon: Wrench, color: '#035C6C', bg: '#E5F3F5' },
  SELL: { label: 'Selling', Icon: Package, color: '#4F7F2A', bg: '#E4EFDA' },
  MARKET: { label: 'Marketplace', Icon: ShoppingCart, color: '#D9730D', bg: '#FDEEDC' },
  DELIVERY: { label: 'Delivery', Icon: Truck, color: '#1D5FD6', bg: '#E3ECFB' },
};
const marketTone = (s) => (['DELIVERED', 'COMPLETED'].includes(s) ? '#609138'
  : ['DELIVERY_FAILED', 'RETURNED', 'CANCELLED', 'REJECTED'].includes(s) ? '#F32C26'
    : s === 'ASSIGNED' ? '#609138' : '#035C6C');
const shortDate = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} · ${hh}:${mm}`;
};
const dial = (phone) => Linking.openURL(`tel:${phone}`).catch(() => notify('Could not call', 'No phone app is available.', { type: 'error' }));
const mapsTo = (addr) => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`)
  .catch(() => notify('Could not open Maps', 'No maps app is available.', { type: 'error' }));

function MyJobCard({ cat, photo, ribbon, ribbonColor, refText, title, lines, date, assigner, onCall, onNav, onPress, extra }) {
  const badge = CAT_BADGE[cat];
  const BadgeIcon = badge.Icon;
  return (
    <View style={j.card}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={`${badge.label} job ${refText || ''}`}>
        <View style={{ flexDirection: 'row' }}>
          <View style={j.left}>
            <View style={[j.ribbon, { backgroundColor: ribbonColor || KIT.teal }]}>
              <Text style={j.ribbonText} numberOfLines={1}>{ribbon || '—'}</Text>
            </View>
            <View style={j.photo}><DevicePhoto ticket={photo} /></View>
          </View>
          <View style={j.right}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text style={j.ref} numberOfLines={1}>{refText || ''}</Text>
              <View style={[j.catBadge, { backgroundColor: badge.bg }]}>
                <BadgeIcon size={rs(13)} color={badge.color} strokeWidth={2.4} />
                <Text style={[j.catText, { color: badge.color }]} numberOfLines={1}>{badge.label}</Text>
              </View>
            </View>
            <Text style={j.device} numberOfLines={2}>{title}</Text>
            {lines.filter((l) => l.text).map((l, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginTop: rs(2) }}>
                {l.icon ? <l.icon size={rs(12)} color="#B45309" style={{ marginRight: rs(4) }} /> : null}
                <Text style={[j.line, l.icon && { color: '#B45309' }]} numberOfLines={1}>{l.text}</Text>
              </View>
            ))}
            {date ? <Text style={[j.line, { marginTop: rs(2) }]} numberOfLines={1}>{date}</Text> : null}
          </View>
        </View>
      </TouchableOpacity>
      {extra ? <View style={{ paddingHorizontal: rs(12), paddingBottom: rs(10) }}>{extra}</View> : null}
      <View style={j.bottom}>
        <User size={rs(16)} color="#111111" strokeWidth={2.2} />
        <Text style={j.assigner} numberOfLines={1}>{assigner ? `Assigned by ${assigner}` : 'Assigned by Partner'}</Text>
        {onCall ? (
          <TouchableOpacity onPress={onCall} hitSlop={6} accessibilityRole="button" accessibilityLabel="Call customer" style={[j.roundBtn, { backgroundColor: '#E4EFDA' }]}>
            <Phone size={rs(16)} color="#609138" strokeWidth={2.3} />
          </TouchableOpacity>
        ) : null}
        {onNav ? (
          <TouchableOpacity onPress={onNav} hitSlop={6} accessibilityRole="button" accessibilityLabel="Directions" style={[j.roundBtn, { backgroundColor: '#E5F3F5' }]}>
            <Navigation size={rs(16)} color="#035C6C" strokeWidth={2.3} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const j = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rs(16), paddingTop: rs(6), paddingBottom: rs(10), backgroundColor: '#FFFFFF' },
  title: { fontSize: rf(22), fontWeight: '800', color: '#111111' },
  sub: { fontSize: rf(13), color: '#6B7280', marginTop: rs(1) },
  headBtn: { width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center', marginLeft: rs(8) },
  tabs: { paddingHorizontal: rs(14), paddingTop: rs(10), paddingBottom: rs(8) },
  tab: { height: rs(38), paddingHorizontal: rs(18), borderRadius: rs(19), backgroundColor: '#EEF1F3', alignItems: 'center', justifyContent: 'center', marginRight: rs(8) },
  tabOn: { backgroundColor: '#035C6C' },
  tabText: { fontSize: rf(14), fontWeight: '700', color: '#1F2937' },
  badge: { position: 'absolute', top: -rs(8), right: -rs(4), minWidth: rs(20), height: rs(20), borderRadius: rs(10), paddingHorizontal: rs(4), backgroundColor: '#035C6C', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: rf(10), fontWeight: '800', color: '#FFFFFF' },
  filterChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: rs(16), marginBottom: rs(4), paddingHorizontal: rs(12), paddingVertical: rs(5), borderRadius: rs(14), backgroundColor: '#E5F3F5' },
  filterText: { fontSize: rf(12), fontWeight: '700', color: '#035C6C', marginRight: rs(6) },
  content: { paddingHorizontal: rs(14), paddingTop: rs(6), paddingBottom: rs(110) },
  card: { backgroundColor: '#FFFFFF', borderRadius: rs(16), borderWidth: 1, borderColor: '#E5E7EB', marginBottom: rs(12), overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  left: { width: rs(96), borderRightWidth: 1, borderRightColor: '#EEF0F2', paddingBottom: rs(10) },
  ribbon: { alignSelf: 'flex-start', paddingHorizontal: rs(10), paddingVertical: rs(4), borderBottomRightRadius: rs(12), maxWidth: rs(96) },
  ribbonText: { fontSize: rf(11), fontWeight: '800', color: '#FFFFFF' },
  photo: { width: rs(72), height: rs(78), alignSelf: 'center', marginTop: rs(8), alignItems: 'center', justifyContent: 'center' },
  right: { flex: 1, minWidth: 0, paddingHorizontal: rs(12), paddingVertical: rs(10) },
  ref: { flex: 1, minWidth: 0, fontSize: rf(12.5), fontWeight: '800', color: '#035C6C', marginRight: rs(6), marginTop: rs(3) },
  catBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rs(8), paddingVertical: rs(4), borderRadius: rs(12), flexShrink: 0 },
  catText: { fontSize: rf(11.5), fontWeight: '800', marginLeft: rs(4) },
  device: { fontSize: rf(15), fontWeight: '800', color: '#111111', marginTop: rs(4) },
  line: { flex: 1, fontSize: rf(12.5), color: '#4B5563' },
  nextBtn: { height: rs(36), borderRadius: rs(18), backgroundColor: '#035C6C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(14) },
  nextText: { fontSize: rf(13), fontWeight: '800', color: '#FFFFFF' },
  bottom: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EEF0F2', paddingHorizontal: rs(14), paddingVertical: rs(8) },
  assigner: { flex: 1, minWidth: 0, fontSize: rf(13), fontWeight: '700', color: '#111111', marginLeft: rs(8) },
  roundBtn: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: 'center', justifyContent: 'center', marginLeft: rs(10) },
});
