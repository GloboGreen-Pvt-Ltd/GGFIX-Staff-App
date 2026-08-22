import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Bell, Wrench, CalendarCheck2, CalendarX2, CalendarClock, CheckCircle2,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card, EmptyState, Badge, Chip, Loader } from '../components/rnr';
import { listMyTickets } from '../api/tickets';
import { getMyTechnicianProfile, getMyLeaves } from '../api/technician';
import { rf } from '../utils/responsive';

const FILTERS = ['All', 'Tickets', 'Leave'];
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
    createdAt: decidedAt || l.requestedAt,
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

async function saveReadIds(set) {
  try { await AsyncStorage.setItem(READ_KEY, JSON.stringify([...set])); } catch {}
}

export default function NotificationsScreen({ navigation }) {
  const [filter, setFilter] = useState('All');
  const [items, setItems] = useState([]);
  const [readIds, setReadIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [page, me, persistedRead] = await Promise.all([
      listMyTickets({ page: 0, size: 20 }).catch(() => null),
      getMyTechnicianProfile().catch(() => null),
      loadReadIds(),
    ]);
    const tickets = Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []);
    let leaves = [];
    if (me?.id) {
      leaves = await getMyLeaves(me.id).catch(() => []);
      if (!Array.isArray(leaves)) leaves = [];
    }
    const merged = [
      ...tickets.map(ticketNotification),
      ...leaves.map(leaveNotification),
    ].filter((n) => n.createdAt);
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setItems(merged);
    setReadIds(persistedRead);
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => { await load(); if (active) setLoading(false); })();
    return () => { active = false; };
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
    const next = new Set(readIds);
    items.forEach((n) => next.add(n.id));
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

  if (loading) return <Loader label="Loading notifications..." />;

  return (
    <View className="flex-1 bg-background">
      <View className="bg-card border-b border-border px-3 py-3 flex-row flex-wrap">
        {FILTERS.map((f) => (
          <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      {visible.length === 0 ? (
        <EmptyState
          icon={<Bell size={28} color="#00008B" />}
          title="You're all caught up"
          description="We'll show ticket assignments and leave updates here."
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00008B" />}
        >
          <View className="flex-row items-center justify-between px-1 mb-2">
            <Text className="text-text-muted" style={{ fontSize: rf(12) }}>
              {visible.length} notification{visible.length === 1 ? '' : 's'}
              {unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
            </Text>
            {unreadCount > 0 ? (
              <Pressable onPress={onMarkAll} className="flex-row items-center active:opacity-70">
                <CheckCircle2 size={14} color="#00008B" />
                <Text className="font-bold text-primary ml-1" style={{ fontSize: rf(12) }}>Mark all read</Text>
              </Pressable>
            ) : null}
          </View>
          {visible.map((n) => {
            const read = readIds.has(n.id);
            const { Icon, color, bgClass } = iconFor(n);
            return (
              <Pressable key={n.id} onPress={() => onOpen(n)} className="active:opacity-80">
                <Card className={`mb-2 rounded-2xl ${!read ? 'border-primary/30' : ''}`} padded>
                  <View className="flex-row items-start">
                    <View className={`h-10 w-10 rounded-full items-center justify-center mr-3 ${bgClass}`}>
                      <Icon size={18} color={color} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text className="font-extrabold text-text flex-1" style={{ fontSize: rf(13) }} numberOfLines={1}>{n.title}</Text>
                        {!read ? <Badge variant="softPrimary">NEW</Badge> : null}
                      </View>
                      {n.body ? <Text className="text-text-muted mt-1 leading-5" style={{ fontSize: rf(12) }}>{n.body}</Text> : null}
                      <Text className="text-text-muted mt-1.5" style={{ fontSize: rf(10) }}>{ago(n.createdAt)}</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function iconFor(n) {
  if (n.kind === 'leave') {
    if (n.leaveStatus === 'APPROVED') return { Icon: CalendarCheck2, color: '#004C40', bgClass: 'bg-success/10' };
    if (n.leaveStatus === 'REJECTED') return { Icon: CalendarX2, color: '#DC2626', bgClass: 'bg-danger/10' };
    return { Icon: CalendarClock, color: '#F59E0B', bgClass: 'bg-warning/10' };
  }
  return { Icon: Wrench, color: '#00008B', bgClass: 'bg-primary/10' };
}

// Lightweight helper exported so the HomeScreen bell badge can stay in sync
// with the same data the screen renders, without duplicating the derivation.
export async function loadUnreadNotificationCount() {
  try {
    const [page, me, persistedRead] = await Promise.all([
      listMyTickets({ page: 0, size: 20 }).catch(() => null),
      getMyTechnicianProfile().catch(() => null),
      loadReadIds(),
    ]);
    const tickets = Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []);
    let leaves = [];
    if (me?.id) {
      leaves = await getMyLeaves(me.id).catch(() => []);
      if (!Array.isArray(leaves)) leaves = [];
    }
    const ids = [
      ...tickets.map(ticketNotification),
      ...leaves.map(leaveNotification),
    ].filter((n) => n.createdAt).map((n) => n.id);
    return ids.reduce((sum, id) => sum + (persistedRead.has(id) ? 0 : 1), 0);
  } catch { return 0; }
}
