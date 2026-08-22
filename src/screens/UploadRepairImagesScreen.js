import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { notify } from '../components/confirm';
import { rf, rlh } from '../utils/responsive';

// Three device photo slots — same keys the backend uses on the repair estimate
// record, so the next screen can persist them via submitPickupRepairEstimate.
const SLOT_DEFS = [
  { key: 'frontImageUrl', label: 'Front Side', file: 'front.jpg' },
  { key: 'backImageUrl', label: 'Back Side', file: 'back.jpg' },
  { key: 'videoUrl', label: 'Coverage Photo', file: 'coverage.jpg' },
];

function trackingId(booking) {
  return booking?.bookingNumber
    || `#${String(booking?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

export default function UploadRepairImagesScreen({ route, navigation }) {
  const booking = route?.params?.booking || null;
  const bookingId = route?.params?.bookingId || booking?.id;
  const [slots, setSlots] = useState(() => SLOT_DEFS.map((def) => ({
    ...def,
    uri: booking?.[def.key] || null,
    remoteUrl: booking?.[def.key] || null,
  })));
  const [busy, setBusy] = useState(false);

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

  const onContinue = () => {
    if (!slots.some((slot) => slot.uri || slot.remoteUrl)) {
      notify('Device image required', 'Upload at least one device image to continue.');
      return;
    }
    setBusy(true);
    // Photos picked here are forwarded as prefill to the estimate screen, which
    // already owns the upload + submit logic. Avoids uploading twice.
    const prefillImages = slots
      .filter((slot) => slot.uri || slot.remoteUrl)
      .map(({ key, uri, remoteUrl, name, type, file }) => ({ key, uri, remoteUrl, name, type, file }));
    navigation.replace('PickupRepairEstimate', { bookingId, booking, prefillImages });
  };

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <Ionicons name="image-outline" size={18} color="#00008B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{trackingId(booking)}</Text>
            <Text style={styles.headerSub}>Upload device photos</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Photo's</Text>
          <Text style={styles.sectionHint}>
            Capture the device condition before pickup. These photos travel with the repair estimate.
          </Text>
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
                      <Ionicons name="camera-outline" size={22} color="#64748B" />
                      <Text style={styles.emptySlotText}>Upload</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        <Pressable
          style={[styles.continueBtn, busy && { opacity: 0.65 }]}
          onPress={onContinue}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.continueText}>Continue</Text>
              <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
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
  sectionTitle: { fontSize: rf(13), fontWeight: '800', color: '#111827', marginBottom: 6 },
  sectionHint: { fontSize: rf(11), color: '#64748B', marginBottom: 12, lineHeight: rlh(16) },
  imageRow: { flexDirection: 'row', marginHorizontal: -4 },
  imageCol: { flex: 1, paddingHorizontal: 4 },
  slotLabel: { fontSize: rf(10), color: '#64748B', fontWeight: '700', marginBottom: 5, textAlign: 'center' },
  imageSlot: {
    height: 110,
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
  continueBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#00008B',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  continueText: { color: '#FFFFFF', fontSize: rf(14), fontWeight: '800' },
});
