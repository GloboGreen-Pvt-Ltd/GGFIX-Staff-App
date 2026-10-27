import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectSession } from '../store/authSlice';
import { View, StyleSheet, TouchableOpacity, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BriefcaseMedical,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CloudUpload,
  Coffee,
  Contrast,
  FileText,
  Leaf,
  Send,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { applyEmployeeLeave } from '../api/technician';
import { LeftVerticalSidebar, SidebarLayout, useSidebarWidth } from '../components/JobCardKit';
import { uploadMedia } from '../api/media';
import { notify } from '../components/confirm';
import TimePickerField, { to12h } from '../components/TimePickerField';
import DatePickerField from '../components/DatePickerField';
import MintScreenHeader, { useHideNativeHeader } from '../components/MintScreenHeader';
import { rf, rlh, rs } from '../utils/responsive';

// Design tokens (Near G Fix green + mint) — same system as Apply for Permission.
const C = {
  green: '#035C6C',
  red: '#F32C26',
  yellow: '#FAA700',
  ink: '#111111',
  bg: '#F3F4F6',
  surface: '#F3F4F6',
  greenTint: '#E5F3F5',
  greenSoft: '#E5F3F5',
  redTint: '#FEECEC',
  yellowTint: '#FDF6E0',
  // roles
  deep: '#035C6C',
  primary: '#035C6C',
  mint: '#E5F3F5',
};
const CARD = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT = '#111111';
const MUTED = '#6B7280';
const SUBTLE = '#A3A3A3';
const MAX_CONTENT_WIDTH = 720;

// Presentation only: icon + tile colours per leave type, keyed by value.
// `onStrong` is the icon colour on the solid (selected) tile.
const TYPE_LOOK = {
  CASUAL_LEAVE:    { icon: Coffee,           soft: C.greenTint,  fg: C.green,  strong: C.green,  onStrong: '#FFFFFF' },
  SICK_LEAVE:      { icon: BriefcaseMedical, soft: C.redTint,    fg: C.red,    strong: C.red,    onStrong: '#FFFFFF' },
  EMERGENCY_LEAVE: { icon: CircleAlert,      soft: C.yellowTint, fg: C.yellow, strong: C.yellow, onStrong: '#FFFFFF' },
  HALF_DAY:        { icon: Contrast,         soft: '#E8EBF0',    fg: '#1C3053', strong: '#1C3053', onStrong: '#FFFFFF' },
};

// Whitelist mirrors ALLOWED_LEAVE_TYPES on the backend. Order is the order shown
// in the chip grid. HALF_DAY auto-locks the range to a single day and stamps
// totalDays=0.5 server-side. PERMISSION lives on its own "Apply Permission"
// screen. Each type carries an icon + accent colour for the selectable cards.
const LEAVE_TYPES = [
  { value: 'CASUAL_LEAVE',    label: 'Casual',    icon: 'cafe-outline',         color: '#035C6C', soft: '#EFF6FF' },
  { value: 'SICK_LEAVE',      label: 'Sick',      icon: 'medkit-outline',       color: '#F32C26', soft: '#FFF1F2' },
  { value: 'EMERGENCY_LEAVE', label: 'Emergency', icon: 'alert-circle-outline', color: '#FAA700', soft: '#FFF7ED' },
  { value: 'HALF_DAY',        label: 'Half Day',  icon: 'contrast-outline',     color: '#1C3053', soft: '#E6F3FA' },
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
  const sidebarW = useSidebarWidth();
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
  const session = useSelector(selectSession);

  // Emergency leave on a single day with a From/To time counts as a fraction of
  // the employee's shift (e.g. 3h of a 9h shift = 0.33 day).
  const toMin = (t) => { const [h, m] = String(t || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
  const shiftMin = (() => {
    const a = toMin(session?.defaultCheckIn); const b = toMin(session?.defaultCheckOut);
    return a != null && b != null && b > a ? b - a : 9 * 60;
  })();
  const emergencyMin = leaveType === 'EMERGENCY_LEAVE' && startDate === endDate && startTime && endTime
    ? Math.max(0, toMin(endTime) - toMin(startTime)) : null;

  const totalDays = useMemo(() => {
    if (isHalfDay) return 0.5;
    if (emergencyMin) return Math.min(1, Math.round((emergencyMin / shiftMin) * 100) / 100);
    return daysBetween(startDate, endDate);
  }, [isHalfDay, startDate, endDate, emergencyMin, shiftMin]);

  const pickLeaveType = (next) => {
    setLeaveType(next);
    if (next !== 'EMERGENCY_LEAVE') {
      setStartTime('');
      setEndTime('');
    }
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

  const hoursLabel = emergencyMin ? ` (${Math.floor(emergencyMin / 60)}h${emergencyMin % 60 ? ` ${emergencyMin % 60}m` : ''})` : '';
  const durationLabel = totalDays > 0
    ? `${totalDays % 1 === 0 ? totalDays : totalDays.toFixed(2).replace(/0$/, '')} day${totalDays === 1 ? '' : 's'}${hoursLabel}`
    : 'Pick a valid date range';
  const durationValid = totalDays > 0;

  // Two-column type grid sized from the actual content width (capped on tablets).
  // The leave type sidebar takes the left edge; the form uses the rest.
  const contentW = Math.min(winW - sidebarW, MAX_CONTENT_WIDTH) - rs(20);
  // Leave types, one below the other in the left sidebar; the form on
  // the right is for the selected one.
  const sidebarItems = LEAVE_TYPES.map((t) => {
    const look = TYPE_LOOK[t.value] || TYPE_LOOK.CASUAL_LEAVE;
    return { key: t.value, label: t.label.split(' / ')[0], icon: look.icon, color: look.fg };
  });
  const selType = LEAVE_TYPES.find((t) => t.value === leaveType);
  const selLook = TYPE_LOOK[leaveType] || TYPE_LOOK.CASUAL_LEAVE;
  const SelIcon = selLook.icon;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MintScreenHeader title="Apply for leave" navigation={navigation} />
      <SidebarLayout sidebar={<LeftVerticalSidebar items={sidebarItems} active={leaveType} onPick={pickLeaveType} />}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentW }}>
          {/* Selected leave type — change it in the sidebar */}
          <View style={[styles.selectedType, { borderColor: selLook.fg }]}>
            <View style={[styles.typeIcon, { backgroundColor: selLook.fg }]}>
              <SelIcon size={rs(16)} color="#FFFFFF" strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.selectedHint}>Leave type</Text>
              <Text style={[styles.selectedName, { color: selLook.fg }]} numberOfLines={1}>{selType?.label || 'Choose a type'}</Text>
            </View>
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

            {/* Time window only for Emergency leave (casual / sick / half day are whole-day). */}
            {leaveType === 'EMERGENCY_LEAVE' ? (
              <>
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
              </>
            ) : null}

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
      </SidebarLayout>
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
    width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: C.green,
    alignItems: 'center', justifyContent: 'center',
  },
  subtitle: { fontSize: rf(12), color: '#6B7280', lineHeight: rlh(16) },

  // Section header
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(10), marginBottom: rs(6) },
  sectionRowInCard: { marginTop: 0, marginBottom: rs(6) },
  sectionAccent: { width: rs(4), height: rs(16), borderRadius: 2, backgroundColor: C.green, marginRight: rs(8) },
  sectionLabel: { fontSize: rf(16), fontWeight: '800', color: '#1C3053' },
  sectionHint: {
    marginLeft: rs(8), fontSize: rf(11), fontWeight: '600', color: MUTED,
    backgroundColor: C.surface, paddingHorizontal: rs(8), paddingVertical: rs(2), borderRadius: 999, overflow: 'hidden',
  },

  // Leave type cards
  typeGrid: { flexDirection: 'row' },
  typeChip: {
    flex: 1, minHeight: rs(72), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: rs(6),
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER, borderRadius: rs(14),
    paddingVertical: rs(6), paddingHorizontal: rs(4), ...cardShadow,
  },
  typeChipActive: { borderColor: C.green, backgroundColor: C.greenSoft },
  typeIcon: { width: rs(36), height: rs(36), borderRadius: rs(18), alignItems: 'center', justifyContent: 'center' },
  typeTick: {
    position: 'absolute', top: rs(5), right: rs(5), width: rs(18), height: rs(18), borderRadius: rs(9),
    backgroundColor: '#FFFFFF', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  typeLabel: { fontSize: rf(12), fontWeight: '700', color: TEXT, textAlign: 'center' },
  selectedType: {
    flexDirection: 'row', alignItems: 'center', gap: rs(9), backgroundColor: CARD, borderRadius: rs(14),
    borderWidth: 1, paddingVertical: rs(7), paddingHorizontal: rs(10), marginTop: rs(10), ...cardShadow,
  },
  selectedHint: { fontSize: rf(10.5), color: MUTED, fontWeight: '600' },
  selectedName: { fontSize: rf(13.5), fontWeight: '800' },
  radioOff: { width: rs(20), height: rs(20), borderRadius: rs(10), borderWidth: 2, borderColor: '#E5E7EB' },
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
    backgroundColor: CARD, borderWidth: 1.5, borderColor: '#E5E7EB', borderStyle: 'dashed',
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
