import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView, StyleSheet, View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Line } from 'react-native-svg';
import {
  Wrench, BatteryMedium, Cpu, Zap, Volume2, Aperture, LayoutGrid, Smartphone, Droplets, Check, X,
  Headphones, Wifi, Layers, Cog, Database, Keyboard as KeyboardIcon, HardDrive, Fan, ShieldCheck, Mic, Ear,
  VolumeX, Bluetooth, CreditCard, Square, SignalHigh, Lock, ShieldAlert, Hand, Gauge, Stethoscope, UserCog,
  Sparkles, MessageSquarePlus, Barcode, Circle, CircleCheck, ChevronDown, Camera,
  Video, Eye, EyeOff, CircleDot, ArrowRight, Search, ScanLine, NotebookPen, ChevronRight,
} from 'lucide-react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useHideNativeHeader } from '../components/MintScreenHeader';
import {
  EST, EText, ETextInput, EstimateHeader, StepProgress, CustomerCard, DeviceImage, PickerLoader,
  EButton, EstimateBottomBar, BOTTOM_BAR_SPACE, cardStyle, Pressable,
} from '../components/estimate/EstimateKit';
import { notify } from '../components/confirm';
import { listAllRepairServices, listRepairCategories, listRepairServicesGrouped } from '../api/master';
import { uploadMedia } from '../api/media';
import { useImeiApplies } from '../utils/imeiPolicy';
import { useSecureScreen } from '../utils/secureScreen';
import { userMessage } from '../utils/userMessages';

const WARRANTY_OPTIONS = [
  { code: 'W_3M', label: '3 Months' },
  { code: 'W_6M', label: '6 Months' },
  { code: 'W_12M', label: '12 Months' },
];
const FIRST_TILES = 8;
const LINE = '#E5E7EB';
const MINT_EDGE = '#C7E6EA';
const HAIR = '#D1D5DB';
const MISSING = '#FAA700';
const MISSING_BG = '#FFF8E1';
const DAMAGE = '#F32C26';
const DAMAGE_BG = '#FEECEC';

const PARTS = [
  { id: 'DISPLAY', name: 'Display', icon: Smartphone },
  { id: 'BACK_PANEL', name: 'Back Panel', icon: Layers },
  { id: 'SIM_TRAY', name: 'SIM Card Tray', icon: CreditCard },
  { id: 'BUTTONS', name: 'Buttons', icon: CircleDot },
  { id: 'CHARGING_PORT', name: 'Charging Port', icon: Zap },
  { id: 'CAMERA', name: 'Camera', icon: Camera },
  { id: 'SPEAKER', name: 'Speaker', icon: Volume2 },
];
const LOCK_OPTIONS = [
  { key: 'NONE', label: 'None' },
  { key: 'PIN', label: 'Numeric PIN' },
  { key: 'PASSWORD', label: 'Password' },
  { key: 'PATTERN', label: 'Pattern Lock' },
];

const priceNum = (v) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;
// Old estimate-step formats (kept for the output strings).
const formatDate = (d) => d.toDateString();
const formatTime24 = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
// Partner display formats.
const formatTime12 = (d) => {
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayWord = (d, now) => {
  const diff = startOfDay(d) - startOfDay(now);
  return diff === 0 ? 'Today' : diff === 86400000 ? 'Tomorrow' : null;
};
const dateLabelOf = (d, now) => {
  const base = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const w = dayWord(d, now);
  return w ? `${w}, ${base}` : base;
};
const spanLabel = (h) => (h >= 24 && h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : h > 48 ? `${Math.round(h / 24)} days` : `${h} hr`);
const SLOT_MS = 30 * 60000;
const ceilSlot = (ms) => Math.ceil(ms / SLOT_MS) * SLOT_MS;
let customSeq = 0;
const newCustomId = () => `custom_${Date.now()}_${customSeq++}`;
// Leading/embedded "Accessories: …" line of a stored complaint → its own field.
function splitComplaint(text) {
  const lines = String(text || '').split('\n').map((l) => l.replace(/\r$/, ''));
  let acc = '';
  const rest = [];
  for (const ln of lines) {
    const m = /^\s*Accessories:\s*(.*)$/i.exec(ln);
    if (m) acc = m[1].trim();
    else if (!/^\s*Device \(not in list\):/i.test(ln)) rest.push(ln); // re-added on submit from Device Details
  }
  return { notes: rest.join('\n').trim(), accessories: acc };
}
function customFromSources(...sources) {
  const out = [];
  const seen = new Set();
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const s of source) {
      if (s?.serviceId || s?.repairServiceId || s?.repair_service_id) continue;
      const name = String(s?.serviceName || s?.name || s?.service_name || '').trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push({ id: newCustomId(), name, price: String(s.price ?? s.estimatedPrice ?? s.estimated_price ?? ''), warranty: s.warranty || '' });
    }
  }
  return out;
}

function normalizePrefillServices(...sources) {
  const byId = new Map();
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const s of source) {
      const rawId = s?.serviceId || s?.repairServiceId || s?.repair_service_id;
      if (!rawId) continue;
      const serviceId = String(rawId);
      byId.set(serviceId, {
        serviceId,
        serviceCode: s.serviceCode || s.code || s.service_code || null,
        serviceName: s.serviceName || s.name || s.service_name || 'Selected Issue',
        price: s.price ?? s.estimatedPrice ?? s.estimated_price ?? '',
        warranty: s.warranty || null,
      });
    }
  }
  return Array.from(byId.values());
}

function looksLikeVideo(url) {
  return !!url && /\.(mp4|mov|m4v|webm|avi|3gp)(\?|$)/i.test(String(url));
}

function dotCenter(idx, cell) {
  const i = idx - 1;
  return { x: (i % 3) * cell + cell / 2, y: Math.floor(i / 3) * cell + cell / 2 };
}

// 3x3 lock pattern pad (from PickupDeviceSecurityScreen).
function PatternPad({ value, onChange, cell, onDrawStart, onDrawEnd }) {
  const PAD_SIZE = cell * 3;
  const HIT_R = cell * 0.44;
  const DOT_BOX = cell * 0.31;
  const DOT = cell * 0.22;
  const DOT_ON = cell * 0.28;
  const initial = (value || '').split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 9);
  const [path, setPath] = useState(initial);
  const [current, setCurrent] = useState(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  const cb = useRef({ onChange, onDrawStart, onDrawEnd });
  cb.current = { onChange, onDrawStart, onDrawEnd };
  const start = useRef({ x: 0, y: 0 });

  const findHit = (x, y) => {
    for (let i = 1; i <= 9; i++) {
      const c = dotCenter(i, cell);
      const dx = x - c.x; const dy = y - c.y;
      if (dx * dx + dy * dy < HIT_R * HIT_R) return i;
    }
    return null;
  };

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (e) => {
      cb.current.onDrawStart?.();
      const { locationX, locationY } = e.nativeEvent;
      start.current = { x: locationX, y: locationY };
      setCurrent({ x: locationX, y: locationY });
      const hit = findHit(locationX, locationY);
      const next = hit ? [hit] : [];
      pathRef.current = next;
      setPath(next);
      cb.current.onChange(next.join(','));
    },
    onPanResponderMove: (e, g) => {
      const x = start.current.x + g.dx;
      const y = start.current.y + g.dy;
      setCurrent({ x, y });
      const hit = findHit(x, y);
      if (hit && !pathRef.current.includes(hit)) {
        const next = [...pathRef.current, hit];
        pathRef.current = next;
        setPath(next);
        cb.current.onChange(next.join(','));
      }
    },
    onPanResponderRelease: () => {
      setCurrent(null);
      cb.current.onChange(pathRef.current.join(','));
      cb.current.onDrawEnd?.();
    },
    onPanResponderTerminate: () => {
      setCurrent(null);
      cb.current.onChange(pathRef.current.join(','));
      cb.current.onDrawEnd?.();
    },
  })).current;

  return (
    <View {...responder.panHandlers} style={{ width: PAD_SIZE, height: PAD_SIZE }}>
      <Svg style={StyleSheet.absoluteFill} width={PAD_SIZE} height={PAD_SIZE}>
        {path.map((dot, idx) => {
          if (idx === 0) return null;
          const a = dotCenter(path[idx - 1], cell);
          const b = dotCenter(dot, cell);
          return <Line key={`l${idx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={EST.primary} strokeWidth={3.5} strokeLinecap="round" />;
        })}
        {path.length > 0 && current ? (() => {
          const last = dotCenter(path[path.length - 1], cell);
          return <Line x1={last.x} y1={last.y} x2={current.x} y2={current.y} stroke={EST.primary} strokeWidth={3} opacity={0.4} />;
        })() : null}
      </Svg>
      {Array.from({ length: 9 }, (_, i) => i + 1).map((dot) => {
        const c = dotCenter(dot, cell);
        const active = path.includes(dot);
        const size = active ? DOT_ON : DOT;
        return (
          <View
            key={dot}
            pointerEvents="none"
            style={{ position: 'absolute', left: c.x - DOT_BOX, top: c.y - DOT_BOX, width: DOT_BOX * 2, height: DOT_BOX * 2, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: active ? EST.primary : EST.placeholder }} />
          </View>
        );
      })}
    </View>
  );
}

function FlagPill({ label, active, tint, tintBg, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!active }}
      style={({ pressed }) => [{
        flex: 1, minHeight: 30, paddingHorizontal: 4, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? tintBg : EST.white, borderWidth: active ? 1.5 : 1, borderColor: active ? tint : EST.border,
      }, pressed && { opacity: 0.8 }]}
    >
      {active ? <X size={10} color={tint} strokeWidth={2.75} style={{ marginRight: 2 }} /> : null}
      <EText style={{ flexShrink: 1, fontSize: 11, fontWeight: '700', color: active ? tint : EST.muted }} numberOfLines={1}>{label}</EText>
    </Pressable>
  );
}

const lockInput = {
  marginTop: 8, minHeight: 42, borderRadius: 10, paddingHorizontal: 12, backgroundColor: EST.white,
  borderWidth: 1, borderColor: EST.border, color: EST.text,
};
const sectionTitle = { fontSize: 14, fontWeight: '700', color: EST.text, marginBottom: 8 };

export default function PickupDevicesRepairScreen({ navigation, route }) {
  useSecureScreen(); // the lock secret is shown/entered here
  useHideNativeHeader(navigation);
  const { width } = useWindowDimensions();
  const params = route?.params || {};
  const draft = params.repairDraft || null;
  const booking = params.booking || null;
  const bookingId = params.bookingId || booking?.id;
  const deviceCategoryId = params.deviceCategoryId || booking?.deviceCategoryId || null;
  const showImei = useImeiApplies(params);
  const isTablet = width >= 600;
  const colW = Math.min(width, 720);

  // ── Repair issues (from PickupDeviceServicesScreen) ──────────────────────
  const [services, setServices] = useState([]);
  const [mainCats, setMainCats] = useState([]);
  const [grouped, setGrouped] = useState(null);
  const [loading, setLoading] = useState(true);

  const prefillServices = useMemo(
    () => normalizePrefillServices(params.prefillServices, booking?.services),
    [params.prefillServices, booking?.services],
  );
  const seed = useMemo(() => {
    const rowSeed = {};
    const idSeed = new Set();
    for (const s of prefillServices) {
      if (!s?.serviceId) continue;
      rowSeed[s.serviceId] = { price: String(s.price ?? ''), warranty: s.warranty || '' };
      idSeed.add(s.serviceId);
    }
    return { rowSeed, idSeed };
  }, [prefillServices]);
  const [rows, setRows] = useState(() => (draft?.rows ? { ...draft.rows } : seed.rowSeed));
  const [pickedIds, setPickedIds] = useState(() => new Set(draft?.pickedIds || seed.idSeed));
  const [customIssues, setCustomIssues] = useState(() => (
    Array.isArray(draft?.customIssues) ? draft.customIssues.map((c) => ({ ...c }))
      : customFromSources(params.prefillServices, booking?.services)
  ));
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [issueSheet, setIssueSheet] = useState(null);
  const [query, setQuery] = useState('');
  const [viewAll, setViewAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, c, g] = await Promise.all([
          listAllRepairServices().catch(() => []),
          listRepairCategories({}).catch(() => []),
          deviceCategoryId ? listRepairServicesGrouped(deviceCategoryId).catch(() => []) : Promise.resolve([]),
        ]);
        setServices(s);
        setMainCats(c);
        setGrouped(Array.isArray(g) ? g : []);
      } catch (_) {}
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allServices = useMemo(() => {
    const normalized = (services || []).filter((s) => s?.id).map((s) => ({ ...s, id: String(s.id) }));
    const existingIds = new Set(normalized.map((s) => s.id));
    const missingSelected = prefillServices
      .filter((s) => s.serviceId && !existingIds.has(s.serviceId))
      .map((s) => ({ id: s.serviceId, code: s.serviceCode, name: s.serviceName, categoryId: '__customer_selected__' }));
    return [...normalized, ...missingSelected];
  }, [services, prefillServices]);

  const groups = useMemo(() => {
    const byId = new Map(allServices.map((s) => [s.id, s]));
    const out = [];
    const seen = new Set();
    if (deviceCategoryId && grouped && grouped.length > 0) {
      for (const g of grouped) {
        const list = (g.issues || []).map((i) => byId.get(String(i.id))).filter(Boolean);
        if (!list.length) continue;
        list.forEach((s) => seen.add(s.id));
        out.push({ id: String(g.id), name: g.name, services: list });
      }
      const extra = allServices.filter((s) => s.categoryId === '__customer_selected__' && !seen.has(s.id));
      if (extra.length) out.push({ id: '__customer_selected__', name: 'Customer Selected Issues', services: extra });
      return out;
    }
    const catById = {};
    (mainCats || []).forEach((c) => { catById[c.id] = c; });
    const byCat = new Map();
    allServices.forEach((s) => {
      const key = s.categoryId || '__ungrouped__';
      if (!byCat.has(key)) {
        byCat.set(key, {
          id: key,
          name: key === '__customer_selected__' ? 'Customer Selected Issues' : (catById[key]?.name || 'Other'),
          services: [],
        });
      }
      byCat.get(key).services.push(s);
    });
    return Array.from(byCat.values());
  }, [allServices, mainCats, grouped, deviceCategoryId]);

  const serviceById = useMemo(() => {
    const m = {};
    allServices.forEach((s) => { m[s.id] = s; });
    return m;
  }, [allServices]);

  const ensureRow = (id) => rows[id] || { price: '', warranty: '' };
  const setField = (id, key, value) => {
    setRows((p) => ({ ...p, [id]: { ...(p[id] || { price: '', warranty: '' }), [key]: value } }));
  };
  const addService = (s) => setPickedIds((p) => { const n = new Set(p); n.add(String(s.id)); return n; });
  const removeService = (s) => setPickedIds((p) => { const n = new Set(p); n.delete(String(s.id)); return n; });

  // ── IMEI / complaint / schedule / approval ───────────────────────────────
  const [now] = useState(() => new Date());
  const [imei, setImei] = useState(draft?.imei ?? params.prefillImei ?? '');
  const initText = useMemo(() => splitComplaint(params.prefillComplaint ?? booking?.issueSummary ?? ''), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [notes, setNotes] = useState(draft ? (draft.notes ?? '') : initText.notes);
  const [notesOpen, setNotesOpen] = useState(() => !!(draft ? draft.notes : initText.notes));
  const [accessories, setAccessories] = useState(draft ? (draft.accessories ?? '') : initText.accessories);
  const [deliveryMs, setDeliveryMs] = useState(() => {
    const t0 = now.getTime();
    const fromIso = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isFinite(t) && t > t0 ? t : null; };
    if (draft?.duration != null) {
      if (typeof draft.duration === 'number') return t0 + draft.duration * 3600000;
      const t = fromIso(draft.duration);
      if (t) return t;
    }
    return fromIso(params.prefillEstimatedDeliveryIso) || t0 + 2 * 3600000;
  });
  const [dateSheet, setDateSheet] = useState(false);
  const [timeSheet, setTimeSheet] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [approval, setApproval] = useState(() => (draft ? !!draft.approval : !!params.prefillCustomerApproved));

  // ── Photos (from PickupDeviceInformationScreen) ──────────────────────────
  const [photos, setPhotos] = useState(() => {
    const p = draft?.photos || params.prefillDevicePhotos;
    return p && typeof p === 'object' ? { ...p } : {};
  });
  const [uploading, setUploading] = useState(null);

  // ── Missing parts ────────────────────────────────────────────────────────
  const [partsState, setPartsState] = useState(() => {
    if (draft?.partsState) return { ...draft.partsState };
    const prefill = Array.isArray(params.prefillMissingParts) ? params.prefillMissingParts : [];
    const idByName = {};
    for (const p of PARTS) idByName[p.name.trim().toLowerCase()] = p.id;
    const sd = {};
    for (const p of prefill) {
      let key = p.partId || p.id;
      if (!key && p.partName) key = idByName[String(p.partName).trim().toLowerCase()];
      if (!key) continue;
      sd[key] = { missing: !!p.missing, damage: !!p.damage, detail: p.detail || '' };
    }
    return sd;
  });
  const setPartField = (id, key, value) => setPartsState((p) => ({ ...p, [id]: { ...(p[id] || {}), [key]: value } }));
  const flaggedItems = useMemo(() => {
    const items = [];
    for (const p of PARTS) {
      const row = partsState[p.id] || {};
      if (row.missing || row.damage) {
        items.push({ partId: p.id, partName: p.name, missing: !!row.missing, damage: !!row.damage, detail: row.detail || null });
      }
    }
    return items;
  }, [partsState]);
  const [partsOpen, setPartsOpen] = useState(false);
  const [listW, setListW] = useState(0);

  // ── Device security ──────────────────────────────────────────────────────
  const initialLock = draft?.lock || params.prefillLock;
  const initType = initialLock?.type && LOCK_OPTIONS.some((o) => o.key === initialLock.type) ? initialLock.type : 'NONE';
  const initVal = initialLock?.value || '';
  const [lockType, setLockType] = useState(initType);
  const [pattern, setPattern] = useState(initType === 'PATTERN' ? initVal : '');
  const [pin, setPin] = useState(initType === 'PIN' ? initVal : '');
  const [password, setPassword] = useState(initType === 'PASSWORD' ? initVal : '');
  const [pwMasked, setPwMasked] = useState(true);
  const [padKey, setPadKey] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const patternDots = pattern.split(',').filter(Boolean).length;
  const lockReady = lockType === 'NONE'
    || (lockType === 'PIN' && (pin.length === 4 || pin.length === 6))
    || (lockType === 'PASSWORD' && password.length >= 4)
    || (lockType === 'PATTERN' && patternDots >= 4);
  const lockValue = lockType === 'PIN' ? pin : lockType === 'PASSWORD' ? password : lockType === 'PATTERN' ? pattern : '';
  const lockHint = lockType === 'PATTERN'
    ? 'Draw the pattern (at least 4 dots).'
    : lockType === 'PIN' ? 'Enter a 4 or 6 digit PIN.' : 'Enter the password (at least 4 characters).';
  const lockLabel = (LOCK_OPTIONS.find((o) => o.key === lockType) || LOCK_OPTIONS[0]).label;
  // Never the secret itself — only that one is set.
  const lockSummary = lockType === 'NONE' ? 'None'
    : !lockReady ? `${lockLabel} · incomplete`
    : lockType === 'PIN' ? `PIN set · ${pin.length} digits`
    : lockType === 'PASSWORD' ? 'Password set' : `Pattern set · ${patternDots} dots`;
  const cell = Math.max(52, Math.min(80, Math.floor((colW - 32 - 24 - 16) / 3)));

  // ── Capture / upload (reuses uploadMedia + the old output shape) ─────────
  const upload = async (slotKey, isVideo, fromCamera) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      notify('Permission needed', fromCamera ? 'Allow camera access to capture photos.' : 'Allow media library access to attach photos.');
      return;
    }
    try {
      const opts = { mediaTypes: isVideo ? ['videos'] : ['images'], allowsEditing: false, quality: 0.7, videoMaxDuration: 30 };
      const result = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploading(slotKey);
      const res = await uploadMedia({
        uri: asset.uri,
        name: asset.fileName,
        type: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        folder: `pickup-estimates/${bookingId}`,
        slot: slotKey,
      });
      const url = res?.url || res?.secure_url;
      if (!url) throw new Error('Upload failed. Please try again.');
      setPhotos((m) => ({ ...m, [slotKey]: url }));
    } catch (e) {
      notify('Upload failed', userMessage(e, 'Please try again.'), { type: 'error' });
    } finally {
      setUploading(null);
    }
  };
  const addPhoto = (fromCamera) => {
    const slot = !photos.front ? 'front' : !photos.back ? 'back' : null;
    if (slot) upload(slot, false, fromCamera);
  };
  const addVideo = () => upload('video', true, false);
  const removePhoto = (key) => setPhotos((m) => { const n = { ...m }; delete n[key]; return n; });
  const canAddPhoto = !photos.front || !photos.back;

  // ── Save & Continue ──────────────────────────────────────────────────────
  const totalSelected = pickedIds.size + customIssues.length;
  const goingRef = useRef(false);
  const addCustom = () => {
    const name = otherText.trim();
    setOtherOpen(false);
    setOtherText('');
    if (!name) return;
    setCustomIssues((l) => (l.some((c) => c.name.toLowerCase() === name.toLowerCase()) ? l : [...l, { id: newCustomId(), name, price: '', warranty: '' }]));
  };
  const setCustomField = (id, key, value) => setCustomIssues((l) => l.map((c) => (c.id === id ? { ...c, [key]: value } : c)));
  const onScanned = (value) => {
    const m = /\d{15}/.exec(String(value || ''));
    if (!m) return false;
    setImei(m[0]);
    setScanOpen(false);
    return true;
  };
  const pickDate = (dayStartMs) => {
    const cur = new Date(deliveryMs);
    const d = new Date(dayStartMs);
    d.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
    let t = d.getTime();
    if (t <= Date.now()) t = ceilSlot(Date.now() + 60000);
    setDeliveryMs(t);
    setDateSheet(false);
  };
  const pickTime = (ms) => { setDeliveryMs(ms); setTimeSheet(false); };
  const onContinue = () => {
    if (goingRef.current || uploading || !ready) return; // photos are required, IMEI optional (see `ready`)
    const selected = [
      ...[...pickedIds].map((id) => {
        const s = serviceById[id]; const r = ensureRow(id);
        return { serviceId: id, serviceCode: s?.code, serviceName: s?.name, price: priceNum(r.price), warranty: r.warranty || null };
      }),
      ...customIssues.map((c) => ({ serviceId: null, serviceCode: null, serviceName: c.name, price: priceNum(c.price), warranty: c.warranty || null })),
    ];
    if (selected.length === 0) return;
    // Prices are optional (Partner "Not Estimated"): an issue without one goes on at ₹0.
    // Partner complaintText rule: notes, else the selected issue names; accessories as a final line.
    const complaintText = [
      notes.trim() || selected.map((x) => x.serviceName).filter(Boolean).join(', '),
      accessories.trim() ? `Accessories: ${accessories.trim()}` : '',
    ].filter(Boolean).join('\n');
    if (!lockReady) {
      setLockOpen(true);
      notify('Device security incomplete', lockHint, { type: 'error' });
      return;
    }
    goingRef.current = true;
    setTimeout(() => { goingRef.current = false; }, 800);
    // Stamp "ready at" at submit time (the on-screen preview is frozen at mount).
    const submittedAt = new Date();
    const submittedDelivery = new Date(Math.max(deliveryMs, submittedAt.getTime() + 3600000));
    const duration = Math.max(1, Math.round((submittedDelivery.getTime() - submittedAt.getTime()) / 3600000));
    navigation.navigate('PickupServiceBookingDevicesList', {
      ...params,
      repairDraft: undefined,
      bookingId,
      booking,
      services: selected,
      imei: showImei ? imeiDigits : '',
      complaint: complaintText,
      estimatedAt: `${formatDate(submittedAt)} ${formatTime24(submittedAt)}, ${duration}Hr`,
      estimatedDelivery: `${formatDate(submittedDelivery)} - ${formatTime24(submittedDelivery)}`,
      estimatedReadyIso: submittedAt.toISOString(),
      estimatedDeliveryIso: submittedDelivery.toISOString(),
      durationHours: duration,
      customerApproved: approval,
      devicePhotos: photos,
      lock: lockType === 'NONE' ? { type: 'NONE', value: '' } : { type: lockType, value: lockValue },
      missingParts: flaggedItems,
    });
  };

  // "Change" → back to Device Details with this form saved (in-memory route params only).
  const onChangeDevice = () => {
    navigation.popTo('PickupDeviceDetails', {
      ...params,
      repairDraft: {
        rows, pickedIds: [...pickedIds], customIssues, imei, notes, accessories, duration: new Date(deliveryMs).toISOString(), approval, photos, partsState,
        lock: { type: lockType, value: lockValue },
      },
    });
  };

  // ── Derived display ──────────────────────────────────────────────────────
  const delivery = new Date(deliveryMs);
  const spanHours = Math.max(1, Math.round((deliveryMs - now.getTime()) / 3600000));
  const dayOptions = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return { ms: d.getTime(), label: dateLabelOf(d, now) };
  });
  const timeOptions = (() => {
    const base = new Date(deliveryMs); base.setHours(0, 0, 0, 0);
    const b0 = base.getTime();
    const out = [];
    for (let i = 0; i < 48; i++) {
      const t = b0 + i * SLOT_MS;
      if (t > Date.now()) out.push({ ms: t, label: formatTime12(new Date(t)) });
    }
    return out;
  })();
  const customerName = booking?.customerName || params.customerName || null;
  const customerPhone = booking?.customerPhone || booking?.customerMobile || booking?.phone || params.customerPhone || null;
  const brand = params.brandName || params.brand?.name || booking?.brandName;
  const model = params.modelName || params.model?.name || booking?.modelName;
  const deviceName = [brand && !String(model || '').toLowerCase().startsWith(String(brand).toLowerCase()) ? brand : null, model].filter(Boolean).join(' ') || 'Device';
  const colorText = params.color || booking?.color || null;
  const deviceSpec = [
    [params.ramLabel || booking?.ramLabel, params.storageLabel || booking?.storageLabel].filter(Boolean).join(' / '), colorText,
  ].filter(Boolean).join(' · ');
  const modelNumber = params.modelNumber || params.model?.modelNumber || booking?.modelNumber || null;
  const imgProps = {
    url: params.modelImageUrl || params.model?.imageUrl || booking?.deviceImageUrl || booking?.modelImageUrl || null,
    base64: params.modelImageBase64 || params.model?.imageBase64 || booking?.deviceImageBase64 || booking?.modelImageBase64 || null,
  };

  const TILE_ORDER = [/dead|no power/i, /display|screen/i, /battery/i, /motherboard|mainboard|sub-?board/i, /network/i, /security/i];
  const tileRank = (name) => {
    const i = TILE_ORDER.findIndex((re) => re.test(String(name || '')));
    return i === -1 ? TILE_ORDER.length : i;
  };
  const tileGroups = useMemo(() => groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => tileRank(a.g.name) - tileRank(b.g.name) || a.i - b.i)
    .map(({ g }) => g), [groups]);
  const q = query.trim().toLowerCase();
  const matched = q
    ? tileGroups.filter((g) => String(g.name || '').toLowerCase().includes(q) || g.services.some((s) => String(s.name || '').toLowerCase().includes(q)))
    : tileGroups;
  const tileCols = isTablet ? 5 : 3;
  const visibleGroups = q || viewAll ? matched : matched.slice(0, FIRST_TILES);
  const sheetGroup = groups.find((g) => g.id === issueSheet) || null;
  const flaggedCount = flaggedItems.length;

  const header = (
    <View>
      <EstimateHeader title="Devices & Repair" subtitle="Add device and repair details" onBack={onChangeDevice} sticky={false} />
      <View style={{ borderBottomWidth: 1, borderBottomColor: EST.border, backgroundColor: EST.white }}>
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}><StepProgress active={1} /></View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: EST.white }}>
        {header}
        <PickerLoader label="Loading issues…" />
      </View>
    );
  }

  const gapPartCards = 8;
  const partCols = isTablet ? 3 : 2;
  const partW = listW ? Math.floor((listW - gapPartCards * (partCols - 1)) / partCols) : 0;
  const mediaItems = [
    ...['front', 'back'].filter((k) => photos[k]).map((k) => ({ key: k, url: photos[k], label: k === 'front' ? 'Front Side' : 'Back Side' })),
    ...(photos.video ? [{ key: 'video', url: photos.video, label: 'Video' }] : []),
  ];
  const photoBusy = uploading === 'front' || uploading === 'back';
  const mediaBtns = [
    { key: 'camera', label: 'Camera', icon: 'photo-camera', off: !canAddPhoto, busy: photoBusy, onPress: () => addPhoto(true) },
    { key: 'gallery', label: 'Gallery', icon: 'photo-library', off: !canAddPhoto, busy: photoBusy, onPress: () => addPhoto(false) },
    { key: 'video', label: 'Video', icon: 'videocam', off: !!photos.video, busy: uploading === 'video', onPress: addVideo },
  ];
  // Required: a repair issue and both device photos (front + back; video stays
  // optional). The IMEI is optional — when typed it must be valid (14–17 digits, the Partner rule).
  const photosOk = !!photos.front && !!photos.back;
  const photoCount = [photos.front, photos.back].filter(Boolean).length;
  const imeiDigits = imei.replace(/\D/g, '');
  const imeiOk = !showImei || !imeiDigits.length || (imeiDigits.length >= 14 && imeiDigits.length <= 17);
  const ready = totalSelected > 0 && !uploading && photosOk && imeiOk;
  const missingHint = uploading ? 'Uploading device media…'
    : totalSelected === 0 ? 'Select at least one repair issue.'
      : !photosOk ? `Add ${2 - photoCount} more device ${2 - photoCount === 1 ? 'photo' : 'photos'} (front and back).`
        : !imeiOk ? 'Enter a valid IMEI (15 digits) or leave it empty.' : '';

  return (
    <View style={{ flex: 1, backgroundColor: EST.white }}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          scrollEnabled={!drawing}
          contentContainerStyle={{ paddingBottom: BOTTOM_BAR_SPACE + 48 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <CustomerCard compact name={customerName} phone={customerPhone} />
            </View>

            {/* Device Information */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <EText style={sectionTitle}>Device Information</EText>
              <View style={[cardStyle, { flexDirection: 'row', alignItems: 'center', padding: 10 }]}>
                <View style={{ height: 56, width: 56, borderRadius: 12, backgroundColor: EST.page, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <DeviceImage {...imgProps} style={{ width: '88%', height: '88%' }} />
                  {!(imgProps.url || imgProps.base64) ? <Smartphone size={26} color={EST.muted} strokeWidth={1.75} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                  <EText numberOfLines={2} style={{ fontSize: 14, fontWeight: '800', color: EST.text }}>{deviceName}</EText>
                  {deviceSpec ? <EText numberOfLines={1} style={{ fontSize: 12, color: EST.muted, marginTop: 1 }}>{deviceSpec}</EText> : null}
                  {modelNumber ? <EText numberOfLines={1} style={{ fontSize: 11.5, color: EST.muted, marginTop: 1 }}>{modelNumber}</EText> : null}
                </View>
                <Pressable
                  onPress={onChangeDevice}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Change device"
                  style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: EST.primary, backgroundColor: EST.white }, pressed && { opacity: 0.7 }]}
                >
                  <EText style={{ fontSize: 12.5, fontWeight: '800', color: EST.primary }}>Change</EText>
                </Pressable>
              </View>
            </View>

            {/* Repair Issues */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <EText style={sectionTitle}>Repair Issues<EText style={{ color: EST.red }}> *</EText></EText>
              <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', paddingHorizontal: 12, marginBottom: 8 }}>
                <Search size={17} color={EST.muted} strokeWidth={2} />
                <ETextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search issue (e.g. display, battery)"
                  returnKeyType="search"
                  autoCorrect={false}
                  cursorColor={EST.primary}
                  accessibilityLabel="Search repair issue"
                  style={{ flex: 1, marginLeft: 8, paddingVertical: 0, fontSize: 13.5, color: EST.text, includeFontPadding: false }}
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear issue search">
                    <X size={16} color={EST.muted} />
                  </Pressable>
                ) : null}
              </View>
              {q && matched.length === 0 ? (
                <EText style={{ fontSize: 12, color: EST.muted, marginBottom: 6 }}>No matching issues. Use Other Issue to add it.</EText>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
                {visibleGroups.map((g) => (
                  <View key={g.id} style={{ width: `${100 / tileCols}%`, padding: 3 }}>
                    <IssueTile
                      name={g.name}
                      Icon={groupIconFor(g.name)}
                      picked={g.services.filter((s) => pickedIds.has(String(s.id))).length}
                      onPress={() => setIssueSheet(g.id)}
                    />
                  </View>
                ))}
                <View style={{ width: `${100 / tileCols}%`, padding: 3 }}>
                  <IssueTile name="Other Issue" Icon={MessageSquarePlus} picked={customIssues.length} onPress={() => { setOtherText(''); setOtherOpen(true); }} />
                </View>
              </View>
              {!q && matched.length > FIRST_TILES ? (
                <Pressable
                  onPress={() => setViewAll((v) => !v)}
                  accessibilityRole="button"
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }, pressed && { opacity: 0.7 }]}
                >
                  <EText style={{ fontSize: 12.5, fontWeight: '700', color: EST.primary }}>{viewAll ? 'Show less' : `View All (${matched.length})`}</EText>
                  <ChevronDown size={14} color={EST.primary} style={{ marginLeft: 2, transform: [{ rotate: viewAll ? '180deg' : '0deg' }] }} />
                </Pressable>
              ) : null}

              {totalSelected > 0 ? (
                <View style={{ marginTop: 10 }}>
                  {(() => {
                    const est = [...pickedIds].reduce((t, id) => t + priceNum(ensureRow(id).price), 0) + customIssues.reduce((t, c) => t + priceNum(c.price), 0);
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <EText style={[sectionTitle, { marginBottom: 0 }]}>Selected Services ({totalSelected})</EText>
                        <EText style={{ fontSize: 14, fontWeight: '700', color: est > 0 ? EST.primary : EST.muted }}>{est > 0 ? `₹${est.toLocaleString('en-IN')}` : 'Not Estimated'}</EText>
                      </View>
                    );
                  })()}
                  {[...pickedIds].map((id) => {
                    const s = serviceById[id];
                    if (!s) return null;
                    return (
                      <SelectedIssueRow
                        key={id}
                        name={s.name}
                        Icon={iconFor(s.code, s.name)}
                        price={ensureRow(id).price}
                        onPriceChange={(v) => setField(id, 'price', v)}
                        warranty={ensureRow(id).warranty}
                        onWarrantyChange={(v) => setField(id, 'warranty', v)}
                        onRemove={() => removeService(s)}
                      />
                    );
                  })}
                  {customIssues.map((c) => (
                    <SelectedIssueRow
                      key={c.id}
                      name={c.name}
                      Icon={Sparkles}
                      price={c.price}
                      onPriceChange={(v) => setCustomField(c.id, 'price', v)}
                      warranty={c.warranty}
                      onWarrantyChange={(v) => setCustomField(c.id, 'warranty', v)}
                      onRemove={() => setCustomIssues((l) => l.filter((i) => i.id !== c.id))}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            {/* Issue Notes (optional) — styled like Partner's Record Voice Note row */}
            <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
              <View style={[cardStyle, { padding: 12 }]}>
                <Pressable
                  onPress={() => setNotesOpen((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={notesOpen ? 'Hide issue notes' : 'Show issue notes'}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center' }, pressed && { opacity: 0.7 }]}
                >
                  <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: EST.soft, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                    <NotebookPen size={18} color={EST.primary} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <EText style={{ fontSize: 13, fontWeight: '700', color: EST.text }}>
                      Issue Notes
                      <EText style={{ fontSize: 12, fontWeight: '400', color: EST.muted }}> (optional)</EText>
                    </EText>
                    {!notesOpen && notes.trim() ? (
                      <EText style={{ fontSize: 12, color: EST.muted, marginTop: 1 }} numberOfLines={1}>{notes.trim()}</EText>
                    ) : null}
                  </View>
                  {notesOpen
                    ? <ChevronDown size={18} color="#9CA3AF" strokeWidth={2} />
                    : <ChevronRight size={18} color="#9CA3AF" strokeWidth={2} />}
                </Pressable>
                {notesOpen ? (
                  <ETextInput
                    placeholder="Describe the issue"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    cursorColor={EST.primary}
                    style={{
                      marginTop: 10, minHeight: 88, borderWidth: 1, borderColor: EST.border, borderRadius: 12, backgroundColor: EST.white,
                      paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: EST.text,
                    }}
                  />
                ) : null}
              </View>
            </View>

            {/* IMEI */}
            {showImei ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <EText style={sectionTitle}>IMEI Number<EText style={{ color: EST.muted, fontWeight: '600' }}> (Optional)</EText></EText>
                <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, borderWidth: 1, borderColor: imeiDigits.length && !imeiOk ? EST.red : EST.border, borderRadius: 12, backgroundColor: EST.white, paddingLeft: 12, paddingRight: 6 }}>
                  <Barcode size={20} color={EST.text} strokeWidth={1.75} />
                  <ETextInput
                    placeholder="Enter 15-digit IMEI"
                    value={imei}
                    onChangeText={setImei}
                    keyboardType="number-pad"
                    maxLength={17}
                    cursorColor={EST.primary}
                    style={{ flex: 1, marginLeft: 10, paddingVertical: 0, fontSize: 14, color: EST.text }}
                  />
                  <Pressable
                    onPress={() => setScanOpen(true)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Scan IMEI barcode"
                    style={({ pressed }) => [{ height: 34, width: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.7 }]}
                  >
                    <ScanLine size={20} color={EST.text} strokeWidth={1.75} />
                  </Pressable>
                </View>
                {imeiDigits.length && !imeiOk ? (
                  <EText style={{ fontSize: 12, color: EST.red, marginTop: 4 }}>IMEI must be 15 digits ({imeiDigits.length} entered).</EText>
                ) : null}
              </View>
            ) : null}

            {/* Device Photo or Video */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <EText style={sectionTitle}>Device Photos<EText style={{ color: EST.red }}> *</EText></EText>
              <EText style={{ fontSize: 12, color: photosOk ? EST.muted : EST.red, marginTop: -4, marginBottom: 8 }}>
                {photosOk ? 'Front and back photos added · video optional' : `Front and back photos required (${photoCount}/2) · video optional`}
              </EText>
              <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
                {mediaBtns.map((b) => {
                  const off = b.off || !!uploading;
                  return (
                    <View key={b.key} style={{ flex: 1, paddingHorizontal: 4 }}>
                      <Pressable
                        onPress={off ? undefined : b.onPress}
                        disabled={off}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${b.label.toLowerCase()}`}
                        accessibilityState={{ disabled: off }}
                        style={({ pressed }) => [{
                          height: 44, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                          borderColor: off ? EST.border : MINT_EDGE, backgroundColor: off ? EST.page : EST.soft, opacity: off ? 0.6 : 1,
                        }, pressed && { opacity: 0.8 }]}
                      >
                        {b.busy ? <ActivityIndicator size="small" color={EST.primary} /> : <MaterialIcons name={b.icon} size={19} color={off ? EST.muted : EST.primary} />}
                        <EText numberOfLines={1} style={{ marginLeft: 6, fontSize: 13, fontWeight: '700', color: off ? EST.muted : EST.primary }}>{b.label}</EText>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              {mediaItems.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {mediaItems.map((m) => (
                    <View key={m.key} style={{ width: `${100 / (isTablet ? 5 : 3) - 0.1}%`, padding: 4 }}>
                      <View style={{ aspectRatio: 1, borderRadius: 12, borderWidth: 1, borderColor: EST.border, backgroundColor: EST.page, overflow: 'hidden' }}>
                        {looksLikeVideo(m.url) ? (
                          <View style={{ flex: 1, backgroundColor: EST.text, alignItems: 'center', justifyContent: 'center' }}>
                            <Video size={24} color="#FFFFFF" />
                            <EText style={{ color: '#FFFFFF', fontWeight: '700', marginTop: 2, fontSize: 9 }}>VIDEO</EText>
                          </View>
                        ) : (
                          <Image source={{ uri: m.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        )}
                        <Pressable
                          onPress={() => removePhoto(m.key)}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${m.label}`}
                          style={{ position: 'absolute', top: 5, right: 5, height: 22, width: 22, borderRadius: 11, backgroundColor: 'rgba(17,17,17,0.7)', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <X size={13} color="#FFFFFF" />
                        </Pressable>
                      </View>
                      <EText style={{ marginTop: 4, fontSize: 11.5, fontWeight: '600', color: EST.muted, textAlign: 'center' }} numberOfLines={1}>{m.label}</EText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Device Additional Accessories */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <EText style={sectionTitle}>Device Additional Accessories<EText style={{ fontWeight: '400', color: EST.muted }}> (Optional)</EText></EText>
              <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, borderWidth: 1, borderColor: EST.border, borderRadius: 12, backgroundColor: EST.white, paddingHorizontal: 12 }}>
                <MaterialIcons name="devices-other" size={20} color={EST.text} />
                <ETextInput
                  value={accessories}
                  onChangeText={setAccessories}
                  placeholder="Enter charger, case, SIM tray, etc."
                  maxLength={200}
                  cursorColor={EST.primary}
                  style={{ flex: 1, marginLeft: 10, paddingVertical: 0, fontSize: 14, color: EST.text }}
                />
              </View>
            </View>

            {/* More Device Details */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <EText style={sectionTitle}>More Device Details</EText>
              <View style={[cardStyle, { overflow: 'hidden', borderRadius: 14 }]}>
                <Pressable
                  onPress={() => setPartsOpen((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: partsOpen }}
                  accessibilityLabel="Missing or damaged parts, optional"
                  style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 12 }}
                >
                  <EText style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: EST.text }} numberOfLines={1}>
                    Missing / Damaged Parts<EText style={{ fontWeight: '400', color: EST.muted }}> (Optional)</EText>
                  </EText>
                  {flaggedCount ? (
                    <EText style={{ fontSize: 11.5, fontWeight: '800', color: EST.red, marginRight: 6 }}>{flaggedCount} Part{flaggedCount === 1 ? '' : 's'} Flagged</EText>
                  ) : null}
                  <ChevronDown size={18} color={EST.text} strokeWidth={2} style={{ transform: [{ rotate: partsOpen ? '180deg' : '0deg' }] }} />
                </Pressable>
                {partsOpen ? (
                  <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                    <EText style={{ fontSize: 12, color: EST.muted, marginBottom: 8 }}>
                      Flag any part that is missing or damaged on this device. Leave all unflagged if nothing is missing.
                    </EText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gapPartCards }} onLayout={(e) => setListW(e.nativeEvent.layout.width)}>
                      {partW ? PARTS.map((p) => {
                        const row = partsState[p.id] || {};
                        const anyFlag = row.missing || row.damage;
                        const flagColor = row.damage ? DAMAGE : MISSING;
                        const flagBg = row.damage ? DAMAGE_BG : MISSING_BG;
                        const PIcon = p.icon;
                        return (
                          <View key={p.id} style={{ width: partW, borderRadius: 14, padding: 10, backgroundColor: anyFlag ? flagBg : EST.white, borderWidth: anyFlag ? 1.5 : 1, borderColor: anyFlag ? flagColor : EST.border }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <View style={{ height: 32, width: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: anyFlag ? EST.white : EST.soft }}>
                                <PIcon size={16} color={anyFlag ? flagColor : EST.primary} strokeWidth={2} />
                              </View>
                              <EText style={{ flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '800', color: EST.text }} numberOfLines={2}>{p.name}</EText>
                            </View>
                            <View style={{ flexDirection: 'row', marginTop: 10, gap: 6 }}>
                              <FlagPill label="Missing" active={!!row.missing} tint={MISSING} tintBg={MISSING_BG} onPress={() => setPartField(p.id, 'missing', !row.missing)} />
                              <FlagPill label="Damaged" active={!!row.damage} tint={DAMAGE} tintBg={DAMAGE_BG} onPress={() => setPartField(p.id, 'damage', !row.damage)} />
                            </View>
                            {anyFlag ? (
                              <ETextInput
                                placeholder="Add details (optional)"
                                value={row.detail || ''}
                                onChangeText={(v) => setPartField(p.id, 'detail', v)}
                                autoCorrect={false}
                                style={{ marginTop: 8, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, fontSize: 12, color: EST.text, backgroundColor: EST.white, borderWidth: 1, borderColor: EST.border }}
                              />
                            ) : null}
                          </View>
                        );
                      }) : null}
                    </View>
                  </View>
                ) : null}

                <View style={{ height: 1, backgroundColor: EST.border }} />
                <Pressable
                  onPress={() => setLockOpen((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: lockOpen }}
                  accessibilityLabel={`Device security, ${lockSummary}`}
                  style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 12 }}
                >
                  <EText style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: EST.text }} numberOfLines={1}>
                    Device Security<EText style={{ fontWeight: '400', color: EST.muted }}> (Optional)</EText>
                  </EText>
                  <EText style={{ fontSize: 12, fontWeight: '700', color: lockType === 'NONE' ? EST.muted : EST.primary, marginRight: 6, maxWidth: '45%' }} numberOfLines={1}>{lockSummary}</EText>
                  <ChevronDown size={18} color={EST.text} strokeWidth={2} style={{ transform: [{ rotate: lockOpen ? '180deg' : '0deg' }] }} />
                </Pressable>
                {lockOpen ? (
                  <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
                    {LOCK_OPTIONS.map((o) => {
                      const on = lockType === o.key;
                      return (
                        <View key={o.key}>
                          <Pressable
                            onPress={() => setLockType(o.key)}
                            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingVertical: 6 }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={o.label}
                          >
                            <View style={{ height: 20, width: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? EST.primary : EST.white, borderWidth: on ? 0 : 1.5, borderColor: '#B8B8B8' }}>
                              {on ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
                            </View>
                            <EText style={{ flex: 1, marginLeft: 10, fontSize: 14, color: EST.text }} numberOfLines={1}>{o.label}</EText>
                          </Pressable>
                          {on && o.key === 'PIN' ? (
                            <ETextInput
                              value={pin}
                              onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
                              keyboardType="number-pad"
                              maxLength={6}
                              placeholder="Enter 4 or 6 digit PIN"
                              autoComplete="off"
                              textContentType="none"
                              autoCorrect={false}
                              style={[lockInput, { textAlign: 'center', letterSpacing: pin ? 6 : 0, fontWeight: '700', fontSize: 15 }]}
                            />
                          ) : null}
                          {on && o.key === 'PASSWORD' ? (
                            <View style={[lockInput, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0, paddingRight: 4 }]}>
                              <ETextInput
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={pwMasked}
                                placeholder="Enter password"
                                maxLength={16}
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="off"
                                textContentType="none"
                                spellCheck={false}
                                style={{ flex: 1, paddingHorizontal: 12, fontSize: 13, color: EST.text }}
                              />
                              <Pressable onPress={() => setPwMasked((m) => !m)} hitSlop={8} style={{ height: 36, width: 36, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={pwMasked ? 'Show password' : 'Hide password'}>
                                {pwMasked ? <Eye size={18} color={EST.muted} strokeWidth={2} /> : <EyeOff size={18} color={EST.muted} strokeWidth={2} />}
                              </Pressable>
                            </View>
                          ) : null}
                          {on && o.key === 'PATTERN' ? (
                            <View style={{ alignItems: 'center', marginTop: 6 }}>
                              <View style={{ borderRadius: 16, padding: 8, backgroundColor: EST.page }}>
                                <PatternPad key={padKey} value={pattern} onChange={setPattern} cell={cell} onDrawStart={() => setDrawing(true)} onDrawEnd={() => setDrawing(false)} />
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginTop: 8 }}>
                                <EText style={{ flex: 1, fontSize: 11.5, color: patternDots >= 4 ? EST.primary : EST.muted, fontWeight: '600' }} numberOfLines={1}>
                                  {patternDots} dot{patternDots === 1 ? '' : 's'}
                                </EText>
                                {pattern ? (
                                  <Pressable onPress={() => { setPattern(''); setPadKey((k) => k + 1); }} hitSlop={8} style={{ paddingHorizontal: 6 }} accessibilityRole="button" accessibilityLabel="Reset pattern">
                                    <EText style={{ fontSize: 11.5, fontWeight: '700', color: EST.red }}>Reset</EText>
                                  </Pressable>
                                ) : null}
                              </View>
                            </View>
                          ) : null}
                          {on && o.key !== 'NONE' && !lockReady && lockValue.length > 0 ? (
                            <EText style={{ fontSize: 12, fontWeight: '600', color: EST.red, marginTop: 6 }}>{lockHint}</EText>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </View>

            {/* Booking time + estimated delivery */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <EText style={sectionTitle}>Booking Time</EText>
              <View style={[cardStyle, { paddingHorizontal: 12, paddingVertical: 4 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 42 }}>
                  <MaterialIcons name="event-available" size={19} color={EST.text} />
                  <EText style={{ flex: 1, marginLeft: 8, fontSize: 13, color: EST.muted }}>Booking Time</EText>
                  <EText numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '700', color: EST.text }}>{dayWord(now, now)}, {formatTime12(now)}</EText>
                </View>
              </View>

              <EText style={{ fontSize: 12.5, fontWeight: '700', color: EST.text, marginTop: 10, marginBottom: 6 }}>Estimated &amp; Delivery Time</EText>
              <View style={{ flexDirection: 'row' }}>
                <Pressable
                  onPress={() => setDateSheet(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delivery date ${dateLabelOf(delivery, now)}. Change.`}
                  style={({ pressed }) => [{ flex: 1.2, height: 46, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: EST.border, borderRadius: 12, backgroundColor: EST.white, paddingHorizontal: 10, marginRight: 8 }, pressed && { opacity: 0.8 }]}
                >
                  <MaterialIcons name="calendar-month" size={19} color={EST.primary} />
                  <EText numberOfLines={1} style={{ flex: 1, marginLeft: 8, fontSize: 13.5, fontWeight: '700', color: EST.text }}>{dateLabelOf(delivery, now)}</EText>
                </Pressable>
                <Pressable
                  onPress={() => setTimeSheet(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delivery time ${formatTime12(delivery)}. Change.`}
                  style={({ pressed }) => [{ flex: 0.8, height: 46, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: EST.border, borderRadius: 12, backgroundColor: EST.white, paddingHorizontal: 10 }, pressed && { opacity: 0.8 }]}
                >
                  <MaterialIcons name="schedule" size={19} color={EST.primary} />
                  <EText numberOfLines={1} style={{ flex: 1, marginLeft: 8, fontSize: 13.5, fontWeight: '700', color: EST.text }}>{formatTime12(delivery)}</EText>
                </Pressable>
              </View>
              <EText style={{ fontSize: 11.5, color: EST.muted, marginTop: 5 }}>Ready in {spanLabel(spanHours)} from booking</EText>

              <Pressable
                onPress={() => setApproval(!approval)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: approval }}
                style={({ pressed }) => [{
                  marginTop: 16, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10,
                  backgroundColor: approval ? EST.soft : EST.white, borderWidth: 1, borderColor: approval ? MINT_EDGE : EST.border,
                }, pressed && { opacity: 0.8 }]}
              >
                {approval ? <CircleCheck size={20} color={EST.primary} strokeWidth={2} /> : <Circle size={20} color={HAIR} strokeWidth={2} />}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <EText style={{ fontSize: 12, fontWeight: '600', color: EST.text }}>Customer Booking Approval</EText>
                  <EText style={{ fontSize: 11, color: EST.muted, marginTop: 1 }}>
                    Customer has reviewed and approved the booking details, estimated service cost, and expected completion time.
                  </EText>
                </View>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <EstimateBottomBar>
        <EButton onPress={onContinue} disabled={!ready} rightIcon={<ArrowRight size={18} color="#FFFFFF" strokeWidth={2.25} />}>Save &amp; Continue</EButton>
        {!ready && missingHint ? (
          <EText style={{ fontSize: 12, color: EST.muted, textAlign: 'center', marginTop: 6 }}>{missingHint}</EText>
        ) : null}
      </EstimateBottomBar>

      <Modal visible={!!sheetGroup} transparent animationType="slide" onRequestClose={() => setIssueSheet(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,17,17,0.45)' }} onPress={() => setIssueSheet(null)} accessibilityLabel="Close" />
          <View style={{ backgroundColor: EST.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 24, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: EST.border, marginBottom: 10 }} />
            {sheetGroup ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  {(() => { const GIcon = groupIconFor(sheetGroup.name); return <GIcon size={20} color={EST.text} strokeWidth={1.75} />; })()}
                  <EText numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '800', color: EST.text }}>{sheetGroup.name}</EText>
                  <Pressable onPress={() => setIssueSheet(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                    <X size={20} color={EST.muted} />
                  </Pressable>
                </View>
                <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                  {sheetGroup.services.map((s) => {
                    const sid = String(s.id);
                    const on = pickedIds.has(sid);
                    const SIcon = iconFor(s.code, s.name);
                    return (
                      <Pressable
                        key={sid}
                        onPress={() => { if (on) removeService(s); else addService(s); setIssueSheet(null); }}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={({ pressed }) => [{
                          flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6,
                          borderRadius: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? EST.primary : EST.border, backgroundColor: on ? EST.soft : EST.white,
                        }, pressed && { opacity: 0.8 }]}
                      >
                        <SIcon size={19} color={on ? EST.primary : EST.text} strokeWidth={1.75} />
                        <EText numberOfLines={2} style={{ flex: 1, marginLeft: 12, fontSize: 13, fontWeight: on ? '700' : '500', color: EST.text }}>{s.name}</EText>
                        <View style={{ height: 20, width: 20, borderRadius: 6, borderWidth: 1.5, borderColor: on ? EST.primary : EST.placeholder, backgroundColor: on ? EST.primary : EST.white, alignItems: 'center', justifyContent: 'center' }}>
                          {on ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={otherOpen} transparent animationType="slide" onRequestClose={addCustom}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,17,17,0.45)' }} onPress={addCustom} accessibilityLabel="Close" />
          <View style={{ backgroundColor: EST.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 24, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: EST.border, marginBottom: 10 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <MessageSquarePlus size={20} color={EST.text} strokeWidth={1.75} />
              <EText style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '800', color: EST.text }}>Other Issue</EText>
              <Pressable onPress={addCustom} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <X size={20} color={EST.muted} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 46, borderRadius: 12, borderWidth: 1, borderColor: EST.border, backgroundColor: EST.white }}>
              <ETextInput
                value={otherText}
                onChangeText={setOtherText}
                autoFocus
                onSubmitEditing={addCustom}
                returnKeyType="done"
                placeholder="Describe the issue (e.g. Face ID not working)"
                cursorColor={EST.primary}
                style={{ flex: 1, paddingVertical: 0, fontSize: 13, color: EST.text }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <OptionSheet visible={dateSheet} title="Delivery date" onClose={() => setDateSheet(false)}>
        {dayOptions.map((o) => {
          const on = startOfDay(delivery) === o.ms;
          return <OptionRow key={o.ms} label={o.label} on={on} onPress={() => pickDate(o.ms)} />;
        })}
      </OptionSheet>
      <OptionSheet visible={timeSheet} title="Delivery time" onClose={() => setTimeSheet(false)}>
        {timeOptions.length === 0 ? (
          <EText style={{ fontSize: 13, color: EST.muted, paddingVertical: 12 }}>No time left today. Pick another date.</EText>
        ) : timeOptions.map((o) => (
          <OptionRow key={o.ms} label={o.label} on={o.ms === deliveryMs} onPress={() => pickTime(o.ms)} />
        ))}
      </OptionSheet>

      <ImeiScanModal visible={scanOpen} onClose={() => setScanOpen(false)} onScanned={onScanned} />
    </View>
  );
}

function OptionSheet({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,17,17,0.45)' }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: EST.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 24, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: EST.border, marginBottom: 10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <EText style={{ flex: 1, fontSize: 15, fontWeight: '800', color: EST.text }}>{title}</EText>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <X size={20} color={EST.muted} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function OptionRow({ label, on, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingHorizontal: 12, marginBottom: 6, borderRadius: 12,
        borderWidth: on ? 1.5 : 1, borderColor: on ? EST.primary : EST.border, backgroundColor: on ? EST.soft : EST.white,
      }, pressed && { opacity: 0.8 }]}
    >
      <EText style={{ flex: 1, fontSize: 13.5, fontWeight: on ? '700' : '500', color: EST.text }}>{label}</EText>
      {on ? <Check size={16} color={EST.primary} strokeWidth={3} /> : null}
    </Pressable>
  );
}

// Full-screen barcode scanner; fills the first 15-digit run found in the code.
function ImeiScanModal({ visible, onClose, onScanned }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [bad, setBad] = useState(false);
  const lockRef = useRef(false);
  useEffect(() => {
    if (visible) { lockRef.current = false; setBad(false); }
    if (visible && permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [visible, permission, requestPermission]);
  const onCode = ({ data }) => {
    if (lockRef.current) return;
    lockRef.current = true;
    if (onScanned(data)) return;
    setBad(true);
    setTimeout(() => { lockRef.current = false; }, 1200);
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'qr', 'datamatrix', 'pdf417'] }}
            onBarcodeScanned={onCode}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <EText style={{ color: '#FFFFFF', fontSize: 14, textAlign: 'center', marginBottom: 14 }}>Camera access is needed to scan the IMEI barcode.</EText>
            {permission?.canAskAgain ? (
              <Pressable onPress={requestPermission} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: EST.primary }} accessibilityRole="button">
                <EText style={{ color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' }}>Allow camera</EText>
              </Pressable>
            ) : null}
          </View>
        )}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 56, alignItems: 'center' }}>
          <EText style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}>
            {bad ? 'No 15-digit IMEI found. Try again.' : 'Point the camera at the IMEI barcode'}
          </EText>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
          style={{ position: 'absolute', top: 44, right: 16, height: 40, width: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

export function IssueTile({ name, Icon, picked, onPress }) {
  const on = picked > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}${picked > 0 ? `, ${picked} selected` : ''}`}
      // Partner RepairIssuesPicker IssueTile: compact, picked = teal edge, mint fill, count badge.
      style={({ pressed }) => [{
        minHeight: 74, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        borderWidth: on ? 1.5 : 1, borderColor: on ? EST.primary : EST.border, backgroundColor: on ? EST.soft : EST.white,
      }, pressed && { opacity: 0.8 }]}
    >
      {on ? (
        <View style={{ position: 'absolute', top: 5, right: 5, height: 16, minWidth: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: EST.primary, alignItems: 'center', justifyContent: 'center' }}>
          <EText style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>{picked}</EText>
        </View>
      ) : null}
      <Icon size={22} color={on ? EST.primary : EST.text} strokeWidth={1.75} />
      <EText numberOfLines={2} style={{ marginTop: 6, fontSize: 11.5, lineHeight: 14, fontWeight: on ? '700' : '500', color: EST.text, textAlign: 'center' }}>{name}</EText>
    </Pressable>
  );
}

function SelectedIssueRow({ name, Icon, price, onPriceChange, warranty, onWarrantyChange, onRemove }) {
  return (
    <View style={{ marginBottom: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: MINT_EDGE, backgroundColor: EST.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ height: 36, width: 36, borderRadius: 10, backgroundColor: EST.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={EST.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
          <EText numberOfLines={2} style={{ fontSize: 13, fontWeight: '600', color: EST.text }}>{name}</EText>
        </View>
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
          style={({ pressed }) => [{ height: 28, width: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDECEB' }, pressed && { opacity: 0.7 }]}
        >
          <X size={14} color={EST.red} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
        <EText style={{ fontSize: 12, fontWeight: '600', color: EST.muted, marginRight: 6 }}>Price</EText>
        <View style={{ width: 120, height: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: EST.border, backgroundColor: EST.white }}>
          <EText style={{ fontSize: 13, fontWeight: '700', color: EST.muted, marginRight: 4 }}>₹</EText>
          <ETextInput
            placeholder="0"
            keyboardType="numeric"
            value={String(price ?? '')}
            onChangeText={onPriceChange}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            cursorColor={EST.primary}
            accessibilityLabel="Price"
            style={{ flex: 1, paddingVertical: 0, fontSize: 14, fontWeight: '700', color: EST.text }}
          />
        </View>
      </View>
      <EText style={{ fontSize: 12, fontWeight: '600', color: EST.muted, marginTop: 10, marginBottom: 6 }}>Warranty</EText>
      <View style={{ flexDirection: 'row', marginHorizontal: -3 }}>
        {WARRANTY_OPTIONS.map((w) => {
          const active = warranty === w.code;
          return (
            <Pressable
              key={w.code}
              onPress={() => onWarrantyChange(w.code)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[{ flex: 1, marginHorizontal: 3, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center', borderColor: EST.border, backgroundColor: EST.white },
                active && { borderColor: EST.primary, backgroundColor: EST.primary }]}
            >
              <EText numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: active ? EST.white : EST.text }}>{w.label}</EText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function groupIconFor(name) {
  const n = String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (/screen|display/.test(n)) return Smartphone;
  if (/battery|power/.test(n)) return BatteryMedium;
  if (/(audio.*camera)|(camera.*audio)/.test(n)) return Headphones;
  if (/camera/.test(n)) return Aperture;
  if (/charg|port/.test(n)) return Zap;
  if (/speaker|microphone|audio/.test(n)) return Volume2;
  if (/bluetooth|wireless/.test(n)) return Bluetooth;
  if (/signal|reception|network drop/.test(n)) return SignalHigh;
  if (/network|connectivity|wifi/.test(n)) return Wifi;
  if (/touch/.test(n)) return Hand;
  if (/button|sensor/.test(n)) return LayoutGrid;
  if (/\bsim\b|sim card|sim tray/.test(n)) return CreditCard;
  if (/back panel|back glass|back cover|\bbody\b/.test(n)) return Layers;
  if (/\bframe\b|bezel/.test(n)) return Square;
  if (/diagnos/.test(n)) return Stethoscope;
  if (/performance|\blag\b|slow/.test(n)) return Gauge;
  if (/software|\bos\b|operating system/.test(n)) return Cog;
  if (/water|liquid/.test(n)) return Droplets;
  if (/motherboard|hardware/.test(n)) return Cpu;
  if (/data|backup/.test(n)) return Database;
  if (/keyboard|touchpad/.test(n)) return KeyboardIcon;
  if (/storage/.test(n)) return HardDrive;
  if (/overheat|cooling/.test(n)) return Fan;
  if (/restrict/.test(n)) return ShieldAlert;
  if (/virus|security/.test(n)) return ShieldCheck;
  if (/account|sign.?in|login/.test(n)) return UserCog;
  if (/customer selected/.test(n)) return Sparkles;
  if (/other/.test(n)) return MessageSquarePlus;
  return Wrench;
}

export function iconFor(code, name) {
  switch (code) {
    case 'DISPLAY': return Smartphone;
    case 'BATTERY': return BatteryMedium;
    case 'MOTHERBOARD': return Cpu;
    case 'CHARGING_PORT': return Zap;
    case 'SPEAKER': return Volume2;
    case 'CAMERA': return Aperture;
    case 'BUTTON': return LayoutGrid;
    case 'WATER_DAMAGE': return Droplets;
    case 'DEAD_PHONE': return Smartphone;
    default: break;
  }
  const n = String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (/microphone|\bmic\b/.test(n)) return Mic;
  if (/earpiece|ear speaker|hearing/.test(n)) return Ear;
  if (/no sound|no audio|mute|silent/.test(n)) return VolumeX;
  if (/speaker|volume|audio|sound/.test(n)) return Volume2;
  if (/bluetooth|wireless/.test(n)) return Bluetooth;
  if (/signal|reception|network/.test(n)) return SignalHigh;
  if (/wifi|wi-fi/.test(n)) return Wifi;
  if (/touch/.test(n)) return Hand;
  if (/screen|display|lcd|flicker/.test(n)) return Smartphone;
  if (/\bsim\b/.test(n)) return CreditCard;
  if (/charg|port|usb/.test(n)) return Zap;
  if (/battery|power/.test(n)) return BatteryMedium;
  if (/camera|lens/.test(n)) return Aperture;
  if (/button|sensor/.test(n)) return LayoutGrid;
  if (/back glass|back panel|back cover|\bbody\b/.test(n)) return Layers;
  if (/\bframe\b|bezel/.test(n)) return Square;
  if (/water|liquid/.test(n)) return Droplets;
  if (/motherboard|hardware|chip|logic board/.test(n)) return Cpu;
  if (/software|firmware|update/.test(n)) return Cog;
  if (/data|backup/.test(n)) return Database;
  if (/keyboard|touchpad/.test(n)) return KeyboardIcon;
  if (/storage/.test(n)) return HardDrive;
  if (/overheat|cooling|\bfan\b/.test(n)) return Fan;
  if (/performance|\blag\b|slow/.test(n)) return Gauge;
  if (/diagnos/.test(n)) return Stethoscope;
  if (/password|\bpin\b|\block\b|unlock/.test(n)) return Lock;
  if (/virus|security/.test(n)) return ShieldCheck;
  if (/account|login/.test(n)) return UserCog;
  return Wrench;
}
