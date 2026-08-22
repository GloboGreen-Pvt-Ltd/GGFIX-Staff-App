import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { listMyAssignedPickups, updatePickupStatus } from '../api/pickups';
import { confirm, notify } from '../components/confirm';
import { readPickupPersonLocation } from '../utils/pickupLocation';
import { rf, rlh } from '../utils/responsive';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Active = still in the pickup person's hands. REACHED_SHOP stays active so
// the pickup person can tap "Received at Shop" on the same card to complete
// the hand-off. RECEIVED_AT_SHOP is the terminal state — booking moves to
// the shop's bench (Pickup History from the pickup person's POV).
// Includes the legacy PICKUP_ASSIGNED key for in-flight bookings that
// pre-date the rename.
const ACTIVE_PICKUP_STATUSES = new Set([
  'PICKUP_PERSON_ASSIGNED', 'PICKUP_ASSIGNED',
  'PICKUP_ON_THE_WAY', 'REACHED_CUSTOMER_LOCATION',
  'REPAIR_ESTIMATE_PROCESSING',
  'DEVICE_PICKED_UP', 'PICKED_UP',
  'REACHED_SHOP',
]);

// Event keys emitted by RepairBookingController when the owner assigns or
// reassigns the pickup person.
const REASSIGN_EVENT = 'PICKUP_REASSIGNED';
const ASSIGN_EVENT = 'PICKUP_ASSIGNED';

// Maps the booking's current status → the next status the pickup person
// taps to advance. Returning null means the card has no advance action
// (e.g. it's already at REACHED_SHOP, or in some other terminal state).
function nextStatusFor(currentStatus) {
  const s = String(currentStatus || '').toUpperCase();
  if (s === 'PICKUP_PERSON_ASSIGNED' || s === 'PICKUP_ASSIGNED' || s === 'PICKUP_REASSIGNED') {
    return { code: 'PICKUP_ON_THE_WAY', label: "I'm On The Way" };
  }
  if (s === 'PICKUP_ON_THE_WAY') {
    // Reached Customer Location is gated by a 50m radius check around the
    // customer's saved pickup address (customer_addresses.latitude/longitude).
    // The `action: 'reachedCustomer'` flag tells advance() to grab the
    // pickup person's GPS before PATCHing. Backend allows the transition
    // without GPS if the customer address has no coordinates.
    return { code: 'REACHED_CUSTOMER_LOCATION', label: 'Reached Customer Location', action: 'reachedCustomer' };
  }
  if (s === 'REACHED_CUSTOMER_LOCATION') {
    return { code: 'REPAIR_ESTIMATE_PROCESSING', label: 'Repair Estimate', action: 'estimate' };
  }
  if (s === 'REPAIR_ESTIMATE_PROCESSING' || s === 'ESTIMATE_SUBMITTED') {
    return { code: 'DEVICE_PICKED_UP', label: 'Device Picked Up' };
  }
  if (s === 'DEVICE_PICKED_UP' || s === 'PICKED_UP') {
    // Reached Shop requires a GPS reading the backend uses for a 50m radius
    // check around the shop. The `action: 'reached'` flag tells advance() to
    // grab location before PATCHing.
    return { code: 'REACHED_SHOP', label: 'Reached Shop', action: 'reached' };
  }
  if (s === 'REACHED_SHOP') {
    return { code: 'RECEIVED_AT_SHOP', label: 'Received at Shop' };
  }
  return null;
}

function currentStatusLabel(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'PICKUP_PERSON_ASSIGNED' || s === 'PICKUP_ASSIGNED') return 'Assigned';
  if (s === 'PICKUP_REASSIGNED') return 'Re-Assigned';
  if (s === 'PICKUP_ON_THE_WAY') return 'On The Way';
  if (s === 'REACHED_CUSTOMER_LOCATION') return 'At Customer';
  if (s === 'REPAIR_ESTIMATE_PROCESSING' || s === 'ESTIMATE_SUBMITTED') return 'Estimate Submitted';
  if (s === 'DEVICE_PICKED_UP' || s === 'PICKED_UP') return 'Picked Up';
  if (s === 'REACHED_SHOP') return 'Reached Shop';
  if (s === 'RECEIVED_AT_SHOP') return 'Received at Shop';
  if (s === 'CANCELLED') return 'Cancelled';
  return s.replace(/_/g, ' ');
}

function trackingId(b) {
  return b.bookingNumber || `#${String(b.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatSlot(start, end) {
  if (!start && !end) return '';
  const tidy = (t) => (t ? String(t).slice(0, 5) : '');
  return `${tidy(start)}${end ? ' – ' + tidy(end) : ''}`;
}

// The shop sets repair_bookings.status = PICKUP_ASSIGNED on both first
// assignment AND reassignment — the only way to distinguish "newly reassigned
// to me" is the most recent matching event in the booking's event log.
function latestAssignmentEvent(events) {
  if (!Array.isArray(events) || events.length === 0) return null;
  let best = null;
  for (const ev of events) {
    const code = String(ev?.status || '').toUpperCase();
    if (code !== REASSIGN_EVENT && code !== ASSIGN_EVENT) continue;
    const ts = ev.createdAt ? new Date(ev.createdAt).getTime() : 0;
    if (!best || ts >= best.ts) best = { code, ts };
  }
  return best ? best.code : null;
}

export default function PickupAssignScreen({ navigation }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Per-booking busy flag so the right card spinner shows during the PATCH.
  const [advancingId, setAdvancingId] = useState(null);
  const loadedOnceRef = React.useRef(false);

  // Backed by ticket-service /technicians/me/pickup-bookings — it resolves
  // the caller's pickup-person row from the JWT (userId + shopId), so the
  // screen no longer has to pass technicianId itself.
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

  const advance = useCallback(async (booking) => {
    const next = nextStatusFor(booking.status);
    if (!next) return;
    if (next.action === 'estimate') {
      // Repair Estimate flow starts at brand selection: SelectBrand → SelectModel
      // → DeviceColorStorage → DeviceServices → ServicePriceEstimate → submit.
      // Booking already carries pickupReportId/pickupRequestId/bookingId/etc;
      // spread the whole booking so downstream screens get a stable payload.
      navigation.navigate('PickupSelectBrand', {
        bookingId: booking.id,
        pickupReportId: booking.pickupReportId || booking.id,
        pickupRequestId: booking.pickupRequestId || null,
        trackingId: booking.bookingNumber || null,
        customerId: booking.customerUserId || null,
        shopId: booking.shopId || null,
        pickupPersonId: booking.assignedPickupPersonId || null,
        deviceCategoryId: booking.deviceCategoryId || null,
        deviceCategoryCode: booking.deviceCategoryCode || null,
        booking,
      });
      return;
    }
    const ok = await confirm({
      title: 'Update status?',
      message: `Mark booking ${booking.bookingNumber || booking.id} as "${next.label}"?`,
      confirmText: next.label,
    });
    if (!ok) return;
    setAdvancingId(booking.id);
    try {
      // Both REACHED_SHOP and REACHED_CUSTOMER_LOCATION are gated by the
      // backend on a 50m radius check (against shop coords / customer
      // pickup address coords respectively) — fetch the pickup person's
      // current GPS reading and ship it with the PATCH. Skip this step
      // for every other transition (no extra permission prompt).
      let extras = {};
      const needsGps = next.action === 'reached' || next.action === 'reachedCustomer';
      if (needsGps) {
        try {
          const { latitude, longitude } = await readPickupPersonLocation();
          extras = { latitude, longitude };
        } catch (locErr) {
          if (next.action === 'reached') {
            // Shop always has coordinates + a hard 50m gate, so a missing GPS fix
            // can never satisfy the check — stop early instead of a pointless
            // round trip.
            notify('Location needed',
              locErr?.message || 'Turn on location and try again to mark Reached Shop.');
            return;
          }
          // Reached Customer: the backend ALLOWS this transition without GPS when
          // the customer's pickup address has no saved coordinates. Proceed with
          // empty extras and let the server decide (it returns LOCATION_REQUIRED /
          // OUT_OF_RADIUS if it actually needs them) rather than permanently
          // stranding a pickup person whose customer address isn't geocoded and
          // whose location permission is denied.
        }
      }
      const resp = await updatePickupStatus(booking.id, next.code, extras);
      if (resp?.message) {
        notify('Status updated', resp.message);
      }
      await load(true);
    } catch (e) {
      // Backend returns 422 + structured payload when the radius check fails
      // so the user knows how far off they are. Surface the server message
      // verbatim (it already includes the distance). Tailor titles per
      // action so the user knows which place they were too far from.
      const payload = e?.payload || {};
      const code = payload.code;
      const customerStep = next.action === 'reachedCustomer';
      if (code === 'OUT_OF_RADIUS') {
        notify(customerStep ? 'Not at customer yet' : 'Not at shop yet',
          payload.message
            || `You are ${payload.distanceMeters || '?'}m away. Please reach the ${customerStep ? 'customer address' : 'shop'} to continue.`);
      } else if (code === 'LOCATION_REQUIRED') {
        notify('Location needed', payload.message || 'Enable location and try again.');
      } else if (code === 'SHOP_LOCATION_MISSING') {
        notify('Shop location missing',
          payload.message || 'Shop coordinates are not set. Ask the owner to update the shop profile.');
      } else {
        notify('Could not update', e?.message || 'Please try again.');
      }
    } finally {
      setAdvancingId(null);
    }
  }, [load, navigation]);

  const monthScoped = useMemo(() => {
    return list.filter((b) => {
      const stamp = b.updatedAt || b.createdAt;
      if (!stamp) return true;
      const d = new Date(stamp);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [list, year, month]);

  const reassignList = useMemo(
    () => monthScoped.filter((b) =>
      ACTIVE_PICKUP_STATUSES.has(b.status) && latestAssignmentEvent(b.events) === REASSIGN_EVENT,
    ),
    [monthScoped],
  );

  const recentList = useMemo(
    () => monthScoped.filter((b) =>
      ACTIVE_PICKUP_STATUSES.has(b.status) && latestAssignmentEvent(b.events) !== REASSIGN_EVENT,
    ),
    [monthScoped],
  );

  const counts = useMemo(() => ({
    assign: recentList.length,
    reassign: reassignList.length,
    total: monthScoped.length,
  }), [monthScoped, reassignList, recentList]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <Text style={styles.pageEyebrow}>Assigned Pickups</Text>

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

        <View style={styles.statRow}>
          <StatTile value={String(counts.assign).padStart(3, '0')} label="Assign" icon="cube" bg="#00008B" />
          <StatTile value={String(counts.reassign).padStart(2, '0')} label="Re-Assign" icon="swap-horizontal" bg="#F59E0B" />
          <StatTile value={String(counts.total).padStart(2, '0')} label="Total" icon="bag-handle" bg="#004C40" />
        </View>

        <Text style={styles.sectionHeader}>Re-Assign</Text>
        {loading && list.length === 0 ? (
          <ActivityIndicator color="#00008B" style={{ marginVertical: 16 }} />
        ) : reassignList.length === 0 ? (
          <Text style={styles.empty}>No pickups reassigned to you.</Text>
        ) : (
          reassignList.map((b) => (
            <PickupCard
              key={b.id}
              booking={b}
              variant="reassign"
              busy={advancingId === b.id}
              onAdvance={() => advance(b)}
              onHistory={() => navigation.navigate('PickupHistory', { booking: b })}
            />
          ))
        )}

        <Text style={styles.sectionHeader}>Recent Assign</Text>
        {recentList.length === 0 ? (
          <Text style={styles.empty}>No active pickups this month.</Text>
        ) : (
          recentList.map((b) => (
            <PickupCard
              key={b.id}
              booking={b}
              variant="recent"
              busy={advancingId === b.id}
              onAdvance={() => advance(b)}
              onHistory={() => navigation.navigate('PickupHistory', { booking: b })}
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

function PickupCard({ booking, variant, busy, onAdvance, onHistory }) {
  const isReassign = variant === 'reassign';
  const slot = formatSlot(booking.pickupSlotStart, booking.pickupSlotEnd);
  const phone = booking.customerMobile || booking.pickupAddressMobile;
  const callCustomer = () => {
    if (phone) Linking.openURL(`tel:${phone}`);
  };
  const openInMaps = () => {
    if (!booking.pickupAddressText) return;
    const q = encodeURIComponent(booking.pickupAddressText);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };
  const next = nextStatusFor(booking.status);
  const statusLabel = currentStatusLabel(booking.status);
  return (
    <View style={styles.taskCard}>
      <View style={[styles.taskAccent, isReassign && { backgroundColor: '#F59E0B' }]} />
      <View style={styles.taskInner}>
        <View style={styles.taskTopRow}>
          <Text style={styles.taskDate}>
            Pickup {formatDate(booking.pickupDate || booking.createdAt)}
            {slot ? `  ·  ${slot}` : ''}
          </Text>
          <Text style={styles.taskRef}>{trackingId(booking)}</Text>
        </View>

        <View style={styles.taskDeviceRow}>
          <Text style={styles.taskDevice} numberOfLines={1}>
            {booking.customerName || 'Customer'}
          </Text>
          <Text style={styles.taskServices} numberOfLines={1}>
            {booking.issueSummary || booking.services?.[0]?.serviceName || 'Service'}
          </Text>
        </View>
        <View style={styles.taskLabelRow}>
          <Text style={styles.taskLabelMuted}>Customer</Text>
          <Text style={styles.taskLabelMuted}>Issue</Text>
        </View>

        {booking.pickupAddressText ? (
          <View style={styles.addressRow}>
            <Ionicons name="location" size={12} color="#6B7280" style={{ marginTop: 1 }} />
            <Text style={styles.addressText} numberOfLines={2}>{booking.pickupAddressText}</Text>
          </View>
        ) : null}

        {/* Current pickup status — at-a-glance */}
        <View style={styles.statusRow}>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{statusLabel}</Text>
          </View>
          {next ? (
            <Text style={styles.statusNextHint}>Next: {next.label}</Text>
          ) : (
            <Text style={styles.statusDoneHint}>Pickup complete</Text>
          )}
        </View>

        {/* Primary advance-status action (full width, prominent) */}
        {next ? (
          <TouchableOpacity
            style={[styles.advanceBtn, busy && { opacity: 0.6 }]}
            onPress={onAdvance}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="arrow-forward-circle" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.advanceBtnText}>{next.label}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        <View style={styles.taskActions}>
          <ActionButton
            label="Call"
            bg="#004C40"
            icon="call"
            onPress={callCustomer}
            disabled={!phone}
          />
          <ActionButton
            label="Directions"
            bg="#00008B"
            icon="navigate"
            onPress={openInMaps}
            disabled={!booking.pickupAddressText}
          />
          <ActionButton
            label="History"
            bg="#0F172A"
            icon="time"
            onPress={onHistory}
          />
        </View>
      </View>
    </View>
  );
}

function ActionButton({ label, bg, onPress, icon, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { backgroundColor: bg }, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {icon ? <Ionicons name={icon} size={13} color="#FFFFFF" style={{ marginRight: 6 }} /> : null}
      <Text style={styles.actionBtnText}>{label}</Text>
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

  addressRow: { flexDirection: 'row', marginTop: 8, gap: 4 },
  addressText: { flex: 1, fontSize: rf(11), color: '#4B5563', lineHeight: rlh(16) },

  taskActions: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, minWidth: 76, justifyContent: 'center' },
  actionBtnText: { color: '#FFFFFF', fontSize: rf(12), fontWeight: '700' },

  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  statusPill: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { fontSize: rf(10), fontWeight: '800', color: '#3730A3', letterSpacing: 0.5 },
  statusNextHint: { marginLeft: 8, fontSize: rf(10), color: '#6B7280', fontWeight: '600' },
  statusDoneHint: { marginLeft: 8, fontSize: rf(10), color: '#004C40', fontWeight: '700' },

  advanceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 10, backgroundColor: '#00008B', borderRadius: 8, paddingVertical: 10,
  },
  advanceBtnText: { color: '#FFFFFF', fontSize: rf(13), fontWeight: '700' },

  empty: { fontSize: rf(12), color: '#6B7280', textAlign: 'center', paddingVertical: 14 },
});
