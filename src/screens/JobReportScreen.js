import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { markNotificationsSeen } from './NotificationsScreen';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, AppState } from 'react-native';
import { useSelector } from 'react-redux';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  ChartColumn,
  RefreshCw,
  CircleAlert,
  Check,
  UserCog,
  Inbox,
  WifiOff,
  Wrench,
  FileText,
  Users,
  X,
} from 'lucide-react-native';
import { selectTechnicianId, selectShopId } from '../store/authSlice';
import { ticketApi, shopApi } from '../api/client';
import { listMyTickets, listTicketEvents, acceptTicket } from '../api/tickets';
import { autoStartRepair } from '../utils/autoProgress';
import { JOB_STAGES, jobStage, isLiveStage, isAwaitingAccept } from '../utils/jobStage';
import { userMessage } from '../utils/userMessages';
import { rf, rs } from '../utils/responsive';
import { confirm, notify } from '../components/confirm';
import { ticketRef } from '../utils/ticketRef';
import { SearchBar } from '../components/rnr';
import { JobHeader, JobRail, JobPictureCard, KText, toneOf } from '../components/JobCardKit';
import AcceptJobDialog from '../components/AcceptJobDialog';

// One My Jobs screen (the old Job Assign Report merged in): the rail filters
// by the job's stage (utils/jobStage), read from the backend ticket + events.
const FILTERS = JOB_STAGES;
// Older links (Home tiles, Job Details) still pass the previous filter names.
const LEGACY_FILTERS = { Working: 'In Process', 'QC Pending': 'Pending', Rejected: 'Cancelled' };
const filterFromParam = (f) => (FILTERS.includes(f) ? f : LEGACY_FILTERS[f] || null);
// Event fetch fan-out per pass.
const EVENT_BATCH = 8;

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

// ---------------------------------------------------------------------------
// Visual tokens
// ---------------------------------------------------------------------------
const C = {
  green: '#035C6C',
  red: '#F32C26',
  yellow: '#FAA700',
  blue: '#0788C9',
  ink: '#111111',
  bg: '#F3F4F6',
  white: '#FFFFFF',
  muted: '#7A7A7A',
  faint: '#A3A3A3',
  line: '#EFEFEF',
};

// fg = icon / accent colour, text = readable label colour on the soft bg,
// bg = soft tint used for pills, icon discs and wave fills.
const TONES = {
  red: { fg: C.red, text: '#F32C26', bg: '#FEECEC', soft: '#FFF6F6' },
  yellow: { fg: C.yellow, text: '#FAA700', bg: '#FFF4D6', soft: '#FFFBEF' },
  green: { fg: C.green, text: '#035C6C', bg: '#E5F3F5', soft: '#F3FBF5' },
  blue: { fg: C.blue, text: C.blue, bg: '#E8F0FE', soft: '#F4F8FF' },
  ink: { fg: C.ink, text: C.ink, bg: '#E5E7EB', soft: '#F3F4F6' },
};

// One colour per stage, shared by the rail tile and the card's status tab.
const CATEGORY_COLOR = {
  All: '#035C6C',
  Assigned: '#0788C9',
  'In Process': '#FAA700',
  Pending: '#F32C26',
  Completed: '#609138',
  Reassigned: '#1C3053',
  // Grey, so it stands apart from Pending's red.
  Cancelled: '#6B7280',
};
// Tab only: a re-estimate awaiting the customer (QUOTED) reads in amber.
const PENDING_APPROVAL_COLOR = '#FAA700';

// A displayable value, or null for empty / placeholder text (N/A, null, -, …).
const PLACEHOLDER_RE = /^(n\/?a|na|null|undefined|none|nil|0|-+|—+|–+|\.+|not specified|issue not specified|not available)$/i;
function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s && !PLACEHOLDER_RE.test(s) ? s : null;
}

function deviceName(t) {
  if (t?.deviceDisplayName) return t.deviceDisplayName;
  const bm = [t?.brandName, t?.modelName].filter(Boolean).join(' ');
  return bm || 'Device';
}

// The customer's reported issue (or the booked services); null when missing.
function issueText(t) {
  return clean(t?.issueDescription) || clean(t?.repairServicesSummary);
}

function filterByChip(list, chip) {
  if (chip === 'All') return list;
  return list.filter((b) => b.stage === chip);
}

// Latest createdAt among the booking events with one of these keys, if any.
function latestEventAt(events, keys) {
  let best = null;
  (Array.isArray(events) ? events : []).forEach((e) => {
    if (!keys.includes(String(e?.status || '').toUpperCase())) return;
    if (e.createdAt && (!best || new Date(e.createdAt) > new Date(best))) best = e.createdAt;
  });
  return best;
}
// Latest (re)assignment time.
const assignedAtFrom = (events) => latestEventAt(events, ['ASSIGNED_TO_TECHNICIAN', 'REASSIGNED_TO_TECHNICIAN']);
// "Assigned / Reassigned by": a person's name only if the latest assignment
// event's actor carries one (the backend writes role codes like "SHOP").
function assignerOf(events) {
  let ev = null;
  let reassigned = false;
  (Array.isArray(events) ? events : []).forEach((e) => {
    const k = String(e?.status || '').toUpperCase();
    if (k !== 'ASSIGNED_TO_TECHNICIAN' && k !== 'REASSIGNED_TO_TECHNICIAN') return;
    if (k === 'REASSIGNED_TO_TECHNICIAN') reassigned = true;
    if (!ev || new Date(e.createdAt || 0) >= new Date(ev.createdAt || 0)) ev = e;
  });
  const actor = ev?.actor && !/^(SHOP|SYSTEM|TECHNICIAN|OWNER|ADMIN|CUSTOMER)$/i.test(ev.actor) ? ev.actor : null;
  return { reassigned, actor };
}

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function JobReportScreen({ navigation, route }) {
  const technicianId = useSelector(selectTechnicianId);
  const [list, setList] = useState([]);
  // Viewing tasks auto-reads their notifications.
  useEffect(() => { if (list.length) markNotificationsSeen({ tickets: list }); }, [list]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(() => filterFromParam(route?.params?.filter) || 'All');
  // Booking events per ticket id (GET /tickets/{id}/events) — one cache for the
  // stage, the current-phase pill and the assignment time / assigner.
  const [eventsById, setEventsById] = useState({});
  const eventsRef = useRef({});
  const eventsInFlight = useRef(new Set());
  const shopId = useSelector(selectShopId);
  const [shopName, setShopName] = useState(null);
  // Accept / Reject on an Assigned card: one at a time (ref blocks double taps).
  const actingRef = useRef(false);
  const [actingOn, setActingOn] = useState(null);
  const [acceptFor, setAcceptFor] = useState(null);

  const scrollRef = useRef(null);
  const [showSearch, setShowSearch] = useState(false);
  const [listWidth, setListWidth] = useState(0);

  // Events for these ids, EVENT_BATCH at a time; ids already being fetched are
  // skipped, and force=false only fetches ids not read yet.
  const fetchEvents = useCallback(async (ids, force) => {
    const todo = ids.filter((id) => id && !eventsInFlight.current.has(id) && (force || !(id in eventsRef.current)));
    todo.forEach((id) => eventsInFlight.current.add(id));
    for (let i = 0; i < todo.length; i += EVENT_BATCH) {
      const chunk = todo.slice(i, i + EVENT_BATCH);
      const rows = await Promise.all(chunk.map((id) => listTicketEvents(id)
        .then((r) => (Array.isArray(r) ? r : []))
        .catch(() => null)));
      const upd = {};
      chunk.forEach((id, j) => {
        eventsInFlight.current.delete(id);
        if (rows[j]) upd[id] = rows[j];
      });
      if (Object.keys(upd).length) {
        eventsRef.current = { ...eventsRef.current, ...upd };
        setEventsById(eventsRef.current);
      }
    }
  }, []);

  // silent: background poll — no spinner, and a failed poll keeps the list.
  // One request at a time: a call while one is running (focus + poll + after
  // an action) waits for it and then re-reads once, so nothing is stale.
  const loadInFlight = useRef(null);
  const loadAgain = useRef(false);
  const load = useCallback((isRefresh = false, silent = false) => {
    if (loadInFlight.current) {
      loadAgain.current = true;
      return loadInFlight.current;
    }
    const run = (async () => {
    if (silent) { /* quiet */ } else if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      // assignedToMe is scoped server-side to the signed-in technician; read
      // every page so the counts cover all of their jobs, not the first 100.
      const items = [];
      for (let p = 0; p < MAX_PAGES; p += 1) {
        const page = await listMyTickets({ page: p, size: PAGE_SIZE });
        const content = Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []);
        items.push(...content);
        if (!Array.isArray(page?.content) || page.last !== false || content.length < PAGE_SIZE) break;
      }
      const seen = new Set();
      const unique = items.filter((t) => t?.id && !seen.has(t.id) && seen.add(t.id));
      setList(unique);
      setError(false);
      // Re-read the events of every job whose section can still move (all but
      // Completed, which is read once, when shown).
      fetchEvents(unique
        .filter((t) => isLiveStage(jobStage(t, eventsRef.current[t.id])))
        .map((t) => t.id), true);
    } catch {
      if (silent) return;
      setError(true);
      if (isRefresh) {
        notify('Could not refresh', 'Check your connection and pull down to try again.', { type: 'error' });
      } else {
        setList([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    })();
    loadInFlight.current = run;
    return run.finally(() => {
      loadInFlight.current = null;
      if (loadAgain.current) {
        loadAgain.current = false;
        load(false, true);
      }
    });
  }, [fetchEvents]);

  // Re-pull on every focus, not just mount, so a job finished on Job Details
  // is under Completed as soon as the technician lands back here.
  useFocusEffect(useCallback(() => {
    load();
    // Keep newly assigned jobs coming in while the screen stays open.
    const id = setInterval(() => { if (AppState.currentState === 'active') load(false, true); }, 30000);
    return () => clearInterval(id);
  }, [load]));

  // Honour the filter HomeScreen passes ('Pending' / 'Completed'), including
  // when this screen is already mounted and re-navigated with new params.
  // Job Details adds refreshAt so a repeat 'Completed' still re-applies.
  const routeFilter = route?.params?.filter;
  const routeFilterAt = route?.params?.refreshAt;
  useEffect(() => {
    const f = filterFromParam(routeFilter);
    if (!f) return;
    setFilter(f);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [routeFilter, routeFilterAt]);

  // Shop name stands in for "Assigned by" (events only carry role codes).
  useEffect(() => {
    let active = true;
    if (!shopId) return undefined;
    shopApi.get(`/shops/${shopId}`)
      .then((s) => { if (active && s?.name) setShopName(s.name); })
      .catch(() => {});
    return () => { active = false; };
  }, [shopId]);

  // Second guard on top of the server scope: drop anything not assigned to
  // this technician (reassigned since the list was fetched), so a reassigned
  // job never stays active for the previous employee. Each job carries its
  // stage from the backend ticket + events.
  const jobs = useMemo(
    () => list
      .filter((t) => !technicianId || String(t.assignedTechnicianId || '') === String(technicianId))
      .map((t) => ({ ...t, stage: jobStage(t, eventsById[t.id]) })),
    [list, eventsById, technicianId],
  );

  // Newest first (by last update, else creation), every job — no month
  // filter. A search matches ref, device, customer, phone or issue.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...jobs].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    if (!q) return sorted;
    return sorted.filter((t) => [ticketRef(t), deviceName(t), t.customerName, t.customerPhone, issueText(t)]
      .some((v) => v && String(v).toLowerCase().includes(q)));
  }, [jobs, query]);

  // Rail counts come from the same set the list shows, so a tile's count is
  // always the number of cards under it.
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, filterByChip(searched, f).length])),
    [searched],
  );

  // Jobs still awaiting Accept / Reject stay on top (as on the old Assign Report).
  const previousShown = useMemo(() => {
    const shown = filterByChip(searched, filter);
    return [...shown.filter((t) => isAwaitingAccept(t.stage)), ...shown.filter((t) => !isAwaitingAccept(t.stage))];
  }, [searched, filter]);

  // IDs of the tickets whose rows actually render an event label, capped.
  // Joined into a string key so the events effect below only re-runs when the
  // visible set really changes (not on every render).
  const displayedKey = useMemo(
    () => previousShown.slice(0, 30).map((b) => b?.id).filter(Boolean).join('|'),
    [previousShown],
  );

  // Displayed tickets not read yet (Assigned / Completed / Rejected — the live
  // ones are re-read on every load) get their events once, for the pill and
  // the assignment line.
  useEffect(() => {
    const displayedIds = displayedKey ? displayedKey.split('|') : [];
    if (displayedIds.length) fetchEvents(displayedIds, false);
  }, [displayedKey, fetchEvents]);

  // Per-ticket values off the cached events.
  const eventInfo = useMemo(() => {
    const out = {};
    Object.keys(eventsById).forEach((id) => {
      const ev = eventsById[id];
      out[id] = { key: pickLatestEventKey(ev), assignedAt: assignedAtFrom(ev), ...assignerOf(ev) };
    });
    return out;
  }, [eventsById]);

  const openTicket = (t) => {
    navigation.navigate('TechnicianTicketDetail', { ticketId: t.id });
  };

  // Accept (POST /tickets/{id}/accept) → straight into Job Details; the list
  // re-reads so the job moves to Working. The toast follows the API's answer.
  const askAccept = (t) => {
    if (!actingRef.current) setAcceptFor(t.id);
  };
  const confirmAccept = async () => {
    const ticketId = acceptFor;
    if (!ticketId || actingRef.current) return;
    actingRef.current = true;
    setActingOn(ticketId);
    try {
      await acceptTicket(ticketId);
    } catch (e) {
      actingRef.current = false;
      setActingOn(null);
      setAcceptFor(null);
      notify('Could not accept job', userMessage(e, 'Please try again.'), { type: 'error' });
      return;
    }
    // Repair Work Started once the customer approval is current (best-effort).
    await autoStartRepair(ticketId);
    actingRef.current = false;
    setActingOn(null);
    setAcceptFor(null);
    notify('Job accepted', '', { type: 'success' });
    load(false, true);
    navigation.navigate('TechnicianTicketDetail', { ticketId });
  };

  // Reject cancels the ticket (existing status endpoint) → Rejected.
  const rejectJob = async (t) => {
    if (actingRef.current) return;
    const ok = await confirm({
      title: 'Decline ticket?',
      message: 'The ticket will be cancelled. Continue?',
      confirmText: 'Decline',
      destructive: true,
    });
    if (!ok || actingRef.current) return;
    actingRef.current = true;
    setActingOn(t.id);
    try {
      await ticketApi.patch(`/tickets/${t.id}/status`, { query: { status: 'CANCELLED' } });
      notify('Job rejected', '', { type: 'success' });
    } catch (e) {
      notify('Could not reject job', userMessage(e, 'Please try again.'), { type: 'error' });
    } finally {
      actingRef.current = false;
      setActingOn(null);
    }
    load(false, true);
  };

  const toggleSearch = () => {
    if (showSearch) setQuery('');
    setShowSearch(!showSearch);
  };

  const pickFilter = (key) => {
    setFilter(key);
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  };

  const phaseFor = (t) => technicianEventLabel(eventInfo[t.id]?.key) || statusLabel(t.status);
  const showInitialSpinner = loading && list.length === 0;
  const showError = error && list.length === 0 && !loading;

  // Two columns once the list pane is tablet-wide.
  const twoCol = listWidth >= rs(600);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <JobHeader
        navigation={navigation}
        title="My Jobs"
        sub="Assigned & Working Jobs"
        searchOn={showSearch}
        onSearch={toggleSearch}
        onScan={() => navigation.navigate('ScanTicketQr')}
      />

      {/* Search (ref / device / customer / phone / issue) across every job. */}
      {showSearch ? (
        <View style={styles.searchWrap}>
          <SearchBar
            className="rounded-full py-2.5"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by Tracking ID, Customer name…"
            onClear={() => setQuery('')}
          />
        </View>
      ) : null}

      <View style={styles.body}>
        <JobRail items={RAIL} counts={counts} active={filter} onPick={pickFilter} softBorder plain />

        <ScrollView
          ref={scrollRef}
          style={styles.list}
          contentContainerStyle={styles.content}
          onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />}
        >
          {showInitialSpinner && (
            <View style={styles.stateBox}>
              <ActivityIndicator size="small" color={C.green} />
              <Text style={styles.stateText}>Loading your jobs…</Text>
            </View>
          )}

          {showError && (
            <View style={[styles.card, styles.stateBox]}>
              <View style={[styles.stateIcon, { backgroundColor: TONES.red.bg }]}>
                <WifiOff size={rs(20)} color={C.red} />
              </View>
              <Text style={styles.stateTitle}>Couldn't load jobs</Text>
              <Text style={styles.stateText}>Check your connection and try again.</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.85}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {!showInitialSpinner && !showError && (
            previousShown.length === 0 ? (
              <EmptyRow text={query.trim() ? `No jobs match "${query.trim()}".` : filter === 'All' ? 'No jobs yet.' : `No ${filter.toLowerCase()} jobs.`} />
            ) : (
              <View style={[styles.grid, twoCol && { marginHorizontal: -rs(5) }]}>
                {previousShown.map((t) => {
                  const info = eventInfo[t.id] || {};
                  const by = info.actor || shopName;
                  return (
                    <View key={t.id} style={{ width: twoCol ? '50%' : '100%', paddingHorizontal: twoCol ? rs(5) : 0 }}>
                      <JobCard
                        ticket={t}
                        phase={phaseFor(t)}
                        assignedAt={info.assignedAt || t.createdAt}
                        assignedBy={by ? `${info.reassigned ? 'Reassigned' : 'Assigned'} by ${by}` : null}
                        busy={actingOn === t.id}
                        onAccept={() => askAccept(t)}
                        onReject={() => rejectJob(t)}
                        // Not accepted yet → Job Details shows only the assignment preview.
                        onPress={() => openTicket(t)}
                      />
                    </View>
                  );
                })}
              </View>
            )
          )}
        </ScrollView>
      </View>
      <AcceptJobDialog visible={!!acceptFor} busy={!!actingOn} onCancel={() => setAcceptFor(null)} onConfirm={confirmAccept} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// Rail filters (Partner Job Report icons and gradient tones).
const RAIL = [
  { key: 'All', label: 'All', icon: ChartColumn, tone: 'teal' },
  { key: 'Assigned', label: 'Assigned', icon: FileText, tone: 'blue' },
  { key: 'Reassigned', label: 'Reassigned', icon: Users, tone: toneOf(CATEGORY_COLOR.Reassigned) },
  { key: 'In Process', label: 'In Process', icon: RefreshCw, tone: 'orange' },
  { key: 'Pending', label: 'Pending', icon: CircleAlert, tone: 'red' },
  { key: 'Completed', label: 'Completed', icon: Check, tone: 'green' },
  { key: 'Cancelled', label: 'Cancelled', icon: X, tone: toneOf(CATEGORY_COLOR.Cancelled) },
];

const timeOf = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const h = d.getHours(); return `${String(h % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
// "Oppo A5 5G · CPH2753 · 8GB · 128GB" → model name, "CPH2753 - 8GB - 128GB" (as Assign Report).
// Placeholder parts (N/A, -, …) are dropped.
function splitDevice(ticket) {
  const parts = String(deviceName(ticket)).split(/[·•|]/).map(clean).filter(Boolean);
  return { model: parts[0] || 'Device', specs: parts.slice(1).join(' - ') };
}

// Partner Job Report card: status tab · photo · VIEW, then ref, device,
// customer, the technician's description, issue, assigned date | time and the
// current phase pill. Empty fields are skipped.
// Assigned (awaiting Accept): the assigner line and Reject · Accept under the
// details instead of the phase pill.
function JobCard({ ticket, phase, assignedAt, assignedBy, busy, onAccept, onReject, onPress }) {
  const st = (ticket.status || '').toUpperCase();
  const category = ticket.stage;
  const awaiting = isAwaitingAccept(ticket.stage);
  // A re-estimate awaiting the customer reads Pending Approval on the tab.
  const quoted = st === 'QUOTED' && category === 'Pending';
  const tab = quoted ? 'Pending Approval' : category;
  const tone = quoted ? PENDING_APPROVAL_COLOR : CATEGORY_COLOR[category];
  const techNote = clean(ticket.complianceNote);
  const status = clean(phase);
  return (
    <JobPictureCard
      ticket={ticket}
      tab={tab}
      tabColor={tone}
      refText={ticketRef(ticket)}
      model={splitDevice(ticket).model}
      lines={[
        { text: clean(ticket.customerName) },
        awaiting
          ? { icon: Users, text: assignedBy }
          : { icon: UserCog, text: techNote ? `Technician: ${techNote}` : null },
        { icon: Wrench, text: issueText(ticket) },
      ]}
      date={assignedAt ? formatDate(assignedAt) : null}
      time={assignedAt ? timeOf(assignedAt) : null}
      pill={!awaiting && status ? { text: status } : null}
      footer={awaiting ? (
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.rejectBtn} onPress={onReject} disabled={busy}
            activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Reject job">
            <View style={styles.rejectDot}><X size={rs(10)} color={C.white} strokeWidth={3} /></View>
            <KText size={11.5} weight="700" color={C.red} numberOfLines={1}>Reject</KText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} disabled={busy}
            activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Accept job">
            {busy ? <ActivityIndicator color={C.white} size="small" /> : (
              <>
                <View style={styles.acceptDot}><Check size={rs(10)} color={C.green} strokeWidth={3} /></View>
                <KText size={11.5} weight="700" color={C.white} numberOfLines={1}>Accept</KText>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
      onPress={onPress}
    />
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
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  searchWrap: { backgroundColor: C.white, paddingHorizontal: rs(14), paddingVertical: rs(10), borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },

  // Rail + list
  body: { flex: 1, flexDirection: 'row', backgroundColor: C.white },
  list: { flex: 1 },
  content: { paddingTop: rs(10), paddingLeft: rs(11), paddingRight: rs(9), paddingBottom: rs(24) },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },

  card: { backgroundColor: C.white, borderRadius: rs(18), ...shadow },

  emptyRow: { alignItems: 'center', paddingVertical: rs(16), gap: rs(6) },
  emptyText: { fontSize: rf(12), color: C.muted, textAlign: 'center' },

  // States
  stateBox: { alignItems: 'center', paddingVertical: rs(24), paddingHorizontal: rs(16), marginBottom: rs(12), gap: rs(6) },
  stateIcon: { width: rs(44), height: rs(44), borderRadius: rs(22), alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: rf(14), fontWeight: '800', color: C.ink },
  stateText: { fontSize: rf(12), color: C.muted, textAlign: 'center' },
  retryBtn: { marginTop: rs(6), backgroundColor: C.green, borderRadius: 999, paddingHorizontal: rs(22), paddingVertical: rs(8) },
  retryText: { color: C.white, fontWeight: '700', fontSize: rf(12) },

  // Reject · Accept on Assigned cards (same look as the old Assign Report).
  cardActions: { flexDirection: 'row', gap: rs(6), marginTop: rs(6) },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(5),
    backgroundColor: '#FDECEC', borderWidth: 1, borderColor: '#F9C9C7', borderRadius: rs(10),
    paddingVertical: rs(4), paddingLeft: rs(5), paddingRight: rs(8),
  },
  rejectDot: { width: rs(18), height: rs(18), borderRadius: rs(9), backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(5),
    backgroundColor: C.green, borderRadius: rs(10),
    paddingVertical: rs(4), paddingLeft: rs(5), paddingRight: rs(8),
    shadowColor: C.green, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  acceptDot: { width: rs(18), height: rs(18), borderRadius: rs(9), backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
});
