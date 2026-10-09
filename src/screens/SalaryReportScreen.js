import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Banknote, Calendar, CalendarDays, ChevronRight, CircleCheck, IndianRupee, Sparkle, TrendingUp, Wallet,
} from 'lucide-react-native';
import { ticketApi } from '../api/client';
import { useTechnicianId } from '../auth/useTechnicianId';
import { rf, rs } from '../utils/responsive';
import { payslipNetPayable, payslipPaid } from '../utils/payslip';
import MintScreenHeader, { MintBackdrop, useHideNativeHeader } from '../components/MintScreenHeader';
import { MINT, mintShadow, HeroCard, CenterStepper } from '../components/MintKit';

const MAX_CONTENT_WIDTH = 720;
const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Presentation only: KPI tile tints.
const KPI_TINTS = {
  present: { bg: '#F1FAF6', border: '#D9EEE4', dot: '#D6F1E5', icon: '#00A86B', text: '#006B57' },
  earned:  { bg: '#F3EEFF', border: '#E6DCFB', dot: '#E4D8FD', icon: '#7C3AED', text: '#6D28D9' },
  average: { bg: '#FFF7E8', border: '#FBE8C5', dot: '#FDEBC8', icon: '#F59E0B', text: '#B45309' },
};

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatRupee(v) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return '₹ 0';
  return `₹ ${n.toLocaleString('en-IN')}`;
}

export default function SalaryReportScreen({ navigation }) {
  useHideNativeHeader(navigation);
  const { width: winW } = useWindowDimensions();
  const technicianId = useTechnicianId();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!technicianId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await ticketApi.get(`/technicians/${technicianId}/payslips`, { query: { year } });
      setList(Array.isArray(res) ? res : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [technicianId, year]);

  React.useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const byMonth = {};
    list.forEach((r) => { byMonth[r.month] = r; });
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const existing = byMonth[m];
      return existing || { month: m, year, presentDays: 0, netSalary: 0, regularSalary: 0, _empty: true };
    });
  }, [list, year]);

  const totals = useMemo(() => {
    let totalPresent = 0;
    let totalNet = 0;
    let monthsWithPay = 0;
    let monthsPaid = 0;
    list.forEach((r) => {
      totalPresent += Number(r.presentDays || 0);
      const n = payslipNetPayable(r); // salary + wage, not salary alone
      totalNet += n;
      if (n > 0) monthsWithPay += 1;
      if (payslipPaid(r)) monthsPaid += 1;
    });
    return { totalPresent, totalNet, monthsWithPay, monthsPaid };
  }, [list]);

  if (!technicianId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <MintBackdrop />
        <MintScreenHeader title="Salary Report" navigation={navigation} />
        <View style={styles.center}><ActivityIndicator color={MINT.deep} /></View>
      </SafeAreaView>
    );
  }

  // Rows are calendar Jan–Dec of `year`, so label it as the calendar year — not
  // a financial year (which would run Apr–Mar and mismatch the months shown).
  const fyLabel = String(year);

  const contentW = Math.min(winW, MAX_CONTENT_WIDTH) - rs(32);
  const kpiGap = rs(8);
  const kpiW = (contentW - kpiGap * 2) / 3;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MintBackdrop />
      <MintScreenHeader title="Salary Report" navigation={navigation} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[MINT.deep]} tintColor={MINT.deep} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentW }}>
          <HeroCard
            icon={Wallet}
            title="Salary Overview"
            subtitle="View your attendance, earnings and payout status for the selected year."
            art={contentW >= 360 ? <HeroArt /> : null}
          />

          <CenterStepper
            label={fyLabel}
            onPrev={() => setYear((y) => y - 1)}
            onNext={() => setYear((y) => y + 1)}
            prevLabel="Previous year"
            nextLabel="Next year"
          />

          <View style={[styles.summaryRow, { gap: kpiGap }]}>
            <SummaryTile
              width={kpiW}
              label="Total Present"
              value={`${totals.totalPresent}`}
              sub="Days"
              icon={CalendarDays}
              tint={KPI_TINTS.present}
            />
            <SummaryTile
              width={kpiW}
              label="Total Earned"
              value={formatRupee(totals.totalNet)}
              sub={`${totals.monthsPaid} mo paid`}
              icon={Banknote}
              tint={KPI_TINTS.earned}
            />
            <SummaryTile
              width={kpiW}
              label="Avg / Month"
              value={formatRupee(totals.monthsWithPay > 0 ? Math.round(totals.totalNet / totals.monthsWithPay) : 0)}
              sub="Avg payout"
              icon={TrendingUp}
              tint={KPI_TINTS.average}
            />
          </View>

          <View style={styles.sectionRow}>
            <View style={styles.sectionAccent} />
            <Text style={styles.sectionHeader}>Monthly Payslips</Text>
          </View>

          {loading && list.length === 0 ? (
            <ActivityIndicator size="small" color={MINT.deep} style={{ marginVertical: rs(16) }} />
          ) : (
            rows.map((row, i) => (
              <MonthCard
                key={`${row.month}-${row.year}`}
                row={row}
                index={i + 1}
                onPress={() => navigation.navigate('Payslip', { month: row.month, year: row.year })}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Decorative wallet + rupee coins for the hero card (icons only, no image assets).
function HeroArt() {
  const disc = rs(70);
  const coin = rs(28);
  return (
    <View style={{ width: disc + rs(14), height: disc, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: disc, height: disc, borderRadius: rs(20), backgroundColor: MINT.bright, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] }}>
        <Wallet size={rs(34)} color="#FFFFFF" strokeWidth={1.8} />
      </View>
      <View style={[styles.coin, { width: coin, height: coin, borderRadius: coin / 2, top: -rs(6), right: 0 }]}>
        <IndianRupee size={rs(15)} color="#FFFFFF" strokeWidth={2.6} />
      </View>
      <View style={[styles.coin, { width: coin * 0.8, height: coin * 0.8, borderRadius: coin * 0.4, bottom: -rs(4), left: rs(2) }]}>
        <IndianRupee size={rs(12)} color="#FFFFFF" strokeWidth={2.6} />
      </View>
      <View style={{ position: 'absolute', left: -rs(4), top: rs(4) }}>
        <Sparkle size={rs(12)} color={MINT.bright} fill={MINT.bright} />
      </View>
    </View>
  );
}

function SummaryTile({ width, label, value, sub, icon: Icon, tint }) {
  const dot = rs(34);
  return (
    <View style={[styles.summaryTile, { width, backgroundColor: tint.bg, borderColor: tint.border }]}>
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: tint.dot, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={rs(18)} color={tint.icon} strokeWidth={2.2} />
      </View>
      <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: tint.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{label}</Text>
      <Text style={styles.summarySub} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

function MonthCard({ row, index, onPress }) {
  const isEmpty = row._empty;
  const net = payslipNetPayable(row); // salary + wage
  const hasPay = net > 0;
  const isPaid = !isEmpty && payslipPaid(row);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.monthCard, isEmpty && styles.monthCardEmpty]}
    >
      <View style={styles.monthIndexBubble}>
        <Text style={styles.monthIndexText}>{MONTHS_SHORT[row.month - 1] || String(index).padStart(2, '0')}</Text>
      </View>
      <View style={styles.monthMain}>
        <View style={styles.monthHeaderRow}>
          <Text style={styles.monthName} numberOfLines={1}>{MONTHS_FULL[row.month - 1]}</Text>
          <Text style={styles.monthYear}>{row.year}</Text>
        </View>
        <View style={styles.monthMeta}>
          <Calendar size={rs(13)} color={MINT.muted} />
          <Text style={styles.monthMetaText}>{row.presentDays ?? 0} Days</Text>
        </View>
      </View>
      <View style={styles.monthDivider} />
      <View style={styles.monthEarnings}>
        <Text style={[styles.monthSalary, hasPay ? styles.monthSalaryPaid : styles.monthSalaryEmpty]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {formatRupee(net)}
        </Text>
        <Text style={styles.monthEarningsLabel}>Earnings</Text>
      </View>
      {isEmpty ? (
        <View style={[styles.statusPill, styles.statusPillEmpty]}>
          <Text style={[styles.statusPillText, { color: MINT.muted }]}>Pending</Text>
        </View>
      ) : isPaid ? (
        <View style={[styles.statusPill, styles.statusPillPaid]}>
          <CircleCheck size={rs(12)} color="#16A34A" strokeWidth={2.6} />
          <Text style={[styles.statusPillText, { color: '#16A34A' }]}>Paid</Text>
        </View>
      ) : (
        <View style={[styles.statusPill, styles.statusPillUnpaid]}>
          <Text style={[styles.statusPillText, { color: '#EA580C' }]}>Unpaid</Text>
        </View>
      )}
      <ChevronRight size={rs(18)} color="#98A2B3" style={{ marginLeft: rs(4) }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MINT.bg },
  content: { alignItems: 'center', paddingTop: rs(4), paddingBottom: rs(24) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  coin: {
    position: 'absolute', backgroundColor: '#F5B301', borderWidth: 2, borderColor: '#FCD34D',
    alignItems: 'center', justifyContent: 'center',
  },

  summaryRow: { flexDirection: 'row', marginTop: rs(14) },
  summaryTile: { borderRadius: rs(20), borderWidth: 1, padding: rs(12), ...mintShadow },
  summaryValue: { fontSize: rf(20), fontWeight: '800', color: MINT.text, marginTop: rs(10) },
  summaryLabel: { fontSize: rf(12.5), fontWeight: '600', marginTop: 2 },
  summarySub: { fontSize: rf(11.5), color: MINT.muted, marginTop: 1 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(18), marginBottom: rs(10) },
  sectionAccent: { width: rs(4), height: rs(20), borderRadius: 2, backgroundColor: MINT.primary, marginRight: rs(10) },
  sectionHeader: { fontSize: rf(18), fontWeight: '800', color: MINT.text },

  monthCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: MINT.card, borderRadius: rs(18),
    borderWidth: 1, borderColor: MINT.border, paddingHorizontal: rs(12), paddingVertical: rs(10),
    minHeight: rs(68), marginBottom: rs(8), gap: rs(10), ...mintShadow,
  },
  monthCardEmpty: { backgroundColor: '#FCFDFC' },

  monthIndexBubble: {
    width: rs(46), height: rs(46), borderRadius: rs(23), backgroundColor: MINT.mint,
    alignItems: 'center', justifyContent: 'center',
  },
  monthIndexText: { fontSize: rf(12.5), fontWeight: '800', color: MINT.deep },

  monthMain: { flex: 1, minWidth: 0 },
  monthHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: rs(6) },
  monthName: { fontSize: rf(15), fontWeight: '700', color: MINT.text, flexShrink: 1 },
  monthYear: { fontSize: rf(13), color: MINT.muted, fontWeight: '500' },
  monthMeta: { flexDirection: 'row', alignItems: 'center', gap: rs(5), marginTop: rs(4) },
  monthMetaText: { fontSize: rf(12.5), color: MINT.muted, fontWeight: '500' },

  monthDivider: { width: 1, alignSelf: 'stretch', marginVertical: rs(6), backgroundColor: '#EAF0ED' },
  monthEarnings: { minWidth: rs(58), maxWidth: rs(96) },
  monthSalary: { fontSize: rf(14.5), fontWeight: '800' },
  monthSalaryPaid: { color: MINT.deep },
  monthSalaryEmpty: { color: MINT.text },
  monthEarningsLabel: { fontSize: rf(11.5), color: MINT.muted, marginTop: 2 },

  statusPill: { flexDirection: 'row', alignItems: 'center', gap: rs(4), paddingHorizontal: rs(10), paddingVertical: rs(5), borderRadius: 999 },
  statusPillPaid: { backgroundColor: '#DCFCE7' },
  statusPillUnpaid: { backgroundColor: '#FFEDE3' },
  statusPillEmpty: { backgroundColor: '#F2F4F7' },
  statusPillText: { fontSize: rf(12), fontWeight: '700' },
});
