import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import {
  Bell, MapPin, Camera, Sunrise, Sunset, ChevronDown, ChevronRight,
  Calendar, Briefcase, Clock, ShieldAlert, ShieldCheck, ScanLine,
} from 'lucide-react-native';
import { selectSession, mergeTechnicianProfile, selectShopLocation } from '../store/authSlice';
import { getCategoriesForSession, getRoleDisplayLabel } from '../config/categories';
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

// Per-tile colour pairs for the Categories grid. Keyed by the category `key`
// from config/categories.js. Each pair is { bg: light tint, fg: icon colour }
// so the icons feel grouped by domain (time, leave, tasks, payroll).
const CATEGORY_TINTS = {
  daily_attendance: { bg: '#DBEAFE', fg: '#1D4ED8' },
  daily_shift:      { bg: '#E0E7FF', fg: '#4338CA' },
  monthly_summary:  { bg: '#CFFAFE', fg: '#0E7490' },
  leave_request:    { bg: '#FFE4E6', fg: '#BE123C' },
  apply_permission: { bg: '#E0F2FE', fg: '#0284C7' },
  leave_report:     { bg: '#FFEDD5', fg: '#C2410C' },
  assign_task:      { bg: '#EDE9FE', fg: '#6D28D9' },
  task_report:      { bg: '#DCFCE7', fg: '#004C40' },
  assign_pickup:    { bg: '#EDE9FE', fg: '#6D28D9' },
  pickup_report:    { bg: '#DCFCE7', fg: '#004C40' },
  salary_report:    { bg: '#FEF3C7', fg: '#B45309' },
  default:          { bg: '#E0E7FF', fg: '#00008B' },
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
function LiveClock({ accentColor, statusText }) {
  const now = useClock();
  const time = format12hClock(now);
  return (
    <View className="flex-1">
      <Text className="text-[10px] text-text-muted font-bold tracking-wider">CURRENT TIME</Text>
      <Text className="text-[22px] font-extrabold text-text tracking-wider mt-1">
        {time.h}:{time.m}:{time.s} <Text className="text-[14px] text-text-muted">{time.ap}</Text>
      </Text>
      <View className="flex-row items-center mt-1">
        <View className="h-1.5 w-1.5 rounded-full mr-1.5" style={{ backgroundColor: accentColor }} />
        <Text className="text-[11px] font-bold" style={{ color: accentColor }}>{statusText}</Text>
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

// "06-Feb-2026 01:21 PM"
function formatShortDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${formatShortDate(iso)} ${String(h).padStart(2, '0')}:${m} ${ap}`;
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
  const categories = useMemo(() => getCategoriesForSession(session), [session]);
  const roleLabel = getRoleDisplayLabel(session);
  const displayName = session?.fullName || session?.email || roleLabel;

  const month = now.getMonth() + 1;
  const year = now.getFullYear();

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
    try {
      const [att, lvs] = await Promise.all([
        getMonthlyAttendance(techId, month, year).catch((e) => { setErrors((s) => ({ ...s, monthly: e?.message })); return null; }),
        getMyLeaves(techId).catch((e) => { setErrors((s) => ({ ...s, leaves: e?.message })); return []; }),
      ]);
      if (att) setMonthly(att);
      if (Array.isArray(lvs)) setLeaves(lvs);
    } catch (_) {}
  }, [month, year]);

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
  const monthLabel = shortMonthYear(now);

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
  const buttonBg = buttonMode === 'out' ? '#DC2626' : buttonMode === 'done' ? '#6B7280' : '#00008B';
  // Only block CHECK-IN when out of range. Never disable check-out: a checked-in
  // employee who walks out (or gets an inaccurate fix) must still be able to
  // check out — and checkout is what logs them out. The server already enforces
  // the radius, so this client gate is purely a convenience for check-in.
  const geoBlocksCheckIn = buttonMode === 'in' && geo.inRange === false;
  // State-coloured accent on the live attendance card so the eye
  // immediately sees whether the technician is checked in / out / done.
  const heroAccent = buttonMode === 'out' ? '#FEE2E2' : buttonMode === 'done' ? '#DCFCE7' : '#E0E7FF';
  const heroAccentStrong = buttonMode === 'out' ? '#DC2626' : buttonMode === 'done' ? '#004C40' : '#00008B';
  const greeting = greetingFor(now);
  const statusText = buttonMode === 'in' ? 'Not Checked In' : buttonMode === 'out' ? 'On Duty' : 'Completed';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
        {/* Header — greeting + avatar with status dot */}
        <View className="px-4 pt-3 pb-3 flex-row items-center">
          <View className="relative">
            <Avatar uri={session?.photoUrl} name={displayName} />
            <View className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background"
                  style={{ backgroundColor: hasCheckedIn && !hasCheckedOut ? '#004C40' : '#9CA3AF' }} />
          </View>
          <View className="flex-1 ml-3">
            <Text className="text-[11px] text-text-muted">{greeting},</Text>
            <Text className="text-[16px] font-extrabold text-text" numberOfLines={1}>{displayName}</Text>
            <View className="flex-row items-center mt-1">
              <View className="rounded-full bg-primary/10 px-2 py-[2px]">
                <Text className="text-[10px] text-primary font-bold tracking-wide">ID: {employeeIdFromSession(session)}</Text>
              </View>
            </View>
          </View>
          <Pressable hitSlop={10} onPress={() => navigation.navigate('ScanTicketQr')}
                     className="h-10 w-10 rounded-full items-center justify-center bg-card border border-border mr-2"
                     style={{ shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
            <ScanLine size={18} color="#0F172A" />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => navigation.navigate('Notifications')}
                     className="h-10 w-10 rounded-full items-center justify-center bg-card border border-border"
                     style={{ shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
            <Bell size={18} color="#0F172A" />
            {unreadNotifs > 0 ? (
              <View className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-danger" />
            ) : null}
          </Pressable>
        </View>

        {/* Duty roster — two cards side by side with cleaner icons & spacing */}
        <View className="mx-4 flex-row" style={{ gap: 10 }}>
          <DutyPill icon={Sunrise} iconColor="#F59E0B" iconBg="#FEF3C7" labelColor="#92400E" valueColor="#004C40"
                    label="DUTY CHECK IN" value={dutyCheckInLabel} />
          <DutyPill icon={Sunset} iconColor="#7C3AED" iconBg="#EDE9FE" labelColor="#5B21B6" valueColor="#DC2626"
                    label="DUTY CHECK OUT" value={dutyCheckOutLabel} />
        </View>

        {/* Date + Location */}
        <View className="px-4 mt-3 flex-row items-center justify-between">
          <Text className="text-[12px] text-text font-semibold" numberOfLines={1}>{formatLongDate(now)}</Text>
          <View className="flex-row items-center bg-primary/10 rounded-full px-3 py-1">
            <MapPin size={12} color="#00008B" />
            <Text className="text-[11px] text-primary font-bold ml-1">Cuddalore, Tamil Nadu</Text>
          </View>
        </View>

        {/* Live attendance hero card */}
        <View className="mx-4 mt-3 bg-card rounded-2xl border border-border overflow-hidden"
              style={{ shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
          <View className="h-1" style={{ backgroundColor: heroAccentStrong }} />
          <View className="p-4">
            <View className="flex-row items-start justify-between">
              <LiveClock accentColor={heroAccentStrong} statusText={statusText} />
              <View className="items-end">
                <View className="flex-row items-center bg-background rounded-full px-2 py-1 border border-border">
                  <Camera size={12} color="#004C40" />
                  <Text className="text-[10px] text-text font-bold ml-1">Face Recognition</Text>
                </View>
                {geo.inRange === true ? (
                  <View className="mt-1.5 flex-row items-center rounded-md px-2 py-0.5" style={{ backgroundColor: '#DCFCE7' }}>
                    <ShieldCheck size={11} color="#004C40" />
                    <Text className="text-[10px] font-bold ml-1" style={{ color: '#004C40' }}>In range</Text>
                  </View>
                ) : geo.inRange === false ? (
                  <View className="mt-1.5 flex-row items-center rounded-md px-2 py-0.5" style={{ backgroundColor: '#FEE2E2' }}>
                    <ShieldAlert size={11} color="#B91C1C" />
                    <Text className="text-[10px] font-bold ml-1" style={{ color: '#B91C1C' }}>Out of range</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Today's actual times — same stat-tile rhythm as "This Month" */}
            <View className="flex-row mt-3.5" style={{ gap: 10 }}>
              <TodayTile bg="#DCFCE7" iconBg="#004C40" icon={Sunrise} label="TODAY CHECK IN"
                         value={checkInLabel} valueColor={hasCheckedIn ? '#004C40' : '#9CA3AF'} />
              <TodayTile bg="#FEE2E2" iconBg="#DC2626" icon={Sunset} label="TODAY CHECK OUT"
                         value={checkOutLabel} valueColor={hasCheckedOut ? '#DC2626' : '#9CA3AF'} />
            </View>

            <Pressable
              onPress={handleCheckInPress}
              disabled={checkInBusy || buttonMode === 'done' || geoBlocksCheckIn}
              className="mt-3.5 rounded-xl py-3.5 items-center flex-row justify-center"
              style={{
                opacity: checkInBusy || buttonMode === 'done' || geoBlocksCheckIn ? 0.6 : 1,
                backgroundColor: buttonBg,
                shadowColor: buttonBg,
                shadowOpacity: 0.3,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              }}
            >
              {checkInBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-extrabold text-[14px] tracking-wider">{buttonLabel}</Text>
              )}
            </Pressable>
            {geo.inRange === true ? (
              <View className="flex-row items-center justify-center mt-2">
                <ShieldCheck size={11} color="#004C40" />
                <Text className="text-[10px] font-bold ml-1" style={{ color: '#004C40' }}>
                  Within shop range{geo.distance != null ? ` · ${geo.distance}m` : ''}
                </Text>
              </View>
            ) : geo.inRange === false ? (
              <View className="flex-row items-center justify-center mt-2">
                <ShieldAlert size={11} color="#DC2626" />
                <Text className="text-[10px] text-danger font-bold ml-1">
                  Out of shop range{geo.distance != null ? ` · ${geo.distance}m` : ''}{geoBlocksCheckIn ? ' — check-in blocked' : ''}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Categories — colour-coded by domain so the eye can index by colour */}
        <View className="px-4 mt-5">
          <View className="flex-row items-center mb-3">
            <View className="h-4 w-1 rounded-full bg-primary mr-2" />
            <Text className="text-[15px] font-extrabold text-text">Categories</Text>
          </View>
          <View className="flex-row flex-wrap -mx-1">
            {categories.map((c) => {
              const Icon = c.icon;
              const tint = CATEGORY_TINTS[c.key] || CATEGORY_TINTS.default;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => navigation.navigate(c.route)}
                  className="w-1/4 px-1 mb-3.5 items-center"
                >
                  <View className="h-14 w-14 rounded-2xl items-center justify-center"
                        style={{
                          backgroundColor: tint.bg,
                          shadowColor: tint.fg,
                          shadowOpacity: 0.2,
                          shadowRadius: 5,
                          shadowOffset: { width: 0, height: 2 },
                          elevation: 2,
                        }}>
                    <Icon size={22} color={tint.fg} strokeWidth={2} />
                  </View>
                  <Text className="text-[11px] font-bold text-text mt-2 text-center leading-[14px]" numberOfLines={2}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* This Month */}
        <View className="mx-4 mt-1 bg-card rounded-2xl border border-border px-3 py-4"
              style={{ shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
          <View className="flex-row items-center justify-between px-1">
            <View>
              <Text className="text-[14px] font-extrabold text-text">This Month</Text>
              <Text className="text-[11px] text-text-muted mt-0.5">{present} Present</Text>
            </View>
            <Pressable className="flex-row items-center bg-background border border-border rounded-lg px-2.5 py-1.5">
              <Calendar size={12} color="#0F172A" />
              <Text className="text-[11px] text-text font-bold ml-1.5">{monthLabel}</Text>
              <ChevronDown size={12} color="#0F172A" style={{ marginLeft: 2 }} />
            </Pressable>
          </View>

          <View className="flex-row items-center mt-3 px-1">
            <View className="flex-1 h-2 bg-background rounded-full overflow-hidden">
              <View className="h-full bg-primary rounded-full" style={{ width: `${progressPct}%` }} />
            </View>
            <Text className="ml-2 text-[11px] font-bold text-text">{present}<Text className="text-text-muted"> / {totalDays}</Text></Text>
          </View>

          <View className="flex-row mt-3.5" style={{ marginHorizontal: -3 }}>
            <StatTile color="#EEF2FF" iconColor="#00008B" icon={Calendar} value={String(present).padStart(2, '0')} label="Present" />
            <StatTile color="#FFF7ED" iconColor="#F59E0B" icon={Briefcase} value={String(leaveDays).padStart(2, '0')} label="Leave" />
            <StatTile color="#F0FDF4" iconColor="#004C40" icon={Calendar} value={String(permission).padStart(2, '0')} label="Permission" />
            <StatTile color="#FEF2F2" iconColor="#DC2626" icon={Clock} value={String(lateHrs)} label="Late Hrs" />
          </View>
        </View>

        {/* Recent Pending */}
        <View className="px-4 mt-5">
          <SectionTitle text="Recent Pending" accent="#DC2626" />
          {ticketsLoading ? (
            <SectionLoader />
          ) : pendingTicket ? (
            <PendingCard
              ticket={pendingTicket}
              note={pendingLabel}
              onPress={() => navigation.navigate('TechnicianTicketDetail', { ticketId: pendingTicket.id })}
            />
          ) : (
            <EmptyCard text="No pending tickets" />
          )}
        </View>

        {/* Assign & In Service Process */}
        <View className="px-4 mt-4">
          <SectionTitle text="Assign & In Service Process" accent="#00008B" />
          {ticketsLoading ? (
            <SectionLoader />
          ) : inServiceTicket ? (
            <InServiceCard
              ticket={inServiceTicket}
              note={inServiceLabel}
              onPress={() => navigation.navigate('TechnicianTicketDetail', { ticketId: inServiceTicket.id })}
            />
          ) : (
            <EmptyCard text="No tickets in service" />
          )}
        </View>

        {/* Recent Leave Request */}
        <View className="px-4 mt-4">
          <SectionTitle text="Recent Leave Request" accent="#F59E0B" />
          {recentLeave ? (
            <LeaveCard leave={recentLeave} />
          ) : (
            <EmptyCard text="No leave requests yet" />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DutyPill({ icon: Icon, iconColor, iconBg, labelColor, valueColor, label, value }) {
  return (
    <View className="flex-1 flex-row items-center bg-card rounded-xl border border-border px-3 py-2.5"
          style={{ shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
      <View className="h-9 w-9 rounded-full items-center justify-center mr-2" style={{ backgroundColor: iconBg }}>
        <Icon size={16} color={iconColor} strokeWidth={2} />
      </View>
      <View className="flex-1">
        <Text className="text-[9px] font-extrabold tracking-wider" style={{ color: labelColor }}>{label}</Text>
        <Text className="text-[14px] font-extrabold mt-0.5" style={{ color: valueColor }}>{value}</Text>
      </View>
    </View>
  );
}

function TodayTile({ bg, iconBg, icon: Icon, label, value, valueColor }) {
  return (
    <View className="flex-1 rounded-xl px-3 py-2.5" style={{ backgroundColor: bg }}>
      <View className="h-7 w-7 rounded-full bg-white items-center justify-center"
            style={{ shadowColor: iconBg, shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
        <Icon size={13} color={iconBg} strokeWidth={2} />
      </View>
      <Text className="text-[9px] font-extrabold tracking-wider mt-2" style={{ color: iconBg }}>{label}</Text>
      <Text className="text-[15px] font-extrabold mt-0.5" style={{ color: valueColor }}>{value}</Text>
    </View>
  );
}

function Avatar({ uri, name }) {
  if (uri) return <Image source={{ uri }} className="h-11 w-11 rounded-full" />;
  return (
    <View className="h-11 w-11 rounded-full bg-primary items-center justify-center"
          style={{ shadowColor: '#00008B', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
      <Text className="text-white font-extrabold text-[14px]">{initialsFromName(name)}</Text>
    </View>
  );
}

function CheckCard({ icon, label, time, timeColor }) {
  return (
    <View className="flex-1 bg-card rounded-xl border border-border px-2.5 py-2 flex-row items-center"
          style={{ shadowColor: '#0F172A', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
      <View className="h-7 w-7 rounded-full bg-background items-center justify-center mr-1.5">
        {icon}
      </View>
      <View className="flex-1 items-center">
        <Text className="text-[10px] font-bold text-text tracking-wide">{label}</Text>
        <Text className="text-[13px] font-extrabold mt-0.5" style={{ color: timeColor }}>{time}</Text>
      </View>
    </View>
  );
}

function StatTile({ color, iconColor, icon: Icon, value, label }) {
  return (
    <View className="flex-1 rounded-xl px-1.5 py-2.5" style={{ backgroundColor: color, marginHorizontal: 2 }}>
      <View className="h-7 w-7 rounded-full bg-white items-center justify-center"
            style={{ shadowColor: iconColor, shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
        <Icon size={13} color={iconColor} />
      </View>
      <Text className="text-[15px] font-extrabold text-text mt-2" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      <Text className="text-[10px] text-text-muted font-semibold mt-0.5" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
    </View>
  );
}

function PendingCard({ ticket, note, onPress }) {
  return (
    <Pressable onPress={onPress} className="bg-card rounded-2xl border border-border py-4 pl-4 pr-3 flex-row items-center"
               style={{ shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
      <View className="w-1 self-stretch bg-danger rounded-full mr-4" />
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-[11px] text-text-muted font-semibold">{formatShortDate(ticket.createdAt)}</Text>
          <Text className="text-[11px] text-primary font-bold">{ticketRef(ticket)}</Text>
        </View>
        <Text className="text-[13px] text-text font-bold mt-2 leading-[18px]" numberOfLines={2}>
          {ticket.deviceDisplayName || 'Device'}
          {ticket.repairServicesSummary ? ` - ${ticket.repairServicesSummary}` : ''}
        </Text>
        <Text className="text-[11px] text-danger font-bold mt-2">{note}</Text>
        <Text className="text-[10px] text-text-muted mt-1.5">Pending On {formatShortDateTime(ticket.updatedAt || ticket.createdAt)}</Text>
      </View>
      <ChevronRight size={18} color="#9CA3AF" style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

function InServiceCard({ ticket, note, onPress }) {
  return (
    <Pressable onPress={onPress} className="bg-card rounded-2xl border border-border py-4 pl-4 pr-3 flex-row items-center"
               style={{ shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
      <View className="w-1 self-stretch bg-info rounded-full mr-4" />
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-[11px] text-text-muted font-semibold">{formatShortDate(ticket.createdAt)}</Text>
          <Text className="text-[11px] text-primary font-bold">{ticketRef(ticket)}</Text>
        </View>
        <Text className="text-[13px] text-text font-bold mt-2 leading-[18px]" numberOfLines={2}>
          {ticket.deviceDisplayName || 'Device'}
          {ticket.repairServicesSummary ? ` - ${ticket.repairServicesSummary}` : ''}
        </Text>
        <Text className="text-[11px] text-info font-bold mt-2">{note}</Text>
        <Text className="text-[10px] text-text-muted mt-1.5">In Service Process On {formatShortDateTime(ticket.updatedAt || ticket.createdAt)}</Text>
      </View>
      <ChevronRight size={18} color="#9CA3AF" style={{ marginLeft: 8 }} />
    </Pressable>
  );
}

function LeaveCard({ leave }) {
  const requestedAt = leave.requestedAt ? new Date(leave.requestedAt) : null;
  const requestedAtLabel = requestedAt
    ? `${requestedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${requestedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    : '—';
  const startDateLabel = leave.startDate
    ? new Date(leave.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const status = leave.status || 'PROCESSING';
  const statusColor = status === 'APPROVED' ? '#004C40' : status === 'REJECTED' ? '#EF4444' : '#F59E0B';
  const statusBg = status === 'APPROVED' ? 'rgba(16, 185, 129, 0.15)' : status === 'REJECTED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)';
  const statusText = status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <View className="bg-card rounded-2xl border border-border py-4 pl-4 pr-4 flex-row"
          style={{ shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
      <View className="w-1 self-stretch bg-primary rounded-full mr-4" />
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-[12px] text-text font-bold">{startDateLabel}</Text>
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: statusBg }}>
            <Text className="text-[10px] font-bold" style={{ color: statusColor }}>{statusText}</Text>
          </View>
        </View>
        <View className="flex-row justify-between mt-3">
          <ColLabel value={leave.reason || '—'} label="Leave Reason" />
          <ColLabel value={leave.appliedDaysLabel || '—'} label="Applied Days" align="center" />
          <ColLabel value={requestedAtLabel} label="Request Date & Time" align="right" />
        </View>
      </View>
    </View>
  );
}

function ColLabel({ value, label, align = 'left' }) {
  const alignClass = align === 'center' ? 'items-center' : align === 'right' ? 'items-end' : 'items-start';
  return (
    <View className={alignClass} style={{ maxWidth: '34%' }}>
      <Text className="text-[12px] font-bold text-text" numberOfLines={2}>{value}</Text>
      <Text className="text-[10px] text-text-muted mt-0.5">{label}</Text>
    </View>
  );
}

function SectionTitle({ text, accent }) {
  return (
    <View className="flex-row items-center mb-2.5">
      <View className="w-1 h-4 rounded-full mr-2" style={{ backgroundColor: accent || '#00008B' }} />
      <Text className="text-[15px] font-extrabold text-text">{text}</Text>
    </View>
  );
}

function SectionLoader() {
  return (
    <View className="bg-card rounded-xl border border-border p-5 items-center">
      <ActivityIndicator color="#00008B" />
    </View>
  );
}

function EmptyCard({ text }) {
  return (
    <View className="bg-card rounded-2xl border border-border py-5 px-4 items-center"
          style={{ shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
      <Text className="text-[12px] text-text-muted font-medium">{text}</Text>
    </View>
  );
}
