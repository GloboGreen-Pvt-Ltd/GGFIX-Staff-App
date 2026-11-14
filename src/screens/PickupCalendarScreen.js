import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AlertTriangle, Calendar, CalendarDays, CalendarRange, CalendarX, CheckCircle2, ChevronLeft, ChevronRight, CircleX, Clock, MapPin, Package, RefreshCw, Smartphone, Truck, WifiOff } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { useHideNativeHeader } from '../components/MintScreenHeader';
import { JobHeader, KIT } from '../components/JobCardKit';
import { listMyAssignedPickups } from '../api/pickups';
import { bucketOf, dayKey, deviceLabel, minutesOf, overlapsFor, pickupDay, slotLabel, statusMeta, trackingId } from '../utils/pickups';
import { rf, rs } from '../utils/responsive';
import { userMessage } from '../utils/userMessages';

const HOUR_H = rs(56);
const GUTTER = rs(46);
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const NO_SLOT_START = 9 * 60; // pickups without a slot sit at 09:00 for 30 min

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // Monday
const isCancelled = (b) => String(b?.status).toUpperCase() === 'CANCELLED';

// Minutes [s, e) of a pickup on its day, from its slot.
function span(b) {
  const s = minutesOf(b.pickupSlotStart) ?? NO_SLOT_START;
  const end = minutesOf(b.pickupSlotEnd);
  return { s, e: Math.min(24 * 60, Math.max(s + 20, end != null && end > s ? end : s + 30)) };
}

// Overlapping pickups share the column side by side: greedy lanes per cluster.
function layout(rows) {
  const items = rows.map((b) => ({ b, ...span(b) })).sort((x, y) => x.s - y.s || y.e - x.e);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach((it) => {
      let lane = lanes.findIndex((end) => end <= it.s);
      if (lane < 0) { lane = lanes.length; lanes.push(it.e); } else lanes[lane] = it.e;
      it.lane = lane;
    });
    cluster.forEach((it) => out.push({ ...it, lanes: lanes.length }));
    cluster = [];
  };
  items.forEach((it) => {
    if (cluster.length && it.s >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  });
  if (cluster.length) flush();
  return out;
}

// Pickup calendar (day / week / month, 24-hour) from the caller's own pickup
// bookings — the same list My Pickups reads, one entry per booking id. Blocks
// follow the Partner Tasks Calendar: tinted card, status-coloured left edge.
// Month view lists the selected day's pickups under the grid. Tap a pickup to
// open its details; cancelled ones stay visible, dimmed.
export default function PickupCalendarScreen({ navigation }) {
  useHideNativeHeader(navigation);
  const [mode, setMode] = useState('day'); // 'day' | 'week' | 'month'
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [gridW, setGridW] = useState(0);
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const rows = await listMyAssignedPickups();
      const seen = new Set();
      setList((Array.isArray(rows) ? rows : []).filter((b) => b?.id && !seen.has(b.id) && seen.add(b.id)));
      setError(null);
    } catch (e) {
      setError(userMessage(e, 'Could not load pickups.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const byDay = useMemo(() => {
    const m = new Map();
    list.forEach((b) => { const k = pickupDay(b); if (!m.has(k)) m.set(k, []); m.get(k).push(b); });
    m.forEach((rows) => rows.sort((x, y) => span(x).s - span(y).s));
    return m;
  }, [list]);

  const days = useMemo(() => (mode === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))), [mode, anchor]);

  // Earliest pickup start (minutes) in the day / week on screen; null = none.
  const firstStart = useMemo(() => {
    let min = null;
    days.forEach((d) => (byDay.get(dayKey(d)) || []).forEach((b) => { const v = span(b).s; if (min == null || v < min) min = v; }));
    return min;
  }, [days, byDay]);
  // Open the time grid on the current time when today is on screen, else on
  // the earliest pickup (an hour above it, so it isn't hard against the top).
  useEffect(() => {
    if (mode === 'month' || firstStart == null) return undefined;
    const showsToday = days.some((d) => dayKey(d) === dayKey(new Date()));
    const n = new Date();
    const mins = showsToday ? n.getHours() * 60 + n.getMinutes() : firstStart;
    const y = Math.max(0, ((mins - 60) / 60) * HOUR_H);
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 60);
    return () => clearTimeout(t);
  }, [anchor, mode, firstStart, days]);

  const step = (n) => setAnchor((a) => (mode === 'month'
    ? new Date(a.getFullYear(), a.getMonth() + n, 1)
    : addDays(a, mode === 'day' ? n : 7 * n)));
  const title = mode === 'month'
    ? anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : mode === 'day'
      ? anchor.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
      : `${days[0].toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${days[6].toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
  const now = new Date();
  const todayK = dayKey(now);
  const anchorK = dayKey(anchor);
  const colW = gridW > 0 ? gridW / days.length : 0;
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H;
  const openDay = (d) => { setAnchor(startOfDay(d)); setMode('day'); };
  const open = (b) => navigation.navigate('PickupDetails', { bookingId: b.id, booking: b });

  // Month grid: 6 weeks from the Monday on/before the 1st.
  const monthCells = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [anchor]);

  // Pickups in view, for the header line and the empty state.
  const viewRows = mode === 'month'
    ? list.filter((b) => pickupDay(b).startsWith(anchorK.slice(0, 7)))
    : days.flatMap((d) => byDay.get(dayKey(d)) || []);
  const inView = viewRows.length;
  const sub = loading && !list.length ? 'Loading…'
    : `${inView} ${inView === 1 ? 'pickup' : 'pickups'} ${mode === 'day' ? 'on this day' : mode === 'week' ? 'this week' : 'this month'}`;
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[KIT.teal]} tintColor={KIT.teal} />;
  // Nearest days with pickups before / after the day or week on screen.
  const jumps = useMemo(() => {
    if (mode === 'month') return [];
    const keys = [...byDay.keys()].filter(Boolean).sort();
    const first = dayKey(days[0]);
    const lastK = dayKey(days[days.length - 1]);
    const later = keys.find((k) => k > lastK);
    const earlier = [...keys].reverse().find((k) => k < first);
    const toDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
    const fmt = (k) => toDate(k).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
    const go = (k) => () => { setAnchor(toDate(k)); setMode('day'); };
    return [
      later ? { key: 'next', label: 'Next pickup day', day: fmt(later), count: byDay.get(later).length, onPress: go(later) } : null,
      earlier ? { key: 'prev', label: 'Previous pickup day', day: fmt(earlier), count: byDay.get(earlier).length, onPress: go(earlier) } : null,
    ].filter(Boolean);
  }, [mode, byDay, days]);
  // In-hand pickups on screen whose slots clash with another one the same day.
  const clashing = mode === 'month' ? 0
    : days.reduce((n, d) => n + (byDay.get(dayKey(d)) || []).filter((b) => overlapsFor(b, list).length).length, 0);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <JobHeader navigation={navigation} title="Pickup Calendar" sub={loading && !list.length ? sub : 'Manage and view pickup schedule'} />

      {/* Row 1: view switch + Today. Row 2: date navigation (kept apart so neither crowds). */}
      <View style={s.toolbar}>
        <View style={s.seg}>
          {[['day', Calendar], ['week', CalendarDays], ['month', CalendarRange]].map(([m, Icon]) => (
            <TouchableOpacity key={m} onPress={() => setMode(m)} style={[s.segBtn, mode === m && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
              <Icon size={rs(15)} color={mode === m ? '#FFFFFF' : '#1C3053'} strokeWidth={2.2} />
              <Text style={[s.segText, mode === m && { color: '#FFFFFF' }]}>{m[0].toUpperCase() + m.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={s.nav}>
        <View style={s.navPill}>
          <TouchableOpacity onPress={() => step(-1)} style={s.navBtn} hitSlop={8} accessibilityLabel="Previous"><ChevronLeft size={rs(16)} color={KIT.teal} strokeWidth={2.6} /></TouchableOpacity>
          <Calendar size={rs(15)} color={KIT.teal} strokeWidth={2.2} />
          <Text style={s.navTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
          <TouchableOpacity onPress={() => step(1)} style={s.navBtn} hitSlop={8} accessibilityLabel="Next"><ChevronRight size={rs(16)} color={KIT.teal} strokeWidth={2.6} /></TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => setAnchor(startOfDay(new Date()))} style={s.todayBtn} accessibilityLabel="Go to today">
          <Text style={s.todayText}>Today</Text>
        </TouchableOpacity>
      </View>
      {/* Counts for the day / week / month on screen. */}
      <View style={s.stats}>
        {[
          { k: 'total', label: 'Total Pickups', Icon: Truck, color: KIT.teal, n: viewRows.length },
          { k: 'up', label: 'Upcoming', Icon: Clock, color: '#2563EB', n: viewRows.filter((b) => bucketOf(b.status) === 'ASSIGNED').length },
          { k: 'done', label: 'Completed', Icon: CheckCircle2, color: '#16A34A', n: viewRows.filter((b) => bucketOf(b.status) === 'COMPLETED').length },
          { k: 'cx', label: 'Cancelled', Icon: CircleX, color: '#DC2626', n: viewRows.filter((b) => bucketOf(b.status) === 'CANCELLED').length },
        ].map((t) => (
          <View key={t.k} style={[s.stat, t.k === 'total' && s.statOn]}>
            <t.Icon size={rs(16)} color={t.color} strokeWidth={2.2} />
            <Text style={s.statNum}>{t.n}</Text>
            <Text style={s.statLabel} numberOfLines={1}>{t.label}</Text>
          </View>
        ))}
      </View>

      {error ? (
        <TouchableOpacity onPress={() => { setLoading(true); load(); }} activeOpacity={0.85} style={s.errorCard} accessibilityRole="button">
          <WifiOff size={rs(15)} color="#F32C26" />
          <Text style={s.errorText} numberOfLines={2}>{error}</Text>
          <View style={s.retry}><RefreshCw size={rs(11)} color="#FFFFFF" strokeWidth={2.6} /><Text style={s.retryText}>Retry</Text></View>
        </TouchableOpacity>
      ) : null}

      {mode === 'month' ? (
        <ScrollView contentContainerStyle={s.monthWrap} refreshControl={refresh} showsVerticalScrollIndicator={false}>
          <View style={s.monthCard}>
            <View style={s.monthHead}>{DOW.map((d) => <Text key={d} style={s.monthDow}>{d}</Text>)}</View>
            <View style={s.monthGrid}>
              {monthCells.map((d) => {
                const k = dayKey(d);
                const rows = byDay.get(k) || [];
                const out = d.getMonth() !== anchor.getMonth();
                const on = k === anchorK;
                return (
                  <TouchableOpacity key={k} onPress={() => setAnchor(startOfDay(d))} onLongPress={() => openDay(d)} style={s.cell}
                    accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${k}, ${rows.length} pickups`}>
                    <View style={[s.cellNum, on && { backgroundColor: KIT.teal }, !on && k === todayK && s.cellToday]}>
                      <Text style={[s.cellNumText, out && { color: '#C9CDD2' }, on && { color: '#FFFFFF' }]}>{d.getDate()}</Text>
                    </View>
                    <View style={s.cellDots}>
                      {rows.slice(0, 3).map((b) => <View key={b.id} style={[s.cellDot, { backgroundColor: statusMeta(b.status).color }]} />)}
                      {rows.length > 3 ? <Text style={s.cellMore}>+{rows.length - 3}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {loading && !list.length ? <ActivityIndicator color={KIT.teal} style={{ marginTop: rs(12) }} /> : inView === 0 ? (
            error ? null : <NoPickups sub={`Nothing in ${title}`} />
          ) : (
            <>
              <View style={s.agendaHead}>
                <Text style={s.agendaTitle}>{anchor.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}</Text>
                {(byDay.get(anchorK) || []).length ? (
                  <TouchableOpacity onPress={() => openDay(anchor)} hitSlop={6} accessibilityRole="button"><Text style={s.link}>Day timeline</Text></TouchableOpacity>
                ) : null}
              </View>
              {(byDay.get(anchorK) || []).length
                ? (byDay.get(anchorK) || []).map((b) => <AgendaCard key={b.id} booking={b} onPress={() => open(b)} />)
                : <EmptyNote text="No pickups on this day." />}
            </>
          )}
        </ScrollView>
      ) : (
        <>
          {mode === 'week' ? (
            <View style={[s.weekHead, { paddingLeft: GUTTER }]}>
              {days.map((d, i) => {
                const k = dayKey(d);
                const n = (byDay.get(k) || []).length;
                return (
                  <TouchableOpacity key={k} style={{ flex: 1, alignItems: 'center' }} onPress={() => openDay(d)} accessibilityLabel={`Open ${k}, ${n} pickups`}>
                    <Text style={[s.weekDow, k === todayK && { color: KIT.teal }]}>{DOW[i]}</Text>
                    <View style={[s.weekNum, k === todayK && { backgroundColor: KIT.teal }]}>
                      <Text style={[s.weekNumText, k === todayK && { color: '#FFFFFF' }]}>{d.getDate()}</Text>
                    </View>
                    <View style={[s.weekDot, { backgroundColor: n ? KIT.teal : 'transparent' }]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          {clashing ? (
            <View style={s.clash}>
              <AlertTriangle size={rs(13)} color="#B45309" />
              <Text style={s.clashText}>{clashing} pickups have overlapping time slots {mode === 'day' ? 'on this day' : 'this week'}.</Text>
            </View>
          ) : null}
          {/* No pickups in view: no empty hour grid, just one centred card. */}
          {inView === 0 ? (
            <ScrollView contentContainerStyle={s.emptyWrap} refreshControl={refresh} showsVerticalScrollIndicator={false}>
              {loading && !list.length ? <ActivityIndicator color={KIT.teal} /> : error ? null : (
                <NoPickups
                  sub={mode === 'day' ? anchor.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' }) : `Week of ${title}`}
                  onToday={days.some((d) => dayKey(d) === todayK) ? null : () => setAnchor(startOfDay(new Date()))}
                  jumps={jumps}
                />
              )}
            </ScrollView>
          ) : mode === 'day' ? (
            <ScrollView showsVerticalScrollIndicator={false} refreshControl={refresh} contentContainerStyle={{ paddingBottom: rs(16) }}>
              <DayTimeline rows={byDay.get(anchorK) || []} onOpen={open} />
            </ScrollView>
          ) : (
          <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} refreshControl={refresh}>
            <View style={{ height: HOUR_H * 24, flexDirection: 'row' }}>
              <View style={{ width: GUTTER }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <Text key={h} style={[s.hourLabel, { top: h * HOUR_H - rs(7) }]}>{h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</Text>
                ))}
              </View>
              <View style={{ flex: 1, marginRight: rs(8) }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
                {Array.from({ length: 24 }, (_, h) => <View key={h} style={[s.hourLine, { top: h * HOUR_H }]} />)}
                {mode === 'week' && colW ? days.slice(1).map((d, i) => <View key={dayKey(d)} style={[s.dayLine, { left: (i + 1) * colW }]} />) : null}
                {days.some((d) => dayKey(d) === todayK) && colW ? (
                  <View pointerEvents="none" style={[s.nowLine, { top: nowTop, left: mode === 'day' ? 0 : days.findIndex((d) => dayKey(d) === todayK) * colW, width: colW }]}>
                    <View style={s.nowDot} />
                  </View>
                ) : null}
                {colW ? days.map((d, di) => layout(byDay.get(dayKey(d)) || []).map((it) => (
                  <Block key={`${it.b.id}-${di}`} it={it} di={di} colW={colW} wide={mode === 'day'} onPress={() => open(it.b)} />
                ))) : null}
              </View>
            </View>
          </ScrollView>
          )}
        </>
      )}
      {mode !== 'month' ? (
        <View style={s.legend}>
          {LEGEND.map((l) => (
            <View key={l.label} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: l.color }]} /><Text style={s.legendText}>{l.label}</Text></View>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// Legend colours = pickup bucket (same buckets as the stat cards).
const LEGEND = [
  { label: 'Completed', color: '#16A34A' },
  { label: 'Upcoming', color: '#2563EB' },
  { label: 'In Progress', color: '#F97316' },
  { label: 'Cancelled', color: '#DC2626' },
];
const BUCKET_COLOR = { COMPLETED: '#16A34A', ASSIGNED: '#2563EB', IN_PROGRESS: '#F97316', CANCELLED: '#DC2626' };
const h12 = (mins) => { const h = Math.floor(mins / 60); return `${String(h % 12 || 12).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

// Day view: hour rail on the left; each pickup as a card at its start hour.
function DayTimeline({ rows, onOpen }) {
  const items = rows.map((b) => ({ b, ...span(b) }));
  const firstH = Math.min(10, ...items.map((it) => Math.floor(it.s / 60)));
  const lastH = Math.max(18, ...items.map((it) => Math.floor(it.s / 60)));
  const hours = Array.from({ length: lastH - firstH + 1 }, (_, i) => firstH + i);
  return (
    <View style={{ paddingHorizontal: rs(12), paddingTop: rs(6) }}>
      {hours.map((h) => {
        const here = items.filter((it) => Math.floor(it.s / 60) === h);
        if (!here.length) {
          return (
            <View key={h} style={s.hourRow}>
              <Text style={s.hourText}>{h12(h * 60)}</Text>
              <View style={s.railDot} />
              <View style={s.hourRule} />
            </View>
          );
        }
        return here.map((it) => {
          const b = it.b;
          const st = statusMeta(b.status);
          const color = BUCKET_COLOR[bucketOf(b.status)] || st.color;
          return (
            <View key={b.id} style={s.pickRow}>
              <View style={{ width: rs(78) }}>
                <Text style={s.pickStart}>{h12(it.s)}</Text>
                <Text style={s.pickEnd}>{h12(it.e)}</Text>
              </View>
              <View style={[s.railDot, { backgroundColor: color, marginTop: rs(6) }]} />
              <TouchableOpacity onPress={() => onOpen(b)} activeOpacity={0.85} accessibilityRole="button"
                accessibilityLabel={`${b.customerName || 'Pickup'}, ${deviceLabel(b)}, ${st.label}`}
                style={[s.pickCard, { borderLeftColor: color, backgroundColor: `${color}0F` }, isCancelled(b) && { opacity: 0.6 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.pickTop}>
                    <View style={s.pickIcon}><Package size={rs(13)} color={KIT.teal} strokeWidth={2.2} /></View>
                    <Text style={s.pickName} numberOfLines={1}>{b.customerName || trackingId(b)}</Text>
                    <View style={[s.pill, { backgroundColor: `${color}1A`, flexDirection: 'row', alignItems: 'center', gap: rs(3) }]}>
                      <CheckCircle2 size={rs(10)} color={color} strokeWidth={2.6} />
                      <Text style={[s.pillText, { color }]} numberOfLines={1}>{st.label}</Text>
                    </View>
                  </View>
                  <View style={s.pickLine}><Smartphone size={rs(12)} color={KIT.teal} /><Text style={s.agendaText} numberOfLines={1}>{deviceLabel(b)}</Text></View>
                  {b.pickupAddressText ? <View style={s.pickLine}><MapPin size={rs(12)} color={KIT.teal} /><Text style={s.agendaText} numberOfLines={1}>{b.pickupAddressText}</Text></View> : null}
                </View>
                <ChevronRight size={rs(16)} color="#111111" />
              </TouchableOpacity>
            </View>
          );
        });
      })}
    </View>
  );
}

// One pickup on the time grid: tinted card, status-coloured left edge; the
// lines shown grow with the block (customer → time · status → device → place).
function Block({ it, di, colW, wide, onPress }) {
  const b = it.b;
  const st = statusMeta(b.status);
  const w = colW / it.lanes;
  const height = Math.max(rs(26), ((it.e - it.s) / 60) * HOUR_H - 2);
  // A late pickup (e.g. 23:50) keeps its minimum height inside the 24:00 edge.
  const top = Math.min((it.s / 60) * HOUR_H, HOUR_H * 24 - height - 2);
  const slot = slotLabel(b) || '09:00 · no slot';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${b.customerName || 'Pickup'}, ${deviceLabel(b)}, ${slot}, ${st.label}`}
      style={[s.block, {
        top: top + 1, height, left: di * colW + it.lane * w + 2, width: w - 4,
        backgroundColor: `${st.color}14`, borderLeftColor: st.color, opacity: isCancelled(b) ? 0.55 : 1,
      }]}
    >
      <Text style={s.blockTitle} numberOfLines={1}>{b.customerName || trackingId(b)}</Text>
      {height > rs(36) ? <Text style={s.blockLine} numberOfLines={1}>{slot}{wide ? ` · ${st.label}` : ''}</Text> : null}
      {wide && height > rs(52) ? <Text style={s.blockLine} numberOfLines={1}>{deviceLabel(b)}</Text> : null}
      {wide && height > rs(68) && b.pickupAddressText ? <Text style={s.blockLine} numberOfLines={1}>{b.pickupAddressText}</Text> : null}
    </TouchableOpacity>
  );
}

// Month view list row: time, customer, device, place and status.
function AgendaCard({ booking: b, onPress }) {
  const st = statusMeta(b.status);
  const start = String(b.pickupSlotStart || '').slice(0, 5);
  const end = String(b.pickupSlotEnd || '').slice(0, 5);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button"
      accessibilityLabel={`${b.customerName || 'Pickup'}, ${slotLabel(b) || 'no slot'}, ${st.label}`}
      style={[s.agenda, { borderLeftColor: st.color }, isCancelled(b) && { opacity: 0.6 }]}>
      <View style={s.agendaTime}>
        <Clock size={rs(12)} color={KIT.teal} strokeWidth={2.4} />
        <Text style={s.agendaStart}>{start || '—'}</Text>
        {end ? <Text style={s.agendaEnd}>{end}</Text> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.agendaTop}>
          <Text style={s.agendaName} numberOfLines={1}>{b.customerName || 'Customer'}</Text>
          <View style={[s.pill, { backgroundColor: st.bg }]}><Text style={[s.pillText, { color: st.color }]} numberOfLines={1}>{st.label}</Text></View>
        </View>
        <View style={s.agendaLine}><Smartphone size={rs(12)} color="#6B7280" /><Text style={s.agendaText} numberOfLines={1}>{deviceLabel(b)}</Text></View>
        {b.pickupAddressText ? (
          <View style={s.agendaLine}><MapPin size={rs(12)} color="#6B7280" /><Text style={s.agendaText} numberOfLines={1}>{b.pickupAddressText}</Text></View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// Compact card for a day / week / month with no pickups, with jumps to the
// nearest earlier / later day that has pickups (jumps: [{ key, label, count, onPress }]).
function NoPickups({ sub, onToday, jumps = [] }) {
  return (
    <View style={s.noCard}>
      <View style={s.noIcon}><CalendarX size={rs(22)} color={KIT.teal} /></View>
      <Text style={s.noTitle}>No Pickups Scheduled</Text>
      {sub ? <Text style={s.noSub}>{sub}</Text> : null}
      {jumps.map((j) => (
        <TouchableOpacity key={j.key} onPress={j.onPress} activeOpacity={0.85} style={s.jump} accessibilityRole="button">
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.jumpLabel}>{j.label}</Text>
            <Text style={s.jumpDay} numberOfLines={1}>{j.day} · {j.count} {j.count === 1 ? 'pickup' : 'pickups'}</Text>
          </View>
          <ChevronRight size={rs(16)} color={KIT.teal} strokeWidth={2.4} />
        </TouchableOpacity>
      ))}
      {onToday ? (
        <TouchableOpacity onPress={onToday} style={[s.todayBtn, { marginTop: rs(10) }]} accessibilityRole="button"><Text style={s.todayText}>Go to Today</Text></TouchableOpacity>
      ) : null}
    </View>
  );
}

function EmptyNote({ text }) {
  return (
    <View style={s.emptyCard}>
      <View style={s.emptyIcon}><CalendarX size={rs(18)} color={KIT.teal} /></View>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

const shadow = { shadowColor: '#111111', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 };
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  toolbar: { paddingHorizontal: rs(12), paddingTop: rs(8), paddingBottom: rs(8) },
  seg: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 999, padding: rs(3) },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6), paddingVertical: rs(8), borderRadius: 999 },
  segOn: { backgroundColor: KIT.teal },
  segText: { fontSize: rf(13), fontWeight: '800', color: '#1C3053' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: rs(8), paddingHorizontal: rs(12), paddingBottom: rs(8) },
  navPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(8), paddingHorizontal: rs(6), paddingVertical: rs(5),
    borderRadius: rs(14), borderWidth: 1, borderColor: KIT.line, backgroundColor: '#FFFFFF',
  },
  navBtn: { width: rs(30), height: rs(30), borderRadius: rs(15), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, fontSize: rf(14), fontWeight: '800', color: '#1C3053', textAlign: 'center' },
  todayBtn: { paddingHorizontal: rs(14), paddingVertical: rs(7), borderRadius: 999, borderWidth: 1.5, borderColor: KIT.teal },
  todayText: { fontSize: rf(12.5), fontWeight: '800', color: KIT.teal },
  stats: { flexDirection: 'row', gap: rs(6), paddingHorizontal: rs(12), paddingBottom: rs(8), borderBottomWidth: 1, borderBottomColor: KIT.line },
  stat: { flex: 1, alignItems: 'center', paddingVertical: rs(8), borderRadius: rs(12), borderWidth: 1, borderColor: KIT.line, backgroundColor: '#FFFFFF' },
  statOn: { borderColor: KIT.teal, borderWidth: 1.5, backgroundColor: '#EEF8F9' },
  statNum: { fontSize: rf(16), fontWeight: '800', color: '#111111', marginTop: rs(2) },
  statLabel: { fontSize: rf(10.5), color: '#374151' },
  hourRow: { flexDirection: 'row', alignItems: 'center', height: rs(34) },
  hourText: { width: rs(78), fontSize: rf(11.5), color: '#6B7280' },
  railDot: { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: '#D1D5DB', marginRight: rs(10) },
  hourRule: { flex: 1, height: 1, backgroundColor: '#EEF0F2' },
  pickRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: rs(5) },
  pickStart: { fontSize: rf(12), fontWeight: '800', color: '#111111' },
  pickEnd: { fontSize: rf(11.5), color: '#374151', marginTop: rs(2) },
  pickCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(6), borderRadius: rs(12), borderWidth: 1, borderColor: '#E5E7EB',
    borderLeftWidth: rs(4), paddingVertical: rs(8), paddingHorizontal: rs(9), ...shadow,
  },
  pickTop: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  pickIcon: { width: rs(22), height: rs(22), borderRadius: rs(11), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  pickName: { flex: 1, fontSize: rf(13.5), fontWeight: '800', color: '#111111' },
  pickLine: { flexDirection: 'row', alignItems: 'center', gap: rs(6), marginTop: rs(4), paddingLeft: rs(4) },
  legend: {
    flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: rs(12), marginVertical: rs(8), paddingVertical: rs(7),
    borderRadius: rs(12), borderWidth: 1, borderColor: KIT.line,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: rs(5) },
  legendDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
  legendText: { fontSize: rf(11), color: '#374151' },
  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8), marginHorizontal: rs(12), marginTop: rs(8), padding: rs(9), borderRadius: rs(12),
    backgroundColor: '#FEECEC', borderWidth: 1, borderColor: '#FBD5D4',
  },
  errorText: { flex: 1, fontSize: rf(12), fontWeight: '700', color: '#B42318' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: rs(4), backgroundColor: '#F32C26', borderRadius: 999, paddingHorizontal: rs(9), paddingVertical: rs(4) },
  retryText: { fontSize: rf(11), fontWeight: '800', color: '#FFFFFF' },
  monthWrap: { padding: rs(12), paddingBottom: rs(28), gap: rs(8) },
  monthCard: { backgroundColor: '#FFFFFF', borderRadius: rs(14), borderWidth: 1, borderColor: '#EEF0F2', padding: rs(8), ...shadow },
  monthHead: { flexDirection: 'row', marginBottom: rs(2) },
  monthDow: { flex: 1, textAlign: 'center', fontSize: rf(10.5), fontWeight: '700', color: '#6B7280' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: rs(46), alignItems: 'center', paddingTop: rs(3) },
  cellNum: { width: rs(26), height: rs(26), borderRadius: rs(13), alignItems: 'center', justifyContent: 'center' },
  cellToday: { borderWidth: 1, borderColor: KIT.teal },
  cellNumText: { fontSize: rf(12), fontWeight: '800', color: '#111111' },
  cellDots: { flexDirection: 'row', alignItems: 'center', gap: rs(2), marginTop: rs(3), height: rs(8) },
  cellDot: { width: rs(5), height: rs(5), borderRadius: rs(3) },
  cellMore: { fontSize: rf(8.5), fontWeight: '800', color: '#6B7280' },
  agendaHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: rs(4) },
  agendaTitle: { fontSize: rf(13.5), fontWeight: '800', color: '#1C3053' },
  link: { fontSize: rf(12), fontWeight: '800', color: KIT.teal },
  agenda: {
    flexDirection: 'row', gap: rs(10), backgroundColor: '#FFFFFF', borderRadius: rs(12), borderWidth: 1, borderColor: '#EEF0F2',
    borderLeftWidth: rs(4), paddingVertical: rs(9), paddingHorizontal: rs(10), ...shadow,
  },
  agendaTime: { width: rs(46), alignItems: 'center', gap: 1 },
  agendaStart: { fontSize: rf(13), fontWeight: '800', color: '#111111' },
  agendaEnd: { fontSize: rf(11), color: '#6B7280' },
  agendaTop: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  agendaName: { flex: 1, fontSize: rf(13.5), fontWeight: '800', color: '#111111' },
  agendaLine: { flexDirection: 'row', alignItems: 'center', gap: rs(5), marginTop: rs(3) },
  agendaText: { flex: 1, fontSize: rf(12), color: '#374151' },
  pill: { paddingHorizontal: rs(8), paddingVertical: rs(2), borderRadius: 999, maxWidth: '50%' },
  pillText: { fontSize: rf(10), fontWeight: '800' },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: rs(10), padding: rs(12), borderRadius: rs(12), backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#EEF0F2' },
  emptyIcon: { width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  emptyText: { flex: 1, fontSize: rf(12.5), color: '#6B7280', fontWeight: '600' },
  // The empty card sits near the top (not adrift in the middle of the page).
  emptyWrap: { flexGrow: 1, alignItems: 'center', paddingHorizontal: rs(16), paddingTop: rs(28), paddingBottom: rs(20) },
  jump: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8), alignSelf: 'stretch', marginTop: rs(10), paddingVertical: rs(9), paddingHorizontal: rs(12),
    borderRadius: rs(12), backgroundColor: '#E5F3F5', borderWidth: 1, borderColor: '#C7E6EA',
  },
  jumpLabel: { fontSize: rf(11), fontWeight: '700', color: '#6B7280' },
  jumpDay: { fontSize: rf(13), fontWeight: '800', color: KIT.teal, marginTop: 1 },
  clash: {
    flexDirection: 'row', alignItems: 'center', gap: rs(6), paddingHorizontal: rs(12), paddingVertical: rs(6),
    backgroundColor: '#FFF8E1', borderBottomWidth: 1, borderBottomColor: '#FAA70055',
  },
  clashText: { flex: 1, fontSize: rf(11.5), fontWeight: '700', color: '#9A6700' },
  noCard: {
    alignItems: 'center', width: '100%', maxWidth: rs(320), paddingVertical: rs(20), paddingHorizontal: rs(16),
    borderRadius: rs(16), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EEF0F2', ...shadow,
  },
  noIcon: { width: rs(44), height: rs(44), borderRadius: rs(22), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  noTitle: { marginTop: rs(10), fontSize: rf(14.5), fontWeight: '800', color: '#1C3053' },
  noSub: { marginTop: rs(3), fontSize: rf(12), color: '#6B7280', textAlign: 'center' },
  weekHead: { flexDirection: 'row', paddingVertical: rs(6), paddingRight: rs(8), borderBottomWidth: 1, borderBottomColor: KIT.line },
  weekDow: { fontSize: rf(10.5), color: '#6B7280', fontWeight: '700' },
  weekNum: { width: rs(26), height: rs(26), borderRadius: rs(13), alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  weekNumText: { fontSize: rf(12), fontWeight: '800', color: '#111111' },
  weekDot: { width: rs(4), height: rs(4), borderRadius: rs(2), marginTop: rs(2) },
  hourLabel: { position: 'absolute', right: rs(6), fontSize: rf(10.5), color: '#9CA3AF' },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#EEF0F2' },
  dayLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#F3F4F6' },
  nowLine: { position: 'absolute', height: 2, backgroundColor: '#F32C26' },
  nowDot: { position: 'absolute', left: -rs(4), top: -rs(3), width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: '#F32C26' },
  block: { position: 'absolute', borderRadius: rs(10), borderLeftWidth: rs(3), paddingHorizontal: rs(6), paddingVertical: rs(4), overflow: 'hidden' },
  blockTitle: { fontSize: rf(11.5), fontWeight: '800', color: '#111111' },
  blockLine: { fontSize: rf(10.5), color: '#374151', marginTop: 1 },
});
