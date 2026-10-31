import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { markNotificationsSeen } from './NotificationsScreen';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Calendar,
  RefreshCw,
  CircleAlert,
  Check,
  ChartColumn,
  Smartphone,
  Laptop,
  User,
  Clock,
  Hourglass,
  Inbox,
  WifiOff,
} from 'lucide-react-native';
import { listMyTickets, listTicketEvents } from '../api/tickets';
import { rf, rs } from '../utils/responsive';
import { notify } from '../components/confirm';
import { ticketRef } from '../utils/ticketRef';
import { resolveDeviceImageSource } from '../utils/images';
import { listModelsForBrand } from '../api/master';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FILTERS = ['All', 'Completed', 'In Process', 'Pending'];

// Ticket statuses → display buckets used by the cards. Mirrors the owner-side
// WorkingRecord screen so a technician sees the same "Recent Pending" /
// "In Process" split they'd see on a manager's screen.
function bucketize(status) {
  const s = (status || '').toUpperCase();
  if (s === 'DELIVERED' || s === 'CANCELLED') return 'COMPLETED';
  if (s === 'CREATED' || s === 'IN_DIAGNOSIS' || s === 'QUOTED') return 'PENDING';
  return 'IN_PROCESS';
}

// Human label for each macro ticket status. The card needs to reflect what
// the *current* ticket actually is — not a fixed sentence per bucket —
// otherwise a QUOTED row and a CREATED row both read "Spare part has been
// ordered" which is wrong for either of them.
const STATUS_LABEL = {
  CREATED: 'Booking Created',
  IN_DIAGNOSIS: 'In Diagnosis',
  QUOTED: 'Quotation Sent. Awaiting Approval',
  APPROVED: 'Customer Approved. Work Pending',
  IN_REPAIR: 'Repair Work in Progress',
  READY: 'Ready for Delivery',
  DELIVERED: 'Delivered to Customer',
  CANCELLED: 'Work Cancelled',
};

function statusLabel(status) {
  const s = (status || '').toUpperCase();
  return STATUS_LABEL[s] || (status ? status.replace(/_/g, ' ') : '—');
}

// Canonical event order. Matches SHOP_BOOKING_STATUS_OPTIONS on the
// repair-shop-mobile side — events flow strictly in this order, so the
// highest-index emitted event is the booking's true current phase even when
// two events share the same createdAt timestamp (which happens routinely:
// the backend emits TECHNICIAN_ACCEPTED_SERVICE and TECHNICIAN_WORK_STARTED
// at the same instant when the tech taps Accept).
const CANONICAL_EVENT_ORDER = [
  'BOOKING_CREATED_BY_SHOP',
  'SERVICE_ACCEPTED',
  'ASSIGNED_TO_TECHNICIAN',
  'TECHNICIAN_ASSIGNED',
  'AWAITING_TECHNICIAN_ACCEPTANCE',
  'REASSIGNED_TO_TECHNICIAN',
  'TECHNICIAN_ACCEPTED_SERVICE',
  'TECHNICIAN_WORK_STARTED',
  'TECHNICIAN_UPLOADED_DEVICE_IMAGES',
  'TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED',
  'RE_ESTIMATED_CONFIRMED',
  'WAITING_FOR_CUSTOMER_APPROVAL',
  'CUSTOMER_APPROVED',
  'CUSTOMER_REJECTED',
  'IN_REPAIR',
  // A re-estimate raised during the repair (see REPAIR_CYCLE_STEP below).
  'TECHNICIAN_REESTIMATE_REQUESTED',
  'RE_ESTIMATE_APPROVED',
  'RE_ESTIMATE_REJECTED',
  'REPAIR_WORK_RESUMED',
  'PARTS_REQUIRED',
  'QUALITY_CHECK_COMPLETED',
  'REPAIR_COMPLETED',
  'READY',
  'DELIVERED',
  'CANCELLED',
];
const EVENT_INDEX = Object.fromEntries(CANONICAL_EVENT_ORDER.map((k, i) => [k, i]));
// Repair Work in Progress and a re-estimate raised during it share one rank,
// so the newest of them is the current phase; equal times go to the later
// step. A re-estimate awaiting approval joins only when it comes after
// IN_REPAIR (an earlier one is the pre-repair quote and keeps its own rank).
const AWAITING_KEYS = new Set(['RE_ESTIMATED_CONFIRMED', 'WAITING_FOR_CUSTOMER_APPROVAL']);
const REPAIR_CYCLE_STEP = {
  IN_REPAIR: 0,
  TECHNICIAN_REESTIMATE_REQUESTED: 1,
  RE_ESTIMATED_CONFIRMED: 2,
  WAITING_FOR_CUSTOMER_APPROVAL: 2,
  RE_ESTIMATE_APPROVED: 3,
  RE_ESTIMATE_REJECTED: 3,
  REPAIR_WORK_RESUMED: 4,
};

// Event-level labels (the same fine-grained phases the History screen renders).
// The technician's last controllable phase is REPAIR_COMPLETED — anything after
// it (READY, DELIVERED) is a shop-side action and should not show up as the
// technician's "current" step. So we cap at REPAIR_COMPLETED for display.
const EVENT_LABEL = {
  BOOKING_CREATED_BY_SHOP: 'Booking Created by Shop',
  SERVICE_ACCEPTED: 'Service Accepted',
  ASSIGNED_TO_TECHNICIAN: 'Technician Assigned',
  TECHNICIAN_ASSIGNED: 'Technician Assigned',
  AWAITING_TECHNICIAN_ACCEPTANCE: 'Awaiting Technician Acceptance',
  REASSIGNED_TO_TECHNICIAN: 'Re-Assigned to Technician',
  TECHNICIAN_ACCEPTED_SERVICE: 'Technician Accepted Service',
  TECHNICIAN_WORK_STARTED: 'Technician Work Started',
  TECHNICIAN_UPLOADED_DEVICE_IMAGES: 'Technician Uploaded Device Images',
  TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED: 'Technician Issue Verified & Updated',
  TECHNICIAN_REESTIMATE_REQUESTED: 'Technician Re-Estimate Requested',
  RE_ESTIMATED_CONFIRMED: 'Service Re-Estimated – Awaiting Customer Approval',
  WAITING_FOR_CUSTOMER_APPROVAL: 'Service Re-Estimated – Awaiting Customer Approval',
  RE_ESTIMATE_APPROVED: 'Re-Estimate Approved by Customer',
  RE_ESTIMATE_REJECTED: 'Re-Estimate Rejected by Customer',
  REPAIR_WORK_RESUMED: 'Repair Work in Progress (Resumed)',
  CUSTOMER_APPROVED: 'Customer Approved',
  CUSTOMER_REJECTED: 'Customer Rejected',
  IN_REPAIR: 'Repair Work in Progress',
  PARTS_REQUIRED: 'Spare Parts Waiting',
  QUALITY_CHECK_COMPLETED: 'Quality Check Completed',
  REPAIR_COMPLETED: 'Repair Completed',
  READY: 'Repair Completed',
  DELIVERED: 'Repair Completed',
  CANCELLED: 'Work Cancelled',
};

function technicianEventLabel(eventKey) {
  if (!eventKey) return null;
  const k = String(eventKey).toUpperCase();
  return EVENT_LABEL[k] || k.replace(/_/g, ' ');
}

// Pick the booking's current phase from its event list. We rank by canonical
// phase order (with createdAt as a tiebreaker for events outside the canon),
// not by timestamp alone — when the backend emits two phases at the same
// instant (e.g. accept + work-started on the same tap), the highest canonical
// step is the true "current" step. Sorting purely by createdAt was picking
// the wrong one and leaving cards stuck on "Technician Accepted Service"
// when the booking had already moved to "Technician Work Started".
function pickLatestEventKey(events) {
  if (!Array.isArray(events) || events.length === 0) return null;
  let bestKey = null;
  let bestIndex = -1;
  let bestTime = -Infinity;
  let bestStep = 0;
  const repairStartedAt = events
    .filter((e) => (e?.status || '').toUpperCase() === 'IN_REPAIR')
    .reduce((min, e) => Math.min(min, new Date(e.createdAt || 0).getTime() || Infinity), Infinity);
  for (const e of events) {
    const k = (e?.status || '').toUpperCase();
    if (!k) continue;
    const t = e.createdAt ? new Date(e.createdAt).getTime() : 0;
    const inCycle = REPAIR_CYCLE_STEP[k] != null
      && (!AWAITING_KEYS.has(k) || t > repairStartedAt);
    const idx = inCycle ? EVENT_INDEX.IN_REPAIR : EVENT_INDEX[k];
    const step = inCycle ? REPAIR_CYCLE_STEP[k] : 0;
    if (idx == null) {
      // Unknown phase — only adopt it if we have nothing canonical yet, and
      // break ties by recency so a fresh unknown-status event still wins
      // over a stale one.
      if (bestIndex === -1 && t > bestTime) {
        bestKey = k;
        bestTime = t;
      }
      continue;
    }
    if (idx > bestIndex || (idx === bestIndex && (t > bestTime || (t === bestTime && step > bestStep)))) {
      bestKey = k;
      bestIndex = idx;
      bestTime = t;
      bestStep = step;
    }
  }
  return bestKey;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(instant) {
  if (!instant) return '—';
  return new Date(instant).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Visual tokens
// ---------------------------------------------------------------------------
const C = {
  green: '#09AD2A',
  red: '#F84141',
  yellow: '#F3BF23',
  blue: '#2F6FED',
  ink: '#1E1E1E',
  bg: '#F8F8F8',
  white: '#FFFFFF',
  muted: '#7A7A7A',
  faint: '#A3A3A3',
  line: '#EFEFEF',
};

// fg = icon / accent colour, text = readable label colour on the soft bg,
// bg = soft tint used for pills, icon discs and wave fills.
const TONES = {
  red: { fg: C.red, text: '#E23434', bg: '#FEECEC', soft: '#FFF6F6' },
  yellow: { fg: C.yellow, text: '#C08B00', bg: '#FFF4D6', soft: '#FFFBEF' },
  green: { fg: C.green, text: '#078A22', bg: '#E3F6E7', soft: '#F3FBF5' },
  blue: { fg: C.blue, text: C.blue, bg: '#E8F0FE', soft: '#F4F8FF' },
  ink: { fg: C.ink, text: C.ink, bg: '#ECECEC', soft: '#F6F6F6' },
};

const PREVIEW_ROWS = 2;
const PREVIEW_COMPLETED_ROWS = 3;

// Right-hand status pill for a ticket, derived from its real macro status.
// QUOTED = quotation sent and awaiting the customer's approval, which the
// mockup calls "Pending Approval"; every other PENDING status is "Pending".
function statusPill(t) {
  const s = (t?.status || '').toUpperCase();
  const bk = bucketize(s);
  if (s === 'QUOTED') return { label: 'Pending Approval', tone: 'yellow', Icon: Hourglass };
  if (bk === 'PENDING') return { label: 'Pending', tone: 'red', Icon: CircleAlert };
  if (bk === 'IN_PROCESS') return { label: 'In Process', tone: 'yellow', Icon: RefreshCw };
  if (s === 'CANCELLED') return { label: 'Cancelled', tone: 'ink', Icon: CircleAlert };
  return { label: 'Completed', tone: 'green', Icon: Check };
}

// Tickets carry no device-category field, so infer phone vs laptop from the
// device / brand / model text. Anything not recognisably a laptop is a phone.
const LAPTOP_RE = /(laptop|notebook|macbook|chromebook|thinkpad|ideapad|vivobook|zenbook|xps|inspiron|latitude|vostro|pavilion|elitebook|probook|envy|spectre|omen|aspire|swift|predator|nitro|rog|tuf|legion|yoga|surface\s*(laptop|book)|galaxy\s*book|matebook|gram)/i;
function isLaptop(t) {
  const hay = [t?.deviceDisplayName, t?.brandName, t?.modelName].filter(Boolean).join(' ');
  return LAPTOP_RE.test(hay);
}

function deviceName(t) {
  if (t?.deviceDisplayName) return t.deviceDisplayName;
  const bm = [t?.brandName, t?.modelName].filter(Boolean).join(' ');
  return bm || 'Device';
}

function issueText(t) {
  return t?.issueDescription || t?.repairServicesSummary || t?.complianceNote || 'Issue not specified';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function filterByChip(list, chip) {
  return list.filter((b) => {
    const bk = bucketize(b.status);
    if (chip === 'All') return true;
    if (chip === 'Completed') return bk === 'COMPLETED';
    if (chip === 'In Process') return bk === 'IN_PROCESS';
    if (chip === 'Pending') return bk === 'PENDING';
    return false;
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function MonthlySummaryScreen({ navigation, route }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  // Viewing tasks auto-reads their notifications.
  useEffect(() => { if (list.length) markNotificationsSeen({ tickets: list }); }, [list]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState(() => (FILTERS.includes(route?.params?.filter) ? route.params.filter : 'All'));
  const [expanded, setExpanded] = useState({ pending: false, process: false, previous: false });
  // Latest event-status key per ticket id, fetched after the ticket list so
  // each row can show the actual current phase (e.g. "Repair Completed",
  // "Quality Check Completed") instead of the coarse macro status. Treated as
  // best-effort: row falls back to macro-status label if events aren't ready.
  const [eventStatusById, setEventStatusById] = useState({});

  const scrollRef = useRef(null);
  const sectionY = useRef({});
  // Section to scroll to once the content has laid out (set by the incoming
  // route filter or by tapping a stat card).
  const pendingScroll = useRef(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const page = await listMyTickets({ page: 0, size: 100 });
      const items = Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []);
      setList(items);
      setError(false);
      // Booking-timeline events are fetched separately, only for the tickets
      // actually rendered (see the displayedIds effect) — not for all 100.
    } catch {
      setError(true);
      if (isRefresh) {
        notify('Could not refresh', 'Check your connection and pull down to try again.');
      } else {
        setList([]);
        setEventStatusById({});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Honour the filter HomeScreen passes ('Pending' / 'Completed'), including
  // when this screen is already mounted and re-navigated with new params.
  const routeFilter = route?.params?.filter;
  useEffect(() => {
    if (!FILTERS.includes(routeFilter)) return;
    setFilter(routeFilter);
    pendingScroll.current = routeFilter === 'Pending' ? 'pending'
      : routeFilter === 'In Process' ? 'process' : 'previous';
  }, [routeFilter]);

  const scrollToSection = useCallback((key) => {
    const y = sectionY.current[key];
    if (y == null || !scrollRef.current) return false;
    scrollRef.current.scrollTo({ y: Math.max(0, y - rs(8)), animated: true });
    return true;
  }, []);

  const onSectionLayout = (key) => (e) => {
    sectionY.current[key] = e.nativeEvent.layout.y;
    if (!loading && pendingScroll.current === key) {
      // Defer one frame so the ScrollView has its final content size.
      requestAnimationFrame(() => {
        if (scrollToSection(key)) pendingScroll.current = null;
      });
    }
  };

  useEffect(() => {
    if (loading || !pendingScroll.current) return;
    const key = pendingScroll.current;
    const id = setTimeout(() => { if (scrollToSection(key)) pendingScroll.current = null; }, 60);
    return () => clearTimeout(id);
  }, [loading, scrollToSection]);

  // Scope to the picked month so the stats only reflect tickets touched then.
  const mine = useMemo(() => {
    return list.filter((b) => {
      const t = b.updatedAt || b.createdAt;
      if (!t) return true;
      const d = new Date(t);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [list, year, month]);

  const counts = useMemo(() => {
    let pending = 0, inProcess = 0, completed = 0;
    mine.forEach((b) => {
      const bk = bucketize(b.status);
      if (bk === 'PENDING') pending += 1;
      else if (bk === 'COMPLETED') completed += 1;
      else inProcess += 1;
    });
    return { inProcess, pending, completed, total: mine.length };
  }, [mine]);

  const sortedDesc = useMemo(() => {
    return [...mine].sort((a, b) => {
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });
  }, [mine]);

  const pendingAll = useMemo(() => sortedDesc.filter((b) => bucketize(b.status) === 'PENDING'), [sortedDesc]);
  const processAll = useMemo(() => sortedDesc.filter((b) => bucketize(b.status) === 'IN_PROCESS'), [sortedDesc]);
  const previousAll = useMemo(() => filterByChip(sortedDesc, filter), [sortedDesc, filter]);

  const pendingShown = expanded.pending ? pendingAll : pendingAll.slice(0, PREVIEW_ROWS);
  const processShown = expanded.process ? processAll : processAll.slice(0, PREVIEW_ROWS);
  const previousShown = expanded.previous ? previousAll : previousAll.slice(0, PREVIEW_COMPLETED_ROWS);

  // IDs of the tickets whose rows actually render an event label, capped.
  // Joined into a string key so the events effect below only re-runs when the
  // visible set really changes (not on every render).
  const displayedKey = useMemo(() => {
    const ids = [];
    const pushId = (id) => { if (id && !ids.includes(id)) ids.push(id); };
    pendingShown.forEach((b) => pushId(b?.id));
    processShown.forEach((b) => pushId(b?.id));
    previousShown.slice(0, 20).forEach((b) => pushId(b?.id));
    return ids.slice(0, 30).join('|');
  }, [pendingShown, processShown, previousShown]);

  // Fetch booking-timeline events only for the displayed tickets, and only
  // when that set changes; ids already resolved are skipped.
  useEffect(() => {
    const displayedIds = displayedKey ? displayedKey.split('|') : [];
    if (displayedIds.length === 0) return undefined;
    let active = true;
    (async () => {
      const updates = {};
      await Promise.all(displayedIds.map(async (id) => {
        try {
          const events = await listTicketEvents(id);
          const key = pickLatestEventKey(events);
          if (key) updates[id] = key;
        } catch { /* leave fallback to macro status */ }
      }));
      if (active && Object.keys(updates).length) {
        setEventStatusById((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { active = false; };
    // Re-fetch after a pull-to-refresh too, so phases stay current.
  }, [displayedKey, list]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
    setExpanded({ pending: false, process: false, previous: false });
  };

  const openTicket = (t) => {
    navigation.navigate('TechnicianTicketDetail', { ticketId: t.id });
  };

  const openHistory = (t) => {
    navigation.navigate('TechnicianBookingTimeline', { ticketId: t.id });
  };

  const toggle = (key) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  const onStatPress = (key) => {
    if (key === 'process') {
      scrollToSection('process');
    } else if (key === 'pending') {
      scrollToSection('pending');
    } else {
      setFilter(key === 'completed' ? 'Completed' : 'All');
      setExpanded((p) => ({ ...p, previous: true }));
      scrollToSection('previous');
    }
  };

  const phaseFor = (t) => technicianEventLabel(eventStatusById[t.id]) || statusLabel(t.status);
  const showInitialSpinner = loading && list.length === 0;
  const showError = error && list.length === 0 && !loading;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={rs(22)} color={C.ink} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Task Report</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />}
      >
        {/* This Month */}
        <View style={[styles.card, styles.monthCard]}>
          <View style={styles.monthArt} pointerEvents="none">
            <CalendarLeafArt />
          </View>
          <Text style={styles.monthTitle}>This Month</Text>
          <Text style={styles.monthSub} numberOfLines={2}>View your task summary for this month</Text>
          <View style={styles.monthPill}>
            <TouchableOpacity
              onPress={() => stepMonth(-1)}
              style={styles.monthArrow}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Previous month"
            >
              <ChevronLeft size={rs(18)} color={C.green} strokeWidth={2.6} />
            </TouchableOpacity>
            <View style={styles.monthCenter}>
              <Calendar size={rs(16)} color={C.green} strokeWidth={2.2} />
              <Text style={styles.monthPillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {MONTHS[month - 1]} {year}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => stepMonth(1)}
              style={styles.monthArrow}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Next month"
            >
              <ChevronRight size={rs(18)} color={C.green} strokeWidth={2.6} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stat cards */}
        <View style={styles.statRow}>
          <StatCard value={pad2(counts.inProcess)} label="In Process" hint="Active" tone="yellow" Icon={RefreshCw} onPress={() => onStatPress('process')} />
          <StatCard value={pad2(counts.pending)} label="Pending" hint="Waiting" tone="red" Icon={CircleAlert} onPress={() => onStatPress('pending')} />
          <StatCard value={pad2(counts.completed)} label="Completed" hint="Finished" tone="green" Icon={Check} onPress={() => onStatPress('completed')} />
          <StatCard value={pad2(counts.total)} label="Total" hint="Overall" tone="ink" Icon={ChartColumn} onPress={() => onStatPress('total')} />
        </View>

        {showInitialSpinner && (
          <View style={styles.stateBox}>
            <ActivityIndicator size="small" color={C.green} />
            <Text style={styles.stateText}>Loading your tasks…</Text>
          </View>
        )}

        {showError && (
          <View style={[styles.card, styles.stateBox]}>
            <View style={[styles.stateIcon, { backgroundColor: TONES.red.bg }]}>
              <WifiOff size={rs(20)} color={C.red} />
            </View>
            <Text style={styles.stateTitle}>Couldn't load tasks</Text>
            <Text style={styles.stateText}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.85}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!showInitialSpinner && !showError && (
          <>
            {/* Recent Pending */}
            <View onLayout={onSectionLayout('pending')}>
              <SectionCard
                title="Recent Pending"
                accent={C.green}
                canExpand={pendingAll.length > PREVIEW_ROWS}
                expanded={expanded.pending}
                total={pendingAll.length}
                onToggle={() => toggle('pending')}
              >
                {pendingShown.length === 0 ? (
                  <EmptyRow text="No pending tasks this month." />
                ) : pendingShown.map((t) => (
                  <TaskRow
                    key={t.id}
                    ticket={t}
                    variant="pending"
                    phase={phaseFor(t)}
                    onPress={() => openTicket(t)}
                    onHistory={() => openHistory(t)}
                  />
                ))}
              </SectionCard>
            </View>

            {/* In Process */}
            <View onLayout={onSectionLayout('process')}>
              <SectionCard
                title="In Process"
                accent={C.green}
                canExpand={processAll.length > PREVIEW_ROWS}
                expanded={expanded.process}
                total={processAll.length}
                onToggle={() => toggle('process')}
              >
                {processShown.length === 0 ? (
                  <EmptyRow text="No tasks in process this month." />
                ) : processShown.map((t) => (
                  <TaskRow
                    key={t.id}
                    ticket={t}
                    variant="process"
                    phase={phaseFor(t)}
                    onPress={() => openTicket(t)}
                    onHistory={() => openHistory(t)}
                  />
                ))}
              </SectionCard>
            </View>

            {/* Previous Completed */}
            <View onLayout={onSectionLayout('previous')}>
              <SectionCard
                title="Previous Completed"
                accent={C.green}
                canExpand={previousAll.length > PREVIEW_COMPLETED_ROWS}
                expanded={expanded.previous}
                total={previousAll.length}
                onToggle={() => toggle('previous')}
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                  style={styles.chipScroll}
                >
                  {FILTERS.map((f) => {
                    const active = filter === f;
                    return (
                      <TouchableOpacity
                        key={f}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setFilter(f)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {previousShown.length === 0 ? (
                  <EmptyRow text={filter === 'All' ? 'No tasks this month.' : `No ${filter.toLowerCase()} tasks this month.`} />
                ) : previousShown.map((t) => (
                  <CompletedRow key={t.id} ticket={t} onPress={() => openTicket(t)} />
                ))}
              </SectionCard>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// Decorative calendar + leaf illustration with soft bubbles (pure SVG).
function CalendarLeafArt() {
  return (
    <Svg width={rs(132)} height={rs(104)} viewBox="0 0 132 104">
      {/* bubbles */}
      <Circle cx="14" cy="70" r="11" fill="#E3F6E7" />
      <Circle cx="30" cy="30" r="5" fill="#E3F6E7" />
      <Circle cx="120" cy="14" r="8" fill="#EAF8EC" />
      <Circle cx="124" cy="92" r="7" fill="#EAF8EC" />
      <Circle cx="44" cy="96" r="14" fill="#F1FAF2" />
      {/* calendar shadow */}
      <Rect x="40" y="22" width="62" height="60" rx="14" fill="#C9EED0" transform="rotate(-8 71 52)" />
      <G transform="rotate(-8 71 50)">
        {/* body */}
        <Rect x="38" y="18" width="62" height="60" rx="14" fill="#FFFFFF" />
        {/* green top band */}
        <Path d="M38 32 a14 14 0 0 1 14 -14 h34 a14 14 0 0 1 14 14 v4 h-62 z" fill="#2BC24A" />
        {/* binder rings */}
        <Rect x="53" y="10" width="7" height="16" rx="3.5" fill="#078A22" />
        <Rect x="78" y="10" width="7" height="16" rx="3.5" fill="#078A22" />
        {/* date dots */}
        <Circle cx="53" cy="48" r="4" fill="#3FD25E" />
        <Circle cx="69" cy="48" r="4" fill="#3FD25E" />
        <Circle cx="85" cy="48" r="4" fill="#3FD25E" />
        <Circle cx="53" cy="63" r="4" fill="#3FD25E" />
        <Circle cx="69" cy="63" r="4" fill="#3FD25E" />
        <Circle cx="85" cy="63" r="4" fill="#9BE6AA" />
      </G>
      {/* leaf */}
      <Path d="M92 92 C 92 62, 108 44, 128 40 C 130 62, 118 84, 92 92 Z" fill="#22B640" />
      <Path d="M92 92 C 104 74, 114 60, 126 44" stroke="#0E7F25" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <Path d="M86 100 L 94 90" stroke="#0E7F25" strokeWidth="2.6" strokeLinecap="round" />
    </Svg>
  );
}

function StatCard({ value, label, hint, tone, Icon, onPress }) {
  const t = TONES[tone];
  return (
    <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      {/* wave tint */}
      <Svg style={styles.statWave} width="100%" height={rs(40)} viewBox="0 0 100 40" preserveAspectRatio="none" pointerEvents="none">
        <Path d="M0 24 C 22 10, 46 34, 70 22 C 84 15, 94 12, 100 14 L100 40 L0 40 Z" fill={t.bg} opacity={0.75} />
      </Svg>
      {/* bubbles */}
      <View pointerEvents="none" style={[styles.bubble, { width: rs(14), height: rs(14), top: rs(12), right: rs(8), backgroundColor: t.bg }]} />
      <View pointerEvents="none" style={[styles.bubble, { width: rs(8), height: rs(8), top: rs(34), right: rs(22), backgroundColor: t.bg }]} />
      <View pointerEvents="none" style={[styles.bubble, { width: rs(11), height: rs(11), top: rs(44), right: rs(6), backgroundColor: t.soft === '#F6F6F6' ? '#ECECEC' : t.bg }]} />

      <View style={[styles.statIconRing, { backgroundColor: t.bg }]}>
        <View style={[styles.statIcon, { backgroundColor: t.fg }]}>
          <Icon size={rs(12)} color={C.white} strokeWidth={2.8} />
        </View>
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{label}</Text>
      <Text style={styles.statHint} numberOfLines={1}>{hint}</Text>
    </TouchableOpacity>
  );
}

function SectionCard({ title, accent, canExpand, expanded, total, onToggle, children }) {
  return (
    <View style={[styles.card, styles.sectionCard]}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionAccent, { backgroundColor: accent }]} />
        <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
        {canExpand && (
          <TouchableOpacity style={styles.viewAll} onPress={onToggle} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={styles.viewAllText}>{expanded ? 'Show Less' : `View All${total ? ` (${total})` : ''}`}</Text>
            {expanded
              ? <ChevronUp size={rs(14)} color={C.ink} strokeWidth={2.4} />
              : <ChevronRight size={rs(14)} color={C.ink} strokeWidth={2.4} />}
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

// brandId → Promise<models[]>, shared by all rows so each brand is fetched once.
const modelsByBrand = new Map();
function modelImageFor(ticket) {
  if (!ticket?.brandId || !ticket?.modelId) return Promise.resolve(null);
  if (!modelsByBrand.has(ticket.brandId)) {
    modelsByBrand.set(ticket.brandId, listModelsForBrand(ticket.brandId).catch(() => {
      modelsByBrand.delete(ticket.brandId);
      return [];
    }));
  }
  return modelsByBrand.get(ticket.brandId).then((models) => {
    const m = (models || []).find((x) => x.id === ticket.modelId);
    return resolveDeviceImageSource({ url: m?.imageUrl, base64: m?.imageBase64 });
  });
}

// Real device photo (ticket image → catalogue model image); icon fallback.
function DeviceBadge({ ticket, tone }) {
  const t = TONES[tone];
  const DevIcon = isLaptop(ticket) ? Laptop : Smartphone;
  const direct = resolveDeviceImageSource({
    url: ticket.deviceImageUrl || ticket.modelImageUrl,
    base64: ticket.deviceImageBase64 || ticket.modelImageBase64,
  });
  const [src, setSrc] = useState(direct);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (direct) return undefined;
    let alive = true;
    modelImageFor(ticket).then((s) => { if (alive) setSrc(s); });
    return () => { alive = false; };
  }, [ticket.id, ticket.brandId, ticket.modelId]);
  const showImg = src && !failed;
  return (
    <View style={[styles.devBadge, { backgroundColor: showImg ? C.white : t.bg, overflow: 'hidden' }, showImg && { borderWidth: 1, borderColor: C.line }]}>
      {showImg
        ? <Image source={{ uri: src }} style={{ width: rs(26), height: rs(26) }} resizeMode="contain" onError={() => setFailed(true)} />
        : <DevIcon size={rs(17)} color={t.fg === C.yellow ? '#E0A800' : t.fg} strokeWidth={2.1} />}
    </View>
  );
}

function StatusPill({ ticket }) {
  const p = statusPill(ticket);
  const t = TONES[p.tone];
  const PIcon = p.Icon;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <View style={[styles.pillIcon, { backgroundColor: t.fg }]}>
        <PIcon size={rs(10)} color={C.white} strokeWidth={3} />
      </View>
      <Text style={[styles.pillText, { color: t.text }]} numberOfLines={2}>{p.label}</Text>
    </View>
  );
}

function Meta({ Icon, text, color = C.muted, lines = 1 }) {
  return (
    <View style={styles.metaLine}>
      <Icon size={rs(12)} color={C.faint} strokeWidth={2} style={styles.metaIcon} />
      <Text style={[styles.metaText, { color }]} numberOfLines={lines}>{text}</Text>
    </View>
  );
}

// Row used by "Recent Pending" and "In Process".
function TaskRow({ ticket, variant, phase, onPress, onHistory }) {
  const pill = statusPill(ticket);
  const laptop = isLaptop(ticket);
  // Icon tint: pending rows follow their status colour; in-process rows use
  // green for phones and blue for laptops (as in the reference).
  const iconTone = variant === 'pending' ? pill.tone : (laptop ? 'blue' : 'green');
  const phaseTone = variant === 'pending' ? pill.tone : 'yellow';
  const est = ticket.estimatedReadyAt || ticket.estimatedDeliveryAt;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      <DeviceBadge ticket={ticket} tone={iconTone} />

      <View style={styles.colLeft}>
        <Text style={styles.ref} numberOfLines={1}>{ticketRef(ticket)}</Text>
        <Text style={styles.device} numberOfLines={1}>{deviceName(ticket)}</Text>
        <Text style={styles.issue} numberOfLines={2}>{issueText(ticket)}</Text>
      </View>

      <View style={styles.colMid}>
        <Meta Icon={Calendar} text={formatDateTime(ticket.createdAt)} lines={2} />
        {variant === 'process' && est ? (
          <Meta Icon={Clock} text={`Est. ${formatDate(est)}`} />
        ) : ticket.customerName ? (
          <Meta Icon={User} text={ticket.customerName} />
        ) : null}
        {/* Current booking phase (from the timeline events). Tapping opens the
            ticket's history timeline. */}
        <TouchableOpacity
          onPress={onHistory}
          activeOpacity={0.75}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          style={[styles.phaseTag, { backgroundColor: TONES[phaseTone].soft === '#F6F6F6' ? '#F1F1F1' : TONES[phaseTone].bg }]}
          accessibilityLabel={`Current phase: ${phase}. Open history`}
        >
          <Clock size={rs(10)} color={TONES[phaseTone].text} strokeWidth={2.4} />
          <Text style={[styles.phaseText, { color: TONES[phaseTone].text }]} numberOfLines={1}>{phase}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.colRight}>
        <StatusPill ticket={ticket} />
      </View>
      <ChevronRight size={rs(16)} color="#9A9A9A" strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

// Row used by "Previous Completed".
function CompletedRow({ ticket, onPress }) {
  const pill = statusPill(ticket);
  const laptop = isLaptop(ticket);
  const iconTone = pill.tone === 'green' ? 'green' : pill.tone === 'ink' ? 'ink' : (laptop ? 'blue' : pill.tone);
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      <DeviceBadge ticket={ticket} tone={iconTone} />
      <View style={styles.colLeft}>
        <Text style={styles.ref} numberOfLines={1}>{ticketRef(ticket)}</Text>
        <Text style={styles.device} numberOfLines={2}>{ticket.customerName || 'Customer'}</Text>
      </View>
      <View style={styles.colMid}>
        <Text style={styles.cDevice} numberOfLines={1}>{deviceName(ticket)}</Text>
        <Text style={styles.issue} numberOfLines={1}>{issueText(ticket)}</Text>
        <Meta Icon={Calendar} text={formatDate(ticket.updatedAt || ticket.createdAt)} />
      </View>
      <View style={styles.colRight}>
        <StatusPill ticket={ticket} />
      </View>
      <ChevronRight size={rs(16)} color="#9A9A9A" strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

function EmptyRow({ text }) {
  return (
    <View style={styles.emptyRow}>
      <Inbox size={rs(18)} color={C.faint} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: rs(14), paddingTop: rs(6), paddingBottom: rs(10),
  },
  backBtn: {
    width: rs(42), height: rs(42), borderRadius: rs(21), backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center', ...shadow,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: rf(19), fontWeight: '800', color: C.ink, marginHorizontal: rs(8) },
  headerSpacer: { width: rs(42) },

  content: { paddingHorizontal: rs(14), paddingTop: rs(2), paddingBottom: rs(20) },

  card: { backgroundColor: C.white, borderRadius: rs(18), ...shadow },

  // This Month
  monthCard: { padding: rs(16), overflow: 'hidden', marginBottom: rs(12) },
  monthArt: { position: 'absolute', right: rs(2), top: rs(4) },
  monthTitle: { fontSize: rf(19), fontWeight: '800', color: C.ink },
  monthSub: { fontSize: rf(12), color: C.muted, marginTop: rs(2), maxWidth: '64%' },
  monthPill: {
    flexDirection: 'row', alignItems: 'center', marginTop: rs(12),
    borderWidth: 1, borderColor: '#BFEAC8', backgroundColor: '#F2FBF4',
    borderRadius: 999, paddingVertical: rs(6), paddingHorizontal: rs(6),
    width: '66%', minWidth: rs(196),
  },
  monthArrow: { width: rs(26), height: rs(26), alignItems: 'center', justifyContent: 'center' },
  monthCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6) },
  monthPillText: { fontSize: rf(14), fontWeight: '700', color: C.green, flexShrink: 1 },

  // Stat cards
  statRow: { flexDirection: 'row', gap: rs(7), marginBottom: rs(10) },
  statCard: {
    flex: 1, backgroundColor: C.white, borderRadius: rs(14), overflow: 'hidden',
    paddingHorizontal: rs(7), paddingTop: rs(7), paddingBottom: rs(8), ...shadow,
  },
  statWave: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bubble: { position: 'absolute', borderRadius: 999 },
  statIconRing: { width: rs(28), height: rs(28), borderRadius: rs(14), alignItems: 'center', justifyContent: 'center' },
  statIcon: { width: rs(22), height: rs(22), borderRadius: rs(11), alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: rf(18), fontWeight: '800', color: C.ink, marginTop: rs(4) },
  statLabel: { fontSize: rf(11), color: C.ink, fontWeight: '500', marginTop: 0 },
  statHint: { fontSize: rf(10), color: C.faint, marginTop: rs(1) },

  // Section cards
  sectionCard: { padding: rs(8), paddingTop: rs(10), marginBottom: rs(10) },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: rs(8), paddingLeft: rs(2) },
  sectionAccent: { width: rs(4), height: rs(20), borderRadius: 2, marginRight: rs(8) },
  sectionTitle: { flex: 1, fontSize: rf(16), fontWeight: '800', color: C.ink },
  viewAll: {
    flexDirection: 'row', alignItems: 'center', gap: rs(2),
    borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 999,
    paddingVertical: rs(5), paddingLeft: rs(12), paddingRight: rs(8), backgroundColor: C.white,
  },
  viewAllText: { fontSize: rf(11), color: C.ink, fontWeight: '500' },

  chipScroll: { marginBottom: rs(8), flexGrow: 0 },
  chipRow: { gap: rs(6), paddingRight: rs(4) },
  chip: {
    paddingHorizontal: rs(14), paddingVertical: rs(6), borderRadius: 999,
    borderWidth: 1, borderColor: '#E3E3E3', backgroundColor: C.white,
  },
  chipActive: { backgroundColor: C.green, borderColor: C.green },
  chipText: { fontSize: rf(12), color: '#4A4A4A', fontWeight: '500' },
  chipTextActive: { color: C.white, fontWeight: '700' },

  // Rows
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.white,
    borderWidth: 1, borderColor: C.line, borderRadius: rs(12),
    paddingVertical: rs(7), paddingHorizontal: rs(7), marginBottom: rs(6), gap: rs(6),
  },
  devBadge: { width: rs(32), height: rs(32), borderRadius: rs(16), alignItems: 'center', justifyContent: 'center' },
  colLeft: { flex: 1.05, minWidth: 0 },
  colMid: { flex: 1, minWidth: 0 },
  colRight: { maxWidth: rs(82), alignItems: 'flex-end' },
  ref: { fontSize: rf(13), fontWeight: '800', color: C.ink },
  device: { fontSize: rf(11.5), color: '#3A3A3A', marginTop: rs(2) },
  cDevice: { fontSize: rf(11), color: '#4A4A4A' },
  issue: { fontSize: rf(10.5), color: C.muted, marginTop: rs(2) },

  metaLine: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: rs(2) },
  metaIcon: { marginTop: 1, marginRight: rs(4) },
  metaText: { flex: 1, fontSize: rf(10), color: C.muted },

  phaseTag: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%',
    gap: rs(3), borderRadius: rs(6), paddingHorizontal: rs(5), paddingVertical: rs(2), marginTop: rs(1),
  },
  phaseText: { fontSize: rf(9), fontWeight: '600', flexShrink: 1 },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: rs(4), borderRadius: 999,
    paddingVertical: rs(3), paddingLeft: rs(5), paddingRight: rs(8),
  },
  pillIcon: { width: rs(14), height: rs(14), borderRadius: rs(7), alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: rf(9.5), fontWeight: '700', flexShrink: 1 },

  emptyRow: { alignItems: 'center', paddingVertical: rs(16), gap: rs(6) },
  emptyText: { fontSize: rf(12), color: C.muted, textAlign: 'center' },

  // States
  stateBox: { alignItems: 'center', paddingVertical: rs(24), paddingHorizontal: rs(16), marginBottom: rs(12), gap: rs(6) },
  stateIcon: { width: rs(44), height: rs(44), borderRadius: rs(22), alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: rf(14), fontWeight: '800', color: C.ink },
  stateText: { fontSize: rf(12), color: C.muted, textAlign: 'center' },
  retryBtn: { marginTop: rs(6), backgroundColor: C.green, borderRadius: 999, paddingHorizontal: rs(22), paddingVertical: rs(8) },
  retryText: { color: C.white, fontWeight: '700', fontSize: rf(12) },
});
