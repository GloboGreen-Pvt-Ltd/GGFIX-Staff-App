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
import { Ionicons } from '@expo/vector-icons';
import { ticketApi } from '../api/client';
import { listMyTickets, acceptTicket } from '../api/tickets';
import { confirm, notify } from '../components/confirm';
import { rf } from '../utils/responsive';
import { ticketRef } from '../utils/ticketRef';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Tickets are split into the two sections at the top:
//   Re-Assign   — newly assigned, awaiting the technician's accept/reject
//   Recent Assign — already accepted, work in progress or queued
//
// Source of truth for "accepted" is tickets.technician_accepted_at (set by
// POST /tickets/{id}/accept). A ticket whose status is CREATED with no
// accept timestamp is the walk-in just-came-in case; pickup-flow tickets
// mint at IN_DIAGNOSIS with NULL technicianAcceptedAt and also wait here
// until the tech taps Accept.
const FINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED']);
const needsAccept = (t) => !t.technicianAcceptedAt && !FINAL_STATUSES.has(t.status);
const isAccepted = (t) => !!t.technicianAcceptedAt;

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TaskAssignScreen({ navigation }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingOn, setActingOn] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const page = await listMyTickets({ page: 0, size: 100 });
      const items = Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []);
      setList(items);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Scope to picked month/year using whichever timestamp the backend last touched.
  const monthScoped = useMemo(() => {
    return list.filter((t) => {
      const stamp = t.updatedAt || t.createdAt;
      if (!stamp) return true;
      const d = new Date(stamp);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [list, year, month]);

  const reassignList = useMemo(
    () => monthScoped.filter(needsAccept),
    [monthScoped],
  );
  const recentList = useMemo(
    () => monthScoped.filter(isAccepted),
    [monthScoped],
  );

  const counts = useMemo(() => ({
    assign: monthScoped.length,
    reassign: reassignList.length,
    total: list.length,
  }), [monthScoped, reassignList, list]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  // Accept hits the dedicated endpoint (POST /tickets/{id}/accept). Backend
  // stamps technician_accepted_at, bumps a CREATED ticket to IN_DIAGNOSIS,
  // and emits TECHNICIAN_ACCEPTED_SERVICE + TECHNICIAN_WORK_STARTED to the
  // customer/owner timeline. `confirm`/`notify` from components/confirm are
  // cross-platform — Alert.alert doesn't resolve its button callbacks on
  // Expo Web, which silently broke both buttons.
  const handleAccept = async (ticketId) => {
    const proceed = await confirm({
      title: 'Accept ticket?',
      message: 'Mark this ticket as accepted and start work.',
      confirmText: 'Accept',
    });
    if (!proceed) return;
    setActingOn(ticketId);
    try {
      await acceptTicket(ticketId);
      await load(true);
    } catch (e) {
      notify('Error', e?.message || 'Could not accept ticket');
    } finally {
      setActingOn(null);
    }
  };

  // Reject cancels the ticket via the existing status endpoint.
  const handleReject = async (ticketId) => {
    const proceed = await confirm({
      title: 'Decline ticket?',
      message: 'The ticket will be cancelled. Continue?',
      confirmText: 'Decline',
      destructive: true,
    });
    if (!proceed) return;
    setActingOn(ticketId);
    try {
      await ticketApi.patch(`/tickets/${ticketId}/status`, { query: { status: 'CANCELLED' } });
      await load(true);
    } catch (e) {
      notify('Error', e?.message || 'Could not update ticket');
    } finally {
      setActingOn(null);
    }
  };

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <Text style={styles.pageEyebrow}>Employee Working Hrs</Text>

        {/* This Month + month pill */}
        <View style={styles.monthRow}>
          <Text style={styles.monthLabel}>This Month</Text>
          <View style={styles.monthPill}>
            <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-back" size={12} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.monthPillText}>{MONTHS[month - 1]} {year}</Text>
            <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-forward" size={12} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.calBadge}>
              <Ionicons name="calendar" size={12} color="#FFFFFF" />
            </View>
          </View>
        </View>

        {/* Stat tiles */}
        <View style={styles.statRow}>
          <StatTile value={String(counts.assign).padStart(3, '0')} label="Assign" icon="people" bg="#004C40" />
          <StatTile value={String(counts.reassign).padStart(2, '0')} label="Re-Assign" icon="people" bg="#004C40" />
          <StatTile value={String(counts.total).padStart(2, '0')} label="Total" icon="bag-handle" bg="#1E1EAC" />
        </View>

        {/* Re-Assign section */}
        <Text style={styles.sectionHeader}>Re-Assign</Text>
        {loading && list.length === 0 ? (
          <ActivityIndicator color="#00008B" style={{ marginVertical: 16 }} />
        ) : reassignList.length === 0 ? (
          <Text style={styles.empty}>No tickets waiting for your acceptance.</Text>
        ) : (
          reassignList.map((t) => (
            <TaskCard
              key={t.id}
              ticket={t}
              busy={actingOn === t.id}
              variant="reassign"
              onAccept={() => handleAccept(t.id)}
              onReject={() => handleReject(t.id)}
              onView={() => navigation.navigate('TechnicianTicketDetail', { ticketId: t.id })}
            />
          ))
        )}

        {/* Recent Assign section */}
        <Text style={styles.sectionHeader}>Recent Assign</Text>
        {recentList.length === 0 ? (
          <Text style={styles.empty}>No active tickets this month.</Text>
        ) : (
          recentList.map((t) => (
            <TaskCard
              key={t.id}
              ticket={t}
              busy={actingOn === t.id}
              variant="recent"
              onView={() => navigation.navigate('TechnicianTicketDetail', { ticketId: t.id })}
              onHistory={() => navigation.navigate('TechnicianBookingTimeline', { ticketId: t.id })}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function StatTile({ value, label, icon, bg }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statTilePill, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={12} color="#FFFFFF" />
        <Text style={styles.statTilePillText}>{label}</Text>
      </View>
      <Text style={styles.statTileValue}>{value}</Text>
    </View>
  );
}

function TaskCard({ ticket, busy, variant, onAccept, onReject, onView, onHistory }) {
  const isReassign = variant === 'reassign';
  return (
    <View style={styles.taskCard}>
      <View style={styles.taskAccent} />
      <View style={styles.taskInner}>
        <View style={styles.taskTopRow}>
          <Text style={styles.taskDate}>{formatDate(ticket.createdAt)}</Text>
          <Text style={styles.taskRef}>{ticketRef(ticket)}</Text>
        </View>
        <View style={styles.taskDeviceRow}>
          <Text style={styles.taskDevice} numberOfLines={1}>{ticket.deviceDisplayName || 'Device'}</Text>
          <Text style={styles.taskServices} numberOfLines={1}>{ticket.repairServicesSummary || '—'}</Text>
        </View>
        <View style={styles.taskLabelRow}>
          <Text style={styles.taskLabelMuted}>Model & Number</Text>
          <Text style={styles.taskLabelMuted}>Repair Issue</Text>
        </View>

        <View style={styles.taskActions}>
          {isReassign ? (
            <>
              <ActionButton
                label="Accepted"
                bg="#004C40"
                onPress={onAccept}
                busy={busy}
              />
              <ActionButton
                label="Not Accepted"
                bg="#EF4444"
                onPress={onReject}
                busy={busy}
              />
            </>
          ) : (
            <>
              <ActionButton label="Accepted" bg="#004C40" disabled />
              <ActionButton label="View Details" bg="#00008B" onPress={onView} />
              <ActionButton label="History" bg="#004C40" onPress={onHistory} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function ActionButton({ label, bg, onPress, busy, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { backgroundColor: bg }, (busy || disabled) && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={busy || disabled}
      activeOpacity={0.85}
    >
      {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.actionBtnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 14, paddingBottom: 32 },

  pageEyebrow: { fontSize: rf(11), color: '#9CA3AF', marginBottom: 6, fontWeight: '500' },

  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
  },
  monthLabel: { fontSize: rf(14), fontWeight: '700', color: '#111827' },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 6,
  },
  monthPillText: { color: '#FFFFFF', fontSize: rf(11), fontWeight: '700' },
  calBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#1E1EAC', alignItems: 'center', justifyContent: 'center', marginLeft: 2 },

  statRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    overflow: 'hidden',
    paddingBottom: 10,
    alignItems: 'center',
  },
  statTilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 8,
  },
  statTilePillText: { fontSize: rf(11), fontWeight: '700', color: '#FFFFFF' },
  statTileValue: { fontSize: rf(22), fontWeight: '800', color: '#111827', marginTop: 6 },

  sectionHeader: { fontSize: rf(14), fontWeight: '800', color: '#111827', marginTop: 4, marginBottom: 8 },

  taskCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  taskAccent: { width: 3, backgroundColor: '#1E1EAC' },
  taskInner: { flex: 1, padding: 12 },

  taskTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskDate: { fontSize: rf(12), fontWeight: '700', color: '#111827' },
  taskRef: { fontSize: rf(11), fontWeight: '700', color: '#6B7280' },

  taskDeviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  taskDevice: { fontSize: rf(13), fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 },
  taskServices: { fontSize: rf(12), fontWeight: '600', color: '#111827', textAlign: 'right' },

  taskLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  taskLabelMuted: { fontSize: rf(10), color: '#9CA3AF' },

  taskActions: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6, minWidth: 84, alignItems: 'center' },
  actionBtnText: { color: '#FFFFFF', fontSize: rf(12), fontWeight: '700' },

  empty: { fontSize: rf(12), color: '#6B7280', textAlign: 'center', paddingVertical: 14 },
});
