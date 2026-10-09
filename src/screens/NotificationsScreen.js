import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Bell, Wrench, CalendarCheck2, CalendarX2, CalendarClock, CheckCircle2,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { listMyTickets } from '../api/tickets';
import { getMyTechnicianProfile, getMyLeaves } from '../api/technician';
import { rf } from '../utils/responsive';

const FILTERS = ['All', 'Tickets', 'Leave'];

// GGFIX palette, same as Home / Ticket Detail.
const C = {
  green: '#09AD2A', greenTint: '#E6F7EA', greenSoft: '#F3FBF4', greenLine: '#CFEFD6',
  red: '#F84141', redTint: '#FEECEC', yellowTint: '#FDF6E0', yellowInk: '#8A6700',
  ink: '#1E1E1E', muted: '#6E6E6E', faint: '#A3A3A3', bg: '#F8F8F8', border: '#ECECEC',
};
const READ_KEY = 'notifications.read.v1';

// No technician-side notifications endpoint exists yet, so we synthesise
// entries from data the app already loads — assigned tickets and leave
// requests. Read-state is stored locally; this trades server-truth for
// a working feed without a backend change. When a proper endpoint lands,
// swap `buildItems` for a fetch and keep the same render layer.

const ago = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return 'Yesterday';
  return d.toLocaleDateString();
};

const ticketRef = (t) => {
  if (t.trackingId) return `#${t.trackingId}`;
  return `#${String(t.id || '').replace(/-/g, '').slice(0, 12).toUpperCase()}`;
};

function ticketNotification(t) {
  const status = String(t.status || '').toUpperCase();
  const summary = t.repairServicesSummary
    ? `${t.deviceDisplayName || 'Device'} — ${t.repairServicesSummary}`
    : (t.deviceDisplayName || 'New ticket');
  let title = `Ticket assigned ${ticketRef(t)}`;
  let body = summary;
  if (status === 'IN_DIAGNOSIS') title = `Diagnosis in progress ${ticketRef(t)}`;
  else if (status === 'QUOTED') title = `Quotation pending ${ticketRef(t)}`;
  else if (status === 'APPROVED') title = `Customer approved ${ticketRef(t)}`;
  else if (status === 'IN_REPAIR') title = `Repair in progress ${ticketRef(t)}`;
  else if (status === 'READY') title = `Repair complete ${ticketRef(t)}`;
  return {
    id: `ticket:${t.id}:${t.updatedAt || t.createdAt || ''}`,
    kind: 'ticket',
    title,
    body,
    createdAt: t.updatedAt || t.createdAt,
    ticketId: t.id,
  };
}

function leaveNotification(l) {
  const status = String(l.status || 'PROCESSING').toUpperCase();
  const dateLabel = l.startDate
    ? new Date(l.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  let title = 'Leave requested';
  if (status === 'APPROVED') title = 'Leave approved';
  else if (status === 'REJECTED') title = 'Leave rejected';
  // Order/stamp a decided leave by its decision time (the DTO exposes
  // approvedAt / rejectedAt, not decidedAt/createdAt); pending falls back to
  // when it was requested.
  const decidedAt = status === 'APPROVED' ? l.approvedAt : status === 'REJECTED' ? l.rejectedAt : null;
  return {
    id: `leave:${l.id}:${status}`,
    kind: 'leave',
    leaveStatus: status,
    title,
    body: dateLabel ? `${dateLabel}${l.reason ? ` — ${l.reason}` : ''}` : (l.reason || 'Leave request'),
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
    setReadIds(persistedRead);
  }, []);

  // Always clear the spinner once a load settles — gating it on the focus
  // effect's 'active' flag left it spinning forever when the screen was
  // re-focused mid-load (the newer pass never reset it).
  useFocusEffect(useCallback(() => {
    load().finally(() => setLoading(false));
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
    }
  };

  const onMarkAll = () => {
    // Keep only ids still in the feed so the stored set doesn't grow forever.
    const next = new Set(items.map((n) => n.id));
    setReadIds(next);
    saveReadIds(next);
  };

  const visible = useMemo(() => {
    if (filter === 'All') return items;
    const want = filter === 'Tickets' ? 'ticket' : 'leave';
    return items.filter((n) => n.kind === want);
  }, [items, filter]);

  const unreadCount = useMemo(
    () => items.reduce((sum, n) => sum + (readIds.has(n.id) ? 0 : 1), 0),
    [items, readIds],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: C.bg }}>
        <ActivityIndicator color={C.green} />
        <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 8 }}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: C.bg }}>
      {/* Filter chips */}
      <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', gap: 6 }}>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              activeOpacity={0.8}
              style={{
                paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                backgroundColor: active ? C.green : '#FFFFFF', borderColor: active ? C.green : C.border,
              }}
            >
              <Text style={{ fontSize: rf(12), fontWeight: active ? '700' : '600', color: active ? '#FFFFFF' : C.muted }}>{f}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {visible.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green} colors={[C.green]} />}
        >
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: loadFailed ? C.redTint : C.greenTint, alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={26} color={loadFailed ? C.red : C.green} />
          </View>
          <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.ink, marginTop: 12 }}>
            {loadFailed ? "Couldn't load notifications" : "You're all caught up"}
          </Text>
          <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 4, textAlign: 'center' }}>
            {loadFailed ? 'Check your connection and try again.' : "We'll show ticket assignments and leave updates here."}
          </Text>
          {loadFailed ? (
            <TouchableOpacity onPress={onRefresh} activeOpacity={0.85} style={{ marginTop: 14, backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8 }}>
              <Text style={{ fontSize: rf(13), fontWeight: '700', color: '#FFFFFF' }}>{refreshing ? 'Retrying…' : 'Retry'}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green} colors={[C.green]} />}
        >
          <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 2, marginBottom: 8 }}>
            <Text style={{ fontSize: rf(11.5), color: C.muted }}>
              {visible.length} notification{visible.length === 1 ? '' : 's'}
              {unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
            </Text>
            {unreadCount > 0 ? (
              <TouchableOpacity onPress={onMarkAll} activeOpacity={0.7} className="flex-row items-center">
                <CheckCircle2 size={14} color={C.green} />
                <Text style={{ fontSize: rf(11.5), fontWeight: '700', color: C.green, marginLeft: 4 }}>Mark all read</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {visible.map((n) => {
            const read = readIds.has(n.id);
            const { Icon, color, bg } = iconFor(n);
            return (
              <TouchableOpacity
                key={n.id}
                onPress={() => onOpen(n)}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row', alignItems: 'flex-start', backgroundColor: read ? '#FFFFFF' : C.greenSoft,
                  borderRadius: 12, borderWidth: 1, borderColor: read ? C.border : C.greenLine,
                  padding: 10, marginBottom: 8,
                }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Icon size={16} color={color} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text style={{ flex: 1, fontSize: rf(12.5), fontWeight: '800', color: C.ink }} numberOfLines={1}>{n.title}</Text>
                    {!read ? (
                      <View style={{ backgroundColor: C.green, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 6 }}>
                        <Text style={{ fontSize: rf(9), fontWeight: '800', color: '#FFFFFF' }}>NEW</Text>
                      </View>
                    ) : null}
                  </View>
                  {n.body ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2, lineHeight: rf(16) }}>{n.body}</Text> : null}
                  <Text style={{ fontSize: rf(10), color: C.faint, marginTop: 4 }}>{ago(n.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function iconFor(n) {
  if (n.kind === 'leave') {
    if (n.leaveStatus === 'APPROVED') return { Icon: CalendarCheck2, color: C.green, bg: C.greenTint };
    if (n.leaveStatus === 'REJECTED') return { Icon: CalendarX2, color: C.red, bg: C.redTint };
    return { Icon: CalendarClock, color: C.yellowInk, bg: C.yellowTint };
  }
  return { Icon: Wrench, color: C.ink, bg: '#F3F3F3' };
}

// Lightweight helper exported so the HomeScreen bell badge can stay in sync
// with the same data the screen renders, without duplicating the derivation.
export async function loadUnreadNotificationCount() {
  try {
    const [{ items }, persistedRead] = await Promise.all([buildFeed(), loadReadIds()]);
    return items.reduce((sum, n) => sum + (persistedRead.has(n.id) ? 0 : 1), 0);
  } catch { return 0; }
}
