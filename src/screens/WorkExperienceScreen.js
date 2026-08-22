import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Store,
  MapPin,
  Calendar,
  Briefcase,
  Wallet,
  BarChart3,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
} from 'lucide-react-native';
import { useSelector } from 'react-redux';
import { useTechnicianId } from '../auth/useTechnicianId';
import { getMyExperiences, getMyTechnicianProfile } from '../api/technician';
import { shopApi } from '../api/client';
import { selectShopId } from '../store/authSlice';
import { rf } from '../utils/responsive';

const COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  primary: '#00008B',
  banner: '#004C40',
  green: '#004C40',
  red: '#DC2626',
};

function formatDate(d) {
  if (!d) return '—';
  // Backend returns ISO yyyy-MM-dd; render as DD-Mon-YYYY to match the reference.
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = String(date.getDate()).padStart(2, '0');
  return `${dd}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

function prettyWorkingType(t) {
  if (!t) return '—';
  const u = String(t).toUpperCase();
  if (u === 'FULL_TIME') return 'Full Time';
  if (u === 'PART_TIME') return 'Part Time';
  // Allow free-text values to pass through unchanged.
  return t;
}

function workingTypeColor(type) {
  if (!type) return COLORS.text;
  return COLORS.green;
}

function prettySalary(s) {
  if (s == null || s === '') return '—';
  const n = Number(String(s).replace(/[^0-9.]/g, ''));
  if (Number.isFinite(n) && n > 0) return `₹ ${n.toLocaleString('en-IN')}`;
  return `₹ ${s}`;
}

function prettyPeriod(p) {
  if (!p) return '';
  const u = String(p).toUpperCase();
  if (u.startsWith('MONTH')) return '/ month';
  if (u.startsWith('DAY') || u.startsWith('DAIL')) return '/ day';
  if (u.startsWith('WEEK')) return '/ week';
  if (u.startsWith('YEAR') || u.startsWith('ANNUAL')) return '/ year';
  return '';
}

// The employee's live current employment — shop name/address from the shops
// record (GET /shops/{id}, permitAll) + join date / role / salary from the
// technician profile. Shown as a highlighted card above the experience history.
function CurrentShopCard({ shop, me }) {
  const name = shop?.name || 'My Shop';
  const address = [shop?.address, shop?.city, shop?.state, shop?.pincode]
    .filter((x) => x && String(x).trim())
    .join(', ') || '—';
  const image = Array.isArray(shop?.images) && shop.images[0] ? shop.images[0] : null;
  const joinDate = formatDate(me?.dateOfJoin);
  const role = me?.roleLabel || '—';
  const salary = me?.salaryAmount
    ? `${prettySalary(me.salaryAmount)} ${prettyPeriod(me.salaryPeriod)}`.trim()
    : '—';

  return (
    <View style={styles.currentCard}>
      <View style={styles.currentBadge}>
        <View style={styles.currentDot} />
        <Text style={styles.currentBadgeText}>CURRENTLY WORKING</Text>
      </View>

      <View style={styles.currentTopRow}>
        <View style={styles.currentPhotoBox}>
          {image ? (
            <Image source={{ uri: image }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Store size={26} color={COLORS.green} />
            </View>
          )}
        </View>
        <View style={styles.currentHeadCol}>
          <Text style={styles.currentShopName} numberOfLines={2}>{name}</Text>
          <View style={styles.currentAddrRow}>
            <MapPin size={13} color={COLORS.textMuted} strokeWidth={2} />
            <Text style={styles.currentAddr} numberOfLines={2}>{address}</Text>
          </View>
        </View>
      </View>

      <View style={styles.currentMetaGrid}>
        <MetaTile Icon={Calendar}  label="Join Date"    value={joinDate} />
        <View style={styles.currentMetaDivider} />
        <MetaTile Icon={Briefcase} label="Role"         value={role} />
        <View style={styles.currentMetaDivider} />
        <MetaTile Icon={Wallet}    label="Salary"       value={salary} />
      </View>
    </View>
  );
}

function MetaTile({ Icon, label, value }) {
  return (
    <View style={styles.metaTile}>
      <Icon size={14} color={COLORS.green} strokeWidth={2} />
      <Text style={styles.metaValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</Text>
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ Icon, label, value, valueColor }) {
  return (
    <View style={styles.infoRow}>
      <Icon size={14} color={COLORS.textMuted} strokeWidth={2} />
      <Text style={styles.infoLabel}>{label} : </Text>
      <Text
        style={[styles.infoValue, valueColor ? { color: valueColor, fontWeight: '800' } : null]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function ExperienceCard({ item }) {
  const isCurrent = !item.relievingDate;
  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <View style={styles.photoBox}>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Store size={28} color={COLORS.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.detailsCol}>
          <InfoRow Icon={Store}     label="Shop"           value={item.shopName || '—'} valueColor={COLORS.text} />
          <InfoRow Icon={MapPin}    label="Location"       value={item.location || '—'} />
          <InfoRow Icon={Calendar}  label="Join Date"      value={formatDate(item.joinDate)} />
          <InfoRow
            Icon={Calendar}
            label="Relieving Date"
            value={isCurrent ? 'Present' : formatDate(item.relievingDate)}
            valueColor={isCurrent ? COLORS.red : undefined}
          />
          <InfoRow
            Icon={Briefcase}
            label="Working Type"
            value={prettyWorkingType(item.workingType)}
            valueColor={workingTypeColor(item.workingType)}
          />
          <InfoRow Icon={Wallet}    label="Last Salary"    value={prettySalary(item.lastSalary)} />
          <InfoRow Icon={Calendar}  label="Total Duration" value={item.totalDuration || '—'} />
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat Icon={BarChart3}    label="Total Service" value={item.totalService ?? 0} />
        <View style={styles.statDivider} />
        <Stat Icon={CheckCircle2} label="Completed"     value={item.completedCount ?? 0} />
        <View style={styles.statDivider} />
        <Stat Icon={RotateCcw}    label="Return"        value={item.returnCount ?? 0} />
      </View>
    </View>
  );
}

function Stat({ Icon, label, value }) {
  return (
    <View style={styles.statItem}>
      <View style={styles.statHeader}>
        <Icon size={14} color={COLORS.textMuted} strokeWidth={2} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function WorkExperienceScreen() {
  const technicianId = useTechnicianId();
  const sessionShopId = useSelector(selectShopId);
  const [experiences, setExperiences] = useState([]);
  const [current, setCurrent] = useState(null); // { shop, me }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Live "currently working" shop — technician profile (join/role/salary) +
  // the shops record (name/address). Best-effort: failures just hide the card.
  const loadCurrent = useCallback(async () => {
    try {
      const me = await getMyTechnicianProfile().catch(() => null);
      const sid = sessionShopId || me?.shopId;
      const shop = sid ? await shopApi.get(`/shops/${sid}`).catch(() => null) : null;
      if (me || shop) setCurrent({ me, shop });
    } catch { /* non-fatal */ }
  }, [sessionShopId]);

  const load = useCallback(async () => {
    if (!technicianId) return;
    setError(null);
    try {
      const data = await getMyExperiences(technicianId);
      setExperiences(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || 'Failed to load work experience');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [technicianId]);

  useEffect(() => {
    if (!technicianId) return;
    setLoading(true);
    load();
  }, [technicianId, load]);

  useEffect(() => { loadCurrent(); }, [loadCurrent]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
    loadCurrent();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Live current-employment shop details */}
        {current && (current.shop || current.me) ? (
          <CurrentShopCard shop={current.shop} me={current.me} />
        ) : null}

        <View style={styles.banner}>
          <View style={styles.bannerBar} />
          <Text style={styles.bannerText}>Experience History</Text>
        </View>

        {loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : error ? (
          <View style={styles.stateBox}>
            <AlertCircle size={28} color={COLORS.red} />
            <Text style={[styles.emptyText, { color: COLORS.red }]}>{error}</Text>
          </View>
        ) : experiences.length === 0 ? (
          <View style={styles.stateBox}>
            <Briefcase size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No work experience added yet.</Text>
          </View>
        ) : (
          experiences.map((exp) => <ExperienceCard key={exp.id} item={exp} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 12, paddingBottom: 24 },

  banner: {
    backgroundColor: COLORS.banner,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bannerBar: { width: 3, height: 18, backgroundColor: '#FFFFFF', borderRadius: 2, marginRight: 8 },
  bannerText: { color: '#FFFFFF', fontSize: rf(14), fontWeight: '700' },

  // Current working shop
  currentCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    padding: 12,
    marginBottom: 14,
    shadowColor: COLORS.green,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
    gap: 6,
  },
  currentDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green },
  currentBadgeText: { fontSize: rf(10), fontWeight: '800', color: '#004C40', letterSpacing: 0.6 },
  currentTopRow: { flexDirection: 'row', alignItems: 'center' },
  currentPhotoBox: {
    width: 64, height: 64, borderRadius: 12, overflow: 'hidden', marginRight: 12,
    backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7',
  },
  currentHeadCol: { flex: 1 },
  currentShopName: { fontSize: rf(16), fontWeight: '800', color: COLORS.text },
  currentAddrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 4 },
  currentAddr: { flex: 1, fontSize: rf(12), color: COLORS.textMuted, lineHeight: rf(16) },
  currentMetaGrid: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  metaTile: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  metaValue: { fontSize: rf(13), fontWeight: '800', color: COLORS.text, marginTop: 2 },
  metaLabel: { fontSize: rf(10.5), color: COLORS.textMuted, fontWeight: '600' },
  currentMetaDivider: { width: 1, height: 34, backgroundColor: COLORS.border },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardTopRow: { flexDirection: 'row', padding: 8 },
  photoBox: {
    width: 96,
    aspectRatio: 1,
    borderRadius: 4,
    overflow: 'hidden',
    marginRight: 8,
    backgroundColor: '#F1F5F9',
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  detailsCol: { flex: 1, justifyContent: 'space-between' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  infoLabel: { fontSize: rf(11), color: COLORS.textMuted, marginLeft: 6, fontWeight: '500' },
  infoValue: { flex: 1, fontSize: rf(11), color: COLORS.text, fontWeight: '700' },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { fontSize: rf(11), color: COLORS.textMuted, fontWeight: '600' },
  statValue: { fontSize: rf(16), color: COLORS.text, fontWeight: '800', marginTop: 2 },
  statDivider: { width: 1, height: '70%', backgroundColor: COLORS.border },

  stateBox: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: { fontSize: rf(13), color: COLORS.textMuted, fontWeight: '600' },
});
