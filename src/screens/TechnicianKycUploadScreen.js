import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CommonActions } from '@react-navigation/native';
import { uploadMedia } from '../api/media';
import { saveMyKycDocuments } from '../api/technicianKyc';
import { notify } from '../components/confirm';
import { rf } from '../utils/responsive';
import { useSecureScreen } from '../utils/secureScreen';

const DOCS = [
  { key: 'aadharFront', title: 'Aadhar Card Front', required: true, group: 'identity' },
  { key: 'aadharBack',  title: 'Aadhar Card Back',  required: true, group: 'identity' },
  { key: 'pan',         title: 'PAN Card',          required: true, group: 'tax' },
];

const STEPS = [
  { key: 'identity', label: 'Identity' },
  { key: 'tax',      label: 'Tax' },
];

export default function TechnicianKycUploadScreen({ navigation, route }) {
  // When entered from KYC View → Edit, route.params.existing is a map of
  // docType → existing server doc. Pre-populate `files` with placeholder
  // entries so the previews show, and skip re-uploading those URLs on submit.
  useSecureScreen(); // block screenshots of Aadhaar/PAN
  const existing = route?.params?.existing || {};
  const initialFiles = Object.fromEntries(
    Object.entries(existing).map(([key, doc]) => [
      key,
      { uri: doc.url, __fromServer: true, __serverUrl: doc.url },
    ])
  );
  const [files, setFiles] = useState(initialFiles);
  const [submitting, setSubmitting] = useState(false);

  const pickImage = async (key, fromCamera = false) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify('Permission needed', `Please allow ${fromCamera ? 'camera' : 'photo library'} access to upload.`);
        return;
      }
      const opts = { quality: 0.8, mediaTypes: ['images'] };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setFiles((prev) => ({ ...prev, [key]: result.assets[0] }));
    } catch (e) {
      notify('Could not pick image', e?.message || 'Please try again.', { preset: 'error' });
    }
  };

  const promptUpload = (key) => {
    if (Platform.OS === 'web') {
      pickImage(key, false);
      return;
    }
    Alert.alert('Add document', '', [
      { text: 'Take Photo', onPress: () => pickImage(key, true) },
      { text: 'Choose from Library', onPress: () => pickImage(key, false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const remove = (key) =>
    setFiles((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const identityDone = !!files.aadharFront && !!files.aadharBack;
  const taxDone = !!files.pan;
  const allRequiredDone = identityDone && taxDone;
  const submitReady = allRequiredDone;
  const stepState = { identity: identityDone, tax: taxDone };

  const onProceed = async () => {
    if (!allRequiredDone) {
      const missing = [];
      if (!files.aadharFront) missing.push('Aadhar Card Front');
      if (!files.aadharBack)  missing.push('Aadhar Card Back');
      if (!files.pan)         missing.push('PAN Card');
      notify('Required documents missing', `Please upload: ${missing.join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      const payload = [];
      const failedTitles = [];
      for (const doc of DOCS) {
        const asset = files[doc.key];
        if (!asset?.uri) continue;
        if (asset.__fromServer && asset.__serverUrl) {
          payload.push({
            docType: doc.key,
            title: doc.title,
            url: asset.__serverUrl,
            required: doc.required,
          });
          continue;
        }
        let url = null;
        try {
          const filename =
            asset.fileName || asset.uri.split('/').pop() || `${doc.key}.jpg`;
          const mime =
            asset.mimeType ||
            (filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
          const res = await uploadMedia({
            uri: asset.uri,
            name: filename,
            type: mime,
            folder: 'technician-kyc',
          });
          const hostedUrl = res?.url || res?.secure_url;
          if (hostedUrl) url = hostedUrl;
          else failedTitles.push(doc.title);
        } catch (uploadErr) {
          // eslint-disable-next-line no-console
          console.warn(`KYC upload failed for ${doc.title}:`, uploadErr?.message);
          failedTitles.push(doc.title);
        }
        // Only persist a real hosted URL. A device-local file:// path is
        // meaningless to the backend/admin and there is no retry queue, so a
        // failed upload must block the submit rather than masquerade as success.
        if (url) {
          payload.push({ docType: doc.key, title: doc.title, url, required: doc.required });
        }
      }

      if (failedTitles.length > 0) {
        notify(
          'Upload failed',
          `Could not upload: ${failedTitles.join(', ')}. Please check your connection and try again.`,
          { preset: 'error', haptic: 'error' }
        );
        return;
      }

      await saveMyKycDocuments(payload);

      notify(
        'Submitted',
        'KYC documents submitted successfully. Admin will review them shortly.',
        { preset: 'done' }
      );
      // Land on the View screen (with Edit button) so the user sees what they
      // just uploaded; AccountTab sits underneath so back returns there instead
      // of looping into the upload stack.
      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'AccountTab' },
            { name: 'TechnicianKycView', params: { fromSubmit: true } },
          ],
        })
      );
    } catch (e) {
      notify('Submit failed', e?.message || 'Please try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Step progress */}
        <View style={styles.stepperWrap}>
          {STEPS.map((s, idx) => {
            const done = stepState[s.key];
            const isLast = idx === STEPS.length - 1;
            return (
              <React.Fragment key={s.key}>
                <View style={styles.stepCol}>
                  <View style={[styles.stepDot, done ? styles.stepDotDone : styles.stepDotIdle]}>
                    {done ? (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    ) : (
                      <View style={styles.stepDotInner} />
                    )}
                  </View>
                  <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{s.label}</Text>
                </View>
                {!isLast && (
                  <View style={[styles.stepLine, done && styles.stepLineDone]} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* Document grid */}
        <View style={styles.grid}>
          {DOCS.map((doc) => {
            const file = files[doc.key];
            const isUploaded = !!file;
            return (
              <View key={doc.key} style={styles.cardOuter}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderIcon}>
                    <Ionicons name="person-circle-outline" size={16} color="#374151" />
                  </View>
                  <Text style={styles.cardHeaderTitle} numberOfLines={1}>
                    {doc.title}
                  </Text>
                  {doc.required && <Text style={styles.requiredStar}>*</Text>}
                </View>

                <TouchableOpacity
                  style={[styles.dropZone, isUploaded && styles.dropZoneUploaded]}
                  onPress={() => promptUpload(doc.key)}
                  activeOpacity={0.85}
                >
                  {isUploaded ? (
                    <>
                      <Image source={{ uri: file.uri }} style={styles.preview} />
                      <TouchableOpacity
                        onPress={() => remove(doc.key)}
                        style={styles.removeBadge}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="close" size={11} color="#FFFFFF" />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <View style={styles.uploadIconCircle}>
                        <Ionicons name="cloud-upload" size={16} color="#FFFFFF" />
                      </View>
                      <Text style={styles.dropZoneTitle}>
                        Upload your {doc.title.split(' ')[0]}
                      </Text>
                      <Text style={styles.dropZoneSub}>JPEG and PNG formats</Text>
                      <Text style={styles.dropZoneSub}>Maximum file size: 5 MB.</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.actionBtn, submitReady ? styles.actionBtnSubmit : styles.actionBtnProceed]}
          onPress={onProceed}
          activeOpacity={0.9}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.actionBtnText}>UPLOADING…</Text>
            </>
          ) : (
            <>
              <Text style={styles.actionBtnText}>{submitReady ? 'SUBMIT' : 'PROCEED'}</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 32 },

  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  stepCol: { alignItems: 'center', width: 60 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  stepDotIdle: { borderColor: '#00008B', backgroundColor: '#FFFFFF' },
  stepDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
  stepDotDone: { borderColor: '#004C40', backgroundColor: '#004C40' },
  stepLabel: { fontSize: rf(9), color: '#6B7280', fontWeight: '600', marginTop: 3 },
  stepLabelDone: { color: '#004C40' },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#D1D5DB',
    marginTop: -12,
  },
  stepLineDone: { backgroundColor: '#004C40' },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardOuter: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 8,
    marginBottom: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  cardHeaderIcon: { width: 18, alignItems: 'center' },
  cardHeaderTitle: { flex: 1, fontSize: rf(11), fontWeight: '700', color: '#111827' },
  requiredStar: { color: '#DC2626', fontWeight: '800', fontSize: rf(12) },

  dropZone: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9CA3AF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
    position: 'relative',
    overflow: 'hidden',
  },
  dropZoneUploaded: { borderColor: '#004C40', padding: 0, backgroundColor: '#FFFFFF' },

  uploadIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00008B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  dropZoneTitle: { fontSize: rf(10), color: '#374151', fontWeight: '700', textAlign: 'center' },
  dropZoneSub: { fontSize: rf(9), color: '#6B7280', textAlign: 'center', marginTop: 1 },

  preview: { width: '100%', height: 110, resizeMode: 'cover', borderRadius: 6 },
  removeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionBtn: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnProceed: { backgroundColor: '#1E3A8A' },
  actionBtnSubmit: { backgroundColor: '#004C40' },
  actionBtnText: { color: '#FFFFFF', fontSize: rf(14), fontWeight: '800', letterSpacing: 1 },
});
