import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rf } from '../utils/responsive';

function trackingId(booking) {
  return booking?.bookingNumber
    || `#${String(booking?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

function labelFor(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'PICKUP_REQUESTED' || s === 'ORDER_PLACED' || s === 'BOOKING_CREATED_BY_SHOP') return 'Pickup Requested';
  if (s === 'PICKUP_ACCEPTED' || s === 'ORDER_SERVICE_CONFIRMED' || s === 'SERVICE_ACCEPTED') return 'Pickup Accepted';
  if (s === 'PICKUP_PERSON_ASSIGNED' || s === 'PICKUP_ASSIGNED') return 'Pickup Person Assigned';
  if (s === 'PICKUP_REASSIGNED') return 'Pickup Person Reassigned';
  if (s === 'PICKUP_ON_THE_WAY') return 'Pickup Person On The Way';
  if (s === 'REPAIR_ESTIMATE_PROCESSING' || s === 'ESTIMATE_SUBMITTED') return 'Repair Estimate Processing';
  if (s === 'DEVICE_PICKED_UP' || s === 'PICKED_UP' || s === 'DEVICE_RECEIVED') return 'Device Picked Up';
  if (s === 'REACHED_SHOP' || s === 'DEVICE_DELIVERY_TO_SHOP') return 'Reached Shop';
  if (s === 'CANCELLED') return 'Cancelled';
  return s ? s.replace(/_/g, ' ') : 'Status Update';
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PickupHistoryScreen({ route }) {
  const booking = route?.params?.booking || {};
  const events = Array.isArray(booking.events) ? booking.events : [];

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <View style={styles.summaryIcon}>
            <Ionicons name="time-outline" size={18} color="#00008B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>{trackingId(booking)}</Text>
            <Text style={styles.summarySub}>{booking.customerName || 'Customer'}</Text>
          </View>
        </View>

        <View style={styles.timeline}>
          {events.length === 0 ? (
            <Text style={styles.empty}>No pickup history yet.</Text>
          ) : events.map((event, index) => {
            const isLast = index === events.length - 1;
            return (
              <View key={event.id || `${event.status}-${index}`} style={styles.eventRow}>
                <View style={styles.rail}>
                  <View style={styles.dot}>
                    <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                  </View>
                  {!isLast ? <View style={styles.line} /> : null}
                </View>
                <View style={styles.eventBody}>
                  <Text style={styles.eventStatus}>{labelFor(event.status)}</Text>
                  {event.note ? <Text style={styles.eventNote}>{event.note}</Text> : null}
                  <Text style={styles.eventMeta}>
                    {[fmtDateTime(event.createdAt), event.actor || 'SYSTEM'].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 14, paddingBottom: 36 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  summaryTitle: { fontSize: rf(15), fontWeight: '800', color: '#111827' },
  summarySub: { fontSize: rf(11), color: '#64748B', marginTop: 2, fontWeight: '600' },
  timeline: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  eventRow: { flexDirection: 'row' },
  rail: { width: 28, alignItems: 'center' },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#004C40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: { flex: 1, width: 2, backgroundColor: '#A7F3D0', marginVertical: 3 },
  eventBody: { flex: 1, paddingBottom: 14 },
  eventStatus: { fontSize: rf(13), color: '#111827', fontWeight: '800' },
  eventNote: { fontSize: rf(11), color: '#334155', marginTop: 2 },
  eventMeta: { fontSize: rf(10), color: '#64748B', marginTop: 2 },
  empty: { textAlign: 'center', color: '#64748B', fontSize: rf(12), paddingVertical: 16 },
});
