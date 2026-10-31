import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Inbox } from 'lucide-react-native';
import { Text } from '../components/Typography';
import MintScreenHeader from '../components/MintScreenHeader';
import TaskTabs from '../components/TaskTabs';
import StaffTaskCard from '../components/StaffTaskCard';
import { selectTechnicianId } from '../store/authSlice';
import { listMyStaffTasks } from '../api/staffTasks';
import { dayKey, fmtStamp, unableLabel, isNotAvailable, isAssignedTo } from '../utils/staffTasks';
import { rf, rs } from '../utils/responsive';
import { userMessage } from '../utils/userMessages';

const HISTORY = ['COMPLETED', 'CANCELLED', 'UNABLE_TO_COMPLETE', 'REJECTED'];
const FILTERS = [
  { key: 'Completed', label: 'Completed', match: (s) => s === 'COMPLETED' },
  { key: 'Cancelled', label: 'Cancelled', match: (s) => s === 'CANCELLED' || s === 'REJECTED' },
  { key: 'Unable', label: 'Unable to Complete', match: (s) => s === 'UNABLE_TO_COMPLETE' },
  { key: 'All', label: 'All', match: () => true },
];

// Task History: finished and unresolved outcomes, newest first, each with how
// it ended (completed at, reason, cancellation). Full audit stays on the task.
export default function TaskHistoryScreen({ navigation }) {
  const technicianId = useSelector(selectTechnicianId);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('Completed');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const rows = await listMyStaffTasks({
        from: dayKey(new Date(Date.now() - 180 * 86400000)),
        to: dayKey(new Date(Date.now() + 60 * 86400000)),
        status: HISTORY,
      });
      setList(rows);
      setError(null);
    } catch (e) {
      setError(isNotAvailable(e) ? 'unavailable' : userMessage(e, 'Could not load history'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const mine = useMemo(() => list
    .filter((t) => HISTORY.includes(String(t.status).toUpperCase()))
    .filter((t) => isAssignedTo(t, technicianId))
    .sort((a, b) => new Date(b.completedAt || b.updatedAt || 0) - new Date(a.completedAt || a.updatedAt || 0)), [list, technicianId]);
  const countOf = (f) => mine.filter((t) => f.match(String(t.status).toUpperCase())).length;
  const current = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const shown = mine.filter((t) => current.match(String(t.status).toUpperCase()));

  const outcomeLine = (t) => {
    const st = String(t.status).toUpperCase();
    if (st === 'COMPLETED') return `Completed · ${fmtStamp(t.completedAt || t.updatedAt)}`;
    if (st === 'UNABLE_TO_COMPLETE') return `Unable · ${unableLabel(t.unableReasonCode)}${t.unableNote ? ` — ${t.unableNote}` : ''}`;
    if (st === 'REJECTED') return `Rejected${t.rejectReason ? ` · ${t.rejectReason}` : ''}`;
    return `Cancelled${t.cancelledAt ? ` · ${fmtStamp(t.cancelledAt)}` : ''}`;
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <MintScreenHeader title="Task History" navigation={navigation} />
      <TaskTabs tabs={FILTERS.map((f) => ({ key: f.key, label: f.label, count: countOf(f) }))} active={filter} onPick={setFilter} />
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#035C6C']} tintColor="#035C6C" />}
          showsVerticalScrollIndicator={false}
        >
          {loading ? <ActivityIndicator color="#035C6C" style={{ marginTop: rs(30) }} />
            : error ? (
              <View style={s.state}><Text style={s.stateText}>{error === 'unavailable' ? 'Staff Tasks is not enabled on your shop server yet.' : error}</Text></View>
            ) : shown.length === 0 ? (
              <View style={s.state}><Inbox size={rs(24)} color="#9CA3AF" /><Text style={s.stateText}>No tasks here yet.</Text></View>
            ) : shown.map((t) => (
              <View key={t.id}>
                <StaffTaskCard task={t} onPress={() => navigation.navigate('TaskDetails', { taskId: t.id })} />
                <Text style={s.outcome} numberOfLines={2}>{outcomeLine(t)}</Text>
              </View>
            ))}
        </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: rs(10), paddingBottom: rs(24) },
  outcome: { fontSize: rf(11), color: '#6B7280', marginTop: -rs(4), marginBottom: rs(10), marginHorizontal: rs(6) },
  state: { alignItems: 'center', paddingVertical: rs(30), gap: rs(6) },
  stateText: { fontSize: rf(12), color: '#6B7280', textAlign: 'center' },
});
