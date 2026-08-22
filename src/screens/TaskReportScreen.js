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
import { Ionicons } from '@expo/vector-icons';
import { listMyTickets, listTicketEvents } from '../api/tickets';
import { rf } from '../utils/responsive';
import { ticketRef } from '../utils/ticketRef';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FILTERS = ['All', 'Completed', 'In Process', 'Pending'];

// Ticket statuses → display buckets used by the cards. Mirrors the owner-side
// WorkingRecord screen so a technician sees the same "Recent Pending" /
// "In Process" split they'd see on a manager's screen.
function bucketize(status) {
  const s = (status || '').toUpperCase();
  if (s === 'DELIVERED' || s === 'CANCELLED') return 'COMPLETED';
  if (s === 'CREATED' || s === 'IN_DIAGNOSIS' || s === 'QUOTED') return 'PENDING';
  return 'IN_PROCESS';
}

// Human label for each macro ticket status. The card needs to reflect what
// the *current* ticket actually is — not a fixed sentence per bucket —
// otherwise a QUOTED row and a CREATED row both read "Spare part has been
// ordered" which is wrong for either of them.
const STATUS_LABEL = {
  CREATED: 'Booking Created',
  IN_DIAGNOSIS: 'In Diagnosis',
  QUOTED: 'Quotation Sent. Awaiting Approval',
  APPROVED: 'Customer Approved. Work Pending',
  IN_REPAIR: 'Repair Work In Progress',
  READY: 'Ready for Delivery',
  DELIVERED: 'Delivered to Customer',
  CANCELLED: 'Work Cancelled',
};

function statusLabel(status) {
  const s = (status || '').toUpperCase();
  return STATUS_LABEL[s] || (status ? status.replace(/_/g, ' ') : '—');
}

// Canonical event order. Matches SHOP_BOOKING_STATUS_OPTIONS on the
// repair-shop-mobile side — events flow strictly in this order, so the
// highest-index emitted event is the booking's true current phase even when
// two events share the same createdAt timestamp (which happens routinely:
// the backend emits TECHNICIAN_ACCEPTED_SERVICE and TECHNICIAN_WORK_STARTED
// at the same instant when the tech taps Accept).
const CANONICAL_EVENT_ORDER = [
  'BOOKING_CREATED_BY_SHOP',
  'SERVICE_ACCEPTED',
  'ASSIGNED_TO_TECHNICIAN',
  'AWAITING_TECHNICIAN_ACCEPTANCE',
  'REASSIGNED_TO_TECHNICIAN',
  'TECHNICIAN_ACCEPTED_SERVICE',
  'TECHNICIAN_WORK_STARTED',
  'TECHNICIAN_UPLOADED_DEVICE_IMAGES',
  'TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED',
  'RE_ESTIMATED_CONFIRMED',
  'CUSTOMER_APPROVED',
  'CUSTOMER_REJECTED',
  'IN_REPAIR',
  'PARTS_REQUIRED',
  'QUALITY_CHECK_COMPLETED',
  'REPAIR_COMPLETED',
  'READY',
  'DELIVERED',
  'CANCELLED',
];
const EVENT_INDEX = Object.fromEntries(CANONICAL_EVENT_ORDER.map((k, i) => [k, i]));

// Event-level labels (the same fine-grained phases the History screen renders).
// The technician's last controllable phase is REPAIR_COMPLETED — anything after
// it (READY, DELIVERED) is a shop-side action and should not show up as the
// technician's "current" step. So we cap at REPAIR_COMPLETED for display.
const EVENT_LABEL = {
  BOOKING_CREATED_BY_SHOP: 'Booking Created by Shop',
  SERVICE_ACCEPTED: 'Service Accepted',
  ASSIGNED_TO_TECHNICIAN: 'Assigned to Technician',
  AWAITING_TECHNICIAN_ACCEPTANCE: 'Awaiting Technician Acceptance',
  REASSIGNED_TO_TECHNICIAN: 'Re-Assigned to Technician',
  TECHNICIAN_ACCEPTED_SERVICE: 'Technician Accepted Service',
  TECHNICIAN_WORK_STARTED: 'Technician Work Started',
  TECHNICIAN_UPLOADED_DEVICE_IMAGES: 'Technician Uploaded Device Images',
  TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED: 'Technician Compliance Issue Verified & Updated',
  RE_ESTIMATED_CONFIRMED: 'Re-Estimated Confirmed',
  CUSTOMER_APPROVED: 'Customer Approved',
  CUSTOMER_REJECTED: 'Customer Rejected',
  IN_REPAIR: 'Repair Work In Progress',
  PARTS_REQUIRED: 'Spare Parts Waiting',
  QUALITY_CHECK_COMPLETED: 'Quality Check Completed',
  REPAIR_COMPLETED: 'Repair Completed',
  READY: 'Repair Completed',
  DELIVERED: 'Repair Completed',
  CANCELLED: 'Work Cancelled',
};

function technicianEventLabel(eventKey) {
  if (!eventKey) return null;
  const k = String(eventKey).toUpperCase();
  return EVENT_LABEL[k] || k.replace(/_/g, ' ');
}

// Pick the booking's current phase from its event list. We rank by canonical
// phase order (with createdAt as a tiebreaker for events outside the canon),
// not by timestamp alone — when the backend emits two phases at the same
// instant (e.g. accept + work-started on the same tap), the highest canonical
// step is the true "current" step. Sorting purely by createdAt was picking
// the wrong one and leaving cards stuck on "Technician Accepted Service"
// when the booking had already moved to "Technician Work Started".
function pickLatestEventKey(events) {
  if (!Array.isArray(events) || events.length === 0) return null;
  let bestKey = null;
  let bestIndex = -1;
  let bestTime = -Infinity;
  for (const e of events) {
    const k = (e?.status || '').toUpperCase();
    if (!k) continue;
    const idx = EVENT_INDEX[k];
    const t = e.createdAt ? new Date(e.createdAt).getTime() : 0;
    if (idx == null) {
      // Unknown phase — only adopt it if we have nothing canonical yet, and
      // break ties by recency so a fresh unknown-status event still wins
      // over a stale one.
      if (bestIndex === -1 && t > bestTime) {
        bestKey = k;
        bestTime = t;
      }
      continue;
    }
    if (idx > bestIndex || (idx === bestIndex && t > bestTime)) {
      bestKey = k;
      bestIndex = idx;
      bestTime = t;
    }
  }
  return bestKey;
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


function deviceLine(t) {
  const parts = [];
  if (t.deviceDisplayName) parts.push(t.deviceDisplayName);
  if (t.repairServicesSummary) parts.push(t.repairServicesSummary);
  return parts.join(' - ') || 'Repair ticket';
}

export default function MonthlySummaryScreen({ navigation }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('All');
  // Latest event-status key per ticket id, fetched after the ticket list so
  // each card can show the actual current phase (e.g. "Repair Completed",
  // "Quality Check Completed") instead of the coarse macro status. Treated as
  // best-effort: card falls back to macro-status label if events aren't ready.
  const [eventStatusById, setEventStatusById] = useState({});

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const page = await listMyTickets({ page: 0, size: 100 });
      const items = Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []);
      setList(items);
      // Booking-timeline events are fetched separately, only for the tickets
      // actually rendered (see the displayedIds effect) — not for all 100.
    } catch {
      setList([]);
      setEventStatusById({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Scope to the picked month so the stats only reflect tickets touched then.
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
    const bk = bucketize(b.status);
    if (filter === 'All') return true;
    if (filter === 'Completed') return bk === 'COMPLETED';
    if (filter === 'In Process') return bk === 'IN_PROCESS';
    if (filter === 'Pending') return bk === 'PENDING';
    return false;
  });

  // IDs of the tickets whose cards actually render an event label: the two
  // "recent" cards + the visible (filtered) list, capped. Memoized on stable
  // inputs so the events effect below only re-runs when the visible set changes.
  const displayedIds = useMemo(() => {
    const ids = [];
    const pushId = (id) => { if (id && !ids.includes(id)) ids.push(id); };
    pushId(sortedDesc.find((b) => bucketize(b.status) === 'PENDING')?.id);
    pushId(sortedDesc.find((b) => bucketize(b.status) === 'IN_PROCESS')?.id);
    sortedDesc
      .filter((b) => {
        const bk = bucketize(b.status);
        if (filter === 'All') return true;
        if (filter === 'Completed') return bk === 'COMPLETED';
        if (filter === 'In Process') return bk === 'IN_PROCESS';
        if (filter === 'Pending') return bk === 'PENDING';
        return false;
      })
      .slice(0, 20)
      .forEach((b) => pushId(b?.id));
    return ids;
  }, [sortedDesc, filter]);

  // Fetch booking-timeline events only for the displayed tickets (≤ ~22), and
  // only when that set changes — replaces the previous ~100-call write-inducing
  // fan-out on every load/refresh.
  React.useEffect(() => {
    if (displayedIds.length === 0) return undefined;
    let active = true;
    (async () => {
      const updates = {};
      await Promise.all(displayedIds.map(async (id) => {
        try {
          const events = await listTicketEvents(id);
          const key = pickLatestEventKey(events);
          if (key) updates[id] = key;
        } catch { /* leave fallback to macro status */ }
      }));
      if (active && Object.keys(updates).length) {
        setEventStatusById((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { active = false; };
  }, [displayedIds]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const openTicket = (t) => {
    navigation.navigate('TechnicianTicketDetail', { ticketId: t.id });
  };

  const openHistory = (t) => {
    navigation.navigate('TechnicianBookingTimeline', { ticketId: t.id });
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
          <TaskCard booking={recentPending} bucket="PENDING" eventKey={eventStatusById[recentPending.id]} onPress={() => openTicket(recentPending)} onHistory={() => openHistory(recentPending)} onRefresh={() => load(true)} refreshing={refreshing} />
        ) : (
          <Text style={styles.empty}>No pending tasks.</Text>
        )}

        <Text style={styles.sectionHeader}>In Process</Text>
        {recentInProcess ? (
          <TaskCard booking={recentInProcess} bucket="IN_PROCESS" eventKey={eventStatusById[recentInProcess.id]} onPress={() => openTicket(recentInProcess)} onHistory={() => openHistory(recentInProcess)} onRefresh={() => load(true)} refreshing={refreshing} />
        ) : (
          <Text style={styles.empty}>No tasks in progress.</Text>
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
          <Text style={styles.empty}>No tasks found.</Text>
        ) : (
          previousCompleted.map((b) => (
            <TaskCard key={b.id} booking={b} bucket={bucketize(b.status)} eventKey={eventStatusById[b.id]} onPress={() => openTicket(b)} onHistory={() => openHistory(b)} onRefresh={() => load(true)} refreshing={refreshing} />
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

function TaskCard({ booking, bucket, eventKey, onPress, onHistory, onRefresh, refreshing }) {
  const isPending = bucket === 'PENDING';
  const isInProcess = bucket === 'IN_PROCESS';
  const isCompleted = bucket === 'COMPLETED';

  // Prefer the event-level phase (capped at REPAIR_COMPLETED for the technician
  // view) over the coarse macro status — the technician needs to see exactly
  // where their work stands, not just "Repair Work In Progress" for everything
  // between APPROVED and READY.
  const stepLine = technicianEventLabel(eventKey) || statusLabel(booking.status);
  const stepColor =
    isPending ? '#DC2626'
      : isInProcess ? '#00008B'
        : '#004C40';

  const footerLine =
    isPending ? `Pending On ${formatDateTime(booking.updatedAt || booking.createdAt)}`
      : isInProcess ? `In Service Process On ${formatDateTime(booking.updatedAt || booking.createdAt)}`
        : `Completed On ${formatDateTime(booking.updatedAt || booking.createdAt)}`;

  return (
    <TouchableOpacity style={styles.taskCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.taskAccent} />
      <View style={styles.taskInner}>
        <View style={styles.taskTopRow}>
          <Text style={styles.taskDate}>{formatDate(booking.createdAt)}</Text>
          <Text style={styles.taskTracking}>{ticketRef(booking)}</Text>
        </View>
        <View style={styles.taskMiddleRow}>
          <Text style={styles.taskDevice} numberOfLines={2}>{deviceLine(booking)}</Text>
        </View>
        <View style={styles.taskBottomRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.taskStep, { color: stepColor }]}>{stepLine}</Text>
            <Text style={styles.taskFooter}>{footerLine}</Text>
          </View>
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.7}
            style={styles.taskStatusIcon}
          >
            {isPending && (
              <View style={[styles.statusBadge, { backgroundColor: '#FEE2E2' }]}>
                {refreshing ? <ActivityIndicator size="small" color="#DC2626" /> : <Ionicons name="refresh" size={14} color="#DC2626" />}
              </View>
            )}
            {isInProcess && (
              <View style={[styles.statusBadge, { backgroundColor: '#DBEAFE' }]}>
                {refreshing ? <ActivityIndicator size="small" color="#00008B" /> : <Ionicons name="refresh" size={14} color="#00008B" />}
              </View>
            )}
            {isCompleted && (
              <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
                {refreshing ? <ActivityIndicator size="small" color="#004C40" /> : <Ionicons name="refresh" size={14} color="#004C40" />}
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Explicit action row — mirrors the Recent Assign card on TaskAssign.
            Whole-card tap still opens View Details, but the buttons make the
            two destinations obvious + give History its own affordance. */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#00008B' }]}
            onPress={onPress}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={12} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>View Details</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#004C40' }]}
            onPress={onHistory}
            activeOpacity={0.85}
          >
            <Ionicons name="time-outline" size={12} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>History</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
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
  taskStatusIcon: { marginLeft: 8 },
  statusBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 7, borderRadius: 6, gap: 4,
  },
  actionBtnText: { color: '#FFFFFF', fontSize: rf(11), fontWeight: '700' },

  empty: { fontSize: rf(12), color: '#6B7280', textAlign: 'center', paddingVertical: 14 },
});
