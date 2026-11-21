import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePresence, recheckPresence, PRESENCE_LABEL, fmtClock, fmtDuration } from '../utils/presenceStore';
import { AppState, RefreshControl, View, TouchableOpacity, ScrollView, Image, ActivityIndicator, useWindowDimensions, Text as RNText } from 'react-native';
import { Text } from '../components/Typography';
import { interFamily } from '../theme/typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Bell,
  MapPin,
  ChevronRight,
  Calendar,
  Clock,
  ShieldAlert,
  ShieldCheck,
  ScanLine,
  FingerprintPattern,
  LogOut,
  CircleCheck,
  ClipboardList,
  Menu,
  Coffee,
  CloudSun,
  Moon,
  Layers,
  RefreshCw,
  Package,
  Truck,
  ArrowRightLeft,
  Hourglass,
  CircleDot,
  CalendarCheck,
  CalendarCheck2,
  CalendarPlus,
  CalendarX,
  ChartNoAxesColumnIncreasing,
  UserCheck,
  FileText,
  Database,
  ClipboardCheck,
  LayoutGrid,
  ChevronLeft,
  RotateCcwClock,
} from 'lucide-react-native';
import { rf, rlh, rs } from '../utils/responsive';
import { selectSession, mergeTechnicianProfile, selectShopLocation, selectTechnicianId } from '../store/authSlice';
import { getCategoriesForSession, getRoleDisplayLabel, resolveRoleKey } from '../config/categories';
import { ticketRef } from '../utils/ticketRef';
import {
  getMyTechnicianProfile,
  getTodayAttendance,
  getMonthlyAttendance,
  getMyLeaves,
  checkIn as apiCheckIn,
  checkOut as apiCheckOut,
} from '../api/technician';
import { listMyTickets, listTicketEvents } from '../api/tickets';
import { listMyAssignedPickups } from '../api/pickups';
import { DELIVERY_TABS, listMyDeliveries } from '../api/buyDeliveries';
import { REPAIR_DELIVERY_TABS, listRepairDeliveries } from '../api/repairDeliveries';
import { tabBucketOf } from '../utils/pickups';
import { jobStage, isLiveStage, isAwaitingAccept } from '../utils/jobStage';
import { listTechnicianWorkStatuses } from '../api/master';
import { effectiveLateMinutes } from './DailyAttendanceScreen';
import { loadUnreadNotificationCount } from './NotificationsScreen';
import { readCurrentLocation, haversineMeters, GEOFENCE_RADIUS_METERS } from '../utils/geo';
import { useLogout } from '../auth/LogoutContext';
import { notify } from '../components/confirm';
import { userMessage } from '../utils/userMessages';
import CheckoutReminder from '../components/CheckoutReminder';
import PickupSoonPopup from '../components/PickupSoonPopup';
import MyTasksShortcut from '../components/MyTasksShortcut';
import { syncCheckoutAlarm, cancelCheckoutAlarm } from '../utils/checkoutAlarm';
import { CalendarModal, parseISO, toISO } from '../components/DatePickerField';
import { useBreak, formatMinutes } from '../utils/breakTracker';
import { TILE_TONES } from '../components/MintKit';

// Home-screen palette (NearGFix green + mint). Scoped to this screen so the
// app-wide theme tokens other screens rely on stay untouched.
const C = {
  // Brand palette
  green: '#035C6C',
  red: '#F32C26',
  yellow: '#FAA700',
  ink: '#111111',
  bg: '#F3F4F6',
  surface: '#F3F4F6',
  // Light tints of the palette colours (mixed with white) for tiles/pills
  greenTint: '#E5F3F5',
  greenSoft: '#E5F3F5',
  redTint: '#FEECEC',
  redSoft: '#FFF6F6',
  yellowTint: '#FDF6E0',
  yellowSoft: '#FEFAF0',
  // Roles used throughout the screen
  deep: '#035C6C',
  primary: '#035C6C',
  bright: '#035C6C',
  mint: '#E5F3F5',
  card: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111111',
  muted: '#6B7280',
  faint: '#A3A3A3',
};

// Home redesign palette (deep teal + mint), from the approved mockup.
const H = {
  teal: '#035C6C',
  tealDeep: '#035C6C',
  badge: '#035C6C',
  ink: '#111111',
  text: '#1F2937',
  line: '#E8ECEF',
  cardBorder: '#EEF1F3',
};

const MAX_CONTENT_WIDTH = 720;
// Quick Access tiles: mint circle with an outline teal glyph. Keyed by the
// category `key` from config/categories.js.
const QUICK_BG = '#EAF7F5';
const QUICK_FG = '#035C6C';
const QUICK_TILES = {
  daily_attendance: { icon: CalendarCheck },
  daily_shift:      { icon: CalendarCheck2 },
  monthly_summary:  { icon: ChartNoAxesColumnIncreasing },
  leave_request:    { icon: CalendarPlus },
  apply_permission: { icon: UserCheck },
  leave_report:     { icon: FileText },
  permission_report: { icon: ShieldCheck },
  assign_task:      { icon: ClipboardList },
  task_report:      { icon: ClipboardCheck },
  assign_pickup:    { icon: Truck },
  pickup_report:    { icon: Package },
  salary_report:    { icon: Database },
  default:          { icon: LayoutGrid },
};

// Status buckets used to split the "assignedToMe" ticket list into the
// two cards on the home screen. Anything not listed is hidden.
const PENDING_STATUSES = new Set(['CREATED', 'IN_DIAGNOSIS', 'QUOTED']);
const IN_SERVICE_STATUSES = new Set(['APPROVED', 'IN_REPAIR', 'READY']);

// Canonical phase order. Events flow strictly in this order, so when two
// events share a createdAt timestamp (which the backend routinely produces —
// e.g. accept + work-started on the same tap) the highest-index emitted
// phase is the true current step. Array position alone is unreliable.
const CANONICAL_EVENT_ORDER = [
  'BOOKING_CREATED_BY_SHOP',
  'SERVICE_ACCEPTED',
  'ASSIGNED_TO_TECHNICIAN',
  'AWAITING_TECHNICIAN_ACCEPTANCE',
  'REASSIGNED_TO_TECHNICIAN',
  'TECHNICIAN_ACCEPTED_SERVICE',
  'TECHNICIAN_WORK_STARTED',
  'TECHNICIAN_UPLOADED_DEVICE_IMAGES',
  'TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED',
  'RE_ESTIMATED_CONFIRMED',
  'CUSTOMER_APPROVED',
  'CUSTOMER_REJECTED',
  'IN_REPAIR',
  'PARTS_REQUIRED',
  'QUALITY_CHECK_COMPLETED',
  'REPAIR_COMPLETED',
  'READY',
  'DELIVERED',
  'CANCELLED',
];
const EVENT_INDEX = Object.fromEntries(CANONICAL_EVENT_ORDER.map((k, i) => [k, i]));
// The technician's last controllable phase. READY and DELIVERED are shop-side
// actions; the technician card should stay at "Repair Completed" once work is
// done, not jump forward to a phase the technician didn't perform.
const TECHNICIAN_CAP_INDEX = EVENT_INDEX.REPAIR_COMPLETED;

// Task summary cards (above Quick Access): the same sections as My Jobs
// (utils/jobStage), so each count is exactly what its My Jobs section lists:
//   Assigned  — not accepted yet (Assigned + Reassigned)
//   Pending   — accepted but waiting (approval / spare parts / Quality Check)
//   Completed — Quality Check done or the shop's handover
// In Process and Cancelled jobs are in none of the three.
const TASK_POLL_MS = 30000;
const EVENT_BATCH = 8;
// Seen "Recent Assigned" ticket ids, stored per user so a shared device
// doesn't leak one employee's read-state into another's badge.
const seenAssignedKey = (userKey) => `ggfix.home.seenAssignedTasks.${userKey || 'anon'}`;
async function readSeenAssigned(userKey) {
  try {
    const raw = await AsyncStorage.getItem(seenAssignedKey(userKey));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch { return new Set(); }
}
async function writeSeenAssigned(userKey, ids) {
  try { await AsyncStorage.setItem(seenAssignedKey(userKey), JSON.stringify(ids.map(String))); } catch {}
}

const PENDING_NOTE_BY_STATUS = {
  CREATED: 'Awaiting diagnosis',
  IN_DIAGNOSIS: 'Under diagnosis — quotation pending',
  QUOTED: 'Spare part has been ordered. Service is Pending',
};

const IN_SERVICE_NOTE_BY_STATUS = {
  APPROVED: 'Customer approved — repair queued',
  IN_REPAIR: 'Technician Work Started',
  READY: 'Repair complete — awaiting pickup',
};

// Coarser clock for the greeting / date / month header — ticks once a minute so
// the whole (heavy) HomeScreen isn't re-rendered every second. The live seconds
// display is isolated into <LiveClock> so only it re-renders per second.
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Time-of-day greeting for the header.
function greetingFor(date) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Backend sends LocalTime as "HH:mm:ss". Render as "09:30 AM".
function formatTimeOfDay(localTime) {
  if (!localTime) return '--:-- --';
  const parts = String(localTime).split(':');
  let h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  if (Number.isNaN(h)) return '--:-- --';
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${m} ${ap}`;
}

function shortMonthYear(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function daysInMonth(year, month1based) {
  return new Date(year, month1based, 0).getDate();
}

function initialsFromName(name) {
  if (!name) return 'E';
  return name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}

export default function HomeScreen({ navigation }) {
  const presence = usePresence();
  // Only a live, checked-in reading (gate re-checks every 30 s) is shown as presence.
  const presenceLive = !!presence?.checkedIn && presence.state !== 'MONITORING_OFF' && Date.now() - (presence.receivedAt || 0) < 5 * 60 * 1000;
  const dispatch = useDispatch();
  const session = useSelector(selectSession);
  const shopLoc = useSelector(selectShopLocation);
  const onLogout = useLogout();
  const now = useMinuteClock();
  const { width: winW } = useWindowDimensions();
  const categories = useMemo(() => getCategoriesForSession(session), [session]);
  const roleLabel = getRoleDisplayLabel(session);
  const displayName = session?.fullName || session?.email || roleLabel;

  // Month shown in the "This Month" card. null = follow the current calendar
  // month (the default); set when the user picks another month from the pill.
  const [pickedMonth, setPickedMonth] = useState(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const month = pickedMonth ? pickedMonth.month : now.getMonth() + 1;
  const year = pickedMonth ? pickedMonth.year : now.getFullYear();
  // Read by the one-time mount load so a month change doesn't re-run it (and
  // re-fetch profile/tickets/leaves); reloadAttendance handles month changes.
  const monthRef = useRef({ month, year });
  monthRef.current = { month, year };

  const [todayAttendance, setTodayAttendance] = useState(null);
  // Check-in / check-out changed → start / stop presence monitoring now.
  useEffect(() => { recheckPresence(); }, [todayAttendance?.checkInTime, todayAttendance?.checkOutTime]);
  const [monthly, setMonthly] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [errors, setErrors] = useState({});
  // Live geofence badge state: inRange null = unknown/not enforced (shop has no
  // coords or GPS unavailable), true = within GEOFENCE_RADIUS_METERS, false =
  // outside. Home is only reachable past the lock screen, so this is mostly a
  // reassurance readout — but it re-reads GPS so drift near the edge shows.
  const [geo, setGeo] = useState({ inRange: null, distance: null });
  // Code -> Label map sourced from the admin's Work Status master list. Used to
  // resolve the latest event on each displayed ticket into the same label the
  // technician sees in the detail-screen "Technician Work Status" dropdown.
  const [workStatusLabels, setWorkStatusLabels] = useState({});
  // Latest matching work-status code on each displayed ticket. Null when the
  // ticket has no events yet (e.g. unassigned) or no event matches a row in
  // the master list — in which case the card falls back to the hardcoded note.
  const [pendingLatestCode, setPendingLatestCode] = useState(null);
  const [inServiceLatestCode, setInServiceLatestCode] = useState(null);
  // Drives the red dot on the header bell. Re-fetched on focus so reading
  // notifications and coming back to Home clears the dot immediately.
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    const refresh = () => loadUnreadNotificationCount().then((n) => { if (active) setUnreadNotifs(n); });
    refresh();
    // Keep the bell dot live (leave / permission decisions) while Home is open.
    const t = setInterval(refresh, 20000);
    return () => { active = false; clearInterval(t); };
  }, []));

  // Keep today's punch + this-month stats fresh: refetch on focus (so a row
  // lingering across midnight can't strand the button on "Check Out") and after
  // a successful check-in (so the "This Month" tiles reflect the new day).
  // technician.id lives in auth state (from /technicians/me), not on the session.
  const storedTechId = useSelector(selectTechnicianId);
  const reloadAttendance = useCallback(async () => {
    const techId = storedTechId || session?.technicianId;
    try {
      const today = await getTodayAttendance();
      setTodayAttendance(today || null);
    } catch { /* keep last known */ }
    if (techId) {
      try {
        const att = await getMonthlyAttendance(techId, month, year);
        if (att) setMonthly(att);
      } catch { /* keep last known */ }
      // Refresh leave / permission requests too, so a newly applied permission
      // shows up in This Month right after coming back.
      getMyLeaves(techId).then((lvs) => { if (Array.isArray(lvs)) setLeaves(lvs); }).catch(() => {});
    }
  }, [storedTechId, session?.technicianId, month, year]);

  useFocusEffect(useCallback(() => { reloadAttendance(); }, [reloadAttendance]));

  // Resolve the live in-range badge once the shop coordinates are known.
  useEffect(() => {
    let active = true;
    const lat = shopLoc?.latitude;
    const lng = shopLoc?.longitude;
    if (lat == null || lng == null) { setGeo({ inRange: null, distance: null }); return undefined; }
    (async () => {
      try {
        const pos = await readCurrentLocation();
        if (!active) return;
        const m = Math.round(haversineMeters(pos.latitude, pos.longitude, Number(lat), Number(lng)));
        setGeo({ inRange: m <= GEOFENCE_RADIUS_METERS, distance: m });
      } catch {
        if (active) setGeo({ inRange: null, distance: null });
      }
    })();
    return () => { active = false; };
  }, [shopLoc?.latitude, shopLoc?.longitude]);

  const loadFromTechnicianId = useCallback(async (techId) => {
    const { month: m, year: y } = monthRef.current;
    try {
      const [att, lvs] = await Promise.all([
        getMonthlyAttendance(techId, m, y).catch((e) => { setErrors((s) => ({ ...s, monthly: e?.message })); return null; }),
        getMyLeaves(techId).catch((e) => { setErrors((s) => ({ ...s, leaves: e?.message })); return []; }),
      ]);
      if (att) setMonthly(att);
      if (Array.isArray(lvs)) setLeaves(lvs);
    } catch (_) {}
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await getMyTechnicianProfile();
        if (!active) return;
        dispatch(mergeTechnicianProfile(me));
        if (me?.id) loadFromTechnicianId(me.id);
      } catch (e) {
        setErrors((s) => ({ ...s, profile: e?.message }));
      }

      try {
        const today = await getTodayAttendance();
        if (active && today) setTodayAttendance(today);
      } catch (e) {
        setErrors((s) => ({ ...s, today: e?.message }));
      }
    })();
    return () => { active = false; };
  }, [dispatch, loadFromTechnicianId]);

  // Assigned tickets feed both the "Recent Pending / In Service" rows and the
  // task summary cards. Refetched on every focus and polled while focused so a
  // freshly assigned task surfaces the red badge without leaving the screen.
  // On failure the last known list is kept (no crash, no reset to empty).
  const userKey = session?.userId || session?.technicianId || session?.email || null;
  const brk = useBreak(userKey);
  const [seenAssigned, setSeenAssigned] = useState(null); // Set | null (not loaded yet)
  const [tasksLoaded, setTasksLoaded] = useState(false);
  // Booking events of the accepted, still-open jobs — what decides In Process
  // vs Pending vs Completed. One pass at a time (polls don't stack up).
  const [eventsById, setEventsById] = useState({});
  const eventsBusy = useRef(false);
  const loadStageEvents = useCallback(async (items) => {
    if (eventsBusy.current) return;
    eventsBusy.current = true;
    try {
      const ids = items.filter((t) => t?.id != null && t.technicianAcceptedAt && isLiveStage(jobStage(t))).map((t) => t.id);
      const out = {};
      for (let i = 0; i < ids.length; i += EVENT_BATCH) {
        const chunk = ids.slice(i, i + EVENT_BATCH);
        const rows = await Promise.all(chunk.map((id) => listTicketEvents(id).catch(() => null)));
        chunk.forEach((id, j) => { if (Array.isArray(rows[j])) out[id] = rows[j]; });
      }
      setEventsById((prev) => ({ ...prev, ...out }));
    } finally {
      eventsBusy.current = false;
    }
  }, []);

  const reloadTickets = useCallback(async () => {
    try {
      const page = await listMyTickets({ page: 0, size: 100 });
      const items = Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []);
      setTickets(items);
      setTasksLoaded(true);
      setErrors((s) => (s.tickets ? { ...s, tickets: undefined } : s));
      loadStageEvents(items);
    } catch (e) {
      setErrors((s) => ({ ...s, tickets: e?.message || 'Could not load tasks' }));
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    readSeenAssigned(userKey).then((set) => { if (active) setSeenAssigned(set); });
    return () => { active = false; };
  }, [userKey]);

  useFocusEffect(useCallback(() => {
    reloadTickets();
    const id = setInterval(reloadTickets, TASK_POLL_MS);
    return () => clearInterval(id);
  }, [reloadTickets]));

  // Pickup person: Job Overview counts their pickups, not repair tickets, with
  // the same scope and buckets as the My Pickups tiles (every assigned
  // pickup, no month filter). A failed poll keeps the last list.
  const isPickupPerson = resolveRoleKey(session) === 'PICKUP_PERSON';
  const [pickups, setPickups] = useState(null); // null = not loaded yet
  useFocusEffect(useCallback(() => {
    if (!isPickupPerson) return undefined;
    let active = true;
    const loadPickups = () => listMyAssignedPickups()
      .then((rows) => { if (active) setPickups(Array.isArray(rows) ? rows : []); })
      .catch(() => {});
    loadPickups();
    const id = setInterval(loadPickups, TASK_POLL_MS);
    // Back from the background: fresh list at once (pickup reminder popup).
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') loadPickups(); });
    return () => { active = false; clearInterval(id); sub.remove(); };
  }, [isPickupPerson]));
  // Marketplace (Buy) orders for the Marketplace Pickups tiles.
  const [buyOrders, setBuyOrders] = useState(null);
  useFocusEffect(useCallback(() => {
    if (!isPickupPerson) return undefined;
    let active = true;
    listMyDeliveries().then((rows) => { if (active) setBuyOrders(Array.isArray(rows) ? rows : []); }).catch(() => { if (active) setBuyOrders((p) => p || []); });
    return () => { active = false; };
  }, [isPickupPerson]));
  // Repair return deliveries (shop → customer) the Partner App assigned to me.
  const [repairDeliveries, setRepairDeliveries] = useState(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    listRepairDeliveries().then((r) => { if (active) setRepairDeliveries(Array.isArray(r) ? r : (Array.isArray(r?.content) ? r.content : [])); })
      .catch(() => { if (active) setRepairDeliveries((p) => p || []); });
    return () => { active = false; };
  }, []));
  // Pull to refresh: tickets, attendance and (pickup person) pickups.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await Promise.allSettled([
        reloadTickets(), reloadAttendance(),
        isPickupPerson ? listMyAssignedPickups().then((rows) => setPickups(Array.isArray(rows) ? rows : [])) : null,
        isPickupPerson ? listMyDeliveries().then((rows) => setBuyOrders(Array.isArray(rows) ? rows : [])) : null,
        listRepairDeliveries().then((r) => setRepairDeliveries(Array.isArray(r) ? r : (Array.isArray(r?.content) ? r.content : []))),
      ]);
    } finally { setPullRefreshing(false); }
  }, [reloadTickets, reloadAttendance, isPickupPerson]);
  const pickupSummary = useMemo(() => {
    const list = (pickups || []).filter((b) => b.kind !== 'SELL'); // repair pickups only
    const count = (bucket) => list.filter((b) => tabBucketOf(b) === bucket).length;
    return { total: list.length, assigned: count('ASSIGNED'), inProgress: count('IN_PROGRESS'), completed: count('COMPLETED') };
  }, [pickups]);
  const sellSummary = useMemo(() => {
    const list = (pickups || []).filter((b) => b.kind === 'SELL'); // selling pickups from customers
    const count = (bucket) => list.filter((b) => tabBucketOf(b) === bucket).length;
    return { total: list.length, assigned: count('ASSIGNED'), inProgress: count('IN_PROGRESS'), completed: count('COMPLETED') };
  }, [pickups]);

  const taskSummary = useMemo(() => {
    const assignedIds = [];
    let pending = 0;
    let completed = 0;
    tickets.forEach((t) => {
      const stage = jobStage(t, eventsById[t.id]);
      if (isAwaitingAccept(stage)) { if (t?.id != null) assignedIds.push(String(t.id)); }
      else if (stage === 'Pending') pending += 1;
      else if (stage === 'Completed') completed += 1;
    });
    const unseen = seenAssigned ? assignedIds.filter((id) => !seenAssigned.has(id)).length : 0;
    return { assigned: assignedIds.length, assignedIds, pending, completed, unseen };
  }, [tickets, seenAssigned, eventsById]);

  const openRecentAssigned = () => {
    const ids = taskSummary.assignedIds;
    setSeenAssigned(new Set(ids));
    writeSeenAssigned(userKey, ids);
    navigation.navigate('TaskReport', { filter: 'Assigned', refreshAt: Date.now() });
  };

  // Button toggles based on today's row:
  //   no row / no check-in time  → "Check In"  (POST /me/attendance/check-in)
  //   check-in done, no check-out → "Check Out" (POST /me/attendance/check-out)
  //   both recorded               → button disabled with "Done for today"
  const hasCheckedIn = !!todayAttendance?.checkInTime;
  const hasCheckedOut = !!todayAttendance?.checkOutTime;
  const buttonMode = hasCheckedOut ? 'done' : hasCheckedIn ? 'out' : 'in';

  // Keep the 6:30 PM check-out reminder in step with today's punches.
  useEffect(() => {
    if (todayAttendance) syncCheckoutAlarm(todayAttendance);
  }, [todayAttendance?.checkInTime, todayAttendance?.checkOutTime]);

  const handleCheckInPress = async () => {
    if (checkInBusy || buttonMode === 'done') return;
    setCheckInBusy(true);
    const isCheckout = buttonMode === 'out';
    try {
      // Try to read GPS for the geofence, but DON'T hard-block on failure: the
      // server fails open when the shop has no saved coordinates, and returns
      // LOCATION_REQUIRED (handled below) when it does — so we let the server
      // decide instead of stranding every no-coords shop when GPS is off.
      let coords = {};
      try {
        const pos = await readCurrentLocation();
        coords = { latitude: pos.latitude, longitude: pos.longitude };
      } catch (e) {
        // proceed without coordinates; server enforces the geofence
      }

      const updated = isCheckout ? await apiCheckOut(coords) : await apiCheckIn(coords);
      if (updated) setTodayAttendance(updated);

      if (isCheckout) {
        brk.endBreak();
        await cancelCheckoutAlarm();
        // After a successful check-out the shift is over — sign out back to the
        // login screen (per the attendance lifecycle).
        notify('Checked out', 'Have a good day!', { type: 'success', haptic: 'success' });
        // quiet: this toast is the one confirmation (no "Logged out" on top).
        onLogout?.({ quiet: true });
        return;
      }
      notify('Checked in', 'You’re on duty.', { type: 'success', haptic: 'success' });
      reloadAttendance();
    } catch (e) {
      const code = e?.payload?.code;
      if (code === 'OUT_OF_RADIUS') {
        notify('Too far from the shop', userMessage(e, 'Move within range to continue.'), { type: 'error', haptic: 'error' });
      } else if (code === 'EARLY_CHECKOUT_BLOCKED') {
        notify('Too early to check out', userMessage(e, 'You can check out only after your duty end time.'), { type: 'error', haptic: 'error' });
      } else if (code === 'LOCATION_REQUIRED') {
        notify('Location needed', userMessage(e, 'Enable location and try again.'), { type: 'error', haptic: 'error' });
      } else {
        setErrors((s) => ({ ...s, checkin: e?.message }));
        notify(isCheckout ? 'Could not check out' : 'Could not check in', userMessage(e, 'Please try again.'), { type: 'error' });
      }
    } finally {
      setCheckInBusy(false);
    }
  };

  // Top pills show the technician's roster ("duty") times pulled from their
  // profile (defaultCheckIn / defaultCheckOut). The actual check-in / check-out
  // recorded today is shown lower down in the "Today" row.
  const dutyCheckInLabel = formatTimeOfDay(session?.defaultCheckIn);
  const dutyCheckOutLabel = formatTimeOfDay(session?.defaultCheckOut);
  const checkInLabel = formatTimeOfDay(todayAttendance?.checkInTime);
  const checkOutLabel = formatTimeOfDay(todayAttendance?.checkOutTime);
  const monthLabel = shortMonthYear(new Date(year, month - 1, 1));
  // Picking the current calendar month goes back to "follow the clock".
  const selectMonth = (m, y) => {
    setMonthPickerOpen(false);
    const isCurrent = m === now.getMonth() + 1 && y === now.getFullYear();
    setPickedMonth(isCurrent ? null : { month: m, year: y });
  };

  const present = monthly?.presentDays ?? 0;
  const leaveDays = monthly?.leaveDays ?? 0;
  // Permissions are leave requests with leaveType PERMISSION (the attendance
  // summary's permissionCount only counts PERMISSION attendance days), so count
  // this month's requests directly; rejected / cancelled ones don't count.
  const permission = useMemo(() => {
    const fromRequests = leaves.filter((l) => {
      if (String(l.leaveType || '').toUpperCase() !== 'PERMISSION') return false;
      if (/REJECT|CANCEL/i.test(String(l.status || ''))) return false;
      const d = new Date(l.startDate || l.requestedAt || 0);
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    }).length;
    return Math.max(fromRequests, monthly?.permissionCount ?? 0);
  }, [leaves, month, year, monthly?.permissionCount]);
  // Backend returns lateHours = 0 because per-row lateMinutes isn't computed
  // server-side. Derive client-side from each day's checkInTime vs duty start
  // — same logic Monthly Summary uses (effectiveLateMinutes) so the two
  // screens never disagree. Falls back to whatever the backend sent if
  // dailyRecords is empty (e.g. brand-new month with no rows yet).
  const dutyCheckIn = session?.defaultCheckIn || '09:30:00';
  const lateHrs = useMemo(() => {
    const rows = monthly?.dailyRecords || [];
    if (rows.length === 0) return String(monthly?.lateHours ?? '0');
    const totalMin = rows.reduce(
      (sum, r) => sum + effectiveLateMinutes(r, dutyCheckIn),
      0,
    );
    if (totalMin <= 0) return '0';
    const hours = totalMin / 60;
    return (Math.round(hours * 10) / 10).toString();
  }, [monthly, dutyCheckIn]);
  const totalDays = daysInMonth(year, month);
  const progressPct = totalDays > 0 ? Math.min(100, Math.round((present / totalDays) * 100)) : 0;

  const pendingTicket = useMemo(
    () => tickets.find((t) => PENDING_STATUSES.has(t.status)),
    [tickets],
  );
  const inServiceTicket = useMemo(
    () => tickets.find((t) => IN_SERVICE_STATUSES.has(t.status)),
    [tickets],
  );

  // Load the admin's Work Status master list once so we can render the same
  // labels the technician sees on the detail screen. Failing here is non-fatal:
  // the cards fall back to the hardcoded notes if the map is empty.
  useEffect(() => {
    let active = true;
    listTechnicianWorkStatuses().then((rows) => {
      if (!active) return;
      const map = {};
      (Array.isArray(rows) ? rows : []).forEach((r) => {
        const code = String(r.code || r.statusCode || '').toUpperCase();
        const label = r.label || r.displayLabel || r.name;
        if (code && label) map[code] = label;
      });
      setWorkStatusLabels(map);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Pull the latest matching work-status event for each visible card so the
  // label reflects the technician's actual current step (e.g. "Spare Parts
  // Waiting", "Quality Check Completed") instead of a stale ticket-level fallback.
  useEffect(() => {
    let active = true;
    const resolveLatest = async (ticketId) => {
      if (!ticketId) return null;
      try {
        const rows = await listTicketEvents(ticketId);
        const list = Array.isArray(rows) ? rows : [];
        // Pick by canonical phase rank (with createdAt as tiebreaker), and cap
        // at REPAIR_COMPLETED — once the tech is done, the card should stay
        // there even if the shop has moved the booking to READY / DELIVERED.
        // Walking by array position alone was wrong on two counts: equal-time
        // events arrived in arbitrary order, and post-tech phases were leaking
        // into the technician card.
        let bestCode = null;
        let bestIdx = -1;
        let bestTime = -Infinity;
        for (const ev of list) {
          const code = String(ev?.status || '').toUpperCase();
          if (!code) continue;
          const rawIdx = EVENT_INDEX[code];
          if (rawIdx == null) continue;
          const capped = rawIdx > TECHNICIAN_CAP_INDEX;
          const idx = capped ? TECHNICIAN_CAP_INDEX : rawIdx;
          const displayCode = capped ? 'REPAIR_COMPLETED' : code;
          const t = ev.createdAt ? new Date(ev.createdAt).getTime() : 0;
          if (idx > bestIdx || (idx === bestIdx && t > bestTime)) {
            bestCode = displayCode;
            bestIdx = idx;
            bestTime = t;
          }
        }
        return bestCode;
      } catch { return null; }
    };
    (async () => {
      const [pCode, sCode] = await Promise.all([
        resolveLatest(pendingTicket?.id),
        resolveLatest(inServiceTicket?.id),
      ]);
      if (!active) return;
      setPendingLatestCode(pCode);
      setInServiceLatestCode(sCode);
    })();
    return () => { active = false; };
  }, [pendingTicket?.id, inServiceTicket?.id, workStatusLabels]);

  // The cap can produce REPAIR_COMPLETED even when it isn't an actual event;
  // make sure we have a label for it regardless of what the admin master list
  // contains, so the card never goes blank just because the master row is
  // missing or renamed.
  const labelForEventCode = (code) => {
    if (!code) return '';
    if (workStatusLabels[code]) return workStatusLabels[code];
    if (code === 'REPAIR_COMPLETED') return 'Repair Completed';
    return '';
  };
  const pendingResolved = labelForEventCode(pendingLatestCode);
  const inServiceResolved = labelForEventCode(inServiceLatestCode);
  const pendingLabel = pendingResolved
    || (pendingTicket ? (PENDING_NOTE_BY_STATUS[pendingTicket.status] || 'Pending') : '');
  const inServiceLabel = inServiceResolved
    || (inServiceTicket ? (IN_SERVICE_NOTE_BY_STATUS[inServiceTicket.status] || inServiceTicket.status) : '');
  const recentLeave = useMemo(() => {
    if (!leaves.length) return null;
    return [...leaves].sort((a, b) => {
      const ta = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const tb = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return tb - ta;
    })[0];
  }, [leaves]);

  const buttonLabel = buttonMode === 'out' ? 'Check Out' : buttonMode === 'done' ? 'Done for Today' : 'Check In';
  const buttonColors = buttonMode === 'out' ? [C.red, '#F32C26'] : buttonMode === 'done' ? ['#A3A3A3', '#7A7A7A'] : [C.green, '#609138'];
  const ButtonIcon = buttonMode === 'out' ? LogOut : buttonMode === 'done' ? CircleCheck : FingerprintPattern;
  // Only block CHECK-IN when out of range. Never disable check-out: a checked-in
  // employee who walks out (or gets an inaccurate fix) must still be able to
  // check out — and checkout is what logs them out. The server already enforces
  // the radius, so this client gate is purely a convenience for check-in.
  const geoBlocksCheckIn = buttonMode === 'in' && geo.inRange === false;
  const buttonDisabled = checkInBusy || buttonMode === 'done' || geoBlocksCheckIn;
  const greeting = greetingFor(now);
  const onBreak = buttonMode === 'out' && brk.onBreak;
  const breakMin = brk.breakMinutes(now);
  // Breaks are a phone-only log (utils/breakTracker): saved the moment it's tapped.
  const toggleBreak = () => {
    if (onBreak) { brk.endBreak(); notify('Break ended', '', { type: 'success' }); }
    else { brk.startBreak(); notify('Break started', '', { type: 'success' }); }
  };
  const statusText = onBreak ? 'On Break' : buttonMode === 'in' ? 'Not Checked In' : buttonMode === 'out' ? 'On Duty' : 'Completed';
  const statusWarn = buttonMode === 'in' || onBreak;
  const statusColor = statusWarn ? '#FAA700' : '#08A50F';
  const statusTint = statusWarn ? '#FDEFC8' : '#CAF2C7';
  const statusInk = statusWarn ? '#92400E' : '#14532D';

  // Layout maths. Content is capped on tablets so cards don't stretch edge to edge.
  const contentW = Math.min(winW, MAX_CONTENT_WIDTH);
  const pad = rs(14);
  const innerW = contentW - pad * 2;
  // Quick Access grid — same numbers as the Partner app's dashboard tool grid
  // (DashboardScreen toolCardStyle + DashboardToolsGrid): 4 tiles a row on a
  // phone (8 tiles = 4 × 2), 5 on a large phone (414+), 6 on a tablet (600+);
  // a short last row stays left-aligned.
  const quickTablet = winW >= 600;
  const quickCols = quickTablet ? 6 : 4;
  const quickGap = quickTablet ? 12 : 6;
  const quickPad = quickTablet ? 12 : 6;
  // - 2: the panel's 1px border on each side.
  const quickW = Math.floor(Math.max(0, (innerW - 2 - quickPad * 2 - quickGap * (quickCols - 1)) / quickCols));
  const stepMonth = (delta) => {
    const d = new Date(year, month - 1 + delta, 1);
    selectMonth(d.getMonth() + 1, d.getFullYear());
  };
  // The next punch (Check In / Break / Check Out) is the raised teal tile.
  const punchActive = [buttonMode === 'in', onBreak, buttonMode === 'out' && !onBreak];
  const night = now.getHours() >= 18 || now.getHours() < 5;

  // Ticket QR scanning only applies to roles that handle tickets.
  const showScan = resolveRoleKey(session) !== 'STAFF';

  const ticketLine = (t) => `${ticketRef(t)} · ${t.deviceDisplayName || 'Device'}${t.repairServicesSummary ? ` - ${t.repairServicesSummary}` : ''}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.card }} edges={['top']}>
      {/* Fixed top bar — stays put while the page scrolls */}
      <View style={{ backgroundColor: '#FFFFFF', alignItems: 'center', paddingBottom: rs(10) }}>
        <View style={{ width: contentW, paddingHorizontal: pad }}>
            {/* 1. Header: menu, wordmark, (scan), bell, avatar */}
            <View className="flex-row items-center" style={{ paddingTop: rs(8) }}>
              <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('AccountTab')} accessibilityLabel="Menu">
                <Menu size={rs(26)} color={H.ink} strokeWidth={2} />
              </TouchableOpacity>
              <View style={{ flex: 1, minWidth: 0, marginLeft: rs(14) }}>
                <Text style={{ fontSize: rf(21), fontWeight: '900', color: H.ink, letterSpacing: -0.2 }} numberOfLines={1}>
                  NEAR G <Text style={{ color: H.tealDeep }}>FIX</Text>
                </Text>
                <Text style={{ fontSize: rf(12.5), fontWeight: '500', color: H.text }} numberOfLines={1}>Employee App</Text>
              </View>
              {showScan ? <HeaderButton plain icon={ScanLine} onPress={() => navigation.navigate('ScanTicketQr')} /> : null}
              <HeaderButton plain icon={Bell} dot={unreadNotifs > 0} onPress={() => navigation.navigate('Notifications')} />
              <TouchableOpacity hitSlop={6} onPress={() => navigation.navigate('TechnicianProfile')} style={{ marginLeft: rs(10) }} accessibilityLabel="My profile">
                <Avatar uri={session?.photoUrl} name={displayName} size={rs(42)} />
                <View style={{
                  position: 'absolute', right: -rs(1), bottom: rs(1),
                  width: rs(13), height: rs(13), borderRadius: rs(7), borderWidth: 2, borderColor: '#FFFFFF',
                  backgroundColor: hasCheckedIn && !hasCheckedOut ? '#06BB12' : C.faint,
                }} />
              </TouchableOpacity>
            </View>
        </View>
      </View>
      <ScrollView
        style={{ backgroundColor: C.bg }}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: rs(12) }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} colors={['#035C6C']} tintColor="#035C6C" />}
      >
        <View style={{ width: contentW, paddingHorizontal: pad }}>
          {/* 2. Greeting + date (left), location card (right) */}
          <View style={{ marginTop: rs(10), flexDirection: 'row', alignItems: 'stretch', gap: rs(10) }}>
            <LinearGradient colors={['#FFFFFF', '#F1F4F6']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={INFO_CARD}>
              <View pointerEvents="none" style={{ position: 'absolute', right: rs(10), top: rs(10) }}>
                {night ? <Moon size={rs(28)} color={H.teal} strokeWidth={1.7} /> : <CloudSun size={rs(32)} color={H.teal} strokeWidth={1.7} />}
              </View>
              <Text style={{ fontSize: rf(12.5), color: H.text }} numberOfLines={1}>{greeting},</Text>
              <Text style={{ fontSize: rf(14), fontWeight: '800', color: H.ink, marginTop: rs(4), marginRight: rs(30) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {displayName} 👋
              </Text>
              <View className="flex-row items-center" style={{ marginTop: rs(8) }}>
                <Calendar size={rs(15)} color={H.ink} strokeWidth={1.8} />
                <Text style={{ fontSize: rf(12.5), color: H.text, marginLeft: rs(6) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{formatShortDay(now)}</Text>
              </View>
            </LinearGradient>
            <LinearGradient colors={['#FFFFFF', '#F1F4F6']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[INFO_CARD, { flexDirection: 'row', alignItems: 'center' }]}>
              <MapPin size={rs(22)} color={H.teal} fill={H.teal} stroke="#FFFFFF" strokeWidth={1.6} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: rs(8) }}>
                <Text style={{ fontSize: rf(12.5), color: H.text }} numberOfLines={1}>Your Location</Text>
                <Text style={{ fontSize: rf(14), fontWeight: '800', color: H.ink, marginTop: rs(3) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{presence?.shopName || 'Globo Green'}</Text>
                <Text style={{ fontSize: rf(12.5), color: H.text, marginTop: rs(3) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Cuddalore, Tamil Nadu</Text>
                {presenceLive ? (
                  <View style={{ marginTop: rs(4) }}>
                    <View className="flex-row items-center">
                      {presence.state === 'INSIDE_SHOP' || presence.state === 'ON_AUTHORIZED_DUTY' ? <CircleDot size={rs(13)} color={H.teal} strokeWidth={2.2} /> : <ShieldAlert size={rs(13)} color={presence.state === 'OUTSIDE_SHOP' ? C.red : '#B7791F'} />}
                      <Text style={{ fontSize: rf(12), fontWeight: '800', color: presence.state === 'OUTSIDE_SHOP' ? C.red : presence.state === 'LOCATION_UNVERIFIED' ? '#B7791F' : H.teal, marginLeft: rs(4) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {PRESENCE_LABEL[presence.state] || presence.state}
                        {presence.distanceMeters != null ? <Text style={{ color: H.ink }}>{` • ${presence.distanceMeters}m`}</Text> : null}
                      </Text>
                    </View>
                    {presence.lastVerifiedAt ? <Text style={{ fontSize: rf(11), color: H.text, marginTop: rs(2) }} numberOfLines={1}>{`Verified ${fmtClock(presence.lastVerifiedAt)}`}</Text> : null}
                  </View>
                ) : geo.inRange != null ? (
                  <View className="flex-row items-center" style={{ marginTop: rs(4) }}>
                    {geo.inRange ? <CircleDot size={rs(13)} color={H.teal} strokeWidth={2.2} /> : <ShieldAlert size={rs(13)} color={C.red} />}
                    <Text style={{ fontSize: rf(12), fontWeight: '800', color: geo.inRange ? H.teal : C.red, marginLeft: rs(4) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {geo.inRange ? 'In range' : 'Out of range'}
                      {geo.distance != null ? <Text style={{ color: H.ink }}>{` • ${geo.distance}m`}</Text> : null}
                    </Text>
                  </View>
                ) : null}
              </View>
            </LinearGradient>
          </View>

          {/* 3. Check In / Break / Check Out — the next punch is the raised teal tile */}
          <View className="flex-row" style={{
            marginTop: rs(12), borderRadius: rs(16), backgroundColor: C.card,
            borderWidth: 1, borderColor: H.cardBorder, ...shadow(0.06, 12, 4, 3),
          }}>
            <PunchTile
              active={punchActive[0]} icon={FingerprintPattern} title={hasCheckedIn ? 'Checked In' : 'Check In'}
              sub={hasCheckedIn ? checkInLabel : geoBlocksCheckIn ? 'Out of range' : 'Tap to Check In'}
              busy={checkInBusy && buttonMode === 'in'} disabled={buttonMode !== 'in' || buttonDisabled} onPress={handleCheckInPress}
            />
            {punchActive[0] || punchActive[1] ? null : <View style={PUNCH_DIVIDER} />}
            <PunchTile
              active={punchActive[1]} icon={Coffee} title={onBreak ? 'End Break' : 'Break'}
              sub={onBreak ? `On break · ${formatMinutes(breakMin)}` : breakMin > 0 ? `Taken ${formatMinutes(breakMin)}` : buttonMode === 'out' ? 'Tap to start' : 'After check-in'}
              disabled={buttonMode !== 'out' || checkInBusy} onPress={toggleBreak}
            />
            {punchActive[1] || punchActive[2] ? null : <View style={PUNCH_DIVIDER} />}
            <PunchTile
              active={punchActive[2]} icon={LogOut} title={hasCheckedOut ? 'Checked Out' : 'Check Out'}
              sub={hasCheckedOut ? checkOutLabel : 'Tap to Check Out'}
              busy={checkInBusy && buttonMode === 'out'} disabled={buttonMode !== 'out' || buttonDisabled} onPress={handleCheckInPress}
            />
          </View>

          {/* Today's punches + duration + status (tap → Daily Attendance history) */}
          <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('DailyAttendance')} className="flex-row" style={{
            marginTop: rs(10), paddingVertical: rs(12), borderRadius: rs(16), backgroundColor: C.card,
            borderWidth: 1, borderColor: H.cardBorder, ...shadow(0.05, 10, 3, 2),
          }}>
            <PunchStat icon={Clock} label="Check In" value={checkInLabel} />
            <PunchStat icon={Clock} label="Check Out" value={checkOutLabel} divider />
            <PunchStat icon={Hourglass} label="Work Duration" value={workDuration(todayAttendance?.checkInTime, todayAttendance?.checkOutTime, now, breakMin)} divider />
            <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: rs(2) }}>
              <View style={STAT_DIVIDER} />
              <View style={{ height: rs(18), justifyContent: 'center' }}>
                <View style={{ width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: statusColor }} />
              </View>
              <Text style={{ fontSize: rf(12), color: H.text, marginTop: rs(6) }} numberOfLines={1}>Status</Text>
              <View style={{ marginTop: rs(3), backgroundColor: statusTint, borderRadius: 999, paddingHorizontal: rs(12), paddingVertical: rs(2), maxWidth: '96%' }}>
                <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: statusInk }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{statusText}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Shop presence (server data from the geofence gate) — only while checked in. */}
          {presenceLive ? (
            <TouchableOpacity onPress={() => navigation.navigate('ShopPresenceHistory')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Shop presence history"
              style={{ marginTop: rs(8), paddingHorizontal: rs(12), paddingVertical: rs(8), borderRadius: rs(14), backgroundColor: C.card, borderWidth: 1, borderColor: H.cardBorder, ...shadow(0.05, 10, 3, 2) }}>
              <View className="flex-row items-center">
                <Text style={{ flex: 1, fontSize: rf(12.5), fontWeight: '800', color: H.ink }} numberOfLines={1}>
                  Shop Presence<Text style={{ fontWeight: '500', color: H.text }}>{presence.state === 'ON_AUTHORIZED_DUTY' ? ' · Field work' : ' · Monitoring'}</Text>
                </Text>
                <View style={{ backgroundColor: presence.state === 'OUTSIDE_SHOP' ? '#FEECEC' : presence.state === 'LOCATION_UNVERIFIED' ? '#FEF3C7' : '#E3F5EA', borderRadius: 999, paddingHorizontal: rs(8), paddingVertical: rs(2) }}>
                  <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: presence.state === 'OUTSIDE_SHOP' ? C.red : presence.state === 'LOCATION_UNVERIFIED' ? '#B7791F' : '#1E8E4E' }} numberOfLines={1}>{PRESENCE_LABEL[presence.state] || presence.state}</Text>
                </View>
              </View>
              <View className="flex-row items-center" style={{ marginTop: rs(4) }}>
                <Text style={{ flex: 1, fontSize: rf(11.5), color: H.text }} numberOfLines={1}>
                  Outside <Text style={{ fontWeight: '800', color: H.teal }}>{presence.outsideVisits ?? 0}</Text> visits · <Text style={{ fontWeight: '800', color: H.teal }}>{fmtDuration(presence.outsideSeconds)}</Text>
                </Text>
                <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: H.teal }}>History ›</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {/* Deliveries are pickup-person work: hidden for technicians. */}
          {isPickupPerson ? (
          <>
          </>
          ) : null}

          {/* 3b. Job Overview — counts per bucket; red dot = new unseen assignments */}
          <SectionTitle title={isPickupPerson ? 'Repair Pickups' : 'Job Overview'} />
          <View style={TILE_ROW}>
            {isPickupPerson ? (
              <>
                {/* Each tile opens My Pickups on the matching tile (its params.filter). */}
                <TaskCountCard
                  icon={ClipboardList} fg={TILE_TONES.blue} tint={C.redTint}
                  label="Assigned" value={pickupSummary.assigned} loading={pickups === null}
                  onPress={() => navigation.push('PickupAssign', { kind: 'REPAIR', filter: 'assigned' })}
                />
                <TaskCountCard
                  icon={Layers} fg={TILE_TONES.teal} tint={C.greenTint}
                  label="All Pickups" value={pickupSummary.total} loading={pickups === null}
                  onPress={() => navigation.push('PickupAssign', { kind: 'REPAIR', filter: 'total' })}
                />
                <TaskCountCard
                  icon={RefreshCw} fg={TILE_TONES.orange} tint={C.yellowTint}
                  label="In Progress" value={pickupSummary.inProgress} loading={pickups === null}
                  onPress={() => navigation.push('PickupAssign', { kind: 'REPAIR', filter: 'inProgress' })}
                />
                <TaskCountCard
                  icon={CircleCheck} fg={TILE_TONES.green} tint={C.greenTint}
                  label="Completed" value={pickupSummary.completed} loading={pickups === null}
                  onPress={() => navigation.push('PickupAssign', { kind: 'REPAIR', filter: 'completed' })}
                />
              </>
            ) : (
            <>
            <TaskCountCard
              icon={ClipboardList} fg={TILE_TONES.blue} tint={C.redTint}
              label="Assigned"
              value={taskSummary.assigned} loading={!tasksLoaded && ticketsLoading}
              onPress={openRecentAssigned}
            />
            <TaskCountCard
              icon={Layers} fg={TILE_TONES.teal} tint={C.greenTint}
              label="All Jobs"
              value={tickets.length} loading={!tasksLoaded && ticketsLoading}
              onPress={() => navigation.navigate('TaskReport')}
            />
            <TaskCountCard
              icon={Clock} fg={TILE_TONES.orange} tint={C.yellowTint}
              label="Pending"
              value={taskSummary.pending} loading={!tasksLoaded && ticketsLoading}
              onPress={() => navigation.navigate('TaskReport', { filter: 'Pending' })}
            />
            <TaskCountCard
              icon={CircleCheck} fg={TILE_TONES.green} tint={C.greenTint}
              label="Completed"
              value={taskSummary.completed} loading={!tasksLoaded && ticketsLoading}
              onPress={() => navigation.navigate('TaskReport', { filter: 'Completed' })}
            />
            </>
            )}
          </View>
          {/* Marketplace pickups: their own screen (Buy deliveries), not mixed into My Pickups. */}
          {isPickupPerson ? (
          <>
          <SectionTitle title="Selling Pickups" />
          <View style={TILE_ROW}>
            {[
              { key: 'assigned', label: 'Assigned', icon: ClipboardList, fg: TILE_TONES.blue, tint: C.redTint },
              { key: 'total', label: 'All Pickups', icon: Layers, fg: TILE_TONES.teal, tint: C.greenTint },
              { key: 'inProgress', label: 'In Progress', icon: RefreshCw, fg: TILE_TONES.orange, tint: C.yellowTint },
              { key: 'completed', label: 'Completed', icon: CircleCheck, fg: TILE_TONES.green, tint: C.greenTint },
            ].map((t) => (
              <TaskCountCard key={t.key} icon={t.icon} fg={t.fg} tint={t.tint} label={t.label}
                value={sellSummary[t.key]} loading={pickups === null}
                onPress={() => navigation.push('PickupAssign', { kind: 'SELL', filter: t.key })} />
            ))}
          </View>
          <SectionTitle title="Marketplace Pickups" />
          {/* Same tile design as Repair Pickups; each opens Buy Deliveries on that tile. */}
          <View style={TILE_ROW}>
            {[
              { key: 'PICKUP', label: 'Pickup', icon: Package, fg: TILE_TONES.blue, tint: C.redTint },
              { key: 'DELIVERY', label: 'Delivery', icon: Truck, fg: TILE_TONES.orange, tint: C.yellowTint },
              { key: 'HISTORY', label: 'Completed', icon: CircleCheck, fg: TILE_TONES.green, tint: C.greenTint },
            ].map((t) => (
              <TaskCountCard key={t.key} icon={t.icon} fg={t.fg} tint={t.tint} label={t.label}
                value={t.key === 'SELL' ? (pickups || []).filter((b) => b.kind === 'SELL').length
                  : buyOrders === null ? 0 : buyOrders.filter((o) => DELIVERY_TABS.find((d) => d.key === t.key)?.statuses.includes(o.status)).length}
                loading={t.key === 'SELL' ? pickups === null : buyOrders === null}
                onPress={() => (t.key === 'SELL'
                  ? navigation.push('PickupAssign', { kind: 'SELL' })
                  : navigation.navigate('BuyDeliveries', { filter: t.key }))} />
            ))}
          </View>

          </>
          ) : null}
          {/* Repair return deliveries: shown to whoever the Partner App assigns them to. */}
          {isPickupPerson || (repairDeliveries || []).length ? (
          <>
          <SectionTitle title="Repair Deliveries" />
          <View style={TILE_ROW}>
            {[
              { key: 'ASSIGNED', label: 'New', icon: Truck, fg: TILE_TONES.blue, tint: C.redTint, match: (s) => s === 'ASSIGNED' },
              { key: 'ACTIVE', label: 'Active', icon: ArrowRightLeft, fg: TILE_TONES.orange, tint: C.yellowTint, match: (s) => s !== 'ASSIGNED' && REPAIR_DELIVERY_TABS[0].statuses.includes(s) },
              { key: 'HISTORY', label: 'Completed', icon: CircleCheck, fg: TILE_TONES.green, tint: C.greenTint, match: (s) => REPAIR_DELIVERY_TABS[1].statuses.includes(s) },
            ].map((t) => (
              <TaskCountCard key={t.key} icon={t.icon} fg={t.fg} tint={t.tint} label={t.label}
                value={(repairDeliveries || []).filter((d) => t.match(d.status)).length}
                loading={repairDeliveries === null}
                onPress={() => navigation.navigate('RepairDeliveries', { tab: t.key === 'HISTORY' ? 'HISTORY' : 'ACTIVE' })} />
            ))}
          </View>
          </>
          ) : null}
          {!isPickupPerson && !tasksLoaded && !ticketsLoading && errors.tickets ? (
            <Text style={{ fontSize: rf(11), color: C.muted, marginTop: rs(4) }} numberOfLines={1}>
              Couldn’t load tasks — will retry automatically.
            </Text>
          ) : null}

          {/* 3c. My Tasks — general shop tasks (separate from repair jobs) */}
          <MyTasksShortcut navigation={navigation} />

          {/* 4. Quick Access — every category for this role, Partner-app tile grid */}
          <SectionTitle title="Quick Access" />
          <View style={{
            backgroundColor: C.card, borderRadius: rs(16), borderWidth: 1, borderColor: H.cardBorder,
            paddingTop: rs(14), paddingBottom: rs(4), ...shadow(0.05, 10, 3, 2),
          }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: quickPad }}>
              {categories.map((c, i) => (
                <QuickTile
                  key={c.key}
                  item={c}
                  width={quickW}
                  style={{ marginRight: i % quickCols === quickCols - 1 ? 0 : quickGap, marginBottom: rs(10) }}
                  onPress={() => navigation.navigate(c.route, c.params)}
                />
              ))}
            </View>
          </View>

          {/* 11–13. This Month */}
          <View style={{
            marginTop: rs(12), backgroundColor: C.card, borderRadius: rs(16),
            borderWidth: 1, borderColor: H.cardBorder, paddingHorizontal: rs(12), paddingVertical: rs(12), ...shadow(0.05, 10, 3, 2),
          }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1" style={{ marginRight: rs(8) }}>
                <Calendar size={rs(22)} color={H.teal} strokeWidth={1.9} />
                <Text style={{ fontSize: rf(15), fontWeight: '800', color: H.ink, marginLeft: rs(10) }} numberOfLines={1}>This Month</Text>
              </View>
              <View className="flex-row items-center" style={{ gap: rs(8) }}>
                <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={6} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Previous month" style={[MONTH_BTN, { backgroundColor: '#192F36' }]}>
                  <ChevronLeft size={rs(16)} color="#FFFFFF" strokeWidth={2.6} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMonthPickerOpen(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Select month" className="flex-row items-center" style={{ gap: rs(6) }}>
                  <Calendar size={rs(15)} color={H.ink} strokeWidth={1.8} />
                  <Text style={{ fontSize: rf(14), fontWeight: '800', color: H.ink }} numberOfLines={1}>{`${MONTHS_SHORT[month - 1]} ${year}`}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={6} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Next month" style={[MONTH_BTN, { backgroundColor: '#065F3B' }]}>
                  <ChevronRight size={rs(16)} color="#FFFFFF" strokeWidth={2.6} />
                </TouchableOpacity>
              </View>
            </View>

            <View className="flex-row" style={{ marginTop: rs(16) }}>
              <MonthStat icon={CalendarCheck} color="#15803D" outline="#16A34A" value={present} label="Present" />
              <MonthStat icon={CalendarX} color="#F19D07" bg="#FEF1D6" fill="#F9A60C" value={leaveDays} label="Leave" />
              <MonthStat icon={FileText} color="#006F68" bg="#E1F3F1" fill="#077775" value={permission} label="Permission" />
              <MonthStat icon={RotateCcwClock} color="#105351" outline="#078572" value={lateHrs} label="Late Hrs" />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Same day/month/year calendar as Apply for Leave; picking any date
          switches the This Month card to that date's month. */}
      <CalendarModal
        visible={monthPickerOpen}
        initial={month === now.getMonth() + 1 && year === now.getFullYear() ? toISO(now) : toISO(new Date(year, month - 1, 1))}
        onCancel={() => setMonthPickerOpen(false)}
        onSave={(iso) => {
          const d = parseISO(iso);
          if (d) selectMonth(d.getMonth() + 1, d.getFullYear());
          else setMonthPickerOpen(false);
        }}
        accent={C.green}
        accentSoft={C.greenTint}
      />
      <CheckoutReminder onDuty={hasCheckedIn && !hasCheckedOut} />
      {isPickupPerson || (repairDeliveries || []).length ? (
        <PickupSoonPopup
          pickups={pickups == null && repairDeliveries == null ? null
            : [...(pickups || []), ...(repairDeliveries || []).map((d) => ({ ...d, _rd: true })), ...(buyOrders || []).map((o) => ({ ...o, _buy: true }))]}
          navigation={navigation}
          onChanged={onPullRefresh}
        />
      ) : null}
    </SafeAreaView>
  );
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Mon, 6 Oct 2026" — compact date for the header bar.
function formatShortDay(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]}, ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

// Bold section heading (customer-app style, no "See all" — there's no list screen to open).
function SectionTitle({ title, onViewAll }) {
  return (
    <View className="flex-row items-center" style={{ marginTop: rs(16), marginBottom: rs(8) }}>
      <Text style={{ flex: 1, fontSize: rf(16), fontWeight: '800', color: H.ink }}>{title}</Text>
      {onViewAll ? (
        <TouchableOpacity onPress={onViewAll} hitSlop={8} activeOpacity={0.7} className="flex-row items-center" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: rf(13), fontWeight: '600', color: C.green }}>View All</Text>
          <ChevronRight size={rs(15)} color={C.text} style={{ marginLeft: rs(4) }} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// One Quick Access tile: mint circle with an outline teal glyph and a
// two-line label underneath. `tint` ({ bg, fg }) overrides the colours.
function QuickTile({ item, width, style, onPress, tint }) {
  const t = { bg: QUICK_BG, fg: QUICK_FG, ...(QUICK_TILES[item.key] || QUICK_TILES.default), ...(tint || {}) };
  const Icon = t.icon;
  const { width: winW } = useWindowDimensions();
  const cls = winW >= 768 ? 2 : winW >= 430 ? 1 : 0;
  const box = [46, 48, 52][cls];
  const glyph = [22, 23, 25][cls];
  const fs = [12, 12.5, 13][cls];
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label.replace(/\n/g, ' ')}
      activeOpacity={0.75}
      // No side padding (partner has 4): the 8px column gap already separates
      // labels, and the extra width keeps "Attendance" on one line at 360dp
      // without shrinking the font.
      style={[{ width, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 }, style]}
    >
      <View style={{ width: box, height: box, borderRadius: box / 2, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDF0EC' }}>
        <Icon size={glyph} color={t.fg} strokeWidth={1.8} />
        {t.badge ? (
          <View style={{
            position: 'absolute', top: -rs(4), right: -rs(4), minWidth: rs(18), height: rs(18), borderRadius: rs(9),
            paddingHorizontal: rs(4), backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: t.badgeBg, alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: rf(10), fontWeight: '800', color: t.badgeBg }}>{t.badge > 9 ? '9+' : t.badge}</Text>
          </View>
        ) : null}
      </View>
      {/* Plain RN Text with Inter SemiBold set directly: the partner tile sizes
          (fs) are exact, so they skip the shared Typography scale.
          minHeight reserves two lines so every tile in a row lines up. */}
      <RNText
        style={{ fontFamily: interFamily('600'), fontSize: fs, lineHeight: fs + 4, minHeight: (fs + 4) * 2, color: H.text, marginTop: 6, letterSpacing: -0.1, textAlign: 'center' }}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {item.label}
      </RNText>
    </TouchableOpacity>
  );
}

function shadow(opacity = 0.06, radius = 10, y = 4, elevation = 2) {
  return { shadowColor: C.ink, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height: y }, elevation };
}

function HeaderButton({ icon: Icon, dot, plain, onPress }) {
  const size = plain ? rs(38) : rs(44);
  const chrome = plain ? {} : { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, ...shadow(0.06, 6, 2, 2) };
  return (
    <TouchableOpacity hitSlop={8} onPress={onPress} activeOpacity={0.8}
               style={{ width: size, height: size, borderRadius: size / 2, marginLeft: plain ? rs(4) : rs(8), alignItems: 'center', justifyContent: 'center', ...chrome }}>
      <Icon size={plain ? rs(24) : rs(20)} color={H.ink} strokeWidth={1.9} />
      {dot ? (
        <View style={{
          position: 'absolute', top: rs(6), right: rs(7), width: rs(10), height: rs(10),
          borderRadius: rs(5), backgroundColor: '#035C6C', borderWidth: 1.5, borderColor: '#FFFFFF',
        }} />
      ) : null}
    </TouchableOpacity>
  );
}

// Pickup / job count tile: outline glyph with a teal count badge, label below.
function TaskCountCard({ icon: Icon, label, value, loading, onPress }) {
  const n = Number(value) || 0;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1, alignItems: 'center', minWidth: 0 }} accessibilityRole="button" accessibilityLabel={`${label}: ${loading ? '' : n}`}>
      <View>
        <Icon size={rs(28)} color={H.ink} strokeWidth={1.6} />
        <View style={[COUNT_BADGE, { position: 'absolute', top: -rs(9), left: rs(17) }]}>
          <Text style={COUNT_BADGE_TEXT} numberOfLines={1}>{loading ? '…' : n > 99 ? '99+' : String(n)}</Text>
        </View>
      </View>
      <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: H.ink, marginTop: rs(8) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </TouchableOpacity>
  );
}

// "Xh YYm" worked today: check-in → check-out (or now), minus phone-logged break minutes.
function workDuration(inTime, outTime, now, breakMin = 0) {
  const mins = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  if (!inTime || Number.isNaN(mins(inTime))) return '--:--';
  const end = outTime ? mins(outTime) : now.getHours() * 60 + now.getMinutes();
  const d = Math.max(0, end - mins(inTime) - breakMin);
  return `${Math.floor(d / 60)}h ${String(d % 60).padStart(2, '0')}m`;
}

// Check In / Break / Check Out tile. The active one (the next punch) is the
// raised teal gradient tile; the others are plain on the white card.
function PunchTile({ active, icon: Icon, title, sub, busy, disabled, onPress }) {
  const body = (
    <>
      {busy ? <ActivityIndicator color={active ? '#FFFFFF' : H.teal} style={{ height: rs(28) }} />
        : <Icon size={rs(28)} color={active ? '#FFFFFF' : H.teal} strokeWidth={1.9} />}
      <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: active ? '#FFFFFF' : H.ink, marginTop: rs(6) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
      <Text style={{ fontSize: rf(12), color: active ? 'rgba(255,255,255,0.92)' : H.text, marginTop: rs(2) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{sub}</Text>
    </>
  );
  const inner = { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(6) };
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={title}
                      style={[
                        { flex: 1, borderRadius: rs(16), opacity: active && disabled && !busy ? 0.6 : 1 },
                        active ? { marginVertical: -rs(3), marginRight: -1, backgroundColor: '#035C6C', ...shadow(0.2, 10, 5, 6) } : null,
                      ]}>
      {active ? (
        <LinearGradient colors={['#035C6C', '#035C6C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={[inner, { borderRadius: rs(16), paddingVertical: rs(15) }]}>{body}</LinearGradient>
      ) : (
        <View style={[inner, { paddingVertical: rs(12) }]}>{body}</View>
      )}
    </TouchableOpacity>
  );
}

function PunchStat({ icon: Icon, label, value, divider }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: rs(2) }}>
      {divider ? <View style={STAT_DIVIDER} /> : null}
      <Icon size={rs(18)} color={H.ink} strokeWidth={1.8} />
      <Text style={{ fontSize: rf(12), color: H.text, marginTop: rs(6) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
      <Text style={{ fontSize: rf(13), fontWeight: '800', color: H.ink, marginTop: rs(3) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</Text>
    </View>
  );
}

function Avatar({ uri, name, size, dark }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={box} />;
  return (
    <View className="items-center justify-center" style={{ ...box, backgroundColor: dark ? '#111111' : '#133333', ...shadow(0.2, 6, 3, 3) }}>
      <Text className="font-extrabold" style={{ fontSize: rf(20), color: '#FFFFFF' }}>{initialsFromName(name)}</Text>
    </View>
  );
}

// This Month stat: glyph (optionally on a tinted circle) with a count pill
// at its top-right — filled (`fill`) or white with a coloured ring (`outline`).
function MonthStat({ icon: Icon, color, bg, fill, outline, value, label }) {
  const z = rs(46);
  return (
    <View style={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
      <View style={{ width: z, height: z, borderRadius: z / 2, backgroundColor: bg || 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={rs(26)} color={color} strokeWidth={1.9} />
        <View style={[COUNT_BADGE, {
          position: 'absolute', top: -rs(8), left: z * 0.6, minWidth: rs(22), height: rs(20),
          backgroundColor: fill || '#FFFFFF', borderColor: fill ? '#FFFFFF' : outline,
        }]}>
          <Text style={[COUNT_BADGE_TEXT, { color: fill ? '#FFFFFF' : outline }]} numberOfLines={1}>{String(value)}</Text>
        </View>
      </View>
      <Text style={{ fontSize: rf(13), fontWeight: '700', color: H.ink, marginTop: rs(8) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </View>
  );
}

const INFO_CARD = {
  flex: 1, minWidth: 0, justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: rs(16), borderWidth: 1, borderColor: H.cardBorder,
  paddingHorizontal: rs(12), paddingVertical: rs(12), overflow: 'hidden', ...shadow(0.05, 10, 3, 2),
};
const PUNCH_DIVIDER = { width: 1, backgroundColor: H.line, marginVertical: rs(14) };
const STAT_DIVIDER = { position: 'absolute', left: 0, top: rs(2), bottom: rs(2), width: 1, backgroundColor: H.line };
const TILE_ROW = {
  flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: rs(16), borderWidth: 1, borderColor: H.cardBorder,
  paddingTop: rs(16), paddingBottom: rs(12), paddingHorizontal: rs(4), ...shadow(0.05, 10, 3, 2),
};
const COUNT_BADGE = {
  minWidth: rs(20), height: rs(20), borderRadius: rs(10), paddingHorizontal: rs(5), backgroundColor: H.badge,
  borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
};
const COUNT_BADGE_TEXT = { fontSize: rf(10.5), fontWeight: '800', color: '#FFFFFF', includeFontPadding: false };
const MONTH_BTN = { width: rs(28), height: rs(28), borderRadius: rs(14), alignItems: 'center', justifyContent: 'center' };

