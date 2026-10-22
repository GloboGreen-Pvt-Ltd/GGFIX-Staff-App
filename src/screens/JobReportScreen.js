import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { markNotificationsSeen } from './NotificationsScreen';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
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
  Wrench,
  ScanLine,
} from 'lucide-react-native';
import { listMyTickets, listTicketEvents } from '../api/tickets';
import { rf, rs } from '../utils/responsive';
import { notify } from '../components/confirm';
import { ticketRef } from '../utils/ticketRef';
import { resolveDeviceImageSource } from '../utils/images';
import { listModelsForBrand } from '../api/master';
import TicketCard from '../components/TicketCard';
import { BadgeIconTile } from '../components/MintKit';
import { SearchBar } from '../components/rnr';

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
  IN_REPAIR: 'Repair Work In Progress',
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

// Event-level labels (the same fine-grained phases the History screen renders).
// The technician's last controllable phase is REPAIR_COMPLETED — anything after
// it (READY, DELIVERED) is a shop-side action and should not show up as the
// technician's "current" step. So we cap at REPAIR_COMPLETED for display.
const EVENT_LABEL = {
  BOOKING_CREATED_BY_SHOP: 'Booking Created by Shop',
  SERVICE_ACCEPTED: 'Service Accepted',
  ASSIGNED_TO_TECHNICIAN: 'Assigned to Technician',
  AWAITING_TECHNICIAN_ACCEPTANCE: 'Awaiting Technician Acceptance',
  REASSIGNED_TO_TECHNICIAN: 'Re-Assigned to Technician',
  TECHNICIAN_ACCEPTED_SERVICE: 'Technician Accepted Service',
  TECHNICIAN_WORK_STARTED: 'Technician Work Started',
  TECHNICIAN_UPLOADED_DEVICE_IMAGES: 'Technician Uploaded Device Images',
  TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED: 'Technician Compliance Issue Verified & Updated',
  RE_ESTIMATED_CONFIRMED: 'Re-Estimated Confirmed',
  CUSTOMER_APPROVED: 'Customer Approved',
  CUSTOMER_REJECTED: 'Customer Rejected',
  IN_REPAIR: 'Repair Work In Progress',
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
  for (const e of events) {
    const k = (e?.status || '').toUpperCase();
    if (!k) continue;
    const idx = EVENT_INDEX[k];
    const t = e.createdAt ? new Date(e.createdAt).getTime() : 0;
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
    if (idx > bestIndex || (idx === bestIndex && t > bestTime)) {
      bestKey = k;
      bestIndex = idx;
      bestTime = t;
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
  red: { fg: C.red, text: '#E23434', bg: '#FEECEC', soft: '#FFF6F6' },
  yellow: { fg: C.yellow, text: '#C08B00', bg: '#FFF4D6', soft: '#FFFBEF' },
  green: { fg: C.green, text: '#035C6C', bg: '#E5F3F5', soft: '#F3FBF5' },
  blue: { fg: C.blue, text: C.blue, bg: '#E8F0FE', soft: '#F4F8FF' },
  ink: { fg: C.ink, text: C.ink, bg: '#E5E7EB', soft: '#F3F4F6' },
};

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
export default function JobReportScreen({ navigation, route }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  // Viewing tasks auto-reads their notifications.
  useEffect(() => { if (list.length) markNotificationsSeen({ tickets: list }); }, [list]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
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
  // Search looks across every job (not just this month) by ref, device,
  // customer, phone or issue; the stat-card filter still applies.
  const previousAll = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filterByChip(sortedDesc, filter);
    const all = [...list].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    return filterByChip(all, filter).filter((t) => [ticketRef(t), deviceName(t), t.customerName, t.customerPhone, issueText(t)]
      .some((v) => v && String(v).toLowerCase().includes(q)));
  }, [sortedDesc, filter, query, list]);

  const pendingShown = pendingAll;
  const processShown = processAll;
  const previousShown = previousAll;

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

  // Stat tiles filter the single task list (the old per-section scroll targets are gone).
  const onStatPress = (key) => {
    setFilter({ process: 'In Process', pending: 'Pending', completed: 'Completed' }[key] || 'All');
  };

  const phaseFor = (t) => technicianEventLabel(eventStatusById[t.id]) || statusLabel(t.status);
  const showInitialSpinner = loading && list.length === 0;
  const showError = error && list.length === 0 && !loading;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header: same white bar as Assign Report — back · centred title */}
      <View style={styles.headerBar}>
        <View style={{ width: rs(36) }}>
          {navigation.canGoBack() ? (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Back" activeOpacity={0.7} style={styles.headerBack}>
              <ChevronLeft size={rs(20)} color="#111111" strokeWidth={2.4} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <Text style={styles.headerTitle} numberOfLines={1}>Job Report</Text>
          <Text style={styles.headerSub} numberOfLines={1}>Working Jobs</Text>
        </View>
        <View style={{ width: rs(36) }} />
      </View>

      {/* Search (ref / device / customer / phone / issue) + scan a job QR */}
      <View style={styles.searchWrap}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search job, device, customer"
          onClear={() => setQuery('')}
          rightAccessory={(
            <TouchableOpacity
              onPress={() => navigation.navigate('ScanTicketQr')}
              hitSlop={8} accessibilityLabel="Scan job QR code" activeOpacity={0.7}
              style={styles.scanBtn}
            >
              <ScanLine size={rs(18)} color={C.green} strokeWidth={2.2} />
            </TouchableOpacity>
          )}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ backgroundColor: C.bg }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />}
      >

        {/* Stat cards */}
        <View style={styles.statRow}>
          <StatCard value={pad2(counts.total)} label="Total" hint="Overall" tone="ink" Icon={ChartColumn} onPress={() => onStatPress('total')} active={filter === 'All'} />
          <StatCard value={pad2(counts.inProcess)} label="In Process" hint="Active" tone="yellow" Icon={RefreshCw} onPress={() => onStatPress('process')} active={filter === 'In Process'} />
          <StatCard value={pad2(counts.pending)} label="Pending" hint="Waiting" tone="red" Icon={CircleAlert} onPress={() => onStatPress('pending')} active={filter === 'Pending'} />
          <StatCard value={pad2(counts.completed)} label="Completed" hint="Finished" tone="green" Icon={Check} onPress={() => onStatPress('completed')} active={filter === 'Completed'} />
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
                {previousShown.length === 0 ? (
                  <EmptyRow text={query.trim() ? `No jobs match "${query.trim()}".` : filter === 'All' ? 'No tasks this month.' : `No ${filter.toLowerCase()} tasks this month.`} />
                ) : previousShown.map((t) => (
                  statusPill(t).tone === 'green' || statusPill(t).tone === 'ink'
                    ? <CompletedRow key={t.id} ticket={t} phase={phaseFor(t)} onPress={() => openTicket(t)} onHistory={() => openHistory(t)} />
                    : <TaskRow key={t.id} ticket={t} variant={statusPill(t).tone === 'red' ? 'pending' : 'process'} phase={phaseFor(t)} onPress={() => openTicket(t)} onHistory={() => openHistory(t)} />
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

const STAT_TONE = { yellow: '#FAA700', red: '#F32C26', green: '#609138', ink: '#1C3053' };
function StatCard({ value, label, tone, Icon, onPress, active }) {
  return <BadgeIconTile icon={Icon} color={STAT_TONE[tone] || '#035C6C'} label={label} count={Number(value)} onPress={onPress} active={active} size={rs(42)} />;
}

// Header-less group: just the task cards (all rows, no title / expand toggle).
function SectionCard({ children }) {
  return <View style={{ marginBottom: rs(2) }}>{children}</View>;
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
        : <DevIcon size={rs(17)} color={t.fg === C.yellow ? '#FAA700' : t.fg} strokeWidth={2.1} />}
    </View>
  );
}

// Row used by "Recent Pending" and "In Process".
const TONE_COLOR = { red: '#F32C26', yellow: '#FAA700', green: '#609138', blue: '#0788C9', ink: '#6B7280' };
const timeOf = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; const h = d.getHours(); return `${String(h % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
// "Oppo A5 5G · CPH2753 · 8GB · 128GB" → model name, "CPH2753 - 8GB - 128GB" (as Assign Report).
function splitDevice(ticket) {
  const clean = (x) => String(x).replace(/^[\s ]+|[\s ]+$/g, '');
  const parts = String(deviceName(ticket)).split(/[·•|]/).map(clean).filter(Boolean);
  return { model: parts[0] || 'Device', specs: parts.slice(1).join(' - '), color: clean(ticket.color || '') };
}

// Shared card: device (left) · status/date/time (right), then one line each for
// Customer, Issue and Status (current phase — tap for the service history).
function ReportCard({ ticket, iconTone, when, phase, onPress, onHistory }) {
  const pill = statusPill(ticket);
  const d = splitDevice(ticket);
  return (
    <TicketCard
      badge={<DeviceBadge ticket={ticket} tone={iconTone} />}
      refId={ticketRef(ticket)} title={d.model}
      subtitle={d.specs || null} subtitle2={d.color ? `Colour: ${d.color}` : null}
      status={pill.label} statusColor={TONE_COLOR[pill.tone]}
      date={formatDate(when)} time={timeOf(when)}
      rows={[
        [{ icon: User, label: 'Customer', value: ticket.customerName }, null],
        [{ icon: Wrench, label: 'Issue', value: issueText(ticket) }, null],
        [{ icon: Clock, label: 'Status', value: phase, onPress: onHistory }, null],
      ]}
      onPress={onPress}
    />
  );
}

function TaskRow({ ticket, variant, phase, onPress, onHistory }) {
  const pill = statusPill(ticket);
  const iconTone = variant === 'pending' ? pill.tone : (isLaptop(ticket) ? 'blue' : 'green');
  return <ReportCard ticket={ticket} iconTone={iconTone} when={ticket.createdAt} phase={phase} onPress={onPress} onHistory={onHistory} />;
}

// Row used by "Previous Completed".
function CompletedRow({ ticket, phase, onPress, onHistory }) {
  const pill = statusPill(ticket);
  const iconTone = pill.tone === 'green' ? 'green' : pill.tone === 'ink' ? 'ink' : (isLaptop(ticket) ? 'blue' : pill.tone);
  return <ReportCard ticket={ticket} iconTone={iconTone} when={ticket.updatedAt || ticket.createdAt} phase={phase} onPress={onPress} onHistory={onHistory} />;
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
  safe: { flex: 1, backgroundColor: C.white },

  // Header (matches Assign Report)
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: rs(10), backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingHorizontal: rs(14), paddingVertical: rs(10) },
  headerBack: { width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: rf(17), fontWeight: '800', color: '#1C3053', textAlign: 'center' },
  headerSub: { fontSize: rf(12), color: '#6B7280', marginTop: 1, textAlign: 'center' },
  searchWrap: { backgroundColor: C.bg, paddingHorizontal: rs(14), paddingTop: rs(10) },
  scanBtn: { marginLeft: rs(8), paddingLeft: rs(10), borderLeftWidth: 1, borderLeftColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },

  content: { paddingHorizontal: rs(14), paddingTop: rs(8), paddingBottom: rs(20) },

  card: { backgroundColor: C.white, borderRadius: rs(18), ...shadow },

  // This Month
  monthCard: { padding: rs(16), overflow: 'hidden', marginBottom: rs(12) },
  monthArt: { position: 'absolute', right: rs(2), top: rs(4) },
  monthTitle: { fontSize: rf(16), fontWeight: '800', color: C.ink },
  monthSub: { fontSize: rf(12), color: C.muted, marginTop: rs(2), maxWidth: '64%' },
  monthPill: {
    flexDirection: 'row', alignItems: 'center', marginTop: rs(12),
    borderWidth: 1, borderColor: '#E5F3F5', backgroundColor: '#E5F3F5',
    borderRadius: 999, paddingVertical: rs(6), paddingHorizontal: rs(6),
    width: '66%', minWidth: rs(196),
  },
  monthArrow: { width: rs(26), height: rs(26), alignItems: 'center', justifyContent: 'center' },
  monthCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6) },
  monthPillText: { fontSize: rf(14), fontWeight: '700', color: C.green, flexShrink: 1 },

  // Stat cards
  statRow: { flexDirection: 'row', gap: rs(4), marginBottom: rs(10), backgroundColor: '#FFFFFF', borderRadius: rs(16), borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: rs(10), paddingHorizontal: rs(6) },
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
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 999,
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
  chipText: { fontSize: rf(12), color: '#6B7280', fontWeight: '500' },
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
  cDevice: { fontSize: rf(11), color: '#6B7280' },
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
