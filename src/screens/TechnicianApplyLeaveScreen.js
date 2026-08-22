import React, { useMemo, useState } from 'react';
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

// Design tokens for this screen — kept local so the redesign is self-contained.
const NAVY = '#00008B';
const NAVY_SOFT = '#EEF0FF';
const BG = '#F5F7FB';
const CARD = '#FFFFFF';
const BORDER = '#E6EAF1';
const TEXT = '#0F172A';
const LABEL = '#334155';
const MUTED = '#64748B';
const SUBTLE = '#94A3B8';

// Whitelist mirrors ALLOWED_LEAVE_TYPES on the backend. Order is the order shown
// in the chip grid. HALF_DAY auto-locks the range to a single day and stamps
// totalDays=0.5 server-side. PERMISSION lives on its own "Apply Permission"
// screen. Each type carries an icon + accent colour for the selectable cards.
const LEAVE_TYPES = [
  { value: 'CASUAL_LEAVE',    label: 'Casual',    icon: 'cafe-outline',         color: '#2563EB', soft: '#EFF6FF' },
  { value: 'SICK_LEAVE',      label: 'Sick',      icon: 'medkit-outline',       color: '#E11D48', soft: '#FFF1F2' },
  { value: 'EMERGENCY_LEAVE', label: 'Emergency', icon: 'alert-circle-outline', color: '#EA580C', soft: '#FFF7ED' },
  { value: 'HALF_DAY',        label: 'Half Day',  icon: 'contrast-outline',     color: '#7C3AED', soft: '#F5F3FF' },
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

// Inclusive day count, e.g. 2026-06-10 → 2026-06-12 = 3 days.
function daysBetween(startISO, endISO) {
  const a = parseISO(startISO);
  const b = parseISO(endISO);
  if (!a || !b || b < a) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
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

export default function TechnicianApplyLeaveScreen({ navigation }) {
  const today = toISO(new Date());
  const [leaveType, setLeaveType] = useState('CASUAL_LEAVE');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState(''); // optional "HH:MM" window
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState(null); // { uri, url, name }
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isHalfDay = leaveType === 'HALF_DAY';

  const totalDays = useMemo(() => {
    if (isHalfDay) return 0.5;
    return daysBetween(startDate, endDate);
  }, [isHalfDay, startDate, endDate]);

  const pickLeaveType = (next) => {
    setLeaveType(next);
    if (next === 'HALF_DAY') {
      // Half-day always spans a single day. Snap the end back to start so
      // totalDays stays consistent regardless of any earlier selection.
      setEndDate(startDate);
    }
  };

  // Picking a start date should never leave a now-invalid range behind: snap the
  // end up when it falls before the new start (or on any half-day selection).
  const onStartChange = (next) => {
    setStartDate(next);
    if (isHalfDay || endDate < next) setEndDate(next);
  };

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
        name: asset.fileName || 'leave-proof.jpg',
        type: asset.mimeType || 'image/jpeg',
        folder: 'leave-proofs',
      });
      setAttachment({ uri: asset.uri, url: res?.url, name: asset.fileName || 'Proof.jpg' });
    } catch (e) {
      notify('Upload failed', e?.message ?? 'Could not upload attachment', { preset: 'error', haptic: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const validate = () => {
    if (!leaveType) return 'Please select a leave type';
    const s = parseISO(startDate);
    const e = parseISO(endDate);
    if (!s) return 'Start date is required (YYYY-MM-DD)';
    if (!e) return 'End date is required (YYYY-MM-DD)';
    if (e < s) return 'End date cannot be before start date';
    if ((startTime && !endTime) || (!startTime && endTime)) {
      return 'Select both from and to time, or leave both blank';
    }
    // "HH:MM" 24h strings compare correctly lexicographically.
    if (startTime && endTime && endTime <= startTime) {
      return 'End time must be after start time';
    }
    if (!reason.trim()) return 'Reason is required';
    return null;
  };

  // Fold the optional time window into the reason so the owner sees it — the
  // backend leave record has no separate time columns.
  const composedReason = () => {
    const base = reason.trim();
    if (startTime && endTime) return `${base} [Time: ${to12h(startTime)} – ${to12h(endTime)}]`;
    return base;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { notify('Check the form', err); return; }
    setSaving(true);
    try {
      await applyEmployeeLeave({
        leaveType,
        startDate,
        endDate,
        totalDays,
        reason: composedReason(),
        attachmentUrl: attachment?.url || null,
      });
      notify('Leave request submitted', 'Your leave request has been sent to the owner for review.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      notify('Could not submit', e?.message ?? 'Failed to submit leave request', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const durationLabel = totalDays > 0
    ? `${totalDays % 1 === 0 ? totalDays : totalDays.toFixed(1)} day${totalDays === 1 ? '' : 's'}`
    : 'Pick a valid date range';
  const durationValid = totalDays > 0;

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
            <Ionicons name="calendar-clear-outline" size={rf(22)} color={NAVY} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Apply for Leave</Text>
            <Text style={styles.subtitle}>Request time off — your manager will review and approve it.</Text>
          </View>
        </View>

        {/* Leave type */}
        <SectionLabel text="Leave Type" />
        <View style={styles.typeGrid}>
          {LEAVE_TYPES.map((t) => {
            const active = leaveType === t.value;
            return (
              <Pressable
                key={t.value}
                onPress={() => pickLeaveType(t.value)}
                style={[styles.typeChip, active && { borderColor: t.color, backgroundColor: t.soft }]}
                android_ripple={{ color: t.soft }}
              >
                <View style={[styles.typeIcon, { backgroundColor: active ? t.color : t.soft }]}>
                  <Ionicons name={t.icon} size={rf(16)} color={active ? '#FFFFFF' : t.color} />
                </View>
                <Text style={[styles.typeLabel, active && { color: t.color }]} numberOfLines={1}>{t.label}</Text>
                {active ? (
                  <Ionicons name="checkmark-circle" size={rf(16)} color={t.color} style={{ marginLeft: 'auto' }} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* Duration */}
        <SectionLabel text="Duration" />
        <View style={styles.card}>
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Field label="Start date">
                <DatePickerField value={startDate} onChange={onStartChange} />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="End date" hint={isHalfDay ? 'Same day' : undefined}>
                <DatePickerField
                  value={endDate}
                  onChange={setEndDate}
                  minimumDate={startDate}
                  disabled={isHalfDay}
                />
              </Field>
            </View>
          </View>

          <Field label="Time window" hint="Optional">
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <TimePickerField value={startTime} placeholder="From time" onChange={setStartTime} />
              </View>
              <Text style={styles.timeSep}>to</Text>
              <View style={{ flex: 1 }}>
                <TimePickerField value={endTime} placeholder="To time" onChange={setEndTime} />
              </View>
            </View>
          </Field>

          {/* Live duration summary */}
          <View style={[styles.durationPill, !durationValid && styles.durationPillMuted]}>
            <Ionicons
              name={durationValid ? 'checkmark-circle' : 'alert-circle-outline'}
              size={rf(15)}
              color={durationValid ? NAVY : '#B45309'}
            />
            <Text style={[styles.durationText, !durationValid && { color: '#B45309' }]}>
              {durationValid ? `Total: ${durationLabel}` : durationLabel}
            </Text>
          </View>
        </View>

        {/* Reason */}
        <SectionLabel text="Reason" />
        <View style={styles.card}>
          <TextInput
            style={styles.textArea}
            value={reason}
            onChangeText={setReason}
            placeholder="Tell us why you need this leave…"
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
                  {attachment ? attachment.name : 'Upload medical / supporting proof'}
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

  // Leave type cards
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  typeChip: {
    width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  typeIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontSize: rf(13), fontWeight: '700', color: LABEL, flexShrink: 1 },

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

  twoCol: { flexDirection: 'row', gap: 10 },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeSep: { fontSize: rf(12), color: MUTED, fontWeight: '600' },

  durationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: NAVY_SOFT, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginTop: 2,
  },
  durationPillMuted: { backgroundColor: '#FEF3C7' },
  durationText: { fontSize: rf(12), fontWeight: '800', color: NAVY },

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
