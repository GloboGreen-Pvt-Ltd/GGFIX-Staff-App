import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { getPickupRepairEstimate, submitPickupRepairEstimate } from '../api/pickups';
import { uploadMedia } from '../api/media';
import { notify } from '../components/confirm';
import { rf } from '../utils/responsive';

// `key` is the estimate payload field; `slot` is the short name the media
// endpoint uses as the S3 filename stem (Devicefiles/front-3f9c11ab.jpg), which
// is why the two differ — 'frontimageurl' would be a poor filename.
const SLOT_DEFS = [
  { key: 'frontImageUrl', slot: 'front', label: 'Front Side', file: 'front.jpg' },
  { key: 'backImageUrl', slot: 'back', label: 'Back Side', file: 'back.jpg' },
  { key: 'videoUrl', slot: 'coverage', label: 'Coverage Photo', file: 'coverage.jpg' },
];

function trackingId(booking, estimate) {
  return estimate?.bookingNumber
    || booking?.bookingNumber
    || `#${String(booking?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

function statusLabel(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'PICKUP_ON_THE_WAY') return 'Pickup On The Way';
  if (s === 'REPAIR_ESTIMATE_PROCESSING') return 'Repair Estimate Processing';
  if (s === 'DEVICE_PICKED_UP' || s === 'PICKED_UP') return 'Device Picked Up';
  if (s === 'REACHED_SHOP') return 'Reached Shop';
  return s ? s.replace(/_/g, ' ') : 'Assigned Pickup';
}

export default function PickupRepairEstimateScreen({ route, navigation }) {
  const booking = route?.params?.booking || null;
  const bookingId = route?.params?.bookingId || booking?.id;
  // prefillImages comes from UploadRepairImagesScreen — when present, hide the
  // photo section here so the user isn't asked to upload twice.
  const prefillImages = route?.params?.prefillImages || null;
  const hasPrefill = Array.isArray(prefillImages) && prefillImages.length > 0;
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState(booking?.issueSummary || '');
  // Service Schedule alert (ETA + delivery) — pickup person enters at the
  // customer's location while collecting the device. Once submitted, the
  // shop owner's Booking Details screen reads these instead of showing
  // "Not yet set" + the "Complete Device Details" prompt.
  const [etaHours, setEtaHours] = useState('48');
  const [deliveryHours, setDeliveryHours] = useState('72');
  // Device condition fields the shop owner used to have to add manually via
  // "Complete Device Details". Now captured at pickup time so the booking
  // detail screens have a full snapshot the moment the device hits the shop.
  const [devicePin, setDevicePin] = useState('');
  const [missingParts, setMissingParts] = useState('');
  const [customerApproved, setCustomerApproved] = useState(false);
  const [slots, setSlots] = useState(() => SLOT_DEFS.map((def) => {
    const prefill = hasPrefill ? prefillImages.find((p) => p.key === def.key) : null;
    if (prefill) {
      return {
        ...def,
        uri: prefill.uri || prefill.remoteUrl || null,
        remoteUrl: prefill.remoteUrl || null,
        name: prefill.name,
        type: prefill.type,
      };
    }
    return {
      ...def,
      uri: booking?.[def.key] || null,
      remoteUrl: booking?.[def.key] || null,
    };
  }));

  const load = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    try {
      const data = await getPickupRepairEstimate(bookingId);
      setEstimate(data);
      setAmount(data?.estimateAmount != null ? String(data.estimateAmount) : (booking?.estimateAmount ? String(booking.estimateAmount) : ''));
      setNote(data?.issueSummary || booking?.issueSummary || '');
      // Re-hydrate the schedule + condition fields if the pickup person
      // already submitted them once (estimate endpoint is idempotent — they
      // may be coming back to edit). Hours-from-now is derived from the
      // saved ISO timestamps so the spinner is still relative-to-now.
      if (data?.estimatedReadyAt) {
        const hrs = Math.max(1, Math.round((new Date(data.estimatedReadyAt).getTime() - Date.now()) / 3600000));
        setEtaHours(String(hrs));
      }
      if (data?.estimatedDeliveryAt) {
        const hrs = Math.max(1, Math.round((new Date(data.estimatedDeliveryAt).getTime() - Date.now()) / 3600000));
        setDeliveryHours(String(hrs));
      }
      if (data?.devicePin || data?.deviceSecurityValue) setDevicePin(data.devicePin || data.deviceSecurityValue || '');
      if (data?.missingDamageParts) setMissingParts(String(data.missingDamageParts));
      if (data?.customerApproval === 'DONE' || data?.customerApproval === true) setCustomerApproved(true);
      setSlots(SLOT_DEFS.map((def) => {
        // Prefer locally-picked prefill over backend URLs — the upload step
        // happens before the estimate is persisted, so backend won't have it.
        const prefill = hasPrefill ? prefillImages.find((p) => p.key === def.key) : null;
        if (prefill && (prefill.uri || prefill.remoteUrl)) {
          return {
            ...def,
            uri: prefill.uri || prefill.remoteUrl,
            remoteUrl: prefill.remoteUrl || null,
            name: prefill.name,
            type: prefill.type,
          };
        }
        const url = data?.[def.key] || booking?.[def.key] || null;
        return { ...def, uri: url, remoteUrl: url };
      }));
    } catch (e) {
      notify('Could not load estimate', e?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [booking, bookingId, hasPrefill, prefillImages]);

  useEffect(() => { load(); }, [load]);

  const pickSlot = async (index) => {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify('Permission required', 'Allow photo access to upload device images.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.75,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setSlots((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        uri: asset.uri,
        remoteUrl: null,
        name: asset.fileName,
        type: asset.mimeType || 'image/jpeg',
      };
      return next;
    });
  };

  const removeSlot = (index) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], uri: null, remoteUrl: null, name: null, type: null };
      return next;
    });
  };

  const submit = async () => {
    const cleanedAmount = String(amount || '').replace(/[^0-9.]/g, '');
    if (!cleanedAmount || Number(cleanedAmount) <= 0) {
      notify('Estimate required', 'Enter the estimated repair value.');
      return;
    }
    if (!slots.some((slot) => slot.uri || slot.remoteUrl)) {
      notify('Device image required', 'Upload at least one device image.');
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = {};
      for (const slot of slots) {
        if (!slot.uri && !slot.remoteUrl) continue;
        if (slot.remoteUrl) {
          uploaded[slot.key] = slot.remoteUrl;
          continue;
        }
        const res = await uploadMedia({
          uri: slot.uri,
          name: slot.name || slot.file,
          type: slot.type || 'image/jpeg',
          folder: `pickup-estimates/${bookingId}`,
          slot: slot.slot,
        });
        const url = res?.url || res?.secure_url;
        if (!url) throw new Error('Upload returned no URL');
        uploaded[slot.key] = url;
      }
      // Convert hours-from-now into ISO timestamps the backend expects.
      // A blank or non-numeric value drops the field entirely so the
      // backend's COALESCE keeps whatever was already on the booking.
      const etaIso = etaHours && !Number.isNaN(Number(etaHours))
        ? new Date(Date.now() + Number(etaHours) * 3600000).toISOString()
        : undefined;
      const deliveryIso = deliveryHours && !Number.isNaN(Number(deliveryHours))
        ? new Date(Date.now() + Number(deliveryHours) * 3600000).toISOString()
        : undefined;
      await submitPickupRepairEstimate(bookingId, {
        estimatedRepairValue: cleanedAmount,
        issueSummary: note,
        estimatedReadyAt: etaIso,
        estimatedDeliveryAt: deliveryIso,
        devicePin: devicePin || undefined,
        missingDamageParts: missingParts || undefined,
        customerApproval: customerApproved ? 'DONE' : 'PENDING',
        ...uploaded,
      });
      notify('Estimate submitted', 'Repair estimate saved for this booking.');
      navigation.goBack();
    } catch (e) {
      notify('Submit failed', e?.message || 'Could not save repair estimate.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#00008B" />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <Ionicons name="receipt-outline" size={18} color="#00008B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{trackingId(booking, estimate)}</Text>
            <Text style={styles.headerSub}>{statusLabel(estimate?.status || booking?.status)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Images</Text>
          <View style={styles.imageRow}>
            {slots.map((slot, index) => (
              <View key={slot.key} style={styles.imageCol}>
                <Text style={styles.slotLabel}>{slot.label}</Text>
                <Pressable style={styles.imageSlot} onPress={() => pickSlot(index)}>
                  {slot.uri ? (
                    <>
                      <Image source={{ uri: slot.uri }} style={styles.preview} resizeMode="cover" />
                      <Pressable style={styles.removeBtn} onPress={() => removeSlot(index)} hitSlop={8}>
                        <Ionicons name="close" size={13} color="#FFFFFF" />
                      </Pressable>
                    </>
                  ) : (
                    <View style={styles.emptySlot}>
                      <Ionicons name="camera-outline" size={20} color="#64748B" />
                      <Text style={styles.emptySlotText}>Upload</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estimated Repair Value</Text>
          <View style={styles.amountBox}>
            <Text style={styles.amountPrefix}>Rs.</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94A3B8"
              style={styles.amountInput}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Complaint Notes</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Enter issue details"
            placeholderTextColor="#94A3B8"
            style={styles.noteInput}
          />
        </View>

        {/* Service Schedule Alert — pickup person commits the ETA and
            delivery window so the shop owner doesn't have to fill them in
            on the "Complete Device Details" screen after receiving the
            device. Hours-from-now keeps the input one-tap-friendly
            without needing a native date picker dependency. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Schedule Alert</Text>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.rowLabel}>Approx. Ready</Text>
              <View style={styles.hoursBox}>
                <TextInput
                  value={etaHours}
                  onChangeText={setEtaHours}
                  keyboardType="number-pad"
                  placeholder="48"
                  placeholderTextColor="#94A3B8"
                  style={styles.hoursInput}
                />
                <Text style={styles.hoursSuffix}>hrs</Text>
              </View>
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.rowLabel}>Delivery</Text>
              <View style={styles.hoursBox}>
                <TextInput
                  value={deliveryHours}
                  onChangeText={setDeliveryHours}
                  keyboardType="number-pad"
                  placeholder="72"
                  placeholderTextColor="#94A3B8"
                  style={styles.hoursInput}
                />
                <Text style={styles.hoursSuffix}>hrs</Text>
              </View>
            </View>
          </View>
          <Text style={styles.hint}>From now. Leave blank to keep current.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Security</Text>
          <TextInput
            value={devicePin}
            onChangeText={setDevicePin}
            placeholder="PIN / Pattern (optional)"
            placeholderTextColor="#94A3B8"
            style={styles.lineInput}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Missing / Damage Parts</Text>
          <TextInput
            value={missingParts}
            onChangeText={setMissingParts}
            multiline
            placeholder="Comma-separated. Leave blank if none."
            placeholderTextColor="#94A3B8"
            style={styles.noteInput}
          />
        </View>

        <View style={styles.section}>
          <Pressable
            onPress={() => setCustomerApproved((v) => !v)}
            style={styles.approvalRow}
            hitSlop={6}
          >
            <View style={[styles.checkbox, customerApproved && styles.checkboxOn]}>
              {customerApproved ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.approvalTitle}>Customer Repair Approval</Text>
              <Text style={styles.approvalHint}>
                {customerApproved ? 'Customer has approved the repair estimate.' : 'Tap once the customer confirms verbally.'}
              </Text>
            </View>
          </Pressable>
        </View>

        <Pressable
          style={[styles.submitBtn, submitting && { opacity: 0.65 }]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={17} color="#FFFFFF" />
              <Text style={styles.submitText}>Submit Estimate</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  content: { padding: 14, paddingBottom: 36 },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: { fontSize: rf(15), fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: rf(11), color: '#64748B', marginTop: 2, fontWeight: '600' },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: { fontSize: rf(13), fontWeight: '800', color: '#111827', marginBottom: 10 },
  imageRow: { flexDirection: 'row', marginHorizontal: -4 },
  imageCol: { flex: 1, paddingHorizontal: 4 },
  slotLabel: { fontSize: rf(10), color: '#64748B', fontWeight: '700', marginBottom: 5, textAlign: 'center' },
  imageSlot: {
    height: 96,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
  },
  preview: { width: '100%', height: '100%' },
  emptySlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptySlotText: { fontSize: rf(10), color: '#64748B', marginTop: 4, fontWeight: '700' },
  removeBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
  },
  amountPrefix: { fontSize: rf(14), fontWeight: '800', color: '#111827', marginRight: 8 },
  amountInput: { flex: 1, height: 44, fontSize: rf(15), fontWeight: '700', color: '#111827' },
  noteInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    textAlignVertical: 'top',
    color: '#111827',
    backgroundColor: '#F8FAFC',
    fontSize: rf(13),
  },
  submitBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#004C40',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  submitText: { color: '#FFFFFF', fontSize: rf(14), fontWeight: '800' },
  row: { flexDirection: 'row', marginHorizontal: -4 },
  rowItem: { flex: 1, paddingHorizontal: 4 },
  rowLabel: { fontSize: rf(11), color: '#64748B', fontWeight: '700', marginBottom: 6 },
  hoursBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
  },
  hoursInput: { flex: 1, height: 40, fontSize: rf(14), fontWeight: '700', color: '#111827' },
  hoursSuffix: { fontSize: rf(11), color: '#64748B', fontWeight: '700', marginLeft: 4 },
  hint: { fontSize: rf(10), color: '#94A3B8', marginTop: 6, fontStyle: 'italic' },
  lineInput: {
    height: 42,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#111827',
    backgroundColor: '#F8FAFC',
    fontSize: rf(13),
  },
  approvalRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: '#004C40', borderColor: '#004C40' },
  approvalTitle: { fontSize: rf(13), fontWeight: '800', color: '#111827' },
  approvalHint: { fontSize: rf(11), color: '#64748B', marginTop: 2 },
});
