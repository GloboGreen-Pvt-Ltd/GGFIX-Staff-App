import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ChartColumn, History, IndianRupee, MapPin, RefreshCw, Store, Truck, WifiOff } from 'lucide-react-native';
import { Text } from '../../components/Typography';
import { JobHeader, JobPictureCard, JobRail, KIT } from '../../components/JobCardKit';
import { DELIVERY_STATUS, DELIVERY_TABS, listMyDeliveries } from '../../api/buyDeliveries';
import { fmtShortStamp } from '../../utils/pickups';
import { rf, rs } from '../../utils/responsive';
import { Section } from '../PickupAssignScreen';
import { apiError, money } from './deliveryKit';

// Rail tiles + list sections, laid out like My Pickups: All, then the
// DELIVERY_TABS stages (Pickup from shop → Delivery → History).
const LOOK = {
  PICKUP: { title: 'Pickup from Shop', icon: Store, tone: 'blue', color: '#0788C9', empty: 'No pickups pending.' },
  DELIVERY: { title: 'Out for Delivery', icon: Truck, tone: 'orange', color: '#FAA700', empty: 'No deliveries in progress.' },
  HISTORY: { title: 'Delivery History', icon: History, tone: 'green', color: '#609138', empty: 'No past deliveries.' },
};
const TILES = [
  { key: 'ALL', label: 'All', title: 'All Deliveries', icon: ChartColumn, tone: 'teal', color: '#035C6C', statuses: null, empty: 'No deliveries assigned yet.' },
  ...DELIVERY_TABS.map((t) => ({ ...t, ...LOOK[t.key] })),
];
const tileOf = (o) => TILES.find((t) => t.statuses && t.statuses.includes(o.status)) || TILES[0];

// My Deliveries — fixed-price Buy orders this employee picks up from the shop
// and delivers. Counts come from the server list; only own orders are returned.
export default function BuyDeliveriesScreen({ navigation, route }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState(route?.params?.filter || null); // a TILES key, or null for the sections
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await listMyDeliveries()); setError(''); }
    catch (e) { setError(apiError(e, 'Could not load your assignments.')); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const list = rows || [];
  const byTile = useMemo(() => Object.fromEntries(TILES.map((t) => [t.key, t.statuses ? list.filter((o) => t.statuses.includes(o.status)) : list])), [list]);
  const counts = useMemo(() => Object.fromEntries(TILES.map((t) => [t.key, byTile[t.key].length])), [byTile]);
  const active = TILES.find((t) => t.key === filter) || null;

  const renderCards = (items) => items.map((o) => {
    const look = tileOf(o);
    const failed = o.status === 'DELIVERY_FAILED';
    return (
      <JobPictureCard
        key={o.id}
        compact
        ticket={{ id: o.id, deviceImageUrl: o.productImage, deviceDisplayName: o.productTitle }}
        tab={DELIVERY_STATUS[o.status] || o.status}
        tabColor={failed ? '#F32C26' : look.color}
        refText={o.orderNumber}
        model={`${o.productTitle || 'Product'}${o.quantity > 1 ? ` × ${o.quantity}` : ''}`}
        lines={[
          { text: o.customerName },
          { icon: IndianRupee, text: o.totalAmount != null ? `COD ${money(o.totalAmount)}` : null },
          { icon: look.key === 'PICKUP' ? Store : look.key === 'DELIVERY' ? Truck : MapPin, text: look.key === 'PICKUP' ? (o.shopName || o.shopAddress) : o.deliveryAddress },
        ]}
        date={fmtShortStamp(o.updatedAt || o.createdAt) || null}
        time={null}
        onPress={() => navigation.navigate('BuyDelivery', { id: o.id })}
      />
    );
  });

  const firstLoad = rows === null && !error;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <JobHeader navigation={navigation} title="My Deliveries" sub="Shop pickup → Customer delivery" />
      <View style={styles.body}>
        <JobRail items={TILES} counts={firstLoad ? {} : counts} active={filter} onPick={(k) => setFilter((f) => (f === k ? null : k))} softBorder />
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} colors={[KIT.teal]} tintColor={KIT.teal} />}
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <TouchableOpacity onPress={load} activeOpacity={0.85} style={styles.errorCard} accessibilityRole="button">
              <WifiOff size={rs(16)} color="#F32C26" />
              <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
              <View style={styles.retry}><RefreshCw size={rs(12)} color="#FFFFFF" strokeWidth={2.6} /><Text style={styles.retryText}>Retry</Text></View>
            </TouchableOpacity>
          ) : null}

          {firstLoad ? <ActivityIndicator color={KIT.teal} style={{ marginTop: rs(24) }} /> : active ? (
            <Section title={active.title} icon={active.icon} color={active.color} count={byTile[active.key].length} empty={active.empty}
              onClear={active.key === 'ALL' ? null : () => setFilter(null)}>
              {renderCards(byTile[active.key])}
            </Section>
          ) : !list.length ? (
            rows ? <Text style={styles.emptyLine}>No deliveries assigned yet.</Text> : null
          ) : (
            // Only sections with orders, in delivery order.
            TILES.filter((t) => t.statuses && byTile[t.key].length).map((t) => (
              <Section key={t.key} title={t.title} icon={t.icon} color={t.color} count={byTile[t.key].length}>{renderCards(byTile[t.key])}</Section>
            ))
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Same layout values as My Pickups (PickupAssignScreen).
  safe: { flex: 1, backgroundColor: KIT.white },
  body: { flex: 1, flexDirection: 'row', backgroundColor: KIT.white },
  list: { flex: 1 },
  content: { paddingTop: rs(10), paddingLeft: rs(11), paddingRight: rs(9), paddingBottom: rs(24) },
  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8), marginBottom: rs(10), padding: rs(10), borderRadius: rs(12),
    backgroundColor: '#FEECEC', borderWidth: 1, borderColor: '#FBD5D4',
  },
  errorText: { flex: 1, fontSize: rf(12), fontWeight: '700', color: '#B42318' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: rs(4), backgroundColor: '#F32C26', borderRadius: 999, paddingHorizontal: rs(10), paddingVertical: rs(5) },
  retryText: { fontSize: rf(11), fontWeight: '800', color: '#FFFFFF' },
  emptyLine: {
    fontSize: rf(12), color: '#6B7280', backgroundColor: '#FFFFFF', borderRadius: rs(12), borderWidth: 1, borderColor: '#EEF0F2',
    paddingVertical: rs(10), paddingHorizontal: rs(12),
  },
});
