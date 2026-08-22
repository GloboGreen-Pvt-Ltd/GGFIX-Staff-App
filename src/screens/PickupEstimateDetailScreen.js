import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getPickupRepairEstimate } from '../api/pickups';
import { normalizeDeviceImageUrl } from '../utils/images';
import { rf } from '../utils/responsive';

// Pickup-side Estimate Details. Visual language mirrors the shop-owner
// "Booking Details" screen (cards stacked vertically: device hero with a
// status pill, customer details, service schedule, price summary, quick
// actions grid, plus a bottom green "Edit Estimate" CTA that drops the
// pickup person into the multi-step edit wizard at PickupSelectBrand).

function trackingId(booking) {
  return booking?.bookingNumber
    || `#${String(booking?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

function deviceTitle(booking) {
  const brand = booking?.brandName;
  const model = booking?.modelName;
  if (brand && model) return `${brand} ${model}`;
  return brand || model || 'Device';
}

function base64ImageUri(raw) {
  if (!raw) return null;
  const value = String(raw);
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

function deviceImageUri(booking) {
  // master_models.image_url is often .avif (Android <Image> can't decode it);
  // normalizeDeviceImageUrl forces Cloudinary to transcode to JPEG.
  const url = normalizeDeviceImageUrl(booking?.deviceImageUrl || booking?.modelImageUrl);
  if (url) return url;
  return base64ImageUri(booking?.deviceImageBase64 || booking?.modelImageBase64);
}

function formatINR(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Backend persists missing/damaged parts as a CSV-or-JSON string. PickupDeviceMissingPartsScreen
// expects an array of `{partId, partName, missing, damage}` so it can re-tick the
// rows the pickup person picked last time. Best-effort parser — when the string
// can't be reshaped we just skip the prefill instead of crashing.
function parseMissingPartsCsv(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* fall through */ }
  }
  // Split on newlines OR commas that are NOT inside "(...)". The producer now
  // joins records with newlines, but legacy rows used ", " between records — a
  // plain comma split shredded "Display (missing, damaged)" on its inner comma.
  // The negative lookahead keeps the inner flag-comma intact while still
  // splitting older comma-joined data at the record boundary.
  return s.split(/\n|,(?![^(]*\))/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((name) => {
      const lc = name.toLowerCase();
      return {
        partName: name.replace(/\s*\((missing|damaged)(,\s*(missing|damaged))?\)\s*$/i, '').trim(),
        missing: lc.includes('missing'),
        damage: lc.includes('damaged') || lc.includes('damage'),
      };
    });
}

function approvalLabel(raw) {
  if (raw === true || raw === 'DONE' || raw === 'TRUE' || raw === 'YES' || raw === 'APPROVED') return 'Done';
  if (raw === false || raw === 'PENDING' || raw === 'FALSE' || raw === 'NO') return 'Pending';
  return null;
}

// Recover the device-lock TYPE for the Edit-Estimate prefill. The backend only
// persists the lock value (device_pin), so we prefer an explicit type column if
// present and otherwise infer it from the value shape: a comma-joined value is a
// PATTERN ("1,2,4,5"), a pure 4/6-digit value is a PIN, anything else is an
// alphanumeric PASSWORD. Without this, a saved PATTERN re-opened mislabeled as a
// PIN with the comma-laden value stuffed into the numeric PIN field.
function buildPrefillLock(booking) {
  const value = booking?.devicePin;
  if (!value) return null;
  const explicit = booking?.deviceLockType || booking?.lockType;
  let type = explicit && explicit !== 'NONE' ? explicit : null;
  if (!type) {
    const v = String(value);
    if (v.includes(',')) type = 'PATTERN';
    else if (/^\d{4,6}$/.test(v)) type = 'PIN';
    else type = 'PASSWORD';
  }
  return { type, value };
}

// Map the raw pickup status to a short label + the color band used by the
// owner-side hero pill ("In Diagnosis" is the reference; pickup statuses
// route through the same chip).
function statusBadge(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'PICKUP_PERSON_ASSIGNED' || s === 'PICKUP_ASSIGNED' || s === 'PICKUP_REASSIGNED') {
    return { label: 'Assigned', bg: '#FEF3C7', fg: '#92400E' };
  }
  if (s === 'PICKUP_ON_THE_WAY') return { label: 'On The Way', bg: '#DBEAFE', fg: '#1E3A8A' };
  if (s === 'REPAIR_ESTIMATE_PROCESSING') return { label: 'In Diagnosis', bg: '#FEF3C7', fg: '#92400E' };
  if (s === 'DEVICE_PICKED_UP' || s === 'PICKED_UP') return { label: 'Picked Up', bg: '#E0E7FF', fg: '#00008B' };
  if (s === 'REACHED_SHOP') return { label: 'Reached Shop', bg: '#DCFCE7', fg: '#004C40' };
  if (s === 'RECEIVED_AT_SHOP') return { label: 'Received', bg: '#DCFCE7', fg: '#004C40' };
  if (s === 'CANCELLED') return { label: 'Cancelled', bg: '#FEE2E2', fg: '#991B1B' };
  if (!s) return null;
  return { label: s.replace(/_/g, ' '), bg: '#E5E7EB', fg: '#374151' };
}

export default function PickupEstimateDetailScreen({ navigation, route }) {
  const initial = route?.params?.booking || null;
  const bookingId = route?.params?.bookingId || initial?.id || null;
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setError(null);
    try {
      const fresh = await getPickupRepairEstimate(bookingId);
      setData((prev) => ({ ...(prev || {}), ...(fresh || {}) }));
    } catch (e) {
      setError(e?.message || 'Could not load estimate');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  useEffect(() => {
    navigation.setOptions({ title: 'Pickup Service Details' });
  }, [navigation]);

  const booking = data || {};
  const imageUri = deviceImageUri(booking);
  const services = Array.isArray(booking.services) ? booking.services : [];
  const lineTotal = services.reduce((sum, s) => sum + (Number(s.price ?? s.estimatedPrice) || 0), 0);
  const estimateTotal = booking.estimateAmount != null
    ? Number(booking.estimateAmount)
    : (lineTotal || null);
  const badge = statusBadge(booking.status);

  // "Edit Estimate" — re-enter the multi-step wizard at brand selection so
  // the pickup person can update device taxonomy, services, schedule, security
  // and missing parts before resubmitting. Each subsequent screen reads the
  // booking via params, so passing it once seeds the entire flow.
  const goEditEstimate = () => {
    if (!bookingId) return;
    navigation.navigate('PickupSelectBrand', {
      booking,
      bookingId,
      // Seed the wizard with the booking's current taxonomy so each screen
      // can render the hero image + spec line before the user re-picks
      // anything. Each downstream screen reads from `params` first and
      // falls back to `booking`, so any in-wizard re-pick overrides cleanly.
      brandId: booking.brandId || null,
      brandName: booking.brandName || null,
      modelId: booking.modelId || null,
      modelName: booking.modelName || null,
      modelImageUrl: booking.modelImageUrl || booking.deviceImageUrl || null,
      modelImageBase64: booking.modelImageBase64 || booking.deviceImageBase64 || null,
      ramOptionId: booking.ramOptionId || null,
      ramLabel: booking.ramLabel || null,
      storageOptionId: booking.storageOptionId || null,
      storageLabel: booking.storageLabel || null,
      color: booking.color || null,
      // Prefill upstream form state so PickupServicePriceEstimate can re-hydrate
      // schedule + complaint when the user re-enters the wizard from Edit.
      prefillImei: booking.imei || null,
      prefillComplaint: booking.issueSummary || null,
      prefillEstimatedReadyIso: booking.estimatedReadyAt || null,
      prefillEstimatedDeliveryIso: booking.estimatedDeliveryAt || null,
      prefillCustomerApproved:
        booking.customerApproval === 'DONE' || booking.customerApproval === true || null,
      prefillLock: buildPrefillLock(booking),
      prefillDevicePhotos: {
        front: booking.frontImageUrl || null,
        back: booking.backImageUrl || null,
        video: booking.videoUrl || null,
      },
      // Services + missing parts: pre-tick the rows the customer / pickup
      // person already picked so PickupDeviceServices and PickupDeviceMissingParts
      // open with the existing selection highlighted.
      prefillServices: Array.isArray(booking.services)
        ? booking.services.map((s) => ({
            serviceId: s.serviceId || s.repairServiceId || s.id || null,
            serviceCode: s.serviceCode || s.code || null,
            serviceName: s.serviceName || s.name || null,
            price: Number(s.price ?? s.estimatedPrice) || 0,
            warranty: s.warranty || null,
          }))
        : null,
      prefillMissingParts: parseMissingPartsCsv(booking.missingDamageParts),
    });
  };
  const goPickupHistory = () => {
    navigation.navigate('PickupHistory', { booking });
  };

  if (!bookingId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Booking not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading && !data ? (
          <ActivityIndicator size="small" color="#00008B" style={{ marginTop: 24 }} />
        ) : null}

        {/* Device Hero — image + tracking + device + color, with status pill
            anchored top-right. Mirrors the shop-owner Booking Details hero. */}
        <View style={styles.heroCard}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroImagePlaceholder}>
              <Ionicons name="phone-portrait-outline" size={26} color="#00008B" />
            </View>
          )}
          <View style={{ flex: 1, paddingRight: badge ? 86 : 0 }}>
            <Text style={styles.heroLabel}>Tracking</Text>
            <Text style={styles.heroTracking} numberOfLines={2}>{trackingId(booking)}</Text>
            <Text style={styles.heroDevice} numberOfLines={2}>{deviceTitle(booking)}</Text>
            {booking.ramLabel || booking.storageLabel ? (
              <Text style={styles.heroSpec} numberOfLines={1}>
                {[booking.ramLabel, booking.storageLabel].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {booking.color ? (
              <Text style={styles.heroColor}>{booking.color}</Text>
            ) : null}
          </View>
          {badge ? (
            <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statusPillText, { color: badge.fg }]} numberOfLines={1}>
                {badge.label}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Customer Details */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="person-circle-outline" size={16} color="#1E3A8A" />
            <Text style={styles.sectionTitle}>Customer Details</Text>
          </View>
          <KvRow icon="person-outline" label="Name" value={booking.customerName || '—'} />
          <KvRow icon="call-outline" label="Mobile" value={booking.customerMobile || '—'} />
          {booking.pickupAddressText ? (
            <KvRow
              icon="location-outline"
              label="Address"
              value={booking.pickupAddressText}
              multiline
            />
          ) : null}
        </View>

        {/* Service Schedule — wired to repair_bookings columns
            estimated_ready_at / estimated_duration_hours / estimated_delivery_at
            / customer_approval. Labels match the customer-facing booking
            details screen so the pickup person sees the same vocabulary the
            customer reads. */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="calendar-outline" size={16} color="#1E3A8A" />
            <Text style={styles.sectionTitle}>Service Schedule</Text>
          </View>
          <KvRow
            icon="time-outline"
            label="Estimated Approximate Time"
            labelWidth={170}
            value={
              formatDateTime(booking.estimatedReadyAt)
                ? `${formatDateTime(booking.estimatedReadyAt)}${
                    booking.estimatedDurationHours ? `, ${booking.estimatedDurationHours}Hr` : ''
                  }`
                : 'Not yet set'
            }
            multiline
          />
          <KvRow
            icon="cube-outline"
            label="Estimated Delivery Date"
            labelWidth={170}
            value={formatDateTime(booking.estimatedDeliveryAt) || 'Not yet set'}
            multiline
          />
          <KvRow
            icon="checkmark-circle-outline"
            label="Customer Repair Approval"
            labelWidth={170}
            value={approvalLabel(booking.customerApproval) || 'Pending'}
          />
        </View>

        {/* Price Summary */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="cash-outline" size={16} color="#004C40" />
            <Text style={styles.sectionTitle}>Price Summary</Text>
          </View>
          {services.length === 0 ? (
            <Text style={styles.muted}>No services recorded yet.</Text>
          ) : (
            <>
              {services.map((s, i) => (
                <View key={s.id || i} style={styles.serviceRow}>
                  <View style={styles.serviceIndex}>
                    <Text style={styles.serviceIndexText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.serviceName} numberOfLines={1}>
                    {s.serviceName || s.name || 'Service'}
                  </Text>
                  <Text style={styles.servicePrice}>
                    {formatINR(s.price ?? s.estimatedPrice)}
                  </Text>
                </View>
              ))}
              <View style={styles.totalDivider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Estimated Repair Amount</Text>
                <Text style={styles.totalValue}>{formatINR(estimateTotal)}</Text>
              </View>
            </>
          )}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Quick Actions — pickup-side flavour of the owner grid. The full
            edit wizard is still reached from the bottom green CTA below. */}
        <Text style={styles.quickActionsHeader}>QUICK ACTIONS</Text>
        <View style={styles.actionsGrid}>
          <ActionTile
            icon="create-outline"
            iconBg="#DBEAFE"
            iconColor="#1E3A8A"
            label="Edit Repair Estimate"
            onPress={goEditEstimate}
          />
          <ActionTile
            icon="time-outline"
            iconBg="#E0E7FF"
            iconColor="#00008B"
            label="View History"
            onPress={goPickupHistory}
          />
        </View>
      </ScrollView>

      {/* Bottom CTA — drops the pickup person into the multi-step edit wizard
          starting at PickupSelectBrand. Each step reads the booking from
          navigation params, so a single navigate seeds the entire flow. */}
      <View style={styles.bottomBar}>
        <TouchableOpacity onPress={goEditEstimate} style={styles.editBtn} activeOpacity={0.9}>
          <Ionicons name="create-outline" size={18} color="#FFFFFF" />
          <Text style={styles.editBtnText}>Edit Estimate</Text>
          <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function KvRow({ icon, label, value, multiline, labelWidth }) {
  return (
    <View style={styles.kvRow}>
      <View style={styles.kvIconWrap}>
        <Ionicons name={icon} size={13} color="#6B7280" />
      </View>
      <Text style={[styles.kvLabel, labelWidth ? { width: labelWidth } : null]}>{label}</Text>
      <Text style={styles.kvValue} numberOfLines={multiline ? 3 : 1}>{value}</Text>
    </View>
  );
}

function ActionTile({ icon, iconBg, iconColor, label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.actionTile} activeOpacity={0.85}>
      <View style={[styles.actionTileIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.actionTileLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 12, paddingBottom: 100 },

  // Cards
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 10 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: rf(14), fontWeight: '800', color: '#111827' },

  // Hero card
  heroCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10,
    position: 'relative',
  },
  heroImage: {
    width: 64, height: 80, borderRadius: 12, backgroundColor: '#F1F5F9', marginRight: 12,
  },
  heroImagePlaceholder: {
    width: 64, height: 80, borderRadius: 12, backgroundColor: 'rgba(0,0,139,0.1)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  heroLabel: { fontSize: rf(11), color: '#6B7280' },
  heroTracking: { fontSize: rf(16), fontWeight: '800', color: '#111827', marginTop: 1 },
  heroDevice: { fontSize: rf(13), fontWeight: '800', color: '#111827', marginTop: 6 },
  heroSpec: { fontSize: rf(11), color: '#6B7280', marginTop: 2 },
  heroColor: { fontSize: rf(12), color: '#9CA3AF', marginTop: 2 },

  statusPill: {
    position: 'absolute', top: 12, right: 12,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    maxWidth: 100, alignItems: 'center', justifyContent: 'center',
  },
  statusPillText: { fontSize: rf(11), fontWeight: '800' },

  // Key/value rows
  kvRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 },
  kvIconWrap: { width: 18, alignItems: 'center', marginRight: 6, marginTop: 2 },
  kvLabel: { width: 100, fontSize: rf(12), color: '#6B7280', fontWeight: '600' },
  kvValue: { flex: 1, fontSize: rf(13), color: '#111827', fontWeight: '700' },

  muted: { fontSize: rf(12), color: '#6B7280' },

  // Price summary
  serviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  serviceIndex: {
    width: 22, height: 22, borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  serviceIndexText: { fontSize: rf(10), color: '#111827', fontWeight: '800' },
  serviceName: { flex: 1, fontSize: rf(13), color: '#111827' },
  servicePrice: { fontSize: rf(13), fontWeight: '800', color: '#111827' },
  totalDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginTop: 10, marginBottom: 8 },
  totalRow: { flexDirection: 'row', alignItems: 'center' },
  totalLabel: { flex: 1, fontSize: rf(13), fontWeight: '800', color: '#111827' },
  totalValue: { fontSize: rf(14), fontWeight: '800', color: '#111827' },

  errorText: { color: '#DC2626', fontSize: rf(11), marginVertical: 6, textAlign: 'center' },

  // Quick actions grid
  quickActionsHeader: {
    fontSize: rf(11), fontWeight: '800', color: '#6B7280',
    letterSpacing: 1.3, marginTop: 6, marginBottom: 8, paddingHorizontal: 2,
  },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionTile: {
    flexGrow: 1, flexBasis: '30%', backgroundColor: '#FFFFFF',
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  actionTileIcon: {
    width: 40, height: 40, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  actionTileLabel: { fontSize: rf(12), fontWeight: '800', color: '#111827' },

  // Bottom CTA
  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 18,
    backgroundColor: '#F8FAFC',
  },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#004C40', borderRadius: 999, paddingVertical: 14,
    gap: 8,
  },
  editBtnText: { color: '#FFFFFF', fontSize: rf(15), fontWeight: '800' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: rf(13), color: '#6B7280' },
});
