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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BriefcaseMedical, CalendarDays, Check, ChevronRight, CircleAlert, CircleCheck,
  CloudUpload, Coffee, Contrast, FileText, Leaf, Send,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { applyEmployeeLeave } from '../api/technician';
import { uploadMedia } from '../api/media';
import { notify } from '../components/confirm';
import TimePickerField, { to12h } from '../components/TimePickerField';
import DatePickerField from '../components/DatePickerField';
import MintScreenHeader, { useHideNativeHeader } from '../components/MintScreenHeader';
import { rf, rlh, rs } from '../utils/responsive';

// Design tokens (GGFIX green + mint) — same system as Apply for Permission.
const C = {
  green: '#09AD2A',
  red: '#F84141',
  yellow: '#F3BF23',
  ink: '#1E1E1E',
  bg: '#F8F8F8',
  surface: '#F3F3F3',
  greenTint: '#E6F7EA',
  greenSoft: '#F3FBF4',
  redTint: '#FEECEC',
  yellowTint: '#FDF6E0',
  // roles
  deep: '#09AD2A',
  primary: '#09AD2A',
  mint: '#E6F7EA',
};
const CARD = '#FFFFFF';
const BORDER = '#E6E6E6';
const TEXT = '#1E1E1E';
const MUTED = '#6E6E6E';
const SUBTLE = '#A3A3A3';
const MAX_CONTENT_WIDTH = 720;

// Presentation only: icon + tile colours per leave type, keyed by value.
// `onStrong` is the icon colour on the solid (selected) tile.
const TYPE_LOOK = {
  CASUAL_LEAVE:    { icon: Coffee,           soft: C.greenTint,  fg: C.green,  strong: C.green,  onStrong: '#FFFFFF' },
  SICK_LEAVE:      { icon: BriefcaseMedical, soft: C.redTint,    fg: C.red,    strong: C.red,    onStrong: '#FFFFFF' },
  EMERGENCY_LEAVE: { icon: CircleAlert,      soft: C.yellowTint, fg: C.yellow, strong: C.yellow, onStrong: C.ink },
  HALF_DAY:        { icon: Contrast,         soft: C.surface,    fg: C.ink,    strong: C.ink,    onStrong: '#FFFFFF' },
};

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

function SectionLabel({ text, hint, inCard }) {
  return (
    <View style={[styles.sectionRow, inCard && styles.sectionRowInCard]}>
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
  useHideNativeHeader(navigation);
  const { width: winW } = useWindowDimensions();
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
      mediaTypes: ['images'],
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

  // Two-column type grid sized from the actual content width (capped on tablets).
  const contentW = Math.min(winW, MAX_CONTENT_WIDTH) - rs(28);
  const typeGap = rs(8);
  const typeW = (contentW - typeGap) / 2;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MintScreenHeader title="Apply for leave" navigation={navigation} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentW }}>
          {/* Info card */}
          <View style={styles.header}>
            <View pointerEvents="none" style={styles.headerLeaves}>
              <Leaf size={rs(46)} color="#CFEFD6" fill="#E6F7EA" strokeWidth={1.2} style={{ transform: [{ rotate: '-20deg' }] }} />
              <Leaf size={rs(34)} color="#CFEFD6" fill="#F3FBF4" strokeWidth={1.2} style={{ marginLeft: -rs(22), marginTop: rs(18), transform: [{ rotate: '25deg' }] }} />
            </View>
            <View style={styles.headerIcon}>
              <CalendarDays size={rs(22)} color={C.green} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Apply for Leave</Text>
              <Text style={styles.subtitle}>Request time off — your manager will review and approve it.</Text>
            </View>
          </View>

          {/* Leave type */}
          <SectionLabel text="Leave Type" />
          <View style={[styles.typeGrid, { gap: typeGap }]}>
            {LEAVE_TYPES.map((t) => {
              const active = leaveType === t.value;
              const look = TYPE_LOOK[t.value] || TYPE_LOOK.CASUAL_LEAVE;
              const Icon = look.icon;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => pickLeaveType(t.value)}
                  style={[styles.typeChip, { width: typeW }, active && styles.typeChipActive]}
                  android_ripple={{ color: C.greenTint }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.typeIcon, { backgroundColor: active ? look.strong : look.soft }]}>
                    <Icon size={rs(17)} color={active ? look.onStrong : look.fg} strokeWidth={2.2} />
                  </View>
                  <Text style={styles.typeLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t.label}</Text>
                  {active ? (
                    <View style={styles.radioOn}>
                      <Check size={rs(13)} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  ) : (
                    <View style={styles.radioOff} />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Duration */}
          <View style={[styles.card, { marginTop: rs(10) }]}>
            <SectionLabel text="Duration" inCard />
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Field label="Start date">
                  <DatePickerField value={startDate} onChange={onStartChange} fieldStyle={styles.pickerField} accent={C.green} accentSoft={C.greenTint} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="End date" hint={isHalfDay ? 'Same day' : undefined}>
                  <DatePickerField
                    value={endDate}
                    onChange={setEndDate}
                    minimumDate={startDate}
                    disabled={isHalfDay}
                    fieldStyle={styles.pickerField}
                    accent={C.green}
                    accentSoft={C.greenTint}
                  />
                </Field>
              </View>
            </View>

            <View style={styles.divider} />

            <Field label="Time window" hint="Optional">
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <TimePickerField value={startTime} placeholder="From time" onChange={setStartTime} fieldStyle={styles.pickerField} accent={C.green} />
                </View>
                <Text style={styles.timeSep}>to</Text>
                <View style={{ flex: 1 }}>
                  <TimePickerField value={endTime} placeholder="To time" onChange={setEndTime} fieldStyle={styles.pickerField} accent={C.green} />
                </View>
              </View>
            </Field>

            {/* Live duration summary */}
            <View style={[styles.durationPill, !durationValid && styles.durationPillMuted]}>
              {durationValid
                ? <CalendarDays size={rs(16)} color={C.green} strokeWidth={2.2} />
                : <CircleAlert size={rs(16)} color={C.red} strokeWidth={2.2} />}
              <Text style={styles.durationText}>
                {durationValid ? `Total: ${durationLabel}` : durationLabel}
              </Text>
            </View>
          </View>

          {/* Reason */}
          <SectionLabel text="Reason" />
          <View style={styles.reasonCard}>
            <View style={styles.textAreaWrap}>
              <FileText size={rs(17)} color={SUBTLE} strokeWidth={1.8} style={{ marginTop: rs(1) }} />
              <TextInput
                style={styles.textArea}
                value={reason}
                onChangeText={setReason}
                placeholder="Tell us why you need this leave…"
                placeholderTextColor={SUBTLE}
                multiline
              />
            </View>
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
              <ActivityIndicator color={C.green} size="small" />
            ) : (
              <>
                <View style={styles.uploadIcon}>
                  {attachment
                    ? <CircleCheck size={rs(18)} color={C.green} strokeWidth={2.2} />
                    : <CloudUpload size={rs(18)} color={C.green} strokeWidth={2.2} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.uploadTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {attachment ? attachment.name : 'Upload medical / supporting proof'}
                  </Text>
                  <Text style={styles.uploadHint}>{attachment ? 'Tap to replace' : 'PNG or JPG, up to a few MB'}</Text>
                </View>
                {!attachment ? <ChevronRight size={rs(17)} color={MUTED} /> : null}
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
                  <Send size={rs(16)} color="#FFFFFF" strokeWidth={2.2} />
                  <Text style={styles.submitBtnText} numberOfLines={1}>Submit Request</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const cardShadow = {
  shadowColor: C.ink, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { alignItems: 'center', paddingTop: 0, paddingBottom: rs(12) },

  // Info card
  header: {
    flexDirection: 'row', alignItems: 'center', gap: rs(10),
    backgroundColor: CARD, borderRadius: rs(16), borderWidth: 1, borderColor: BORDER,
    paddingVertical: rs(9), paddingHorizontal: rs(12), overflow: 'hidden', ...cardShadow,
  },
  headerLeaves: { position: 'absolute', right: -rs(6), bottom: -rs(12), flexDirection: 'row' },
  headerIcon: {
    width: rs(42), height: rs(42), borderRadius: rs(12), backgroundColor: C.greenTint,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: rf(16.5), fontWeight: '800', color: TEXT },
  subtitle: { fontSize: rf(12), color: MUTED, marginTop: 1, lineHeight: rlh(16) },

  // Section header
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(10), marginBottom: rs(6) },
  sectionRowInCard: { marginTop: 0, marginBottom: rs(6) },
  sectionAccent: { width: rs(4), height: rs(16), borderRadius: 2, backgroundColor: C.green, marginRight: rs(8) },
  sectionLabel: { fontSize: rf(15), fontWeight: '800', color: TEXT },
  sectionHint: {
    marginLeft: rs(8), fontSize: rf(11), fontWeight: '600', color: MUTED,
    backgroundColor: C.surface, paddingHorizontal: rs(8), paddingVertical: rs(2), borderRadius: 999, overflow: 'hidden',
  },

  // Leave type cards
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  typeChip: {
    minHeight: rs(48), flexDirection: 'row', alignItems: 'center', gap: rs(8),
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER, borderRadius: rs(14),
    paddingVertical: rs(6), paddingHorizontal: rs(8), ...cardShadow,
  },
  typeChipActive: { borderColor: C.green, backgroundColor: C.greenSoft },
  typeIcon: { width: rs(32), height: rs(32), borderRadius: rs(10), alignItems: 'center', justifyContent: 'center' },
  typeLabel: { flex: 1, fontSize: rf(13.5), fontWeight: '700', color: TEXT },
  radioOff: { width: rs(20), height: rs(20), borderRadius: rs(10), borderWidth: 2, borderColor: '#D4D4D4' },
  radioOn: {
    width: rs(22), height: rs(22), borderRadius: rs(11), backgroundColor: C.green,
    alignItems: 'center', justifyContent: 'center',
  },

  // Cards
  card: {
    backgroundColor: CARD, borderRadius: rs(16), borderWidth: 1, borderColor: BORDER, padding: rs(10), ...cardShadow,
  },
  divider: { height: 1, backgroundColor: C.surface, marginBottom: rs(6) },

  // Fields
  field: { marginBottom: rs(6) },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rs(4) },
  fieldLabel: { fontSize: rf(12), fontWeight: '700', color: TEXT },
  fieldHint: { fontSize: rf(11), fontWeight: '500', color: MUTED },
  pickerField: {
    minHeight: rs(42), borderRadius: rs(12), borderColor: BORDER, paddingHorizontal: rs(10), paddingVertical: rs(8), gap: rs(8),
  },

  twoCol: { flexDirection: 'row', gap: rs(8) },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  timeSep: { fontSize: rf(12), color: MUTED, fontWeight: '700' },

  durationPill: {
    flexDirection: 'row', alignItems: 'center', gap: rs(6), alignSelf: 'flex-start',
    backgroundColor: C.greenTint, borderRadius: 999, paddingHorizontal: rs(12), height: rs(30),
  },
  durationPillMuted: { backgroundColor: C.redTint },
  durationText: { fontSize: rf(12.5), fontWeight: '800', color: TEXT },

  // Reason
  reasonCard: {
    backgroundColor: CARD, borderRadius: rs(16), borderWidth: 1, borderColor: BORDER, padding: rs(8), ...cardShadow,
  },
  textAreaWrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: rs(8), minHeight: rs(72),
    backgroundColor: C.bg, borderWidth: 1, borderColor: BORDER, borderRadius: rs(12),
    paddingHorizontal: rs(10), paddingVertical: rs(8),
  },
  textArea: {
    flex: 1, minHeight: rs(54), textAlignVertical: 'top', fontSize: rf(13), color: TEXT, padding: 0,
  },

  // Attachment
  upload: {
    flexDirection: 'row', alignItems: 'center', gap: rs(10), minHeight: rs(56),
    backgroundColor: CARD, borderWidth: 1.5, borderColor: '#D4D4D4', borderStyle: 'dashed',
    borderRadius: rs(14), paddingVertical: rs(8), paddingHorizontal: rs(10),
  },
  uploadDone: { borderStyle: 'solid', borderColor: C.green, backgroundColor: C.greenSoft },
  uploadIcon: {
    width: rs(36), height: rs(36), borderRadius: rs(11), backgroundColor: C.greenTint,
    alignItems: 'center', justifyContent: 'center',
  },
  uploadTitle: { fontSize: rf(13), fontWeight: '700', color: TEXT },
  uploadHint: { fontSize: rf(11), color: MUTED, marginTop: 1 },

  // Footer
  footerRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(10) },
  cancelBtn: {
    flex: 1, height: rs(46), borderRadius: rs(14), alignItems: 'center', justifyContent: 'center',
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
  },
  cancelBtnText: { color: TEXT, fontSize: rf(14.5), fontWeight: '700' },
  submitBtn: {
    flex: 1.25, height: rs(46), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(8),
    borderRadius: rs(14), backgroundColor: C.green, paddingHorizontal: rs(10),
    shadowColor: C.green, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#FFFFFF', fontSize: rf(14.5), fontWeight: '800', flexShrink: 1 },
});
