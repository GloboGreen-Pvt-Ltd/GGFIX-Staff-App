import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from '../utils/audio';
import {
  Smartphone, Search, UploadCloud, Pencil, X, Check,
  Mic, Play, Pause, Trash2, Plus, Image as ImageIcon,
  ShieldCheck, PackageX, Square, IndianRupee, BadgeCheck, Hourglass,
} from 'lucide-react-native';
import {
  getTicket, setTechnicianPhotos, addRepairNote, listRepairNotes,
  updateRepairNote, listTicketEvents, postProgressEvent,
} from '../api/tickets';
import { uploadMedia } from '../api/media';
import { notify } from '../components/confirm';
import { rf } from '../utils/responsive';
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
const PROGRESS_ROWS = [
  { key: 'IN_REPAIR',               label: 'Repair Work In Progress' },
  // One spare-parts row. "Spare Parts Replaced" (PARTS_REPLACED) was retired
  // with migration 87 — the technician records the outcome in this row's note
  // instead, and the backend no longer accepts the old key.
  { key: 'PARTS_REQUIRED',          label: 'Spare Parts Waiting' },
  // Repair first, then the check on that repair — 03 then 04. This is also the
  // order the grouped Service History rail renders (Repair Completed sits above
  // Quality Check Completed in SHOP_BOOKING_STATUS_OPTIONS), so the checklist
  // and the timeline read the same way down the page.
  { key: 'REPAIR_COMPLETED',        label: 'Repair Completed' },
  // One quality-check row. "Quality Check Pending"/"Started"
  // (QUALITY_CHECK_STARTED) was retired with migration 88: marking this row
  // Done is what records the check, and the backend stamps the event's
  // createdAt at that instant — so the completion time is captured
  // automatically, with no separate "started" step to open first.
  { key: 'QUALITY_CHECK_COMPLETED', label: 'Quality Check Completed' },
  { key: 'REPAIR_NOT_COMPLETED',    label: 'Repair Not Completed' },
];

// Rows that always emit a fixed note when the technician marks them.
// Saves them typing a free-text reason every time and keeps the wording the
// customer + shop see consistent across tickets.
const DEFAULT_PROGRESS_NOTE = {
  REPAIR_NOT_COMPLETED: 'Your repair is not completed',
};

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

// Screen palette — GGFIX green / red / yellow on light neutrals, the same set
// the restyled Home and attendance screens use.
const C = {
  green: '#09AD2A',
  greenTint: '#E6F7EA',
  greenSoft: '#F3FBF4',
  greenLine: '#CFEFD6',
  red: '#F84141',
  redTint: '#FEECEC',
  redLine: '#FBD0D0',
  yellow: '#F3BF23',
  yellowTint: '#FDF6E0',
  yellowSoft: '#FFFBEF',
  yellowLine: '#F6DE8D',
  yellowInk: '#8A6700',
  ink: '#1E1E1E',
  muted: '#6E6E6E',
  faint: '#A3A3A3',
  bg: '#F8F8F8',
  surface: '#F3F3F3',
  border: '#ECECEC',
  line: '#D4D4D4',
};

// Section header: a small vertical accent bar + bold title + optional right
// action. Used throughout the screen so every section reads with the same
// visual rhythm.
function SectionHeader({ title, accent = C.green, right = null }) {
  return (
    <View className="flex-row items-center" style={{ marginTop: 2, marginBottom: 6 }}>
      <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: accent, marginRight: 7 }} />
      <Text className="font-extrabold flex-1" style={{ fontSize: rf(13), color: C.ink }}>{title}</Text>
      {right}
    </View>
  );
}

// Card shell with the border / soft shadow used on every section. Keeps
// the visual rhythm consistent and avoids re-typing the same style blob.
function Card({ children, style }) {
  return (
    <View
      style={[
        { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 10, marginBottom: 12,
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
          <Text className="font-extrabold flex-1" style={{ fontSize: rf(12), color: C.ink }}>
            {title}
          </Text>
          {pill ? (
            <View className="rounded-full px-2 py-0.5 ml-2" style={{ backgroundColor: pillTint }}>
              <Text className="font-extrabold" style={{ fontSize: rf(9), color: pillColor }}>
                {pill}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="font-extrabold" style={{ fontSize: rf(11.5), color: whenColor, marginTop: 3 }}>
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
function AddPhotoSlot({ onPress, height = 86 }) {
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
          width: 30, height: 30, borderRadius: 15, backgroundColor: C.green,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Plus size={17} color="#FFFFFF" />
      </View>
      <Text className="font-bold" style={{ fontSize: rf(9.5), color: C.muted, marginTop: 6 }}>Add Photo</Text>
    </TouchableOpacity>
  );
}

export default function TechnicianTicketDetailScreen({ route, navigation }) {
  const { ticketId } = route.params || {};

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Which customer photo the full-screen viewer is on (-1 = closed). Must sit
  // with the other hooks, above the loading/error early returns.
  const [photoAt, setPhotoAt] = useState(-1);

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
    } catch (e) {
      setError(e?.message || 'Could not load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  // Pull existing compliance notes so the list under Submit shows what's
  // already been recorded for this ticket.
  const refreshNotes = useCallback(async () => {
    if (!ticketId) return;
    try {
      const rows = await listRepairNotes(ticketId);
      setNotesList(Array.isArray(rows) ? rows : []);
    } catch { setNotesList([]); }
  }, [ticketId]);

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
  const [progressBusy, setProgressBusy] = useState(null);
  // Raw booking-event rows behind the checklist. Kept as-is (not just reduced
  // to progressDone) because the Submitted Notes block reads the re-estimate
  // and customer-approval events out of the same fetch.
  const [ticketEvents, setTicketEvents] = useState([]);
  // Per-row note input — only the PARTS_REQUIRED row prompts for one today
  // ("which part is on order, ETA?") and it's passed through to the backend so
  // the customer / shop / technician timelines all read the same explanation.
  const [progressNotes, setProgressNotes] = useState({});

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
        if (actor === 'TECHNICIAN' || actor === 'OWNER') {
          done[k] = true;
          actorByKey[k] = actor;
        }
        // Default label means the technician didn't type a custom note —
        // skip those so the input doesn't fill itself with "Spare Parts
        // Waiting" the next visit.
        const row = PROGRESS_ROWS.find((r) => r.key === k);
        if (e?.note && row && e.note !== row.label) noteByKey[k] = e.note;
      });
      setProgressDone(done);
      setProgressActor(actorByKey);
      setProgressNotes((prev) => ({ ...noteByKey, ...prev }));
    } catch { /* keep current */ }
  }, [ticketId]);

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
    try { setTicket(await getTicket(ticketId)); } catch (_) { /* keep current */ }
  }, [ticketId]);

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

  const submitProgress = useCallback(async (row) => {
    if (!progressChecked[row.key] && !progressDone[row.key]) {
      notify('Tick the box first', `Check "${row.label}" before submitting.`);
      return;
    }
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
    setProgressBusy(row.key);
    try {
      await postProgressEvent(ticketId, {
        statusKey: row.key,
        note: noteToSend,
      });
      setProgressChecked((prev) => ({ ...prev, [row.key]: false }));
      refreshProgress();
      notify('Saved', `"${row.label}" recorded.`);
    } catch (e) {
      notify('Save failed', e?.message || 'Try again');
    } finally {
      setProgressBusy(null);
    }
  }, [ticketId, progressChecked, progressDone, progressNotes, refreshProgress]);


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
    if (!trimmed) return;
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
      notify('Note added', 'Your compliance note has been saved.');
    } catch (e) {
      // Surface the backend's actual message so a stale ticket-service or a
      // server-side validation error stops being hidden behind a generic
      // "Try again" string. e.status comes from ticketApi.client when the
      // response was an HTTP error; we include it so the user can tell a
      // network failure (status undefined) from a backend 5xx.
      const detail = e?.status ? `${e.message || 'Failed'} (HTTP ${e.status})` : e?.message;
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
    if (!trimmed || !editingNoteId) return;
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
      notify('Note updated', 'Your changes have been saved.');
    } catch (e) {
      const detail = e?.status ? `${e.message || 'Failed'} (HTTP ${e.status})` : e?.message;
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
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: C.bg }}>
        <ActivityIndicator color={C.green} />
      </View>
    );
  }

  if (error || !ticket) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: C.bg }}>
        <Text className="font-bold mb-2" style={{ color: C.red }}>Ticket not found</Text>
        <Text className="text-center" style={{ fontSize: rf(12), color: C.muted }}>{error || 'Try again from the task list.'}</Text>
      </View>
    );
  }

  const noteReady = !!note.trim();
  const noteSubmitBlocked = noteSubmitting || !noteReady || isRecording || uploadingAudio;
  const noteAttachmentCount =
    ((noteAudioUrl || noteAudioLocalUri) ? 1 : 0)
    + noteImages.filter((s) => !!s?.uri).length;
  const recSeconds = Math.floor(recordingMs / 1000);
  const recLabel = `${String(Math.floor(recSeconds / 60)).padStart(2, '0')}:${String(recSeconds % 60).padStart(2, '0')}`;

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
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Device hero card: thumbnail, bold device name, red pill for the
            repair being done. */}
        <Card>
          <View className="flex-row items-center">
            {deviceImage && !deviceImageFailed ? (
              <Image
                source={{ uri: deviceImage }}
                resizeMode="contain"
                onError={() => setDeviceImageFailed(true)}
                style={{ width: 52, height: 64, borderRadius: 10, backgroundColor: C.surface }}
              />
            ) : (
              <View
                style={{ width: 52, height: 64, borderRadius: 10, backgroundColor: C.surface }}
                className="items-center justify-center"
              >
                <Smartphone size={22} color={C.faint} />
              </View>
            )}
            <View className="flex-1" style={{ marginLeft: 10 }}>
              <Text className="font-bold uppercase tracking-wider" style={{ fontSize: rf(9.5), color: C.muted }}>Device</Text>
              <Text className="font-extrabold mt-0.5" style={{ fontSize: rf(14), color: C.ink }} numberOfLines={2}>
                {ticket.deviceDisplayName || '—'}
              </Text>
              {ticket.repairServicesSummary ? (
                <View
                  className="self-start rounded-full px-2 py-0.5"
                  style={{ backgroundColor: C.redTint, marginTop: 6 }}
                >
                  <Text className="font-extrabold" style={{ fontSize: rf(10), color: C.red }} numberOfLines={1}>
                    {ticket.repairServicesSummary}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Card>

        {/* Customer-side device images. Read-only strip; if empty, show a
            friendly placeholder instead of a dashed empty box. */}
        <SectionHeader title="Customer Device Images" />
        <Card>
          {devicePhotos.length === 0 ? (
            <View className="items-center" style={{ paddingVertical: 8 }}>
              <ImageIcon size={18} color={C.faint} />
              <Text style={{ fontSize: rf(10.5), color: C.muted, marginTop: 4 }}>No images uploaded by the customer yet.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row">
                {devicePhotos.map((url, i) => (
                  <Pressable key={i} onPress={() => setPhotoAt(i)}>
                    <Image
                      source={{ uri: url }}
                      style={{ width: 72, height: 80, borderRadius: 10, marginRight: 8, backgroundColor: C.surface }}
                    />
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}
        </Card>

        {/* Device Security + Missing/Damage Parts — paired card. */}
        <SectionHeader title="Device Security & Missing / Damage Parts" accent={C.red} />
        <Card>
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
                  <Text className="font-extrabold" style={{ fontSize: rf(12.5), color: C.ink }}>
                    {ticket.deviceSecurityType}
                  </Text>
                  <Text className="font-extrabold mx-1" style={{ fontSize: rf(12.5), color: C.ink }}>·</Text>
                  <Text
                    className="font-extrabold"
                    style={{ fontSize: rf(12.5), color: C.ink, letterSpacing: 1 }}
                  >
                    {ticket.deviceSecurityValue || '—'}
                  </Text>
                </View>
              ) : (
                <Text className="font-bold mt-0.5" style={{ fontSize: rf(12.5), color: C.muted }}>No lock set</Text>
              )}
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: C.surface, marginVertical: 10 }} />

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
                      <Text className="font-extrabold" style={{ fontSize: rf(10.5), color: C.red }}>
                        {label}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="font-bold mt-0.5" style={{ fontSize: rf(12.5), color: C.muted }}>Nil</Text>
              )}
            </View>
          </View>
        </Card>

        {/* Your-Side upload card. Three "+" slots; once filled, the
            technician must tap Save to persist the URLs to the ticket. */}
        <SectionHeader
          title="Your Side Device Images"
          right={
            !photosEditing && yourPhotos.some((s) => s?.remoteUrl) ? (
              <TouchableOpacity
                onPress={() => setPhotosEditing(true)}
                activeOpacity={0.8}
                className="flex-row items-center rounded-full px-2.5 py-1"
                style={{ backgroundColor: C.greenTint }}
              >
                <Pencil size={11} color={C.green} />
                <Text className="font-extrabold ml-1" style={{ fontSize: rf(10.5), color: C.green }}>Edit</Text>
              </TouchableOpacity>
            ) : null
          }
        />
        <Card>
          <View className="flex-row -mx-1">
            {yourPhotos.map((slot, i) => (
              <View key={i} className="flex-1 px-1">
                {slot ? (
                  <View
                    className="overflow-hidden"
                    style={{ height: 86, borderRadius: 12, backgroundColor: C.surface }}
                  >
                    <Image source={{ uri: slot.uri }} style={{ width: '100%', height: '100%' }} />
                    {photosEditing ? (
                      <TouchableOpacity
                        onPress={() => removePhoto(i)}
                        hitSlop={8}
                        style={{
                          position: 'absolute', top: 5, right: 5,
                          backgroundColor: 'rgba(30,30,30,0.75)', borderRadius: 12, padding: 3,
                        }}
                      >
                        <X size={12} color="#FFFFFF" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : (
                  <AddPhotoSlot
                    onPress={() => (photosEditing ? promptPickPhoto(i) : setPhotosEditing(true))}
                  />
                )}
              </View>
            ))}
          </View>
          {photosEditing ? (
            <TouchableOpacity
              onPress={submitPhotos}
              disabled={photosSubmitting}
              activeOpacity={0.85}
              className="items-center justify-center"
              style={{
                backgroundColor: C.green, borderRadius: 12,
                paddingVertical: 10, marginTop: 10,
                opacity: photosSubmitting ? 0.6 : 1,
              }}
            >
              {photosSubmitting
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text className="text-white font-extrabold" style={{ fontSize: rf(12.5) }}>Save Device Images</Text>}
            </TouchableOpacity>
          ) : null}
        </Card>

        {/* Compliance Notes — single card with the textarea, voice-note row,
            three image slots, and a full-width "Save Note" CTA at the bottom. */}
        <SectionHeader title="Technician Issue Verified & Updated" accent={C.yellow} />
        <Card>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Describe the issue you verified — what was found, what's been updated, anything the customer should know."
            placeholderTextColor={C.faint}
            style={{
              fontSize: rf(12.5), color: C.ink,
              backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
              borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
              minHeight: 72, textAlignVertical: 'top',
            }}
          />

          {/* Voice note recorder — three visual states:
                (a) idle, no clip → green "Record voice note" button
                (b) recording     → red dot + mm:ss timer + Stop button
                (c) clip ready    → play/pause + status + remove */}
          <Text className="font-extrabold tracking-widest" style={{ fontSize: rf(9.5), color: C.muted, marginTop: 12, marginBottom: 6 }}>
            VOICE NOTE
          </Text>
          {isRecording ? (
            <View
              className="flex-row items-center rounded-xl px-2.5 py-2"
              style={{ backgroundColor: C.redTint, borderWidth: 1, borderColor: C.redLine }}
            >
              <View className="h-2.5 w-2.5 rounded-full mr-2" style={{ backgroundColor: C.red }} />
              <View className="flex-1">
                <Text className="font-extrabold" style={{ fontSize: rf(11.5), color: C.red }}>Recording…</Text>
                <Text className="font-bold" style={{ fontSize: rf(10.5), color: C.red }}>{recLabel}</Text>
              </View>
              <TouchableOpacity
                onPress={stopNoteRecording}
                activeOpacity={0.85}
                className="flex-row items-center rounded-full px-3 py-1.5"
                style={{ backgroundColor: C.red }}
              >
                <Square size={11} color="#FFFFFF" fill="#FFFFFF" />
                <Text className="text-white font-extrabold ml-1.5" style={{ fontSize: rf(11.5) }}>Stop</Text>
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
                <Text className="font-extrabold" style={{ fontSize: rf(12), color: C.ink }}>Voice note attached</Text>
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
              style={{ backgroundColor: C.green, borderRadius: 12, paddingVertical: 10 }}
            >
              <Mic size={15} color="#FFFFFF" />
              <Text className="text-white font-extrabold ml-2" style={{ fontSize: rf(12.5) }}>Record voice note</Text>
            </TouchableOpacity>
          )}

          {/* Image attachments — small label row, then the three preview
              tiles directly below. Each empty tile is tappable so the
              technician can pick a specific slot to fill. */}
          {(() => {
            const filled = noteImages.filter((s) => !!s?.uri).length;
            return (
              <>
                <View className="flex-row items-center justify-between" style={{ marginTop: 12, marginBottom: 6 }}>
                  <Text className="font-extrabold uppercase tracking-wider" style={{ fontSize: rf(9.5), color: C.muted }}>
                    Attach Photos
                  </Text>
                  <Text className="font-bold" style={{ fontSize: rf(10), color: C.muted }}>
                    {filled}/3
                  </Text>
                </View>
                <View className="flex-row -mx-1">
                  {noteImages.map((slot, i) => (
                    <View key={i} className="flex-1 px-1">
                      {slot ? (
                        <View
                          className="overflow-hidden"
                          style={{ height: 80, borderRadius: 12, backgroundColor: C.surface }}
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
                        <AddPhotoSlot onPress={() => promptPickNoteImage(i)} height={80} />
                      )}
                    </View>
                  ))}
                </View>
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
              paddingVertical: 11, marginTop: 12,
              opacity: noteSubmitBlocked ? 0.5 : 1,
            }}
          >
            {noteSubmitting
              ? <ActivityIndicator color="#FFFFFF" />
              : (
                <Text className="text-white font-extrabold" style={{ fontSize: rf(13) }}>
                  Save Note{noteAttachmentCount ? ` (+${noteAttachmentCount} ${noteAttachmentCount === 1 ? 'attachment' : 'attachments'})` : ''}
                </Text>
              )}
          </TouchableOpacity>
          {noteSubmitBlocked && !noteSubmitting ? (
            <Text className="text-center" style={{ fontSize: rf(10), color: C.muted, marginTop: 6 }}>
              {uploadingAudio
                ? 'Uploading voice note…'
                : isRecording
                ? 'Stop the recording first.'
                : !noteReady
                ? 'Enter a note to submit. Voice + photos are optional.'
                : null}
            </Text>
          ) : null}
        </Card>

        {/* Previously-submitted notes — each rendered as a left-accented
            card so the technician can re-read what they've recorded. The
            re-estimate / approval pair sits at the top of the same section:
            it is the context the notes below were written against, and the
            technician must not start work on a price the customer hasn't
            signed off on yet. */}
        {notesList.length > 0 || showEstimateBlock ? (
          <>
            <SectionHeader title="Submitted Notes" accent={C.ink} />
            {showEstimateBlock ? (
              <View
                style={{
                  backgroundColor: '#FFFFFF', borderRadius: 14, padding: 10,
                  borderWidth: 1, borderColor: C.border,
                  marginBottom: notesList.length > 0 ? 8 : 12,
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
                  <View style={{ height: 1, backgroundColor: C.surface, marginVertical: 10 }} />
                ) : null}

                <EstimateRow {...approvalRowProps} />
              </View>
            ) : null}
            <View style={notesList.length > 0 ? { marginBottom: 12 } : undefined}>
              {notesList.slice(0, 5).map((n) => {
                const imgs = Array.isArray(n.imageUrls) ? n.imageUrls : [];
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
                          className="font-extrabold uppercase tracking-wider mb-1.5"
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
                            fontSize: rf(12.5), color: C.ink,
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
                              <Text className="font-extrabold ml-1" style={{ fontSize: rf(10.5), color: C.red }}>
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
                            <Text className="font-extrabold" style={{ fontSize: rf(12), color: C.muted }}>
                              Cancel
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={saveEditNote}
                            disabled={editNoteSaving || !editNoteText.trim()}
                            activeOpacity={0.85}
                            className="flex-1 items-center justify-center"
                            style={{
                              backgroundColor: C.green, borderRadius: 10, paddingVertical: 8,
                              opacity: editNoteSaving || !editNoteText.trim() ? 0.5 : 1,
                            }}
                          >
                            {editNoteSaving
                              ? <ActivityIndicator color="#FFFFFF" />
                              : (
                                <Text className="text-white font-extrabold" style={{ fontSize: rf(12.5) }}>
                                  Save Changes
                                </Text>
                              )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      /* ---- Read-only ---- */
                      <View className="flex-1">
                        <View className="flex-row items-start">
                          <Text className="flex-1 pr-2" style={{ fontSize: rf(12.5), color: C.ink }}>{n.note}</Text>
                          {/* Disabled while another note is open for editing so
                              two drafts can't fight over the single edit slot. */}
                          <TouchableOpacity
                            onPress={() => beginEditNote(n)}
                            disabled={!!editingNoteId}
                            hitSlop={8}
                            activeOpacity={0.8}
                            className="flex-row items-center rounded-full px-2.5 py-1"
                            style={{ backgroundColor: C.greenTint, opacity: editingNoteId ? 0.4 : 1 }}
                          >
                            <Pencil size={11} color={C.green} />
                            <Text className="font-extrabold ml-1" style={{ fontSize: rf(10.5), color: C.green }}>
                              Edit
                            </Text>
                          </TouchableOpacity>
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
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Service Progress checklist — matches the Service History timeline
            row-for-row. Each row has three visual states:
              * idle    → numbered chip + label + Mark chip
              * pending → chip turns yellow; [Done] (confirms emit) + [Cancel]
                          (clears the tick) appear as a chip pair
              * done    → green tick + DONE pill */}
        <SectionHeader title="Service Progress" />
        <Card>
          <Text style={{ fontSize: rf(10), color: C.muted, marginBottom: 2 }}>
            Tick a row and tap Done to record that step on the customer's Service History.
          </Text>
          {PROGRESS_ROWS.map((row, idx) => {
            const checked = !!progressChecked[row.key];
            const done = !!progressDone[row.key];
            const busy = progressBusy === row.key;
            const stepNo = String(idx + 1).padStart(2, '0');
            const toggleTick = () =>
              setProgressChecked((prev) => ({ ...prev, [row.key]: !prev[row.key] }));
            const needsNote = row.key === 'PARTS_REQUIRED';
            const noteValue = progressNotes[row.key] || '';
            const showNoteInput = needsNote && (checked || done);
            return (
              <View
                key={row.key}
                style={{
                  paddingVertical: 9,
                  borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: C.surface,
                }}
              >
                <View className="flex-row items-center">
                {/* Numbered chip — green when done, yellow when ticked, grey otherwise. */}
                <View
                  className="rounded-full items-center justify-center"
                  style={{
                    width: 26, height: 26,
                    backgroundColor: done ? C.greenTint : checked ? C.yellowTint : C.surface,
                  }}
                >
                  {done
                    ? <Check size={13} color={C.green} />
                    : (
                      <Text
                        className="font-extrabold"
                        style={{ fontSize: rf(9.5), color: checked ? C.yellowInk : C.muted }}
                      >
                        {stepNo}
                      </Text>
                    )}
                </View>

                <TouchableOpacity
                  onPress={done ? null : toggleTick}
                  disabled={done}
                  activeOpacity={0.7}
                  style={{ flex: 1, marginLeft: 10 }}
                >
                  <Text
                    style={{ fontSize: rf(12.5), color: C.ink }}
                    className={done ? 'font-extrabold' : 'font-bold'}
                    numberOfLines={1}
                  >
                    {row.label}
                  </Text>
                  {checked && !done ? (
                    <Text className="mt-0.5" style={{ fontSize: rf(10), color: C.muted }}>
                      Tap Done to confirm.
                    </Text>
                  ) : done ? (
                    <Text className="mt-0.5" style={{ fontSize: rf(10), color: C.green }}>
                      {progressActor[row.key] === 'OWNER' ? 'Recorded by shop' : 'Recorded'}
                    </Text>
                  ) : null}
                </TouchableOpacity>

                {/* Right action area: changes by state. */}
                {done ? (
                  <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: C.greenTint }}>
                    <Text className="font-extrabold" style={{ fontSize: rf(9.5), color: C.green }}>DONE</Text>
                  </View>
                ) : checked ? (
                  <View className="flex-row items-center">
                    {/* Done — primary confirmation, fires the emit. */}
                    <TouchableOpacity
                      onPress={() => submitProgress(row)}
                      disabled={busy}
                      activeOpacity={0.85}
                      className="rounded-full flex-row items-center"
                      style={{
                        backgroundColor: C.green,
                        paddingHorizontal: 12, paddingVertical: 6,
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {busy
                        ? <ActivityIndicator color="#FFFFFF" size="small" />
                        : (
                          <>
                            <Check size={12} color="#FFFFFF" />
                            <Text className="font-extrabold text-white ml-1" style={{ fontSize: rf(11) }}>Done</Text>
                          </>
                        )}
                    </TouchableOpacity>
                    {/* Cancel — clears the tick, no emit. */}
                    <TouchableOpacity
                      onPress={toggleTick}
                      disabled={busy}
                      activeOpacity={0.8}
                      className="rounded-full flex-row items-center ml-1.5"
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1, borderColor: C.line,
                        paddingHorizontal: 10, paddingVertical: 5,
                      }}
                    >
                      <X size={11} color={C.muted} />
                      <Text className="font-extrabold ml-1" style={{ fontSize: rf(11), color: C.muted }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  // Idle: a Mark chip that ticks the row (same as tapping the label).
                  <TouchableOpacity
                    onPress={toggleTick}
                    activeOpacity={0.8}
                    className="rounded-full"
                    style={{
                      backgroundColor: C.surface,
                      paddingHorizontal: 12, paddingVertical: 6,
                    }}
                  >
                    <Text className="font-extrabold" style={{ fontSize: rf(11), color: C.ink }}>Mark</Text>
                  </TouchableOpacity>
                )}
                </View>

                {/* Note input — only on the Spare Parts Waiting row. Backend
                    persists the text as repair_booking_events.note, which is
                    what the customer + shop + technician timelines render
                    below the matching step row. */}
                {showNoteInput ? (
                  <View style={{ marginLeft: 36, marginTop: 8 }}>
                    <Text className="font-extrabold uppercase tracking-wider mb-1" style={{ fontSize: rf(9.5), color: C.muted }}>
                      Which spare part is waiting?
                    </Text>
                    <TextInput
                      value={noteValue}
                      onChangeText={(v) =>
                        setProgressNotes((prev) => ({ ...prev, [row.key]: v }))
                      }
                      multiline
                      placeholder="e.g. Display + battery on order from Samsung distributor, ETA 3 days."
                      placeholderTextColor={C.faint}
                      editable={!busy}
                      style={{
                        fontSize: rf(12), color: C.ink,
                        backgroundColor: C.yellowSoft,
                        borderWidth: 1, borderColor: C.yellowLine,
                        borderRadius: 10,
                        paddingHorizontal: 10, paddingVertical: 7,
                        minHeight: 56, textAlignVertical: 'top',
                      }}
                    />
                    <Text className="mt-1" style={{ fontSize: rf(9.5), color: C.muted }}>
                      Shown to the customer, shop owner, and on your own history rail.
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>

        {/* Solution Pack — two compact CTAs, one for viewing existing
            references and one for uploading a new solution. */}
        <SectionHeader title="Solution Packs" />
        <View className="flex-row -mx-1 mb-2">
          <View className="flex-1 px-1">
            <TouchableOpacity
              onPress={openReferenceView}
              activeOpacity={0.85}
              className="flex-row items-center"
              style={{
                backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border,
                paddingVertical: 10, paddingHorizontal: 10,
              }}
            >
              <View
                className="rounded-full items-center justify-center"
                style={{ width: 32, height: 32, backgroundColor: C.greenTint }}
              >
                <Search size={15} color={C.green} />
              </View>
              <View className="flex-1" style={{ marginLeft: 8 }}>
                <Text className="font-extrabold" style={{ fontSize: rf(12.5), color: C.ink }} numberOfLines={1}>View Reference</Text>
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
                paddingVertical: 10, paddingHorizontal: 10,
              }}
            >
              <View
                className="rounded-full items-center justify-center"
                style={{ width: 32, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' }}
              >
                <UploadCloud size={15} color="#FFFFFF" />
              </View>
              <View className="flex-1" style={{ marginLeft: 8 }}>
                <Text className="text-white font-extrabold" style={{ fontSize: rf(12.5) }} numberOfLines={1}>Upload New</Text>
                <Text style={{ fontSize: rf(9.5), color: 'rgba(255,255,255,0.85)', marginTop: 1 }} numberOfLines={2}>Share your fix with the team</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <ImageViewerModal
        visible={photoAt >= 0}
        images={devicePhotos.map((u, i) => ({ uri: u, label: `Customer image ${i + 1}` }))}
        index={photoAt < 0 ? 0 : photoAt}
        onClose={() => setPhotoAt(-1)}
      />
    </View>
  );
}
