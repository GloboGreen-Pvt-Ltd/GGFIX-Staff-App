import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { ListTodo, ChevronRight } from 'lucide-react-native';
import { Text } from './Typography';
import { rf, rs } from '../utils/responsive';
import { selectTechnicianId } from '../store/authSlice';
import { listMyStaffTasks } from '../api/staffTasks';
import { dayKey, todayKey, isAssignedTo } from '../utils/staffTasks';

const PENDING = new Set(['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS']);

// Home → My Tasks: today's general tasks and open ones, from the shared
// staff-task records; tap to open My Tasks. Shows "—" while the server has no
// staff-task endpoints yet (the module is still in development there).
export default function MyTasksShortcut({ navigation }) {
  const technicianId = useSelector(selectTechnicianId);
  const [counts, setCounts] = useState(null); // { today, pending } | null

  useFocusEffect(useCallback(() => {
    let alive = true;
    const today = todayKey();
    const until = dayKey(new Date(Date.now() + 60 * 86400000));
    listMyStaffTasks({ from: today, to: until })
      .then((rows) => {
        if (!alive) return;
        const mine = rows.filter((t) => isAssignedTo(t, technicianId));
        setCounts({
          today: mine.filter((t) => dayKey(t.startAt) === today).length,
          pending: mine.filter((t) => PENDING.has(String(t.status).toUpperCase())).length,
        });
      })
      .catch(() => { if (alive) setCounts(null); });
    return () => { alive = false; };
  }, [technicianId]));

  return (
    <TouchableOpacity onPress={() => navigation.navigate('MyTasks')} activeOpacity={0.85} style={s.card} accessibilityRole="button" accessibilityLabel="My Tasks">
      <ListTodo size={rs(28)} color="#00807C" strokeWidth={1.8} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title}>My Tasks</Text>
        <Text style={s.sub} numberOfLines={1}>General shop tasks from your manager</Text>
      </View>
      <View style={s.vr} />
      <View style={s.stat}>
        <View style={[s.dot, { backgroundColor: '#485058' }]}><Text style={s.dotNum}>{counts ? counts.today : '—'}</Text></View>
        <Text style={s.statLabel}>Today</Text>
      </View>
      <View style={s.stat}>
        <View style={[s.dot, { backgroundColor: '#035C6C' }]}><Text style={s.dotNum}>{counts ? counts.pending : '—'}</Text></View>
        <Text style={s.statLabel}>Pending</Text>
      </View>
      <ChevronRight size={rs(20)} color="#111111" strokeWidth={2} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: rs(10), marginTop: rs(12), backgroundColor: '#FFFFFF', borderRadius: rs(16),
    borderWidth: 1, borderColor: '#EEF1F3', paddingVertical: rs(12), paddingHorizontal: rs(14),
    shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  title: { fontSize: rf(15), fontWeight: '800', color: '#111111' },
  sub: { fontSize: rf(12), color: '#1F2937', marginTop: rs(2) },
  vr: { width: 1, alignSelf: 'stretch', backgroundColor: '#E8ECEF', marginHorizontal: rs(2) },
  stat: { alignItems: 'center', minWidth: rs(46) },
  dot: { minWidth: rs(20), height: rs(20), borderRadius: rs(10), paddingHorizontal: rs(4), alignItems: 'center', justifyContent: 'center' },
  dotNum: { fontSize: rf(11), fontWeight: '800', color: '#FFFFFF', includeFontPadding: false },
  statLabel: { fontSize: rf(12.5), color: '#111111', fontWeight: '700', marginTop: rs(4) },
});
