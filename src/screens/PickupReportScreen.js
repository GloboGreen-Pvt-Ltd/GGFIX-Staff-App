import React, { useCallback, useMemo, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import {
  ChartColumn, CircleCheck, Clock3, FileText, MapPin, Package, PackageSearch, RefreshCw, Truck,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listMyAssignedPickups } from '../api/pickups';
import { rf, rs } from '../utils/responsive';
import MintScreenHeader, { MintBackdrop, useHideNativeHeader } from '../components/MintScreenHeader';
import { MINT, mintShadow, HeroCard, CenterStepper, SectionCard, EmptyState } from '../components/MintKit';

const MAX_CONTENT_WIDTH = 720;

// Presentation only: summary-tile tints.
const TILE_TINTS = {
  inProcess: { bg: '#EFF6FF', border: '#DCE8FB', dot: '#2563EB', text: '#2563EB' },
  pending:   { bg: '#FFF7E8', border: '#FBE8C5', dot: '#F59E0B', text: '#667085' },
  completed: { bg: '#F1FAF6', border: '#D9EEE4', dot: '#00A86B', text: '#006B57' },
  total:     { bg: '#F3EEFF', border: '#E6DCFB', dot: '#7C3AED', text: '#667085' },
};

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
  useHideNativeHeader(navigation);
  const { width: winW } = useWindowDimensions();
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

  const contentW = Math.min(winW, MAX_CONTENT_WIDTH) - rs(32);
  const tileGap = rs(8);
  const tileW = (contentW - tileGap * 3) / 4;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MintBackdrop />
      <MintScreenHeader title="Pickup Report" navigation={navigation} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[MINT.deep]} tintColor={MINT.deep} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentW }}>
          <HeroCard
            icon={Truck}
            title="Pickup Overview"
            subtitle="Track your assigned pickups and status for the selected month."
            art={contentW >= 360 ? <HeroArt /> : null}
          />

          <CenterStepper
            label={`${MONTHS[month - 1]} ${year}`}
            onPrev={() => stepMonth(-1)}
            onNext={() => stepMonth(1)}
            prevLabel="Previous month"
            nextLabel="Next month"
          />

          <View style={[styles.statTilesRow, { gap: tileGap }]}>
            <StatTile width={tileW} icon={Package} value={String(counts.inProcess).padStart(2, '0')} label="In Process" tint={TILE_TINTS.inProcess} />
            <StatTile width={tileW} icon={Clock3} value={String(counts.pending).padStart(2, '0')} label="Pending" tint={TILE_TINTS.pending} />
            <StatTile width={tileW} icon={CircleCheck} value={String(counts.completed).padStart(3, '0')} label="Completed" tint={TILE_TINTS.completed} />
            <StatTile width={tileW} icon={ChartColumn} value={String(counts.total).padStart(3, '0')} label="Total" tint={TILE_TINTS.total} />
          </View>

          {loading && list.length === 0 && (
            <ActivityIndicator size="small" color={MINT.deep} style={{ marginVertical: rs(20) }} />
          )}

          <SectionCard title="Recent Pending" style={styles.section}>
            {recentPending ? (
              <PickupRow booking={recentPending} bucket="PENDING" onDetails={() => openDetails(recentPending)} onHistory={() => openHistory(recentPending)} />
            ) : (
              <EmptyState
                icon={PackageSearch}
                title="No pending pickups"
                text="You don't have any pending pickup tasks for this month."
                action={{ label: 'Refresh', icon: RefreshCw, onPress: () => load(true), busy: refreshing }}
              />
            )}
          </SectionCard>

          <SectionCard title="In Process" style={styles.section}>
            {recentInProcess ? (
              <PickupRow booking={recentInProcess} bucket="IN_PROCESS" onDetails={() => openDetails(recentInProcess)} onHistory={() => openHistory(recentInProcess)} />
            ) : (
              <EmptyState icon={Truck} title="No pickups in progress" text="There are no active pickups at the moment." />
            )}
          </SectionCard>

          <SectionCard title="Previous Completed" style={styles.section}>
            <View style={styles.filterRow}>
              {FILTERS.map((f, i) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, i > 0 && styles.filterChipDivider, filter === f && styles.filterChipActive]}
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
            {previousCompleted.length === 0 ? (
              <EmptyState icon={FileText} text="No pickups found." />
            ) : (
              previousCompleted.map((b) => (
                <PickupRow key={b.id} booking={b} bucket={bucketize(b.status)} onDetails={() => openDetails(b)} onHistory={() => openHistory(b)} />
              ))
            )}
          </SectionCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Decorative van + map pin for the hero card (icons only, no image assets).
function HeroArt() {
  const disc = rs(72);
  return (
    <View style={{ width: disc + rs(10), height: disc, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: '#D8F1E6', alignItems: 'center', justifyContent: 'center' }}>
        <Truck size={rs(36)} color={MINT.primary} fill="#FFFFFF" strokeWidth={1.8} />
      </View>
      <View style={{ position: 'absolute', top: -rs(6), right: 0 }}>
        <MapPin size={rs(24)} color={MINT.primary} fill={MINT.bright} strokeWidth={1.8} />
      </View>
    </View>
  );
}

function StatTile({ width, icon: Icon, value, label, tint }) {
  const dot = rs(34);
  return (
    <View style={[styles.statTile, { width, backgroundColor: tint.bg, borderColor: tint.border }]}>
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: tint.dot, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={rs(17)} color="#FFFFFF" strokeWidth={2.4} />
      </View>
      <Text style={styles.statTileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</Text>
      <Text style={[styles.statTileLabel, { color: tint.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
    </View>
  );
}

function PickupRow({ booking, bucket, onDetails, onHistory }) {
  const isPending = bucket === 'PENDING';
  const isInProcess = bucket === 'IN_PROCESS';

  const stepLine = statusLabel(booking.status);
  const stepColor =
    isPending ? '#DC2626'
      : isInProcess ? '#2563EB'
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
            <Ionicons name="document-text-outline" size={14} color={MINT.primary} />
            <Text style={styles.taskActionText}>View Details</Text>
          </TouchableOpacity>
          <View style={styles.taskActionDivider} />
          <TouchableOpacity onPress={onHistory} style={styles.taskActionBtn} activeOpacity={0.8}>
            <Ionicons name="time-outline" size={14} color={MINT.primary} />
            <Text style={[styles.taskActionText, { color: MINT.primary }]}>Pickup History</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MINT.bg },
  content: { alignItems: 'center', paddingTop: rs(4), paddingBottom: rs(24) },

  statTilesRow: { flexDirection: 'row', marginTop: rs(14) },
  statTile: {
    borderRadius: rs(18), borderWidth: 1, paddingHorizontal: rs(10), paddingVertical: rs(12), ...mintShadow,
  },
  statTileValue: { fontSize: rf(22), fontWeight: '800', color: MINT.text, marginTop: rs(10) },
  statTileLabel: { fontSize: rf(12.5), fontWeight: '600', marginTop: 2 },

  section: { marginTop: rs(14) },

  filterRow: {
    flexDirection: 'row', borderRadius: 999, borderWidth: 1, borderColor: MINT.border,
    backgroundColor: '#FFFFFF', overflow: 'hidden', marginBottom: rs(12),
  },
  filterChip: { flex: 1, height: rs(44), alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(4) },
  filterChipDivider: { borderLeftWidth: 1, borderLeftColor: '#EAF0ED' },
  filterChipActive: { backgroundColor: MINT.primary, borderRadius: 999, borderLeftWidth: 0 },
  filterChipText: { fontSize: rf(13.5), color: '#344054', fontWeight: '600' },
  filterChipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  taskCard: {
    flexDirection: 'row', backgroundColor: MINT.softMint, borderRadius: rs(16), borderWidth: 1, borderColor: '#E3EFE9',
    marginBottom: rs(10), overflow: 'hidden',
  },
  taskAccent: { width: rs(4), backgroundColor: MINT.bright },
  taskInner: { flex: 1, padding: rs(12) },
  taskTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: rs(8) },
  taskDate: { fontSize: rf(13.5), fontWeight: '700', color: MINT.text },
  taskTracking: { fontSize: rf(12), color: MINT.primary, fontWeight: '700' },
  taskMiddleRow: { marginTop: rs(6) },
  taskDevice: { fontSize: rf(13), color: '#344054' },
  taskBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(8) },
  taskStep: { fontSize: rf(12.5), fontWeight: '700' },
  taskFooter: { fontSize: rf(11.5), color: MINT.muted, marginTop: 2 },
  taskActionsRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: rs(10), paddingTop: rs(8),
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D5E6DD',
  },
  taskActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: rs(6), gap: rs(6) },
  taskActionText: { fontSize: rf(12.5), fontWeight: '700', color: MINT.primary },
  taskActionDivider: { width: StyleSheet.hairlineWidth, height: rs(18), backgroundColor: '#D5E6DD' },
});
