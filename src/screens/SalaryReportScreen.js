import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ticketApi } from '../api/client';
import { useTechnicianId } from '../auth/useTechnicianId';
import { rf } from '../utils/responsive';
import { payslipNetPayable, payslipPaid } from '../utils/payslip';

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
        <View style={styles.center}><ActivityIndicator color="#00008B" /></View>
      </SafeAreaView>
    );
  }

  // Rows are calendar Jan–Dec of `year`, so label it as the calendar year — not
  // a financial year (which would run Apr–Mar and mismatch the months shown).
  const fyLabel = String(year);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <View style={styles.fyCard}>
          <View style={styles.fyTextWrap}>
            <Text style={styles.fyLabel}>Year</Text>
            <Text style={styles.fyValue}>{fyLabel}</Text>
          </View>
          <View style={styles.yearPill}>
            <TouchableOpacity onPress={() => setYear((y) => y - 1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-back" size={14} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.yearPillText}>{year}</Text>
            <View style={styles.yearPillSep} />
            <TouchableOpacity onPress={() => setYear((y) => y + 1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <SummaryTile
            label="Total Present"
            value={`${totals.totalPresent}`}
            sub="Days"
            icon="calendar"
            color="#004C40"
            bg="#DCFCE7"
          />
          <SummaryTile
            label="Total Earned"
            value={formatRupee(totals.totalNet)}
            sub={`${totals.monthsPaid} mo paid`}
            icon="cash"
            color="#1E1EAC"
            bg="#E0E7FF"
          />
          <SummaryTile
            label="Avg / Month"
            value={formatRupee(totals.monthsWithPay > 0 ? Math.round(totals.totalNet / totals.monthsWithPay) : 0)}
            sub="Avg payout"
            icon="trending-up"
            color="#B45309"
            bg="#FEF3C7"
          />
        </View>

        <Text style={styles.sectionHeader}>Monthly Payslips</Text>

        {loading && list.length === 0 ? (
          <ActivityIndicator size="small" color="#00008B" style={{ marginVertical: 16 }} />
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
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryTile({ label, value, sub, icon, color, bg }) {
  return (
    <View style={styles.summaryTile}>
      <View style={[styles.summaryIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summarySub}>{sub}</Text>
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
        <Text style={styles.monthIndexText}>{String(index).padStart(2, '0')}</Text>
      </View>
      <View style={styles.monthMain}>
        <View style={styles.monthHeaderRow}>
          <Text style={styles.monthName}>{MONTHS_FULL[row.month - 1]}</Text>
          <Text style={styles.monthYear}>{row.year}</Text>
        </View>
        <View style={styles.monthBottomRow}>
          <View style={styles.monthMeta}>
            <Ionicons name="calendar-outline" size={11} color="#6B7280" />
            <Text style={styles.monthMetaText}>{row.presentDays ?? 0} Days</Text>
          </View>
          <View style={styles.monthSpacer} />
          <Text style={[styles.monthSalary, hasPay ? styles.monthSalaryPaid : styles.monthSalaryEmpty]}>
            {formatRupee(net)}
          </Text>
        </View>
      </View>
      <View style={styles.monthRight}>
        {isEmpty ? (
          <View style={[styles.statusPill, styles.statusPillEmpty]}>
            <Text style={styles.statusPillTextEmpty}>Pending</Text>
          </View>
        ) : isPaid ? (
          <View style={[styles.statusPill, styles.statusPillPaid]}>
            <Ionicons name="checkmark-circle" size={11} color="#FFFFFF" />
            <Text style={styles.statusPillText}>Paid</Text>
          </View>
        ) : (
          <View style={[styles.statusPill, styles.statusPillUnpaid]}>
            <Text style={styles.statusPillText}>Unpaid</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 12, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  fyCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  fyTextWrap: {},
  fyLabel: { fontSize: rf(11), color: '#6B7280', fontWeight: '600' },
  fyValue: { fontSize: rf(20), fontWeight: '800', color: '#111827', marginTop: 1 },

  yearPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1EAC', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, gap: 6 },
  yearPillText: { color: '#FFFFFF', fontSize: rf(12), fontWeight: '700' },
  yearPillSep: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.3)' },

  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  summaryTile: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 10, alignItems: 'flex-start' },
  summaryIconWrap: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  summaryValue: { fontSize: rf(14), fontWeight: '800', color: '#111827' },
  summaryLabel: { fontSize: rf(10), color: '#374151', fontWeight: '600', marginTop: 2 },
  summarySub: { fontSize: rf(9), color: '#9CA3AF', marginTop: 1 },

  sectionHeader: { fontSize: rf(13), fontWeight: '700', color: '#111827', marginTop: 14, marginBottom: 8 },

  monthCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 8, gap: 10 },
  monthCardEmpty: { backgroundColor: '#F9FAFB' },

  monthIndexBubble: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  monthIndexText: { fontSize: rf(11), fontWeight: '800', color: '#00008B' },

  monthMain: { flex: 1, minWidth: 0 },
  monthHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  monthName: { fontSize: rf(13), fontWeight: '700', color: '#111827' },
  monthYear: { fontSize: rf(11), color: '#9CA3AF', fontWeight: '600' },
  monthBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  monthMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  monthMetaText: { fontSize: rf(11), color: '#6B7280', fontWeight: '500' },
  monthSpacer: { flex: 1 },
  monthSalary: { fontSize: rf(13), fontWeight: '800' },
  monthSalaryPaid: { color: '#004C40' },
  monthSalaryEmpty: { color: '#9CA3AF' },

  monthRight: { alignItems: 'flex-end' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusPillPaid: { backgroundColor: '#004C40' },
  statusPillUnpaid: { backgroundColor: '#F97316' },
  statusPillEmpty: { backgroundColor: '#E5E7EB' },
  statusPillText: { fontSize: rf(10), fontWeight: '700', color: '#FFFFFF' },
  statusPillTextEmpty: { fontSize: rf(10), fontWeight: '700', color: '#6B7280' },
});
