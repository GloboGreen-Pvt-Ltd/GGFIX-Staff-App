import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { markNotificationsSeen } from './NotificationsScreen';
import { View, StyleSheet, ScrollView, TouchableOpacity, Pressable, ActivityIndicator, RefreshControl, Modal, Linking, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  Ban,
  BriefcaseMedical,
  Calendar,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Paperclip,
  TreePalm,
  X,
} from 'lucide-react-native';
import { getEmployeeLeaveRequests } from '../api/technician';
import { useTechnicianId } from '../auth/useTechnicianId';
import { rf, rs, sheetWidth } from '../utils/responsive';
import { MonthPill, TILE_TONES } from '../components/MintKit';
import { LeftVerticalSidebar, SidebarLayout, useSidebarWidth } from '../components/JobCardKit';
import MintScreenHeader, { useHideNativeHeader } from '../components/MintScreenHeader';
import { notify } from '../components/confirm';

const MAX_CONTENT_WIDTH = 720;

const C = {
  green: '#035C6C',
  greenDeep: '#024A57',
  red: '#F32C26',
  yellow: '#FAA700',
  ink: '#111111',
  muted: '#6B7280',
  faint: '#9CA3AF',
  bg: '#F3F4F6',
  white: '#FFFFFF',
  border: '#E5E7EB',
};

// Presentation only: per-status colours (icon tint, soft bg, pill text).
const STATUS_THEME = {
  APPROVED:   { label: 'Approved',   fg: '#609138', soft: '#EEF4E9', text: '#609138', icon: Check },
  PROCESSING: { label: 'Pending',    fg: C.yellow,  soft: '#FFF6E0', text: '#FAA700', icon: Clock3 },
  REJECTED:   { label: 'Rejected',   fg: C.red,     soft: '#FEECEC', text: C.red,     icon: X },
  CANCELLED:  { label: 'Cancelled',  fg: C.faint,  soft: '#F3F4F6', text: C.muted,   icon: Ban },
};

// Pretty-print leaveType enum from backend (CASUAL_LEAVE → Casual Leave).
const LEAVE_TYPE_LABELS = {
  CASUAL_LEAVE: 'Casual Leave',
  SICK_LEAVE: 'Sick Leave',
  EMERGENCY_LEAVE: 'Emergency Leave',
  PERMISSION: 'Permission',
  HALF_DAY: 'Half Day',
  OTHER: 'Other',
};

// Leave-balance tiles. The backend has no entitlement/balance endpoint, so the
// tiles show real approved days USED this year per leave type.
const BALANCE_TILES = [
  { type: 'CASUAL_LEAVE',    label: 'Casual Leave',    icon: TreePalm,         fg: TILE_TONES.teal,  soft: '#EAF8ED', tile: '#C3E2E7' },
  { type: 'SICK_LEAVE',      label: 'Sick Leave',      icon: BriefcaseMedical, fg: TILE_TONES.blue,  soft: '#E3EFFE', tile: '#CCDCFB' },
  { type: 'EMERGENCY_LEAVE', label: 'Emergency Leave', icon: CalendarDays,     fg: TILE_TONES.red,   soft: '#FEECEC', tile: '#FBD0D0' },
  { type: 'HALF_DAY',        label: 'Half Day',        icon: Ban,              fg: TILE_TONES.orange, soft: '#FEEBDD', tile: '#FFDCAE' },
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) { return String(n).padStart(2, '0'); }

// Backend status → UI bucket. PENDING is the canonical "awaiting owner" state;
// PROCESSING is a legacy alias. Both render as "Processing".
function statusKey(s) {
  const v = String(s || '').toUpperCase();
  if (v === 'PENDING' || v === 'PROCESSING') return 'PROCESSING';
  if (v === 'APPROVED' || v === 'REJECTED' || v === 'CANCELLED') return v;
  return 'PROCESSING';
}

function matchesFilter(item, f) {
  if (f === 'All') return true;
  return statusKey(item.status) === f.toUpperCase();
}

// LocalDate arrives as "YYYY-MM-DD" — format without Date() to avoid TZ shifts.
function formatDate(d) {
  if (!d) return '—';
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]} ${MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]}`;
  }
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad2(date.getDate())} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateTime(instant) {
  if (!instant) return '—';
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function dateRangeLabel(item) {
  if (item.startDate && item.endDate && item.startDate !== item.endDate) {
    return `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`;
  }
  return formatDate(item.startDate);
}

function numDays(item) {
  const n = Number(item?.totalDays);
  return Number.isFinite(n) ? n : 0;
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function daysLabel(item) {
  if (String(item.leaveType).toUpperCase() === 'PERMISSION') return 'Permission';
  if (item.appliedDaysLabel) return item.appliedDaysLabel;
  const n = numDays(item);
  if (!n) return '—';
  return `${fmtNum(n)} ${n === 1 ? 'Day' : 'Days'}`;
}

function startYear(item) {
  const m = String(item.startDate || '').match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

export default function LeaveReportScreen({ navigation, route }) {
  // Permission Report reuses this screen with only PERMISSION rows.
  const onlyType = route?.params?.type;
  // Leave Report = leaves only; Permission Report = PERMISSION only.
  const keep = (arr) => arr.filter((l) => (String(l.leaveType).toUpperCase() === 'PERMISSION') === (onlyType === 'PERMISSION'));
  useHideNativeHeader(navigation);
  const { width: winW } = useWindowDimensions();
  const sidebarW = useSidebarWidth();
  const technicianId = useTechnicianId();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [filter, setFilter] = useState('All');
  const [list, setList] = useState([]);
  const [allLeaves, setAllLeaves] = useState(null); // null = unavailable
  // Viewing leaves auto-reads their status notifications.
  useEffect(() => { markNotificationsSeen({ leaves: [...list, ...(allLeaves || [])] }); }, [list, allLeaves]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const scrollRef = useRef(null);
  const prevY = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    if (!technicianId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    // Month list (existing call) + unfiltered list (backend returns every
    // leave when month/year are omitted) used for the yearly balance tiles.
    const [monthRes, allRes] = await Promise.allSettled([
      getEmployeeLeaveRequests(technicianId, { month, year }),
      getEmployeeLeaveRequests(technicianId),
    ]);
    if (monthRes.status === 'fulfilled') {
      setList(Array.isArray(monthRes.value) ? keep(monthRes.value) : []);
      setError(null);
    } else {
      setList([]);
      setError(monthRes.reason?.message || 'Could not load leave requests');
      if (isRefresh) notify('Could not refresh', monthRes.reason?.message ?? 'Please try again', { preset: 'error', haptic: 'error' });
    }
    setAllLeaves(allRes.status === 'fulfilled' && Array.isArray(allRes.value) ? keep(allRes.value) : null);
    setLoading(false);
    setRefreshing(false);
  }, [technicianId, month, year, onlyType]);

  // Reload whenever the screen comes back into focus so a request submitted
  // on TechnicianApplyLeaveScreen appears immediately on goBack().
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const counts = useMemo(() => {
    const src = Array.isArray(allLeaves) ? allLeaves : list;
    return {
      Leave: src.length,
      Processing: src.filter((l) => statusKey(l.status) === 'PROCESSING').length,
      Rejected: src.filter((l) => statusKey(l.status) === 'REJECTED').length,
      Approved: src.filter((l) => statusKey(l.status) === 'APPROVED').length,
    };
  }, [list, allLeaves, onlyType]);

  const sorted = useMemo(() => {
    return [...list].sort((a, b) => {
      const ad = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const bd = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return bd - ad;
    });
  }, [list]);

  const recent = sorted.slice(0, 2);
  const previous = useMemo(() => {
    // Both reports: one History list with every record from all months.
    if (!Array.isArray(allLeaves)) return sorted; // all-months fetch failed — fall back to this month
    const at = (l) => new Date(l.requestedAt || l.startDate || 0).getTime();
    return [...allLeaves].sort((a, b) => at(b) - at(a));
  }, [onlyType, allLeaves, sorted]);
  const filteredPrevious = filter === 'All' ? previous : sorted.filter((l) => matchesFilter(l, filter));
  // Leave Report: latest 2 on top under "Recent Leave", the rest in History.
  // A tile filter shows the full filtered list in History instead.
  const recentLeaves = !onlyType && filter === 'All' ? previous.slice(0, 2) : [];
  const historyList = (filter === 'All' && !onlyType ? previous.slice(2) : previous).filter((l) => matchesFilter(l, filter));

  // Per-type usage for the selected year (approved days used + pending days).
  const balance = useMemo(() => {
    if (!allLeaves) return null;
    const out = {};
    Object.keys(LEAVE_TYPE_LABELS).forEach((t) => { out[t] = { used: 0, pending: 0, count: 0 }; });
    allLeaves.forEach((l) => {
      if (startYear(l) !== year) return;
      const t = String(l.leaveType || 'OTHER').toUpperCase();
      if (!out[t]) out[t] = { used: 0, pending: 0, count: 0 };
      const s = statusKey(l.status);
      out[t].count += 1;
      if (s === 'APPROVED') out[t].used += numDays(l);
      else if (s === 'PROCESSING') out[t].pending += numDays(l);
    });
    return out;
  }, [allLeaves, year]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const onStatPress = (f) => {
    setFilter(f);
    scrollRef.current?.scrollTo({ y: Math.max(0, prevY.current - rs(8)), animated: true });
  };

  // The status sidebar takes the left edge; the page uses the rest.
  const contentW = Math.min(winW - sidebarW, MAX_CONTENT_WIDTH) - rs(20);
  // Status filters, one below the other in the left sidebar.
  const sidebarItems = [
    { key: 'All', label: 'All', icon: CalendarDays, color: TILE_TONES.teal, count: counts.Leave },
    { key: 'Processing', label: 'Pending', icon: Clock3, color: TILE_TONES.orange, count: counts.Processing },
    { key: 'Approved', label: 'Approved', icon: Check, color: TILE_TONES.green, count: counts.Approved },
    { key: 'Rejected', label: 'Rejected', icon: X, color: TILE_TONES.red, count: counts.Rejected },
  ];
  const tileGap = rs(8);
  const tileW = (contentW - tileGap * 3) / 4;
  const compact = contentW < 400;
  const chipsInline = contentW >= 520;
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MintScreenHeader title={onlyType ? 'Permission Report' : 'Leave Report'} navigation={navigation} />

      {!technicianId ? (
        <View style={styles.center}><ActivityIndicator color={C.green} /></View>
      ) : (
        <SidebarLayout sidebar={<LeftVerticalSidebar items={sidebarItems} active={filter} onPick={onStatPress} />}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[C.green]} tintColor={C.green} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: contentW }}>
            {/* This Month */}
            <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', padding: rs(8) }]}>
              <View style={{ width: rs(28), height: rs(28), borderRadius: rs(14), backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                <CalendarDays size={rs(14)} color="#FFFFFF" strokeWidth={2.2} />
              </View>
              <Text style={[styles.monthTitle, { flex: 1, marginHorizontal: rs(6) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {isCurrentMonth ? 'This Month' : 'Selected Month'}
              </Text>
              <MonthPill compact month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
            </View>


{!onlyType ? (
            <>
            {/* Leave Balance */}
            <View style={[styles.card, styles.section]}>
              <SectionHeader title={`Leave Balance · ${year}`} action="View Details" onAction={() => setBalanceOpen(true)} />
              <View style={{ marginTop: rs(4) }}>
                {BALANCE_TILES.map((t, idx) => {
                  const b = balance?.[t.type];
                  const Icon = t.icon;
                  return (
                    <TouchableOpacity
                      key={t.type}
                      onPress={() => setBalanceOpen(true)}
                      activeOpacity={0.8}
                      accessibilityLabel={`${t.label}: ${b ? fmtNum(b.used) : 0} days used`}
                      style={[styles.balanceRow, idx > 0 && styles.balanceRowLine]}
                    >
                      <View style={[styles.balanceIcon, { backgroundColor: t.fg }]}>
                        <Icon size={rs(13)} color="#FFFFFF" strokeWidth={2.3} />
                      </View>
                      <Text style={styles.balanceLabel} numberOfLines={1}>{t.label}</Text>
                      <Text style={[styles.balanceValue, { color: t.fg }]} numberOfLines={1}>{b ? fmtNum(b.used) : 0} used</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            </>
            ) : null}

{/* Recent Leave — only when there is something to show */}
            {recentLeaves.length ? (
              <View style={[styles.card, styles.section]}>
                <TitleWithBar title="Recent Leave" />
                <View style={{ marginTop: rs(8) }}>
                  {recentLeaves.map((item) => <LeaveRow key={item.id} item={item} compact fullReason onPress={() => setSelected(item)} />)}
                </View>
              </View>
            ) : null}

            {/* Previous Leave */}
            {historyList.length || !recentLeaves.length ? (
            <View
              style={[styles.card, styles.section]}
              onLayout={(e) => { prevY.current = e.nativeEvent.layout.y; }}
            >
              <View style={[styles.prevHeader, chipsInline && styles.prevHeaderInline]}>
                <TitleWithBar title="History" />
              </View>

              {loading && list.length === 0 ? (
                <ActivityIndicator size="small" color={C.green} style={{ marginVertical: rs(20) }} />
              ) : error ? null : historyList.length === 0 ? (
                <EmptyBlock
                  icon={FileText}
                  text={previous.length === 0 ? (onlyType ? 'No permissions yet' : 'No leaves yet') : `No ${filter.toLowerCase()} ${onlyType ? 'permissions' : 'leaves'}`}
                />
              ) : (
                historyList.map((item) => <LeaveRow key={item.id} item={item} compact onPress={() => setSelected(item)} />)
              )}
            </View>
            ) : null}
          </View>
        </ScrollView>
        </SidebarLayout>
      )}

      <LeaveDetailsModal item={selected} onClose={() => setSelected(null)} />
      <BalanceModal open={balanceOpen} onClose={() => setBalanceOpen(false)} balance={balance} year={year} />
    </SafeAreaView>
  );
}

/* ---------------------------------------------------------------- pieces */

function TitleWithBar({ title }) {
  return (
    <View style={styles.titleWrap}>
      <View style={styles.titleBar} />
      <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

function SectionHeader({ title, action, onAction }) {
  return (
    <View style={styles.sectionHeader}>
      <TitleWithBar title={title} />
      {action ? (
        <TouchableOpacity style={styles.actionPill} onPress={onAction} activeOpacity={0.8} hitSlop={6}>
          <Text style={styles.actionPillText}>{action}</Text>
          <ChevronRight size={rs(14)} color={C.ink} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}


function StatusPill({ status }) {
  const k = statusKey(status);
  const th = STATUS_THEME[k];
  const Icon = th.icon;
  return (
    <View style={[styles.pill, { backgroundColor: th.soft }]}>
      <View style={[styles.pillDot, { backgroundColor: th.fg }]}>
        <Icon size={rs(10)} color="#FFFFFF" strokeWidth={3.2} />
      </View>
      <Text style={[styles.pillText, { color: th.text }]} numberOfLines={1}>{th.label}</Text>
    </View>
  );
}

// PermissionApply stores reason as "<Type> permission (<from> – <to>): <text>".
function parsePermission(reason) {
  const m = /^(.+?) permission(?: \((.+?)\))?:\s*(.*)$/s.exec(String(reason || ''));
  return m ? { type: m[1], window: m[2] || '', text: m[3] || '' } : { type: '', window: '', text: reason || '' };
}

function LeaveRow({ item, onPress, compact, fullReason }) {
  const th = STATUS_THEME[statusKey(item.status)];
  const isPerm = String(item.leaveType || '').toUpperCase() === 'PERMISSION';
  const perm = isPerm ? parsePermission(item.reason) : null;
  const typeLabel = isPerm ? `${perm.type ? `${perm.type} ` : ''}Permission` : (LEAVE_TYPE_LABELS[String(item.leaveType || '').toUpperCase()] || 'Leave');
  const reasonText = (isPerm ? perm.text : item.reason) || '';
  // Status pinned top-right; date and time/days sit side by side in the same
  // style (wrapping under each other on narrow phones); reason below.
  return (
    <TouchableOpacity style={[styles.row, { alignItems: 'flex-start' }, compact && { paddingVertical: rs(7), marginBottom: rs(6) }]} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.rowIcon, { backgroundColor: th.fg }, compact && { width: rs(30), height: rs(30), borderRadius: rs(15) }]}>
        <CalendarDays size={rs(compact ? 14 : 17)} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowType} numberOfLines={1}>{typeLabel}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: rs(10), rowGap: rs(2), marginTop: rs(3) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(4) }}>
            <Calendar size={rs(12)} color={C.muted} strokeWidth={2} />
            <Text style={styles.rowMetaText} numberOfLines={1}>{dateRangeLabel(item)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(4) }}>
            <Clock3 size={rs(12)} color={C.muted} strokeWidth={2} />
            <Text style={styles.rowMetaText} numberOfLines={1}>{isPerm ? (perm.window || 'Time not set') : daysLabel(item)}</Text>
          </View>
        </View>
        {reasonText ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: rs(4), marginTop: rs(2) }}>
            <FileText size={rs(12)} color={C.muted} strokeWidth={2} style={{ marginTop: rs(2) }} />
            <Text style={[styles.rowMetaText, { flexShrink: 1 }]} numberOfLines={fullReason ? undefined : 1}>{reasonText}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignSelf: 'flex-start', marginLeft: rs(6) }}><StatusPill status={item.status} /></View>
    </TouchableOpacity>
  );
}

function EmptyBlock({ icon: Icon, text, sub }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon size={rs(22)} color={C.green} strokeWidth={2} /></View>
      <Text style={styles.emptyText}>{text}</Text>
      {sub ? <Text style={styles.emptySub}>{sub}</Text> : null}
    </View>
  );
}

function Sheet({ open, onClose, title, children }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={[styles.sheet, sheetWidth]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.sheetClose} hitSlop={8} accessibilityLabel="Close">
              <X size={rs(18)} color={C.ink} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: rs(28) }} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DetailLine({ label, value }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || '—'}</Text>
    </View>
  );
}

function LeaveDetailsModal({ item, onClose }) {
  const k = item ? statusKey(item.status) : 'PROCESSING';
  const th = STATUS_THEME[k];
  return (
    <Sheet open={!!item} onClose={onClose} title={String(item?.leaveType || '').toUpperCase() === 'PERMISSION' ? 'Permission Details' : 'Leave Details'}>
      {item ? (
        <>
          <View style={[styles.detailHero, { backgroundColor: th.soft }]}>
            <View style={[styles.rowIcon, { backgroundColor: '#FFFFFF' }]}>
              <CalendarDays size={rs(20)} color={th.fg} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowType}>{LEAVE_TYPE_LABELS[String(item.leaveType || '').toUpperCase()] || 'Leave'}</Text>
              <Text style={styles.rowDate}>{dateRangeLabel(item)}</Text>
            </View>
            <StatusPill status={item.status} />
          </View>
          {String(item.leaveType || '').toUpperCase() === 'PERMISSION' ? (
            <>
              <DetailLine label="Type" value={parsePermission(item.reason).type || 'Permission'} />
              <DetailLine label="Time" value={parsePermission(item.reason).window || '—'} />
              <DetailLine label="Reason" value={parsePermission(item.reason).text || '—'} />
            </>
          ) : (
            <>
              <DetailLine label="Days" value={daysLabel(item)} />
              <DetailLine label="Reason" value={item.reason} />
            </>
          )}
          <DetailLine label="Applied on" value={formatDateTime(item.requestedAt)} />
          {k === 'APPROVED' ? <DetailLine label="Approved on" value={formatDateTime(item.approvedAt)} /> : null}
          {k === 'APPROVED' && item.remarks ? <DetailLine label="Owner remarks" value={item.remarks} /> : null}
          {k === 'REJECTED' ? <DetailLine label="Rejected on" value={formatDateTime(item.rejectedAt)} /> : null}
          {k === 'REJECTED' ? <DetailLine label="Rejection reason" value={item.rejectionReason} /> : null}
          {item.attachmentUrl ? (
            <TouchableOpacity
              style={styles.attachBtn}
              activeOpacity={0.85}
              onPress={() => Linking.openURL(item.attachmentUrl).catch(() => notify('Could not open attachment', '', { preset: 'error' }))}
            >
              <Paperclip size={rs(16)} color={C.green} strokeWidth={2.2} />
              <Text style={styles.attachText}>View attachment</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

function BalanceModal({ open, onClose, balance, year }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Leave Usage · ${year}`}>
      <Text style={styles.sheetNote}>
        Approved days used per leave type this year. Remaining balance isn&apos;t available because no leave quota is configured for your account.
      </Text>
      {!balance ? (
        <EmptyBlock icon={FileText} text="Usage unavailable" sub="Pull to refresh and try again." />
      ) : (
        Object.keys(LEAVE_TYPE_LABELS).map((t) => {
          const b = balance[t] || { used: 0, pending: 0, count: 0 };
          return (
            <View key={t} style={styles.usageRow}>
              <Text style={styles.usageType}>{LEAVE_TYPE_LABELS[t]}</Text>
              <View style={styles.usageCols}>
                <UsageCell label="Used" value={t === 'PERMISSION' ? `${b.count}` : fmtNum(b.used)} color={C.green} />
                <UsageCell label="Pending" value={fmtNum(b.pending)} color="#FAA700" />
                <UsageCell label="Requests" value={String(b.count)} color={C.ink} />
              </View>
            </View>
          );
        })
      )}
    </Sheet>
  );
}

function UsageCell({ label, value, color }) {
  return (
    <View style={styles.usageCell}>
      <Text style={[styles.usageVal, { color }]}>{value}</Text>
      <Text style={styles.usageLabel}>{label}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- styles */

const shadow = {
  shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { alignItems: 'center', paddingTop: rs(4), paddingBottom: rs(24) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: { backgroundColor: C.white, borderRadius: rs(16), borderWidth: 1, borderColor: C.border, padding: rs(11), ...shadow },
  section: { marginTop: rs(10) },

  monthCard: { overflow: 'hidden', paddingVertical: rs(11) },
  monthTitle: { fontSize: rf(16), fontWeight: '800', color: C.ink },
  monthSub: { fontSize: rf(12), color: C.muted, marginTop: rs(3) },
  monthPill: {
    marginTop: rs(10), height: rs(36), borderRadius: 999, borderWidth: 1, borderColor: '#E5F3F5',
    backgroundColor: '#E5F3F5', flexDirection: 'row', alignItems: 'center', paddingHorizontal: rs(6),
  },
  monthArrow: { width: rs(32), height: rs(32), alignItems: 'center', justifyContent: 'center' },
  monthPillMid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(8) },
  monthPillText: { fontSize: rf(14), fontWeight: '800', color: C.greenDeep, flexShrink: 1 },
  illus: { position: 'absolute', right: rs(4), top: rs(10) },

  statRow: { marginTop: rs(10) },
  lrArrow: { width: rs(28), height: rs(28), borderRadius: rs(14), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  statCard: {
    flex: 1, minWidth: 0, alignItems: 'center', borderRadius: rs(12), borderWidth: 1,
    paddingVertical: rs(6), paddingHorizontal: rs(4),
  },
  statAccent: { position: 'absolute', left: 0, top: rs(8), width: rs(3), height: rs(26), borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  statIcon: { width: rs(26), height: rs(26), borderRadius: rs(13), alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: rf(15), fontWeight: '800', color: C.ink, marginTop: rs(3) },
  statLabel: { fontSize: rf(10), fontWeight: '600', color: C.muted },

  applyBtn: {
    marginTop: rs(10), borderRadius: rs(14),
    shadowColor: C.green, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  applyBtnInner: {
    height: rs(44), borderRadius: rs(14), overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  applyCenter: { flexDirection: 'row', alignItems: 'center', gap: rs(8) },
  applyChevron: { position: 'absolute', right: rs(16) },
  applyWave: {
    position: 'absolute', right: -rs(30), top: -rs(50), width: rs(150), height: rs(120), borderRadius: rs(75),
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  applyBtnText: { color: '#FFFFFF', fontSize: rf(15), fontWeight: '800' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rs(8) },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: rs(8), flexShrink: 1 },
  titleBar: { width: rs(4), height: rs(20), borderRadius: 2, backgroundColor: C.green },
  sectionTitle: { fontSize: rf(16), fontWeight: '800', color: C.ink, flexShrink: 1 },
  actionPill: {
    flexDirection: 'row', alignItems: 'center', gap: rs(4), paddingHorizontal: rs(12), height: rs(30),
    borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: C.white,
  },
  actionPillText: { fontSize: rf(12), fontWeight: '600', color: C.ink },

  balanceGrid: { flexDirection: 'row', gap: rs(8) },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: rs(8), paddingVertical: rs(6) },
  balanceRowLine: { borderTopWidth: 1, borderTopColor: C.border },
  balanceIcon: { width: rs(26), height: rs(26), borderRadius: rs(13), alignItems: 'center', justifyContent: 'center' },
  balanceLabel: { flex: 1, fontSize: rf(12.5), fontWeight: '600', color: C.ink },
  balanceValue: { fontSize: rf(12), fontWeight: '800' },
  balanceGridWrap: { flexWrap: 'wrap', justifyContent: 'space-between', rowGap: rs(8), gap: 0 },
  balanceTile: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(7), borderRadius: rs(12),
    paddingVertical: rs(7), paddingHorizontal: rs(8),
  },
  balanceTileHalf: { flex: 1, minWidth: 0, flexDirection: 'column', alignItems: 'center', paddingVertical: rs(6), paddingHorizontal: rs(3), gap: rs(2) },
  balanceIcon: { width: rs(30), height: rs(30), borderRadius: rs(15), alignItems: 'center', justifyContent: 'center' },
  balanceNum: { fontSize: rf(16), fontWeight: '800', color: C.ink },
  balanceLabel: { fontSize: rf(12), fontWeight: '600', color: C.ink, marginTop: 1 },
  balanceSub: { fontSize: rf(10.5), color: C.faint, marginTop: 1 },

  prevHeader: { marginBottom: rs(12) },
  prevHeaderInline: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  filterRow: { flexDirection: 'row', gap: rs(6) },
  filterChip: {
    height: rs(28), borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.white, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: rs(10),
  },
  filterChipActive: { backgroundColor: C.green, borderColor: C.green },
  filterChipText: { fontSize: rf(12), color: C.ink, fontWeight: '500' },
  filterChipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: rs(12),
    borderWidth: 1, borderColor: C.border, padding: rs(8), marginBottom: rs(7), gap: rs(7),
  },
  rowIcon: { width: rs(36), height: rs(36), borderRadius: rs(18), alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  rowType: { fontSize: rf(13.5), fontWeight: '700', color: C.ink },
  rowDate: { fontSize: rf(12), color: C.muted, marginTop: rs(2) },
  rowMeta: { flexDirection: 'row', alignItems: 'center', marginTop: rs(2), gap: rs(4) },
  rowMetaText: { fontSize: rf(11.5), color: C.muted },

  pill: { flexDirection: 'row', alignItems: 'center', gap: rs(5), borderRadius: 999, paddingLeft: rs(4), paddingRight: rs(9), height: rs(24) },
  pillDot: { width: rs(15), height: rs(15), borderRadius: rs(8), alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: rf(11.5), fontWeight: '600' },

  empty: { alignItems: 'center', paddingVertical: rs(18) },
  emptyIcon: { width: rs(48), height: rs(48), borderRadius: rs(24), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: rf(14), fontWeight: '700', color: C.ink, marginTop: rs(10) },
  emptySub: { fontSize: rf(12), color: C.muted, marginTop: rs(3), textAlign: 'center' },
  retryBtn: {
    marginTop: rs(12), flexDirection: 'row', alignItems: 'center', gap: rs(6), backgroundColor: C.green,
    paddingHorizontal: rs(16), height: rs(34), borderRadius: 999,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: rf(13) },

  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: C.white, borderTopLeftRadius: rs(22), borderTopRightRadius: rs(22),
    paddingHorizontal: rs(18), paddingTop: rs(8), maxHeight: '85%',
  },
  sheetHandle: { alignSelf: 'center', width: rs(40), height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: rs(8) },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rs(12) },
  sheetTitle: { fontSize: rf(18), fontWeight: '800', color: C.ink },
  sheetClose: { width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  sheetNote: { fontSize: rf(12), color: C.muted, marginBottom: rs(12), lineHeight: rf(17) },

  detailHero: { flexDirection: 'row', alignItems: 'center', gap: rs(10), padding: rs(12), borderRadius: rs(14), marginBottom: rs(6) },
  detailLine: { paddingVertical: rs(10), borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  detailLabel: { fontSize: rf(11.5), color: C.muted, fontWeight: '600' },
  detailValue: { fontSize: rf(14), color: C.ink, fontWeight: '600', marginTop: rs(2) },
  attachBtn: {
    marginTop: rs(14), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(8),
    height: rs(44), borderRadius: rs(14), borderWidth: 1, borderColor: '#E5F3F5', backgroundColor: '#E5F3F5',
  },
  attachText: { color: C.greenDeep, fontWeight: '700', fontSize: rf(14) },

  usageRow: { paddingVertical: rs(10), borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  usageType: { fontSize: rf(14), fontWeight: '700', color: C.ink, marginBottom: rs(6) },
  usageCols: { flexDirection: 'row', gap: rs(8) },
  usageCell: { flex: 1, backgroundColor: '#F8F9FA', borderRadius: rs(10), paddingVertical: rs(8), alignItems: 'center' },
  usageVal: { fontSize: rf(16), fontWeight: '800' },
  usageLabel: { fontSize: rf(11), color: C.muted, marginTop: 1 },
});
