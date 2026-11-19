// Home: pickup reminder bottom sheet, LEAD_MIN minutes before an assigned /
// accepted / on-the-way pickup of the signed-in employee is due. Opening the
// app inside that window shows it straight away. One at a time, soonest first;
// a dismissal is saved per employee + pickup + slot, so it never repeats (a
// rescheduled pickup gets a new slot → a new reminder). Also keeps the OS
// reminders (utils/checkoutAlarm, dev / release builds only) in step with the
// list, and a tapped reminder opens that pickup's existing Pickup Details.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Modal, Pressable, ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import * as Location from 'expo-location';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BellRing, Check, Clock, MapPin, Navigation, Smartphone, Store, User, X } from 'lucide-react-native';
import { acceptPickup, declinePickup } from '../api/pickups';
import { repairDeliveryAction } from '../api/repairDeliveries';
import { deliveryAction } from '../api/buyDeliveries';
import RouteInfo from './RouteInfo';
import { notify } from './confirm';
import { Text } from './Typography';
import { selectTechnicianId } from '../store/authSlice';
import { onPickupReminderTap, registerForPush, syncPickupReminders } from '../utils/checkoutAlarm';
import { DECLINE_REASONS, bucketOf, deviceLabel, slotLabel, slotStartAt, stepIndex, trackingId } from '../utils/pickups';
import { rf, rs } from '../utils/responsive';

// react-native-maps (bundled in Expo Go and dev / release builds); null if the native side is missing.
let Maps = null;
try { Maps = require('react-native-maps'); } catch (_) { Maps = null; }

const LEAD_MIN = 10;
const IDLE_TICK_MS = 15 * 1000;
const STORE_KEY = 'ggfix.pickupReminder.dismissed';
const KEEP_MS = 3 * 86400000; // saved dismissals older than this are dropped
const TEAL = '#035C6C';

// Slot start as an exact instant: the server's startAllowedAt is 1 hour before
// the slot (IST-aware); without it, the slot date + time on this device.
function startOf(b) {
  if (b?._buy) { const t = b.pickupScheduledAt ? new Date(b.pickupScheduledAt) : null; return t && !Number.isNaN(t.getTime()) ? t : null; }
  if (b?._rd) return slotStartAt({ pickupDate: b.scheduledDate, pickupSlotStart: b.slotStart });
  const allowed = b?.startAllowedAt ? new Date(b.startAllowedAt) : null;
  if (allowed && !Number.isNaN(allowed.getTime())) return new Date(allowed.getTime() + 60 * 60000);
  return slotStartAt(b);
}
// Assigned (accepted or not) or on the way; completed / cancelled / reassigned rows never remind.
function stageOf(b) {
  if (b?._rd || b?._buy) {
    const s = String(b.status || '').toUpperCase();
    if (s === 'ASSIGNED') return { pill: 'Assigned', line: 'Delivery starting soon', pending: true };
    return s === 'ACCEPTED' ? { pill: 'Accepted', line: 'Get ready for delivery' } : null;
  }
  const i = stepIndex(b?.status);
  if (i === 1) return { pill: 'On the Way', line: 'Continue your pickup' };
  if (i !== 0) return null;
  if (b.accepted) return { pill: 'Accepted', line: 'Get ready for pickup' };
  // Accept / Reject only where the server has the acceptance step.
  return { pill: 'Assigned', line: 'Pickup starting soon', pending: typeof b.accepted === 'boolean' };
}
const typeOf = (b) => (b?._buy ? 'Marketplace Delivery' : b?._rd ? 'Repair Delivery' : b?.kind === 'SELL' ? 'Customer Sell Pickup' : 'Repair Pickup');
// FROM → TO from the task's own addresses (pickups: customer → shop; deliveries: shop → customer).
const pt = (lat, lng) => (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { latitude: Number(lat), longitude: Number(lng) } : null);
const shopLeg = (b) => ({ name: b?.shopName || 'Shop', address: b?.shopAddress, at: pt(b?.shopLatitude, b?.shopLongitude) });
const legsOf = (b) => (b?._rd || b?._buy
  ? { from: shopLeg(b), to: { name: b.customerName, address: b._buy ? b.deliveryAddress : b.customerAddress, at: pt(b.customerLatitude ?? b.latitude, b.customerLongitude ?? b.longitude) } }
  : { from: { name: b?.customerName, address: b?.pickupAddressText, at: pt(b?.pickupLatitude, b?.pickupLongitude) }, to: shopLeg(b) });
const prefixOf = (b) => (b?._buy ? 'buy:' : b?._rd ? 'rd:' : '');
const taskId = (b) => (b?._buy ? (b.orderNumber || `#${b.id}`) : b?._rd ? (b.bookingNumber || `#${b.id}`) : trackingId(b));
const imageOf = (b) => b?.deviceImageUrl || b?.modelImageUrl || b?.frontImageUrl || null;
const clock = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

export default function PickupSoonPopup({ pickups, navigation, onChanged }) {
  const [busy, setBusy] = useState('');
  const [declining, setDeclining] = useState(false);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const focused = useIsFocused();
  const me = useSelector(selectTechnicianId);
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(null); // null until read from storage
  const [openKey, setOpenKey] = useState(null);

  // Saved dismissals.
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => { try { setDismissed(JSON.parse(raw) || {}); } catch (_) { setDismissed({}); } })
      .catch(() => setDismissed({}));
  }, []);

  // Live countdown while the sheet is up; a slow tick otherwise. Resume re-checks at once.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), openKey ? 1000 : IDLE_TICK_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setNow(Date.now()); });
    return () => { clearInterval(id); sub.remove(); };
  }, [openKey]);

  // A tapped OS reminder opens that pickup's Pickup Details.
  useEffect(() => onPickupReminderTap((bookingId) => {
    const id = String(bookingId);
    if (id.startsWith('rd:')) navigation.navigate('RepairDelivery', { id: id.slice(3) });
    else if (id.startsWith('buy:')) navigation.navigate('BuyDelivery', { id: id.slice(4) });
    else navigation.navigate('PickupDetails', { bookingId });
  }), [navigation]);

  // OS reminders (30 / 15 / 10 min) for pickups not started — re-synced only when the schedule changes.
  const schedule = useMemo(() => (pickups || []).filter((b) => (b._rd || b._buy ? !!stageOf(b) : bucketOf(b.status) === 'ASSIGNED'))
    .map((b) => ({ b, at: startOf(b) })).filter((x) => x.at), [pickups]);
  const scheduleSig = schedule.map((x) => `${prefixOf(x.b)}${x.b.id}@${x.at.getTime()}`).sort().join('|');
  useEffect(() => {
    if (pickups == null) return;
    // Register for server pushes first, so the local 10-min reminder is dropped when the server sends it.
    registerForPush().finally(() => syncPickupReminders(schedule.map(({ b, at }) => ({
      id: `${prefixOf(b)}${b.id}`,
      startAt: at,
      title: `${typeOf(b)} · ${b.customerName || taskId(b)}`,
      body: [b._buy ? b.productTitle : b._rd ? b.device : deviceLabel(b), b._rd ? `${b.slotStart || ''}`.slice(0, 5) : b._buy ? '' : slotLabel(b), legsOf(b).from.address].filter(Boolean).join(' · '),
    }))));
  }, [scheduleSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reminder queue: due within LEAD_MIN minutes, not dismissed, soonest first.
  const queue = useMemo(() => (pickups || [])
    .map((b) => ({ b, at: startOf(b), stage: stageOf(b) }))
    .filter(({ b, at, stage }) => stage && at && at.getTime() > now && at.getTime() - now <= LEAD_MIN * 60000
      && !(dismissed || {})[`${me || '-'}:${prefixOf(b)}${b.id}@${at.getTime()}`])
    .map((x) => ({ ...x, key: `${me || '-'}:${prefixOf(x.b)}${x.b.id}@${x.at.getTime()}` }))
    .sort((x, y) => x.at - y.at), [pickups, now, dismissed, me]);

  // Keep showing the open one while it is still due; else the next in the queue.
  const current = (openKey && queue.find((x) => x.key === openKey)) || null;
  useEffect(() => {
    if (dismissed == null || !focused) return;
    if (!current && queue.length) setOpenKey(queue[0].key);
    else if (openKey && !current) setOpenKey(null); // started / cancelled / reassigned / past: hide
  }, [dismissed, focused, current, queue, openKey]);

  const dismiss = (key) => {
    const cut = Date.now() - KEEP_MS;
    const next = Object.fromEntries(Object.entries({ ...(dismissed || {}), [key]: Date.now() }).filter(([, t]) => t > cut));
    setDismissed(next);
    setOpenKey(null);
    setDeclining(false);
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
  };

  if (!current || !focused) return null;
  const { b, at, stage, key } = current;
  const left = Math.max(0, Math.floor((at.getTime() - now) / 1000));
  const countdown = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  const img = b._buy ? b.productImage : imageOf(b);
  const view = () => {
    dismiss(key);
    if (b._buy) navigation.navigate('BuyDelivery', { id: b.id });
    else if (b._rd) navigation.navigate('RepairDelivery', { id: b.id });
    else navigation.navigate('PickupDetails', { bookingId: b.id, booking: b });
  };
  const legs = legsOf(b);
  // Navigate to where the task starts (customer for a pickup, shop for a delivery).
  const go = () => {
    const dest = legs.from.at ? `${legs.from.at.latitude},${legs.from.at.longitude}` : legs.from.address;
    if (dest) Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`).catch(() => {});
  };
  // Existing accept / decline endpoints; the list reloads so the popup follows the server.
  const act = async (kind, reason) => {
    setBusy(kind);
    try {
      if (b._buy) await deliveryAction(b.id, kind, kind === 'decline' ? { reason } : {});
      else if (kind === 'accept') await (b._rd ? repairDeliveryAction(b.id, 'accept') : acceptPickup(b.id));
      else await (b._rd ? repairDeliveryAction(b.id, 'decline', { reason }) : declinePickup(b.id, { reason }));
      notify(kind === 'accept' ? 'Accepted' : 'Rejected', kind === 'accept' ? 'Task accepted.' : 'The shop will reassign it.', { type: 'success' });
      dismiss(key);
      onChanged?.();
    } catch (e) {
      notify('Could not update', e?.message || 'Check your internet and try again.', { type: 'error' });
    } finally { setBusy(''); }
  };

  // Popup: a short white strip (rounded corners — an Android map can't be
  // clipped round), the live map in the top ~half, then the details sheet over it.
  const sheetH = Math.min(winH * 0.9, 820);
  const mapH = Math.round(sheetH * 0.48);
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={() => dismiss(key)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={() => dismiss(key)} accessibilityLabel="Dismiss reminder" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,17,17,0.5)' }} />
        <View accessibilityRole="alert" style={{ height: sheetH, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          <View style={{ height: rs(18), backgroundColor: '#FFFFFF', borderTopLeftRadius: rs(26), borderTopRightRadius: rs(26), alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: rs(40), height: rs(4), borderRadius: 2, backgroundColor: '#E5E7EB' }} />
          </View>
          <View style={{ height: mapH, backgroundColor: '#E5F3F5' }}>
            <PickupMap b={b} legs={legsOf(b)} />
            <TouchableOpacity onPress={() => dismiss(key)} hitSlop={10} accessibilityLabel="Close"
              style={{ position: 'absolute', top: rs(10), right: rs(12), width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#111111', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
              <X size={rs(18)} color="#111111" />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, marginTop: -rs(22), backgroundColor: '#FFFFFF', borderTopLeftRadius: rs(24), borderTopRightRadius: rs(24), paddingTop: rs(16), elevation: 6, shadowColor: '#111111', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: -2 } }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: rs(18), paddingBottom: rs(8) }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: rs(48), height: rs(48), borderRadius: rs(24), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' }}>
              <BellRing size={rs(24)} color={TEAL} />
            </View>
            <View style={{ flex: 1, marginLeft: rs(12), marginRight: rs(24) }}>
              <Text style={{ fontSize: rf(17), fontWeight: '800', color: '#111111' }}>Pickup in {LEAD_MIN} minutes</Text>
              <Text style={{ fontSize: rf(12.5), color: '#6B7280', marginTop: 1 }}>{stage.line} · starts in <Text style={{ fontWeight: '800', color: TEAL }}>{countdown}</Text></Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: rs(14), backgroundColor: '#F3F4F6', borderRadius: rs(14), padding: rs(12) }}>
            {img ? <Image source={{ uri: img }} style={{ width: rs(54), height: rs(54), borderRadius: rs(12), backgroundColor: '#FFFFFF' }} resizeMode="contain" /> : (
              <View style={{ width: rs(54), height: rs(54), borderRadius: rs(12), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' }}>
                <Smartphone size={rs(24)} color={TEAL} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0, marginLeft: rs(12) }}>
              <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: TEAL }} numberOfLines={1}>{typeOf(b)} · {taskId(b)}</Text>
              <Text style={{ fontSize: rf(14.5), fontWeight: '800', color: '#111111', marginTop: 1 }} numberOfLines={2}>{b.preview ? 'Device details after you accept' : b._buy ? (b.productTitle || 'Device') : b._rd ? (b.device || 'Device') : deviceLabel(b)}</Text>
            </View>
            <View style={{ backgroundColor: '#E5F3F5', borderRadius: 999, paddingHorizontal: rs(10), paddingVertical: rs(4), marginLeft: rs(8) }}>
              <Text style={{ fontSize: rf(11), fontWeight: '800', color: TEAL }}>{stage.pill}</Text>
            </View>
          </View>

          <View style={{ marginTop: rs(12), gap: rs(8) }}>
            <Row icon={Clock} text={`Today, ${clock(at)}${!b._rd && !b._buy && slotLabel(b) ? ` (${slotLabel(b)})` : ''}`} strong />
            <Leg icon={b._rd ? Store : User} label="FROM" name={legs.from.name} address={legs.from.address} />
            <Leg icon={b._rd ? User : Store} label="TO" name={legs.to.name} address={legs.to.address} />
            {b.preview ? <Text style={{ fontSize: rf(12), color: '#6B7280' }}>Customer and address appear after you accept the pickup.</Text> : null}
          </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: rs(10), paddingHorizontal: rs(18), paddingTop: rs(10), paddingBottom: rs(14) + insets.bottom, borderTopWidth: 1, borderTopColor: '#F1F3F5' }}>
            {declining ? (
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: rf(13), fontWeight: '800', color: '#111111', marginBottom: rs(6) }}>Why are you rejecting?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: rs(6) }}>
                  {DECLINE_REASONS.map((r) => (
                    <TouchableOpacity key={r} disabled={!!busy} onPress={() => act('decline', r)} accessibilityRole="button"
                      style={{ borderWidth: 1, borderColor: '#F32C26', borderRadius: 999, paddingHorizontal: rs(10), paddingVertical: rs(6) }}>
                      <Text style={{ fontSize: rf(12), fontWeight: '700', color: '#F32C26' }}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity onPress={() => setDeclining(false)} accessibilityRole="button" style={{ paddingHorizontal: rs(10), paddingVertical: rs(6) }}>
                    <Text style={{ fontSize: rf(12), fontWeight: '800', color: TEAL }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : stage.pending ? (
              <>
                <Btn label="Reject" icon={X} color="#F32C26" outline disabled={!!busy} onPress={() => setDeclining(true)} />
                <Btn label="Accept" icon={Check} loading={busy === 'accept'} disabled={!!busy} onPress={() => act('accept')} wide />
              </>
            ) : (
              <>
                <Btn label="Navigate" icon={Navigation} outline disabled={!legs.from.address && !b.pickupLatitude} onPress={go} />
                <Btn label="View Task" onPress={view} wide />
              </>
            )}
          </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Live map: the employee's position (foreground GPS, followed while open) and
// the pickup pin from the server's coordinates — only on an accepted pickup
// that has them (a preview never carries the customer's location, and nothing
// is guessed from the address). No route line or ETA: there is no route data.
function PickupMap({ b, legs }) {
  const [route, setRoute] = useState(null);
  const mapRef = useRef(null);
  const [me, setMe] = useState(null);
  const [loc, setLoc] = useState('loading'); // loading | ok | denied | off
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const lat = Number(b.pickupLatitude);
  const lng = Number(b.pickupLongitude);
  const dest = !b.preview && b.pickupLatitude != null && b.pickupLongitude != null && Number.isFinite(lat) && Number.isFinite(lng)
    ? { latitude: lat, longitude: lng } : (legs?.from?.at || null);
  const to = legs?.to?.at || null;

  useEffect(() => {
    let live = true;
    let sub = null;
    const take = (c) => { if (live && c) { setMe({ latitude: c.latitude, longitude: c.longitude }); setLoc('ok'); } };
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!live) return;
        if (perm.status !== 'granted') { setLoc('denied'); return; }
        const last = await Location.getLastKnownPositionAsync({ maxAge: 60000 }).catch(() => null);
        take(last?.coords);
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 15 }, (p) => take(p?.coords));
        if (!live) sub.remove();
      } catch (_) {
        if (live) setLoc((s) => (s === 'ok' ? s : 'off'));
      }
    })();
    return () => { live = false; sub?.remove(); };
  }, []);

  // The map never reported ready (offline / no Google Play services): say so.
  useEffect(() => {
    if (ready) return undefined;
    const t = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(t);
  }, [ready]);

  // Keep both pins in view as the employee moves.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const pts = route?.points?.length ? route.points : [me, dest, to].filter(Boolean);
    if (pts.length >= 2) mapRef.current.fitToCoordinates(pts, { edgePadding: { top: 70, right: 50, bottom: 70, left: 50 }, animated: true });
    else if (pts.length === 1) mapRef.current.animateToRegion({ ...pts[0], latitudeDelta: 0.012, longitudeDelta: 0.012 }, 400);
  }, [ready, me?.latitude, me?.longitude, dest?.latitude, dest?.longitude, route]); // eslint-disable-line react-hooks/exhaustive-deps

  const note = !Maps ? 'Map is not available on this device.'
    : loc === 'denied' ? 'Allow location to see where you are.'
      : loc === 'off' ? 'Could not get your location.'
        : slow && !ready ? 'Map could not load. Check your internet.'
          : b.preview ? 'Pickup location appears after you accept.'
            : !dest ? 'Pickup location not shared for this pickup.' : null;

  return (
    <View style={{ flex: 1 }}>
      {Maps ? (
        <Maps.default
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={{ latitude: dest?.latitude ?? 20.5937, longitude: dest?.longitude ?? 78.9629, latitudeDelta: dest ? 0.02 : 18, longitudeDelta: dest ? 0.02 : 18 }}
          onMapReady={() => setReady(true)}
          toolbarEnabled={false}
          showsMyLocationButton={false}
          showsCompass={false}
        >
          {me ? (
            <Maps.Marker coordinate={me} anchor={{ x: 0.5, y: 0.5 }} title="You" tracksViewChanges={false}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(3,92,108,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: TEAL, borderWidth: 2, borderColor: '#FFFFFF' }} />
              </View>
            </Maps.Marker>
          ) : null}
          {dest ? <Maps.Marker coordinate={dest} title="From" description={legs?.from?.address || undefined} pinColor="#035C6C" /> : null}
          {to ? <Maps.Marker coordinate={to} title="To" description={legs?.to?.address || undefined} pinColor="#F38B4A" /> : null}
          {route?.points?.length > 1 ? <Maps.Polyline coordinates={route.points} strokeColor="#1A73E8" strokeWidth={4} /> : null}
        </Maps.default>
      ) : null}
      {(loc === 'loading' && !dest) || (Maps && !ready && !slow) ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: rs(12), paddingVertical: rs(6) }}>
            <ActivityIndicator size="small" color={TEAL} />
            <Text style={{ marginLeft: rs(6), fontSize: rf(12), fontWeight: '700', color: '#374151' }}>{Maps && !ready ? 'Loading map…' : 'Locating you…'}</Text>
          </View>
        </View>
      ) : null}
      <RouteInfo from={dest} to={to} onRoute={setRoute} />
      {note ? (
        <View style={{ position: 'absolute', left: rs(12), right: rs(56), top: rs(10), flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: rs(12), paddingHorizontal: rs(10), paddingVertical: rs(7), elevation: 3 }}>
          <MapPin size={rs(14)} color={TEAL} />
          <Text style={{ flex: 1, marginLeft: rs(6), fontSize: rf(12), color: '#374151' }}>{note}</Text>
          {loc === 'denied' ? (
            <TouchableOpacity onPress={() => Linking.openSettings().catch(() => {})} hitSlop={6} accessibilityRole="button">
              <Text style={{ fontSize: rf(12), fontWeight: '800', color: TEAL }}>Allow</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Btn({ label, icon: Icon, onPress, outline, wide, disabled, loading, color = TEAL }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label}
      style={{ flex: wide ? 1.4 : 1, minHeight: rs(50), borderRadius: rs(14), flexDirection: 'row', gap: rs(6), alignItems: 'center', justifyContent: 'center', opacity: disabled && !loading ? 0.5 : 1,
        ...(outline ? { borderWidth: 1.5, borderColor: color } : { backgroundColor: color }) }}>
      {loading ? <ActivityIndicator color="#FFFFFF" /> : (
        <>
          {Icon ? <Icon size={rs(17)} color={outline ? color : '#FFFFFF'} /> : null}
          <Text style={{ fontSize: rf(15), fontWeight: '800', color: outline ? color : '#FFFFFF' }}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function Leg({ icon: Icon, label, name, address }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <View style={{ width: rs(30), height: rs(30), borderRadius: rs(15), backgroundColor: label === 'TO' ? '#FFF1E8' : '#E5F3F5', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={rs(15)} color={label === 'TO' ? '#F38B4A' : TEAL} />
      </View>
      <View style={{ flex: 1, marginLeft: rs(10) }}>
        <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: '#6B7280', letterSpacing: 0.5 }}>{label}</Text>
        {name ? <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: '#111111' }} numberOfLines={1}>{name}</Text> : null}
        <Text style={{ fontSize: rf(12.5), color: '#374151' }} numberOfLines={2}>{address || 'Shown after you accept'}</Text>
      </View>
    </View>
  );
}

function Row({ icon: Icon, text, strong }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Icon size={rs(15)} color="#6B7280" style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, marginLeft: rs(8), fontSize: rf(13), color: strong ? '#111111' : '#374151', fontWeight: strong ? '800' : '500' }} numberOfLines={2}>{text}</Text>
    </View>
  );
}
