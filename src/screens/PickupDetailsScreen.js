import React, { useCallback, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Image, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  AlertTriangle, ArrowRightCircle, CalendarDays, Check, ClipboardCheck, Clock, FileText, History, MapPin, Navigation,
  Phone, Smartphone, User, Video, Wrench,
} from 'lucide-react-native';
import { Text } from '../components/Typography';
import { useHideNativeHeader } from '../components/MintScreenHeader';
import { JobHeader, DevicePhoto } from '../components/JobCardKit';
import { callCustomer, openDirections } from '../components/PickupCard';
import PickupProblemSheet from '../components/PickupProblemSheet';
import PickupDeclineSheet from '../components/PickupDeclineSheet';
import { getPickupRepairEstimate, listMyAssignedPickups } from '../api/pickups';
import usePickupAdvance from '../utils/usePickupAdvance';
import {
  PICKUP_STEPS, stepsFor, actorLabel, awaitingAccept, canReportProblem, cancelInfo, customerPhone, deviceLabel, eventColor, eventLabel, fmtDay, fmtStamp,
  isPastPickup, issueLabel, nextStepFor, overlapsFor, pickupDay, relDay, serverAcceptance, slotLabel, sortEvents, statusMeta, stepIndex, trackingId,
} from '../utils/pickups';
import { rf, rs, rlh } from '../utils/responsive';
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
  const [declineOpen, setDeclineOpen] = useState(false);
  const [others, setOthers] = useState([]); // the rest of my pickups, for schedule clashes
  // The action bar waits for the first server read: the booking passed in
  // from the list can be stale, and a step worked out from it could be wrong.
  const [synced, setSynced] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId) { setLoading(false); return; }
    try {
      const rows = await listMyAssignedPickups();
      const fresh = (rows || []).find((b) => b.id === bookingId) || null;
      setMissing(!fresh);
      setOthers(rows || []);
      if (fresh) {
        setBooking(fresh);
        setSynced(true);
        // From the estimate step on — including once the shop has moved the
        // booking on to its repair statuses — read the saved estimate.
        if (fresh.kind !== 'SELL' && (isPastPickup(fresh.status) || stepIndex(fresh.status) >= STEP_FROM)) {
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
        <JobHeader navigation={navigation} title="Pickup Details" sub={booking ? trackingId(booking) : undefined} />
        <ActivityIndicator color="#035C6C" style={{ marginTop: rs(40) }} />
      </SafeAreaView>
    );
  }
  if (!booking || missing) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <JobHeader navigation={navigation} title="Pickup Details" sub={booking ? trackingId(booking) : undefined} />
        <View style={s.state}>
          <AlertTriangle size={rs(26)} color="#FAA700" />
          <Text style={s.stateText}>{error || 'This pickup is no longer assigned to you.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Declined → the booking is the shop's again: back to My Pickups.
  const declineSheet = (
    <PickupDeclineSheet booking={booking} visible={declineOpen} onClose={() => setDeclineOpen(false)}
      onDone={async () => { if (navigation.canGoBack()) navigation.goBack(); else await load(); }} />
  );

  // Not accepted yet: the details stay closed — only Accept or Decline. The
  // server returns just the preview until it records the acceptance. (An
  // older server without Accept keeps Accept & Start Journey + Unable to Pickup.)
  if (awaitingAccept(booking)) {
    const off = !!busyId || !synced;
    const step = nextStepFor(booking);
    const canDecline = serverAcceptance(booking);
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <JobHeader navigation={navigation} title="Pickup Details" sub={booking ? trackingId(booking) : undefined} />
        <View style={s.state}>
          <AlertTriangle size={rs(26)} color="#FAA700" />
          <Text style={s.stateText}>Accept this pickup to view its details.</Text>
          <TouchableOpacity onPress={() => advance(booking)} disabled={off} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={step?.label}
            style={[s.nextBtn, { flex: 0, alignSelf: 'stretch', marginTop: rs(6) }, off && { opacity: 0.6 }]}>
            {busyId ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={s.nextText}>{step?.label}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => (canDecline ? setDeclineOpen(true) : setProblem(true))} disabled={off} activeOpacity={0.85} accessibilityRole="button"
            accessibilityLabel={canDecline ? 'Decline pickup' : 'Unable to pickup'}
            style={[s.problemBtn, { alignSelf: 'stretch' }, off && { opacity: 0.6 }]}>
            <AlertTriangle size={rs(15)} color="#F32C26" strokeWidth={2.4} />
            <Text style={s.problemText}>{canDecline ? 'Decline' : 'Unable to Pickup'}</Text>
          </TouchableOpacity>
        </View>
        {canDecline ? declineSheet : <PickupProblemSheet booking={booking} visible={problem} onClose={() => setProblem(false)} onDone={load} />}
      </SafeAreaView>
    );
  }

  const st = statusMeta(booking.status);
  // A device purchase (kind SELL) has fewer steps: no estimate or GPS gates.
  const steps = stepsFor(booking);
  const stepAt = (status) => steps.findIndex((x) => x.codes.includes(String(status || '').toUpperCase()));
  // Past the pickup (shop repair statuses) = every pickup step done.
  const idx = isPastPickup(booking.status) ? steps.length - 1 : stepAt(booking.status);
  const next = nextStepFor(booking);
  // Accepted but not started: Decline (back to the shop) instead of Unable to Pickup.
  const declineStep = serverAcceptance(booking) && stepIndex(booking.status) === 0;
  const cancel = cancelInfo(booking);
  const events = sortEvents(booking.events);
  // Latest event of a step; for a stopped pickup, the last step it reached.
  const stepEvent = (step) => events.filter((e) => step.codes.includes(String(e.status).toUpperCase())).pop();
  const reached = steps.reduce((m, step, i) => (stepEvent(step) ? i : m), -1);
  const slot = slotLabel(booking);
  const img = imageOf(booking);
  const est = { ...booking, ...(estimate || {}) };
  const services = Array.isArray(est.services) ? est.services : [];
  // Saved one part per line ("Display (missing, damaged)"); older records are
  // comma-separated, so split on commas only outside the parentheses.
  const partsText = String(est.missingDamageParts || '');
  const missingParts = (partsText.includes('\n') ? partsText.split('\n') : partsText.split(/,(?![^(]*\))/))
    .map((x) => x.trim()).filter(Boolean);
  const photos = [{ url: est.frontImageUrl, label: 'Front' }, { url: est.backImageUrl, label: 'Back' }].filter((p) => p.url);
  const approved = est.customerApproval === 'DONE' || est.customerApproval === true;
  const hasVerification = booking.kind !== 'SELL' && idx >= STEP_FROM && (services.length || est.estimateAmount != null || missingParts.length || est.customerApproval);
  const phone = customerPhone(booking);
  const clash = overlapsFor(booking, others);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <JobHeader navigation={navigation} title="Pickup Details" sub={booking ? trackingId(booking) : undefined} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#035C6C']} tintColor="#035C6C" />}>
        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* Device + status */}
        <View style={s.card}>
          <View style={s.row}>
            <View style={[s.deviceImg, s.deviceStub, { overflow: 'hidden' }]}><DevicePhoto ticket={{ ...booking, deviceImageUrl: img || booking?.deviceImageUrl }} /></View>
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
          {/* Name + phone left; call / directions icons right. */}
          <View style={[s.row, { alignItems: 'center', marginBottom: rs(6) }]}>
            <View style={s.avatar}><User size={rs(16)} color="#035C6C" strokeWidth={2.2} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.kvValue} numberOfLines={1}>{booking.customerName || 'Customer'}</Text>
              {phone ? <Text style={s.small} numberOfLines={1}>{phone}</Text> : null}
            </View>
            {phone ? (
              <TouchableOpacity onPress={() => callCustomer(booking)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Call customer"
                style={[s.roundBtn, { backgroundColor: '#E4EFDA' }]}>
                <Phone size={rs(15)} color="#609138" strokeWidth={2.4} />
              </TouchableOpacity>
            ) : null}
            {booking.pickupAddressText ? (
              <TouchableOpacity onPress={() => openDirections(booking)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Directions"
                style={[s.roundBtn, { backgroundColor: '#E5F3F5' }]}>
                <Navigation size={rs(15)} color="#035C6C" strokeWidth={2.4} />
              </TouchableOpacity>
            ) : null}
          </View>
          <Line icon={CalendarDays} text={`${relDay(pickupDay(booking))} · ${fmtDay(pickupDay(booking))}${slot ? ` · ${slot}` : ''}`} />
          {booking.pickupAddressText ? <Line icon={MapPin} text={booking.pickupAddressText} /> : null}
          {clash.length ? (
            <View style={s.clash}>
              <AlertTriangle size={rs(14)} color="#B45309" />
              <Text style={s.clashText}>Overlaps with {clash.map((o) => `${trackingId(o)} (${slotLabel(o)})`).join(', ')}</Text>
            </View>
          ) : null}
        </View>

        {/* Pickup progress — the backend steps top to bottom: when and by whom
            each was done (GPS distance on the location checks), the photos /
            video at the estimate step where they were uploaded, the next step
            on the current one, and a failed / cancelled row where it stopped. */}
        <View style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.cardTitle}>Pickup Status</Text>
          </View>
          {/* Overall progress bar. */}
          <View style={s.progTrack}>
            <View style={[s.progFill, {
              width: `${Math.round(((cancel ? reached + 1 : Math.max(idx + 1, 0)) / Math.max(steps.length, 1)) * 100)}%`,
              backgroundColor: cancel ? '#F32C26' : '#609138',
            }]} />
          </View>
          {steps.map((step, i) => {
            const last = i === steps.length - 1;
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
                  {/* Step name left, time right; no "by system" actor text. */}
                  <View style={s.rowBetween}>
                    <Text style={[s.stepLabel, { flex: 1 }, current && { color: '#035C6C' }, !done && !current && s.stepPending]}>{step.label}</Text>
                    {ev?.createdAt ? <Text style={[s.small, { marginLeft: rs(8) }]}>{fmtStamp(ev.createdAt)}</Text> : null}
                  </View>
                  {ev ? (
                    ev.distanceMeters != null ? <Text style={s.small}>{ev.distanceMeters} m away</Text> : null
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

      </ScrollView>

      {next || canReportProblem(booking) ? (
        // Side by side, the next step wider; labels wrap to two lines instead of
        // clipping on narrow phones. Clears the Android navigation bar.
        <View style={[s.bar, { paddingBottom: rs(10) + insets.bottom }]}>
          {canReportProblem(booking) ? (
            <TouchableOpacity onPress={() => (declineStep ? setDeclineOpen(true) : setProblem(true))} disabled={!!busyId || !synced} activeOpacity={0.85} accessibilityRole="button"
              accessibilityLabel={declineStep ? 'Decline pickup' : 'Unable to pickup'}
              style={[s.problemBtn, next && { flex: 1 }, !synced && { opacity: 0.6 }]}>
              <AlertTriangle size={rs(15)} color="#F32C26" strokeWidth={2.4} />
              <Text style={s.problemText} numberOfLines={2}>{declineStep ? 'Decline' : 'Unable to Pickup'}</Text>
            </TouchableOpacity>
          ) : null}
          {next ? (
            <TouchableOpacity onPress={() => advance(booking)} disabled={!!busyId || !synced} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={next.label}
              style={[s.nextBtn, (busyId || !synced) && { opacity: 0.6 }]}>
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
      {declineStep ? declineSheet : null}
    </SafeAreaView>
  );
}

function Line({ icon: Icon, text, strong }) {
  return (
    <View style={s.line2}>
      <View style={s.lineIco}><Icon size={rs(15)} color="#035C6C" strokeWidth={2.2} /></View>
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
  progTrack: { height: rs(6), borderRadius: rs(3), backgroundColor: '#EEF0F2', overflow: 'hidden', marginBottom: rs(12) },
  progFill: { height: '100%', borderRadius: rs(3) },
  avatar: { width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' },
  roundBtn: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: 'center', justifyContent: 'center' },
  deviceImg: { width: rs(60), height: rs(60), borderRadius: rs(12), backgroundColor: '#F3F4F6' },
  deviceStub: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5F3F5' },
  id: { fontSize: rf(12.5), fontWeight: '800', color: '#035C6C' },
  device: { fontSize: rf(12), fontWeight: '800', color: '#111111', marginTop: 1 },
  muted: { fontSize: rf(12.5), color: '#6B7280', marginTop: 1 },
  pill: { paddingHorizontal: rs(9), paddingVertical: rs(3), borderRadius: 999, maxWidth: '38%', alignSelf: 'flex-start' },
  pillText: { fontSize: rf(11), fontWeight: '800' },
  issue: { flexDirection: 'row', gap: rs(6), marginTop: rs(10), backgroundColor: '#F9FAFB', borderRadius: rs(10), padding: rs(9) },
  issueText: { flex: 1, fontSize: rf(12.5), color: '#1C3053', fontWeight: '600', lineHeight: rlh(17.5) },
  cancel: { fontSize: rf(12.5), color: '#F32C26', fontWeight: '700', marginTop: rs(8) },
  cardTitle: { fontSize: rf(12), fontWeight: '800', color: '#1C3053', marginBottom: rs(8) },
  line2: { flexDirection: 'row', alignItems: 'center', gap: rs(10), marginBottom: rs(8) },
  lineIco: { width: rs(34), height: rs(26), alignItems: 'center', justifyContent: 'center' },
  lineText: { flex: 1, fontSize: rf(12.5), color: '#374151', lineHeight: rlh(17.5) },
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
  dot: { width: rs(22), height: rs(22), borderRadius: rs(11), borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: '#FFFFFF' },
  line: { flex: 1, width: 2, marginVertical: 2, minHeight: rs(10) },
  stepBody: { flex: 1, minWidth: 0, marginLeft: rs(8), marginBottom: rs(8), paddingHorizontal: rs(10), paddingVertical: rs(7), borderRadius: rs(10), backgroundColor: '#F7F9FA' },
  stepLabel: { fontSize: rf(12.5), fontWeight: '800', color: '#111111' },
  stepPending: { color: '#9CA3AF', fontWeight: '600' },
  small: { fontSize: rf(11.5), color: '#6B7280', marginTop: 1 },
  link: { fontSize: rf(12.5), fontWeight: '800', color: '#035C6C', marginBottom: rs(8) },
  svc: { flexDirection: 'row', alignItems: 'center', gap: rs(8), paddingVertical: rs(6), borderBottomWidth: 1, borderBottomColor: '#F1F3F5' },
  kvLabel: { flex: 1, fontSize: rf(12), color: '#374151' },
  kvValue: { fontSize: rf(12), fontWeight: '800', color: '#111111' },
  total: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: rs(8),
    paddingVertical: rs(8), paddingHorizontal: rs(10), borderRadius: rs(10), backgroundColor: '#E5F3F5',
  },
  kvStrong: { fontSize: rf(12.5), fontWeight: '800', color: '#035C6C' },
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
  eventTitle: { fontSize: rf(12), fontWeight: '800', color: '#111111' },
  fullBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6), marginTop: rs(10), height: rs(38),
    borderRadius: rs(10), borderWidth: 1, borderColor: '#035C6C', backgroundColor: '#FFFFFF',
  },
  fullText: { fontSize: rf(12), fontWeight: '800', color: '#035C6C' },
  error: { fontSize: rf(12), color: '#F32C26', fontWeight: '700' },
  state: { alignItems: 'center', padding: rs(30), gap: rs(10) },
  stateText: { fontSize: rf(12), color: '#6B7280', textAlign: 'center' },
  bar: {
    flexDirection: 'row', alignItems: 'stretch', gap: rs(8), paddingHorizontal: rs(12), paddingTop: rs(10),
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF0F2',
  },
  problemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(5), paddingHorizontal: rs(10), minHeight: rs(48),
    borderRadius: rs(13), borderWidth: 1.5, borderColor: '#F32C26', backgroundColor: '#FFFFFF',
  },
  problemText: { flexShrink: 1, fontSize: rf(12), fontWeight: '800', color: '#F32C26', textAlign: 'center' },
  nextBtn: {
    flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6), minHeight: rs(48), paddingHorizontal: rs(10),
    borderRadius: rs(13), backgroundColor: '#035C6C',
  },
  nextText: { flexShrink: 1, fontSize: rf(12.5), fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
});
