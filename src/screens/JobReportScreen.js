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
} from 'lucide-react-native';
import { selectTechnicianId } from '../store/authSlice';
import { listMyTickets, listTicketEvents } from '../api/tickets';
import { loadProgressFlags } from '../utils/repairDone';
import { rf, rs } from '../utils/responsive';
import { notify } from '../components/confirm';
import { ticketRef } from '../utils/ticketRef';
import { SearchBar } from '../components/rnr';
import { JobHeader, JobRail, MonthBar, JobPictureCard } from '../components/JobCardKit';

const FILTERS = ['All', 'In Process', 'Pending', 'Completed'];

// Ticket statuses → display buckets used by the cards. Mirrors the owner-side
// WorkingRecord screen so a technician sees the same "Recent Pending" /
// "In Process" split they'd see on a manager's screen.
// The technician's work is done once Repair Completed is recorded (repairDone,
// read off the job's events) — no waiting for the shop to verify. READY and
// every later status are the shop's handover, so they count as Completed too.
const COMPLETED_STATUSES = new Set([
  'READY', 'INVOICE_GENERATED', 'INVOICE_READY', 'DELIVERED_PROCESSING', 'DELIVERED', 'CANCELLED',
]);
function bucketize(t) {
  const s = (t?.status || '').toUpperCase();
  if (COMPLETED_STATUSES.has(s) || t?.repairDone) return 'COMPLETED';
  // A job held on an open Spare Parts Waiting row (partsWait) sits in Pending.
  if (s === 'CREATED' || s === 'IN_DIAGNOSIS' || s === 'QUOTED' || t?.partsWait) return 'PENDING';
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

// One colour per filter, shared by the rail tile, its counter and the card's
// status badge.
// Partner Job Report colours.
const CATEGORY_COLOR = {
  All: '#035C6C',
  'In Process': '#FAA700',
  Pending: '#F32C26',
  Completed: '#609138',
  // Badge only: a cancelled job is counted under Completed (closed).
  Cancelled: '#F32C26',
};
// Tab only: a re-estimate awaiting the customer (QUOTED) reads in amber.
const PENDING_APPROVAL_COLOR = '#FAA700';

// Exactly one category per job, so the category counts add up to All.
// Spare Parts Waiting and re-estimates (QUOTED) sit in Pending; cancelled
// jobs are closed, so they sit in Completed.
function categoryOf(t) {
  const bk = bucketize(t);
  if (bk === 'COMPLETED') return 'Completed';
  if (bk === 'PENDING') return 'Pending';
  return 'In Process';
}

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
  return list.filter((b) => categoryOf(b) === chip);
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
  const [filter, setFilter] = useState(() => (FILTERS.includes(route?.params?.filter) ? route.params.filter : 'All'));
  // Latest event-status key per ticket id, fetched after the ticket list so
  // each row can show the actual current phase (e.g. "Repair Completed",
  // "Quality Check Completed") instead of the coarse macro status. Treated as
  // best-effort: row falls back to macro-status label if events aren't ready.
  const [eventStatusById, setEventStatusById] = useState({});
  // Assignment time per ticket id, off the same events.
  const [assignedAtById, setAssignedAtById] = useState({});

  const scrollRef = useRef(null);
  const [showSearch, setShowSearch] = useState(false);
  // Month shown in the month bar; the list and counts cover that month.
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [listWidth, setListWidth] = useState(0);

  // silent: background poll — no spinner, and a failed poll keeps the list.
  const load = useCallback(async (isRefresh = false, silent = false) => {
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
      setList(items.filter((t) => t?.id && !seen.has(t.id) && seen.add(t.id)));
      setError(false);
      // Booking-timeline events are fetched separately, only for the tickets
      // actually rendered (see the displayedIds effect) — not for all 100.
    } catch {
      if (silent) return;
      setError(true);
      if (isRefresh) {
        notify('Could not refresh', 'Check your connection and pull down to try again.', { type: 'error' });
      } else {
        setList([]);
        setEventStatusById({});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
    if (!FILTERS.includes(routeFilter)) return;
    setFilter(routeFilter);
    const d = new Date();
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [routeFilter, routeFilterAt]);

  // Per-job flags read off the booking events: Repair Completed recorded
  // (→ Completed) or an open Spare Parts Waiting row (→ Pending), whatever
  // the ticket status still says.
  const [flagsById, setFlagsById] = useState({});
  useEffect(() => {
    let active = true;
    loadProgressFlags(list).then((flags) => { if (active) setFlagsById(flags); });
    return () => { active = false; };
  }, [list]);
  // Second guard on top of the server scope: drop anything not assigned to
  // this technician (e.g. reassigned since the list was fetched).
  const jobs = useMemo(
    () => list
      .filter((t) => !technicianId || String(t.assignedTechnicianId || '') === String(technicianId))
      .map((t) => (flagsById[t.id] ? { ...t, ...flagsById[t.id] } : t)),
    [list, flagsById, technicianId],
  );

  // Newest first. Without a search: the picked month (by last update, else
  // creation). A search looks across every month by ref, device, customer,
  // phone or issue.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...jobs].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    if (!q) {
      return sorted.filter((t) => {
        const at = t.updatedAt || t.createdAt;
        if (!at) return true;
        const d = new Date(at);
        return d.getFullYear() === month.y && d.getMonth() === month.m;
      });
    }
    return sorted.filter((t) => [ticketRef(t), deviceName(t), t.customerName, t.customerPhone, issueText(t)]
      .some((v) => v && String(v).toLowerCase().includes(q)));
  }, [jobs, query, month]);

  // Rail counts come from the same set the list shows, so a tile's count is
  // always the number of cards under it.
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, filterByChip(searched, f).length])),
    [searched],
  );

  const previousShown = useMemo(() => filterByChip(searched, filter), [searched, filter]);

  // IDs of the tickets whose rows actually render an event label, capped.
  // Joined into a string key so the events effect below only re-runs when the
  // visible set really changes (not on every render).
  const displayedKey = useMemo(
    () => previousShown.slice(0, 30).map((b) => b?.id).filter(Boolean).join('|'),
    [previousShown],
  );

  // Fetch booking-timeline events only for the displayed tickets, and only
  // when that set changes; ids already resolved are skipped.
  useEffect(() => {
    const displayedIds = displayedKey ? displayedKey.split('|') : [];
    if (displayedIds.length === 0) return undefined;
    let active = true;
    (async () => {
      const updates = {};
      const assigned = {};
      await Promise.all(displayedIds.map(async (id) => {
        try {
          const events = await listTicketEvents(id);
          const key = pickLatestEventKey(events);
          if (key) updates[id] = key;
          const at = assignedAtFrom(events);
          if (at) assigned[id] = at;
        } catch { /* leave fallback to macro status */ }
      }));
      if (active && Object.keys(updates).length) {
        setEventStatusById((prev) => ({ ...prev, ...updates }));
      }
      if (active && Object.keys(assigned).length) {
        setAssignedAtById((prev) => ({ ...prev, ...assigned }));
      }
    })();
    return () => { active = false; };
    // Re-fetch after a pull-to-refresh too, so phases stay current.
  }, [displayedKey, list]);

  const openTicket = (t) => {
    navigation.navigate('TechnicianTicketDetail', { ticketId: t.id });
  };

  const stepMonth = (delta) => {
    setMonth(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  };
  const monthLabel = new Date(month.y, month.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const toggleSearch = () => {
    if (showSearch) setQuery('');
    setShowSearch(!showSearch);
  };

  const pickFilter = (key) => {
    setFilter(key);
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  };

  const phaseFor = (t) => technicianEventLabel(eventStatusById[t.id]) || statusLabel(t.status);
  const showInitialSpinner = loading && list.length === 0;
  const showError = error && list.length === 0 && !loading;

  // Two columns once the list pane is tablet-wide.
  const twoCol = listWidth >= rs(600);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <JobHeader
        navigation={navigation}
        title="My Jobs"
        sub="Working Jobs"
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
        <JobRail items={RAIL} counts={counts} active={filter} onPick={pickFilter} softBorder />

        <ScrollView
          ref={scrollRef}
          style={styles.list}
          contentContainerStyle={styles.content}
          onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />}
        >
          {/* Month bar (search results while searching). */}
          <MonthBar
            title={query.trim() ? 'Search results' : monthLabel}
            sub={`${counts.All ?? 0} ${(counts.All ?? 0) === 1 ? 'job' : 'jobs'}`}
            onPrev={() => stepMonth(-1)}
            onNext={() => stepMonth(1)}
            disabled={!!query.trim()}
          />

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
              <EmptyRow text={query.trim() ? `No jobs match "${query.trim()}".` : filter === 'All' ? `No jobs in ${monthLabel}.` : `No ${filter.toLowerCase()} jobs in ${monthLabel}.`} />
            ) : (
              <View style={[styles.grid, twoCol && { marginHorizontal: -rs(5) }]}>
                {previousShown.map((t) => (
                  <View key={t.id} style={{ width: twoCol ? '50%' : '100%', paddingHorizontal: twoCol ? rs(5) : 0 }}>
                    <JobCard
                      ticket={t}
                      phase={phaseFor(t)}
                      assignedAt={assignedAtById[t.id] || t.createdAt}
                      onPress={() => openTicket(t)}
                    />
                  </View>
                ))}
              </View>
            )
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// Rail filters (Partner Job Report icons and gradient tones).
const RAIL = [
  { key: 'All', label: 'All', icon: ChartColumn, tone: 'teal' },
  { key: 'In Process', label: 'In Process', icon: RefreshCw, tone: 'orange' },
  { key: 'Pending', label: 'Pending', icon: CircleAlert, tone: 'red' },
  { key: 'Completed', label: 'Completed', icon: Check, tone: 'green' },
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
function JobCard({ ticket, phase, assignedAt, onPress }) {
  const st = (ticket.status || '').toUpperCase();
  const category = st === 'CANCELLED' ? 'Cancelled' : categoryOf(ticket);
  // A re-estimate awaiting the customer reads Pending Approval on the tab.
  const tab = st === 'QUOTED' ? 'Pending Approval' : category;
  const tone = st === 'QUOTED' ? PENDING_APPROVAL_COLOR : CATEGORY_COLOR[category];
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
        { icon: UserCog, text: techNote ? `Technician: ${techNote}` : null },
        { icon: Wrench, text: issueText(ticket) },
      ]}
      date={assignedAt ? formatDate(assignedAt) : null}
      time={assignedAt ? timeOf(assignedAt) : null}
      pill={status ? { text: status } : null}
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
});
