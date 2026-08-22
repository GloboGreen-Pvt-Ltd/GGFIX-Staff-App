import React, { useState, useCallback, useMemo } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getEmployeeLeaveRequests } from '../api/technician';
import { useTechnicianId } from '../auth/useTechnicianId';
import { rf } from '../utils/responsive';

// Pretty-print leaveType enum from backend (CASUAL_LEAVE → Casual Leave).
const LEAVE_TYPE_LABELS = {
  CASUAL_LEAVE: 'Casual Leave',
  SICK_LEAVE: 'Sick Leave',
  EMERGENCY_LEAVE: 'Emergency Leave',
  PERMISSION: 'Permission',
  HALF_DAY: 'Half Day',
  OTHER: 'Other',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FILTERS = ['All', 'Approved', 'Processing', 'Rejected'];

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDate(d) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(instant) {
  if (!instant) return '—';
  const d = new Date(instant);
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function LeaveReportScreen({ navigation }) {
  const technicianId = useTechnicianId();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [filter, setFilter] = useState('All');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!technicianId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await getEmployeeLeaveRequests(technicianId, { month, year });
      setList(Array.isArray(res) ? res : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [technicianId, month, year]);

  // Reload whenever the screen comes back into focus so a request submitted
  // on TechnicianApplyLeaveScreen appears immediately on goBack().
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const counts = useMemo(() => ({
    Leave: list.length,
    Processing: list.filter((l) => l.status === 'PROCESSING' || l.status === 'PENDING').length,
    Rejected: list.filter((l) => l.status === 'REJECTED').length,
    Approved: list.filter((l) => l.status === 'APPROVED').length,
  }), [list]);

  const sorted = useMemo(() => {
    return [...list].sort((a, b) => {
      const ad = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const bd = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return bd - ad;
    });
  }, [list]);

  const recent = sorted[0];
  const previous = sorted.slice(1);
  // Processing chip should match both PROCESSING (legacy) and PENDING rows so
  // the user's just-applied leave is visible right after submitting.
  const filteredPrevious = filter === 'All'
    ? previous
    : filter === 'Processing'
      ? previous.filter((l) => l.status === 'PROCESSING' || l.status === 'PENDING')
      : previous.filter((l) => l.status === filter.toUpperCase());

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  if (!technicianId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color="#00008B" /></View>
      </SafeAreaView>
    );
  }

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
            <StatTile value={pad2(counts.Leave)}      label="Leave"      bg="#EC4899" />
            <StatTile value={pad2(counts.Processing)} label="Processing" bg="#F97316" />
            <StatTile value={pad2(counts.Rejected)}   label="Rejected"   bg="#EF4444" />
            <StatTile value={pad2(counts.Approved)}   label="Approved"   bg="#1E3A8A" />
          </View>
        </View>

        <TouchableOpacity
          style={styles.applyBtn}
          onPress={() => navigation.navigate('TechnicianApplyLeave')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text style={styles.applyBtnText}>Apply for leave</Text>
        </TouchableOpacity>

        <Text style={styles.sectionHeader}>Recent Leave</Text>
        {loading && list.length === 0 ? (
          <ActivityIndicator size="small" color="#00008B" style={{ marginVertical: 16 }} />
        ) : recent ? (
          <LeaveCard item={recent} />
        ) : (
          <Text style={styles.empty}>No recent leave.</Text>
        )}

        <Text style={styles.sectionHeader}>Previous Leave</Text>
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

        {filteredPrevious.length === 0 ? (
          <Text style={styles.empty}>No previous leave requests.</Text>
        ) : (
          filteredPrevious.map((item) => <LeaveCard key={item.id} item={item} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ value, label, bg }) {
  return (
    <View style={styles.statTileWrap}>
      <View style={[styles.statTileTop, { backgroundColor: bg }]}>
        <Text style={styles.statTileTopText}>{label}</Text>
      </View>
      <View style={styles.statTileBottom}>
        <Text style={styles.statTileValue}>{value}</Text>
      </View>
    </View>
  );
}

function LeaveCard({ item }) {
  const status = (item.status || '').toUpperCase();
  const pillStyle =
    status === 'APPROVED' ? styles.pillApproved
      : status === 'REJECTED' ? styles.pillRejected
        : styles.pillProcessing;
  const pillLabel =
    status === 'PROCESSING' || status === 'PENDING' ? 'Processing'
      : status === 'APPROVED' ? 'Approved'
        : status === 'REJECTED' ? 'Rejected'
          : status === 'CANCELLED' ? 'Cancelled'
            : status;
  const typeLabel = LEAVE_TYPE_LABELS[item.leaveType] || 'Leave';
  // Date range: show "from → to" so multi-day leaves are obvious; HALF_DAY
  // collapses to a single date.
  const dateRangeLabel =
    item.startDate && item.endDate && item.startDate !== item.endDate
      ? `${formatDate(item.startDate)} → ${formatDate(item.endDate)}`
      : formatDate(item.startDate);

  return (
    <View style={styles.leaveCard}>
      <View style={styles.leaveAccent} />
      <View style={styles.leaveInner}>
        <View style={styles.leaveTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.leaveTypeText}>{typeLabel}</Text>
            <Text style={styles.leaveDate}>{dateRangeLabel}</Text>
          </View>
          <View style={[styles.statusPill, pillStyle]}>
            <Text style={styles.statusPillText}>{pillLabel}</Text>
          </View>
        </View>

        <View style={styles.leaveCols}>
          <View style={styles.leaveCol}>
            <Text style={styles.leaveColValue} numberOfLines={2}>{item.reason || '—'}</Text>
            <Text style={styles.leaveColLabel}>Reason</Text>
          </View>
          <View style={styles.leaveCol}>
            {String(item.leaveType).toUpperCase() === 'PERMISSION' ? (
              <>
                <Text style={styles.leaveColValue}>Permission</Text>
                <Text style={styles.leaveColLabel}>Type</Text>
              </>
            ) : (
              <>
                <Text style={styles.leaveColValue}>{item.appliedDaysLabel || '—'}</Text>
                <Text style={styles.leaveColLabel}>Days</Text>
              </>
            )}
          </View>
          <View style={styles.leaveCol}>
            <Text style={styles.leaveColValue} numberOfLines={1}>
              {formatDateTime(item.requestedAt)}
            </Text>
            <Text style={styles.leaveColLabel}>Applied On</Text>
          </View>
        </View>

        {/* Approver / rejection metadata. Only render when the owner has
            acted on the request so PENDING cards stay compact. */}
        {status === 'REJECTED' && item.rejectionReason ? (
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Rejection reason</Text>
            <Text style={styles.metaValue} numberOfLines={3}>{item.rejectionReason}</Text>
            {item.rejectedAt ? (
              <Text style={styles.metaTimestamp}>Rejected {formatDateTime(item.rejectedAt)}</Text>
            ) : null}
          </View>
        ) : null}
        {status === 'APPROVED' && (item.remarks || item.approvedAt) ? (
          <View style={styles.metaBlock}>
            {item.remarks ? (
              <>
                <Text style={styles.metaLabel}>Owner remarks</Text>
                <Text style={styles.metaValue} numberOfLines={3}>{item.remarks}</Text>
              </>
            ) : null}
            {item.approvedAt ? (
              <Text style={styles.metaTimestamp}>Approved {formatDateTime(item.approvedAt)}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 12, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statsCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14 },
  statsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statsHeaderTitle: { fontSize: rf(14), fontWeight: '700', color: '#111827' },

  monthPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1EAC', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, gap: 6 },
  monthPillText: { color: '#FFFFFF', fontSize: rf(11), fontWeight: '700' },
  monthPillSep: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.3)' },

  statTilesRow: { flexDirection: 'row', gap: 8 },
  statTileWrap: { flex: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  statTileTop: { paddingVertical: 5, alignItems: 'center' },
  statTileTopText: { color: '#FFFFFF', fontSize: rf(10), fontWeight: '700' },
  statTileBottom: { paddingVertical: 8, alignItems: 'center', backgroundColor: '#FFFFFF' },
  statTileValue: { fontSize: rf(18), fontWeight: '800', color: '#111827' },

  applyBtn: { marginTop: 12, backgroundColor: '#00008B', paddingVertical: 11, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  applyBtnText: { color: '#FFFFFF', fontSize: rf(13), fontWeight: '700' },

  sectionHeader: { fontSize: rf(13), fontWeight: '700', color: '#111827', marginTop: 14, marginBottom: 8 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  filterChipActive: { backgroundColor: '#00008B', borderColor: '#00008B' },
  filterChipText: { fontSize: rf(11), color: '#6B7280', fontWeight: '600' },
  filterChipTextActive: { color: '#FFFFFF' },

  leaveCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  leaveAccent: { width: 3, backgroundColor: '#1E1EAC' },
  leaveInner: { flex: 1, padding: 10 },
  leaveTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  leaveTypeText: { fontSize: rf(12), fontWeight: '700', color: '#00008B', marginBottom: 2 },
  leaveDate: { fontSize: rf(12), fontWeight: '700', color: '#111827' },

  metaBlock: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  metaLabel: { fontSize: rf(10), color: '#9CA3AF', fontWeight: '600', marginBottom: 2 },
  metaValue: { fontSize: rf(11), color: '#111827', fontWeight: '600' },
  metaTimestamp: { fontSize: rf(10), color: '#6B7280', marginTop: 4 },

  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  pillProcessing: { backgroundColor: '#F97316' },
  pillApproved: { backgroundColor: '#004C40' },
  pillRejected: { backgroundColor: '#EF4444' },
  statusPillText: { color: '#FFFFFF', fontSize: rf(10), fontWeight: '700' },

  leaveCols: { flexDirection: 'row', marginTop: 8, gap: 8 },
  leaveCol: { flex: 1 },
  leaveColValue: { fontSize: rf(11), fontWeight: '700', color: '#111827' },
  leaveColLabel: { fontSize: rf(9), color: '#9CA3AF', marginTop: 2 },

  empty: { fontSize: rf(12), color: '#6B7280', textAlign: 'center', paddingVertical: 14 },
});
