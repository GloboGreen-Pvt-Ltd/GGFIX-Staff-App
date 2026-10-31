import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, ScrollView, Image, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Bell,
  MapPin,
  ChevronRight,
  Calendar,
  Briefcase,
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
import { loadRepairDone } from '../utils/repairDone';
import { listTechnicianWorkStatuses } from '../api/master';
import { effectiveLateMinutes } from './DailyAttendanceScreen';
import { loadUnreadNotificationCount } from './NotificationsScreen';
import { readCurrentLocation, haversineMeters, GEOFENCE_RADIUS_METERS } from '../utils/geo';
import { useLogout } from '../auth/LogoutContext';
import { notify } from '../components/confirm';
import { userMessage } from '../utils/userMessages';
import CheckoutReminder from '../components/CheckoutReminder';
import MyTasksShortcut from '../components/MyTasksShortcut';
import { syncCheckoutAlarm, cancelCheckoutAlarm } from '../utils/checkoutAlarm';
import { CalendarModal, parseISO, toISO } from '../components/DatePickerField';
import { useBreak, formatMinutes } from '../utils/breakTracker';
import { BadgeIconTile, MonthPill, TILE_TONES } from '../components/MintKit';

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

const MAX_CONTENT_WIDTH = 720;
// Quick Access tiles, styled like the Partner app's dashboard tools: a pastel
// circle behind a solid MaterialCommunityIcons glyph. Keyed by the category
// `key` from config/categories.js; same pastel set as the Partner app.
const QUICK_TILE_INK = '#111111';
// Brand palette circles with white icons (teal, navy, blue, green, orange, red).
const QUICK_TILES = {
  daily_attendance: { icon: 'account-clock', bg: '#035C6C', fg: '#FFFFFF' },
  daily_shift:      { icon: 'calendar-clock', bg: '#0788C9', fg: '#FFFFFF' },
  monthly_summary:  { icon: 'calendar-month', bg: '#1C3053', fg: '#FFFFFF' },
  leave_request:    { icon: 'calendar-remove', bg: '#F32C26', fg: '#FFFFFF' },
  apply_permission: { icon: 'shield-check', bg: '#609138', fg: '#FFFFFF' },
  leave_report:     { icon: 'clipboard-text', bg: '#FAA700', fg: '#FFFFFF' },
  permission_report: { icon: 'clipboard-clock', bg: '#035C6C', fg: '#FFFFFF' },
  assign_task:      { icon: 'clipboard-account', bg: '#0788C9', fg: '#FFFFFF' },
  task_report:      { icon: 'clipboard-check', bg: '#609138', fg: '#FFFFFF' },
  assign_pickup:    { icon: 'truck', bg: '#1C3053', fg: '#FFFFFF' },
  pickup_report:    { icon: 'truck-delivery', bg: '#F32C26', fg: '#FFFFFF' },
  salary_report:    { icon: 'currency-inr', bg: '#FAA700', fg: '#FFFFFF' },
  default:          { icon: 'view-grid', bg: '#035C6C', fg: '#FFFFFF' },
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

// Task summary cards (above Quick Access). Buckets mirror the rules the task
// screens already use:
//   Recent Assigned — assigned to me but not yet accepted/started (same
//                     `needsAccept` rule as TaskAssignScreen).
//   Completed       — READY / DELIVERED (work done; shop-side handover).
//   Pending         — everything else accepted and still open
//                     (CREATED, IN_DIAGNOSIS, QUOTED, APPROVED, IN_REPAIR…).
// CANCELLED tickets are excluded from all three.
const TASK_FINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED']);
const TASK_COMPLETED_STATUSES = new Set(['READY', 'INVOICE_GENERATED', 'INVOICE_READY', 'DELIVERED_PROCESSING', 'DELIVERED']);
const TASK_POLL_MS = 30000;
function taskBucket(t) {
  const s = String(t?.status || '').toUpperCase();
  if (s === 'CANCELLED') return null;
  if (!t?.technicianAcceptedAt && !TASK_FINAL_STATUSES.has(s)) return 'assigned';
  if (TASK_COMPLETED_STATUSES.has(s) || t?.repairDone) return 'completed';
  return 'pending';
}
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
  const [repairDoneById, setRepairDoneById] = useState({});

  const reloadTickets = useCallback(async () => {
    try {
      const page = await listMyTickets({ page: 0, size: 100 });
      const items = Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []);
      setTickets(items);
      setTasksLoaded(true);
      setErrors((s) => (s.tickets ? { ...s, tickets: undefined } : s));
      // Repair Completed counts the job as done without waiting for the shop.
      loadRepairDone(items).then(setRepairDoneById);
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

  const taskSummary = useMemo(() => {
    const assignedIds = [];
    let pending = 0;
    let completed = 0;
    tickets.forEach((t) => {
      const b = taskBucket(repairDoneById[t.id] ? { ...t, repairDone: true } : t);
      if (b === 'assigned') { if (t?.id != null) assignedIds.push(String(t.id)); }
      else if (b === 'pending') pending += 1;
      else if (b === 'completed') completed += 1;
    });
    const unseen = seenAssigned ? assignedIds.filter((id) => !seenAssigned.has(id)).length : 0;
    return { assigned: assignedIds.length, assignedIds, pending, completed, unseen };
  }, [tickets, seenAssigned, repairDoneById]);

  const openRecentAssigned = () => {
    const ids = taskSummary.assignedIds;
    setSeenAssigned(new Set(ids));
    writeSeenAssigned(userKey, ids);
    navigation.navigate('TaskAssign');
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
  const statusColor = buttonMode === 'in' || onBreak ? '#FAA700' : '#609138';

  // Layout maths. Content is capped on tablets so cards don't stretch edge to edge.
  const contentW = Math.min(winW, MAX_CONTENT_WIDTH);
  const pad = rs(14);
  const innerW = contentW - pad * 2;
  // Quick Access grid (Partner app layout): 4 tiles a row on a phone, 5 on a
  // large phone, 6 on a tablet; a short last row stays left-aligned.
  const quickCols = winW >= 768 ? 6 : winW >= 430 ? 5 : 4;
  const quickGap = rs(8);
  const quickPad = rs(8);
  const quickW = Math.floor((innerW - 2 - quickPad * 2 - quickGap * (quickCols - 1)) / quickCols);
  // Month tiles sit icon-beside-value when there's room, icon-above otherwise.
  const statGap = rs(6);
  const statTileW = (innerW - rs(24) - statGap * 3) / 4;
  const statInline = statTileW >= 88;

  // Ticket QR scanning only applies to roles that handle tickets.
  const showScan = resolveRoleKey(session) !== 'STAFF';

  const ticketLine = (t) => `${ticketRef(t)} · ${t.deviceDisplayName || 'Device'}${t.repairServicesSummary ? ` - ${t.repairServicesSummary}` : ''}`;
  // Apply Permission tile: red + count while requests await approval, green + count once approved.
  const perms = leaves.filter((l) => String(l.leaveType).toUpperCase() === 'PERMISSION');
  const pendingPerms = perms.filter((l) => !/APPROV|REJECT|CANCEL/i.test(String(l.status || ''))).length;
  const approvedPerms = perms.filter((l) => /APPROV/i.test(String(l.status || ''))).length;
  const permTile = pendingPerms ? { bg: TILE_TONES.red, fg: '#FFFFFF' }
    : approvedPerms ? { bg: TILE_TONES.green, fg: '#FFFFFF' } : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.card }} edges={['top']}>
      {/* Fixed top bar — stays put while the page scrolls */}
      <View style={{ backgroundColor: '#FFFFFF', alignItems: 'center', paddingBottom: rs(8), borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ width: contentW, paddingHorizontal: pad }}>
            {/* 1. Header: menu, wordmark, (scan), bell, avatar */}
            <View className="flex-row items-center" style={{ paddingTop: rs(8) }}>
              <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('AccountTab')} accessibilityLabel="Menu">
                <Menu size={rs(24)} color={C.text} />
              </TouchableOpacity>
              <Text style={{ flex: 1, marginLeft: rs(12), fontSize: rf(20), fontWeight: '900', color: C.text, letterSpacing: 0.3 }} numberOfLines={1}>
                NEAR G <Text style={{ color: C.green }}>FIX</Text>
              </Text>
              {showScan ? <HeaderButton plain icon={ScanLine} onPress={() => navigation.navigate('ScanTicketQr')} /> : null}
              <HeaderButton plain icon={Bell} dot={unreadNotifs > 0} onPress={() => navigation.navigate('Notifications')} />
              <TouchableOpacity hitSlop={6} onPress={() => navigation.navigate('TechnicianProfile')} style={{ marginLeft: rs(8) }} accessibilityLabel="My profile">
                <Avatar uri={session?.photoUrl} name={displayName} size={rs(40)} />
                <View style={{
                  position: 'absolute', right: -rs(1), bottom: 0,
                  width: rs(12), height: rs(12), borderRadius: rs(6), borderWidth: 2, borderColor: '#FFFFFF',
                  backgroundColor: hasCheckedIn && !hasCheckedOut ? C.green : C.faint,
                }} />
              </TouchableOpacity>
            </View>
        </View>
      </View>
      <ScrollView
        style={{ backgroundColor: C.bg }}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: rs(12) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentW, paddingHorizontal: pad }}>
          {/* 2. Greeting + date (left), location card (right) */}
          <View style={{ marginTop: rs(6), flexDirection: 'row', alignItems: 'stretch', gap: rs(10) }}>
            <View style={{ flex: 1, minWidth: 0, justifyContent: 'center', backgroundColor: '#EAF5F7', borderRadius: rs(12), borderWidth: 1, borderColor: '#D5EBEF', paddingHorizontal: rs(10), paddingVertical: rs(6), overflow: 'hidden' }}>
              <View pointerEvents="none" style={{ position: 'absolute', right: rs(6), top: rs(4), opacity: 0.9 }}>
                {now.getHours() >= 18 || now.getHours() < 5 ? <Moon size={rs(30)} color="#1C3053" strokeWidth={1.6} /> : <CloudSun size={rs(34)} color="#FAA700" strokeWidth={1.6} />}
              </View>
              <Text style={{ fontSize: rf(12), color: C.muted }} numberOfLines={1}>{greeting},</Text>
              <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text, marginTop: rs(1) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {displayName} 👋
              </Text>
              <View className="flex-row items-center" style={{ marginTop: rs(3) }}>
                <Calendar size={rs(15)} color={C.green} />
                <Text style={{ fontSize: rf(11.5), color: C.muted, marginLeft: rs(4) }} numberOfLines={1}>{formatShortDay(now)}</Text>
              </View>
            </View>
            <View className="flex-row items-center" style={{
              flex: 1, minWidth: 0, backgroundColor: C.card, borderRadius: rs(12), borderWidth: 1, borderColor: C.border,
              paddingHorizontal: rs(10), paddingVertical: rs(6), overflow: 'hidden',
            }}>
              <MapPin size={rs(17)} color={C.green} fill={C.green} stroke="#FFFFFF" strokeWidth={1.6} />
              <View style={{ flex: 1, marginLeft: rs(8) }}>
                <Text style={{ fontSize: rf(12), color: C.muted }}>Your Location</Text>
                <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text, marginTop: rs(1) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Globo Green</Text>
                <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: rs(1) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Cuddalore, Tamil Nadu</Text>
                {geo.inRange != null ? (
                  <View className="flex-row items-center" style={{ marginTop: rs(3) }}>
                    {geo.inRange ? <ShieldCheck size={rs(12)} color={C.green} /> : <ShieldAlert size={rs(12)} color={C.red} />}
                    <Text style={{ fontSize: rf(10.5), fontWeight: '700', color: geo.inRange ? C.green : C.red, marginLeft: rs(3) }} numberOfLines={1}>
                      {geo.inRange ? 'In range' : 'Out of range'}{geo.distance != null ? ` · ${geo.distance}m` : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* 3. Check In / Check Out tiles */}
          <View className="flex-row" style={{
            marginTop: rs(8), padding: rs(4), borderRadius: rs(14), backgroundColor: C.card,
            borderWidth: 1, borderColor: C.border, ...shadow(0.06, 12, 4, 3),
          }}>
            <PunchTile
              active={buttonMode === 'in'} icon={FingerprintPattern} title={hasCheckedIn ? 'Checked In' : 'Check In'}
              sub={hasCheckedIn ? checkInLabel : geoBlocksCheckIn ? 'Out of range' : 'Tap to Check In'}
              busy={checkInBusy && buttonMode === 'in'} disabled={buttonMode !== 'in' || buttonDisabled} onPress={handleCheckInPress}
            />
            <View style={{ width: 1, backgroundColor: C.border, marginVertical: rs(10), marginHorizontal: rs(4) }} />
            <PunchTile
              active={onBreak} icon={Coffee} accent="#FAA700" title={onBreak ? 'End Break' : 'Break'}
              sub={onBreak ? `On break · ${formatMinutes(breakMin)}` : breakMin > 0 ? `Taken ${formatMinutes(breakMin)}` : buttonMode === 'out' ? 'Tap to start' : 'After check-in'}
              disabled={buttonMode !== 'out' || checkInBusy} onPress={toggleBreak}
            />
            <View style={{ width: 1, backgroundColor: C.border, marginVertical: rs(10), marginHorizontal: rs(4) }} />
            <PunchTile
              active={buttonMode === 'out' && !onBreak} icon={LogOut} title={hasCheckedOut ? 'Checked Out' : 'Check Out'}
              sub={hasCheckedOut ? checkOutLabel : 'Tap to Check Out'}
              busy={checkInBusy && buttonMode === 'out'} disabled={buttonMode !== 'out' || buttonDisabled} onPress={handleCheckInPress}
            />
          </View>

          {/* Today's punches + duration + status (tap → Daily Attendance history) */}
          <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('DailyAttendance')} className="flex-row" style={{
            marginTop: rs(6), paddingVertical: rs(6), borderRadius: rs(12), backgroundColor: C.card,
            borderWidth: 1, borderColor: C.border, ...shadow(0.04, 8, 2, 1),
          }}>
            <PunchStat icon={Clock} label="Check In" value={checkInLabel} />
            <PunchStat icon={Clock} label="Check Out" value={checkOutLabel} divider />
            <PunchStat icon={Briefcase} label="Work Duration" value={workDuration(todayAttendance?.checkInTime, todayAttendance?.checkOutTime, now, breakMin)} divider />
            <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: rs(2), borderLeftWidth: 1, borderLeftColor: C.border }}>
              <View style={{ width: rs(10), height: rs(10), borderRadius: rs(5), backgroundColor: statusColor, marginVertical: rs(3) }} />
              <Text style={{ fontSize: rf(10), color: C.muted, marginTop: rs(2) }}>Status</Text>
              <View style={{ marginTop: rs(2), backgroundColor: `${statusColor}22`, borderRadius: rs(6), paddingHorizontal: rs(6), paddingVertical: rs(1) }}>
                <Text style={{ fontSize: rf(10.5), fontWeight: '700', color: statusColor === '#FAA700' ? '#FAA700' : statusColor }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{statusText}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* 3b. Job Overview — counts per bucket; red dot = new unseen assignments */}
          <SectionTitle title="Job Overview" />
          <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: rs(14), borderWidth: 1, borderColor: C.border, paddingVertical: rs(6), paddingHorizontal: rs(4), ...shadow(0.04, 8, 2, 1) }}>
            <TaskCountCard
              icon={ClipboardList} fg={TILE_TONES.blue} tint={C.redTint}
              label="Assigned"
              value={taskSummary.assigned} loading={!tasksLoaded && ticketsLoading}
              onPress={openRecentAssigned}
            />
            <TaskCountCard
              icon={Briefcase} fg={TILE_TONES.teal} tint={C.greenTint}
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
          </View>
          {!tasksLoaded && !ticketsLoading && errors.tickets ? (
            <Text style={{ fontSize: rf(11), color: C.muted, marginTop: rs(4) }} numberOfLines={1}>
              Couldn’t load tasks — will retry automatically.
            </Text>
          ) : null}

          {/* 3c. My Tasks — general shop tasks (separate from repair jobs) */}
          <MyTasksShortcut navigation={navigation} />

          {/* 4. Quick Access — every category for this role, Partner-app tile grid */}
          <SectionTitle title="Quick Access" />
          <View style={{
            backgroundColor: C.card, borderRadius: rs(14), borderWidth: 1, borderColor: '#E8ECEF',
            paddingTop: rs(8), paddingBottom: rs(2), paddingHorizontal: quickPad, ...shadow(0.05, 10, 3, 1),
          }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {categories.map((c, i) => (
                <QuickTile
                  key={c.key}
                  item={c}
                  width={quickW}
                  style={{ marginRight: i % quickCols === quickCols - 1 ? 0 : quickGap, marginBottom: rs(4) }}
                  tint={c.key === 'apply_permission' ? permTile : null}
                  onPress={() => navigation.navigate(c.route, c.params)}
                />
              ))}
            </View>
          </View>

          {/* 11–13. This Month */}
          <View style={{
            marginTop: rs(10), backgroundColor: C.card, borderRadius: rs(14),
            borderWidth: 1, borderColor: C.border, padding: rs(8), ...shadow(0.05, 10, 3, 2),
          }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1" style={{ marginRight: rs(8) }}>
                <View className="items-center justify-center" style={{ width: rs(30), height: rs(30), borderRadius: rs(8), backgroundColor: C.greenTint }}>
                  <Calendar size={rs(15)} color={C.green} strokeWidth={2.2} />
                </View>
                <Text className="font-extrabold" style={{ fontSize: rf(14.5), color: C.text, marginLeft: rs(8) }} numberOfLines={1}>This Month</Text>
              </View>
              <MonthPill month={month} year={year} onChange={(m, y) => selectMonth(m, y)} />
            </View>

            <View className="flex-row" style={{ marginTop: rs(6), gap: statGap }}>
              <StatTile inline={statInline} bg={C.greenTint} fg={TILE_TONES.green} icon={Calendar} value={String(present)} label="Present" />
              <StatTile inline={statInline} bg={C.yellowTint} fg={TILE_TONES.orange} icon={Briefcase} value={String(leaveDays)} label="Leave" />
              <StatTile inline={statInline} bg={C.greenTint} fg={TILE_TONES.blue} icon={ClipboardList} value={String(permission)} label="Permission" />
              <StatTile inline={statInline} bg={C.redTint} fg={TILE_TONES.red} icon={Clock} value={String(lateHrs)} label="Late Hrs" />
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
    <View className="flex-row items-center" style={{ marginTop: rs(10), marginBottom: rs(6) }}>
      <Text style={{ flex: 1, fontSize: rf(14.5), fontWeight: '800', color: '#1C3053' }}>{title}</Text>
      {onViewAll ? (
        <TouchableOpacity onPress={onViewAll} hitSlop={8} activeOpacity={0.7} className="flex-row items-center" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: rf(13), fontWeight: '600', color: C.green }}>View All</Text>
          <ChevronRight size={rs(15)} color={C.text} style={{ marginLeft: rs(4) }} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// One Quick Access tile, as in the Partner app: no card box, just a pastel
// circle with a solid glyph and a two-line label underneath.
function QuickTile({ item, width, style, onPress, tint }) {
  const t = { ...(QUICK_TILES[item.key] || QUICK_TILES.default), ...(tint || {}) };
  const box = rs(36);
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label.replace(/\n/g, ' ')}
      activeOpacity={0.75}
      style={[{ width, alignItems: 'center', paddingVertical: rs(2) }, style]}
    >
      <View style={{ width: box, height: box, borderRadius: box / 2, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name={t.icon} size={rs(19)} color={t.fg || QUICK_TILE_INK} />
        {t.badge ? (
          <View style={{
            position: 'absolute', top: -rs(4), right: -rs(4), minWidth: rs(18), height: rs(18), borderRadius: rs(9),
            paddingHorizontal: rs(4), backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: t.badgeBg, alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: rf(10), fontWeight: '800', color: t.badgeBg }}>{t.badge > 9 ? '9+' : t.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text
        style={{ fontSize: rf(11), lineHeight: rlh(14), minHeight: rlh(28), fontWeight: '600', color: C.text, textAlign: 'center', marginTop: rs(4), letterSpacing: -0.1 }}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {item.label}
      </Text>
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
      <Icon size={plain ? rs(23) : rs(20)} color={C.text} />
      {dot ? (
        <View style={{
          position: 'absolute', top: rs(8), right: rs(9), width: rs(9), height: rs(9),
          borderRadius: rs(5), backgroundColor: C.red, borderWidth: 1.5, borderColor: '#FFFFFF',
        }} />
      ) : null}
    </TouchableOpacity>
  );
}

// Task Overview button: tinted circle icon with a red count badge (hidden at 0).
function TaskCountCard({ icon, fg, label, value, loading, onPress }) {
  return <BadgeIconTile compact icon={icon} color={fg} label={label} count={loading ? null : value} loading={loading} onPress={onPress} badgeRed size={rs(32)} />;
}

// "Xh YYm" worked today: check-in → check-out (or now), minus phone-logged break minutes.
function workDuration(inTime, outTime, now, breakMin = 0) {
  const mins = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  if (!inTime || Number.isNaN(mins(inTime))) return '--:--';
  const end = outTime ? mins(outTime) : now.getHours() * 60 + now.getMinutes();
  const d = Math.max(0, end - mins(inTime) - breakMin);
  return `${Math.floor(d / 60)}h ${String(d % 60).padStart(2, '0')}m`;
}

// Big Check In / Check Out tile. The active one (the next punch) is the teal gradient.
function PunchTile({ active, icon: Icon, title, sub, busy, disabled, onPress, accent }) {
  const ring = rs(34);
  const body = (
    <>
      <View style={{
        width: ring, height: ring, borderRadius: ring / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? 'rgba(255,255,255,0.12)' : accent ? `${accent}22` : C.bg,
        borderWidth: rs(2), borderColor: active ? 'rgba(255,255,255,0.25)' : '#FFFFFF',
        ...(active ? {} : shadow(0.08, 6, 2, 2)),
      }}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Icon size={rs(16)} color={active ? '#FFFFFF' : accent || C.green} strokeWidth={2} />}
      </View>
      <Text style={{ fontSize: rf(12), fontWeight: '800', color: active ? '#FFFFFF' : C.text, marginTop: rs(3) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
      <Text style={{ fontSize: rf(9.5), color: active ? 'rgba(255,255,255,0.85)' : C.muted, marginTop: 0 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{sub}</Text>
    </>
  );
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={title}
                      style={{ flex: 1, borderRadius: rs(14), overflow: 'hidden', opacity: active && disabled && !busy ? 0.6 : 1 }}>
      {active ? (
        <LinearGradient colors={[C.green, '#024A57']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={{ alignItems: 'center', paddingVertical: rs(6), paddingHorizontal: rs(4) }}>{body}</LinearGradient>
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: rs(6), paddingHorizontal: rs(4) }}>{body}</View>
      )}
    </TouchableOpacity>
  );
}

function PunchStat({ icon: Icon, label, value, divider }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: rs(2), ...(divider ? { borderLeftWidth: 1, borderLeftColor: C.border } : {}) }}>
      <Icon size={rs(14)} color={C.green} />
      <Text style={{ fontSize: rf(9.5), color: C.muted, marginTop: rs(1) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
      <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: C.text, marginTop: 0 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</Text>
    </View>
  );
}

function Avatar({ uri, name, size, dark }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={box} />;
  return (
    <View className="items-center justify-center" style={{ ...box, backgroundColor: dark ? '#111111' : C.deep, ...shadow(0.2, 6, 3, 3) }}>
      <Text className="font-extrabold" style={{ fontSize: rf(22), color: '#FFFFFF' }}>{initialsFromName(name)}</Text>
    </View>
  );
}

function StatTile({ fg, icon, value, label }) {
  return <BadgeIconTile compact icon={icon} color={fg} label={label} count={value} size={rs(32)} />;
}

