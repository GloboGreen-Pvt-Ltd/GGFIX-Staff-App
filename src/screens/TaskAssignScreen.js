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

// Screen palette — GGFIX green / red / yellow on light neutrals, the same set
// the restyled Home and Ticket Detail screens use.
const C = {
  green: '#09AD2A',
  greenTint: '#E6F7EA',
  red: '#F84141',
  yellow: '#F3BF23',
  ink: '#1E1E1E',
  muted: '#6E6E6E',
  faint: '#A3A3A3',
  bg: '#F8F8F8',
  border: '#ECECEC',
};

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />}
      >
        <Text style={styles.pageEyebrow}>Employee Working Hrs</Text>

        {/* This Month + month pill */}
        <View style={styles.monthRow}>
          <Text style={styles.monthLabel}>This Month</Text>
          <View style={styles.monthPill}>
            <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-back" size={13} color={C.ink} />
            </TouchableOpacity>
            <Text style={styles.monthPillText}>{MONTHS[month - 1]} {year}</Text>
            <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-forward" size={13} color={C.ink} />
            </TouchableOpacity>
            <View style={styles.calBadge}>
              <Ionicons name="calendar" size={11} color="#FFFFFF" />
            </View>
          </View>
        </View>

        {/* Stat tiles */}
        <View style={styles.statRow}>
          <StatTile value={String(counts.assign).padStart(3, '0')} label="Assign" icon="people" bg={C.green} fg="#FFFFFF" />
          <StatTile value={String(counts.reassign).padStart(2, '0')} label="Re-Assign" icon="people" bg={C.yellow} fg={C.ink} />
          <StatTile value={String(counts.total).padStart(2, '0')} label="Total" icon="bag-handle" bg={C.ink} fg="#FFFFFF" />
        </View>

        {/* Re-Assign section */}
        <Text style={styles.sectionHeader}>Re-Assign</Text>
        {loading && list.length === 0 ? (
          <ActivityIndicator color={C.green} style={{ marginVertical: 16 }} />
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

function StatTile({ value, label, icon, bg, fg }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statTilePill, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={11} color={fg} />
        <Text style={[styles.statTilePillText, { color: fg }]}>{label}</Text>
      </View>
      <Text style={styles.statTileValue}>{value}</Text>
    </View>
  );
}

function TaskCard({ ticket, busy, variant, onAccept, onReject, onView, onHistory }) {
  const isReassign = variant === 'reassign';
  return (
    <View style={styles.taskCard}>
      {/* Yellow = waiting for your accept, green = accepted. */}
      <View style={[styles.taskAccent, { backgroundColor: isReassign ? C.yellow : C.green }]} />
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
                bg={C.green}
                onPress={onAccept}
                busy={busy}
              />
              <ActionButton
                label="Not Accepted"
                bg={C.red}
                onPress={onReject}
                busy={busy}
              />
            </>
          ) : (
            <>
              <ActionButton label="Accepted" bg={C.greenTint} fg={C.green} disabled />
              <ActionButton label="View Details" bg={C.green} onPress={onView} />
              <ActionButton label="History" bg={C.ink} onPress={onHistory} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// `fg` marks a tinted status chip (e.g. the disabled "Accepted"), which keeps
// full opacity; solid buttons fade while busy or disabled.
function ActionButton({ label, bg, fg = '#FFFFFF', onPress, busy, disabled }) {
  const tinted = fg !== '#FFFFFF';
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { backgroundColor: bg }, (busy || (disabled && !tinted)) && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={busy || disabled}
      activeOpacity={0.85}
    >
      {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={[styles.actionBtnText, { color: fg }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { padding: 12, paddingBottom: 28 },

  pageEyebrow: { fontSize: rf(10.5), color: C.faint, marginBottom: 4, fontWeight: '500' },

  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  monthLabel: { fontSize: rf(14), fontWeight: '800', color: C.ink },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: C.border,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 6,
  },
  monthPillText: { color: C.ink, fontSize: rf(11.5), fontWeight: '700' },
  calBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },

  statRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'center',
  },
  statTilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statTilePillText: { fontSize: rf(10.5), fontWeight: '700' },
  statTileValue: { fontSize: rf(19), fontWeight: '800', color: C.ink, marginTop: 4 },

  sectionHeader: { fontSize: rf(13.5), fontWeight: '800', color: C.ink, marginTop: 2, marginBottom: 6 },

  taskCard: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: C.border,
  },
  taskAccent: { width: 3 },
  taskInner: { flex: 1, paddingHorizontal: 10, paddingVertical: 9 },

  taskTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskDate: { fontSize: rf(11.5), fontWeight: '700', color: C.ink },
  taskRef: { fontSize: rf(10.5), fontWeight: '700', color: C.muted },

  taskDeviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  taskDevice: { fontSize: rf(12.5), fontWeight: '700', color: C.ink, flex: 1, marginRight: 8 },
  taskServices: { fontSize: rf(11.5), fontWeight: '600', color: C.red, textAlign: 'right' },

  taskLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 },
  taskLabelMuted: { fontSize: rf(9.5), color: C.faint },

  taskActions: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  actionBtnText: { color: '#FFFFFF', fontSize: rf(11.5), fontWeight: '700' },

  empty: { fontSize: rf(11.5), color: C.muted, textAlign: 'center', paddingVertical: 12 },
});
