import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BriefcaseBusiness,
  BriefcaseMedical,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  CloudUpload,
  PersonStanding,
  Send,
  UserRound,
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
import { userMessage } from '../utils/userMessages';

// Design tokens (NearGFix green + mint).
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
  bright: '#035C6C',
  mint: '#E5F3F5',
};
const CARD = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT = '#111111';
const MUTED = '#6B7280';
const SUBTLE = '#A3A3A3';
const MAX_CONTENT_WIDTH = 720;

// Presentation only: icon + tile colours per permission type, keyed by value.
// `onStrong` is the icon colour on the solid (selected) tile.
const TYPE_LOOK = {
  PERSONAL:    { icon: UserRound,         soft: C.greenTint,  fg: C.green,  strong: C.green,  onStrong: '#FFFFFF' },
  MEDICAL:     { icon: BriefcaseMedical,  soft: C.redTint,    fg: C.red,    strong: C.red,    onStrong: '#FFFFFF' },
  OFFICIAL:    { icon: BriefcaseBusiness, soft: '#E6F3FA',    fg: '#0788C9', strong: '#0788C9', onStrong: '#FFFFFF' },
  SHORT_LEAVE: { icon: PersonStanding,    soft: C.yellowTint, fg: C.yellow, strong: C.yellow, onStrong: '#FFFFFF' },
};

// A Permission is stored as a same-day leave with leaveType='PERMISSION' (the
// backend early-checkout guard unlocks on an APPROVED PERMISSION covering the
// day). The sub-type + optional time window are captured in the reason text so
// no new backend column / migration is needed. Owner sees it in the same
// pending-leaves list they already approve from. Each type carries an icon +
// accent colour for the selectable cards.
const PERMISSION_TYPES = [
  { value: 'PERSONAL',    label: 'Personal',                 icon: 'person-outline',    color: '#035C6C', soft: '#EFF6FF' },
  { value: 'MEDICAL',     label: 'Medical',                  icon: 'medkit-outline',    color: '#F32C26', soft: '#FFF1F2' },
  { value: 'OFFICIAL',    label: 'Official',                 icon: 'briefcase-outline', color: '#035C6C', soft: '#F0FDFA' },
  { value: 'SHORT_LEAVE', label: 'Short Leave / Early Going', icon: 'walk-outline',      color: '#1C3053', soft: '#E6F3FA' },
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

function Field({ label, hint, last, children }) {
  return (
    <View style={[styles.field, last && styles.fieldLast]}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default function PermissionApplyScreen({ navigation }) {
  useHideNativeHeader(navigation);
  const { width: winW } = useWindowDimensions();
  const sidebarW = useSidebarWidth();
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
      mediaTypes: ['images'],
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
      notify('Could not upload attachment', userMessage(e, 'Please try again.'), { type: 'error', haptic: 'error' });
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
    if (err) { notify('Check the form', err, { type: 'warning' }); return; }
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
      notify('Permission request submitted', 'Sent to the owner for approval.', { type: 'success' });
      navigation.goBack();
    } catch (e) {
      notify('Could not submit permission request', userMessage(e, 'Please try again.'), { type: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Two-column type grid sized from the actual content width (capped on tablets).
  // The permission type sidebar takes the left edge; the form uses the rest.
  const contentW = Math.min(winW - sidebarW, MAX_CONTENT_WIDTH) - rs(20);
  // Permission types, one below the other in the left sidebar; the form on
  // the right is for the selected one.
  const sidebarItems = PERMISSION_TYPES.map((t) => {
    const look = TYPE_LOOK[t.value] || TYPE_LOOK.PERSONAL;
    return { key: t.value, label: t.label.split(' / ')[0], icon: look.icon, color: look.fg };
  });
  const selType = PERMISSION_TYPES.find((t) => t.value === permType);
  const selLook = TYPE_LOOK[permType] || TYPE_LOOK.PERSONAL;
  const SelIcon = selLook.icon;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MintScreenHeader title="Apply for Permission" navigation={navigation} />
      <SidebarLayout sidebar={<LeftVerticalSidebar items={sidebarItems} active={permType} onPick={setPermType} />}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentW }}>
          {/* Selected permission type — change it in the sidebar */}
          <View style={[styles.selectedType, { borderColor: selLook.fg }]}>
            <View style={[styles.typeIcon, { backgroundColor: selLook.fg }]}>
              <SelIcon size={rs(16)} color="#FFFFFF" strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.selectedHint}>Permission type</Text>
              <Text style={[styles.selectedName, { color: selLook.fg }]} numberOfLines={1}>{selType?.label || 'Choose a type'}</Text>
            </View>
          </View>

          {/* When */}
          <SectionLabel text="When" />
          <View style={styles.card}>
            <Field label="Date">
              <DatePickerField value={date} onChange={setDate} fieldStyle={styles.pickerField} accent={C.green} accentSoft={C.greenTint} />
            </Field>

            <Field label="Time window" hint="Optional" last>
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <TimePickerField value={fromTime} placeholder="From time" onChange={setFromTime} fieldStyle={styles.pickerField} accent={C.green} />
                </View>
                <Text style={styles.timeSep}>to</Text>
                <View style={{ flex: 1 }}>
                  <TimePickerField value={toTime} placeholder="To time" onChange={setToTime} fieldStyle={styles.pickerField} accent={C.green} />
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
              <ActivityIndicator color={C.green} size="small" />
            ) : (
              <>
                <View style={styles.uploadIcon}>
                  {attachment
                    ? <CircleCheck size={rs(18)} color={C.green} strokeWidth={2.2} />
                    : <CloudUpload size={rs(18)} color={C.green} strokeWidth={2.2} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.uploadTitle} numberOfLines={1}>
                    {attachment ? attachment.name : 'Upload supporting proof'}
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
    paddingVertical: rs(9), paddingHorizontal: rs(12), ...cardShadow,
  },
  headerIcon: {
    width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: C.green,
    alignItems: 'center', justifyContent: 'center',
  },
  subtitle: { fontSize: rf(12), color: '#6B7280', lineHeight: rlh(16) },

  // Section header
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(10), marginBottom: rs(6) },
  sectionAccent: { width: rs(4), height: rs(16), borderRadius: 2, backgroundColor: C.green, marginRight: rs(8) },
  sectionLabel: { fontSize: rf(16), fontWeight: '800', color: '#1C3053' },
  sectionHint: {
    marginLeft: rs(8), fontSize: rf(11), fontWeight: '600', color: MUTED,
    backgroundColor: C.surface, paddingHorizontal: rs(8), paddingVertical: rs(2), borderRadius: 999, overflow: 'hidden',
  },

  // Type cards
  typeGrid: { flexDirection: 'row' },
  typeChip: {
    flex: 1, minHeight: rs(72), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: rs(5),
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER, borderRadius: rs(14),
    paddingVertical: rs(6), paddingHorizontal: rs(3), ...cardShadow,
  },
  typeChipActive: { borderColor: C.green, backgroundColor: C.greenSoft },
  typeIcon: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: 'center', justifyContent: 'center' },
  typeTick: {
    position: 'absolute', top: rs(5), right: rs(5), width: rs(18), height: rs(18), borderRadius: rs(9),
    backgroundColor: '#FFFFFF', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  typeLabel: { fontSize: rf(11), fontWeight: '700', color: TEXT, lineHeight: rlh(14), textAlign: 'center' },
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
    backgroundColor: CARD, borderRadius: rs(16), borderWidth: 1, borderColor: BORDER, padding: rs(8), ...cardShadow,
  },

  // Fields
  field: { marginBottom: rs(8) },
  fieldLast: { marginBottom: 0 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rs(4) },
  fieldLabel: { fontSize: rf(12), fontWeight: '700', color: TEXT },
  fieldHint: { fontSize: rf(11), fontWeight: '500', color: MUTED },
  pickerField: {
    minHeight: rs(38), borderRadius: rs(12), borderColor: BORDER, paddingHorizontal: rs(10), gap: rs(8),
  },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  timeSep: { fontSize: rf(12), color: MUTED, fontWeight: '700' },

  // Reason
  textArea: {
    minHeight: rs(64), textAlignVertical: 'top', fontSize: rf(13), color: TEXT,
    backgroundColor: C.bg, borderWidth: 1, borderColor: BORDER, borderRadius: rs(12), padding: rs(10),
  },

  // Attachment
  upload: {
    flexDirection: 'row', alignItems: 'center', gap: rs(10), minHeight: rs(48),
    backgroundColor: CARD, borderWidth: 1.5, borderColor: '#E5E7EB', borderStyle: 'dashed',
    borderRadius: rs(14), paddingVertical: rs(8), paddingHorizontal: rs(10),
  },
  uploadDone: { borderStyle: 'solid', borderColor: C.green, backgroundColor: C.greenSoft },
  uploadIcon: {
    width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: C.greenTint,
    alignItems: 'center', justifyContent: 'center',
  },
  uploadTitle: { fontSize: rf(13), fontWeight: '700', color: TEXT },
  uploadHint: { fontSize: rf(11), color: MUTED, marginTop: 1 },

  // Footer
  footerRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(12) },
  cancelBtn: {
    flex: 1, height: rs(46), borderRadius: rs(14), alignItems: 'center', justifyContent: 'center',
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
  },
  cancelBtnText: { color: TEXT, fontSize: rf(14.5), fontWeight: '700' },
  submitBtn: {
    flex: 1.1, height: rs(46), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(8),
    borderRadius: rs(14), backgroundColor: C.green, paddingHorizontal: rs(10),
    shadowColor: C.green, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#FFFFFF', fontSize: rf(14.5), fontWeight: '800', flexShrink: 1 },
});
