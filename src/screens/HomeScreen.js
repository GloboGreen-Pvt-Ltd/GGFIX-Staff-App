import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, ScrollView, Image, ActivityIndicator, Modal, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import {
  Bell, MapPin, Camera, Sunrise, Sunset, ChevronDown, ChevronLeft, ChevronRight,
  Calendar, CalendarDays, Briefcase, Clock, ShieldAlert, ShieldCheck, ScanLine,
  FingerprintPattern, LogOut, CircleCheck, ChartColumn, ClipboardList, FileText, Truck,
  ArrowRight,
} from 'lucide-react-native';
import { rf, rlh, rs } from '../utils/responsive';
import { selectSession, mergeTechnicianProfile, selectShopLocation } from '../store/authSlice';
import { getCategoriesForSession, getRoleDisplayLabel, resolveRoleKey } from '../config/categories';
import { employeeIdFromSession } from '../utils/employeeId';
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
import { listTechnicianWorkStatuses } from '../api/master';
import { effectiveLateMinutes } from './DailyAttendanceScreen';
import { loadUnreadNotificationCount } from './NotificationsScreen';
import { readCurrentLocation, haversineMeters, GEOFENCE_RADIUS_METERS } from '../utils/geo';
import { useLogout } from '../auth/LogoutContext';
import { notify } from '../components/confirm';

// Home-screen palette (GGFIX green + mint). Scoped to this screen so the
// app-wide theme tokens other screens rely on stay untouched.
const C = {
  // Brand palette
  green: '#09AD2A',
  red: '#F84141',
  yellow: '#F3BF23',
  ink: '#1E1E1E',
  bg: '#F8F8F8',
  surface: '#F3F3F3',
  // Light tints of the palette colours (mixed with white) for tiles/pills
  greenTint: '#E6F7EA',
  greenSoft: '#F3FBF4',
  redTint: '#FEECEC',
  redSoft: '#FFF6F6',
  yellowTint: '#FDF6E0',
  yellowSoft: '#FEFAF0',
  // Roles used throughout the screen
  deep: '#09AD2A',
  primary: '#09AD2A',
  bright: '#09AD2A',
  mint: '#E6F7EA',
  card: '#FFFFFF',
  border: '#ECECEC',
  text: '#1E1E1E',
  muted: '#6E6E6E',
  faint: '#A3A3A3',
};

const MAX_CONTENT_WIDTH = 720;
// Quick Access tiles, styled like the Partner app's dashboard tools: a pastel
// circle behind a solid MaterialCommunityIcons glyph. Keyed by the category
// `key` from config/categories.js; same pastel set as the Partner app.
const QUICK_TILE_INK = '#111827';
const QUICK_TILES = {
  daily_attendance: { icon: 'account-clock', bg: '#E3F6EC' },
  daily_shift:      { icon: 'calendar-clock', bg: '#E4EEFF' },
  monthly_summary:  { icon: 'calendar-month', bg: '#FFF0D2' },
  leave_request:    { icon: 'calendar-remove', bg: '#FDE3E3', fg: '#DC2626' },
  apply_permission: { icon: 'shield-check', bg: '#F2E1FA' },
  leave_report:     { icon: 'clipboard-text', bg: '#FFE8D6' },
  assign_task:      { icon: 'clipboard-account', bg: '#E4EEFF' },
  task_report:      { icon: 'clipboard-check', bg: '#E3F6EC' },
  assign_pickup:    { icon: 'truck', bg: '#FFF0D2' },
  pickup_report:    { icon: 'truck-delivery', bg: '#EFE2FF' },
  salary_report:    { icon: 'currency-inr', bg: '#FFF0D2' },
  default:          { icon: 'view-grid', bg: '#E3F6EC' },
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

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function format12hClock(date) {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return { h: String(h).padStart(2, '0'), m, s, ap };
}

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

// Self-contained ticking "CURRENT TIME" block. Owns its own 1s interval, so the
// per-second updates re-render only this small component, not all of HomeScreen.
function LiveClock({ statusColor, statusText }) {
  const now = useClock();
  const time = format12hClock(now);
  return (
    <View style={{ marginTop: rs(10) }}>
      <View className="flex-row items-center">
        <Clock size={rs(15)} color={C.text} strokeWidth={2} />
        <Text style={{ fontSize: rf(13), color: C.text, marginLeft: rs(6) }}>Current Time</Text>
      </View>
      <Text style={{ fontSize: rf(30), fontWeight: '800', color: C.text, marginTop: rs(2), fontVariant: ['tabular-nums'] }}
            numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {time.h}:{time.m}:{time.s}
        <Text style={{ fontSize: rf(16), color: C.muted, fontWeight: '700' }}> {time.ap}</Text>
      </Text>
      <View className="flex-row items-center" style={{ marginTop: rs(2) }}>
        <View style={{ width: rs(9), height: rs(9), borderRadius: rs(5), backgroundColor: statusColor, marginRight: rs(7) }} />
        <Text style={{ fontSize: rf(13), fontWeight: '600', color: C.text }}>{statusText}</Text>
      </View>
    </View>
  );
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

function formatLongDate(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// "06-Feb-2026" — matches the design.
function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
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
    loadUnreadNotificationCount().then((n) => { if (active) setUnreadNotifs(n); });
    return () => { active = false; };
  }, []));

  // Keep today's punch + this-month stats fresh: refetch on focus (so a row
  // lingering across midnight can't strand the button on "Check Out") and after
  // a successful check-in (so the "This Month" tiles reflect the new day).
  const reloadAttendance = useCallback(async () => {
    const techId = session?.technicianId;
    try {
      const today = await getTodayAttendance();
      setTodayAttendance(today || null);
    } catch { /* keep last known */ }
    if (techId) {
      try {
        const att = await getMonthlyAttendance(techId, month, year);
        if (att) setMonthly(att);
      } catch { /* keep last known */ }
    }
  }, [session?.technicianId, month, year]);

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

      try {
        const page = await listMyTickets({ page: 0, size: 20 });
        if (active) setTickets(Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []));
      } catch (e) {
        setErrors((s) => ({ ...s, tickets: e?.message }));
      } finally {
        if (active) setTicketsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [dispatch, loadFromTechnicianId]);

  // Button toggles based on today's row:
  //   no row / no check-in time  → "Check In"  (POST /me/attendance/check-in)
  //   check-in done, no check-out → "Check Out" (POST /me/attendance/check-out)
  //   both recorded               → button disabled with "Done for today"
  const hasCheckedIn = !!todayAttendance?.checkInTime;
  const hasCheckedOut = !!todayAttendance?.checkOutTime;
  const buttonMode = hasCheckedOut ? 'done' : hasCheckedIn ? 'out' : 'in';

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
        // After a successful check-out the shift is over — sign out back to the
        // login screen (per the attendance lifecycle).
        notify('Checked out', 'Have a good day!', { preset: 'done', haptic: 'success' });
        onLogout?.();
        return;
      }
      notify('Checked in', 'You’re on duty.', { preset: 'done', haptic: 'success' });
      reloadAttendance();
    } catch (e) {
      const code = e?.payload?.code;
      if (code === 'OUT_OF_RADIUS') {
        notify('Too far from the shop', e?.message || 'Move within range to continue.', { preset: 'error', haptic: 'error' });
      } else if (code === 'EARLY_CHECKOUT_BLOCKED') {
        notify('Too early to check out', e?.message || 'You can check out only after your duty end time.', { preset: 'error', haptic: 'error' });
      } else if (code === 'LOCATION_REQUIRED') {
        notify('Location needed', e?.message || 'Enable location and try again.', { preset: 'error', haptic: 'error' });
      } else {
        setErrors((s) => ({ ...s, checkin: e?.message }));
        notify('Could not update attendance', e?.message || 'Please try again.', { preset: 'error' });
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
  const permission = monthly?.permissionCount ?? 0;
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
  const buttonColors = buttonMode === 'out' ? [C.red, '#E73A3A'] : buttonMode === 'done' ? ['#A3A3A3', '#7A7A7A'] : [C.green, '#089E26'];
  const ButtonIcon = buttonMode === 'out' ? LogOut : buttonMode === 'done' ? CircleCheck : FingerprintPattern;
  // Only block CHECK-IN when out of range. Never disable check-out: a checked-in
  // employee who walks out (or gets an inaccurate fix) must still be able to
  // check out — and checkout is what logs them out. The server already enforces
  // the radius, so this client gate is purely a convenience for check-in.
  const geoBlocksCheckIn = buttonMode === 'in' && geo.inRange === false;
  const buttonDisabled = checkInBusy || buttonMode === 'done' || geoBlocksCheckIn;
  const greeting = greetingFor(now);
  const statusText = buttonMode === 'in' ? 'Not Checked In' : buttonMode === 'out' ? 'On Duty' : 'Completed';
  const statusColor = buttonMode === 'in' ? C.yellow : C.green;

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
  const subLine = session?.email || `${greeting}, ${String(displayName || '').trim().split(/\s+/)[0]}`;

  const ticketLine = (t) => `${ticketRef(t)} · ${t.deviceDisplayName || 'Device'}${t.repairServicesSummary ? ` - ${t.repairServicesSummary}` : ''}`;
  const leave = recentLeave ? leaveSummary(recentLeave) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.card }} edges={['top']}>
      <ScrollView
        style={{ backgroundColor: C.bg }}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: rs(12) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentW, paddingHorizontal: pad }}>
          {/* 1. Header: avatar, name + location, ID pill, (scan), bell */}
          <View className="flex-row items-center" style={{ paddingTop: rs(8) }}>
            <View>
              <Avatar uri={session?.photoUrl} name={displayName} size={rs(50)} />
              <View style={{
                position: 'absolute', right: -rs(1), bottom: 0,
                width: rs(13), height: rs(13), borderRadius: rs(7), borderWidth: 2, borderColor: '#FFFFFF',
                backgroundColor: hasCheckedIn && !hasCheckedOut ? C.green : C.faint,
              }} />
            </View>
            <View style={{ flex: 1, marginLeft: rs(10), marginRight: rs(8) }}>
              <Text style={{ fontSize: rf(18.5), fontWeight: '800', color: C.text }} numberOfLines={1}>{displayName}</Text>
              <View className="flex-row items-center" style={{ marginTop: rs(2) }}>
                <MapPin size={rs(14)} color={C.green} fill={C.green} stroke="#FFFFFF" strokeWidth={1.6} />
                <Text style={{ fontSize: rf(13), color: C.text, marginLeft: rs(4), flexShrink: 1 }} numberOfLines={1}>Cuddalore, Tamil Nadu</Text>
              </View>
            </View>
            <View style={{ backgroundColor: C.greenTint, borderRadius: 999, paddingHorizontal: rs(10), paddingVertical: rs(4) }}>
              <Text style={{ fontSize: rf(11.5), fontWeight: '700', color: C.text }} numberOfLines={1}>{employeeIdFromSession(session)}</Text>
            </View>
            {showScan ? <HeaderButton icon={ScanLine} onPress={() => navigation.navigate('ScanTicketQr')} /> : null}
            <HeaderButton icon={Bell} dot={unreadNotifs > 0} onPress={() => navigation.navigate('Notifications')} />
          </View>

          {/* 2. Date bar (duty roster on the right) */}
          <View className="flex-row items-center" style={{
            marginTop: rs(10), height: rs(44), borderRadius: rs(14), borderWidth: 1, borderColor: C.border,
            backgroundColor: C.card, paddingHorizontal: rs(12), ...shadow(0.04, 6, 2, 1),
          }}>
            <Calendar size={rs(19)} color={C.text} />
            <Text style={{ flex: 1, fontSize: rf(14), fontWeight: '600', color: C.text, marginLeft: rs(10) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {formatShortDay(now)}
            </Text>
            <View className="flex-row items-center" style={{ backgroundColor: C.bg, borderRadius: 999, paddingHorizontal: rs(8), paddingVertical: rs(4) }}>
              <Sunrise size={rs(14)} color={C.green} />
              <Text style={{ fontSize: rf(11.5), fontWeight: '700', color: C.text, marginLeft: rs(3) }}>{dutyCheckInLabel}</Text>
              <Text style={{ fontSize: rf(11.5), color: C.faint, marginHorizontal: rs(4) }}>–</Text>
              <Sunset size={rs(14)} color={C.red} />
              <Text style={{ fontSize: rf(11.5), fontWeight: '700', color: C.text, marginLeft: rs(3) }}>{dutyCheckOutLabel}</Text>
            </View>
          </View>

          {/* 3. Attendance banner */}
          <View style={{ marginTop: rs(10), borderRadius: rs(20), overflow: 'hidden', borderWidth: 1, borderColor: '#DDF1E1', ...shadow(0.06, 12, 4, 3) }}>
            <LinearGradient colors={['#F7FCF8', '#EDF9F0', '#DDF3E2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: rs(12) }}>
              <View pointerEvents="none" style={{ position: 'absolute', top: -rs(50), right: -rs(40), width: rs(190), height: rs(190), borderRadius: rs(95), backgroundColor: 'rgba(9,173,42,0.10)' }} />

              <View className="flex-row">
                {/* Left: brand + live clock */}
                <View style={{ flex: 1, marginRight: rs(8) }}>
                  <View className="flex-row items-center">
                    <Image source={require('../../assets/logo.png')} style={{ width: rs(32), height: rs(32) }} resizeMode="contain" />
                    <View style={{ marginLeft: rs(8), flex: 1 }}>
                      <Text style={{ fontSize: rf(15), fontWeight: '900', color: C.text }}>GGFIX</Text>
                      <Text style={{ fontSize: rf(11.5), color: C.muted }} numberOfLines={1}>{subLine}</Text>
                    </View>
                  </View>
                  <LiveClock statusColor={statusColor} statusText={statusText} />
                </View>

                {/* Right: Check In button, range */}
                <View style={{ width: '46%', alignItems: 'stretch', justifyContent: 'center' }}>
                  <TouchableOpacity
                    onPress={handleCheckInPress}
                    disabled={buttonDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={buttonLabel}
                    activeOpacity={0.85}
                    style={{
                      borderRadius: rs(16), opacity: buttonDisabled ? 0.6 : 1,
                      backgroundColor: buttonColors[1],
                      shadowColor: buttonColors[1], shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5,
                    }}
                  >
                    <LinearGradient
                      colors={buttonColors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={{ height: rs(54), borderRadius: rs(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(8) }}
                    >
                      {checkInBusy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <ButtonIcon size={rs(22)} color="#FFFFFF" strokeWidth={2} />
                          <Text style={{ fontSize: rf(16), fontWeight: '800', color: '#FFFFFF', marginHorizontal: rs(6), flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{buttonLabel}</Text>
                          <ArrowRight size={rs(18)} color="#FFFFFF" strokeWidth={2.4} />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                  {geo.inRange === true ? (
                    <View className="flex-row items-center justify-center" style={{ marginTop: rs(6) }}>
                      <ShieldCheck size={rs(13)} color={C.green} />
                      <Text style={{ fontSize: rf(11), fontWeight: '700', color: C.text, marginLeft: rs(4) }} numberOfLines={1}>
                        In range{geo.distance != null ? ` · ${geo.distance}m` : ''}
                      </Text>
                    </View>
                  ) : geo.inRange === false ? (
                    <View className="flex-row items-center justify-center" style={{ marginTop: rs(6) }}>
                      <ShieldAlert size={rs(13)} color={C.red} />
                      <Text style={{ fontSize: rf(11), fontWeight: '700', color: C.red, marginLeft: rs(4) }} numberOfLines={2}>
                        Out of range{geo.distance != null ? ` · ${geo.distance}m` : ''}{geoBlocksCheckIn ? ' — check-in blocked' : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Today's actual punches (tap → Daily Attendance history) */}
              <View className="flex-row" style={{ marginTop: rs(10), gap: rs(8) }}>
                <TodayTile fg={C.green} tint={C.greenTint} icon={Sunrise} label="Today Check In"
                           value={checkInLabel} valueColor={hasCheckedIn ? C.green : C.faint}
                           onPress={() => navigation.navigate('DailyAttendance')} />
                <TodayTile fg={C.red} tint={C.redTint} icon={Sunset} label="Today Check Out"
                           value={checkOutLabel} valueColor={hasCheckedOut ? C.red : C.faint}
                           onPress={() => navigation.navigate('DailyAttendance')} />
              </View>
            </LinearGradient>
          </View>

          {/* 4. Quick Access — every category for this role, Partner-app tile grid */}
          <SectionTitle title="Quick Access" />
          <View style={{
            backgroundColor: C.card, borderRadius: rs(16), borderWidth: 1, borderColor: '#E8ECEF',
            paddingTop: rs(12), paddingBottom: rs(4), paddingHorizontal: quickPad, ...shadow(0.05, 10, 3, 1),
          }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {categories.map((c, i) => (
                <QuickTile
                  key={c.key}
                  item={c}
                  width={quickW}
                  style={{ marginRight: i % quickCols === quickCols - 1 ? 0 : quickGap, marginBottom: rs(8) }}
                  onPress={() => navigation.navigate(c.route)}
                />
              ))}
            </View>
          </View>

          {/* 11–13. This Month */}
          <View style={{
            marginTop: rs(12), backgroundColor: C.card, borderRadius: rs(20),
            borderWidth: 1, borderColor: C.border, padding: rs(12), ...shadow(0.05, 10, 3, 2),
          }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-start flex-1" style={{ marginRight: rs(8) }}>
                <ChartColumn size={rs(22)} color={C.bright} strokeWidth={2.5} />
                <View style={{ marginLeft: rs(8), flexShrink: 1 }}>
                  <Text className="font-extrabold" style={{ fontSize: rf(17), color: C.text }} numberOfLines={1}>This Month</Text>
                  <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 1 }}>{present} Present</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setMonthPickerOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Select month, ${monthLabel}`}
                activeOpacity={0.85}
                style={{
                  flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: rs(12), backgroundColor: C.card,
                  paddingHorizontal: rs(12), paddingVertical: rs(6), flexShrink: 0,
                }}
              >
                <Calendar size={rs(15)} color={C.text} />
                <Text className="font-bold" style={{ fontSize: rf(13), color: C.text, marginLeft: rs(6) }}>{monthLabel}</Text>
                <ChevronDown size={rs(15)} color={C.text} style={{ marginLeft: rs(4) }} />
              </TouchableOpacity>
            </View>

            <View className="flex-row" style={{ marginTop: rs(8), gap: statGap }}>
              <StatTile inline={statInline} bg={C.greenTint} fg={C.green} icon={Calendar} value={String(present).padStart(2, '0')} label="Present" />
              <StatTile inline={statInline} bg={C.yellowTint} fg={C.yellow} icon={Briefcase} value={String(leaveDays).padStart(2, '0')} label="Leave" />
              <StatTile inline={statInline} bg={C.surface} fg={C.ink} icon={ClipboardList} value={String(permission).padStart(2, '0')} label="Permission" />
              <StatTile inline={statInline} bg={C.redTint} fg={C.red} icon={Clock} value={String(lateHrs)} label="Late Hrs" />
            </View>
          </View>

          {/* 14–16. Recent rows */}
          <View style={{ marginTop: rs(8), gap: rs(6) }}>
            <InfoRow
              icon={FileText} bg={C.redTint} fg={C.red}
              title="Recent Pending"
              subtitle={ticketsLoading ? 'Loading…' : pendingTicket ? ticketLine(pendingTicket) : 'No pending tickets'}
              note={!ticketsLoading && pendingTicket ? `${pendingLabel} · ${formatShortDate(pendingTicket.updatedAt || pendingTicket.createdAt)}` : null}
              noteColor={C.red}
              onPress={!ticketsLoading && pendingTicket ? () => navigation.navigate('TechnicianTicketDetail', { ticketId: pendingTicket.id }) : undefined}
            />
            <InfoRow
              icon={Truck} bg={C.greenTint} fg={C.green}
              title="Assign & In Service Process"
              subtitle={ticketsLoading ? 'Loading…' : inServiceTicket ? ticketLine(inServiceTicket) : 'No tickets in service'}
              note={!ticketsLoading && inServiceTicket ? `${inServiceLabel} · ${formatShortDate(inServiceTicket.updatedAt || inServiceTicket.createdAt)}` : null}
              noteColor={C.text}
              onPress={!ticketsLoading && inServiceTicket ? () => navigation.navigate('TechnicianTicketDetail', { ticketId: inServiceTicket.id }) : undefined}
            />
            <InfoRow
              icon={CalendarDays} bg={C.yellowTint} fg={C.yellow}
              title="Recent Leave Request"
              subtitle={leave ? `${leave.startDateLabel}${recentLeave.appliedDaysLabel ? ` · ${recentLeave.appliedDaysLabel}` : ''}` : 'No leave requests yet'}
              note={leave && recentLeave.reason ? recentLeave.reason : null}
              noteColor={C.muted}
              right={leave ? (
                <View style={{ backgroundColor: leave.statusBg, borderRadius: 999, paddingHorizontal: rs(10), paddingVertical: rs(3), marginLeft: rs(8) }}>
                  <Text className="font-bold" style={{ fontSize: rf(11), color: leave.statusColor }}>{leave.statusText}</Text>
                </View>
              ) : null}
            />
          </View>
        </View>
      </ScrollView>

      <MonthPickerModal
        visible={monthPickerOpen}
        month={month}
        year={year}
        onClose={() => setMonthPickerOpen(false)}
        onSelect={selectMonth}
      />
    </SafeAreaView>
  );
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Month + year picker for the "This Month" card. The year stepper is local to
// the sheet (browsing only); nothing changes until a month is tapped.
function MonthPickerModal({ visible, month, year, onClose, onSelect }) {
  const [viewYear, setViewYear] = useState(year);
  useEffect(() => { if (visible) setViewYear(year); }, [visible, year]);
  const today = new Date();
  const nowMonth = today.getMonth() + 1;
  const nowYear = today.getFullYear();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: rs(24) }} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: C.card, borderRadius: rs(20), padding: rs(16), alignSelf: 'center', width: '100%', maxWidth: 420 }}
        >
          <View className="flex-row items-center justify-between" style={{ marginBottom: rs(12) }}>
            <Pressable onPress={() => setViewYear((y) => y - 1)} hitSlop={8} accessibilityLabel="Previous year"
                       style={{ width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={rs(18)} color={C.ink} strokeWidth={2.6} />
            </Pressable>
            <Text className="font-extrabold" style={{ fontSize: rf(17), color: C.text }}>{viewYear}</Text>
            <Pressable onPress={() => setViewYear((y) => y + 1)} hitSlop={8} accessibilityLabel="Next year"
                       style={{ width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={rs(18)} color={C.ink} strokeWidth={2.6} />
            </Pressable>
          </View>
          <View className="flex-row flex-wrap" style={{ marginHorizontal: -rs(4) }}>
            {MONTHS_SHORT.map((label, i) => {
              const m = i + 1;
              const selected = m === month && viewYear === year;
              const isNow = m === nowMonth && viewYear === nowYear;
              return (
                <View key={label} style={{ width: '33.333%', padding: rs(4) }}>
                  <TouchableOpacity
                    onPress={() => onSelect(m, viewYear)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    activeOpacity={0.85}
                    style={{
                      height: rs(44), borderRadius: rs(12), alignItems: 'center', justifyContent: 'center',
                      backgroundColor: selected ? C.green : C.bg,
                      borderWidth: 1, borderColor: selected ? C.green : isNow ? C.green : C.border,
                    }}
                  >
                    <Text className="font-bold" style={{ fontSize: rf(14), color: selected ? '#FFFFFF' : C.text }}>{label}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// "Mon, 6 Oct 2026" — compact date for the header bar.
function formatShortDay(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]}, ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

// Bold section heading (customer-app style, no "See all" — there's no list screen to open).
function SectionTitle({ title, onViewAll }) {
  return (
    <View className="flex-row items-center" style={{ marginTop: rs(14), marginBottom: rs(8) }}>
      <Text style={{ flex: 1, fontSize: rf(17), fontWeight: '800', color: C.text }}>{title}</Text>
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
function QuickTile({ item, width, style, onPress }) {
  const t = QUICK_TILES[item.key] || QUICK_TILES.default;
  const box = rs(44);
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label.replace(/\n/g, ' ')}
      activeOpacity={0.75}
      style={[{ width, alignItems: 'center', paddingVertical: rs(4) }, style]}
    >
      <View style={{ width: box, height: box, borderRadius: box / 2, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name={t.icon} size={rs(23)} color={t.fg || QUICK_TILE_INK} />
      </View>
      <Text
        style={{ fontSize: rf(12), lineHeight: rlh(16), minHeight: rlh(32), fontWeight: '600', color: C.text, textAlign: 'center', marginTop: rs(6), letterSpacing: -0.1 }}
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

function leaveSummary(leave) {
  const startDateLabel = leave.startDate
    ? new Date(leave.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const status = leave.status || 'PROCESSING';
  const statusColor = status === 'APPROVED' || status === 'REJECTED' ? '#FFFFFF' : C.ink;
  const statusBg = status === 'APPROVED' ? C.green : status === 'REJECTED' ? C.red : C.yellow;
  const statusText = status.charAt(0) + status.slice(1).toLowerCase();
  return { startDateLabel, statusColor, statusBg, statusText };
}

function HeaderButton({ icon: Icon, dot, onPress }) {
  const size = rs(44);
  return (
    <TouchableOpacity hitSlop={8} onPress={onPress} activeOpacity={0.8}
               style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.card, marginLeft: rs(8), borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', ...shadow(0.06, 6, 2, 2) }}>
      <Icon size={rs(20)} color={C.text} />
      {dot ? (
        <View style={{
          position: 'absolute', top: rs(8), right: rs(9), width: rs(9), height: rs(9),
          borderRadius: rs(5), backgroundColor: C.red, borderWidth: 1.5, borderColor: '#FFFFFF',
        }} />
      ) : null}
    </TouchableOpacity>
  );
}

function StatusPill({ icon: Icon, bg, iconColor, color, text }) {
  return (
    <View className="flex-row items-center" style={{ marginTop: rs(6), backgroundColor: bg, borderRadius: 999, paddingHorizontal: rs(12), paddingVertical: rs(5) }}>
      <Icon size={rs(15)} color={iconColor} />
      <Text className="font-bold" style={{ fontSize: rf(12.5), color, marginLeft: rs(6) }}>{text}</Text>
    </View>
  );
}

function TodayTile({ fg, tint, icon: Icon, label, value, valueColor, onPress }) {
  const circle = rs(34);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: rs(14), paddingHorizontal: rs(8), paddingVertical: rs(8), ...shadow(0.05, 6, 2, 1) }}>
      <View style={{ width: circle, height: circle, borderRadius: circle / 2, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={rs(17)} color={fg} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, marginLeft: rs(8) }}>
        <Text style={{ fontSize: rf(12), fontWeight: '700', color: C.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
        <Text style={{ fontSize: rf(14), fontWeight: '700', color: valueColor, marginTop: 2, letterSpacing: 0.5 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{value}</Text>
      </View>
      <ChevronRight size={rs(16)} color={C.text} />
    </TouchableOpacity>
  );
}

function Avatar({ uri, name, size }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={box} />;
  return (
    <View className="items-center justify-center" style={{ ...box, backgroundColor: C.deep, ...shadow(0.2, 6, 3, 3) }}>
      <Text className="font-extrabold" style={{ fontSize: rf(22), color: '#FFFFFF' }}>{initialsFromName(name)}</Text>
    </View>
  );
}

function StatTile({ inline, bg, fg, icon: Icon, value, label }) {
  const circle = rs(inline ? 30 : 24);
  if (!inline) {
    // Narrow tiles: icon beside the value, label underneath — keeps the tile short.
    return (
      <View className="flex-1" style={{ backgroundColor: bg, borderRadius: rs(14), paddingHorizontal: rs(7), paddingVertical: rs(7) }}>
        <View className="flex-row items-center">
          <View className="items-center justify-center" style={{ width: circle, height: circle, borderRadius: circle / 2, backgroundColor: '#FFFFFF', ...shadow(0.06, 3, 1, 1) }}>
            <Icon size={rs(13)} color={fg} />
          </View>
          <Text className="font-extrabold" style={{ flex: 1, fontSize: rf(16), color: C.text, marginLeft: rs(5) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
        </View>
        <Text style={{ fontSize: rf(10.5), color: C.muted, marginTop: rs(3) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{label}</Text>
      </View>
    );
  }
  return (
    <View className={inline ? 'flex-1 flex-row items-center' : 'flex-1'} style={{ backgroundColor: bg, borderRadius: rs(14), paddingHorizontal: rs(7), paddingVertical: rs(7) }}>
      <View className="items-center justify-center" style={{ width: circle, height: circle, borderRadius: circle / 2, backgroundColor: '#FFFFFF', ...shadow(0.06, 3, 1, 1) }}>
        <Icon size={rs(15)} color={fg} />
      </View>
      <View className={inline ? 'flex-1' : undefined} style={inline ? { marginLeft: rs(6) } : { marginTop: rs(6) }}>
        <Text className="font-extrabold" style={{ fontSize: rf(16), color: C.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
        <Text style={{ fontSize: rf(10.5), color: C.muted }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
      </View>
    </View>
  );
}

function InfoRow({ icon: Icon, bg, fg, title, subtitle, note, noteColor, right, onPress }) {
  const Container = onPress ? Pressable : View;
  const tile = rs(34);
  return (
    <Container onPress={onPress} className="flex-row items-center" style={{
      backgroundColor: C.card, borderRadius: rs(18), borderWidth: 1, borderColor: C.border,
      paddingHorizontal: rs(10), paddingVertical: rs(6), minHeight: rs(50), ...shadow(0.04, 8, 2, 1),
    }}>
      <View className="items-center justify-center" style={{ width: tile, height: tile, borderRadius: rs(12), backgroundColor: bg }}>
        <Icon size={rs(18)} color={fg} strokeWidth={2} />
      </View>
      <View className="flex-1" style={{ marginLeft: rs(12) }}>
        <Text className="font-bold" style={{ fontSize: rf(14), color: C.text }} numberOfLines={1}>{title}</Text>
        <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }} numberOfLines={1}>{subtitle}</Text>
        {note ? (
          <Text className="font-semibold" style={{ fontSize: rf(11), color: noteColor, marginTop: 2 }} numberOfLines={1}>{note}</Text>
        ) : null}
      </View>
      {right}
      <ChevronRight size={rs(18)} color={C.faint} style={{ marginLeft: rs(6) }} />
    </Container>
  );
}
