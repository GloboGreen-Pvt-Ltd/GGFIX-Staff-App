import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CalendarDays, Check, ClipboardList, Clock3, FileText, Plus, X,
} from 'lucide-react-native';
import { getEmployeeLeaveRequests } from '../api/technician';
import { useTechnicianId } from '../auth/useTechnicianId';
import { rf, rs } from '../utils/responsive';
import MintScreenHeader, { MintBackdrop, useHideNativeHeader } from '../components/MintScreenHeader';
import { MINT, MonthCard, MetricCard, SectionCard, EmptyState } from '../components/MintKit';

const MAX_CONTENT_WIDTH = 720;

// Presentation only: summary-tile tints.
const TINTS = {
  leave:      { bg: '#FFF6F6', border: '#FBE0E0', tile: '#FEECEC', icon: '#F84141', wave: '#FDE3E3' },
  processing: { bg: '#FFFBEF', border: '#F8EBC2', tile: '#F3BF23', icon: '#FFFFFF', wave: '#FBEFC9' },
  rejected:   { bg: '#FFF6F6', border: '#FBE0E0', tile: '#F84141', icon: '#FFFFFF', wave: '#FDDCDC' },
  approved:   { bg: '#F3FBF4', border: '#DDF1E1', tile: '#09AD2A', icon: '#FFFFFF', wave: '#D9F2DE' },
};
const PILL_TEXT = { APPROVED: '#09AD2A', REJECTED: '#F84141', PROCESSING: '#8A6700' };

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
  useHideNativeHeader(navigation);
  const { width: winW } = useWindowDimensions();
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

  const contentW = Math.min(winW, MAX_CONTENT_WIDTH) - rs(32);
  const tileGap = rs(8);
  const tileW = (contentW - tileGap * 3) / 4;

  if (!technicianId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <MintBackdrop />
        <MintScreenHeader title="Leave Report" navigation={navigation} />
        <View style={styles.center}><ActivityIndicator color={MINT.deep} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MintBackdrop />
      <MintScreenHeader title="Leave Report" navigation={navigation} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[MINT.deep]} tintColor={MINT.deep} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentW }}>
          <MonthCard
            subtitle="View your leave summary for this month"
            monthLabel={`${MONTHS[month - 1]} ${year}`}
            onPrev={() => stepMonth(-1)}
            onNext={() => stepMonth(1)}
            inline={contentW >= 420}
          />

          <View style={[styles.statTilesRow, { gap: tileGap }]}>
            <MetricCard width={tileW} icon={CalendarDays} label="Leave" value={pad2(counts.Leave)} tint={TINTS.leave} />
            <MetricCard width={tileW} icon={Clock3} label="Processing" value={pad2(counts.Processing)} tint={TINTS.processing} />
            <MetricCard width={tileW} icon={X} label="Rejected" value={pad2(counts.Rejected)} tint={TINTS.rejected} />
            <MetricCard width={tileW} icon={Check} label="Approved" value={pad2(counts.Approved)} tint={TINTS.approved} />
          </View>

          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() => navigation.navigate('TechnicianApplyLeave')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[MINT.primary, '#089E26']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.applyBtnInner}
            >
              <View pointerEvents="none" style={styles.applyWave} />
              <Plus size={rs(18)} color="#FFFFFF" strokeWidth={2.6} />
              <Text style={styles.applyBtnText}>Apply for leave</Text>
            </LinearGradient>
          </TouchableOpacity>

          <SectionCard compact title="Recent Leave" style={styles.section}>
            {loading && list.length === 0 ? (
              <ActivityIndicator size="small" color={MINT.deep} style={{ marginVertical: rs(16) }} />
            ) : recent ? (
              <LeaveCard item={recent} />
            ) : (
              <EmptyState compact icon={ClipboardList} accent={Clock3} text="No recent leave." />
            )}
          </SectionCard>

          <SectionCard compact title="Previous Leave" style={styles.section}>
            <View style={styles.filterRow}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, filter === f && styles.filterChipActive]}
                  onPress={() => setFilter(f)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {filteredPrevious.length === 0 ? (
              <EmptyState compact icon={FileText} text="No previous leave requests." />
            ) : (
              filteredPrevious.map((item) => <LeaveCard key={item.id} item={item} />)
            )}
          </SectionCard>
        </View>
      </ScrollView>
    </SafeAreaView>
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
            <Text style={[styles.statusPillText, { color: PILL_TEXT[status] || PILL_TEXT.PROCESSING }]}>{pillLabel}</Text>
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
  safe: { flex: 1, backgroundColor: MINT.bg },
  content: { alignItems: 'center', paddingTop: rs(4), paddingBottom: rs(24) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statTilesRow: { flexDirection: 'row', marginTop: rs(8) },

  applyBtn: {
    marginTop: rs(8), borderRadius: rs(14),
    shadowColor: MINT.deep, shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  applyBtnInner: {
    height: rs(42), borderRadius: rs(14), overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(10),
  },
  applyWave: {
    position: 'absolute', right: -rs(30), top: -rs(40), width: rs(130), height: rs(110), borderRadius: rs(65),
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  applyBtnText: { color: '#FFFFFF', fontSize: rf(14), fontWeight: '800' },

  section: { marginTop: rs(8) },

  filterRow: { flexDirection: 'row', gap: rs(6), marginBottom: rs(8) },
  filterChip: {
    flex: 1, height: rs(30), borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: MINT.border, paddingHorizontal: rs(6),
  },
  filterChipActive: { backgroundColor: MINT.primary, borderColor: MINT.primary },
  filterChipText: { fontSize: rf(11.5), color: MINT.muted, fontWeight: '600' },
  filterChipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  leaveCard: {
    flexDirection: 'row', backgroundColor: MINT.softMint, borderRadius: rs(12), borderWidth: 1, borderColor: '#DDF1E1',
    marginBottom: rs(8), overflow: 'hidden',
  },
  leaveAccent: { width: rs(3), backgroundColor: MINT.bright },
  leaveInner: { flex: 1, padding: rs(9) },
  leaveTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: rs(8) },
  leaveTypeText: { fontSize: rf(11.5), fontWeight: '700', color: MINT.primary, marginBottom: 2 },
  leaveDate: { fontSize: rf(13), fontWeight: '700', color: MINT.text },

  metaBlock: { marginTop: rs(7), paddingTop: rs(7), borderTopWidth: 1, borderTopColor: '#E6F2E8' },
  metaLabel: { fontSize: rf(11), color: MINT.muted, fontWeight: '600', marginBottom: 2 },
  metaValue: { fontSize: rf(12), color: MINT.text, fontWeight: '600' },
  metaTimestamp: { fontSize: rf(11), color: MINT.muted, marginTop: 4 },

  statusPill: { paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: 999 },
  pillProcessing: { backgroundColor: '#FDF6E0' },
  pillApproved: { backgroundColor: '#E6F7EA' },
  pillRejected: { backgroundColor: '#FEECEC' },
  statusPillText: { fontSize: rf(10.5), fontWeight: '700' },

  leaveCols: { flexDirection: 'row', marginTop: rs(7), gap: rs(8) },
  leaveCol: { flex: 1 },
  leaveColValue: { fontSize: rf(12), fontWeight: '700', color: MINT.text },
  leaveColLabel: { fontSize: rf(10.5), color: MINT.muted, marginTop: 2 },
});
