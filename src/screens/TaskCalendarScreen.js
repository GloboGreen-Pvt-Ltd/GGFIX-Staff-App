import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '../components/Typography';
import MintScreenHeader from '../components/MintScreenHeader';
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
  const colW = gridW > 0 ? (gridW - GUTTER) / days.length : 0;
  const now = new Date();
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <MintScreenHeader title="Task Calendar" navigation={navigation} />
      <View style={s.toolbar}>
        <View style={s.seg}>
          {['day', 'week'].map((m) => (
            <TouchableOpacity key={m} onPress={() => setMode(m)} style={[s.segBtn, mode === m && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
              <Text style={[s.segText, mode === m && { color: '#FFFFFF' }]}>{m === 'day' ? 'Day' : 'Week'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.nav}>
          <TouchableOpacity onPress={() => step(-1)} style={s.navBtn} accessibilityLabel="Previous"><ChevronLeft size={rs(15)} color="#FFFFFF" strokeWidth={2.6} /></TouchableOpacity>
          <TouchableOpacity onPress={() => setAnchor(startOfDay(new Date()))} accessibilityLabel="Go to today">
            <Text style={s.navTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{title}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => step(1)} style={s.navBtn} accessibilityLabel="Next"><ChevronRight size={rs(15)} color="#FFFFFF" strokeWidth={2.6} /></TouchableOpacity>
        </View>
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: rs(8), paddingHorizontal: rs(12), paddingVertical: rs(8), borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  seg: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 999, padding: rs(2) },
  segBtn: { paddingHorizontal: rs(12), paddingVertical: rs(5), borderRadius: 999 },
  segOn: { backgroundColor: '#035C6C' },
  segText: { fontSize: rf(12), fontWeight: '800', color: '#1C3053' },
  nav: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: rs(6) },
  navBtn: { width: rs(26), height: rs(26), borderRadius: rs(13), backgroundColor: '#035C6C', alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: rf(12.5), fontWeight: '800', color: '#1C3053', maxWidth: rs(170), textAlign: 'center' },
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
