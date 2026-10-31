import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { ListChecks, ChevronRight } from 'lucide-react-native';
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
      <View style={s.icon}><ListChecks size={rs(17)} color="#FFFFFF" strokeWidth={2.4} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title}>My Tasks</Text>
        <Text style={s.sub} numberOfLines={1}>General shop tasks from your manager</Text>
      </View>
      <View style={s.stat}>
        <Text style={[s.statNum, { color: '#035C6C' }]}>{counts ? counts.today : '—'}</Text>
        <Text style={s.statLabel}>Today</Text>
      </View>
      <View style={s.stat}>
        <Text style={[s.statNum, { color: '#FAA700' }]}>{counts ? counts.pending : '—'}</Text>
        <Text style={s.statLabel}>Pending</Text>
      </View>
      <ChevronRight size={rs(16)} color="#035C6C" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: rs(9), marginTop: rs(8), backgroundColor: '#FFFFFF', borderRadius: rs(14),
    borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: rs(9), paddingHorizontal: rs(10),
    shadowColor: '#111111', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  icon: { width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: '#035C6C', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: rf(14), fontWeight: '800', color: '#1C3053' },
  sub: { fontSize: rf(11), color: '#6B7280', marginTop: 1 },
  stat: { alignItems: 'center', minWidth: rs(40) },
  statNum: { fontSize: rf(16), fontWeight: '800' },
  statLabel: { fontSize: rf(10), color: '#6B7280', fontWeight: '600' },
});
