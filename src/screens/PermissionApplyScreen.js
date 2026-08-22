import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { applyEmployeeLeave } from '../api/technician';
import { uploadMedia } from '../api/media';
import { notify } from '../components/confirm';
import TimePickerField, { to12h } from '../components/TimePickerField';
import DatePickerField from '../components/DatePickerField';
import { rf } from '../utils/responsive';

// Design tokens — kept in sync with TechnicianApplyLeaveScreen so the two
// request screens read as one system.
const NAVY = '#00008B';
const NAVY_SOFT = '#EEF0FF';
const BG = '#F5F7FB';
const CARD = '#FFFFFF';
const BORDER = '#E6EAF1';
const TEXT = '#0F172A';
const LABEL = '#334155';
const MUTED = '#64748B';
const SUBTLE = '#94A3B8';

// A Permission is stored as a same-day leave with leaveType='PERMISSION' (the
// backend early-checkout guard unlocks on an APPROVED PERMISSION covering the
// day). The sub-type + optional time window are captured in the reason text so
// no new backend column / migration is needed. Owner sees it in the same
// pending-leaves list they already approve from. Each type carries an icon +
// accent colour for the selectable cards.
const PERMISSION_TYPES = [
  { value: 'PERSONAL',    label: 'Personal',                 icon: 'person-outline',    color: '#2563EB', soft: '#EFF6FF' },
  { value: 'MEDICAL',     label: 'Medical',                  icon: 'medkit-outline',    color: '#E11D48', soft: '#FFF1F2' },
  { value: 'OFFICIAL',    label: 'Official',                 icon: 'briefcase-outline', color: '#0D9488', soft: '#F0FDFA' },
  { value: 'SHORT_LEAVE', label: 'Short Leave / Early Going', icon: 'walk-outline',      color: '#7C3AED', soft: '#F5F3FF' },
];

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISO(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const d = new Date(y, mo - 1, day);
  // Reject silently rolled-over dates (e.g. 2026-02-30 → Mar 2, 2026-13-40 → 2027).
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) return null;
  return Number.isNaN(d.getTime()) ? null : d;
}

function SectionLabel({ text, hint }) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionAccent} />
      <Text style={styles.sectionLabel}>{text}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

function Field({ label, hint, children }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default function PermissionApplyScreen({ navigation }) {
  const today = toISO(new Date());
  const [permType, setPermType] = useState('PERSONAL');
  const [date, setDate] = useState(today);
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState(null); // { uri, url, name }
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickAttachment = async () => {
    if (uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify('Permission required', 'Allow photo access to attach a proof image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const res = await uploadMedia({
        uri: asset.uri,
        name: asset.fileName || 'permission-proof.jpg',
        type: asset.mimeType || 'image/jpeg',
        folder: 'permission-proofs',
      });
      setAttachment({ uri: asset.uri, url: res?.url, name: asset.fileName || 'Proof.jpg' });
    } catch (e) {
      notify('Upload failed', e?.message ?? 'Could not upload attachment', { preset: 'error', haptic: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const validate = () => {
    if (!permType) return 'Please select a permission type';
    if (!parseISO(date)) return 'Date is required (YYYY-MM-DD)';
    if ((fromTime && !toTime) || (!fromTime && toTime)) {
      return 'Select both from and to time, or leave both blank';
    }
    // "HH:MM" 24h strings compare correctly lexicographically.
    if (fromTime && toTime && toTime <= fromTime) {
      return 'End time must be after start time';
    }
    if (!reason.trim()) return 'Reason is required';
    return null;
  };

  const composedReason = () => {
    const label = PERMISSION_TYPES.find((t) => t.value === permType)?.label || 'Permission';
    const win = fromTime && toTime ? ` (${to12h(fromTime)} – ${to12h(toTime)})` : '';
    return `${label} permission${win}: ${reason.trim()}`;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { notify('Check the form', err); return; }
    setSaving(true);
    try {
      await applyEmployeeLeave({
        leaveType: 'PERMISSION',
        startDate: date,
        endDate: date,
        totalDays: 0, // a short permission isn't a full leave day
        reason: composedReason(),
        attachmentUrl: attachment?.url || null,
      });
      notify('Permission request submitted', 'Sent to the owner for approval. You can check out early once it is approved.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Could not submit', e?.message ?? 'Failed to submit permission request', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="time-outline" size={rf(22)} color={NAVY} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Apply for Permission</Text>
            <Text style={styles.subtitle}>
              Short, same-day permission (e.g. early going). Once approved, you can check out before your duty end time.
            </Text>
          </View>
        </View>

        {/* Permission type */}
        <SectionLabel text="Permission Type" />
        <View style={styles.typeGrid}>
          {PERMISSION_TYPES.map((t) => {
            const active = permType === t.value;
            return (
              <Pressable
                key={t.value}
                onPress={() => setPermType(t.value)}
                style={[styles.typeChip, active && { borderColor: t.color, backgroundColor: t.soft }]}
                android_ripple={{ color: t.soft }}
              >
                <View style={[styles.typeIcon, { backgroundColor: active ? t.color : t.soft }]}>
                  <Ionicons name={t.icon} size={rf(16)} color={active ? '#FFFFFF' : t.color} />
                </View>
                <Text style={[styles.typeLabel, active && { color: t.color }]} numberOfLines={2}>{t.label}</Text>
                {active ? (
                  <Ionicons name="checkmark-circle" size={rf(16)} color={t.color} style={{ marginLeft: 'auto' }} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* When */}
        <SectionLabel text="When" />
        <View style={styles.card}>
          <Field label="Date">
            <DatePickerField value={date} onChange={setDate} />
          </Field>

          <Field label="Time window" hint="Optional">
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <TimePickerField value={fromTime} placeholder="From time" onChange={setFromTime} />
              </View>
              <Text style={styles.timeSep}>to</Text>
              <View style={{ flex: 1 }}>
                <TimePickerField value={toTime} placeholder="To time" onChange={setToTime} />
              </View>
            </View>
          </Field>
        </View>

        {/* Reason */}
        <SectionLabel text="Reason" />
        <View style={styles.card}>
          <TextInput
            style={styles.textArea}
            value={reason}
            onChangeText={setReason}
            placeholder="Tell us why you need this permission…"
            placeholderTextColor={SUBTLE}
            multiline
          />
        </View>

        {/* Attachment */}
        <SectionLabel text="Attachment" hint="Optional" />
        <TouchableOpacity
          style={[styles.upload, attachment && styles.uploadDone]}
          onPress={pickAttachment}
          activeOpacity={0.85}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color={NAVY} size="small" />
          ) : (
            <>
              <View style={[styles.uploadIcon, attachment && { backgroundColor: '#DCFCE7' }]}>
                <Ionicons
                  name={attachment ? 'checkmark-circle' : 'cloud-upload-outline'}
                  size={rf(18)}
                  color={attachment ? '#004C40' : NAVY}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.uploadTitle} numberOfLines={1}>
                  {attachment ? attachment.name : 'Upload supporting proof'}
                </Text>
                <Text style={styles.uploadHint}>{attachment ? 'Tap to replace' : 'PNG or JPG, up to a few MB'}</Text>
              </View>
              {!attachment ? <Ionicons name="chevron-forward" size={rf(16)} color={SUBTLE} /> : null}
            </>
          )}
        </TouchableOpacity>

        {/* Footer actions */}
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => navigation.goBack()}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitBtn, (saving || uploading) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={saving || uploading}
            activeOpacity={0.9}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={rf(16)} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>Submit Request</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 40 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  headerIcon: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: NAVY_SOFT,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: rf(20), fontWeight: '800', color: TEXT, letterSpacing: 0.2 },
  subtitle: { fontSize: rf(12), color: MUTED, marginTop: 2, lineHeight: rf(17) },

  // Section header
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10 },
  sectionAccent: { width: 3, height: 15, borderRadius: 2, backgroundColor: NAVY, marginRight: 8 },
  sectionLabel: { fontSize: rf(14), fontWeight: '800', color: TEXT, letterSpacing: 0.2 },
  sectionHint: {
    marginLeft: 8, fontSize: rf(10), fontWeight: '700', color: MUTED,
    backgroundColor: '#EEF2F7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden',
  },

  // Type cards
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  typeChip: {
    width: '48%', minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER, borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  typeIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontSize: rf(12.5), fontWeight: '700', color: LABEL, flexShrink: 1, lineHeight: rf(16) },

  // Cards
  card: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },

  // Fields
  field: { marginBottom: 12 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  fieldLabel: { fontSize: rf(12), fontWeight: '700', color: LABEL },
  fieldHint: { fontSize: rf(11), fontWeight: '600', color: SUBTLE },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeSep: { fontSize: rf(12), color: MUTED, fontWeight: '600' },

  // Reason
  textArea: {
    minHeight: 110, textAlignVertical: 'top', fontSize: rf(13), color: TEXT,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12,
  },

  // Attachment
  upload: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14,
  },
  uploadDone: { borderStyle: 'solid', borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  uploadIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: NAVY_SOFT, alignItems: 'center', justifyContent: 'center' },
  uploadTitle: { fontSize: rf(13), fontWeight: '700', color: TEXT },
  uploadHint: { fontSize: rf(11), color: SUBTLE, marginTop: 1 },

  // Footer
  footerRow: { flexDirection: 'row', gap: 12, marginTop: 26 },
  cancelBtn: {
    flex: 1, paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
  },
  cancelBtnText: { color: LABEL, fontSize: rf(14), fontWeight: '800' },
  submitBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 14, backgroundColor: NAVY,
    shadowColor: NAVY, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#FFFFFF', fontSize: rf(14), fontWeight: '800', letterSpacing: 0.3 },
});
