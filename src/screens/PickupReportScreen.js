import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { listMyAssignedPickups } from '../api/pickups';
import { rf } from '../utils/responsive';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FILTERS = ['All', 'Completed', 'In Process', 'Pending'];

// Pickup statuses → display buckets. Pending = assigned-but-not-acted-on;
// In Process = anything between "On The Way" and "Reached Shop" (still in
// the pickup person's hands); Completed = the hand-off finished
// (RECEIVED_AT_SHOP). Cancelled is its OWN terminal bucket — folding it into
// COMPLETED inflated the green "Finished" tile with jobs that never happened.
function bucketize(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'RECEIVED_AT_SHOP') return 'COMPLETED';
  if (s === 'CANCELLED') return 'CANCELLED';
  if (s === 'PICKUP_PERSON_ASSIGNED' || s === 'PICKUP_ASSIGNED' || s === 'PICKUP_REASSIGNED') {
    return 'PENDING';
  }
  return 'IN_PROCESS';
}

// Human label per pickup status. Mirrors PickupAssignScreen.currentStatusLabel
// so the same booking reads the same way wherever it's rendered.
const STATUS_LABEL = {
  PICKUP_PERSON_ASSIGNED: 'Assigned',
  PICKUP_ASSIGNED: 'Assigned',
  PICKUP_REASSIGNED: 'Re-Assigned',
  PICKUP_ON_THE_WAY: 'On The Way',
  REACHED_CUSTOMER_LOCATION: 'Reached Customer',
  REPAIR_ESTIMATE_PROCESSING: 'Estimate Processing',
  ESTIMATE_SUBMITTED: 'Estimate Submitted',
  DEVICE_PICKED_UP: 'Picked Up',
  PICKED_UP: 'Picked Up',
  REACHED_SHOP: 'Reached Shop',
  RECEIVED_AT_SHOP: 'Received at Shop',
  CANCELLED: 'Cancelled',
};

function statusLabel(status) {
  const s = String(status || '').toUpperCase();
  return STATUS_LABEL[s] || (status ? status.replace(/_/g, ' ') : '—');
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(instant) {
  if (!instant) return '—';
  return new Date(instant).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function trackingId(b) {
  return b?.bookingNumber
    || `#${String(b?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

function customerLine(b) {
  const parts = [];
  if (b.customerName) parts.push(b.customerName);
  if (b.issueSummary) parts.push(b.issueSummary);
  else if (b.services?.[0]?.serviceName) parts.push(b.services[0].serviceName);
  return parts.join(' - ') || 'Pickup booking';
}

export default function PickupReportScreen({ navigation }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('All');
  const loadedOnceRef = React.useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const items = await listMyAssignedPickups();
      setList(Array.isArray(items) ? items : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load(loadedOnceRef.current);
    loadedOnceRef.current = true;
  }, [load]));

  // Scope to the picked month so the stats only reflect pickups touched then.
  const mine = useMemo(() => {
    return list.filter((b) => {
      const t = b.updatedAt || b.createdAt;
      if (!t) return true;
      const d = new Date(t);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [list, year, month]);

  const counts = useMemo(() => {
    let pending = 0, inProcess = 0, completed = 0;
    mine.forEach((b) => {
      const bk = bucketize(b.status);
      if (bk === 'PENDING') pending += 1;
      else if (bk === 'COMPLETED') completed += 1;
      else inProcess += 1;
    });
    return { inProcess, pending, completed, total: mine.length };
  }, [mine]);

  const sortedDesc = useMemo(() => {
    return [...mine].sort((a, b) => {
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });
  }, [mine]);

  const recentPending = sortedDesc.find((b) => bucketize(b.status) === 'PENDING');
  const recentInProcess = sortedDesc.find((b) => bucketize(b.status) === 'IN_PROCESS');

  const previousCompleted = sortedDesc.filter((b) => {
    // Don't repeat the two rows already surfaced above (Recent Pending +
    // In Process) — under the default "All" filter they'd otherwise show twice.
    if (b.id && (b.id === recentPending?.id || b.id === recentInProcess?.id)) return false;
    const bk = bucketize(b.status);
    if (filter === 'All') return true;
    if (filter === 'Completed') return bk === 'COMPLETED';
    if (filter === 'In Process') return bk === 'IN_PROCESS';
    if (filter === 'Pending') return bk === 'PENDING';
    return false;
  });

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const openDetails = (b) => {
    // Read-only estimate details: device info, customer, price summary, plus
    // quick actions to jump to Edit Estimate or Pickup History. Keeps the
    // active workflow (PickupAssign) reserved for the pickup person actually
    // driving the booking forward.
    navigation.navigate('PickupEstimateDetail', { booking: b, bookingId: b.id });
  };
  const openHistory = (b) => {
    navigation.navigate('PickupHistory', { booking: b });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsHeaderTitle}>This Month</Text>
            <View style={styles.monthPill}>
              <Text style={styles.monthPillText}>{MONTHS[month - 1]} {year}</Text>
              <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-back" size={14} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.monthPillSep} />
              <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statTilesRow}>
            <StatTile value={String(counts.inProcess).padStart(2, '0')} label="In Process" hint="Active" icon="sync" bg="#00008B" />
            <StatTile value={String(counts.pending).padStart(2, '0')} label="Pending" hint="Waiting" icon="alert-circle" bg="#EF4444" />
            <StatTile value={String(counts.completed).padStart(3, '0')} label="Completed" hint="Finished" icon="checkmark-done" bg="#004C40" />
            <StatTile value={String(counts.total).padStart(3, '0')} label="Total" hint="Overall" icon="stats-chart" bg="#1E1EAC" />
          </View>
        </View>

        {loading && list.length === 0 && (
          <ActivityIndicator size="small" color="#00008B" style={{ marginVertical: 20 }} />
        )}

        <Text style={styles.sectionHeader}>Recent Pending</Text>
        {recentPending ? (
          <PickupRow booking={recentPending} bucket="PENDING" onDetails={() => openDetails(recentPending)} onHistory={() => openHistory(recentPending)} />
        ) : (
          <Text style={styles.empty}>No pending pickups.</Text>
        )}

        <Text style={styles.sectionHeader}>In Process</Text>
        {recentInProcess ? (
          <PickupRow booking={recentInProcess} bucket="IN_PROCESS" onDetails={() => openDetails(recentInProcess)} onHistory={() => openHistory(recentInProcess)} />
        ) : (
          <Text style={styles.empty}>No pickups in progress.</Text>
        )}

        <Text style={styles.sectionHeader}>Previous Completed</Text>
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              onPress={() => setFilter(f)}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {previousCompleted.length === 0 ? (
          <Text style={styles.empty}>No pickups found.</Text>
        ) : (
          previousCompleted.map((b) => (
            <PickupRow key={b.id} booking={b} bucket={bucketize(b.status)} onDetails={() => openDetails(b)} onHistory={() => openHistory(b)} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ value, label, hint, icon, bg }) {
  return (
    <View style={styles.statTileWrap}>
      <View style={[styles.statTileTop, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={11} color="#FFFFFF" />
        <Text style={styles.statTileTopText}>{label}</Text>
      </View>
      <Text style={styles.statTileValue}>{value}</Text>
      <Text style={styles.statTileHint}>{hint}</Text>
    </View>
  );
}

function PickupRow({ booking, bucket, onDetails, onHistory }) {
  const isPending = bucket === 'PENDING';
  const isInProcess = bucket === 'IN_PROCESS';

  const stepLine = statusLabel(booking.status);
  const stepColor =
    isPending ? '#DC2626'
      : isInProcess ? '#00008B'
        : '#004C40';

  const footerLine =
    isPending ? `Assigned On ${formatDateTime(booking.updatedAt || booking.createdAt)}`
      : isInProcess ? `In Pickup Process On ${formatDateTime(booking.updatedAt || booking.createdAt)}`
        : `Completed On ${formatDateTime(booking.updatedAt || booking.createdAt)}`;

  return (
    <View style={styles.taskCard}>
      <View style={styles.taskAccent} />
      <View style={styles.taskInner}>
        <View style={styles.taskTopRow}>
          <Text style={styles.taskDate}>{formatDate(booking.pickupDate || booking.createdAt)}</Text>
          <Text style={styles.taskTracking}>{trackingId(booking)}</Text>
        </View>
        <View style={styles.taskMiddleRow}>
          <Text style={styles.taskDevice} numberOfLines={2}>{customerLine(booking)}</Text>
        </View>
        <View style={styles.taskBottomRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.taskStep, { color: stepColor }]}>{stepLine}</Text>
            <Text style={styles.taskFooter}>{footerLine}</Text>
          </View>
        </View>
        <View style={styles.taskActionsRow}>
          <TouchableOpacity onPress={onDetails} style={styles.taskActionBtn} activeOpacity={0.8}>
            <Ionicons name="document-text-outline" size={14} color="#1E3A8A" />
            <Text style={styles.taskActionText}>View Details</Text>
          </TouchableOpacity>
          <View style={styles.taskActionDivider} />
          <TouchableOpacity onPress={onHistory} style={styles.taskActionBtn} activeOpacity={0.8}>
            <Ionicons name="time-outline" size={14} color="#00008B" />
            <Text style={[styles.taskActionText, { color: '#00008B' }]}>Pickup History</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 12, paddingBottom: 32 },

  statsCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12 },
  statsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statsHeaderTitle: { fontSize: rf(14), fontWeight: '700', color: '#111827' },
  monthPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1EAC', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, gap: 6 },
  monthPillText: { color: '#FFFFFF', fontSize: rf(11), fontWeight: '700' },
  monthPillSep: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.3)' },

  statTilesRow: { flexDirection: 'row', gap: 6 },
  statTileWrap: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 10, overflow: 'hidden', paddingBottom: 8, alignItems: 'center' },
  statTileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', paddingVertical: 5 },
  statTileTopText: { color: '#FFFFFF', fontSize: rf(10), fontWeight: '700' },
  statTileValue: { fontSize: rf(18), fontWeight: '800', color: '#111827', marginTop: 6 },
  statTileHint: { fontSize: rf(9), color: '#9CA3AF', marginTop: 1, fontWeight: '600' },

  sectionHeader: { fontSize: rf(13), fontWeight: '700', color: '#111827', marginTop: 14, marginBottom: 8 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  filterChipActive: { backgroundColor: '#1E3A8A', borderColor: '#1E3A8A' },
  filterChipText: { fontSize: rf(11), color: '#6B7280', fontWeight: '600' },
  filterChipTextActive: { color: '#FFFFFF' },

  taskCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  taskAccent: { width: 3, backgroundColor: '#1E1EAC' },
  taskInner: { flex: 1, padding: 10 },
  taskTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskDate: { fontSize: rf(12), fontWeight: '700', color: '#111827' },
  taskTracking: { fontSize: rf(11), color: '#6B7280', fontWeight: '600' },
  taskMiddleRow: { marginTop: 4 },
  taskDevice: { fontSize: rf(11), color: '#374151' },
  taskBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  taskStep: { fontSize: rf(11), fontWeight: '700' },
  taskFooter: { fontSize: rf(10), color: '#9CA3AF', marginTop: 2 },
  taskActionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  taskActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 4 },
  taskActionText: { fontSize: rf(11), fontWeight: '700', color: '#1E3A8A' },
  taskActionDivider: { width: StyleSheet.hairlineWidth, height: 16, backgroundColor: '#E5E7EB' },

  empty: { fontSize: rf(12), color: '#6B7280', textAlign: 'center', paddingVertical: 14 },
});
