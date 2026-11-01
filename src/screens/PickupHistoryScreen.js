import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components/Typography';
import { useFocusEffect } from '@react-navigation/native';
import { Check, ChevronDown, MapPin, PackageCheck, RefreshCw, Video, WifiOff } from 'lucide-react-native';
import { listMyAssignedPickups } from '../api/pickups';
import { useHideNativeHeader } from '../components/MintScreenHeader';
import { JobHeader, KIT } from '../components/JobCardKit';
import { rf, rs } from '../utils/responsive';
import { userMessage } from '../utils/userMessages';
// Oldest first by server time, one row per server event id (utils/pickups).
import {
  actorLabel, cancelInfo, deviceLabel, eventColor, eventLabel, fmtStamp, sortEvents, statusMeta, trackingId,
} from '../utils/pickups';

// Pickup Timeline — the complete audit trail of one pickup, oldest first:
// every server event (status, note, time, who, GPS check), plus the
// verification photos and the hand-over to the shop where the booking has
// them. Read-only; history rows are never changed here.
export default function PickupHistoryScreen({ navigation, route }) {
  useHideNativeHeader(navigation);
  const initial = route?.params?.booking || {};
  // The booking passed in is a snapshot (and from Estimate Detail it carries no
  // events at all), so re-read the live booking on every focus.
  const [booking, setBooking] = useState(initial);
  const [loading, setLoading] = useState(!Array.isArray(initial.events));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!initial.id) { setLoading(false); return; }
    try {
      const list = await listMyAssignedPickups();
      const fresh = (list || []).find((b) => b.id === initial.id);
      if (fresh) setBooking((prev) => ({ ...prev, ...fresh }));
      setError(null);
    } catch (e) {
      setError(userMessage(e, 'Could not refresh history'));
    } finally {
      setLoading(false);
    }
  }, [initial.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const [showAll, setShowAll] = useState(false);
  const events = sortEvents(booking.events);
  // The first 5 events; the rest behind "View all".
  const FIRST = 5;
  const shownEvents = showAll ? events : events.slice(0, FIRST);
  const cancel = cancelInfo(booking);
  const st = cancel ? { label: cancel.byMe ? 'Failed' : 'Cancelled', color: '#F32C26', bg: '#F32C261A' } : statusMeta(booking.status);
  const handover = events.filter((e) => String(e.status).toUpperCase() === 'RECEIVED_AT_SHOP').pop();
  const photos = [{ url: booking.frontImageUrl, label: 'Front' }, { url: booking.backImageUrl, label: 'Back' }].filter((p) => p.url);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <JobHeader navigation={navigation} title="Pickup Timeline" sub={`${events.length} ${events.length === 1 ? 'event' : 'events'}`} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={KIT.teal} colors={[KIT.teal]} />}
      >
        {/* Pickup */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.id} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{trackingId(booking)}</Text>
              <Text style={styles.title} numberOfLines={1}>{booking.customerName || 'Customer'}</Text>
              <Text style={styles.muted} numberOfLines={1}>{deviceLabel(booking)}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeText, { color: st.color }]} numberOfLines={1}>{st.label}</Text></View>
          </View>
          {cancel?.note ? <Text style={styles.cancel}>{cancel.byMe ? 'Pickup failed' : 'Cancelled'}: {cancel.note}</Text> : null}
        </View>

        {/* Hand-over to the shop */}
        {handover ? (
          <View style={[styles.card, styles.handover]}>
            <View style={[styles.circle, { backgroundColor: '#609138' }]}><PackageCheck size={rs(16)} color="#FFFFFF" strokeWidth={2.4} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardTitle}>Handed over to shop</Text>
              <Text style={styles.muted}>{fmtStamp(handover.createdAt)} · by {actorLabel(handover.actor)}</Text>
              {handover.note ? <Text style={styles.note}>{handover.note}</Text> : null}
            </View>
          </View>
        ) : null}

        {/* Verification photos / video saved with the pickup estimate */}
        {photos.length || booking.videoUrl ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Verification Photos</Text>
            <View style={styles.photos}>
              {photos.map((p) => (
                <View key={p.url} style={styles.photoBox}>
                  <Image source={{ uri: p.url }} style={styles.photo} resizeMode="cover" />
                  <Text style={styles.photoCap}>{p.label}</Text>
                </View>
              ))}
              {booking.videoUrl ? (
                <View style={styles.photoBox}>
                  <View style={[styles.photo, styles.videoTile]}><Video size={rs(22)} color={KIT.teal} strokeWidth={2} /></View>
                  <Text style={styles.photoCap}>Video</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Every event, oldest first */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Status Timeline</Text>
          {error ? (
            <TouchableOpacity onPress={() => { setLoading(true); load(); }} activeOpacity={0.85} style={styles.errorCard} accessibilityRole="button">
              <WifiOff size={rs(14)} color="#F32C26" />
              <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
              <View style={styles.retry}><RefreshCw size={rs(11)} color="#FFFFFF" strokeWidth={2.6} /><Text style={styles.retryText}>Retry</Text></View>
            </TouchableOpacity>
          ) : null}
          {loading && events.length === 0 ? (
            <ActivityIndicator color={KIT.teal} style={{ paddingVertical: rs(16) }} />
          ) : events.length === 0 ? (
            <Text style={styles.empty}>No pickup history yet.</Text>
          ) : shownEvents.map((event, index) => {
            const isLast = index === shownEvents.length - 1;
            const color = eventColor(event.status);
            return (
              <View key={event.id || `${event.status}-${index}`} style={styles.eventRow}>
                <View style={styles.rail}>
                  <View style={[styles.dot, { backgroundColor: color }]}><Check size={rs(10)} color="#FFFFFF" strokeWidth={3} /></View>
                  {!isLast ? <View style={styles.line} /> : null}
                </View>
                <View style={styles.eventBody}>
                  <Text style={styles.eventStatus}>{eventLabel(event.status)}</Text>
                  {event.note ? <Text style={styles.note}>{event.note}</Text> : null}
                  <Text style={styles.eventMeta}>{[fmtStamp(event.createdAt), `by ${actorLabel(event.actor)}`].filter(Boolean).join(' · ')}</Text>
                  {event.distanceMeters != null ? (
                    <View style={styles.gps}>
                      <MapPin size={rs(11)} color="#6B7280" />
                      <Text style={styles.eventMeta}>GPS check: {event.distanceMeters} m away</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
          {events.length > FIRST ? (
            <TouchableOpacity onPress={() => setShowAll((v) => !v)} activeOpacity={0.8} accessibilityRole="button" style={styles.moreBtn}>
              <Text style={styles.moreText}>{showAll ? 'Show less' : `View all (${events.length})`}</Text>
              <ChevronDown size={rs(15)} color={KIT.teal} strokeWidth={2.4} style={{ transform: [{ rotate: showAll ? '180deg' : '0deg' }] }} />
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const shadow = { shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 };
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: rs(12), paddingBottom: rs(28), gap: rs(10) },
  card: { backgroundColor: '#FFFFFF', borderRadius: rs(14), borderWidth: 1, borderColor: '#EEF0F2', padding: rs(12), ...shadow },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(10) },
  id: { fontSize: rf(12.5), fontWeight: '800', color: KIT.teal },
  title: { fontSize: rf(15), fontWeight: '800', color: '#111111', marginTop: 1 },
  muted: { fontSize: rf(12), color: '#6B7280', marginTop: 1 },
  badge: { paddingHorizontal: rs(9), paddingVertical: rs(3), borderRadius: 999, maxWidth: '40%' },
  badgeText: { fontSize: rf(11), fontWeight: '800' },
  cancel: { fontSize: rf(12.5), color: '#F32C26', fontWeight: '700', marginTop: rs(8) },
  cardTitle: { fontSize: rf(14), fontWeight: '800', color: '#1C3053', marginBottom: rs(6) },
  handover: { flexDirection: 'row', alignItems: 'center', gap: rs(10), backgroundColor: '#F4FAEF', borderColor: '#60913833' },
  circle: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: rf(12), color: '#374151', marginTop: rs(2) },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(10) },
  photoBox: { alignItems: 'center' },
  photo: { width: rs(88), height: rs(88), borderRadius: rs(12), backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#EEF0F2' },
  videoTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5F3F5' },
  photoCap: { marginTop: rs(4), fontSize: rf(11.5), fontWeight: '700', color: '#6B7280' },
  eventRow: { flexDirection: 'row' },
  rail: { width: rs(26), alignItems: 'center' },
  dot: { width: rs(20), height: rs(20), borderRadius: rs(10), alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, backgroundColor: '#E5F3F5', marginVertical: 3 },
  eventBody: { flex: 1, paddingBottom: rs(12), paddingLeft: rs(4) },
  eventStatus: { fontSize: rf(13), color: '#111111', fontWeight: '800' },
  eventMeta: { fontSize: rf(11), color: '#6B7280', marginTop: rs(2) },
  gps: { flexDirection: 'row', alignItems: 'center', gap: rs(4) },
  empty: { textAlign: 'center', color: '#6B7280', fontSize: rf(12.5), paddingVertical: rs(16) },
  moreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(5), height: rs(38), marginTop: rs(2),
    borderRadius: rs(10), borderWidth: 1, borderColor: KIT.teal, backgroundColor: '#FFFFFF',
  },
  moreText: { fontSize: rf(13), fontWeight: '800', color: KIT.teal },
  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8), marginBottom: rs(8), padding: rs(9), borderRadius: rs(12),
    backgroundColor: '#FEECEC', borderWidth: 1, borderColor: '#FBD5D4',
  },
  errorText: { flex: 1, fontSize: rf(12), fontWeight: '700', color: '#B42318' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: rs(4), backgroundColor: '#F32C26', borderRadius: 999, paddingHorizontal: rs(9), paddingVertical: rs(4) },
  retryText: { fontSize: rf(11), fontWeight: '800', color: '#FFFFFF' },
});
