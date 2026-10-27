import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { markNotificationsSeen } from './NotificationsScreen';
import { View, ScrollView, TouchableOpacity, Image, ActivityIndicator, Pressable, Platform, Alert, Animated, AppState, Modal, Easing } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from '../utils/audio';
import {
  Smartphone, Search, UploadCloud, Pencil, X, Check,
  Mic, Play, Pause, Trash2, Plus, Image as ImageIcon,
  ShieldCheck, PackageX, Square, IndianRupee, BadgeCheck, Hourglass,
  Package, ChevronRight, Lock, CircleCheck,
} from 'lucide-react-native';
import DatePickerField, { toISO } from '../components/DatePickerField';
import {
  getTicket, setTechnicianPhotos, addRepairNote, listRepairNotes,
  updateRepairNote, listTicketEvents, postProgressEvent,
} from '../api/tickets';
import { uploadMedia } from '../api/media';
import { confirm, notify } from '../components/confirm';
import { rf, rs } from '../utils/responsive';
import {
  MIN_NOTE_PHOTOS, noteIsComplete, savedNotePhotoCount, currentEvents, findEvent,
  repairStartBlocker, shouldAutoStartRepair, photosToSync, PARTS_RECEIVED_MARK,
} from '../utils/serviceProgress';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { ticketRef } from '../utils/ticketRef';
import { useSelector } from 'react-redux';
import { selectTechnicianId } from '../store/authSlice';
import { resolveDeviceImageSource } from '../utils/images';
import { listModelsForBrand } from '../api/master';
import ImageViewerModal from '../components/ImageViewerModal';

// Service Progress checklist rows shown above the Issue Reference buttons.
// Submitting a row POSTs /tickets/{id}/progress-events; the matching
// repair_booking_events row lights up on the customer/owner timeline. Labels
// + order mirror the canonical SHOP_BOOKING_STATUS_OPTIONS list in
// serviceHistoryPhases.js — anything the technician can directly emit
// appears here, in the same order the timeline renders. Status keys stay
// on their current DB values (rename ships separately with a migration).
//
// `mode` says who records the row:
//   auto   — the app records it as the technician works (no tick):
//            IN_REPAIR after Accept + customer approval, and the synthetic row
//            read off the saved issue note (ISSUE_VERIFIED: description +
//            photos — not a step key; the backend writes those timeline rows
//            itself)
//   optional — Spare Parts Waiting, only when a part is needed
//   finish   — Repair Completed, recorded by the Finish Repair button
//   manual   — the technician's tick: the Quality Check
//   failed   — Repair Not Completed, from the Unable to Repair action
const PROGRESS_ROWS = [
  { key: 'IN_REPAIR',               label: 'Repair Work Started', mode: 'auto' },
  // Issue Verified + Repair Photos Added as one row: done once the saved note
  // has the description and the required photos.
  { key: 'ISSUE_VERIFIED',          label: 'Verified Issue & Repair Details', mode: 'auto', synthetic: true },
  // One spare-parts row. "Spare Parts Replaced" (PARTS_REPLACED) was retired
  // with migration 87 — the technician records the outcome in this row's note
  // instead, and the backend no longer accepts the old key.
  // Optional — recorded from the Parts Waiting card under Next Action; never done or blocking
  // unless the technician actually saves a wait.
  { key: 'PARTS_REQUIRED',          label: 'Spare Parts Waiting', mode: 'optional' },
  // Repair first, then the check on that repair — 03 then 04. This is also the
  // order the grouped Service History rail renders (Repair Completed sits above
  // Quality Check Completed in SHOP_BOOKING_STATUS_OPTIONS), so the checklist
  // and the timeline read the same way down the page.
  { key: 'REPAIR_COMPLETED',        label: 'Repair Completed', mode: 'finish' },
  // One quality-check row. "Quality Check Pending"/"Started"
  // (QUALITY_CHECK_STARTED) was retired with migration 88: marking this row
  // Done is what records the check, and the backend stamps the event's
  // createdAt at that instant — so the completion time is captured
  // automatically, with no separate "started" step to open first.
  { key: 'QUALITY_CHECK_COMPLETED', label: 'Quality Check Completed', mode: 'manual' },
  // Repair-failed path: recorded with a reason from the "Unable to Repair"
  // action under Finish Repair; the row appears only once it's on the booking.
  { key: 'REPAIR_NOT_COMPLETED',    label: 'Repair Not Completed', mode: 'failed' },
];

// The Service Progress timeline as drawn: the two automatic steps, then the
// Next Action row (Finish Repair / Parts Waiting / Unable to Repair cards,
// later the recorded outcome), then Repair Completed and the Quality Check.
// Spare Parts Waiting and Repair Not Completed are recorded from Next Action
// and shown inside it, not as rows of their own.
const NEXT_ACTION_ROW = { key: 'NEXT_ACTION', label: 'Next Action', mode: 'next', synthetic: true };
const TIMELINE_ROWS = [
  ...PROGRESS_ROWS.filter((r) => r.key === 'IN_REPAIR' || r.key === 'ISSUE_VERIFIED'),
  NEXT_ACTION_ROW,
  ...PROGRESS_ROWS.filter((r) => r.key === 'REPAIR_COMPLETED' || r.key === 'QUALITY_CHECK_COMPLETED'),
];

// Unable to Repair: pick one; "Other" needs a comment.
const UNABLE_REASONS = [
  'Board / motherboard damaged',
  'Spare part not available',
  'Liquid damage beyond repair',
  'Repair cost too high',
  'Customer declined repair',
  'Other',
];

// Next Action card tones: light fill, solid icon circle, matching hairline.
const ACTION_TONE = {
  green: { fg: '#609138', bg: '#EEF4E9', line: '#D6E6C8' },
  amber: { fg: '#FAA700', bg: '#FFF6E0', line: '#FBE3A6' },
  red: { fg: '#F32C26', bg: '#FEECEC', line: '#FBD0D0' },
};

// "YYYY-MM-DD" (DatePickerField) → "30 Oct 2026".
function fmtIsoDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Empty Parts Waiting form.
const EMPTY_PARTS = { name: '', reason: '', qty: '', eta: '' };

// Resume Repair on a Spare Parts Waiting row. With PARTS_RECEIVED_ENABLED off
// (production doesn't accept PARTS_RECEIVED yet — see
// dev-artifacts/automatic-service-progress) it uses the existing API: the
// PARTS_REQUIRED row is re-saved with its note starting PARTS_RECEIVED_MARK.
// The backend refreshes that row's time on a re-save, so the note carries
// when the wait started.
const PARTS_RECEIVED_ENABLED = false;

// Live Sync: while Job Details is open, re-read the ticket, notes and events
// this often so steps recorded elsewhere (the shop's Quality Check, a customer
// approval) show up without leaving the screen. Same cadence as the Partner
// app's booking screens.
const LIVE_SYNC_MS = 15000;

// Rows that always emit a fixed note when the technician marks them.
// Saves them typing a free-text reason every time and keeps the wording the
// customer + shop see consistent across tickets.
const DEFAULT_PROGRESS_NOTE = {
  REPAIR_NOT_COMPLETED: 'Your repair is not completed',
};

// Recording either of these finishes a stage of the technician's work: the
// screen shows its banner, then returns to the Job Report. Description + the
// required photos (MIN_NOTE_PHOTOS / noteIsComplete in utils/serviceProgress)
// are mandatory for both.
const COMPLETION_MESSAGES = {
  REPAIR_COMPLETED: 'Repair completed successfully!',
  QUALITY_CHECK_COMPLETED: 'Quality check completed!',
};
const COMPLETION_SUBTITLE = 'Job moved to Completed. Redirecting to Job Report...';
const COMPLETION_REDIRECT_MS = 1000;

function parseJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// devicePhotosJson uses the {front, back, video} object form (the booking
// mirror writes it that way); technicianPhotosJson is a plain ["url", ...]
// array. Normalize both into a flat URL list ordered front → back → video.
function parseDevicePhotos(raw) {
  if (!raw) return [];
  let v = raw;
  if (typeof raw === 'string') {
    try { v = JSON.parse(raw); } catch { return []; }
  }
  if (Array.isArray(v)) return v.map(photoUrl).filter(Boolean);
  if (v && typeof v === 'object') {
    return ['front', 'back', 'video']
      .map((k) => photoUrl(v[k]))
      .filter(Boolean);
  }
  return [];
}

// "Tue, 11 Aug 2026 · 6:16 pm". The re-estimate / approval rows need BOTH
// halves spelled out, so this never degrades to a bare date the way
// toLocaleString() does on some locales.
function fmtDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
  const time = d
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
  return `${date} · ${time}`;
}

function formatINR(v) {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return null;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// priceItemsJson is the shop's estimate breakdown — [{ label|name|serviceName,
// amount|price }, ...]. Same tolerant parse the owner-side screens use, since
// the key names differ between the booking flow and the edit flow.
function parsePriceItems(raw) {
  return parseJsonArray(raw)
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const label = it.label || it.name || it.serviceName || it.title;
      const amount = it.amount ?? it.price ?? it.value;
      return label ? { label, amount } : null;
    })
    .filter(Boolean);
}

// devicePhotosJson can be ["url", ...] or [{ url }, ...]. Normalize.
function photoUrl(item) {
  if (!item) return null;
  if (typeof item === 'string') return item;
  return item.url || item.uri || item.imageUrl || null;
}

// Screen palette — Near G Fix green / red / yellow on light neutrals, the same set
// the restyled Home and attendance screens use.
const C = {
  green: '#035C6C',
  greenTint: '#E5F3F5',
  greenSoft: '#E5F3F5',
  greenLine: '#E5F3F5',
  red: '#F32C26',
  redTint: '#FEECEC',
  redLine: '#FBD0D0',
  yellow: '#FAA700',
  yellowTint: '#FDF6E0',
  yellowSoft: '#FFFBEF',
  yellowLine: '#F6DE8D',
  yellowInk: '#FAA700',
  ink: '#111111',
  muted: '#6B7280',
  faint: '#A3A3A3',
  bg: '#F3F4F6',
  surface: '#F3F4F6',
  border: '#E5E7EB',
  line: '#E5E7EB',
};

// Next Action card: solid icon circle, title + one-line subtitle, chevron.
// Locked cards stay tappable so the reason can be shown.
function ActionCard({ tone, Icon, title, subtitle, onPress, busy, locked }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      className="flex-row items-center"
      style={{
        backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.line, borderRadius: 12,
        paddingVertical: 7, paddingHorizontal: 9, marginTop: 6, opacity: locked ? 0.65 : 1,
        shadowColor: '#111111', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
      }}
    >
      <View className="rounded-full items-center justify-center" style={{ width: 28, height: 28, backgroundColor: locked ? C.muted : tone.fg }}>
        {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon size={15} color="#FFFFFF" strokeWidth={2.6} />}
      </View>
      <View style={{ flex: 1, marginLeft: 9 }}>
        <Text className="font-bold" style={{ fontSize: rf(12), color: C.ink }} numberOfLines={1}>{title}</Text>
        <Text style={{ fontSize: rf(10), color: C.muted, marginTop: 1 }} numberOfLines={2}>{subtitle}</Text>
      </View>
      <ChevronRight size={16} color={locked ? C.muted : tone.fg} strokeWidth={2.4} />
    </TouchableOpacity>
  );
}

// Section header: a small vertical accent bar + bold title + optional right
// action. Used throughout the screen so every section reads with the same
// visual rhythm.
function SectionHeader({ title, accent = C.green, right = null }) {
  return (
    <View className="flex-row items-center" style={{ marginTop: 2, marginBottom: 6 }}>
      <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: accent, marginRight: 7 }} />
      <Text className="flex-1" style={{ fontSize: rf(14), fontWeight: '700', color: '#1C3053' }}>{title}</Text>
      {right}
    </View>
  );
}

// Page header (same white bar as Job Report / Job Assign Report): back ·
// centred "Job Details" + job reference sub-heading. Pads the status-bar inset
// itself because the stack's native header is hidden for this screen.
function JobHeader({ navigation, sub }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: C.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(10), paddingHorizontal: rs(14), paddingVertical: rs(10) }}>
        <View style={{ width: rs(36) }}>
          {navigation.canGoBack() ? (
            <TouchableOpacity
              onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Back" activeOpacity={0.7}
              style={{ width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={rs(20)} color={C.ink} strokeWidth={2.4} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <Text style={{ fontSize: rf(17), fontWeight: '800', color: '#1C3053', textAlign: 'center' }} numberOfLines={1}>Job Details</Text>
          {sub ? <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 1, textAlign: 'center' }} numberOfLines={1}>{sub}</Text> : null}
        </View>
        <View style={{ width: rs(36) }} />
      </View>
    </View>
  );
}

// Device name → name, number, storage. Handles both
//   "Oppo A5 5G · CPH2751 (6GB / 128GB)"  (storage in brackets) and
//   "Oppo A5 5G · CPH2753 · 8GB · 128GB"  (storage as extra parts).
function deviceParts(ticket) {
  const clean = (x) => String(x).replace(/^[\s ]+|[\s ]+$/g, '');
  let raw = String(ticket?.deviceDisplayName || '');
  let storage = '';
  const paren = raw.match(/\(([^)]*\d\s*[GMT]B[^)]*)\)/i);
  if (paren) {
    storage = paren[1];
    raw = raw.replace(paren[0], '');
  }
  const parts = raw.split(/[·•|]/).map(clean).filter(Boolean);
  if (!storage) storage = parts.slice(2).join(' / ');
  return {
    name: parts[0] || [ticket?.brandName, ticket?.modelName].filter(Boolean).join(' ') || '—',
    number: parts[1] || '—',
    storage: clean(storage.replace(/\s*\/\s*/g, ' / ')) || '—',
  };
}

// One label → value line of a listing card (value may wrap freely).
function InfoLine({ label, value, first }) {
  return (
    <View className="flex-row" style={{ marginTop: first ? 0 : 5 }}>
      <Text style={{ width: rs(96), fontSize: rf(11.5), color: C.muted }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: rf(12), fontWeight: '700', color: C.ink }}>{value}</Text>
    </View>
  );
}

// Card shell with the border / soft shadow used on every section. Keeps
// the visual rhythm consistent and avoids re-typing the same style blob.
function Card({ children, style }) {
  return (
    <View
      style={[
        { backgroundColor: '#FFFFFF', borderRadius: 12, padding: rs(9), marginBottom: rs(8),
          borderWidth: 1, borderColor: C.border, shadowColor: C.ink,
          shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
          elevation: 1 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// One row of the Re-Estimate / Customer Approval block above Submitted Notes:
// coloured icon chip, title with an optional state pill, then the date + time
// on its own line — that timestamp is the whole point of the row, so it gets
// its own weight rather than being buried in the note text.
function EstimateRow({
  icon: Icon, tint, iconColor, title, pill, pillTint, pillColor,
  when, whenColor = C.ink, note, children,
}) {
  return (
    <View className="flex-row">
      <View
        className="rounded-full items-center justify-center"
        style={{ width: 26, height: 26, backgroundColor: tint }}
      >
        <Icon size={13} color={iconColor} />
      </View>
      <View className="flex-1" style={{ marginLeft: 10 }}>
        <View className="flex-row items-center">
          <Text className="font-bold flex-1" style={{ fontSize: rf(12), color: C.ink }}>
            {title}
          </Text>
          {pill ? (
            <View className="rounded-full px-2 py-0.5 ml-2" style={{ backgroundColor: pillTint }}>
              <Text className="font-bold" style={{ fontSize: rf(9), color: pillColor }}>
                {pill}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="font-bold" style={{ fontSize: rf(11.5), color: whenColor, marginTop: 3 }}>
          {when}
        </Text>
        {note ? (
          <Text style={{ fontSize: rf(10), color: C.muted, marginTop: 2 }}>{note}</Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

// Empty image-upload slot: dashed tile with a green + circle and an
// "Add Photo" label, so the tap target reads as an obvious "add" affordance.
function AddPhotoSlot({ onPress, height = 72, required = false }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        height, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line, backgroundColor: C.bg,
      }}
    >
      <View
        style={{
          width: 26, height: 26, borderRadius: 13, backgroundColor: C.green,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Plus size={15} color="#FFFFFF" />
      </View>
      <Text className="font-bold" style={{ fontSize: rf(9.5), color: C.muted, marginTop: 6 }}>
        Add Photo{required ? <Text style={{ color: C.red }}> *</Text> : null}
      </Text>
    </TouchableOpacity>
  );
}

// Completion popup — a centred card over the dimmed screen while Job Details
// hands over to the Job Report: confetti dots around a green tick, the title,
// where it's going, and a bar that fills over `durationMs` (the redirect).
const CONFETTI = [
  { color: '#1C3053', top: 8, left: 30, size: 7, rotate: '20deg' },
  { color: '#0788C9', top: 34, left: 14, size: 6, rotate: '45deg' },
  { color: '#F32C26', top: 60, left: 34, size: 6, rotate: '15deg' },
  { color: '#035C6C', top: 6, right: 34, size: 6, rotate: '45deg' },
  { color: '#FAA700', top: 34, right: 12, size: 7, rotate: '30deg' },
  { color: '#609138', top: 62, right: 32, size: 6, rotate: '45deg' },
];

function CompletionPopup({ visible, title, subtitle, durationMs }) {
  const pop = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    pop.setValue(0);
    fill.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 6, useNativeDriver: Platform.OS !== 'web' }).start();
    Animated.timing(fill, { toValue: 1, duration: durationMs, easing: Easing.linear, useNativeDriver: false }).start();
  }, [visible, durationMs, pop, fill]);
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', alignItems: 'center', justifyContent: 'center', padding: rs(24) }}>
        <Animated.View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{
            width: '100%', maxWidth: 360, alignItems: 'center',
            backgroundColor: '#FFFFFF', borderRadius: 20,
            paddingVertical: rs(24), paddingHorizontal: rs(20),
            shadowColor: C.ink, shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
            elevation: 10,
            opacity: pop,
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
          }}
        >
          <View style={{ width: 150, height: 80, alignItems: 'center', justifyContent: 'center' }}>
            {CONFETTI.map((c, i) => (
              <View
                key={i}
                style={{
                  position: 'absolute', top: c.top, left: c.left, right: c.right,
                  width: c.size, height: c.size, borderRadius: 1.5,
                  backgroundColor: c.color, transform: [{ rotate: c.rotate }],
                }}
              />
            ))}
            <View
              style={{
                width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#609138', borderWidth: 5, borderColor: '#E4EFDA',
              }}
            >
              <Check size={34} color="#FFFFFF" strokeWidth={3.2} />
            </View>
          </View>
          <Text style={{ fontSize: rf(18), fontWeight: '800', color: '#1C3053', marginTop: rs(12), textAlign: 'center' }}>
            {title}
          </Text>
          <Text style={{ fontSize: rf(12.5), color: C.muted, marginTop: 6, textAlign: 'center', lineHeight: rf(18) }}>
            {subtitle}
          </Text>
          <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: C.border, marginTop: rs(16), overflow: 'hidden' }}>
            <Animated.View
              style={{
                height: '100%', borderRadius: 3, backgroundColor: C.green,
                width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }}
            />
          </View>
          <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 8 }}>
            {seconds} second{seconds === 1 ? '' : 's'}
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function JobDetailsScreen({ route, navigation }) {
  const { ticketId } = route.params || {};
  // Bottom padding below the scroll content clears the system nav bar.
  const insets = useSafeAreaInsets();

  const [ticket, setTicket] = useState(null);
  // A job is shown only to the employee it's assigned to — e.g. a stale
  // notification after a reassignment lands here. Unknown ids don't block.
  const myTechId = useSelector(selectTechnicianId);
  const notMine = !!(myTechId && ticket?.assignedTechnicianId
    && String(ticket.assignedTechnicianId) !== String(myTechId));
  // Opening a ticket auto-reads its notification.
  useEffect(() => { if (ticket?.id) markNotificationsSeen({ tickets: [ticket] }); }, [ticket?.id, ticket?.updatedAt]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Which customer photo the full-screen viewer is on (-1 = closed). Must sit
  // with the other hooks, above the loading/error early returns.
  const [photoAt, setPhotoAt] = useState(-1);
  // Same, for the Technician Repair Report's evidence photos.
  const [reportPhotoAt, setReportPhotoAt] = useState(-1);

  // Service Progress sync badge, from real API results only:
  //   synced  — the last read/save reached the server (with its time)
  //   offline — the last request never reached it (client sets status 0)
  //   failed  — the server answered with an error
  // "Saving…" is derived from the in-flight saves at render time.
  const [syncState, setSyncState] = useState({ status: 'idle', at: null });
  const markSync = useCallback((e) => {
    setSyncState(e
      ? { status: e?.status ? 'failed' : 'offline', at: Date.now() }
      : { status: 'synced', at: Date.now() });
  }, []);
  // Automatic step posts in flight (they have no row spinner of their own).
  const [autoSaving, setAutoSaving] = useState(0);
  // ScrollView + section offsets for the Add / Edit Report shortcut.
  const scrollRef = useRef(null);
  const composeY = useRef(null);
  const notesY = useRef(null);

  // Your-Side photos: { uri, remoteUrl } — uri is local until uploaded.
  const [yourPhotos, setYourPhotos] = useState([null, null, null]);
  const [photosSubmitting, setPhotosSubmitting] = useState(false);
  // After upload, slots render read-only; +Edit re-enables picking/removing.
  const [photosEditing, setPhotosEditing] = useState(false);


  const [note, setNote] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [notesList, setNotesList] = useState([]);

  // Submitted Notes → Edit. Only one note is open for editing at a time; its
  // draft lives here rather than in the compose card's state so an in-progress
  // new note isn't clobbered by opening an edit.
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editNoteImages, setEditNoteImages] = useState([null, null, null]);
  const [editNoteAudioUrl, setEditNoteAudioUrl] = useState('');
  const [editNoteSaving, setEditNoteSaving] = useState(false);

  // Compliance note attachments. Image slots mirror the Your-Side photos grid
  // above (3 slots). Audio mirrors the owner-side ServicePriceEstimateScreen
  // recorder: clip uploads to media.ggfix.in as soon as the user taps Stop, so by
  // the time they hit Save Note the hosted URL is already ready.
  const [noteImages, setNoteImages] = useState([null, null, null]);
  const [noteAudioUrl, setNoteAudioUrl] = useState('');          // hosted URL (after upload)
  const [noteAudioLocalUri, setNoteAudioLocalUri] = useState(''); // local file, pre-upload
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [playingId, setPlayingId] = useState(null); // key of the currently playing audio
  const recordingRef = useRef(null);
  const soundRef = useRef(null);
  const tickRef = useRef(null);

  // 1 Hz-ish timer while recording so the technician sees the duration tick up.
  useEffect(() => {
    if (isRecording) {
      const start = Date.now();
      tickRef.current = setInterval(() => {
        setRecordingMs(Date.now() - start);
      }, 250);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      setRecordingMs(0);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [isRecording]);

  // Free the recorder / player when we leave the screen so the next mount can
  // re-acquire the mic without "Already prepared" errors.
  useEffect(() => () => {
    try { recordingRef.current?.stopAndUnloadAsync?.(); } catch (_) {}
    try { soundRef.current?.unloadAsync?.(); } catch (_) {}
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  const load = useCallback(async () => {
    if (!ticketId) { setLoading(false); return; } // else the spinner never clears
    setLoading(true);
    try {
      const t = await getTicket(ticketId);
      setTicket(t);
      const existing = parseJsonArray(t?.technicianPhotosJson).map(photoUrl).filter(Boolean);
      const slots = [null, null, null];
      existing.slice(0, 3).forEach((url, i) => { slots[i] = { uri: url, remoteUrl: url }; });
      setYourPhotos(slots);
      // If any photo was already uploaded, default to read-only view.
      setPhotosEditing(existing.length === 0);
      setError(null);
      markSync(null);
    } catch (e) {
      setError(e?.message || 'Could not load ticket');
      markSync(e);
    } finally {
      setLoading(false);
    }
  }, [ticketId, markSync]);

  useEffect(() => { load(); }, [load]);

  // Pull existing compliance notes so the list under Submit shows what's
  // already been recorded for this ticket.
  // notesLoaded / eventsLoaded: the automatic steps below wait for a real read
  // of each — acting on the empty initial state would re-post steps that are
  // already on the booking.
  const [notesLoaded, setNotesLoaded] = useState(false);
  const refreshNotes = useCallback(async () => {
    if (!ticketId) return;
    try {
      const rows = await listRepairNotes(ticketId);
      setNotesList(Array.isArray(rows) ? rows : []);
      setNotesLoaded(true);
      markSync(null);
    } catch (e) { markSync(e); }
  }, [ticketId, markSync]);

  useEffect(() => { refreshNotes(); }, [refreshNotes]);

  // Service Progress checklist state.
  // - `progressChecked` is the local tick state for each row (user is about
  //   to submit). Submit clears the tick because the row's "done" state then
  //   comes from `progressDone` which is sourced from backend events.
  // - `progressDone` is the persisted set of step keys that already have
  //   matching events on this ticket — the row renders with a green tick.
  // - `progressBusy` is the row currently being POSTed so we can disable it.
  const [progressChecked, setProgressChecked] = useState({});
  const [progressDone, setProgressDone] = useState({});
  // Actor per done row — 'TECHNICIAN' or 'OWNER'. Quality Check Completed can
  // be recorded from the shop app too, and the row says which side did it.
  const [progressActor, setProgressActor] = useState({});
  // Server time each step was recorded at, shown on its row.
  const [progressAt, setProgressAt] = useState({});
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [progressBusy, setProgressBusy] = useState(null);
  // Raw booking-event rows behind the checklist. Kept as-is (not just reduced
  // to progressDone) because the Submitted Notes block reads the re-estimate
  // and customer-approval events out of the same fetch.
  const [ticketEvents, setTicketEvents] = useState([]);
  // Per-row note input — only the PARTS_REQUIRED row prompts for one today
  // ("which part is on order, ETA?") and it's passed through to the backend so
  // the customer / shop / technician timelines all read the same explanation.
  const [progressNotes, setProgressNotes] = useState({});
  // Completion popup ("Repair completed successfully!") + the timer that leaves the
  // screen after it. The ref blocks a second save while one is in flight (a double tap lands
  // before progressBusy re-renders), so a completion is never posted twice.
  const [completedBanner, setCompletedBanner] = useState(false);
  const completionTimer = useRef(null);
  const progressInFlight = useRef(false);
  useEffect(() => () => { if (completionTimer.current) clearTimeout(completionTimer.current); }, []);

  const refreshProgress = useCallback(async () => {
    if (!ticketId) return;
    try {
      const rows = await listTicketEvents(ticketId);
      setTicketEvents(Array.isArray(rows) ? rows : []);
      const done = {};
      // Latest non-default note per row, keyed by status. We need this so
      // a re-opened ticket pre-fills the PARTS_REQUIRED input with what the
      // technician submitted last time (e.g. "Display + battery on order").
      const noteByKey = {};
      // Who marked each done row, so the checklist can say "Marked by shop"
      // on a step the owner closed from their Service History screen.
      const actorByKey = {};
      const atByKey = {};
      // A re-estimate restarts the checklist: steps marked before the latest
      // RE_ESTIMATED_CONFIRMED belong to the old quote and are not shown as done.
      const evTime = (e) => Math.max(
        new Date(e?.createdAt || 0).getTime() || 0,
        new Date(e?.updatedAt || 0).getTime() || 0,
      );
      const reEstimatedAt = (Array.isArray(rows) ? rows : [])
        .filter((e) => (e.status || '').toUpperCase() === 'RE_ESTIMATED_CONFIRMED')
        .reduce((max, e) => Math.max(max, evTime(e)), 0);
      // Only pre-tick rows a PERSON explicitly submitted:
      //   TECHNICIAN — this checklist
      //   OWNER      — the shop app's own action (Quality Check Completed)
      // Auto-emitted macro-status events carry actor=SHOP / SYSTEM and leave
      // the checkbox empty, so the technician still has to take those manually.
      (Array.isArray(rows) ? rows : []).forEach((e) => {
        const k = (e.status || '').toUpperCase();
        const actor = (e.actor || '').toUpperCase();
        const isProgressRow = PROGRESS_ROWS.some((r) => r.key === k);
        if (!isProgressRow) return;
        if (reEstimatedAt && evTime(e) < reEstimatedAt) return;
        if (actor === 'TECHNICIAN' || actor === 'OWNER') {
          done[k] = true;
          actorByKey[k] = actor;
        }
        atByKey[k] = e.createdAt;
        // Default label means the technician didn't type a custom note —
        // skip those so the input doesn't fill itself with "Spare Parts
        // Waiting" the next visit.
        const row = PROGRESS_ROWS.find((r) => r.key === k);
        if (e?.note && row && e.note !== row.label) noteByKey[k] = e.note;
      });
      setProgressDone(done);
      setProgressActor(actorByKey);
      setProgressAt(atByKey);
      setProgressNotes((prev) => ({ ...noteByKey, ...prev }));
      setEventsLoaded(true);
      markSync(null);
    } catch (e) { markSync(e); /* keep current */ }
  }, [ticketId, markSync]);

  useEffect(() => { refreshProgress(); }, [refreshProgress]);

  // Ticket re-read that leaves the photo slots alone — load() rebuilds them
  // from the response and would drop a picked-but-unsaved image.
  // Device thumbnail. Most tickets carry no deviceImageUrl of their own, so
  // fall back to the master-catalogue model image (brandId → models → modelId).
  const [deviceImage, setDeviceImage] = useState(null);
  const [deviceImageFailed, setDeviceImageFailed] = useState(false);
  useEffect(() => {
    if (!ticket) return undefined;
    let active = true;
    setDeviceImageFailed(false);
    const direct = resolveDeviceImageSource({
      url: ticket.deviceImageUrl || ticket.modelImageUrl,
      base64: ticket.deviceImageBase64 || ticket.modelImageBase64,
    });
    if (direct) { setDeviceImage(direct); return undefined; }
    if (!ticket.brandId || !ticket.modelId) { setDeviceImage(null); return undefined; }
    listModelsForBrand(ticket.brandId)
      .then((models) => {
        const m = (models || []).find((x) => x.id === ticket.modelId);
        if (active) setDeviceImage(resolveDeviceImageSource({ url: m?.imageUrl, base64: m?.imageBase64 }));
      })
      .catch(() => { if (active) setDeviceImage(null); });
    return () => { active = false; };
  }, [ticket?.id, ticket?.deviceImageUrl, ticket?.modelImageUrl, ticket?.brandId, ticket?.modelId]);

  const refreshTicket = useCallback(async () => {
    if (!ticketId) return;
    try { setTicket(await getTicket(ticketId)); markSync(null); } catch (e) { markSync(e); /* keep current */ }
  }, [ticketId, markSync]);

  // The shop can re-estimate and the customer can approve while the technician
  // is sitting on this screen, so re-pull the read-only data on every focus.
  // Those two timestamps are exactly what the block above Submitted Notes
  // shows; without this they'd stay frozen at whatever they were on mount.
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      refreshTicket();
      refreshNotes();
      refreshProgress();
    });
    return unsubscribe;
  }, [navigation, refreshTicket, refreshNotes, refreshProgress]);

  // Live Sync — see LIVE_SYNC_MS. Skipped while the app is in the background.
  useFocusEffect(useCallback(() => {
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      refreshTicket();
      refreshNotes();
      refreshProgress();
    }, LIVE_SYNC_MS);
    return () => clearInterval(id);
  }, [refreshTicket, refreshNotes, refreshProgress]));

  // Automatic steps, recorded once the screen holds a real read of the ticket,
  // its notes and its events (rules in utils/serviceProgress):
  //   Repair Work Started — IN_REPAIR once the job is accepted and the
  //     customer approval is current. Covers approvals that land after Accept
  //     (TaskAssign records it at Accept when approval is already in).
  //   Repair Photos Added — the complete note's uploads PATCHed onto the
  //     ticket, which makes the backend record "Technician Uploaded Device
  //     Images" on the shared timeline.
  // Each runs at most once per screen visit, so a failure can't turn into a
  // retry every Live Sync tick; Finish Repair re-checks Repair Work Started.
  const autoSent = useRef({ start: false, photos: false });
  useEffect(() => {
    // Never record steps on a job that isn't this employee's.
    if (!ticket || notMine || !eventsLoaded || !notesLoaded) return;
    const run = (label, request) => {
      setAutoSaving((n) => n + 1);
      request()
        .then(() => { refreshProgress(); refreshTicket(); })
        .catch((e) => { markSync(e); console.warn(`[progress] automatic ${label} failed`, e?.status, e?.message); })
        .finally(() => setAutoSaving((n) => n - 1));
    };
    if (!autoSent.current.start && shouldAutoStartRepair(ticket, ticketEvents)) {
      autoSent.current.start = true;
      run('Repair Work Started', () => postProgressEvent(ticketId, { statusKey: 'IN_REPAIR' }));
    }
    const photos = photosToSync(ticket, notesList);
    if (!autoSent.current.photos && photos) {
      autoSent.current.photos = true;
      run('Repair Photos Added', () => setTechnicianPhotos(ticketId, photos));
    }
  }, [ticket, notMine, ticketEvents, notesList, eventsLoaded, notesLoaded, ticketId, refreshProgress, refreshTicket, markSync]);

  // No READY from this app. Ready for Delivery is the backend's move on the
  // Quality Check (ticket-service work-status mapping); posting READY here as
  // well made the mirror write a second READY row and send the customer a
  // second "Ready for delivery" notification. Until that backend change is
  // live the shop marks Ready from the Partner app, as before.

  // Banner first, then back to the Job Report on its Completed list. popTo
  // returns to the Job Report already in the stack (or replaces this screen
  // with one); refreshAt re-applies the filter even if it was already set.
  const [bannerText, setBannerText] = useState('');
  const showCompletion = useCallback((message) => {
    setBannerText(message);
    setCompletedBanner(true);
    completionTimer.current = setTimeout(() => {
      completionTimer.current = null;
      navigation.popTo('TaskReport', { filter: 'Completed', refreshAt: Date.now() });
    }, COMPLETION_REDIRECT_MS);
  }, [navigation]);

  const submitProgress = useCallback(async (row, lockReason) => {
    if (lockReason) {
      notify('Step locked', lockReason);
      return;
    }
    if (progressInFlight.current || progressDone[row.key] || completedBanner) return;
    // PARTS_REQUIRED row requires the technician to spell out which part is
    // waiting; without it the customer / shop see no detail beyond the label.
    const rawNote = (progressNotes[row.key] || '').trim();
    if (row.key === 'PARTS_REQUIRED' && !rawNote) {
      notify('Add a note', 'Mention which spare part is on order so the customer and shop know what we\'re waiting for.');
      return;
    }
    // Rows in DEFAULT_PROGRESS_NOTE auto-attach the canonical sentence the
    // customer should read (e.g. "Your repair is not completed"); the
    // technician doesn't need to type anything.
    const noteToSend = rawNote || DEFAULT_PROGRESS_NOTE[row.key] || undefined;
    progressInFlight.current = true;
    setProgressBusy(row.key);
    try {
      await postProgressEvent(ticketId, {
        statusKey: row.key,
        note: noteToSend,
      });
      // Spare Parts Waiting shows as waiting only once the saved row is back,
      // so the form stays open until then instead of flashing closed.
      if (row.key === 'PARTS_REQUIRED') await refreshProgress();
      setProgressChecked((prev) => ({ ...prev, [row.key]: false }));
      // Tick the row now so it can't be tapped again before the re-fetch lands.
      setProgressDone((prev) => ({ ...prev, [row.key]: true }));
      setProgressActor((prev) => ({ ...prev, [row.key]: 'TECHNICIAN' }));
      refreshProgress();
      if (COMPLETION_MESSAGES[row.key]) {
        refreshTicket();
        showCompletion(COMPLETION_MESSAGES[row.key]);
      } else {
        notify('Saved', `"${row.label}" recorded.`);
      }
    } catch (e) {
      markSync(e);
      notify('Save failed', e?.message || 'Try again');
    } finally {
      progressInFlight.current = false;
      setProgressBusy(null);
    }
  }, [ticketId, progressNotes, refreshProgress, progressDone, completedBanner, refreshTicket, showCompletion, markSync]);

  // Quality Check — the technician's confirmation, recorded only after the
  // backend accepts it (it rejects anyone not allowed to post the step).
  const confirmQualityCheck = useCallback(async (row, lockReason) => {
    if (lockReason) { notify('Step locked', lockReason); return; }
    const ok = await confirm({
      title: 'Quality check completed?',
      message: 'Confirm the device passed the quality check. This is recorded on the Service History.',
      confirmText: 'Confirm',
    });
    if (ok) submitProgress(row, null);
  }, [submitProgress]);

  // Finish Repair — the only way to record Repair Completed. The lock (see
  // finishLock below) already holds it until the issue note is complete and
  // the customer approval is current; this re-reads the booking first so a
  // step recorded elsewhere meanwhile isn't posted twice, records Repair Work
  // Started if the automatic step never landed (keeps the timeline in order),
  // then Repair Completed. Ticks + banner only after the backend confirms.
  const finishRepair = useCallback(async (lockReason) => {
    if (lockReason) { notify('Finish Repair', lockReason); return; }
    if (progressInFlight.current || progressDone.REPAIR_COMPLETED || completedBanner) return;
    const ok = await confirm({
      title: 'Finish repair?',
      message: 'This records Repair Completed on the customer\'s Service History.',
      confirmText: 'Finish Repair',
    });
    if (!ok || progressInFlight.current) return;
    progressInFlight.current = true;
    setProgressBusy('REPAIR_COMPLETED');
    try {
      const [fresh, events] = await Promise.all([getTicket(ticketId), listTicketEvents(ticketId)]);
      if (!findEvent(currentEvents(events), 'REPAIR_COMPLETED')) {
        if (shouldAutoStartRepair(fresh, events)) {
          await postProgressEvent(ticketId, { statusKey: 'IN_REPAIR' });
        }
        await postProgressEvent(ticketId, { statusKey: 'REPAIR_COMPLETED' });
      }
      setProgressDone((prev) => ({ ...prev, REPAIR_COMPLETED: true }));
      setProgressActor((prev) => ({ ...prev, REPAIR_COMPLETED: 'TECHNICIAN' }));
      refreshProgress();
      refreshTicket();
      showCompletion(COMPLETION_MESSAGES.REPAIR_COMPLETED);
    } catch (e) {
      const detail = e?.status ? `${e.message || 'Failed'} (HTTP ${e.status})` : e?.message;
      markSync(e);
      notify('Could not finish repair', detail || 'No response from server. Try again.');
    } finally {
      progressInFlight.current = false;
      setProgressBusy(null);
    }
  }, [ticketId, progressDone, completedBanner, refreshProgress, refreshTicket, showCompletion, markSync]);

  // Resume Repair — the spare parts are in. See PARTS_RECEIVED_ENABLED.
  const resumeRepair = useCallback(async (waitEvent) => {
    if (progressInFlight.current || !waitEvent) return;
    progressInFlight.current = true;
    setProgressBusy('PARTS_RECEIVED');
    try {
      if (PARTS_RECEIVED_ENABLED) {
        await postProgressEvent(ticketId, { statusKey: 'PARTS_RECEIVED', note: 'Spare parts received — repair resumed' });
      } else {
        const reason = waitEvent.note && waitEvent.note !== 'Spare Parts Waiting' ? waitEvent.note : 'spare parts';
        await postProgressEvent(ticketId, {
          statusKey: 'PARTS_REQUIRED',
          note: `${PARTS_RECEIVED_MARK} ${fmtDateTime(new Date())}. Waited for: ${reason} (since ${fmtDateTime(waitEvent.createdAt)})`,
        });
      }
      await refreshProgress();
      notify('Repair resumed', 'Spare parts received.');
    } catch (e) {
      markSync(e);
      notify('Save failed', e?.message || 'Try again');
    } finally {
      progressInFlight.current = false;
      setProgressBusy(null);
    }
  }, [ticketId, refreshProgress, markSync]);

  // Parts Waiting — the compact form opened from its Next Action card. Saved
  // as the existing PARTS_REQUIRED step; part, reason, quantity and ETA ride in
  // its note, which every timeline (customer, shop, this one) shows.
  const [partsOpen, setPartsOpen] = useState(false);
  const [partsForm, setPartsForm] = useState(EMPTY_PARTS);
  const savePartsWaiting = useCallback(async () => {
    const name = partsForm.name.trim();
    const reason = partsForm.reason.trim();
    if (!name || !reason) { notify('Parts Waiting', 'Add the spare part name and why the repair is waiting.'); return; }
    if (progressInFlight.current) return;
    const qty = partsForm.qty.trim();
    const eta = fmtIsoDate(partsForm.eta);
    const note = [`Spare part: ${name}${qty ? ` × ${qty}` : ''}`, `Reason: ${reason}`, eta ? `ETA: ${eta}` : null]
      .filter(Boolean).join(' · ');
    progressInFlight.current = true;
    setProgressBusy('PARTS_REQUIRED');
    try {
      await postProgressEvent(ticketId, { statusKey: 'PARTS_REQUIRED', note });
      // Shown as waiting only once the saved row is back from the server.
      await refreshProgress();
      setPartsOpen(false);
      setPartsForm(EMPTY_PARTS);
      notify('Saved', 'Parts Waiting recorded.');
    } catch (e) {
      markSync(e);
      notify('Save failed', e?.message || 'Try again');
    } finally {
      progressInFlight.current = false;
      setProgressBusy(null);
    }
  }, [partsForm, ticketId, refreshProgress, markSync]);

  // Unable to Repair — the repair-failed path, kept apart from Finish Repair.
  // Same REPAIR_NOT_COMPLETED step as before (it doesn't move the ticket
  // status); the picked reason (+ any comment) rides in its note after the
  // canonical sentence the customer and shop read.
  const [unableOpen, setUnableOpen] = useState(false);
  const [unablePick, setUnablePick] = useState('');
  const [unableReason, setUnableReason] = useState('');
  const recordUnableToRepair = useCallback(async () => {
    const comment = unableReason.trim();
    if (!unablePick) { notify('Select a reason', 'Pick why the device cannot be repaired.'); return; }
    if (unablePick === 'Other' && !comment) { notify('Add a comment', 'Say why the repair could not be done.'); return; }
    const reason = unablePick === 'Other' ? comment : `${unablePick}${comment ? ` — ${comment}` : ''}`;
    if (progressInFlight.current) return;
    const ok = await confirm({
      title: 'Unable to repair?',
      message: 'This records Repair Not Completed on the customer\'s Service History.',
      confirmText: 'Record',
      destructive: true,
    });
    if (!ok || progressInFlight.current) return;
    progressInFlight.current = true;
    setProgressBusy('REPAIR_NOT_COMPLETED');
    try {
      await postProgressEvent(ticketId, {
        statusKey: 'REPAIR_NOT_COMPLETED',
        note: `${DEFAULT_PROGRESS_NOTE.REPAIR_NOT_COMPLETED}: ${reason}`,
      });
      await refreshProgress();
      setUnableOpen(false);
      setUnablePick('');
      setUnableReason('');
      notify('Saved', 'Recorded as unable to repair.');
    } catch (e) {
      markSync(e);
      notify('Save failed', e?.message || 'Try again');
    } finally {
      progressInFlight.current = false;
      setProgressBusy(null);
    }
  }, [unablePick, unableReason, ticketId, refreshProgress, markSync]);

  const devicePhotos = useMemo(
    () => parseDevicePhotos(ticket?.devicePhotosJson),
    [ticket?.devicePhotosJson],
  );

  // missingPartsJson is either a JSON array of strings (legacy) or of
  // {partId, name|partName|label, missing, damage} objects. Flatten to a
  // labels list so the card can render them as comma-separated chips.
  const missingPartsLabels = useMemo(() => {
    const arr = parseJsonArray(ticket?.missingPartsJson);
    return arr
      .map((it) => (it && typeof it === 'object'
        ? (it.label || it.name || it.partName)
        : String(it)))
      .filter(Boolean);
  }, [ticket?.missingPartsJson]);

  // Re-estimate + customer approval, read off the same booking events the
  // Service History rail renders:
  //   RE_ESTIMATED_CONFIRMED — the shop changed the price or the service list
  //   CUSTOMER_APPROVED      — the customer (or the shop on their behalf) signed off
  // Both are emit-or-update rows on the backend, so a repeat action refreshes
  // the existing row rather than inserting a new one; taking the LAST match
  // still guards against legacy tickets that carry duplicates.
  const estimateApproval = useMemo(() => {
    const latestOf = (key) => ticketEvents
      .filter((e) => (e.status || '').toUpperCase() === key)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      .pop() || null;
    const reEstimated = latestOf('RE_ESTIMATED_CONFIRMED');
    const approved = latestOf('CUSTOMER_APPROVED');
    // An approval older than the latest re-estimate belongs to the PREVIOUS
    // price — the backend clears customerApproval and re-prompts on a re-edit,
    // so that row must read as still-pending, not approved.
    const approvalIsCurrent = !!approved && (!reEstimated
      || new Date(approved.createdAt || 0) >= new Date(reEstimated.createdAt || 0));
    return { reEstimated, approved, approvalIsCurrent };
  }, [ticketEvents]);

  // Step-by-step gate for the Service Progress checklist: a row stays locked
  // until the steps before it on the Service History rail are recorded.
  // Returns { [rowKey]: reason } for locked rows; unlocked rows are absent.
  // State of the automatic rows, read off the backend's own records:
  //   workStarted   — an IN_REPAIR row on the current quote, from anyone
  //   issueVerified — a saved note with a description (the note save is what
  //                   writes Issue Verified & Updated on the timeline)
  //   photoCount    — photos uploaded on the best saved note, for "n of 2"
  const autoState = useMemo(() => {
    const cur = currentEvents(ticketEvents);
    const startEv = findEvent(cur, 'IN_REPAIR');
    const verifyEv = findEvent(ticketEvents, 'TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED');
    const photosEv = findEvent(ticketEvents, 'TECHNICIAN_UPLOADED_DEVICE_IMAGES');
    const firstNote = [...notesList]
      .filter((n) => String(n?.note || '').trim())
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))[0];
    const completeNote = notesList.find(noteIsComplete);
    const photoCount = savedNotePhotoCount(notesList);
    // *By: the event's actor role — the backend records no employee per row.
    return {
      workStarted: !!startEv,
      workStartedAt: startEv?.createdAt || null,
      workStartedBy: startEv?.actor || null,
      startBlocker: repairStartBlocker(ticket, ticketEvents),
      issueVerified: !!firstNote,
      issueVerifiedAt: verifyEv?.createdAt || firstNote?.createdAt || null,
      issueVerifiedBy: verifyEv?.actor || (firstNote ? 'TECHNICIAN' : null),
      photoCount,
      photosVerified: photoCount >= MIN_NOTE_PHOTOS,
      photosVerifiedAt: photosEv?.createdAt || completeNote?.createdAt || null,
      photosVerifiedBy: photosEv?.actor || (completeNote ? 'TECHNICIAN' : null),
      unableEvent: findEvent(cur, 'REPAIR_NOT_COMPLETED'),
      // Spare Parts Waiting, only as saved on the booking: the wait row, and
      // whether the parts have since arrived (PARTS_RECEIVED, or the wait row
      // re-saved as received — see PARTS_RECEIVED_MARK).
      partsEvent: findEvent(cur, 'PARTS_REQUIRED'),
      partsReceived: findEvent(cur, 'PARTS_RECEIVED')
        || (String(findEvent(cur, 'PARTS_REQUIRED')?.note || '').startsWith(PARTS_RECEIVED_MARK)
          ? findEvent(cur, 'PARTS_REQUIRED') : null),
    };
  }, [ticketEvents, notesList, ticket]);

  // Step-by-step gate for the rows a person records (manual + Finish Repair).
  // Returns { [rowKey]: reason } for locked rows; unlocked rows are absent.
  const progressLock = useMemo(() => {
    const verifyReason = !autoState.issueVerified ? 'Save the issue description first.' : null;
    // Same rule as the "Customer Approved" card: a legacy ticket carrying only
    // the customerApproval flag (no CUSTOMER_APPROVED event) counts as approved.
    const approvedNow = estimateApproval.approvalIsCurrent
      || (!estimateApproval.approved && ticket?.customerApproval === true);
    // The job can't be completed without a full issue note on file.
    const noteReason = verifyReason || (!notesList.some(noteIsComplete)
      ? `Upload at least ${MIN_NOTE_PHOTOS} photos with the issue note (${Math.min(autoState.photoCount, MIN_NOTE_PHOTOS)} of ${MIN_NOTE_PHOTOS}).`
      : null);
    const lock = {
      PARTS_REQUIRED: !autoState.workStarted ? (autoState.startBlocker || 'Starting repair work…') : null,
      // Spare parts only hold it while a saved wait is still open.
      REPAIR_COMPLETED: (!ticket?.technicianAcceptedAt ? 'Accept the task first.' : null)
        || (!approvedNow ? 'Waiting for customer approval.' : null) || noteReason
        || (autoState.partsEvent && !autoState.partsReceived ? 'Tap Resume Repair once the spare parts arrive.' : null),
      QUALITY_CHECK_COMPLETED: (!progressDone.REPAIR_COMPLETED ? 'Finish the repair first.' : null) || noteReason,
      REPAIR_NOT_COMPLETED: verifyReason,
    };
    Object.keys(lock).forEach((k) => { if (!lock[k] || progressDone[k]) delete lock[k]; });
    return lock;
  }, [autoState, notesList, estimateApproval, progressDone, ticket?.customerApproval, ticket?.technicianAcceptedAt]);

  // Estimate breakdown that the re-estimate produced. priceItemsJson always
  // holds the CURRENT quote, which after a re-estimate is the re-estimated one.
  const priceItems = useMemo(
    () => parsePriceItems(ticket?.priceItemsJson),
    [ticket?.priceItemsJson],
  );

  // ---------- Your-Side photo picker + submit ----------

  const pickPhoto = async (index, fromCamera = false) => {
    try {
    if (Platform.OS !== 'web') {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify(
          'Permission required',
          `Allow ${fromCamera ? 'camera' : 'photo library'} access to upload device images.`,
        );
        return;
      }
    }
    const opts = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
    };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setYourPhotos((prev) => {
      const next = [...prev];
      next[index] = { uri: asset.uri, remoteUrl: null, name: asset.fileName, type: asset.mimeType };
      return next;
    });
    } catch (e) {
      notify('Could not open camera/gallery', e?.message || 'Please try again.');
    }
  };

  const promptPickPhoto = (index) => {
    if (Platform.OS === 'web') {
      pickPhoto(index, false);
      return;
    }
    Alert.alert('Add device image', '', [
      { text: 'Take Photo', onPress: () => pickPhoto(index, true) },
      { text: 'Choose from Gallery', onPress: () => pickPhoto(index, false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removePhoto = (index) => {
    setYourPhotos((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  const submitPhotos = async () => {
    setPhotosSubmitting(true);
    try {
      const uploaded = [];
      for (const [index, photo] of yourPhotos.entries()) {
        if (!photo) continue;
        if (photo.remoteUrl) { uploaded.push(photo.remoteUrl); continue; }
        const res = await uploadMedia({
          uri: photo.uri, name: photo.name || 'tech-photo.jpg', type: photo.type || 'image/jpeg',
          // Flat prefix in the media bucket, as asked for:
          //   https://media.ggfix.in/tech-dev-img/<ticket>-<n>-<id>.jpg
          // The backend slugifies `folder` into ONE key segment, so the old
          // `tickets/<id>/technician` never nested — it landed on a single
          // tickets-<uuid>-technician directory. The ticket id moves into the
          // filename instead: with a shared folder it is the only thing tying an
          // object back to its ticket, and <n> keeps the three slots in order.
          folder: 'tech-dev-img',
          slot: `${ticketId}-${index + 1}`,
        });
        const url = res?.url || res?.secure_url || null;
        // Don't silently drop a photo: a missing URL on a 200 response usually
        // means media storage is misconfigured — surface it so the user
        // knows the photo wasn't actually saved.
        if (!url) throw new Error('Upload returned no URL');
        uploaded.push(url);
      }
      await setTechnicianPhotos(ticketId, uploaded);
      // Update slots from the URLs we just persisted instead of refetching —
      // this avoids a flicker (and avoids the appearance of "lost" photos if a
      // stale GET races the write). useFocusEffect / next mount will reconcile.
      const nextSlots = [null, null, null];
      uploaded.slice(0, 3).forEach((u, i) => { nextSlots[i] = { uri: u, remoteUrl: u }; });
      setYourPhotos(nextSlots);
      setPhotosEditing(uploaded.length === 0);
      refreshProgress();
      notify('Saved', 'Your device images have been uploaded.');
    } catch (e) {
      const msg = e?.message || 'Could not save photos';
      console.warn('[upload] device photos failed', e?.status, msg);
      notify('Upload failed', e?.status && !msg.includes('HTTP') ? `${msg} (HTTP ${e.status})` : msg);
    } finally {
      setPhotosSubmitting(false);
    }
  };

  // ---------- Compliance note submit ----------

  // Compliance image picker — same camera/gallery chooser pattern as the
  // Your-Side device images above. Takes the slot setter so the compose card
  // and the Submitted-Notes edit form share one picker instead of two copies
  // of the permission + launch dance.
  const pickImageInto = async (setSlots, index, fromCamera) => {
    try {
    if (Platform.OS !== 'web') {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify(
          'Permission required',
          `Allow ${fromCamera ? 'camera' : 'photo library'} access to attach images.`,
        );
        return;
      }
    }
    const opts = {
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
    };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setSlots((prev) => {
      const next = [...prev];
      // remoteUrl stays null so the save step knows this one still needs an
      // upload; slots restored from a saved note carry theirs already.
      next[index] = { uri: asset.uri, remoteUrl: null, name: asset.fileName, type: asset.mimeType };
      return next;
    });
    } catch (e) {
      notify('Could not open camera/gallery', e?.message || 'Please try again.');
    }
  };

  const promptPickImageInto = (setSlots, index) => {
    if (Platform.OS === 'web') { pickImageInto(setSlots, index, false); return; }
    Alert.alert('Add image', '', [
      { text: 'Take Photo', onPress: () => pickImageInto(setSlots, index, true) },
      { text: 'Choose from Gallery', onPress: () => pickImageInto(setSlots, index, false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeSlotFrom = (setSlots, index) => {
    setSlots((prev) => { const next = [...prev]; next[index] = null; return next; });
  };

  const promptPickNoteImage = (index) => promptPickImageInto(setNoteImages, index);
  const removeNoteImage = (index) => removeSlotFrom(setNoteImages, index);

  const startNoteRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        notify('Microphone needed', 'Allow microphone access to record a voice note.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setIsRecording(true);
    } catch (e) {
      notify('Could not start recording', e?.message || 'Please try again.');
    }
  };

  const stopNoteRecording = async () => {
    try {
      setIsRecording(false);
      const rec = recordingRef.current;
      if (!rec) return;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      if (!uri) return;
      setNoteAudioLocalUri(uri);
      // Upload immediately so by the time the user hits Save Note we already
      // have the hosted URL ready to attach. Matches owner-side flow.
      setUploadingAudio(true);
      try {
        const ext = (uri.split('.').pop() || 'm4a').toLowerCase();
        // Map to standard audio MIME subtypes ("m4a" is not a real MIME type —
        // an .m4a file is an MPEG-4 audio container, i.e. audio/mp4). The `audio/`
        // prefix is what the backend routes on, so any stricter whitelist still
        // sees a valid type.
        const AUDIO_MIME = {
          m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac',
          mp3: 'audio/mpeg', wav: 'audio/wav', '3gp': 'audio/3gpp', caf: 'audio/x-caf',
        };
        const res = await uploadMedia({
          uri,
          name: `note-${Date.now()}.${ext}`,
          type: AUDIO_MIME[ext] || `audio/${ext}`,
          folder: `tickets/${ticketId}/notes`,
        });
        const url = res?.url || res?.secure_url || null;
        if (!url) throw new Error('Upload returned no URL');
        setNoteAudioUrl(url);
      } catch (err) {
        notify('Upload failed', err?.message || 'Could not upload recording.');
      } finally {
        setUploadingAudio(false);
      }
    } catch (e) {
      notify('Could not stop recording', e?.message || 'Please try again.');
    }
  };

  const clearNoteAudio = async () => {
    try {
      if (playingId === 'draft' && soundRef.current) {
        try { await soundRef.current.unloadAsync(); } catch (_) {}
        soundRef.current = null;
        setPlayingId(null);
      }
    } catch (_) {}
    setNoteAudioLocalUri('');
    setNoteAudioUrl('');
  };

  // Playback for the draft recording OR any submitted note's audioUrl. The
  // single soundRef means only one clip plays at a time — pressing play on a
  // second clip stops the first.
  const togglePlayAudio = async (key, uri) => {
    try {
      if (playingId === key && soundRef.current) {
        await soundRef.current.pauseAsync();
        setPlayingId(null);
        return;
      }
      if (soundRef.current) {
        try { await soundRef.current.unloadAsync(); } catch (_) {}
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status?.didJustFinish) setPlayingId(null);
      });
      await sound.playAsync();
      setPlayingId(key);
    } catch (e) {
      notify('Playback failed', e?.message || 'Could not play this clip.');
    }
  };

  const submitNote = async () => {
    const trimmed = note.trim();
    if (!trimmed || noteImages.filter((s) => !!s?.uri).length < MIN_NOTE_PHOTOS) return;
    setNoteSubmitting(true);
    try {
      // Audio was uploaded synchronously when recording stopped; just use the
      // hosted URL. Images still upload here so the user can keep adding tiles
      // until submit.
      const audioUrl = noteAudioUrl || null;

      // Upload each populated image slot in order. Keeps slot order in the
      // saved list so the rendering on the notes list matches what the
      // technician saw at submit time.
      const imageUrls = [];
      for (const slot of noteImages) {
        if (!slot?.uri) continue;
        const res = await uploadMedia({
          uri: slot.uri,
          name: slot.name || `note-image-${Date.now()}.jpg`,
          type: slot.type || 'image/jpeg',
          folder: `tickets/${ticketId}/notes`,
        });
        const url = res?.url || res?.secure_url || null;
        if (!url) throw new Error('Image upload returned no URL');
        imageUrls.push(url);
      }

      await addRepairNote(ticketId, { note: trimmed, audioUrl, imageUrls });
      setNote('');
      setNoteAudioUrl('');
      setNoteAudioLocalUri('');
      setNoteImages([null, null, null]);
      // Backend emits TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED on note
      // submit; re-pull the notes list so the freshly-saved note shows under
      // Submit. The timeline rail on the owner/customer side updates on its
      // own refresh from the backend event we just emitted.
      refreshNotes();
      refreshProgress();
      notify('Note added', 'Your compliance note has been saved.');
    } catch (e) {
      // Surface the backend's actual message so a stale ticket-service or a
      // server-side validation error stops being hidden behind a generic
      // "Try again" string. e.status comes from ticketApi.client when the
      // response was an HTTP error; we include it so the user can tell a
      // network failure (status undefined) from a backend 5xx.
      const detail = e?.status ? `${e.message || 'Failed'} (HTTP ${e.status})` : e?.message;
      markSync(e);
      notify('Could not save note', detail || 'No response from server. Check that ticket-service is running.');
    } finally {
      setNoteSubmitting(false);
    }
  };

  // ---------- Submitted note edit ----------

  // Open one submitted note for editing. Existing photos come back as filled
  // slots that already carry their hosted URL, so saving without touching them
  // re-sends the same URLs and uploads nothing.
  const beginEditNote = (n) => {
    setEditingNoteId(n.id);
    setEditNoteText(n.note || '');
    const slots = [null, null, null];
    (Array.isArray(n.imageUrls) ? n.imageUrls : []).slice(0, 3).forEach((url, i) => {
      slots[i] = { uri: url, remoteUrl: url };
    });
    setEditNoteImages(slots);
    setEditNoteAudioUrl(n.audioUrl || '');
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditNoteText('');
    setEditNoteImages([null, null, null]);
    setEditNoteAudioUrl('');
  };

  const saveEditNote = async () => {
    const trimmed = editNoteText.trim();
    if (!trimmed || !editingNoteId || editNoteImages.filter((s) => !!s?.uri).length < MIN_NOTE_PHOTOS) return;
    setEditNoteSaving(true);
    try {
      // Same upload loop as submitNote, but slots restored from the saved note
      // already have a remoteUrl and are passed straight through.
      const imageUrls = [];
      for (const slot of editNoteImages) {
        if (!slot?.uri) continue;
        if (slot.remoteUrl) { imageUrls.push(slot.remoteUrl); continue; }
        const res = await uploadMedia({
          uri: slot.uri,
          name: slot.name || `note-image-${Date.now()}.jpg`,
          type: slot.type || 'image/jpeg',
          folder: `tickets/${ticketId}/notes`,
        });
        const url = res?.url || res?.secure_url || null;
        if (!url) throw new Error('Image upload returned no URL');
        imageUrls.push(url);
      }
      await updateRepairNote(ticketId, editingNoteId, {
        note: trimmed,
        audioUrl: editNoteAudioUrl || null,
        imageUrls,
      });
      cancelEditNote();
      refreshNotes();
      refreshProgress();
      notify('Note updated', 'Your changes have been saved.');
    } catch (e) {
      const detail = e?.status ? `${e.message || 'Failed'} (HTTP ${e.status})` : e?.message;
      markSync(e);
      notify('Could not update note', detail || 'No response from server.');
    } finally {
      setEditNoteSaving(false);
    }
  };

  // ---------- Solution pack: navigate to full-screen forms ----------

  // Defaults carry the ticket's brand/model/issue into the new screens so the
  // technician doesn't re-enter them. The reference screen treats null filters
  // as "match-any" so omissions widen the search rather than empty it.
  const solutionPackDefaults = useMemo(() => ({
    brand: ticket?.brandId ? { id: ticket.brandId, name: ticket.brandName } : null,
    model: ticket?.modelId ? { id: ticket.modelId, name: ticket.modelName } : null,
    issueCategory: null,
    issueSubcategory: null,
    deviceName: ticket?.deviceDisplayName || null,
  }), [ticket?.brandId, ticket?.modelId, ticket?.brandName, ticket?.modelName, ticket?.deviceDisplayName]);

  const openReferenceView = () => {
    navigation.navigate('SolutionPackReferenceView', { ticketId, defaults: solutionPackDefaults });
  };

  const openUploadScreen = () => {
    navigation.navigate('SolutionPackUpload', { ticketId, defaults: solutionPackDefaults });
  };

  if (loading && !ticket) {
    return (
      <View className="flex-1" style={{ backgroundColor: C.bg }}>
        <JobHeader navigation={navigation} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={C.green} />
        </View>
      </View>
    );
  }

  if (error || !ticket) {
    return (
      <View className="flex-1" style={{ backgroundColor: C.bg }}>
        <JobHeader navigation={navigation} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="font-bold mb-2" style={{ color: C.red }}>Job not found</Text>
          <Text className="text-center" style={{ fontSize: rf(12), color: C.muted }}>{error || 'Try again from the job list.'}</Text>
        </View>
      </View>
    );
  }

  if (notMine) {
    return (
      <View className="flex-1" style={{ backgroundColor: C.bg }}>
        <JobHeader navigation={navigation} />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="font-bold mb-2" style={{ color: C.ink }}>Not assigned to you</Text>
          <Text className="text-center" style={{ fontSize: rf(12), color: C.muted }}>
            This job is assigned to another employee. You can only open jobs assigned to you.
          </Text>
        </View>
      </View>
    );
  }

  // Delivered / cancelled job: Job Details turns read-only.
  const jobClosed = ['DELIVERED', 'CANCELLED'].includes(String(ticket.status || '').toUpperCase());
  // Quality Check Completed ends the Service Progress process: from then on
  // only the recorded steps are shown (Spare Parts Waiting / Repair Not
  // Completed drop out if they were never used) and nothing can be ticked.
  const progressClosed = !!progressDone.QUALITY_CHECK_COMPLETED;
  // Done state per checklist row: automatic rows from the backend's own
  // records (whoever wrote them), the rest from rows a person submitted.
  const rowDone = (key) => {
    if (key === 'NEXT_ACTION') return !!progressDone.REPAIR_COMPLETED;
    if (key === 'IN_REPAIR') return autoState.workStarted;
    if (key === 'ISSUE_VERIFIED') return autoState.issueVerified && autoState.photosVerified;
    if (key === 'PARTS_REQUIRED') return !!autoState.partsEvent;
    if (key === 'REPAIR_NOT_COMPLETED') return !!autoState.unableEvent;
    return !!progressDone[key];
  };
  // Rail colour: an unused Spare Parts Waiting row is optional, so it passes
  // the green rail through instead of showing as a missing step.
  const railDone = (key) => (key === 'PARTS_REQUIRED' && !autoState.partsEvent
    ? rowDone('ISSUE_VERIFIED')
    : rowDone(key));
  const partsWaiting = !!autoState.partsEvent && !autoState.partsReceived;
  // The saved wait reason, without the "parts received" prefix added on resume.
  const partsReason = (() => {
    const n = String(autoState.partsEvent?.note || '');
    if (!n || n === 'Spare Parts Waiting') return '';
    if (!n.startsWith(PARTS_RECEIVED_MARK)) return n;
    const i = n.indexOf('Waited for:');
    return i >= 0 ? n.slice(i) : '';
  })();
  // Who recorded a step. The backend stores only the actor's role per row, so
  // this is the role — or the assigned technician's name when the ticket has it.
  const who = (actor) => {
    const a = String(actor || '').toUpperCase();
    if (a === 'OWNER' || a === 'SHOP') return 'Shop';
    if (a === 'TECHNICIAN') return ticket.assignedTechnicianName || 'Technician';
    return '';
  };
  const stamp = (at, actor) => [fmtDateTime(at), who(actor)].filter(Boolean).join(' · ');
  const photosCount = `${Math.min(autoState.photoCount, MIN_NOTE_PHOTOS)}/${MIN_NOTE_PHOTOS} photos`;
  const finishLock = progressLock.REPAIR_COMPLETED || null;
  // One state per row — done / pending / waiting / locked / failed — plus the
  // line under its label: status, then the server time and who recorded it.
  const stepStatus = (key) => {
    const lock = progressLock[key];
    const done = (at, actor, lead = 'Completed') => ({ kind: 'done', text: [lead, stamp(at, actor)].filter(Boolean).join(' · ') });
    switch (key) {
      case 'IN_REPAIR':
        if (autoState.workStarted) return done(autoState.workStartedAt, autoState.workStartedBy);
        if (!ticket.technicianAcceptedAt) return { kind: 'pending', text: 'Pending · starts when you accept the task' };
        return autoState.startBlocker
          ? { kind: 'locked', text: 'Locked · waiting for customer approval' }
          : { kind: 'pending', text: 'Pending · starting…' };
      // Verified Issue & Repair Details: the description and the required
      // photos together; done at the later of the two saves.
      case 'ISSUE_VERIFIED': {
        if (autoState.issueVerified && autoState.photosVerified) {
          const photosLater = new Date(autoState.photosVerifiedAt || 0) > new Date(autoState.issueVerifiedAt || 0);
          return photosLater
            ? done(autoState.photosVerifiedAt, autoState.photosVerifiedBy, `Completed · ${photosCount}`)
            : done(autoState.issueVerifiedAt, autoState.issueVerifiedBy, `Completed · ${photosCount}`);
        }
        if (!autoState.issueVerified && !autoState.photosVerified) {
          return { kind: 'pending', text: `Pending · description and ${photosCount}` };
        }
        return autoState.issueVerified
          ? { kind: 'pending', text: `Pending · description saved · ${photosCount}` }
          : { kind: 'pending', text: `Pending · save the issue description · ${photosCount}` };
      }
      case 'PARTS_REQUIRED':
        if (autoState.partsReceived) return done(autoState.partsReceived.createdAt, autoState.partsReceived.actor, 'Parts received');
        if (partsWaiting) return { kind: 'waiting', text: `Waiting for parts · since ${fmtDateTime(autoState.partsEvent.createdAt)}` };
        if (progressChecked.PARTS_REQUIRED) return { kind: 'pending', text: 'Add which part is needed, then tap Save.' };
        return lock
          ? { kind: 'locked', text: 'Optional · unlocks when repair starts' }
          : { kind: 'pending', text: 'Optional · only if a spare part is needed' };
      case 'NEXT_ACTION':
        if (rowDone('REPAIR_COMPLETED')) return done(progressAt.REPAIR_COMPLETED, progressActor.REPAIR_COMPLETED, 'Repair finished');
        if (autoState.unableEvent) {
          return { kind: 'failed', text: ['Unable to repair', stamp(autoState.unableEvent.createdAt, autoState.unableEvent.actor)].filter(Boolean).join(' · ') };
        }
        if (!rowDone('IN_REPAIR')) return { kind: 'locked', text: 'Locked · unlocks after Repair Work Started' };
        if (!rowDone('ISSUE_VERIFIED')) return { kind: 'locked', text: `Locked · save the issue description and ${MIN_NOTE_PHOTOS} photos` };
        if (partsWaiting) return { kind: 'waiting', text: `Waiting for parts · since ${fmtDateTime(autoState.partsEvent.createdAt)}` };
        return { kind: 'pending', text: 'Choose what happens next' };
      case 'REPAIR_COMPLETED':
        if (rowDone(key)) return done(progressAt[key], progressActor[key]);
        // A failed repair is never shown as a completion.
        if (autoState.unableEvent) return { kind: 'locked', text: 'Not completed · the repair could not be done' };
        return finishLock
          ? { kind: 'locked', text: `Locked · ${finishLock}` }
          : { kind: 'pending', text: 'Pending · tap Finish Repair above' };
      case 'QUALITY_CHECK_COMPLETED':
        if (rowDone(key)) return done(progressAt[key], progressActor[key]);
        return lock
          ? { kind: 'locked', text: `Locked · ${lock}` }
          : { kind: 'pending', text: 'Pending · tick after checking the device' };
      case 'REPAIR_NOT_COMPLETED':
        return { kind: 'failed', text: ['Recorded', stamp(autoState.unableEvent?.createdAt, autoState.unableEvent?.actor)].filter(Boolean).join(' · ') };
      default:
        return { kind: 'pending', text: '' };
    }
  };
  const STATUS_COLOR = { done: C.green, pending: C.muted, waiting: C.yellowInk, locked: C.muted, failed: C.red };
  // The reason saved with Unable to Repair, without the canonical sentence.
  const unableReasonText = String(autoState.unableEvent?.note || '')
    .replace(new RegExp(`^${DEFAULT_PROGRESS_NOTE.REPAIR_NOT_COMPLETED}:?\\s*`), '');
  // Repair Not Completed shows only once recorded; after the Quality Check
  // only recorded steps remain.
  const visibleProgressRows = TIMELINE_ROWS.filter((r) => (progressClosed ? rowDone(r.key) : true));
  // Next Action: the three cards once both automatic steps are done, until the
  // repair is finished or recorded as unable to repair (then only the outcome).
  const nextUnlocked = rowDone('IN_REPAIR') && rowDone('ISSUE_VERIFIED');
  const canAct = nextUnlocked && !rowDone('REPAIR_COMPLETED') && !autoState.unableEvent && !progressClosed && !jobClosed;
  const partsLock = progressLock.PARTS_REQUIRED || null;
  const unableLock = progressLock.REPAIR_NOT_COMPLETED || null;
  const fieldStyle = {
    fontSize: rf(12), color: C.ink, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: C.border, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6,
  };
  const fieldLabel = (text, required) => (
    <Text className="font-bold" style={{ fontSize: rf(9.5), color: C.muted, marginBottom: 3, marginTop: 6 }}>
      {text}{required ? <Text style={{ color: C.red }}> *</Text> : null}
    </Text>
  );
  const formButtons = (onSave, onCancel, busyKey, color, label, disabled) => (
    <View className="flex-row items-center" style={{ marginTop: 8 }}>
      <TouchableOpacity
        onPress={onSave}
        disabled={progressBusy === busyKey || disabled}
        activeOpacity={0.85}
        className="rounded-full items-center justify-center"
        style={{ backgroundColor: color, paddingHorizontal: 16, paddingVertical: 6, minWidth: 74, opacity: progressBusy === busyKey || disabled ? 0.55 : 1 }}
      >
        {progressBusy === busyKey
          ? <ActivityIndicator color="#FFFFFF" size="small" />
          : <Text className="font-bold text-white" style={{ fontSize: rf(11) }}>{label}</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onCancel}
        disabled={progressBusy === busyKey}
        activeOpacity={0.8}
        className="rounded-full ml-2"
        style={{ borderWidth: 1, borderColor: C.line, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 6 }}
      >
        <Text className="font-bold" style={{ fontSize: rf(11), color: C.muted }}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
  const nextActionBody = (
    <View>
      {/* A saved parts wait (open or resumed): its details, and Resume Repair. */}
      {autoState.partsEvent ? (
        <View
          style={{
            marginTop: 6, borderRadius: 10, padding: 8, borderWidth: 1,
            backgroundColor: partsWaiting ? ACTION_TONE.amber.bg : C.surface,
            borderColor: partsWaiting ? ACTION_TONE.amber.line : C.border,
          }}
        >
          <View className="flex-row items-center">
            <Package size={13} color={partsWaiting ? ACTION_TONE.amber.fg : C.muted} />
            <Text className="font-bold ml-1.5" style={{ fontSize: rf(10.5), color: partsWaiting ? C.yellowInk : C.muted }} numberOfLines={1}>
              {partsWaiting
                ? `Parts waiting · since ${fmtDateTime(autoState.partsEvent.createdAt)}`
                : `Parts received · ${fmtDateTime(autoState.partsReceived?.createdAt)}`}
            </Text>
          </View>
          {partsReason ? <Text style={{ fontSize: rf(11), color: C.ink, marginTop: 3 }}>{partsReason}</Text> : null}
          {partsWaiting && canAct ? (
            <TouchableOpacity
              onPress={() => resumeRepair(autoState.partsEvent)}
              disabled={progressBusy === 'PARTS_RECEIVED'}
              activeOpacity={0.85}
              className="self-start rounded-full mt-2 flex-row items-center"
              style={{ backgroundColor: C.green, paddingHorizontal: 13, paddingVertical: 5, opacity: progressBusy === 'PARTS_RECEIVED' ? 0.6 : 1 }}
            >
              {progressBusy === 'PARTS_RECEIVED'
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text className="font-bold text-white" style={{ fontSize: rf(11) }}>Parts Received — Resume Repair</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Recorded failure: the reason, in place of the cards. */}
      {autoState.unableEvent ? (
        <View style={{ marginTop: 6, borderRadius: 10, padding: 8, borderWidth: 1, backgroundColor: ACTION_TONE.red.bg, borderColor: ACTION_TONE.red.line }}>
          <Text className="font-bold" style={{ fontSize: rf(10.5), color: C.red }}>Unable to repair</Text>
          {unableReasonText ? <Text style={{ fontSize: rf(11), color: C.ink, marginTop: 2 }}>{unableReasonText}</Text> : null}
        </View>
      ) : null}

      {canAct ? (
        <>
          <ActionCard
            tone={ACTION_TONE.green}
            Icon={CircleCheck}
            title="Finish Repair"
            subtitle={finishLock ? `Locked · ${finishLock}` : 'Mark the repair as completed.'}
            locked={!!finishLock}
            busy={progressBusy === 'REPAIR_COMPLETED'}
            onPress={() => finishRepair(finishLock)}
          />

          {!partsWaiting ? (
            <ActionCard
              tone={ACTION_TONE.amber}
              Icon={Package}
              title="Parts Waiting"
              subtitle={partsLock ? `Locked · ${partsLock}` : 'Add required spare part details.'}
              locked={!!partsLock}
              onPress={() => {
                if (partsLock) { notify('Parts Waiting', partsLock); return; }
                setUnableOpen(false);
                setPartsOpen((v) => !v);
              }}
            />
          ) : null}
          {partsOpen && !partsWaiting ? (
            <View style={{ marginTop: 6, borderRadius: 10, padding: 9, borderWidth: 1, backgroundColor: ACTION_TONE.amber.bg, borderColor: ACTION_TONE.amber.line }}>
              {fieldLabel('Spare part name', true)}
              <TextInput
                value={partsForm.name}
                onChangeText={(v) => setPartsForm((f) => ({ ...f, name: v }))}
                placeholder="e.g. Display assembly"
                placeholderTextColor={C.faint}
                editable={progressBusy !== 'PARTS_REQUIRED'}
                style={fieldStyle}
              />
              {fieldLabel('Waiting reason', true)}
              <TextInput
                value={partsForm.reason}
                onChangeText={(v) => setPartsForm((f) => ({ ...f, reason: v }))}
                placeholder="e.g. Out of stock, ordered from distributor"
                placeholderTextColor={C.faint}
                editable={progressBusy !== 'PARTS_REQUIRED'}
                multiline
                style={[fieldStyle, { minHeight: 44, textAlignVertical: 'top' }]}
              />
              <View className="flex-row" style={{ gap: 8 }}>
                <View style={{ flex: 1 }}>
                  {fieldLabel('Quantity')}
                  <TextInput
                    value={partsForm.qty}
                    onChangeText={(v) => setPartsForm((f) => ({ ...f, qty: v.replace(/[^0-9]/g, '').slice(0, 3) }))}
                    placeholder="1"
                    placeholderTextColor={C.faint}
                    keyboardType="number-pad"
                    editable={progressBusy !== 'PARTS_REQUIRED'}
                    style={fieldStyle}
                  />
                </View>
                <View style={{ flex: 1.6 }}>
                  {fieldLabel('Estimated arrival')}
                  <DatePickerField
                    value={partsForm.eta || null}
                    placeholder="Optional"
                    onChange={(v) => setPartsForm((f) => ({ ...f, eta: v || '' }))}
                    minimumDate={toISO(new Date())}
                    accent={C.green}
                    accentSoft={C.greenTint}
                  />
                </View>
              </View>
              {formButtons(
                savePartsWaiting,
                () => { setPartsOpen(false); setPartsForm(EMPTY_PARTS); },
                'PARTS_REQUIRED', C.yellowInk, 'Save',
                !partsForm.name.trim() || !partsForm.reason.trim(),
              )}
            </View>
          ) : null}

          <ActionCard
            tone={ACTION_TONE.red}
            Icon={X}
            title="Unable to Repair"
            subtitle={unableLock ? `Locked · ${unableLock}` : 'Select why the device cannot be repaired.'}
            locked={!!unableLock}
            onPress={() => {
              if (unableLock) { notify('Unable to Repair', unableLock); return; }
              setPartsOpen(false);
              setUnableOpen((v) => !v);
            }}
          />
          {unableOpen ? (
            <View style={{ marginTop: 6, borderRadius: 10, padding: 9, borderWidth: 1, backgroundColor: ACTION_TONE.red.bg, borderColor: ACTION_TONE.red.line }}>
              {fieldLabel('Reason', true)}
              <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                {UNABLE_REASONS.map((r) => {
                  const on = unablePick === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setUnablePick(on ? '' : r)}
                      disabled={progressBusy === 'REPAIR_NOT_COMPLETED'}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      className="rounded-full"
                      style={{
                        paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1,
                        backgroundColor: on ? C.red : '#FFFFFF', borderColor: on ? C.red : ACTION_TONE.red.line,
                      }}
                    >
                      <Text className="font-bold" style={{ fontSize: rf(10), color: on ? '#FFFFFF' : C.ink }}>{r}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {fieldLabel('Additional comments', unablePick === 'Other')}
              <TextInput
                value={unableReason}
                onChangeText={setUnableReason}
                multiline
                placeholder="e.g. No part available for this model."
                placeholderTextColor={C.faint}
                editable={progressBusy !== 'REPAIR_NOT_COMPLETED'}
                style={[fieldStyle, { minHeight: 44, textAlignVertical: 'top' }]}
              />
              {formButtons(
                recordUnableToRepair,
                () => { setUnableOpen(false); setUnablePick(''); setUnableReason(''); },
                'REPAIR_NOT_COMPLETED', C.red, 'Record',
                !unablePick || (unablePick === 'Other' && !unableReason.trim()),
              )}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
  // Add / Edit Report shortcut on the Issue Verified row (latest note first).
  const latestNote = notesList[0] || null;
  const openReport = () => {
    if (latestNote) {
      if (!editingNoteId) beginEditNote(latestNote);
      if (notesY.current != null) scrollRef.current?.scrollTo({ y: Math.max(0, notesY.current - 8), animated: true });
    } else if (composeY.current != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, composeY.current - 8), animated: true });
    }
  };
  const showReportAction = !jobClosed && !rowDone('REPAIR_COMPLETED');
  // Once the repair is finished (or the job is closed) the report is final:
  // the entry form and the editable notes give way to the read-only
  // Technician Repair Report — latest description, every saved photo.
  const reportLocked = jobClosed || rowDone('REPAIR_COMPLETED');
  const reportPhotos = [...new Set(notesList
    .flatMap((n) => (Array.isArray(n.imageUrls) ? n.imageUrls : []))
    .filter(Boolean))];
  const reportBadge = rowDone('REPAIR_COMPLETED') || String(ticket.status || '').toUpperCase() !== 'CANCELLED'
    ? 'Completed' : 'Closed';
  const showNotesList = !reportLocked && notesList.length > 0;
  // The technician report is the saved repair notes (description + uploaded
  // photos) — the same persisted data the Service Progress row and Finish
  // Repair read. A complete one replaces the blank compose form; it is shown
  // read-only under Repair Issue & Photos, and Edit Report opens it.
  const hasSavedReport = notesList.some(noteIsComplete);
  const hasIncompleteReport = !hasSavedReport && notesList.some((n) => String(n?.note || '').trim());
  const showCompose = !reportLocked && !hasSavedReport;
  // A step on record with no report behind it (e.g. notes removed on the
  // server): say so rather than show an empty form as if nothing was done.
  const reportMissing = notesLoaded && !notesList.some((n) => String(n?.note || '').trim())
    && (rowDone('REPAIR_COMPLETED') || !!findEvent(ticketEvents, 'TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED'));
  const syncBusy = !!progressBusy || noteSubmitting || editNoteSaving || autoSaving > 0;
  const syncBadge = syncBusy
    ? { label: 'Saving…', fg: C.yellowInk, bg: C.yellowTint }
    : syncState.status === 'synced'
    ? { label: `Synced · ${new Date(syncState.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}`, fg: C.green, bg: C.greenTint }
    : syncState.status === 'offline'
    ? { label: 'Offline', fg: C.muted, bg: C.surface }
    : syncState.status === 'failed'
    ? { label: 'Sync failed · retry', fg: C.red, bg: C.redTint }
    : null;
  const retrySync = () => { refreshTicket(); refreshNotes(); refreshProgress(); };
  // Description + at least MIN_NOTE_PHOTOS photos are mandatory; voice is optional.
  const notePhotoCount = noteImages.filter((s) => !!s?.uri).length;
  const notePhotosNeeded = Math.max(0, MIN_NOTE_PHOTOS - notePhotoCount);
  const noteDescMissing = !note.trim();
  const noteReady = !noteDescMissing && notePhotosNeeded === 0;
  // Field errors stay hidden until the technician starts the note, so an
  // untouched form doesn't open in red.
  const noteDirty = !!note || notePhotoCount > 0 || !!(noteAudioUrl || noteAudioLocalUri);
  const notePhotosMsg = notePhotosNeeded
    ? `Add ${notePhotosNeeded} more photo${notePhotosNeeded === 1 ? '' : 's'} (minimum ${MIN_NOTE_PHOTOS}).`
    : null;
  const editNoteReady = !!editNoteText.trim()
    && editNoteImages.filter((s) => !!s?.uri).length >= MIN_NOTE_PHOTOS;
  // Repair Completed ticked (or job closed): Solution Packs drop out.
  const showSolutionPacks = !progressDone.REPAIR_COMPLETED && !progressClosed && !jobClosed;
  const noteSubmitBlocked = noteSubmitting || !noteReady || isRecording || uploadingAudio;
  const noteAttachmentCount =
    ((noteAudioUrl || noteAudioLocalUri) ? 1 : 0)
    + noteImages.filter((s) => !!s?.uri).length;
  const recSeconds = Math.floor(recordingMs / 1000);
  const recLabel = `${String(Math.floor(recSeconds / 60)).padStart(2, '0')}:${String(recSeconds % 60).padStart(2, '0')}`;

  // One saved technician note: inline edit form while open, else read-only
  // (description, voice, its photos and their count) with Edit.
  const renderSavedNote = (n) => {
    const imgs = [...new Set((Array.isArray(n.imageUrls) ? n.imageUrls : []).filter(Boolean))];
    const audioKey = `note-${n.id}`;
    const editing = editingNoteId === n.id;
    // updated_at is DB-defaulted to the insert instant, so a note
    // that was never edited has the two within a tick of each
    // other. Only a real gap counts as an edit.
    const edited = n.updatedAt && n.createdAt
      && (new Date(n.updatedAt) - new Date(n.createdAt)) > 2000;
    return (
      <View
        key={n.id}
        className="flex-row"
        style={{
          backgroundColor: '#FFFFFF', borderRadius: 12, padding: 10, marginBottom: 8,
          borderWidth: 1, borderColor: editing ? C.yellowLine : C.border,
        }}
      >
        <View
          style={{
            width: 3, borderRadius: 2, marginRight: 9,
            backgroundColor: editing ? C.yellow : C.green,
          }}
        />
        {editing ? (
          /* ---- Edit mode: text, attachments, Save / Cancel ---- */
          <View className="flex-1">
            <Text
              className="font-bold uppercase tracking-wider mb-1.5"
              style={{ fontSize: rf(9.5), color: C.muted }}
            >
              Editing note
            </Text>
            <TextInput
              value={editNoteText}
              onChangeText={setEditNoteText}
              multiline
              placeholder="Update what you recorded for this ticket."
              placeholderTextColor={C.faint}
              style={{
                fontSize: rf(12), color: C.ink,
                backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
                borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
                minHeight: 68, textAlignVertical: 'top',
              }}
            />

            {/* Voice note: playable, removable. Re-recording is
                done by removing this clip and submitting a new
                note — the recorder above belongs to the compose
                card and can only hold one draft at a time. */}
            {editNoteAudioUrl ? (
              <View className="flex-row items-center mt-2">
                <TouchableOpacity
                  onPress={() => togglePlayAudio(`edit-${n.id}`, editNoteAudioUrl)}
                  activeOpacity={0.8}
                  className="flex-row items-center rounded-full px-2.5 py-1"
                  style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.bg }}
                >
                  {playingId === `edit-${n.id}`
                    ? <Pause size={12} color={C.ink} />
                    : <Play size={12} color={C.ink} />}
                  <Text className="font-bold ml-1" style={{ fontSize: rf(11), color: C.ink }}>Voice note</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEditNoteAudioUrl('')}
                  hitSlop={8}
                  activeOpacity={0.8}
                  className="flex-row items-center rounded-full px-2.5 py-1 ml-2"
                  style={{ backgroundColor: C.redTint }}
                >
                  <Trash2 size={11} color={C.red} />
                  <Text className="font-bold ml-1" style={{ fontSize: rf(10.5), color: C.red }}>
                    Remove
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View className="flex-row -mx-1 mt-2">
              {editNoteImages.map((slot, i) => (
                <View key={i} className="flex-1 px-1">
                  {slot ? (
                    <View
                      className="overflow-hidden"
                      style={{ height: 68, borderRadius: 10, backgroundColor: C.surface }}
                    >
                      <Image source={{ uri: slot.uri }} style={{ width: '100%', height: '100%' }} />
                      <TouchableOpacity
                        onPress={() => removeSlotFrom(setEditNoteImages, i)}
                        hitSlop={8}
                        style={{
                          position: 'absolute', top: 4, right: 4,
                          backgroundColor: 'rgba(30,30,30,0.75)', borderRadius: 10, padding: 3,
                        }}
                      >
                        <X size={11} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <AddPhotoSlot
                      onPress={() => promptPickImageInto(setEditNoteImages, i)}
                      height={68}
                      required={i < MIN_NOTE_PHOTOS}
                    />
                  )}
                </View>
              ))}
            </View>

            <View className="flex-row mt-2.5">
              <TouchableOpacity
                onPress={cancelEditNote}
                disabled={editNoteSaving}
                activeOpacity={0.8}
                className="items-center justify-center px-4 mr-2"
                style={{ borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.line, backgroundColor: '#FFFFFF' }}
              >
                <Text className="font-bold" style={{ fontSize: rf(12), color: C.muted }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveEditNote}
                disabled={editNoteSaving || !editNoteReady}
                activeOpacity={0.85}
                className="flex-1 items-center justify-center"
                style={{
                  backgroundColor: C.green, borderRadius: 10, paddingVertical: 8,
                  opacity: editNoteSaving || !editNoteReady ? 0.5 : 1,
                }}
              >
                {editNoteSaving
                  ? <ActivityIndicator color="#FFFFFF" />
                  : (
                    <Text className="text-white font-bold" style={{ fontSize: rf(12) }}>
                      Save Changes
                    </Text>
                  )}
              </TouchableOpacity>
            </View>
            {!editNoteReady && !editNoteSaving ? (
              <Text style={{ fontSize: rf(10), color: C.red, marginTop: 6 }}>
                Description and at least {MIN_NOTE_PHOTOS} photos are required.
              </Text>
            ) : null}
          </View>
        ) : (
          /* ---- Read-only ---- */
          <View className="flex-1">
            <View className="flex-row items-start">
              <Text className="flex-1 pr-2" style={{ fontSize: rf(12), color: C.ink }}>{n.note}</Text>
              {/* Disabled while another note is open for editing so
                  two drafts can't fight over the single edit slot. */}
              {!jobClosed ? (
              <TouchableOpacity
                onPress={() => beginEditNote(n)}
                disabled={!!editingNoteId}
                hitSlop={8}
                activeOpacity={0.8}
                className="flex-row items-center rounded-full px-2.5 py-1"
                style={{ backgroundColor: C.greenTint, opacity: editingNoteId ? 0.4 : 1 }}
              >
                <Pencil size={11} color={C.green} />
                <Text className="font-bold ml-1" style={{ fontSize: rf(10.5), color: C.green }}>
                  Edit
                </Text>
              </TouchableOpacity>
              ) : null}
            </View>
            {n.audioUrl ? (
              <View className="flex-row items-center mt-2">
                <TouchableOpacity
                  onPress={() => togglePlayAudio(audioKey, n.audioUrl)}
                  activeOpacity={0.8}
                  className="flex-row items-center rounded-full px-2.5 py-1"
                  style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.bg }}
                >
                  {playingId === audioKey
                    ? <Pause size={12} color={C.ink} />
                    : <Play size={12} color={C.ink} />}
                  <Text className="font-bold ml-1" style={{ fontSize: rf(11), color: C.ink }}>Voice note</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {imgs.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
                <View className="flex-row">
                  {imgs.map((u, j) => (
                    <Image
                      key={j}
                      source={{ uri: u }}
                      style={{ width: 52, height: 52, borderRadius: 8, marginRight: 6 }}
                    />
                  ))}
                </View>
              </ScrollView>
            ) : null}
            <Text style={{ fontSize: rf(10), color: C.muted, marginTop: 5 }}>
              {fmtDateTime(n.createdAt)}
              {edited ? `  ·  Edited ${fmtDateTime(n.updatedAt)}` : ''}
              {`  ·  ${Math.min(imgs.length, 3)}/3 photos`}
            </Text>
          </View>
        )}
      </View>
    );
  };

  // Re-estimate / approval block above Submitted Notes. Rendered as soon as
  // either half exists — a plain first-time approval with no re-estimate is
  // still a date the technician needs.
  const showEstimateBlock = !!(estimateApproval.reEstimated || estimateApproval.approved);
  const estimatedPriceLabel = formatINR(ticket.estimatedPrice);
  // Three approval states, worked out here rather than as nested ternaries in
  // the JSX: approved for the current estimate / approved on a ticket old
  // enough to predate the CUSTOMER_APPROVED event (flag only, no timestamp) /
  // still waiting.
  const approvalRowProps = estimateApproval.approvalIsCurrent
    ? {
        icon: BadgeCheck, tint: C.greenTint, iconColor: C.green,
        title: 'Customer Approved',
        pill: 'APPROVED', pillTint: C.greenTint, pillColor: C.green,
        when: fmtDateTime(estimateApproval.approved.createdAt) || 'Date not recorded',
        whenColor: C.green,
        note: estimateApproval.approved.note,
      }
    : (!estimateApproval.approved && ticket.customerApproval === true)
    ? {
        icon: BadgeCheck, tint: C.greenTint, iconColor: C.green,
        title: 'Customer Approved',
        pill: 'APPROVED', pillTint: C.greenTint, pillColor: C.green,
        when: 'Approval date not recorded', whenColor: C.green,
        note: 'This booking was approved before approval times were tracked.',
      }
    : {
        icon: Hourglass, tint: C.yellowTint, iconColor: C.yellowInk,
        title: 'Customer Approval',
        pill: 'PENDING', pillTint: C.yellowTint, pillColor: C.yellowInk,
        when: 'Not approved yet', whenColor: C.yellowInk,
        note: estimateApproval.approved
          ? `Approved on ${fmtDateTime(estimateApproval.approved.createdAt)}, but that was for the earlier estimate.`
          : 'Waiting for the customer to approve this estimate.',
      };

  return (
    <View className="flex-1" style={{ backgroundColor: C.bg }}>
      <JobHeader navigation={navigation} sub={ticketRef(ticket)} />
      {/* No tab bar on this screen, so clear the system nav bar ourselves. */}
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 10, paddingBottom: 32 + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Device card: photo, then Model Name / Model Number / Storage one per
            line, and the issue in full (no truncation). */}
        <Card>
          <View className="flex-row items-start">
            {deviceImage && !deviceImageFailed ? (
              <Image
                source={{ uri: deviceImage }}
                resizeMode="contain"
                onError={() => setDeviceImageFailed(true)}
                style={{ width: 56, height: 68, borderRadius: 10, backgroundColor: C.surface }}
              />
            ) : (
              <View
                style={{ width: 56, height: 68, borderRadius: 10, backgroundColor: C.surface }}
                className="items-center justify-center"
              >
                <Smartphone size={24} color={C.faint} />
              </View>
            )}
            <View className="flex-1" style={{ marginLeft: 12 }}>
              <InfoLine first label="Model Name" value={deviceParts(ticket).name} />
              <InfoLine label="Model Number" value={deviceParts(ticket).number} />
              <InfoLine label="Storage" value={deviceParts(ticket).storage} />
              <InfoLine label="Issue" value={ticket.issueDescription || ticket.repairServicesSummary || '—'} />
            </View>
          </View>
        </Card>

        {/* Device summary: customer images, security and missing / damage
            parts listed in one card, one icon row each. */}
        <SectionHeader title="Device Summary" />
        <Card>
          {/* Customer device images row */}
          <View className="flex-row">
            <View
              className="rounded-full items-center justify-center"
              style={{ width: 28, height: 28, backgroundColor: C.greenTint }}
            >
              <ImageIcon size={14} color={C.green} />
            </View>
            <View className="flex-1" style={{ marginLeft: 10 }}>
              <Text className="font-bold uppercase tracking-wider" style={{ fontSize: rf(9.5), color: C.muted }}>
                Customer Device Images
              </Text>
              {devicePhotos.length === 0 ? (
                <Text className="font-bold mt-0.5" style={{ fontSize: rf(12), color: C.muted }}>No images uploaded yet</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <View className="flex-row">
                    {devicePhotos.map((url, i) => (
                      <Pressable key={i} onPress={() => setPhotoAt(i)}>
                        <Image
                          source={{ uri: url }}
                          style={{ width: 56, height: 62, borderRadius: 10, marginRight: 8, backgroundColor: C.surface }}
                        />
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: C.surface, marginVertical: 8 }} />

          {/* Security row */}
          <View className="flex-row items-center">
            <View
              className="rounded-full items-center justify-center"
              style={{ width: 28, height: 28, backgroundColor: C.greenTint }}
            >
              <ShieldCheck size={14} color={C.green} />
            </View>
            <View className="flex-1" style={{ marginLeft: 10 }}>
              <Text className="font-bold uppercase tracking-wider" style={{ fontSize: rf(9.5), color: C.muted }}>
                Device Security
              </Text>
              {ticket.deviceSecurityType && ticket.deviceSecurityType !== 'NONE' ? (
                <View className="flex-row items-center mt-0.5">
                  <Text className="font-bold" style={{ fontSize: rf(12), color: C.ink }}>
                    {ticket.deviceSecurityType}
                  </Text>
                  <Text className="font-bold mx-1" style={{ fontSize: rf(12), color: C.ink }}>·</Text>
                  <Text
                    className="font-bold"
                    style={{ fontSize: rf(12), color: C.ink, letterSpacing: 1 }}
                  >
                    {ticket.deviceSecurityValue || '—'}
                  </Text>
                </View>
              ) : (
                <Text className="font-bold mt-0.5" style={{ fontSize: rf(12), color: C.muted }}>No lock set</Text>
              )}
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: C.surface, marginVertical: 8 }} />

          {/* Missing / Damage parts row */}
          <View className="flex-row">
            <View
              className="rounded-full items-center justify-center"
              style={{ width: 28, height: 28, backgroundColor: C.redTint }}
            >
              <PackageX size={14} color={C.red} />
            </View>
            <View className="flex-1" style={{ marginLeft: 10 }}>
              <Text className="font-bold uppercase tracking-wider" style={{ fontSize: rf(9.5), color: C.muted }}>
                Missing / Damage Parts
              </Text>
              {missingPartsLabels.length > 0 ? (
                <View className="flex-row flex-wrap mt-1 -mx-0.5">
                  {missingPartsLabels.map((label, i) => (
                    <View
                      key={`${label}-${i}`}
                      className="rounded-full px-2 py-0.5 mx-0.5 mb-1"
                      style={{ backgroundColor: C.redTint, borderWidth: 1, borderColor: C.redLine }}
                    >
                      <Text className="font-bold" style={{ fontSize: rf(10.5), color: C.red }}>
                        {label}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="font-bold mt-0.5" style={{ fontSize: rf(12), color: C.muted }}>Nil</Text>
              )}
            </View>
          </View>
        </Card>

        {/* Finished repair / closed job: the note / voice / image entry form is
            hidden — the Technician Repair Report below shows what was saved. */}
        {reportMissing ? (
          <View
            style={{
              backgroundColor: C.redTint, borderWidth: 1, borderColor: C.redLine, borderRadius: 12,
              padding: 10, marginBottom: 10,
            }}
          >
            <Text className="font-bold" style={{ fontSize: rf(12), color: C.red }}>Report data not found</Text>
            <Text style={{ fontSize: rf(11), color: C.ink, marginTop: 2 }}>
              The Service History has a technician report step for this job, but no saved issue description or photos were returned. Pull down to refresh; if it stays missing, ask the shop to check the job.
            </Text>
          </View>
        ) : null}
        {showCompose ? (
          <>
        {/* Compliance Notes — single card with the textarea, voice-note row,
            three image slots, and a full-width "Save Note" CTA at the bottom. */}
        <View onLayout={(e) => { composeY.current = e.nativeEvent.layout.y; }} />
        <SectionHeader title="Technician Issue Verified & Updated" accent={C.yellow} />
        <Card>
          {hasIncompleteReport ? (
            <Text style={{ fontSize: rf(10.5), color: C.yellowInk, marginBottom: 6 }}>
              Your saved report needs at least {MIN_NOTE_PHOTOS} photos — tap Edit on it under Repair Issue & Photos, or save a new report here.
            </Text>
          ) : null}
          <Text className="font-bold tracking-widest" style={{ fontSize: rf(9.5), color: C.muted, marginBottom: 5 }}>
            ISSUE DESCRIPTION <Text style={{ color: C.red }}>*</Text>
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Describe the issue you verified — what was found, what's been updated, anything the customer should know."
            placeholderTextColor={C.faint}
            style={{
              fontSize: rf(12), color: C.ink,
              backgroundColor: C.bg, borderWidth: 1,
              borderColor: noteDirty && noteDescMissing ? C.redLine : C.border,
              borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
              minHeight: 60, textAlignVertical: 'top',
            }}
          />
          {noteDirty && noteDescMissing ? (
            <Text style={{ fontSize: rf(10), color: C.red, marginTop: 4 }}>Issue description is required.</Text>
          ) : null}

          {/* Voice note recorder — three visual states:
                (a) idle, no clip → green "Record voice note" button
                (b) recording     → red dot + mm:ss timer + Stop button
                (c) clip ready    → play/pause + status + remove */}
          <Text className="font-bold tracking-widest" style={{ fontSize: rf(9.5), color: C.muted, marginTop: 10, marginBottom: 5 }}>
            VOICE NOTE (OPTIONAL)
          </Text>
          {isRecording ? (
            <View
              className="flex-row items-center rounded-xl px-2.5 py-2"
              style={{ backgroundColor: C.redTint, borderWidth: 1, borderColor: C.redLine }}
            >
              <View className="h-2.5 w-2.5 rounded-full mr-2" style={{ backgroundColor: C.red }} />
              <View className="flex-1">
                <Text className="font-bold" style={{ fontSize: rf(11.5), color: C.red }}>Recording…</Text>
                <Text className="font-bold" style={{ fontSize: rf(10.5), color: C.red }}>{recLabel}</Text>
              </View>
              <TouchableOpacity
                onPress={stopNoteRecording}
                activeOpacity={0.85}
                className="flex-row items-center rounded-full px-3 py-1.5"
                style={{ backgroundColor: C.red }}
              >
                <Square size={11} color="#FFFFFF" fill="#FFFFFF" />
                <Text className="text-white font-bold ml-1.5" style={{ fontSize: rf(11.5) }}>Stop</Text>
              </TouchableOpacity>
            </View>
          ) : (noteAudioUrl || noteAudioLocalUri) ? (
            <View
              className="flex-row items-center rounded-xl px-2.5 py-2"
              style={{ backgroundColor: C.greenSoft, borderWidth: 1, borderColor: C.greenLine }}
            >
              <TouchableOpacity
                onPress={() => togglePlayAudio('draft', noteAudioUrl || noteAudioLocalUri)}
                disabled={uploadingAudio}
                activeOpacity={0.85}
                className="rounded-full items-center justify-center"
                style={{ width: 34, height: 34, backgroundColor: C.green, opacity: uploadingAudio ? 0.6 : 1 }}
              >
                {playingId === 'draft'
                  ? <Pause size={15} color="#FFFFFF" />
                  : <Play size={15} color="#FFFFFF" />}
              </TouchableOpacity>
              <View className="flex-1 ml-2.5">
                <Text className="font-bold" style={{ fontSize: rf(12), color: C.ink }}>Voice note attached</Text>
                <Text style={{ fontSize: rf(10), color: C.muted }}>
                  {uploadingAudio
                    ? 'Uploading to cloud…'
                    : (noteAudioUrl ? 'Uploaded · tap play to preview' : 'Tap play to preview')}
                </Text>
              </View>
              {uploadingAudio ? (
                <ActivityIndicator color={C.green} />
              ) : (
                <TouchableOpacity
                  onPress={clearNoteAudio}
                  activeOpacity={0.8}
                  className="rounded-full items-center justify-center"
                  style={{ width: 30, height: 30, backgroundColor: C.redTint }}
                  hitSlop={6}
                >
                  <Trash2 size={13} color={C.red} />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity
              onPress={startNoteRecording}
              activeOpacity={0.85}
              className="flex-row items-center justify-center"
              style={{ backgroundColor: C.green, borderRadius: 12, paddingVertical: 8 }}
            >
              <Mic size={15} color="#FFFFFF" />
              <Text className="text-white font-bold ml-2" style={{ fontSize: rf(12) }}>Record voice note</Text>
            </TouchableOpacity>
          )}

          {/* Image attachments — small label row, then the three preview
              tiles directly below. Each empty tile is tappable so the
              technician can pick a specific slot to fill. */}
          {(() => {
            const filled = notePhotoCount;
            return (
              <>
                <View className="flex-row items-center justify-between" style={{ marginTop: 10, marginBottom: 5 }}>
                  <Text className="font-bold uppercase tracking-wider" style={{ fontSize: rf(9.5), color: C.muted }}>
                    Attach Photos <Text style={{ color: C.red }}>*</Text>
                  </Text>
                  <Text className="font-bold" style={{ fontSize: rf(10), color: notePhotosNeeded ? C.muted : C.green }}>
                    {filled}/3 · min {MIN_NOTE_PHOTOS}
                  </Text>
                </View>
                <View className="flex-row -mx-1">
                  {noteImages.map((slot, i) => (
                    <View key={i} className="flex-1 px-1">
                      {slot ? (
                        <View
                          className="overflow-hidden"
                          style={{ height: 68, borderRadius: 12, backgroundColor: C.surface }}
                        >
                          <Image source={{ uri: slot.uri }} style={{ width: '100%', height: '100%' }} />
                          <TouchableOpacity
                            onPress={() => removeNoteImage(i)}
                            hitSlop={8}
                            style={{
                              position: 'absolute', top: 5, right: 5,
                              backgroundColor: 'rgba(30,30,30,0.75)', borderRadius: 12, padding: 3,
                            }}
                          >
                            <X size={12} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <AddPhotoSlot onPress={() => promptPickNoteImage(i)} height={68} required={i < MIN_NOTE_PHOTOS} />
                      )}
                    </View>
                  ))}
                </View>
                {noteDirty && notePhotosMsg ? (
                  <Text style={{ fontSize: rf(10), color: C.red, marginTop: 4 }}>{notePhotosMsg}</Text>
                ) : null}
              </>
            );
          })()}

          {/* Full-width primary CTA */}
          <TouchableOpacity
            onPress={submitNote}
            disabled={noteSubmitBlocked}
            activeOpacity={0.85}
            className="items-center justify-center"
            style={{
              backgroundColor: C.green, borderRadius: 12,
              paddingVertical: 9, marginTop: 10,
              opacity: noteSubmitBlocked ? 0.5 : 1,
            }}
          >
            {noteSubmitting
              ? <ActivityIndicator color="#FFFFFF" />
              : (
                <Text className="text-white font-bold" style={{ fontSize: rf(12.5) }}>
                  Save Note{noteAttachmentCount ? ` (+${noteAttachmentCount} ${noteAttachmentCount === 1 ? 'attachment' : 'attachments'})` : ''}
                </Text>
              )}
          </TouchableOpacity>
          {noteSubmitBlocked && !noteSubmitting && (noteDirty || isRecording) ? (
            <Text className="text-center" style={{ fontSize: rf(10), color: C.muted, marginTop: 6 }}>
              {uploadingAudio
                ? 'Uploading voice note…'
                : isRecording
                ? 'Stop the recording first.'
                : !noteReady
                ? `${[noteDescMissing ? 'Issue description is required.' : null, notePhotosMsg].filter(Boolean).join(' ')} Voice is optional.`
                : null}
            </Text>
          ) : null}
        </Card>
          </>
        ) : null}

        {/* Previously-submitted notes — each rendered as a left-accented
            card so the technician can re-read what they've recorded. The
            re-estimate / approval pair sits at the top of the same section:
            it is the context the notes below were written against, and the
            technician must not start work on a price the customer hasn't
            signed off on yet. */}
        {/* After completion: the read-only Technician Repair Report — the
            verified issue and repair details (latest saved description, its
            voice note) and every evidence photo saved with the notes. */}
        {reportLocked ? (
          <>
            <SectionHeader
              title="Technician Repair Report"
              accent={C.green}
              right={(
                <View className="flex-row items-center rounded-full px-2 py-0.5" style={{ backgroundColor: C.greenTint }}>
                  <Check size={11} color={C.green} strokeWidth={3} />
                  <Text className="font-bold ml-1" style={{ fontSize: rf(10), color: C.green }}>{reportBadge}</Text>
                </View>
              )}
            />
            <Card>
              <Text className="font-bold" style={{ fontSize: rf(12), color: '#1C3053' }}>Verified Issue & Repair Details</Text>
              <Text style={{ fontSize: rf(12.5), lineHeight: rf(18), color: latestNote?.note?.trim() ? C.ink : C.muted, marginTop: 4 }}>
                {latestNote?.note?.trim() || 'No repair description recorded.'}
              </Text>
              {latestNote?.audioUrl ? (
                <TouchableOpacity
                  onPress={() => togglePlayAudio('report', latestNote.audioUrl)}
                  activeOpacity={0.8}
                  className="flex-row items-center self-start rounded-full px-2.5 py-1 mt-2"
                  style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.bg }}
                >
                  {playingId === 'report' ? <Pause size={12} color={C.ink} /> : <Play size={12} color={C.ink} />}
                  <Text className="font-bold ml-1" style={{ fontSize: rf(11), color: C.ink }}>Voice note</Text>
                </TouchableOpacity>
              ) : null}
              {latestNote?.createdAt ? (
                <Text style={{ fontSize: rf(10), color: C.muted, marginTop: 6 }}>Recorded · {fmtDateTime(latestNote.createdAt)}</Text>
              ) : null}

              <View style={{ height: 1, backgroundColor: C.surface, marginVertical: 10 }} />

              <View className="flex-row items-center justify-between">
                <Text className="font-bold" style={{ fontSize: rf(12), color: '#1C3053' }}>Repair Evidence Photos</Text>
                <Text className="font-bold" style={{ fontSize: rf(10), color: C.muted }}>{reportPhotos.length}</Text>
              </View>
              {reportPhotos.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: rs(6), marginTop: 6 }}>
                  {reportPhotos.map((u, i) => (
                    <Pressable key={`${u}-${i}`} onPress={() => setReportPhotoAt(i)} accessibilityLabel={`Repair photo ${i + 1}`}>
                      <Image source={{ uri: u }} style={{ width: rs(70), height: rs(70), borderRadius: 10, backgroundColor: C.surface }} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 4 }}>No photos recorded.</Text>
              )}
            </Card>
          </>
        ) : null}

        {/* Saved technician report — description, voice and the uploaded
            repair photos, read-only with Edit (the same records Service
            Progress counts). */}
        {showNotesList ? (
          <>
            <View onLayout={(e) => { notesY.current = e.nativeEvent.layout.y; }} />
            <SectionHeader
              title="Repair Issue & Photos"
              accent={C.yellow}
              right={(
                <Text className="font-bold" style={{ fontSize: rf(10), color: hasSavedReport ? C.green : C.muted }}>
                  {Math.min(savedNotePhotoCount(notesList), 3)}/3 photos · min {MIN_NOTE_PHOTOS}
                </Text>
              )}
            />
            <View style={{ marginBottom: 12 }}>
              {notesList.slice(0, 5).map((n) => renderSavedNote(n))}
            </View>
          </>
        ) : null}

        {/* Re-estimate / approval: price + customer sign-off only. */}
        {showEstimateBlock ? (
          <>
            <SectionHeader title={estimateApproval.reEstimated ? 'Service Re-estimated' : 'Customer Approval'} accent={C.ink} />
            {showEstimateBlock ? (
              <View
                style={{
                  backgroundColor: '#FFFFFF', borderRadius: 14, padding: 10,
                  borderWidth: 1, borderColor: C.border,
                  marginBottom: 12,
                }}
              >
                {estimateApproval.reEstimated ? (
                  <EstimateRow
                    icon={IndianRupee}
                    tint={C.yellowTint}
                    iconColor={C.yellowInk}
                    title="Service Re-Estimated"
                    pill={estimatedPriceLabel}
                    pillTint={C.yellowTint}
                    pillColor={C.yellowInk}
                    when={fmtDateTime(estimateApproval.reEstimated.createdAt) || 'Date not recorded'}
                    note={estimateApproval.reEstimated.note}
                  >
                    {priceItems.length > 0 ? (
                      <View className="mt-1.5 rounded-lg px-2 py-1.5" style={{ backgroundColor: C.bg }}>
                        {priceItems.map((it, i) => (
                          <View
                            key={`${it.label}-${i}`}
                            className="flex-row items-center"
                            style={{ paddingVertical: 2 }}
                          >
                            <Text
                              className="flex-1 pr-2"
                              style={{ fontSize: rf(10.5), color: C.muted }}
                              numberOfLines={1}
                            >
                              {it.label}
                            </Text>
                            <Text className="font-bold" style={{ fontSize: rf(10.5), color: C.ink }}>
                              {formatINR(it.amount) || '—'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </EstimateRow>
                ) : null}

                {estimateApproval.reEstimated ? (
                  <View style={{ height: 1, backgroundColor: C.surface, marginVertical: 8 }} />
                ) : null}

                <EstimateRow {...approvalRowProps} />
              </View>
            ) : null}
          </>
        ) : null}

        {/* Service Progress checklist — matches the Service History timeline
            row-for-row, drawn as a vertical timeline (nodes joined by a rail).
            Each row is its name, a state node (grey circle pending / locked,
            teal tick completed, amber waiting, red cross failed) and one status
            line with the server time and who recorded it. Only the Quality
            Check has a tick to tap; Repair Completed is the Finish Repair
            button, with Unable to Repair under it. The header badge reports
            the real sync state of this screen's reads and saves. */}
        <SectionHeader
          title="Service Progress"
          right={syncBadge ? (
            <TouchableOpacity
              onPress={retrySync}
              disabled={syncBusy || !['failed', 'offline'].includes(syncState.status)}
              activeOpacity={0.8}
              accessibilityLabel={`Sync status: ${syncBadge.label}`}
              className="flex-row items-center rounded-full px-2 py-0.5"
              style={{ backgroundColor: syncBadge.bg }}
            >
              {syncBusy
                ? <ActivityIndicator size="small" color={syncBadge.fg} style={{ transform: [{ scale: 0.6 }], marginVertical: -4 }} />
                : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: syncBadge.fg, marginRight: 4 }} />}
              <Text className="font-bold" style={{ fontSize: rf(9.5), color: syncBadge.fg }}>{syncBadge.label}</Text>
            </TouchableOpacity>
          ) : null}
        />
        <Card>
          {progressClosed ? (
            <Text style={{ fontSize: rf(12), color: '#6B7280', marginBottom: 2 }}>
              Quality check completed — service progress is closed.
            </Text>
          ) : null}
          {visibleProgressRows.map((row, idx) => {
            const status = stepStatus(row.key);
            const busy = progressBusy === row.key;
            const lockReason = progressLock[row.key] || null;
            const isLast = idx === visibleProgressRows.length - 1;
            const prevDone = idx > 0 && railDone(visibleProgressRows[idx - 1].key);
            const nextDone = !isLast && railDone(visibleProgressRows[idx + 1].key);
            const onRail = railDone(row.key);
            // Completed teal + white tick · waiting amber · failed red ·
            // locked grey with a lock · pending plain light grey.
            const node = status.kind === 'done'
              ? { bg: C.green, icon: <Check size={14} color="#FFFFFF" strokeWidth={3} /> }
              : status.kind === 'waiting'
              ? { bg: C.yellow, icon: <Hourglass size={12} color="#FFFFFF" strokeWidth={2.6} /> }
              : status.kind === 'failed'
              ? { bg: C.red, icon: <X size={13} color="#FFFFFF" strokeWidth={3} /> }
              : null;
            return (
              <View key={row.key} className="flex-row">
                {/* Timeline rail: connector above, step node, connector below.
                    A connector turns green once the steps at both its ends are
                    recorded (an unused optional row passes it through). */}
                <View style={{ width: 26, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 2, height: 7,
                      backgroundColor: idx === 0 ? 'transparent' : (prevDone && onRail ? C.green : C.line),
                    }}
                  />
                  <View
                    className="rounded-full items-center justify-center"
                    style={{
                      width: 26, height: 26,
                      backgroundColor: node ? node.bg : C.surface,
                      ...(node ? null : { borderWidth: 1.5, borderColor: '#D1D5DB' }),
                    }}
                  >
                    {node?.icon || (status.kind === 'locked' ? <Lock size={11} color="#9CA3AF" strokeWidth={2.4} /> : null)}
                  </View>
                  <View
                    style={{
                      width: 2, flex: 1,
                      backgroundColor: isLast ? 'transparent' : (onRail && nextDone ? C.green : C.line),
                    }}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 10, paddingVertical: 7 }}>
                  <View className="flex-row items-start">
                    <View style={{ flex: 1, paddingTop: 4 }}>
                      <Text className="font-bold" style={{ fontSize: rf(12), color: C.ink }} numberOfLines={1}>
                        {row.label}
                      </Text>
                      {status.text ? (
                        <Text className="mt-0.5" style={{ fontSize: rf(10), color: STATUS_COLOR[status.kind] }} numberOfLines={2}>
                          {status.text}
                        </Text>
                      ) : null}
                    </View>

                    {/* Right: the row's one action, or a spinner while it saves. */}
                    <View style={{ marginTop: 2, marginLeft: 8 }}>
                      {busy ? (
                        <ActivityIndicator color={C.green} size="small" />
                      ) : row.key === 'ISSUE_VERIFIED' && showReportAction ? (
                        <TouchableOpacity
                          onPress={openReport}
                          activeOpacity={0.8}
                          hitSlop={6}
                          className="flex-row items-center rounded-full px-2.5 py-1"
                          style={{ backgroundColor: C.greenTint }}
                        >
                          {latestNote ? <Pencil size={11} color={C.green} /> : <Plus size={11} color={C.green} />}
                          <Text className="font-bold ml-1" style={{ fontSize: rf(10), color: C.green }}>
                            {latestNote ? 'Edit Report' : 'Add Report'}
                          </Text>
                        </TouchableOpacity>
                      ) : row.mode === 'manual' ? (
                        /* Quality Check: tap the tick after checking the device (confirmed first). */
                        <TouchableOpacity
                          onPress={status.kind === 'done' ? null : () => confirmQualityCheck(row, lockReason)}
                          disabled={status.kind === 'done'}
                          activeOpacity={0.8}
                          hitSlop={8}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: status.kind === 'done' }}
                        >
                          <Check
                            size={22}
                            color={status.kind === 'done' ? C.green : lockReason ? C.line : C.muted}
                            strokeWidth={status.kind === 'done' ? 3 : 2.5}
                          />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {row.key === 'NEXT_ACTION' ? nextActionBody : null}
                </View>
              </View>
            );
          })}

        </Card>

        {/* Solution Pack — two compact CTAs, one for viewing existing
            references and one for uploading a new solution. Hidden once the
            whole Service Progress is done. */}
        {showSolutionPacks ? (
          <>
        <SectionHeader title="Solution Packs" />
        <View className="flex-row -mx-1 mb-2">
          <View className="flex-1 px-1">
            <TouchableOpacity
              onPress={openReferenceView}
              activeOpacity={0.85}
              className="flex-row items-center"
              style={{
                backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border,
                paddingVertical: 8, paddingHorizontal: 10,
              }}
            >
              <View
                className="rounded-full items-center justify-center"
                style={{ width: 28, height: 28, backgroundColor: C.greenTint }}
              >
                <Search size={15} color={C.green} />
              </View>
              <View className="flex-1" style={{ marginLeft: 8 }}>
                <Text className="font-bold" style={{ fontSize: rf(12), color: C.ink }} numberOfLines={1}>View Reference</Text>
                <Text style={{ fontSize: rf(9.5), color: C.muted, marginTop: 1 }} numberOfLines={2}>Find an existing solution pack</Text>
              </View>
            </TouchableOpacity>
          </View>
          <View className="flex-1 px-1">
            <TouchableOpacity
              onPress={openUploadScreen}
              activeOpacity={0.85}
              className="flex-row items-center"
              style={{
                backgroundColor: C.green, borderRadius: 14, borderWidth: 1, borderColor: C.green,
                paddingVertical: 8, paddingHorizontal: 10,
              }}
            >
              <View
                className="rounded-full items-center justify-center"
                style={{ width: 28, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' }}
              >
                <UploadCloud size={15} color="#FFFFFF" />
              </View>
              <View className="flex-1" style={{ marginLeft: 8 }}>
                <Text className="text-white font-bold" style={{ fontSize: rf(12) }} numberOfLines={1}>Upload New</Text>
                <Text style={{ fontSize: rf(9.5), color: 'rgba(255,255,255,0.85)', marginTop: 1 }} numberOfLines={2}>Share your fix with the team</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
          </>
        ) : null}
      </ScrollView>
      {/* Completion popup (CompletionPopup above) while the screen hands over
          to the Job Report after Repair Completed / Quality Check Completed. */}
      <CompletionPopup
        visible={completedBanner}
        title={bannerText}
        subtitle={COMPLETION_SUBTITLE}
        durationMs={COMPLETION_REDIRECT_MS}
      />
      <ImageViewerModal
        visible={photoAt >= 0}
        images={devicePhotos.map((u, i) => ({ uri: u, label: `Customer image ${i + 1}` }))}
        index={photoAt < 0 ? 0 : photoAt}
        onClose={() => setPhotoAt(-1)}
      />
      <ImageViewerModal
        visible={reportPhotoAt >= 0}
        images={reportPhotos.map((u, i) => ({ uri: u, label: `Repair photo ${i + 1}` }))}
        index={reportPhotoAt < 0 ? 0 : reportPhotoAt}
        onClose={() => setReportPhotoAt(-1)}
      />
    </View>
  );
}
