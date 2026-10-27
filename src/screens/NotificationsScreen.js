import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/Typography';
import { useFocusEffect } from '@react-navigation/native';
import {
  Bell, Wrench, CalendarCheck2, CalendarX2, CalendarClock, Timer,
  ShieldCheck, BadgeCheck, CircleCheck, CircleX, RefreshCw, FileText,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { listMyTickets } from '../api/tickets';
import { getMyTechnicianProfile, getMyLeaves } from '../api/technician';
import { rf } from '../utils/responsive';

const FILTERS = ['All', 'Jobs', 'Attendance'];
const POLL_MS = 15000; // refresh while the screen is open so status changes show quickly

// Near G Fix palette, same as Home / Ticket Detail.
const C = {
  green: '#035C6C', greenTint: '#E5F3F5', greenSoft: '#E5F3F5', greenLine: '#E5F3F5',
  red: '#F32C26', redTint: '#FEECEC', yellowTint: '#FDF6E0', yellowInk: '#FAA700',
  ink: '#111111', muted: '#6B7280', faint: '#A3A3A3', bg: '#F3F4F6', border: '#E5E7EB',
  blue: '#0788C9', blueTint: '#E6F3FA', navy: '#1C3053', navyTint: '#E8EBF0',
  lime: '#609138', limeTint: '#EEF4E9', line: '#F0F1F3',
};
const READ_KEY = 'notifications.read.v1';

// No technician-side notifications endpoint exists yet, so we synthesise
// entries from data the app already loads — assigned tickets and leave
// requests. Read-state is stored locally; this trades server-truth for
// a working feed without a backend change. When a proper endpoint lands,
// swap `buildItems` for a fetch and keep the same render layer.

// "2 minutes ago", "3 hours ago", "1 day ago"; a date after a week.
const ago = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  const unit = (n, w) => `${n} ${w}${n === 1 ? '' : 's'} ago`;
  if (s < 60) return 'Just now';
  if (s < 3600) return unit(Math.floor(s / 60), 'minute');
  if (s < 86400) return unit(Math.floor(s / 3600), 'hour');
  if (s < 604800) return unit(Math.floor(s / 86400), 'day');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const ticketRef = (t) => {
  if (t.trackingId) return `#${t.trackingId}`;
  return `#${String(t.id || '').replace(/-/g, '').slice(0, 12).toUpperCase()}`;
};

// Ticket status → notification title and the detail after the ref.
const TICKET_UPDATE = {
  IN_DIAGNOSIS: { title: 'Job Status Updated', detail: 'In diagnosis', tone: 'blue' },
  QUOTED: { title: 'Re-estimate Sent', detail: 'Awaiting customer approval', tone: 'orange' },
  APPROVED: { title: 'Customer Approved', detail: 'Re-estimate approved', tone: 'green' },
  IN_REPAIR: { title: 'Job Status Updated', detail: 'Repair in progress', tone: 'blue' },
  READY: { title: 'Job Status Updated', detail: 'Moved to Ready for Delivery', tone: 'done' },
  INVOICE_GENERATED: { title: 'Job Status Updated', detail: 'Invoice generated', tone: 'done' },
  DELIVERED: { title: 'Job Status Updated', detail: 'Delivered to customer', tone: 'done' },
  CANCELLED: { title: 'Job Cancelled', detail: 'Work cancelled', tone: 'red' },
};

function ticketNotification(t) {
  const status = String(t.status || '').toUpperCase();
  const ref = ticketRef(t).replace(/^#/, '');
  const device = String(t.deviceDisplayName || [t.brandName, t.modelName].filter(Boolean).join(' ') || '')
    .split(/[·•|]/)[0].trim();
  // Not yet accepted (and still open) → a fresh assignment.
  const fresh = !t.technicianAcceptedAt && !['READY', 'DELIVERED', 'CANCELLED'].includes(status);
  const upd = fresh ? null : TICKET_UPDATE[status];
  const title = upd ? upd.title : 'New Job Assigned';
  const detail = upd ? upd.detail : device;
  return {
    // Id formula unchanged so markNotificationsSeen / saved read-state still match.
    id: `ticket:${t.id}:${t.updatedAt || t.createdAt || ''}`,
    kind: 'ticket',
    tone: upd ? upd.tone : 'new',
    title,
    body: [ref, detail].filter(Boolean).join(' · '),
    createdAt: t.updatedAt || t.createdAt,
    ticketId: t.id,
  };
}

function leaveNotification(l) {
  const status = String(l.status || 'PROCESSING').toUpperCase();
  const dateLabel = l.startDate
    ? new Date(l.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  // Permission requests (leaveType PERMISSION) are their own notification kind.
  const isPermission = String(l.leaveType || '').toUpperCase() === 'PERMISSION';
  const noun = isPermission ? 'Permission' : 'Leave';
  let title = `${noun} Requested`;
  if (status === 'APPROVED') title = `${noun} Approved`;
  else if (status === 'REJECTED') title = `${noun} Rejected`;
  // Order/stamp a decided leave by its decision time (the DTO exposes
  // approvedAt / rejectedAt, not decidedAt/createdAt); pending falls back to
  // when it was requested.
  const decidedAt = status === 'APPROVED' ? l.approvedAt : status === 'REJECTED' ? l.rejectedAt : null;
  return {
    id: `leave:${l.id}:${status}`,
    kind: isPermission ? 'permission' : 'leave',
    leaveStatus: status,
    title,
    body: dateLabel ? `${dateLabel}${l.reason ? ` · ${l.reason}` : ''}` : (l.reason || `${noun} request`),
    createdAt: decidedAt || l.requestedAt || l.createdAt || l.startDate,
  };
}

async function loadReadIds() {
  try {
    const raw = await AsyncStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}

// One feed builder for the screen and the Home bell badge. `failed` is true
// only when every source errored — then the screen shows Retry instead of a
// misleading "all caught up".
async function buildFeed() {
  let failures = 0;
  const [page, me] = await Promise.all([
    listMyTickets({ page: 0, size: 20 }).catch(() => { failures += 1; return null; }),
    getMyTechnicianProfile().catch(() => null),
  ]);
  const tickets = Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []);
  let leaves = [];
  if (me?.id) {
    const res = await getMyLeaves(me.id).catch(() => { failures += 1; return []; });
    leaves = Array.isArray(res) ? res : (Array.isArray(res?.content) ? res.content : []);
  } else {
    failures += 1;
  }
  const items = [
    ...tickets.map(ticketNotification),
    ...leaves.map(leaveNotification),
  ].filter((n) => n.createdAt);
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { items, failed: failures >= 2 && items.length === 0 };
}

async function saveReadIds(set) {
  try { await AsyncStorage.setItem(READ_KEY, JSON.stringify([...set])); } catch {}
}

export default function NotificationsScreen({ navigation }) {
  const [filter, setFilter] = useState('All');
  const [items, setItems] = useState([]);
  const [readIds, setReadIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    const [{ items: feed, failed }, persistedRead] = await Promise.all([buildFeed(), loadReadIds()]);
    setItems(feed);
    setLoadFailed(failed);
    // Show what was new on this visit (highlighted), but persist everything as
    // read right away — opening the feed reads it; no manual action needed.
    setReadIds(persistedRead);
    if (feed.length) saveReadIds(new Set([...persistedRead, ...feed.map((n) => n.id)].slice(-800)));
  }, []);

  // Always clear the spinner once a load settles — gating it on the focus
  // effect's 'active' flag left it spinning forever when the screen was
  // re-focused mid-load (the newer pass never reset it).
  useFocusEffect(useCallback(() => {
    load().finally(() => setLoading(false));
    const t = setInterval(() => { load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const markRead = (id) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveReadIds(next);
      return next;
    });
  };

  const onOpen = (n) => {
    markRead(n.id);
    if (n.kind === 'ticket' && n.ticketId) {
      navigation.navigate('TechnicianTicketDetail', { ticketId: n.ticketId });
    } else if (n.kind === 'leave') {
      navigation.navigate('LeaveReport');
    } else if (n.kind === 'permission') {
      navigation.navigate('LeaveReport', { type: 'PERMISSION' });
    }
  };

  const visible = useMemo(() => {
    if (filter === 'All') return items;
    // Jobs = ticket updates; Attendance = leave and permission requests.
    return items.filter((n) => (filter === 'Jobs' ? n.kind === 'ticket' : n.kind !== 'ticket'));
  }, [items, filter]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: C.bg }}>
        <ActivityIndicator color={C.green} />
        <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 8 }}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Filter chips: teal when selected, light grey otherwise; scrolls sideways if needed. */}
      <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: C.line }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{ paddingHorizontal: 18, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? C.green : C.bg }}
              >
                <Text style={{ fontSize: rf(13), fontWeight: active ? '700' : '600', color: active ? '#FFFFFF' : C.navy }}>{f}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      {visible.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green} colors={[C.green]} />}
        >
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: loadFailed ? C.redTint : C.greenTint, alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={26} color={loadFailed ? C.red : C.green} />
          </View>
          <Text style={{ fontSize: rf(16), fontWeight: '800', color: C.navy, marginTop: 12 }}>
            {loadFailed ? "Couldn't load notifications" : "You're all caught up"}
          </Text>
          <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 4, textAlign: 'center' }}>
            {loadFailed ? 'Check your connection and try again.' : "We'll show job updates and attendance requests here."}
          </Text>
          {loadFailed ? (
            <TouchableOpacity onPress={onRefresh} activeOpacity={0.85} style={{ marginTop: 14, backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8 }}>
              <Text style={{ fontSize: rf(13), fontWeight: '700', color: '#FFFFFF' }}>{refreshing ? 'Retrying…' : 'Retry'}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green} colors={[C.green]} />}
        >
          {/* One row per notification: tinted icon square · title, ref · detail,
              time ago · blue dot while unread. */}
          {visible.map((n) => {
            const read = readIds.has(n.id);
            const { Icon, color, bg } = iconFor(n);
            return (
              <TouchableOpacity
                key={n.id}
                onPress={() => onOpen(n)}
                activeOpacity={0.7}
                accessibilityLabel={`${n.title}. ${n.body || ''}${read ? '' : '. New'}`}
                style={{
                  flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
                  borderBottomWidth: 1, borderBottomColor: C.line,
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Icon size={19} color={color} strokeWidth={2.3} />
                </View>
                <View className="flex-1">
                  <Text style={{ fontSize: rf(14), fontWeight: '700', color: C.ink }} numberOfLines={1}>{n.title}</Text>
                  {n.body ? <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 2 }} numberOfLines={2}>{n.body}</Text> : null}
                  <Text style={{ fontSize: rf(11), color: C.faint, marginTop: 2 }}>{ago(n.createdAt)}</Text>
                </View>
                {!read ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.blue, marginLeft: 10 }} /> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function iconFor(n) {
  if (n.kind === 'permission') {
    if (n.leaveStatus === 'APPROVED') return { Icon: Timer, color: C.lime, bg: C.limeTint };
    if (n.leaveStatus === 'REJECTED') return { Icon: Timer, color: C.red, bg: C.redTint };
    return { Icon: Timer, color: C.yellowInk, bg: C.yellowTint };
  }
  if (n.kind === 'leave') {
    if (n.leaveStatus === 'APPROVED') return { Icon: CalendarCheck2, color: C.lime, bg: C.limeTint };
    if (n.leaveStatus === 'REJECTED') return { Icon: CalendarX2, color: C.red, bg: C.redTint };
    return { Icon: CalendarClock, color: C.yellowInk, bg: C.yellowTint };
  }
  // Job updates, by tone.
  if (n.tone === 'new') return { Icon: ShieldCheck, color: C.blue, bg: C.blueTint };
  if (n.tone === 'green') return { Icon: BadgeCheck, color: C.lime, bg: C.limeTint };
  if (n.tone === 'done') return { Icon: CircleCheck, color: C.lime, bg: C.limeTint };
  if (n.tone === 'orange') return { Icon: FileText, color: C.yellowInk, bg: C.yellowTint };
  if (n.tone === 'red') return { Icon: CircleX, color: C.red, bg: C.redTint };
  if (n.tone === 'blue') return { Icon: RefreshCw, color: C.blue, bg: C.blueTint };
  return { Icon: Wrench, color: C.navy, bg: C.navyTint };
}

// Auto-read: screens that SHOW a ticket / leave call this with the records
// they displayed, so the matching notification is marked read without the
// user opening the Notifications screen. Ids mirror ticketNotification /
// leaveNotification exactly.
export async function markNotificationsSeen({ tickets = [], leaves = [] } = {}) {
  const ids = [
    ...tickets.filter((t) => t?.id).map((t) => ticketNotification(t).id),
    ...leaves.filter((l) => l?.id).map((l) => leaveNotification(l).id),
  ];
  if (!ids.length) return;
  const set = await loadReadIds();
  let changed = false;
  ids.forEach((id) => { if (!set.has(id)) { set.add(id); changed = true; } });
  if (!changed) return;
  // Cap the stored set so it can't grow forever (newest additions kept).
  await saveReadIds(new Set([...set].slice(-800)));
}

// Lightweight helper exported so the HomeScreen bell badge can stay in sync
// with the same data the screen renders, without duplicating the derivation.
export async function loadUnreadNotificationCount() {
  try {
    const [{ items }, persistedRead] = await Promise.all([buildFeed(), loadReadIds()]);
    return items.reduce((sum, n) => sum + (persistedRead.has(n.id) ? 0 : 1), 0);
  } catch { return 0; }
}
