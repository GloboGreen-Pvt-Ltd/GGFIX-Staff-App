import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Calendar, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleX, Clock, ClipboardList, MapPin } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { useHideNativeHeader } from '../components/MintScreenHeader';
import { JobHeader } from '../components/JobCardKit';
import { selectTechnicianId } from '../store/authSlice';
import { listMyStaffTasks } from '../api/staffTasks';
import { categoryMeta, dayKey, hhmm, isNotAvailable, statusMeta, isAssignedTo } from '../utils/staffTasks';
import { rf, rs } from '../utils/responsive';
import { userMessage } from '../utils/userMessages';

const HOUR_H = rs(52);
const GUTTER = rs(42);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // Monday

// Minutes from the day's midnight, clamped to the day.
function span(t, day) {
  const dayStart = startOfDay(day).getTime();
  const a = new Date(t.startAt).getTime();
  const b = t.endAt ? new Date(t.endAt).getTime() : a + 30 * 60000;
  const s = Math.max(0, (a - dayStart) / 60000);
  const e = Math.min(24 * 60, Math.max(s + 15, (b - dayStart) / 60000));
  return { s, e };
}

// Overlapping tasks share the column side by side: greedy lanes per cluster.
function layout(tasks, day) {
  const items = tasks.map((t) => ({ t, ...span(t, day) })).sort((x, y) => x.s - y.s || y.e - x.e);
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

// 24-hour task calendar (00:00–23:59), day or week, from the real assigned
// tasks. Blocks use the category colour; tap one to open the task.
export default function TaskCalendarScreen({ navigation }) {
  useHideNativeHeader(navigation);
  const technicianId = useSelector(selectTechnicianId);
  const [mode, setMode] = useState('day'); // 'day' | 'week'
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [gridW, setGridW] = useState(0);
  const scrollRef = useRef(null);

  const days = useMemo(() => (mode === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))), [mode, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listMyStaffTasks({ from: dayKey(days[0]), to: dayKey(days[days.length - 1]) });
      setTasks(rows.filter((t) => t.startAt && isAssignedTo(t, technicianId)));
      setError(null);
    } catch (e) {
      setError(isNotAvailable(e) ? 'unavailable' : userMessage(e, 'Could not load tasks'));
    } finally {
      setLoading(false);
    }
  }, [days, technicianId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Open on the current hour (or 08:00).
  useEffect(() => {
    const h = new Date().getHours();
    const y = Math.max(0, (dayKey(anchor) === dayKey(new Date()) ? h - 1 : 7) * HOUR_H);
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 50);
  }, [anchor, mode]);

  const step = (n) => setAnchor((a) => addDays(a, mode === 'day' ? n : 7 * n));
  const title = mode === 'day'
    ? anchor.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    : `${days[0].toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${days[6].toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  const viewTasks = tasks.filter((t) => days.some((d) => dayKey(t.startAt) === dayKey(d)));
  const colW = gridW > 0 ? (gridW - GUTTER) / days.length : 0;
  const now = new Date();
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <JobHeader navigation={navigation} title="Task Calendar" sub="Manage and view task schedule" />
      <View style={s.toolbar}>
        <View style={s.seg}>
          {[['day', Calendar], ['week', CalendarDays]].map(([m, Icon]) => (
            <TouchableOpacity key={m} onPress={() => setMode(m)} style={[s.segBtn, mode === m && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
              <Icon size={rs(15)} color={mode === m ? '#FFFFFF' : '#1C3053'} strokeWidth={2.2} />
              <Text style={[s.segText, mode === m && { color: '#FFFFFF' }]}>{m === 'day' ? 'Day' : 'Week'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={s.nav}>
        <View style={s.navPill}>
          <TouchableOpacity onPress={() => step(-1)} style={s.navBtn} hitSlop={8} accessibilityLabel="Previous"><ChevronLeft size={rs(16)} color={TEAL} strokeWidth={2.6} /></TouchableOpacity>
          <Calendar size={rs(15)} color={TEAL} strokeWidth={2.2} />
          <Text style={s.navTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{title}</Text>
          <TouchableOpacity onPress={() => step(1)} style={s.navBtn} hitSlop={8} accessibilityLabel="Next"><ChevronRight size={rs(16)} color={TEAL} strokeWidth={2.6} /></TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => setAnchor(startOfDay(new Date()))} style={s.todayBtn} accessibilityLabel="Go to today">
          <Text style={s.todayText}>Today</Text>
        </TouchableOpacity>
      </View>
      {/* Counts for the day / week on screen. */}
      <View style={s.stats}>
        {[
          { k: 'total', label: 'Total Tasks', Icon: ClipboardList, color: TEAL, n: viewTasks.length },
          { k: 'up', label: 'Upcoming', Icon: Clock, color: '#2563EB', n: viewTasks.filter((t) => bucket(t.status) === 'UP').length },
          { k: 'done', label: 'Completed', Icon: CheckCircle2, color: '#16A34A', n: viewTasks.filter((t) => bucket(t.status) === 'DONE').length },
          { k: 'cx', label: 'Cancelled', Icon: CircleX, color: '#DC2626', n: viewTasks.filter((t) => bucket(t.status) === 'CX').length },
        ].map((t) => (
          <View key={t.k} style={[s.stat, t.k === 'total' && s.statOn]}>
            <t.Icon size={rs(16)} color={t.color} strokeWidth={2.2} />
            <Text style={s.statNum}>{t.n}</Text>
            <Text style={s.statLabel} numberOfLines={1}>{t.label}</Text>
          </View>
        ))}
      </View>

      {mode === 'week' ? (
        <View style={[s.weekHead, { paddingLeft: GUTTER }]}>
          {days.map((d) => {
            const isToday = dayKey(d) === dayKey(now);
            return (
              <TouchableOpacity key={dayKey(d)} style={{ flex: 1, alignItems: 'center' }} onPress={() => { setAnchor(d); setMode('day'); }} accessibilityLabel={`Open ${dayKey(d)}`}>
                <Text style={[s.weekDow, isToday && { color: '#035C6C' }]}>{DOW[d.getDay()]}</Text>
                <View style={[s.weekNum, isToday && { backgroundColor: '#035C6C' }]}>
                  <Text style={[s.weekNumText, isToday && { color: '#FFFFFF' }]}>{d.getDate()}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {error ? (
        <View style={s.state}><Text style={s.stateText}>{error === 'unavailable' ? 'Staff Tasks is not enabled on your shop server yet.' : error}</Text></View>
      ) : mode === 'day' ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: rs(16) }}>
          {loading && !tasks.length ? <ActivityIndicator color={TEAL} style={{ marginTop: rs(10) }} /> : null}
          <DayTimeline day={anchor} tasks={viewTasks} onOpen={(t) => navigation.navigate('TaskDetails', { taskId: t.id })} />
        </ScrollView>
      ) : (
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
          <View style={{ height: HOUR_H * 24 }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={[s.hourRow, { top: h * HOUR_H }]}>
                <Text style={s.hourLabel}>{String(h).padStart(2, '0')}:00</Text>
                <View style={s.hourLine} />
              </View>
            ))}
            {days.some((d) => dayKey(d) === dayKey(now)) && colW ? (
              <View pointerEvents="none" style={[s.nowLine, {
                top: nowTop,
                left: GUTTER + (mode === 'day' ? 0 : days.findIndex((d) => dayKey(d) === dayKey(now)) * colW),
                width: colW,
              }]} />
            ) : null}
            {colW ? days.map((d, di) => {
              const dayTasks = tasks.filter((t) => dayKey(t.startAt) === dayKey(d));
              return layout(dayTasks, d).map((it) => {
                const cat = categoryMeta(it.t.category);
                const st = statusMeta(it.t.status);
                const w = colW / it.lanes;
                const top = (it.s / 60) * HOUR_H;
                const height = Math.max(rs(22), ((it.e - it.s) / 60) * HOUR_H - 2);
                return (
                  <TouchableOpacity
                    key={`${it.t.id}-${di}`}
                    onPress={() => navigation.navigate('TaskDetails', { taskId: it.t.id })}
                    activeOpacity={0.85}
                    accessibilityLabel={`${it.t.title}, ${hhmm(it.t.startAt)}`}
                    style={[s.block, {
                      top, height, left: GUTTER + di * colW + it.lane * w + 2, width: w - 4,
                      backgroundColor: `${cat.color}1F`, borderColor: `${cat.color}40`,
                    }]}
                  >
                    {/* design: category dot · bold title, time underneath */}
                    <View style={s.blockHead}>
                      {w > rs(60) ? <View style={[s.blockDot, { backgroundColor: cat.color }]} /> : null}
                      <Text style={s.blockTitle} numberOfLines={height > rs(44) ? 2 : 1}>{it.t.title}</Text>
                    </View>
                    {height > rs(32) ? (
                      <Text style={[s.blockTime, w > rs(60) && { marginLeft: rs(16) }]} numberOfLines={1}>
                        {hhmm(it.t.startAt)}{it.t.endAt ? ` – ${hhmm(it.t.endAt)}` : ''}{mode === 'day' ? ` · ${st.label}` : ''}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              });
            }) : null}
          </View>
          {loading ? <ActivityIndicator color="#035C6C" style={{ position: 'absolute', top: rs(10), alignSelf: 'center' }} /> : null}
        </ScrollView>
      )}
      <View style={s.legend}>
        {LEGEND.map((l) => (
          <View key={l.label} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: l.color }]} /><Text style={s.legendText}>{l.label}</Text></View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const TEAL = '#035C6C';
// Task status → legend group (same groups as the stat cards).
const bucket = (st) => {
  const k = String(st || '').toUpperCase();
  if (k === 'COMPLETED') return 'DONE';
  if (k === 'CANCELLED' || k === 'REJECTED') return 'CX';
  if (k === 'IN_PROGRESS' || k === 'UNABLE_TO_COMPLETE') return 'PROG';
  return 'UP';
};
const BUCKET_COLOR = { DONE: '#16A34A', UP: '#2563EB', PROG: '#F97316', CX: '#DC2626' };
const LEGEND = [
  { label: 'Completed', color: '#16A34A' },
  { label: 'Upcoming', color: '#2563EB' },
  { label: 'In Progress', color: '#F97316' },
  { label: 'Cancelled', color: '#DC2626' },
];
const h12 = (mins) => { const h = Math.floor(mins / 60) % 24; return `${String(h % 12 || 12).padStart(2, '0')}:${String(Math.round(mins % 60)).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

// Day view: hour rail on the left; each task as a card at its start hour.
function DayTimeline({ day, tasks, onOpen }) {
  const items = tasks.map((t) => ({ t, ...span(t, day) })).sort((a, b) => a.s - b.s);
  const firstH = Math.min(10, ...items.map((it) => Math.floor(it.s / 60)));
  const lastH = Math.max(18, ...items.map((it) => Math.floor(it.s / 60)));
  const hours = Array.from({ length: lastH - firstH + 1 }, (_, i) => firstH + i);
  return (
    <View style={{ paddingHorizontal: rs(12), paddingTop: rs(6) }}>
      {hours.map((h) => {
        const here = items.filter((it) => Math.floor(it.s / 60) === h);
        if (!here.length) {
          return (
            <View key={h} style={s.railRow}>
              <Text style={s.railText}>{h12(h * 60)}</Text>
              <View style={s.railDot} />
              <View style={s.railRule} />
            </View>
          );
        }
        return here.map((it) => {
          const t = it.t;
          const st = statusMeta(t.status);
          const cat = categoryMeta(t.category);
          const color = BUCKET_COLOR[bucket(t.status)];
          const CatIcon = cat.icon || ClipboardList;
          return (
            <View key={t.id} style={s.pickRow}>
              <View style={{ width: rs(78) }}>
                <Text style={s.pickStart}>{h12(it.s)}</Text>
                <Text style={s.pickEnd}>{h12(it.e)}</Text>
              </View>
              <View style={[s.railDot, { backgroundColor: color, marginTop: rs(6) }]} />
              <TouchableOpacity onPress={() => onOpen(t)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${t.title}, ${st.label}`}
                style={[s.pickCard, { borderLeftColor: color, backgroundColor: `${color}0F` }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.pickTop}>
                    <View style={s.pickIcon}><CatIcon size={rs(13)} color={TEAL} strokeWidth={2.2} /></View>
                    <Text style={s.pickName} numberOfLines={1}>{t.title}</Text>
                    <View style={[s.pill, { backgroundColor: `${color}1A` }]}>
                      <CheckCircle2 size={rs(10)} color={color} strokeWidth={2.6} />
                      <Text style={[s.pillText, { color }]} numberOfLines={1}>{st.label}</Text>
                    </View>
                  </View>
                  <View style={s.pickLine}><ClipboardList size={rs(12)} color={TEAL} /><Text style={s.pickText} numberOfLines={1}>{cat.label}</Text></View>
                  {t.location || t.address ? <View style={s.pickLine}><MapPin size={rs(12)} color={TEAL} /><Text style={s.pickText} numberOfLines={1}>{t.location || t.address}</Text></View> : null}
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  toolbar: { paddingHorizontal: rs(12), paddingTop: rs(8), paddingBottom: rs(8) },
  seg: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 999, padding: rs(3) },
  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6), paddingVertical: rs(8), borderRadius: 999 },
  segOn: { backgroundColor: '#035C6C' },
  segText: { fontSize: rf(13), fontWeight: '800', color: '#1C3053' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: rs(8), paddingHorizontal: rs(12), paddingBottom: rs(8) },
  navPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(8), paddingHorizontal: rs(6), paddingVertical: rs(5),
    borderRadius: rs(14), borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF',
  },
  navBtn: { width: rs(30), height: rs(30), borderRadius: rs(15), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, fontSize: rf(14), fontWeight: '800', color: '#1C3053', textAlign: 'center' },
  todayBtn: { paddingHorizontal: rs(14), paddingVertical: rs(7), borderRadius: 999, borderWidth: 1.5, borderColor: '#035C6C' },
  todayText: { fontSize: rf(12.5), fontWeight: '800', color: '#035C6C' },
  stats: { flexDirection: 'row', gap: rs(6), paddingHorizontal: rs(12), paddingBottom: rs(8), borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  stat: { flex: 1, alignItems: 'center', paddingVertical: rs(8), borderRadius: rs(12), borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  statOn: { borderColor: '#035C6C', borderWidth: 1.5, backgroundColor: '#EEF8F9' },
  statNum: { fontSize: rf(16), fontWeight: '800', color: '#111111', marginTop: rs(2) },
  statLabel: { fontSize: rf(10.5), color: '#374151' },
  railRow: { flexDirection: 'row', alignItems: 'center', height: rs(34) },
  railText: { width: rs(78), fontSize: rf(11.5), color: '#6B7280' },
  railDot: { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: '#D1D5DB', marginRight: rs(10) },
  railRule: { flex: 1, height: 1, backgroundColor: '#EEF0F2' },
  pickRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: rs(5) },
  pickStart: { fontSize: rf(12), fontWeight: '800', color: '#111111' },
  pickEnd: { fontSize: rf(11.5), color: '#374151', marginTop: rs(2) },
  pickCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(6), borderRadius: rs(12), borderWidth: 1, borderColor: '#E5E7EB',
    borderLeftWidth: rs(4), paddingVertical: rs(8), paddingHorizontal: rs(9),
    shadowColor: '#111111', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  pickTop: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  pickIcon: { width: rs(22), height: rs(22), borderRadius: rs(11), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  pickName: { flex: 1, fontSize: rf(13.5), fontWeight: '800', color: '#111111' },
  pickLine: { flexDirection: 'row', alignItems: 'center', gap: rs(6), marginTop: rs(4), paddingLeft: rs(4) },
  pickText: { flex: 1, fontSize: rf(12), color: '#374151' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: rs(3), paddingHorizontal: rs(8), paddingVertical: rs(2), borderRadius: 999, maxWidth: '50%' },
  pillText: { fontSize: rf(10), fontWeight: '800' },
  legend: {
    flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: rs(12), marginVertical: rs(8), paddingVertical: rs(7),
    borderRadius: rs(12), borderWidth: 1, borderColor: '#E5E7EB',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: rs(5) },
  legendDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
  legendText: { fontSize: rf(11), color: '#374151' },
  weekHead: { flexDirection: 'row', paddingVertical: rs(6), borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  weekDow: { fontSize: rf(10.5), color: '#6B7280', fontWeight: '700' },
  weekNum: { width: rs(24), height: rs(24), borderRadius: rs(12), alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  weekNumText: { fontSize: rf(12), fontWeight: '800', color: '#111111' },
  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start' },
  hourLabel: { width: GUTTER, fontSize: rf(10), color: '#9CA3AF', textAlign: 'center', marginTop: -rs(6) },
  hourLine: { flex: 1, height: 1, backgroundColor: '#EEF0F2' },
  nowLine: { position: 'absolute', height: 2, backgroundColor: '#F32C26' },
  block: { position: 'absolute', borderRadius: rs(10), borderWidth: 1, paddingHorizontal: rs(6), paddingVertical: rs(4), overflow: 'hidden' },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  blockDot: { width: rs(10), height: rs(10), borderRadius: rs(5) },
  blockTitle: { flex: 1, fontSize: rf(11.5), fontWeight: '800', color: '#111111' },
  blockTime: { fontSize: rf(10.5), color: '#374151', marginTop: 1 },
  state: { alignItems: 'center', padding: rs(30) },
  stateText: { fontSize: rf(12), color: '#6B7280', textAlign: 'center' },
});
