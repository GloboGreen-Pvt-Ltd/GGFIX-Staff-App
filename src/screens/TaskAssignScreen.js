import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { markNotificationsSeen } from './NotificationsScreen';
import { View, StyleSheet, ScrollView, TouchableOpacity, Pressable, ActivityIndicator, RefreshControl, Modal, Image, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import {
  ChevronLeft,
  FileText,
  Users,
  CircleCheck,
  BriefcaseBusiness,
  Clock,
  Info,
  Laptop,
  Smartphone,
  Monitor,
  Printer,
  Tablet,
  Watch,
  Tv,
  Headphones,
  Camera,
  Gamepad2,
  Speaker,
  Wrench,
  X,
  RefreshCw,
  CircleAlert,
  Inbox,
  ScanLine,
  Check,
} from 'lucide-react-native';
import { ticketApi, shopApi } from '../api/client';
import { listMyTickets, acceptTicket, listTicketEvents } from '../api/tickets';
import { selectShopId } from '../store/authSlice';
import { confirm, notify } from '../components/confirm';
import { rf, rs } from '../utils/responsive';
import { ticketRef } from '../utils/ticketRef';
import { resolveDeviceImageSource } from '../utils/images';
import { listModelsForBrand } from '../api/master';
import TicketCard from '../components/TicketCard';
import { SearchBar } from '../components/rnr';

// Search box match: job ref, device, customer, phone or issue (case-insensitive).
function matchesQuery(t, q) {
  if (!q) return true;
  return [ticketRef(t), t.deviceDisplayName, t.customerName, t.customerPhone, t.issueDescription, t.repairServicesSummary]
    .some((v) => v && String(v).toLowerCase().includes(q));
}
import { BadgeIconTile } from '../components/MintKit';

// Screen palette — Near G Fix green / red / yellow on light neutrals plus the
// accent set the Assign Report mockup uses for its stat cards.
const C = {
  green: '#035C6C',
  greenTint: '#E5F3F5',
  greenSoft: '#F1FAF3',
  red: '#F32C26',
  redTint: '#FDECEC',
  yellow: '#FAA700',
  yellowTint: '#FEF6DC',
  blue: '#0788C9',
  blueTint: '#E9F0FE',
  purple: '#1C3053',
  purpleTint: '#F1EAFE',
  orange: '#FAA700',
  orangeTint: '#FEF1DD',
  ink: '#111111',
  muted: '#6B7280',
  faint: '#A3A3A3',
  bg: '#F3F4F6',
  border: '#EFEFEF',
  white: '#FFFFFF',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Tickets are split into the two sections:
//   Re-Assign     — newly (re)assigned, awaiting the technician's accept/reject
//   Recent Assign — everything assigned to me this month, newest first
//
// Source of truth for "accepted" is tickets.technician_accepted_at (set by
// POST /tickets/{id}/accept). A ticket whose status is CREATED with no
// accept timestamp is the walk-in just-came-in case; pickup-flow tickets
// mint at IN_DIAGNOSIS with NULL technicianAcceptedAt and also wait here
// until the tech taps Accept.
const FINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED']);
const needsAccept = (t) => !t.technicianAcceptedAt && !FINAL_STATUSES.has(t.status);
const isAccepted = (t) => !!t.technicianAcceptedAt;
const isCancelled = (t) => String(t?.status || '').toUpperCase() === 'CANCELLED';

const ASSIGN_EVENTS = new Set(['ASSIGNED_TO_TECHNICIAN', 'REASSIGNED_TO_TECHNICIAN']);
const ACCEPT_EVENT = 'TECHNICIAN_ACCEPTED_SERVICE';
// Event fan-out runs in batches so a busy month doesn't fire every request at once.
const EVENT_FETCH_CAP = 40;
const RECENT_PREVIEW = 5;

// ---------- formatting helpers ----------
function toDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtDate(iso) {
  const d = toDate(iso);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtTime(iso) {
  const d = toDate(iso);
  if (!d) return '';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h %= 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${m} ${ap}`;
}
function sameDay(a, b) {
  const x = toDate(a); const y = toDate(b);
  return !!x && !!y && x.toDateString() === y.toDateString();
}

// Pick an icon + tint for the device from its display name / services text.
const TINTS = [
  { fg: C.red, bg: C.redTint },
  { fg: C.green, bg: C.greenTint },
  { fg: C.blue, bg: C.blueTint },
  { fg: C.purple, bg: C.purpleTint },
  { fg: C.orange, bg: C.orangeTint },
];
function deviceVisual(t) {
  const s = `${t?.deviceDisplayName || ''} ${t?.repairServicesSummary || ''}`.toLowerCase();
  if (/laptop|macbook|notebook|chromebook/.test(s)) return { Icon: Laptop, ...TINTS[0] };
  if (/ipad|tab\b|tablet/.test(s)) return { Icon: Tablet, ...TINTS[3] };
  if (/watch/.test(s)) return { Icon: Watch, ...TINTS[4] };
  if (/printer/.test(s)) return { Icon: Printer, ...TINTS[3] };
  if (/desktop|monitor|\bpc\b|imac|cpu/.test(s)) return { Icon: Monitor, ...TINTS[2] };
  if (/\btv\b|television/.test(s)) return { Icon: Tv, ...TINTS[2] };
  if (/headphone|earbud|airpod|earphone/.test(s)) return { Icon: Headphones, ...TINTS[4] };
  if (/camera/.test(s)) return { Icon: Camera, ...TINTS[0] };
  if (/playstation|xbox|console|nintendo/.test(s)) return { Icon: Gamepad2, ...TINTS[3] };
  if (/speaker/.test(s)) return { Icon: Speaker, ...TINTS[4] };
  if (/phone|iphone|galaxy|redmi|oppo|vivo|realme|pixel|oneplus|mobile|samsung|nokia|motorola|poco|iqoo/.test(s)) {
    return { Icon: Smartphone, ...TINTS[1] };
  }
  return { Icon: Wrench, ...TINTS[1] };
}

// Derive assignment info from a ticket's event list.
//   assignedAt   — latest ASSIGNED/REASSIGNED_TO_TECHNICIAN event
//   reassigned   — a REASSIGNED_TO_TECHNICIAN event exists
//   actor        — event's actor (backend currently writes "SHOP")
//   responseMs   — assignment → TECHNICIAN_ACCEPTED_SERVICE (or technicianAcceptedAt)
function deriveAssignment(events, ticket) {
  const list = Array.isArray(events) ? events : [];
  let assignEv = null;
  let reassigned = false;
  let acceptEv = null;
  for (const ev of list) {
    const code = String(ev?.status || '').toUpperCase();
    const ts = toDate(ev?.createdAt)?.getTime() ?? 0;
    if (ASSIGN_EVENTS.has(code)) {
      if (code === 'REASSIGNED_TO_TECHNICIAN') reassigned = true;
      const prev = assignEv ? toDate(assignEv.createdAt)?.getTime() ?? 0 : -Infinity;
      if (ts >= prev) assignEv = ev;
    } else if (code === ACCEPT_EVENT) {
      acceptEv = ev;
    }
  }
  const assignedAt = assignEv?.createdAt || null;
  const acceptedAt = acceptEv?.createdAt || ticket?.technicianAcceptedAt || null;
  let responseMs = null;
  if (assignedAt && acceptedAt) {
    // Only the assignment that preceded the acceptance counts.
    const a = toDate(assignedAt).getTime();
    const b = toDate(acceptedAt).getTime();
    if (b >= a) responseMs = b - a;
  }
  return { assignedAt, acceptedAt, reassigned, actor: assignEv?.actor || null, responseMs };
}

export default function TaskAssignScreen({ navigation }) {
  const now = new Date();
  const { width } = useWindowDimensions();
  const shopId = useSelector(selectShopId);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  // Viewing assigned tasks auto-reads their notifications.
  useEffect(() => { if (list.length) markNotificationsSeen({ tickets: list }); }, [list]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actingOn, setActingOn] = useState(null);
  const [eventsById, setEventsById] = useState({}); // id -> events[] | null (failed)
  const [eventsLoading, setEventsLoading] = useState(false);
  const [shopName, setShopName] = useState(null);
  const [filter, setFilter] = useState('all'); // all | accepted | assigned
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const [showAll, setShowAll] = useState(false);
  const [reviewTicket, setReviewTicket] = useState(null);
  const [info, setInfo] = useState(null); // { title, body }

  const scrollRef = useRef(null);
  const sectionY = useRef({ reassign: 0, recent: 0 });

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const page = await listMyTickets({ page: 0, size: 100 });
      const items = Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []);
      setList(items);
      setError(null);
      if (isRefresh) setEventsById({});
    } catch (e) {
      setList([]);
      setError(e?.message || 'Could not load tasks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Shop name stands in for "Assigned by": ticket events only carry the actor
  // role ("SHOP"), not a person's name.
  useEffect(() => {
    let active = true;
    if (!shopId) return undefined;
    shopApi.get(`/shops/${shopId}`)
      .then((s) => { if (active && s?.name) setShopName(s.name); })
      .catch(() => {});
    return () => { active = false; };
  }, [shopId]);

  // Scope to picked month/year using whichever timestamp the backend last touched.
  const monthScoped = useMemo(() => {
    return list.filter((t) => {
      const stamp = t.updatedAt || t.createdAt;
      if (!stamp) return true;
      const d = new Date(stamp);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }, [list, year, month]);

  // Fetch timeline events for the month's tickets (assignment time, actor,
  // response time). Cached per ticket id; cleared on pull-to-refresh.
  useEffect(() => {
    const missing = monthScoped
      .map((t) => t.id)
      .filter((id) => id && !(id in eventsById))
      .slice(0, EVENT_FETCH_CAP);
    if (missing.length === 0) return undefined;
    let active = true;
    setEventsLoading(true);
    (async () => {
      const updates = {};
      await Promise.all(missing.map(async (id) => {
        try {
          const rows = await listTicketEvents(id);
          updates[id] = Array.isArray(rows) ? rows : [];
        } catch { updates[id] = null; }
      }));
      if (!active) return;
      setEventsById((prev) => ({ ...prev, ...updates }));
      setEventsLoading(false);
    })();
    return () => { active = false; setEventsLoading(false); };
  }, [monthScoped, eventsById]);

  const assignInfo = useMemo(() => {
    const map = {};
    monthScoped.forEach((t) => { map[t.id] = deriveAssignment(eventsById[t.id], t); });
    return map;
  }, [monthScoped, eventsById]);

  const sortKey = useCallback(
    (t) => toDate(assignInfo[t.id]?.assignedAt || t.createdAt || t.updatedAt)?.getTime() || 0,
    [assignInfo],
  );

  const reassignList = useMemo(
    () => monthScoped.filter(needsAccept).sort((a, b) => sortKey(b) - sortKey(a)),
    [monthScoped, sortKey],
  );
  const recentAll = useMemo(
    () => [...monthScoped].sort((a, b) => sortKey(b) - sortKey(a)),
    [monthScoped, sortKey],
  );
  const recentFiltered = useMemo(() => {
    const base = recentAll.filter((t) => matchesQuery(t, q));
    if (filter === 'accepted') return base.filter(isAccepted);
    if (filter === 'assigned') return base.filter((t) => !isCancelled(t));
    return base;
  }, [recentAll, filter, q]);
  const recentVisible = showAll ? recentFiltered : recentFiltered.slice(0, RECENT_PREVIEW);

  const counts = useMemo(() => ({
    assigned: monthScoped.filter((t) => !isCancelled(t)).length,
    reassign: reassignList.length,
    accepted: monthScoped.filter(isAccepted).length,
    total: monthScoped.length,
  }), [monthScoped, reassignList]);

  const perf = useMemo(() => {
    const rate = counts.total ? Math.round((counts.accepted / counts.total) * 100) : null;
    const samples = monthScoped
      .map((t) => assignInfo[t.id]?.responseMs)
      .filter((ms) => ms != null && Number.isFinite(ms));
    const avg = samples.length ? samples.reduce((s, x) => s + x, 0) / samples.length : null;
    return { rate, avgMs: avg, samples: samples.length };
  }, [counts, monthScoped, assignInfo]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
    setShowAll(false);
  };

  const scrollTo = (key) => {
    const y = sectionY.current[key];
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  const onStatPress = (key) => {
    if (key === 'reassign') { scrollTo('reassign'); return; }
    setFilter(key === 'accepted' ? 'accepted' : key === 'assigned' ? 'assigned' : 'all');
    setShowAll(false);
    // Wait a frame so the filtered list lays out before scrolling.
    requestAnimationFrame(() => scrollTo('recent'));
  };

  const openTicket = (t) => navigation.navigate('TechnicianTicketDetail', { ticketId: t.id });
  const openHistory = (t) => navigation.navigate('TechnicianBookingTimeline', { ticketId: t.id });

  // Accept hits the dedicated endpoint (POST /tickets/{id}/accept). Backend
  // stamps technician_accepted_at, bumps a CREATED ticket to IN_DIAGNOSIS,
  // and emits TECHNICIAN_ACCEPTED_SERVICE + TECHNICIAN_WORK_STARTED to the
  // customer/owner timeline. `confirm`/`notify` from components/confirm are
  // cross-platform — Alert.alert doesn't resolve its button callbacks on
  // Expo Web, which silently broke both buttons.
  const handleAccept = async (ticketId) => {
    const proceed = await confirm({
      title: 'Accept ticket?',
      message: 'Mark this ticket as accepted and start work.',
      confirmText: 'Accept',
    });
    if (!proceed) return;
    setActingOn(ticketId);
    try {
      await acceptTicket(ticketId);
      setReviewTicket(null);
      await load(true);
    } catch (e) {
      notify('Error', e?.message || 'Could not accept ticket');
    } finally {
      setActingOn(null);
    }
  };

  // Reject cancels the ticket via the existing status endpoint.
  const handleReject = async (ticketId) => {
    const proceed = await confirm({
      title: 'Decline ticket?',
      message: 'The ticket will be cancelled. Continue?',
      confirmText: 'Decline',
      destructive: true,
    });
    if (!proceed) return;
    setActingOn(ticketId);
    try {
      await ticketApi.patch(`/tickets/${ticketId}/status`, { query: { status: 'CANCELLED' } });
      setReviewTicket(null);
      await load(true);
    } catch (e) {
      notify('Error', e?.message || 'Could not update ticket');
    } finally {
      setActingOn(null);
    }
  };

  // "Assigned by" — a real person name only if the event actor carries one;
  // the backend writes role codes ("SHOP"), so fall back to the shop's name.
  const assignerName = (t) => {
    const actor = assignInfo[t.id]?.actor;
    if (actor && !/^(SHOP|SYSTEM|TECHNICIAN|OWNER|ADMIN|CUSTOMER)$/i.test(actor)) return actor;
    return shopName || null;
  };

  const initialLoading = loading && list.length === 0;
  const wide = width >= 640;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      {/* Header: back · title + subtitle (left aligned), white bar, light bottom line */}
      <View style={styles.headerBar}>
        <View style={{ width: rs(36) }}>
          {navigation.canGoBack() ? (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Back" activeOpacity={0.7} style={styles.headerBack}>
              <ChevronLeft size={rs(20)} color="#111111" strokeWidth={2.4} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <Text style={styles.headerTitle} numberOfLines={1}>Job Assign Report</Text>
          <Text style={styles.headerSub} numberOfLines={1}>Assigned Jobs</Text>
        </View>
        {/* spacer = back button width, keeps the title truly centered */}
        <View style={{ width: rs(36) }} />
      </View>

      {/* Search (ref / device / customer / phone / issue) + scan a job QR */}
      <View style={{ backgroundColor: C.bg, paddingHorizontal: rs(14), paddingTop: rs(10) }}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search job, device, customer"
          onClear={() => setQuery('')}
          rightAccessory={(
            <TouchableOpacity
              onPress={() => navigation.navigate('ScanTicketQr')}
              hitSlop={8} accessibilityLabel="Scan job QR code" activeOpacity={0.7}
              style={{ marginLeft: rs(8), paddingLeft: rs(10), borderLeftWidth: 1, borderLeftColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}
            >
              <ScanLine size={rs(18)} color={C.green} strokeWidth={2.2} />
            </TouchableOpacity>
          )}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ backgroundColor: C.bg }}
        contentContainerStyle={[styles.content, { width: '100%', maxWidth: 900, alignSelf: 'center', paddingTop: rs(8) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.green} colors={[C.green]} />}
      >

        {/* Stat cards */}
        <View style={styles.statRow}>
          <StatCard
            label="Total" value={counts.total} caption="Total tasks this month"
            Icon={BriefcaseBusiness} fg="#1C3053" tint={C.purpleTint} wave="#EFE6FD"
            active={filter === 'all'} onPress={() => onStatPress('total')}
          />
          <StatCard
            label="Assigned" value={counts.assigned} caption="Tasks assigned this month"
            Icon={FileText} fg={C.green} tint={C.greenTint} wave="#E5F3F5"
            active={filter === 'assigned'} onPress={() => onStatPress('assigned')}
          />
          <StatCard
            label="Re-Assign" value={counts.reassign} caption="Tasks sent for re-assignment"
            Icon={Users} fg="#FAA700" tint={C.orangeTint} wave="#FDF0DA"
            onPress={() => onStatPress('reassign')}
          />
          <StatCard
            label="Accepted" value={counts.accepted} caption="Tasks accepted by employees"
            Icon={CircleCheck} fg="#0788C9" tint={C.blueTint} wave="#E6EEFD"
            active={filter === 'accepted'} onPress={() => onStatPress('accepted')}
          />
        </View>

        {error && list.length === 0 ? (
          <View style={[styles.card, styles.stateBox]}>
            <CircleAlert size={rs(30)} color={C.red} />
            <Text style={styles.stateTitle}>Couldn't load tasks</Text>
            <Text style={styles.stateText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load()} activeOpacity={0.85}>
              <RefreshCw size={rs(14)} color={C.white} />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Re-assigned tickets awaiting acceptance (no section heading) */}
            <View
              style={styles.sectionPlain}
              onLayout={(e) => { sectionY.current.reassign = e.nativeEvent.layout.y; }}
            >
              <View style={wide ? styles.cardGrid : null}>
              {initialLoading ? null : (
                reassignList.filter((t) => matchesQuery(t, q)).map((t) => {
                  const a = assignInfo[t.id] || {};
                  return (
                    <View key={t.id} style={wide ? styles.cardCell : null}>
                    <ReassignRow
                      key={t.id}
                      ticket={t}
                      byLabel={a.reassigned ? 'Reassigned by' : 'Assigned by'}
                      byName={assignerName(t)}
                      when={a.assignedAt || t.createdAt}
                      busy={actingOn === t.id}
                      onAccept={() => handleAccept(t.id)}
                      onReject={() => handleReject(t.id)}
                      onOpen={() => openTicket(t)}
                      onHistory={() => openHistory(t)}
                    />
                    </View>
                  );
                })
              )}
              </View>
            </View>

            {/* Assigned tasks (no section heading) */}
            <View
              style={styles.sectionPlain}
              onLayout={(e) => { sectionY.current.recent = e.nativeEvent.layout.y; }}
            >
              {filter !== 'all' ? (
                <TouchableOpacity style={styles.filterChip} onPress={() => setFilter('all')} activeOpacity={0.8}>
                  <Text style={styles.filterChipText}>
                    Showing: {filter === 'accepted' ? 'Accepted' : 'Assigned (active)'}
                  </Text>
                  <X size={rs(12)} color={C.green} />
                </TouchableOpacity>
              ) : null}
              {initialLoading ? (
                <ActivityIndicator color={C.green} style={{ marginVertical: 18 }} />
              ) : recentFiltered.length === 0 ? (
                <EmptyRow text={q ? `No jobs match "${query.trim()}".` : `No assigned tasks in ${MONTHS[month - 1]} ${year}.`} />
              ) : (
                <View style={wide ? styles.cardGrid : null}>
                {recentFiltered.map((t) => {
                  const a = assignInfo[t.id] || {};
                  return (
                    <View key={t.id} style={wide ? styles.cardCell : null}>
                    <RecentRow
                      key={t.id}
                      ticket={t}
                      byName={assignerName(t)}
                      byLabel={a.reassigned ? 'Reassigned by' : 'Assigned by'}
                      assignedAt={a.assignedAt || t.createdAt}
                      acceptedAt={a.acceptedAt}
                      onPress={() => openTicket(t)}
                      onLongPress={() => openHistory(t)}
                    />
                    </View>
                  );
                })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <ReviewSheet
        ticket={reviewTicket}
        busy={reviewTicket && actingOn === reviewTicket.id}
        byName={reviewTicket ? assignerName(reviewTicket) : null}
        info={reviewTicket ? assignInfo[reviewTicket.id] : null}
        onClose={() => setReviewTicket(null)}
        onAccept={() => reviewTicket && handleAccept(reviewTicket.id)}
        onReject={() => reviewTicket && handleReject(reviewTicket.id)}
        onOpen={() => { const t = reviewTicket; setReviewTicket(null); if (t) openTicket(t); }}
        onHistory={() => { const t = reviewTicket; setReviewTicket(null); if (t) openHistory(t); }}
      />

      <Modal visible={!!info} transparent animationType="fade" onRequestClose={() => setInfo(null)}>
        <Pressable style={styles.backdropCenter} onPress={() => setInfo(null)}>
          <Pressable style={styles.infoBox} onPress={() => {}}>
            <View style={styles.infoHead}>
              <Info size={rs(18)} color={C.green} />
              <Text style={styles.infoTitle}>{info?.title}</Text>
            </View>
            <Text style={styles.infoBody}>{info?.body}</Text>
            <TouchableOpacity style={styles.infoBtn} onPress={() => setInfo(null)} activeOpacity={0.85}>
              <Text style={styles.infoBtnText}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ---------- building blocks ----------
function StatCard({ label, value, Icon, fg, onPress, active }) {
  return <BadgeIconTile icon={Icon} color={fg} label={label} count={value} active={active} onPress={onPress} size={rs(42)} />;
}

function EmptyRow({ text }) {
  return (
    <View style={styles.emptyRow}>
      <Inbox size={rs(22)} color={C.faint} />
      <Text style={styles.empty}>{text}</Text>
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
function DeviceBadge({ ticket }) {
  const { Icon, fg, bg } = deviceVisual(ticket);
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
  return (
    <View style={[styles.deviceBadge, { backgroundColor: src && !failed ? C.white : bg, overflow: 'hidden' }]}>
      {src && !failed
        ? <Image source={{ uri: src }} style={{ width: rs(30), height: rs(30) }} resizeMode="contain" onError={() => setFailed(true)} />
        : <Icon size={rs(17)} color={fg} strokeWidth={2.2} />}
    </View>
  );
}

function TicketIdentity({ ticket }) {
  return (
    <View style={styles.identity}>
      <Text style={styles.ref} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{ticketRef(ticket)}</Text>
      <Text style={styles.device} numberOfLines={2}>{ticket.deviceDisplayName || 'Device'}</Text>
      <Text style={styles.issue} numberOfLines={2}>
        {ticket.repairServicesSummary || ticket.issueDescription || '—'}
      </Text>
    </View>
  );
}

// "Oppo A5 5G · CPH2753 · 8GB · 128GB" → model name, "CPH2753 - 8GB - 128GB".
function splitDevice(ticket) {
  // Trim every piece (names can carry non-breaking spaces) so all lines start flush left.
  const clean = (x) => String(x).replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '');
  const parts = String(ticket.deviceDisplayName || 'Device').split(/[·•|]/).map(clean).filter(Boolean);
  return { model: parts[0] || 'Device', specs: parts.slice(1).join(' - '), color: clean(ticket.color || '') };
}

function ReassignRow({ ticket, byLabel, byName, when, busy, onAccept, onReject, onOpen, onHistory }) {
  return (
    <TicketCard
      badge={<DeviceBadge ticket={ticket} />}
      refId={ticketRef(ticket)} title={splitDevice(ticket).model} subtitle={splitDevice(ticket).specs || null} subtitle2={splitDevice(ticket).color ? `Colour: ${splitDevice(ticket).color}` : null}
      status="Waiting" statusColor="#FAA700" statusIcon={Clock}
      date={fmtDate(when)} time={fmtTime(when)}
      iconBubble
      rows={[
        [{ icon: Wrench, label: 'Issue', value: ticket.issueDescription || ticket.repairServicesSummary }, null],
      ]}
      aside={(
        // Reject · Accept pills beside the issue. Tap the card for details,
        // long-press it for history.
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.rejectBtn} onPress={onReject} disabled={busy}
            activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Reject job">
            <View style={styles.rejectDot}><X size={rs(12)} color={C.white} strokeWidth={3} /></View>
            <Text style={styles.rejectText}>Job Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} disabled={busy}
            activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Accept job">
            {busy ? <ActivityIndicator color={C.white} size="small" /> : (
              <>
                <View style={styles.acceptDot}><Check size={rs(12)} color={C.green} strokeWidth={3} /></View>
                <Text style={styles.acceptText}>Job Accept</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
      onPress={onOpen}
      onLongPress={onHistory}
    />
  );
}

function statusPill(t) {
  if (isCancelled(t)) return { label: 'Cancelled', fg: C.red, bg: C.redTint, Icon: X };
  if (isAccepted(t)) return { label: 'Accepted', fg: C.green, bg: C.greenTint, Icon: CircleCheck };
  return { label: 'Assigned', fg: C.blue, bg: C.blueTint, Icon: Clock };
}

function RecentRow({ ticket, byLabel, byName, assignedAt, acceptedAt, onPress, onLongPress }) {
  const p = statusPill(ticket);
  // Time range = assigned → accepted when both fall on the same day.
  const range = fmtTime(assignedAt)
    ? (acceptedAt && sameDay(assignedAt, acceptedAt) ? `${fmtTime(assignedAt)} - ${fmtTime(acceptedAt)}` : fmtTime(assignedAt))
    : '';
  return (
    <TicketCard
      badge={<DeviceBadge ticket={ticket} />}
      refId={ticketRef(ticket)} title={splitDevice(ticket).model} subtitle={splitDevice(ticket).specs || null} subtitle2={splitDevice(ticket).color ? `Colour: ${splitDevice(ticket).color}` : null}
      status={p.label} statusColor={p.fg} statusIcon={p.Icon}
      date={fmtDate(assignedAt)} time={range}
      iconBubble
      rows={[
        [{ icon: Wrench, label: 'Issue', value: ticket.issueDescription || ticket.repairServicesSummary }, null],
      ]}
      onPress={onPress} onLongPress={onLongPress}
    />
  );
}

function ReviewSheet({ ticket, busy, byName, info, onClose, onAccept, onReject, onOpen, onHistory }) {
  const visible = !!ticket;
  const when = info?.assignedAt || ticket?.createdAt;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {ticket ? (
            <>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Review Request</Text>
                <TouchableOpacity onPress={onClose} hitSlop={10}>
                  <X size={rs(20)} color={C.muted} />
                </TouchableOpacity>
              </View>
              <View style={styles.sheetTicket}>
                <DeviceBadge ticket={ticket} />
                <TicketIdentity ticket={ticket} />
              </View>
              <View style={styles.sheetMeta}>
                {byName ? (
                  <Text style={styles.sheetMetaText}>
                    {info?.reassigned ? 'Reassigned by ' : 'Assigned by '}
                    <Text style={{ fontWeight: '700', color: C.ink }}>{byName}</Text>
                  </Text>
                ) : null}
                <Text style={styles.sheetMetaText}>{fmtDate(when)}{fmtTime(when) ? ` · ${fmtTime(when)}` : ''}</Text>
                {ticket.estimatedDeliveryAt || ticket.estimatedReadyAt ? (
                  <Text style={styles.sheetMetaText}>Due: {fmtDate(ticket.estimatedDeliveryAt || ticket.estimatedReadyAt)}</Text>
                ) : null}
                {ticket.issueDescription && ticket.repairServicesSummary ? (
                  <Text style={styles.sheetMetaText} numberOfLines={3}>Issue: {ticket.issueDescription}</Text>
                ) : null}
              </View>
              <View style={styles.sheetActions}>
                <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: C.red }]} onPress={onReject} disabled={busy} activeOpacity={0.85}>
                  <Text style={styles.sheetBtnText}>Not Accepted</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: C.green }]} onPress={onAccept} disabled={busy} activeOpacity={0.85}>
                  {busy ? <ActivityIndicator color={C.white} size="small" /> : <Text style={styles.sheetBtnText}>Accept</Text>}
                </TouchableOpacity>
              </View>
              <View style={styles.sheetLinks}>
                <TouchableOpacity onPress={onOpen} style={styles.sheetLink} activeOpacity={0.8}>
                  <Text style={styles.sheetLinkText}>View Details</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onHistory} style={styles.sheetLink} activeOpacity={0.8}>
                  <Text style={styles.sheetLinkText}>History</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: rs(10), backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingHorizontal: rs(14), paddingVertical: rs(10) },
  headerBack: { width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: rf(17), fontWeight: '800', color: '#1C3053', textAlign: 'center' },

  headerSub: { fontSize: rf(12), color: '#6B7280', marginTop: 1, textAlign: 'center' },

  content: { paddingHorizontal: rs(12), paddingTop: 4, paddingBottom: 24 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cardCell: { width: '49%' },

  card: { backgroundColor: C.white, borderRadius: 18, ...shadow },
  // Section without its own box, so each task card stands on its own.
  sectionPlain: {},

  monthCard: { flexDirection: 'row', alignItems: 'center', padding: 14, overflow: 'hidden', marginBottom: 12 },
  monthLeft: { flex: 1, minWidth: 0 },
  monthTitle: { fontSize: rf(16), fontWeight: '800', color: C.ink },
  monthSub: { fontSize: rf(12), color: C.muted, marginTop: 2 },
  monthPill: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
    backgroundColor: C.greenSoft, borderWidth: 1, borderColor: '#E5F3F5', borderRadius: 999,
    paddingVertical: 7, paddingHorizontal: 6,
  },
  monthArrow: { paddingHorizontal: 6 },
  monthPillMid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  monthPillText: { fontSize: rf(14), fontWeight: '800', color: C.green },
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: '#E8F7EC' },
  calBody: { position: 'absolute', left: 0, backgroundColor: C.white, borderWidth: 1, borderColor: '#E5F3F5', overflow: 'hidden', ...shadow },
  calTop: { backgroundColor: '#035C6C' },
  calGrid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  calGridRow: { flexDirection: 'row' },
  calRing: { position: 'absolute', top: 0, backgroundColor: '#035C6C' },

  statRow: { flexDirection: 'row', gap: rs(4), marginBottom: rs(10), backgroundColor: '#FFFFFF', borderRadius: rs(16), borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: rs(10), paddingHorizontal: rs(6) },
  statCard: {
    flex: 1, minWidth: 0, backgroundColor: C.white, borderRadius: 14, paddingHorizontal: 7, paddingTop: 7, paddingBottom: 8,
    borderWidth: 1, borderColor: 'transparent', overflow: 'hidden', ...shadow,
  },
  wave: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  statIcon: { width: rs(26), height: rs(26), borderRadius: rs(13), alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: rf(12), color: C.ink, fontWeight: '500', marginTop: 4 },
  statValue: { fontSize: rf(18), fontWeight: '800', color: C.ink, marginTop: 1 },
  statCaption: { fontSize: rf(9.5), color: C.muted, lineHeight: rf(12.5), marginTop: 2 },

  perfCard: { padding: 10, marginBottom: 10 },
  perfCardWide: { flexDirection: 'row', alignItems: 'center' },
  perfHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundIcon: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: 'center', justifyContent: 'center' },
  perfTitle: { fontSize: rf(16), fontWeight: '800', color: C.ink },
  perfSub: { fontSize: rf(12), color: C.muted, marginTop: 1 },
  hDivider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  vDivider: { width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: 10 },
  vDividerSm: { width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: 8 },
  perfMetrics: { flexDirection: 'row', alignItems: 'center' },
  metric: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricLabel: { fontSize: rf(10.5), color: C.ink, flexShrink: 1 },
  metricFoot: { fontSize: rf(10), color: C.muted, marginTop: 3 },
  metricValue: { fontSize: rf(15), fontWeight: '800', color: C.ink, marginTop: 2 },
  ringText: { fontSize: rf(12), fontWeight: '800', color: C.ink },

  section: { padding: 10, marginBottom: 10 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'flex-start' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
  sectionBar: { width: 4, height: rf(18), borderRadius: 2, backgroundColor: C.green, marginRight: 8 },
  sectionTitle: { fontSize: rf(16), fontWeight: '800', color: C.ink, flexShrink: 1 },
  sectionSub: { fontSize: rf(12), color: C.muted, marginTop: 2, marginLeft: 12 },
  viewAll: {
    flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: C.border,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.white,
  },
  viewAllText: { fontSize: rf(11), fontWeight: '600', color: C.ink },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    backgroundColor: C.greenTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8,
  },
  filterChipText: { fontSize: rf(10.5), fontWeight: '700', color: C.green },

  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, paddingVertical: 7, paddingHorizontal: 7, marginBottom: 6,
  },
  deviceBadge: { width: rs(32), height: rs(32), borderRadius: rs(16), alignItems: 'center', justifyContent: 'center', marginRight: 6, borderWidth: 1, borderColor: C.border },
  identity: { flex: 1.35, minWidth: 0 },
  ref: { fontSize: rf(12), fontWeight: '800', color: C.ink },
  device: { fontSize: rf(11), color: C.ink, marginTop: 2 },
  issue: { fontSize: rf(9.5), color: C.muted, marginTop: 1 },
  colDivider: { width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: 5 },
  byCol: { flex: 1, minWidth: 0 },
  byRow: { flexDirection: 'row', alignItems: 'flex-start' },
  byIcon: { marginRight: 4, marginTop: 1 },
  byLabel: { fontSize: rf(8.5), color: C.muted },
  byName: { fontSize: rf(10), color: C.ink, fontWeight: '600' },
  byDate: { fontSize: rf(9.5), color: C.muted },
  rightCol: { width: rs(72), alignItems: 'center', marginLeft: 4, gap: 4 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999,
    paddingHorizontal: 5, paddingVertical: 3, alignSelf: 'stretch', justifyContent: 'center',
  },
  pillText: { fontSize: rf(10), fontWeight: '700' },
  reviewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, alignSelf: 'stretch',
    backgroundColor: C.greenTint, borderRadius: 999, paddingVertical: 4, minHeight: 26,
  },
  reviewText: { fontSize: rf(11), fontWeight: '800', color: C.green },
  due: { fontSize: rf(9), color: C.muted, textAlign: 'center' },

  emptyRow: { alignItems: 'center', paddingVertical: 14, gap: 6 },
  empty: { fontSize: rf(11.5), color: C.muted, textAlign: 'center' },

  stateBox: { alignItems: 'center', padding: 20, marginBottom: 12, gap: 6 },
  stateTitle: { fontSize: rf(14), fontWeight: '800', color: C.ink },
  stateText: { fontSize: rf(11.5), color: C.muted, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.green,
    borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8, marginTop: 6,
  },
  retryText: { color: C.white, fontWeight: '700', fontSize: rf(12) },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  backdropCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 28 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginBottom: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: rf(16), fontWeight: '800', color: C.ink },
  sheetTicket: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 14, padding: 10 },
  sheetMeta: { marginTop: 10, gap: 4 },
  sheetMetaText: { fontSize: rf(12), color: C.muted },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sheetBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  sheetBtnText: { color: C.white, fontSize: rf(13.5), fontWeight: '800' },
  sheetLinks: { flexDirection: 'row', gap: 10, marginTop: 10 },
  sheetLink: { flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  sheetLinkText: { color: C.ink, fontSize: rf(12.5), fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: rs(8) },
  rejectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: rs(6),
    backgroundColor: '#FDECEC', borderWidth: 1, borderColor: '#F9C9C7', borderRadius: rs(12),
    paddingVertical: rs(6), paddingLeft: rs(6), paddingRight: rs(10),
  },
  rejectDot: { width: rs(22), height: rs(22), borderRadius: rs(11), backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },
  rejectText: { color: C.red, fontSize: rf(12), fontWeight: '700' },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6), minWidth: rs(84),
    backgroundColor: C.green, borderRadius: rs(12),
    paddingVertical: rs(6), paddingLeft: rs(6), paddingRight: rs(10),
    shadowColor: C.green, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  acceptDot: { width: rs(22), height: rs(22), borderRadius: rs(11), backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  acceptText: { color: C.white, fontSize: rf(12), fontWeight: '700' },

  infoBox: { backgroundColor: C.white, borderRadius: 18, padding: 18 },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  infoTitle: { fontSize: rf(15), fontWeight: '800', color: C.ink },
  infoBody: { fontSize: rf(12.5), color: C.muted, lineHeight: rf(18) },
  infoBtn: { marginTop: 14, alignSelf: 'flex-end', backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  infoBtnText: { color: C.white, fontWeight: '700', fontSize: rf(12.5) },
});
