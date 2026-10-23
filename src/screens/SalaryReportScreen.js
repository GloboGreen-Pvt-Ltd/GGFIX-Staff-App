import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Banknote,
  Calendar,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react-native';
import { ticketApi } from '../api/client';
import { useTechnicianId } from '../auth/useTechnicianId';
import { rf, rs } from '../utils/responsive';
import { payslipNetPayable, payslipPaid } from '../utils/payslip';
import MintScreenHeader, { MintBackdrop, useHideNativeHeader } from '../components/MintScreenHeader';
import { MINT, mintShadow, StatIconCard } from '../components/MintKit';
import { CalendarModal } from '../components/DatePickerField';

const MAX_CONTENT_WIDTH = 720;
const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

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
  const [yearOpen, setYearOpen] = useState(false);
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
          {/* Banner: icon · title · year button (tap to pick a year) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: rs(16), borderWidth: 1, borderColor: '#E5E7EB', padding: rs(10), ...mintShadow }}>
            <View style={{ width: rs(40), height: rs(40), borderRadius: rs(12), backgroundColor: '#035C6C', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={rs(20)} color="#FFFFFF" strokeWidth={2.2} />
            </View>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: rf(17), fontWeight: '800', color: '#1C3053' }} numberOfLines={1}>Salary Overview</Text>
            <TouchableOpacity onPress={() => setYearOpen(true)} activeOpacity={0.85} accessibilityLabel={`Select year, ${fyLabel}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: rs(5), backgroundColor: '#035C6C', borderRadius: 999, paddingVertical: rs(6), paddingHorizontal: rs(12) }}>
              <CalendarDays size={rs(13)} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={{ fontSize: rf(13), fontWeight: '700', color: '#FFFFFF' }}>{fyLabel}</Text>
            </TouchableOpacity>
          </View>
          <CalendarModal visible={yearOpen} yearOnly title="Select year" initial={`${year}-01-01`}
            onCancel={() => setYearOpen(false)}
            onSave={(iso) => { setYearOpen(false); if (iso) setYear(Number(iso.slice(0, 4))); }} />

          <View style={[styles.summaryRow, { gap: kpiGap }]}>
            <SummaryTile
              width={kpiW}
              label="Total Present"
              value={`${totals.totalPresent}`}
              sub="Days"
              icon={CalendarDays}
              color="#609138"
            />
            <SummaryTile
              width={kpiW}
              label="Total Earned"
              value={formatRupee(totals.totalNet)}
              sub={`${totals.monthsPaid} mo paid`}
              icon={Banknote}
              color="#035C6C"
            />
            <SummaryTile
              width={kpiW}
              label="Avg / Month"
              value={formatRupee(totals.monthsWithPay > 0 ? Math.round(totals.totalNet / totals.monthsWithPay) : 0)}
              sub="Avg payout"
              icon={TrendingUp}
              color="#FAA700"
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

function SummaryTile({ width, label, value, icon, color }) {
  return <View style={{ width }}><StatIconCard icon={icon} color={color} label={label} value={value} /></View>;
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
          <CircleCheck size={rs(12)} color="#609138" strokeWidth={2.6} />
          <Text style={[styles.statusPillText, { color: '#609138' }]}>Paid</Text>
        </View>
      ) : (
        <View style={[styles.statusPill, styles.statusPillUnpaid]}>
          <Text style={[styles.statusPillText, { color: '#FAA700' }]}>Unpaid</Text>
        </View>
      )}
      <ChevronRight size={rs(16)} color="#98A2B3" style={{ marginLeft: rs(4) }} />
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

  summaryRow: { flexDirection: 'row', marginTop: rs(10) },
  summaryTile: { borderRadius: rs(12), borderWidth: 1, padding: rs(7), ...mintShadow },
  summaryValue: { fontSize: rf(15), fontWeight: '800', color: MINT.text, marginTop: rs(3) },
  summaryLabel: { fontSize: rf(12), fontWeight: '600', marginTop: 2 },
  summarySub: { fontSize: rf(11.5), color: MINT.muted, marginTop: 1 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(14), marginBottom: rs(8) },
  sectionAccent: { width: rs(4), height: rs(20), borderRadius: 2, backgroundColor: MINT.primary, marginRight: rs(10) },
  sectionHeader: { fontSize: rf(16), fontWeight: '800', color: MINT.text },

  monthCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: MINT.card, borderRadius: rs(14),
    borderWidth: 1, borderColor: MINT.border, paddingHorizontal: rs(9), paddingVertical: rs(5),
    minHeight: rs(46), marginBottom: rs(5), gap: rs(7), ...mintShadow,
  },
  monthCardEmpty: { backgroundColor: '#FCFDFC' },

  monthIndexBubble: {
    width: rs(30), height: rs(30), borderRadius: rs(15), backgroundColor: MINT.mint,
    alignItems: 'center', justifyContent: 'center',
  },
  monthIndexText: { fontSize: rf(11.5), fontWeight: '800', color: MINT.deep },

  monthMain: { flex: 1, minWidth: 0 },
  monthHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: rs(6) },
  monthName: { fontSize: rf(14), fontWeight: '700', color: MINT.text, flexShrink: 1 },
  monthYear: { fontSize: rf(13), color: MINT.muted, fontWeight: '500' },
  monthMeta: { flexDirection: 'row', alignItems: 'center', gap: rs(5), marginTop: rs(2) },
  monthMetaText: { fontSize: rf(12.5), color: MINT.muted, fontWeight: '500' },

  monthDivider: { width: 1, alignSelf: 'stretch', marginVertical: rs(6), backgroundColor: '#EAF0ED' },
  monthEarnings: { minWidth: rs(58), maxWidth: rs(96) },
  monthSalary: { fontSize: rf(13.5), fontWeight: '800' },
  monthSalaryPaid: { color: MINT.deep },
  monthSalaryEmpty: { color: MINT.text },
  monthEarningsLabel: { fontSize: rf(11.5), color: MINT.muted, marginTop: 2 },

  statusPill: { flexDirection: 'row', alignItems: 'center', gap: rs(4), paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: 999 },
  statusPillPaid: { backgroundColor: '#DCFCE7' },
  statusPillUnpaid: { backgroundColor: '#FFEDE3' },
  statusPillEmpty: { backgroundColor: '#F2F4F7' },
  statusPillText: { fontSize: rf(12), fontWeight: '700' },
});
