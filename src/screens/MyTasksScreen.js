import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, AppState, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { CalendarRange, History, Inbox, CircleX, ChartColumn, CalendarDays, Clock, RefreshCw, Check } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { JobHeader, JobRail, toneOf } from '../components/JobCardKit';
import StaffTaskCard from '../components/StaffTaskCard';
import { selectTechnicianId } from '../store/authSlice';
import { listMyStaffTasks } from '../api/staffTasks';
import { TASK_FILTERS, filterTasks, byStart, dayKey, hhmm, isNotAvailable, isAssignedTo } from '../utils/staffTasks';
import { rf, rs } from '../utils/responsive';
import { userMessage } from '../utils/userMessages';

const SYNC_MS = 30000; // re-read while open so owner changes show up

// Left rail filters — same gradient tiles as My Jobs.
const RAIL = [
  { key: 'All', label: 'All', icon: ChartColumn, tone: 'teal' },
  { key: 'Today', label: 'Today', icon: CalendarDays, tone: 'blue' },
  { key: 'Upcoming', label: 'Upcoming', icon: Clock, tone: toneOf('#1C3053') },
  { key: 'In Progress', label: 'In Progress', icon: RefreshCw, tone: 'orange' },
  { key: 'Completed', label: 'Completed', icon: Check, tone: 'green' },
];

// My Tasks — general shop tasks the owner assigned to this employee (not
// repair tickets). Filter rail on the left (as My Jobs), task cards beside it.
export default function MyTasksScreen({ navigation, route }) {
  const technicianId = useSelector(selectTechnicianId);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null); // 'unavailable' | message | null
  const [syncedAt, setSyncedAt] = useState(null);
  const [filter, setFilter] = useState(route?.params?.filter && TASK_FILTERS.includes(route.params.filter) ? route.params.filter : 'All');
  const scrollRef = useRef(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const from = dayKey(new Date(Date.now() - 30 * 86400000));
      const to = dayKey(new Date(Date.now() + 90 * 86400000));
      const rows = await listMyStaffTasks({ from, to });
      setList(rows);
      setError(null);
      setSyncedAt(new Date());
    } catch (e) {
      setError(isNotAvailable(e) ? 'unavailable' : userMessage(e, 'Could not load tasks'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const id = setInterval(() => { if (AppState.currentState === 'active') load(); }, SYNC_MS);
    return () => clearInterval(id);
  }, [load]));

  // Re-apply a filter passed in (e.g. "Completed" after finishing a task).
  const routeFilter = route?.params?.filter;
  const routeAt = route?.params?.refreshAt;
  React.useEffect(() => {
    if (routeFilter && TASK_FILTERS.includes(routeFilter)) setFilter(routeFilter);
  }, [routeFilter, routeAt]);

  // Only this employee's tasks (the server scopes them too).
  const mine = useMemo(
    () => list.filter((t) => isAssignedTo(t, technicianId)).sort(byStart),
    [list, technicianId],
  );
  const counts = useMemo(() => Object.fromEntries(TASK_FILTERS.map((f) => [f, filterTasks(mine, f).length])), [mine]);
  const shown = useMemo(() => filterTasks(mine, filter), [mine, filter]);

  const headerRight = (
    <>
      <TouchableOpacity onPress={() => navigation.navigate('TaskCalendar')} hitSlop={6} accessibilityLabel="Task calendar" style={s.headBtn}>
        <CalendarRange size={rs(17)} color="#035C6C" strokeWidth={2.3} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('TaskHistory')} hitSlop={6} accessibilityLabel="Task history" style={s.headBtn}>
        <History size={rs(17)} color="#035C6C" strokeWidth={2.3} />
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <JobHeader navigation={navigation} title="My Tasks" sub="Assigned Tasks" right={headerRight} />
      <View style={s.body}>
        <JobRail items={RAIL} counts={counts} active={filter} onPick={(k) => { setFilter(k); scrollRef.current?.scrollTo({ y: 0, animated: true }); }} softBorder />
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#035C6C']} tintColor="#035C6C" />}
          showsVerticalScrollIndicator={false}
        >
          {syncedAt && !error ? <Text style={s.synced}>Synced · {hhmm(syncedAt)}</Text> : null}
          {loading ? (
            <ActivityIndicator color="#035C6C" style={{ marginTop: rs(30) }} />
          ) : error ? (
            <View style={s.state}>
              <CircleX size={rs(26)} color={error === 'unavailable' ? '#6B7280' : '#F32C26'} />
              <Text style={s.stateTitle}>{error === 'unavailable' ? 'Staff Tasks not available yet' : "Couldn't load tasks"}</Text>
              <Text style={s.stateText}>
                {error === 'unavailable'
                  ? 'Your shop server does not have Staff Tasks enabled yet. Tasks will appear here once it is.'
                  : /try again|retry/i.test(error) ? `${error} Pull down to refresh.` : `${String(error).replace(/\.$/, '')}. Pull down to try again.`}
              </Text>
            </View>
          ) : shown.length === 0 ? (
            <View style={s.state}>
              <Inbox size={rs(24)} color="#9CA3AF" />
              <Text style={s.stateText}>{filter === 'All' ? 'No tasks assigned to you.' : `No ${filter.toLowerCase()} tasks.`}</Text>
            </View>
          ) : shown.map((t) => (
            <StaffTaskCard key={t.id} task={t} onPress={() => navigation.navigate('TaskDetails', { taskId: t.id })} />
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  body: { flex: 1, flexDirection: 'row', backgroundColor: '#FFFFFF' },
  content: { paddingTop: rs(10), paddingLeft: rs(11), paddingRight: rs(9), paddingBottom: rs(24) },
  headBtn: { width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  synced: { fontSize: rf(10.5), color: '#6B7280', marginBottom: rs(6), textAlign: 'right' },
  state: { alignItems: 'center', paddingVertical: rs(30), paddingHorizontal: rs(12), gap: rs(6) },
  stateTitle: { fontSize: rf(14), fontWeight: '800', color: '#1C3053', textAlign: 'center' },
  stateText: { fontSize: rf(12), color: '#6B7280', textAlign: 'center' },
});
