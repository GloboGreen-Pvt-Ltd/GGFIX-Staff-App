import React, { useCallback, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Image, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  AlertTriangle, ArrowRightCircle, CalendarDays, Check, ClipboardCheck, Clock, FileText, History, MapPin, Navigation,
  Phone, Smartphone, User, Video, Wrench,
} from 'lucide-react-native';
import { Text } from '../components/Typography';
import MintScreenHeader, { useHideNativeHeader } from '../components/MintScreenHeader';
import { callCustomer, openDirections } from '../components/PickupCard';
import PickupProblemSheet from '../components/PickupProblemSheet';
import { getPickupRepairEstimate, listMyAssignedPickups } from '../api/pickups';
import usePickupAdvance from '../utils/usePickupAdvance';
import {
  PICKUP_STEPS, actorLabel, canReportProblem, cancelInfo, customerPhone, deviceLabel, eventColor, eventLabel, fmtDay, fmtStamp,
  isPastPickup, issueLabel, nextStatusFor, overlapsFor, pickupDay, relDay, slotLabel, sortEvents, statusMeta, stepIndex, trackingId,
} from '../utils/pickups';
import { rf, rs } from '../utils/responsive';
import { userMessage } from '../utils/userMessages';

const STEP_FROM = PICKUP_STEPS.findIndex((st) => st.key === 'ESTIMATE');
const money = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : `₹${Number(v).toLocaleString('en-IN')}`);
const imageOf = (b) => b?.deviceImageUrl || b?.modelImageUrl
  || ((b?.deviceImageBase64 || b?.modelImageBase64) ? `data:image/png;base64,${String(b.deviceImageBase64 || b.modelImageBase64).replace(/^data:[^,]+,/, '')}` : null);

// Pickup Details — one booking from the pickup person's list (the server has
// no single-booking read for them), plus the saved estimate / verification.
export default function PickupDetailsScreen({ navigation, route }) {
  useHideNativeHeader(navigation);
  const insets = useSafeAreaInsets();
  const bookingId = route?.params?.bookingId || route?.params?.booking?.id;
  const [booking, setBooking] = useState(route?.params?.booking || null);
  const [estimate, setEstimate] = useState(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(!route?.params?.booking);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [problem, setProblem] = useState(false);
  const [others, setOthers] = useState([]); // the rest of my pickups, for schedule clashes

  const load = useCallback(async () => {
    if (!bookingId) { setLoading(false); return; }
    try {
      const rows = await listMyAssignedPickups();
      const fresh = (rows || []).find((b) => b.id === bookingId) || null;
      setMissing(!fresh);
      setOthers(rows || []);
      if (fresh) {
        setBooking(fresh);
        // From the estimate step on — including once the shop has moved the
        // booking on to its repair statuses — read the saved estimate.
        if (isPastPickup(fresh.status) || stepIndex(fresh.status) >= STEP_FROM) {
          getPickupRepairEstimate(bookingId).then((e) => setEstimate(e || null)).catch(() => {});
        }
      }
      setError(null);
    } catch (e) {
      setError(userMessage(e, 'Could not load pickup.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const { advance, busyId } = usePickupAdvance({ navigation, onDone: load });

  if (loading && !booking) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <MintScreenHeader title="Pickup Details" navigation={navigation} />
        <ActivityIndicator color="#035C6C" style={{ marginTop: rs(40) }} />
      </SafeAreaView>
    );
  }
  if (!booking || missing) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <MintScreenHeader title="Pickup Details" navigation={navigation} />
        <View style={s.state}>
          <AlertTriangle size={rs(26)} color="#FAA700" />
          <Text style={s.stateText}>{error || 'This pickup is no longer assigned to you.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const st = statusMeta(booking.status);
  // Past the pickup (shop repair statuses) = every pickup step done.
  const idx = isPastPickup(booking.status) ? PICKUP_STEPS.length - 1 : stepIndex(booking.status);
  const next = nextStatusFor(booking.status);
  const cancel = cancelInfo(booking);
  const events = sortEvents(booking.events);
  // Latest event of a step; for a stopped pickup, the last step it reached.
  const stepEvent = (step) => events.filter((e) => step.codes.includes(String(e.status).toUpperCase())).pop();
  const reached = PICKUP_STEPS.reduce((m, step, i) => (stepEvent(step) ? i : m), -1);
  const slot = slotLabel(booking);
  const img = imageOf(booking);
  const est = { ...booking, ...(estimate || {}) };
  const services = Array.isArray(est.services) ? est.services : [];
  const missingParts = String(est.missingDamageParts || '').split(',').map((x) => x.trim()).filter(Boolean);
  const photos = [{ url: est.frontImageUrl, label: 'Front' }, { url: est.backImageUrl, label: 'Back' }].filter((p) => p.url);
  const approved = est.customerApproval === 'DONE' || est.customerApproval === true;
  const hasVerification = idx >= STEP_FROM && (services.length || est.estimateAmount != null || missingParts.length || est.customerApproval);
  const phone = customerPhone(booking);
  const clash = overlapsFor(booking, others);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <MintScreenHeader title="Pickup Details" navigation={navigation} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#035C6C']} tintColor="#035C6C" />}>
        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* Device + status */}
        <View style={s.card}>
          <View style={s.row}>
            {img ? <Image source={{ uri: img }} style={s.deviceImg} resizeMode="contain" /> : (
              <View style={[s.deviceImg, s.deviceStub]}><Smartphone size={rs(22)} color="#035C6C" /></View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.id} numberOfLines={1}>{trackingId(booking)}</Text>
              <Text style={s.device} numberOfLines={2}>{deviceLabel(booking)}</Text>
              {[booking.ramLabel, booking.storageLabel, booking.color].filter(Boolean).length ? (
                <Text style={s.muted} numberOfLines={1}>{[booking.ramLabel, booking.storageLabel, booking.color].filter(Boolean).join(' · ')}</Text>
              ) : null}
            </View>
            <View style={[s.pill, { backgroundColor: st.bg }]}><Text style={[s.pillText, { color: st.color }]} numberOfLines={1}>{st.label}</Text></View>
          </View>
          <View style={s.issue}>
            <FileText size={rs(13)} color="#6B7280" />
            <Text style={s.issueText}>{issueLabel(booking)}</Text>
          </View>
          {cancel ? <Text style={s.cancel}>{cancel.byMe ? 'Pickup failed' : 'Cancelled by the shop or customer'}{cancel.note ? `: ${cancel.note}` : ''}</Text> : null}
        </View>

        {/* Customer + where / when */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Customer & Pickup</Text>
          <Line icon={User} text={booking.customerName || 'Customer'} strong />
          {phone ? <Line icon={Phone} text={phone} /> : null}
          <Line icon={CalendarDays} text={`${relDay(pickupDay(booking))} · ${fmtDay(pickupDay(booking))}`} />
          <Line icon={Clock} text={slot || 'No time slot set'} />
          {booking.pickupAddressText ? <Line icon={MapPin} text={booking.pickupAddressText} /> : null}
          {clash.length ? (
            <View style={s.clash}>
              <AlertTriangle size={rs(14)} color="#B45309" />
              <Text style={s.clashText}>Overlaps with {clash.map((o) => `${trackingId(o)} (${slotLabel(o)})`).join(', ')}</Text>
            </View>
          ) : null}
          <View style={s.quick}>
            <Quick icon={Phone} label="Call" color="#609138" onPress={() => callCustomer(booking)} disabled={!phone} />
            <Quick icon={Navigation} label="Directions" color="#035C6C" onPress={() => openDirections(booking)} disabled={!booking.pickupAddressText} />
            <Quick icon={History} label="History" color="#1C3053" onPress={() => navigation.navigate('PickupHistory', { booking })} />
          </View>
        </View>

        {/* Pickup progress — the backend steps top to bottom: when and by whom
            each was done (GPS distance on the location checks), the photos /
            video at the estimate step where they were uploaded, the next step
            on the current one, and a failed / cancelled row where it stopped. */}
        <View style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.cardTitle}>Pickup Progress</Text>
            <Text style={s.stepCount}>{cancel ? 'Stopped' : idx >= 0 ? `Step ${idx + 1} of ${PICKUP_STEPS.length}` : ''}</Text>
          </View>
          {PICKUP_STEPS.map((step, i) => {
            const last = i === PICKUP_STEPS.length - 1;
            const done = cancel ? i <= reached : (idx > i || (idx === i && last));
            const current = !cancel && idx === i && !done;
            const ev = stepEvent(step);
            const color = done ? '#609138' : current ? '#035C6C' : '#C9CDD2';
            const showMedia = step.key === 'ESTIMATE' && (photos.length || est.videoUrl);
            return (
              <View key={step.key} style={s.step}>
                <View style={s.rail}>
                  <View style={[s.dot, { backgroundColor: done || current ? color : '#FFFFFF', borderColor: color }]}>
                    {done ? <Check size={rs(11)} color="#FFFFFF" strokeWidth={3} /> : current ? <View style={s.dotInner} /> : null}
                  </View>
                  {!last || cancel ? <View style={[s.line, { backgroundColor: done && (cancel ? i < reached : idx > i) ? '#609138' : '#E5E7EB' }]} /> : null}
                </View>
                <View style={s.stepBody}>
                  <Text style={[s.stepLabel, current && { color: '#035C6C' }, !done && !current && s.stepPending]}>{step.label}</Text>
                  {ev ? (
                    <Text style={s.small}>
                      {[fmtStamp(ev.createdAt), `by ${actorLabel(ev.actor)}`, ev.distanceMeters != null ? `${ev.distanceMeters} m away` : null].filter(Boolean).join(' · ')}
                    </Text>
                  ) : current && next ? <Text style={[s.small, { color: '#035C6C', fontWeight: '700' }]}>Next: {next.label}</Text> : null}
                  {showMedia ? (
                    <View style={s.photos}>
                      {photos.map((p) => (
                        <View key={p.url} style={s.photoBox}>
                          <Image source={{ uri: p.url }} style={s.photo} resizeMode="cover" />
                          <Text style={s.photoCap}>{p.label}</Text>
                        </View>
                      ))}
                      {est.videoUrl ? (
                        <View style={s.photoBox}>
                          <View style={[s.photo, s.videoTile]}><Video size={rs(20)} color="#035C6C" strokeWidth={2} /></View>
                          <Text style={s.photoCap}>Video</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {last && isPastPickup(booking.status) ? <Text style={s.small}>Shop: {eventLabel(booking.status)}</Text> : null}
                </View>
              </View>
            );
          })}
          {cancel ? (
            <View style={s.step}>
              <View style={s.rail}>
                <View style={[s.dot, { backgroundColor: '#F32C26', borderColor: '#F32C26' }]}><AlertTriangle size={rs(10)} color="#FFFFFF" strokeWidth={2.8} /></View>
              </View>
              <View style={s.stepBody}>
                <Text style={[s.stepLabel, { color: '#F32C26' }]}>{cancel.byMe ? 'Pickup failed' : 'Cancelled'}</Text>
                <Text style={s.small}>{[fmtStamp(cancel.at), cancel.note].filter(Boolean).join(' · ')}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Verification (what the estimate step saved) */}
        {hasVerification ? (
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>Pickup Verification</Text>
              <TouchableOpacity onPress={() => navigation.navigate('PickupEstimateDetail', { booking: est, bookingId })} hitSlop={6} accessibilityRole="button">
                <Text style={s.link}>View estimate</Text>
              </TouchableOpacity>
            </View>
            {services.map((sv, i) => (
              <View key={sv.id || i} style={s.svc}>
                <Wrench size={rs(14)} color="#035C6C" strokeWidth={2.2} />
                <Text style={s.kvLabel} numberOfLines={2}>{sv.serviceName || sv.name || 'Service'}</Text>
                <Text style={s.kvValue}>{money(sv.price ?? sv.estimatedPrice) || '—'}</Text>
              </View>
            ))}
            {money(est.estimateAmount) ? (
              <View style={s.total}><Text style={s.kvStrong}>Estimated amount</Text><Text style={s.kvStrong}>{money(est.estimateAmount)}</Text></View>
            ) : null}
            {missingParts.length || est.customerApproval ? (
              <View style={s.chips}>
                {missingParts.length ? (
                  <View style={[s.chip, { backgroundColor: '#FFF8E1', borderColor: '#FAA70055' }]}>
                    <Text style={[s.chipText, { color: '#9A6700' }]}>Missing / damaged: {missingParts.join(', ')}</Text>
                  </View>
                ) : null}
                {est.customerApproval ? (
                  <View style={[s.chip, approved ? { backgroundColor: '#EEF6E8', borderColor: '#60913855' } : { backgroundColor: '#FFF8E1', borderColor: '#FAA70055' }]}>
                    <Text style={[s.chipText, { color: approved ? '#609138' : '#9A6700' }]}>Customer approval: {approved ? 'Approved' : String(est.customerApproval)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {/* Photos / video are shown in Pickup Progress, at the estimate step. */}
          </View>
        ) : null}

        {/* Recent activity — the latest 3 events; the full audit trail is one tap away. */}
        {events.length ? (
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>Recent Activity</Text>
              <Text style={s.stepCount}>{events.length} {events.length === 1 ? 'event' : 'events'}</Text>
            </View>
            {events.slice(-3).reverse().map((e, i) => (
              <View key={e.id || i} style={s.event}>
                <View style={[s.eventDot, { backgroundColor: eventColor(e.status) }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.eventTitle}>{eventLabel(e.status)}</Text>
                  {e.note ? <Text style={s.small} numberOfLines={2}>{e.note}</Text> : null}
                  <Text style={s.small}>{[fmtStamp(e.createdAt), `by ${actorLabel(e.actor)}`].filter(Boolean).join(' · ')}</Text>
                </View>
              </View>
            ))}
            <TouchableOpacity onPress={() => navigation.navigate('PickupHistory', { booking })} activeOpacity={0.8} accessibilityRole="button" style={s.fullBtn}>
              <History size={rs(14)} color="#035C6C" strokeWidth={2.4} />
              <Text style={s.fullText}>View Full History</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      {next || canReportProblem(booking) ? (
        // Side by side, the next step wider; labels wrap to two lines instead of
        // clipping on narrow phones. Clears the Android navigation bar.
        <View style={[s.bar, { paddingBottom: rs(10) + insets.bottom }]}>
          {canReportProblem(booking) ? (
            <TouchableOpacity onPress={() => setProblem(true)} disabled={!!busyId} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Unable to pickup"
              style={[s.problemBtn, next && { flex: 1 }]}>
              <AlertTriangle size={rs(15)} color="#F32C26" strokeWidth={2.4} />
              <Text style={s.problemText} numberOfLines={2}>Unable to Pickup</Text>
            </TouchableOpacity>
          ) : null}
          {next ? (
            <TouchableOpacity onPress={() => advance(booking)} disabled={!!busyId} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={next.label}
              style={[s.nextBtn, busyId && { opacity: 0.6 }]}>
              {busyId ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
                <>
                  {next.action === 'estimate' ? <ClipboardCheck size={rs(16)} color="#FFFFFF" strokeWidth={2.4} /> : <ArrowRightCircle size={rs(16)} color="#FFFFFF" strokeWidth={2.4} />}
                  <Text style={s.nextText} numberOfLines={2}>{next.label}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <PickupProblemSheet booking={booking} visible={problem} onClose={() => setProblem(false)} onDone={load} />
    </SafeAreaView>
  );
}

function Line({ icon: Icon, text, strong }) {
  return (
    <View style={s.line2}>
      <Icon size={rs(14)} color="#6B7280" />
      <Text style={[s.lineText, strong && { fontWeight: '800', color: '#111111' }]}>{text}</Text>
    </View>
  );
}

function Quick({ icon: Icon, label, color, onPress, disabled }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={label}
      style={[s.quickBtn, { backgroundColor: `${color}12`, borderColor: `${color}33` }, disabled && { opacity: 0.45 }]}>
      <Icon size={rs(13)} color={color} strokeWidth={2.4} />
      <Text style={[s.quickText, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: rs(14), paddingBottom: rs(24), gap: rs(10) },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: rs(14), borderWidth: 1, borderColor: '#EEF0F2', padding: rs(12),
    shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deviceImg: { width: rs(60), height: rs(60), borderRadius: rs(12), backgroundColor: '#F3F4F6' },
  deviceStub: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5F3F5' },
  id: { fontSize: rf(12.5), fontWeight: '800', color: '#035C6C' },
  device: { fontSize: rf(16), fontWeight: '800', color: '#111111', marginTop: 1 },
  muted: { fontSize: rf(12.5), color: '#6B7280', marginTop: 1 },
  pill: { paddingHorizontal: rs(9), paddingVertical: rs(3), borderRadius: 999, maxWidth: '38%', alignSelf: 'flex-start' },
  pillText: { fontSize: rf(11), fontWeight: '800' },
  issue: { flexDirection: 'row', gap: rs(6), marginTop: rs(10), backgroundColor: '#F9FAFB', borderRadius: rs(10), padding: rs(9) },
  issueText: { flex: 1, fontSize: rf(13.5), color: '#1C3053', fontWeight: '600', lineHeight: rf(19) },
  cancel: { fontSize: rf(12.5), color: '#F32C26', fontWeight: '700', marginTop: rs(8) },
  cardTitle: { fontSize: rf(14), fontWeight: '800', color: '#1C3053', marginBottom: rs(8) },
  line2: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(8), marginBottom: rs(7) },
  lineText: { flex: 1, fontSize: rf(13.5), color: '#374151', lineHeight: rf(19) },
  quick: { flexDirection: 'row', gap: rs(6), marginTop: rs(4) },
  clash: {
    flexDirection: 'row', alignItems: 'flex-start', gap: rs(6), marginBottom: rs(8), padding: rs(8), borderRadius: rs(10),
    backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FAA70055',
  },
  clashText: { flex: 1, fontSize: rf(12.5), fontWeight: '700', color: '#9A6700' },
  quickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(5), height: rs(38), paddingHorizontal: rs(4), borderRadius: rs(10), borderWidth: 1 },
  quickText: { fontSize: rf(12.5), fontWeight: '800' },
  stepCount: { fontSize: rf(11.5), fontWeight: '700', color: '#6B7280', marginBottom: rs(8) },
  step: { flexDirection: 'row' },
  rail: { width: rs(26), alignItems: 'center' },
  dot: { width: rs(20), height: rs(20), borderRadius: rs(10), borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: '#FFFFFF' },
  line: { flex: 1, width: 2, marginVertical: 2, minHeight: rs(10) },
  stepBody: { flex: 1, minWidth: 0, paddingLeft: rs(6), paddingBottom: rs(10) },
  stepLabel: { fontSize: rf(13.5), fontWeight: '800', color: '#111111' },
  stepPending: { color: '#9CA3AF', fontWeight: '600' },
  small: { fontSize: rf(11.5), color: '#6B7280', marginTop: 1 },
  link: { fontSize: rf(12.5), fontWeight: '800', color: '#035C6C', marginBottom: rs(8) },
  svc: { flexDirection: 'row', alignItems: 'center', gap: rs(8), paddingVertical: rs(6), borderBottomWidth: 1, borderBottomColor: '#F1F3F5' },
  kvLabel: { flex: 1, fontSize: rf(13), color: '#374151' },
  kvValue: { fontSize: rf(13), fontWeight: '800', color: '#111111' },
  total: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: rs(8),
    paddingVertical: rs(8), paddingHorizontal: rs(10), borderRadius: rs(10), backgroundColor: '#E5F3F5',
  },
  kvStrong: { fontSize: rf(13.5), fontWeight: '800', color: '#035C6C' },
  chips: { gap: rs(6), marginTop: rs(8) },
  chip: { borderRadius: rs(10), borderWidth: 1, paddingVertical: rs(6), paddingHorizontal: rs(10) },
  chipText: { fontSize: rf(12.5), fontWeight: '700' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(10), marginTop: rs(10) },
  photoBox: { alignItems: 'center' },
  photo: { width: rs(76), height: rs(76), borderRadius: rs(12), backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#EEF0F2' },
  videoTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5F3F5' },
  photoCap: { marginTop: rs(4), fontSize: rf(11.5), fontWeight: '700', color: '#6B7280' },
  event: { flexDirection: 'row', gap: rs(9), paddingVertical: rs(6), borderBottomWidth: 1, borderBottomColor: '#F1F3F5' },
  eventDot: { width: rs(9), height: rs(9), borderRadius: rs(5), marginTop: rs(5) },
  eventTitle: { fontSize: rf(13), fontWeight: '800', color: '#111111' },
  fullBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6), marginTop: rs(10), height: rs(38),
    borderRadius: rs(10), borderWidth: 1, borderColor: '#035C6C', backgroundColor: '#FFFFFF',
  },
  fullText: { fontSize: rf(13), fontWeight: '800', color: '#035C6C' },
  error: { fontSize: rf(12), color: '#F32C26', fontWeight: '700' },
  state: { alignItems: 'center', padding: rs(30), gap: rs(10) },
  stateText: { fontSize: rf(13), color: '#6B7280', textAlign: 'center' },
  bar: {
    flexDirection: 'row', alignItems: 'stretch', gap: rs(8), paddingHorizontal: rs(12), paddingTop: rs(10),
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F2',
  },
  problemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(5), paddingHorizontal: rs(10), minHeight: rs(48),
    borderRadius: rs(13), borderWidth: 1.5, borderColor: '#F32C26', backgroundColor: '#FFFFFF',
  },
  problemText: { flexShrink: 1, fontSize: rf(13), fontWeight: '800', color: '#F32C26', textAlign: 'center' },
  nextBtn: {
    flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6), minHeight: rs(48), paddingHorizontal: rs(10),
    borderRadius: rs(13), backgroundColor: '#035C6C',
  },
  nextText: { flexShrink: 1, fontSize: rf(13.5), fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
});
