import React, { useCallback, useRef, useState } from 'react';
import { Image, Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Text, TextInput } from '../../components/Typography';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera, CircleCheck, CircleX, KeyRound, MapPin, Navigation, PackageCheck, Phone, RotateCcw, Store, Truck, X,
} from 'lucide-react-native';
import { getRepairDelivery, repairDeliveryAction } from '../../api/repairDeliveries';
import { uploadMedia } from '../../api/media';
import { confirm, notify } from '../../components/confirm';
import { rf, rs } from '../../utils/responsive';
import { Button, Card, Loader, Page, SC, SK, apiError, money } from './deliveryKit';
import { slotText, statusTone } from './RepairDeliveriesScreen';

// One repair return delivery: Accept / Decline → (shop releases) Shop
// Collection (IMEI / serial, accessories, photos) → Start Delivery → Arrived →
// customer OTP + outstanding payment → Delivered. Failed → Return to Shop.
// Every step is a server call; the screen shows the server's answer.

const ACCESSORIES = ['Charger', 'Cable', 'Box', 'Back Cover', 'SIM Tool', 'Earphones'];
const DECLINE = ['Not available at this time', 'Too far from my location', 'Vehicle problem', 'Other work assigned'];
const FAIL = ['Customer not available', 'Customer refused delivery', 'Wrong / incomplete address', 'Customer can\'t pay now', 'Wrong OTP / customer not verified', 'Payment failed'];
// Backend answers for a delivery no longer assigned to this employee.
const isReassigned = (e) => e?.payload?.code === 'NOT_ASSIGNED' || e?.status === 403 || e?.status === 404;

function Line({ label, value, bold }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: rs(5) }}>
      <Text style={{ width: rs(130), fontSize: rf(13), color: '#6B7280' }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: rf(13.5), fontWeight: bold ? '800' : '600', color: SK.ink }}>{value}</Text>
    </View>
  );
}

function Choice({ options, value, onChange }) {
  return (
    <View style={{ gap: rs(8) }}>
      {options.map((o) => {
        const on = value === o;
        return (
          <Pressable key={o} onPress={() => onChange(o)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', alignItems: 'center', padding: rs(12), borderRadius: rs(12), borderWidth: 1, borderColor: on ? SK.teal : SK.line, backgroundColor: on ? SK.tealSoft : '#FFFFFF' }}>
            <View style={{ width: rs(18), height: rs(18), borderRadius: rs(9), borderWidth: 2, borderColor: on ? SK.teal : '#C9CED6', alignItems: 'center', justifyContent: 'center' }}>
              {on ? <View style={{ width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: SK.teal }} /> : null}
            </View>
            <Text style={{ marginLeft: rs(10), fontSize: rf(14), color: SK.ink }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function RepairDeliveryScreen({ navigation, route }) {
  const id = route?.params?.id;
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reasonFor, setReasonFor] = useState(null); // decline | fail
  const [reason, setReason] = useState(null);
  // Shop collection
  const [identifier, setIdentifier] = useState('');
  const [acc, setAcc] = useState([]);
  const [photos, setPhotos] = useState([]); // { key, uri, url, status }
  // Proof at the customer handover, and evidence when returning to the shop.
  const [proof, setProof] = useState([]);
  const [returnPhotos, setReturnPhotos] = useState([]);
  const [returnNote, setReturnNote] = useState('');
  const [gone, setGone] = useState(false); // reassigned / no longer mine
  // Completion
  const [otp, setOtp] = useState('');
  const [method, setMethod] = useState('CASH');
  const [ref, setRef] = useState('');
  const lock = useRef(false);

  const load = useCallback(async () => {
    try {
      setD(await getRepairDelivery(id));
      setError(null);
    } catch (e) {
      if (isReassigned(e)) { setGone(true); return; }
      setError(apiError(e, 'Could not load this delivery.'));
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const act = async (action, body, ok) => {
    if (lock.current || gone) return;
    lock.current = true;
    setBusy(action);
    try {
      const res = await repairDeliveryAction(id, action, body);
      if (action === 'decline') { notify('Delivery declined', 'The shop will reassign it.', { type: 'success' }); navigation.goBack(); return; }
      setD(res);
      if (ok) notify(ok, '', { type: 'success' });
    } catch (e) {
      const code = e?.payload?.code;
      notify(code === 'NOT_ASSIGNED' ? 'Delivery changed' : 'Could not update', apiError(e, 'Please try again.'), { type: code === 'OTP_INVALID' || code === 'IDENTIFIER_MISMATCH' ? 'warning' : 'error' });
      if (code === 'NOT_ASSIGNED' || isReassigned(e)) setGone(true);
      else if (code === 'STALE_STATUS' || e?.status === 409) load();
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const addPhoto = async (setList = setPhotos) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { notify('Camera needed', 'Allow camera access to take the device photos.', { type: 'warning' }); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const key = `${Date.now()}`;
    setList((p) => [...p, { key, uri: a.uri, status: 'uploading' }]);
    try {
      const res = await uploadMedia({ uri: a.uri, name: a.fileName || 'repair-delivery.jpg', type: a.mimeType || 'image/jpeg', folder: 'repair-delivery', slot: `${id}-${key}` });
      setList((p) => p.map((x) => (x.key === key ? { ...x, url: res?.url, status: res?.url ? 'done' : 'error' } : x)));
    } catch (_) {
      setList((p) => p.map((x) => (x.key === key ? { ...x, status: 'error' } : x)));
    }
  };

  if (gone) {
    return (
      <Page title="Repair Delivery" navigation={navigation}>
        <Card style={{ margin: rs(14) }}>
          <Text style={{ fontSize: rf(15), fontWeight: '800', color: SK.ink }}>This delivery has been reassigned</Text>
          <Text style={{ fontSize: rf(13), color: '#6B7280', marginTop: rs(4) }}>It is no longer assigned to you, so it cannot be updated.</Text>
          <Button title="Back to My Deliveries" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: rs(12) }} />
        </Card>
      </Page>
    );
  }

  if (!d) return <Page title="Repair Delivery" navigation={navigation}>{error ? <Text style={{ color: SC.red, margin: rs(16) }}>{error}</Text> : <Loader />}</Page>;

  const st = d.status;
  const due = Number(d.amountDue) || 0;
  const uploaded = photos.filter((p) => p.status === 'done').map((p) => p.url);
  const uploading = photos.some((p) => p.status === 'uploading');
  const doneUrls = (list) => list.filter((p) => p.status === 'done').map((p) => p.url);
  const busyUpload = (list) => list.some((p) => p.status === 'uploading');
  const photoRow = (list, setList, label) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: rs(8), marginTop: rs(6) }}>
      {list.map((p) => (
        <View key={p.key}>
          <Image source={{ uri: p.uri }} style={{ width: rs(68), height: rs(68), borderRadius: rs(10), opacity: p.status === 'done' ? 1 : 0.5 }} />
          <Pressable onPress={() => setList((x) => x.filter((y) => y.key !== p.key))} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={6}
            style={{ position: 'absolute', top: -6, right: -6, width: rs(20), height: rs(20), borderRadius: rs(10), backgroundColor: SC.red, alignItems: 'center', justifyContent: 'center' }}>
            <X size={12} color="#FFFFFF" />
          </Pressable>
          {p.status === 'error' ? <Text style={{ fontSize: rf(10), color: SC.red }}>Failed</Text> : null}
        </View>
      ))}
      <Pressable onPress={() => addPhoto(setList)} accessibilityRole="button" accessibilityLabel={label}
        style={{ width: rs(68), height: rs(68), borderRadius: rs(10), borderWidth: 1, borderStyle: 'dashed', borderColor: SK.teal, alignItems: 'center', justifyContent: 'center' }}>
        <Camera size={22} color={SK.teal} />
      </Pressable>
    </View>
  );

  const collect = () => {
    if (!identifier.trim()) { notify('IMEI / serial needed', 'Enter the IMEI / serial number from the device.', { type: 'warning' }); return; }
    if (uploaded.length < 2) { notify('Add photos', 'Take at least 2 photos of the device.', { type: 'warning' }); return; }
    act('collect', { identifier: identifier.trim(), accessories: acc, photos: uploaded }, 'Device collected');
  };
  const complete = async () => {
    if (doneUrls(proof).length < 1) { notify('Add proof', 'Take a photo of the device handed to the customer.', { type: 'warning' }); return; }
    if (due > 0 && method === 'UPI' && !ref.trim()) { notify('UPI reference needed', 'Enter the UPI transaction reference.', { type: 'warning' }); return; }
    if (otp.length !== 4) { notify('OTP needed', 'Ask the customer for the 4-digit OTP on their repair page.', { type: 'warning' }); return; }
    const ok = await confirm({ title: 'Complete delivery?', message: due > 0 ? `You collected ${money(due)} by ${method === 'UPI' ? 'UPI' : 'cash'}.` : 'Hand over the device to the customer.', confirmText: 'Complete' });
    if (ok) act('complete', { otp, amountCollected: due, paymentMethod: due > 0 ? method : null, paymentRef: due > 0 && method === 'UPI' ? ref.trim() : null, photos: doneUrls(proof) }, 'Delivered');
  };
  const sendReason = () => {
    if (!reason) { notify('Choose a reason', '', { type: 'warning' }); return; }
    const action = reasonFor;
    setReasonFor(null);
    act(action, { reason }, action === 'fail' ? 'Marked as failed' : null);
  };

  return (
    <Page title="Repair Delivery" subtitle={`#${d.bookingNumber || '—'}`} navigation={navigation}>
      <ScrollView contentContainerStyle={{ padding: rs(14), paddingBottom: rs(40) }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[SK.teal]} />}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {d.deviceImageUrl ? <Image source={{ uri: d.deviceImageUrl }} style={{ width: rs(54), height: rs(54), borderRadius: rs(12), backgroundColor: SK.page }} /> : null}
            <View style={{ flex: 1, marginLeft: d.deviceImageUrl ? rs(10) : 0 }}>
              <Text style={{ fontSize: rf(16), fontWeight: '800', color: SK.ink }}>{d.device}</Text>
              <Text style={{ fontSize: rf(13), color: '#6B7280' }}>{`Attempt ${d.attempt} · ${slotText(d)}`}</Text>
            </View>
            <View style={{ borderRadius: rs(12), paddingHorizontal: rs(10), paddingVertical: rs(4), backgroundColor: `${statusTone(st)}1A` }}>
              <Text style={{ fontSize: rf(12), fontWeight: '800', color: statusTone(st) }}>{d.statusLabel}</Text>
            </View>
          </View>
        </Card>

        <Card title="Route">
          <View style={{ flexDirection: 'row' }}>
            <Store size={18} color={SK.teal} />
            <Text style={{ flex: 1, marginLeft: rs(8), fontSize: rf(13.5), color: SK.ink }}>{d.shopAddress || 'Shop'}</Text>
          </View>
          <View style={{ flexDirection: 'row', marginTop: rs(10) }}>
            <MapPin size={18} color={SC.red} />
            <View style={{ flex: 1, marginLeft: rs(8) }}>
              <Text style={{ fontSize: rf(13.5), fontWeight: '700', color: SK.ink }}>{d.customerName || 'Customer'}</Text>
              <Text style={{ fontSize: rf(13), color: '#6B7280' }}>{d.customerAddress || 'Shown after you accept'}</Text>
            </View>
          </View>
          {d.customerPhone || d.customerAddress ? (
            <View style={{ flexDirection: 'row', gap: rs(10), marginTop: rs(12) }}>
              {d.customerPhone ? <Button title="Call" Icon={Phone} variant="outline" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${d.customerPhone}`).catch(() => {})} /> : null}
              {d.customerAddress ? <Button title="Navigate" Icon={Navigation} variant="outline" style={{ flex: 1 }} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.customerAddress)}`).catch(() => {})} /> : null}
            </View>
          ) : null}
        </Card>

        <Card title="Details">
          <Line label="Device IMEI / Serial" value={d.deviceIdentifierHint || 'Not recorded'} />
          <Line label="Amount to collect" value={due > 0 ? money(due) : 'Nothing due'} bold />
          {(d.accessories || []).length ? <Line label="Accessories" value={d.accessories.join(', ')} /> : null}
          {d.failReason ? <Line label="Last attempt" value={`Failed — ${d.failReason}`} /> : null}
        </Card>

        {/* ── actions by status ── */}
        {st === 'ASSIGNED' ? (
          <View style={{ gap: rs(10), marginTop: rs(14) }}>
            <Button title="Accept Delivery" Icon={CircleCheck} variant="success" loading={busy === 'accept'} onPress={() => act('accept', null, 'Delivery accepted')} />
            <Button title="Decline" Icon={CircleX} variant="danger" onPress={() => { setReason(null); setReasonFor('decline'); }} />
          </View>
        ) : null}

        {st === 'ACCEPTED' && !d.releasedAt ? (
          <Card style={{ backgroundColor: '#FEF3C7', borderColor: '#F6DDA8' }}>
            <Text style={{ fontSize: rf(14), fontWeight: '800', color: '#92400E' }}>Go to the shop</Text>
            <Text style={{ fontSize: rf(13), color: '#92400E', marginTop: rs(4) }}>The shop releases the repaired device to you in the Partner App. This page updates by itself.</Text>
          </Card>
        ) : null}

        {st === 'ACCEPTED' && d.releasedAt ? (
          <Card title="Shop Collection">
            <Text style={{ fontSize: rf(13), color: '#6B7280' }}>IMEI / Serial number *</Text>
            <TextInput value={identifier} onChangeText={(t) => setIdentifier(t.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 20))} placeholder="Dial *#06# or read the label"
              placeholderTextColor="#9CA3AF" autoCapitalize="characters" style={{ height: rs(48), borderRadius: rs(12), borderWidth: 1, borderColor: SK.line, paddingHorizontal: rs(12), fontSize: rf(15), color: SK.ink, marginTop: rs(6) }} />
            <Text style={{ fontSize: rf(13), color: '#6B7280', marginTop: rs(12) }}>Accessories handed over</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: rs(8), marginTop: rs(6) }}>
              {ACCESSORIES.map((a) => {
                const on = acc.includes(a);
                return (
                  <Pressable key={a} onPress={() => setAcc((x) => (on ? x.filter((y) => y !== a) : [...x, a]))} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    style={{ paddingHorizontal: rs(12), paddingVertical: rs(7), borderRadius: rs(16), borderWidth: 1, borderColor: on ? SK.teal : SK.line, backgroundColor: on ? SK.tealSoft : '#FFFFFF' }}>
                    <Text style={{ fontSize: rf(13), fontWeight: '700', color: on ? SK.teal : SK.ink }}>{a}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: rf(13), color: '#6B7280', marginTop: rs(12) }}>{`Device photos (min 2) · ${uploaded.length} added`}</Text>
            {photoRow(photos, setPhotos, 'Take photo')}
            <Button title={uploading ? 'Uploading photos…' : 'Confirm Collection'} Icon={PackageCheck} disabled={uploading} loading={busy === 'collect'} onPress={collect} style={{ marginTop: rs(14) }} />
          </Card>
        ) : null}

        {st === 'COLLECTED' ? (
          <View style={{ gap: rs(10), marginTop: rs(14) }}>
            <Button title="Start Delivery" Icon={Truck} loading={busy === 'start'} onPress={() => act('start', null, 'Out for delivery')} />
            <Button title="Can't Deliver" Icon={CircleX} variant="danger" onPress={() => { setReason(null); setReasonFor('fail'); }} />
          </View>
        ) : null}

        {st === 'OUT_FOR_DELIVERY' ? (
          <View style={{ gap: rs(10), marginTop: rs(14) }}>
            <Button title="Arrived at Customer" Icon={MapPin} loading={busy === 'arrive'} onPress={() => act('arrive', null, null)} />
          </View>
        ) : null}

        {st === 'OUT_FOR_DELIVERY' || st === 'ARRIVED' ? (
          <Card title="Handover">
            <Text style={{ fontSize: rf(13), color: '#6B7280' }}>Customer OTP (on their repair page)</Text>
            <TextInput value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 4))} placeholder="4-digit OTP" placeholderTextColor="#9CA3AF" keyboardType="number-pad" maxLength={4}
              style={{ height: rs(52), borderRadius: rs(12), borderWidth: 1, borderColor: SK.line, paddingHorizontal: rs(12), fontSize: rf(22), letterSpacing: 8, textAlign: 'center', color: SK.ink, marginTop: rs(6) }} />
            <Pressable onPress={() => act('otp/resend', null, 'New OTP sent to the customer')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: rs(8) }}>
              <KeyRound size={14} color={SK.teal} />
              <Text style={{ fontSize: rf(13), fontWeight: '800', color: SK.teal, marginLeft: rs(6) }}>Generate new OTP</Text>
            </Pressable>
            {due > 0 ? (
              <>
                <Text style={{ fontSize: rf(14), fontWeight: '800', color: SK.ink, marginTop: rs(14) }}>{`Collect ${money(due)}`}</Text>
                <View style={{ flexDirection: 'row', gap: rs(8), marginTop: rs(8) }}>
                  {['CASH', 'UPI'].map((m) => (
                    <Pressable key={m} onPress={() => setMethod(m)} accessibilityRole="radio" accessibilityState={{ selected: method === m }}
                      style={{ flex: 1, height: rs(42), borderRadius: rs(21), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: method === m ? SK.teal : SK.line, backgroundColor: method === m ? SK.teal : '#FFFFFF' }}>
                      <Text style={{ fontSize: rf(14), fontWeight: '800', color: method === m ? '#FFFFFF' : SK.ink }}>{m === 'CASH' ? 'Cash' : 'UPI'}</Text>
                    </Pressable>
                  ))}
                </View>
                {method === 'UPI' ? (
                  <TextInput value={ref} onChangeText={(t) => setRef(t.replace(/[^0-9A-Za-z]/g, '').slice(0, 40))} placeholder="UPI transaction reference" placeholderTextColor="#9CA3AF"
                    style={{ height: rs(46), borderRadius: rs(12), borderWidth: 1, borderColor: SK.line, paddingHorizontal: rs(12), fontSize: rf(14), color: SK.ink, marginTop: rs(8) }} />
                ) : null}
              </>
            ) : <Text style={{ fontSize: rf(13), color: SC.green, fontWeight: '700', marginTop: rs(12) }}>Nothing to collect — fully paid.</Text>}
            <Text style={{ fontSize: rf(13), color: '#6B7280', marginTop: rs(14) }}>{`Handover photo proof * · ${doneUrls(proof).length} added`}</Text>
            {photoRow(proof, setProof, 'Take handover photo')}
            <Button title={busyUpload(proof) ? 'Uploading photos…' : 'Complete Delivery'} Icon={CircleCheck} variant="success" disabled={busyUpload(proof)} loading={busy === 'complete'} onPress={complete} style={{ marginTop: rs(14) }} />
            <Button title="Delivery Failed" Icon={CircleX} variant="danger" onPress={() => { setReason(null); setReasonFor('fail'); }} style={{ marginTop: rs(10) }} />
          </Card>
        ) : null}

        {st === 'FAILED' ? (
          <Card title="Return Device to Shop">
            <Text style={{ fontSize: rf(13), color: '#6B7280' }}>{`Device photo evidence * · ${doneUrls(returnPhotos).length} added`}</Text>
            {photoRow(returnPhotos, setReturnPhotos, 'Take return photo')}
            <TextInput value={returnNote} onChangeText={setReturnNote} placeholder="Note (optional)" placeholderTextColor="#9CA3AF" maxLength={200}
              style={{ height: rs(46), borderRadius: rs(12), borderWidth: 1, borderColor: SK.line, paddingHorizontal: rs(12), fontSize: rf(14), color: SK.ink, marginTop: rs(10) }} />
            <Button title={busyUpload(returnPhotos) ? 'Uploading photos…' : 'Return Device to Shop'} Icon={RotateCcw} disabled={busyUpload(returnPhotos)} loading={busy === 'return'} style={{ marginTop: rs(12) }}
              onPress={() => (doneUrls(returnPhotos).length < 1
                ? notify('Add evidence', 'Take a photo of the device before returning it.', { type: 'warning' })
                : act('return', { photos: doneUrls(returnPhotos), note: returnNote.trim() || null }, 'Returning to shop'))} />
          </Card>
        ) : null}
        {st === 'RETURNING' ? (
          <Card style={{ backgroundColor: '#FEF3C7', borderColor: '#F6DDA8' }}>
            <Text style={{ fontSize: rf(13.5), color: '#92400E' }}>Hand the device to the shop. The shop confirms receipt in the Partner App, then can retry or reassign the delivery.</Text>
          </Card>
        ) : null}
        {st === 'DELIVERED' ? (
          <Card style={{ backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }}>
            <Text style={{ fontSize: rf(15), fontWeight: '800', color: SC.green }}>Delivered</Text>
            <Text style={{ fontSize: rf(13), color: SK.ink, marginTop: rs(4) }}>{Number(d.amountCollected) > 0 ? `Collected ${money(d.amountCollected)} (${d.paymentMethod}).` : 'Nothing was due.'}</Text>
          </Card>
        ) : null}

        {(d.events || []).length ? (
          <Card title="History">
            {d.events.slice().reverse().map((e, i) => (
              <View key={`${e.at}-${i}`} style={{ flexDirection: 'row', marginBottom: rs(8) }}>
                <View style={{ width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: i === 0 ? SK.teal : '#C9CED6', marginTop: rs(6) }} />
                <View style={{ flex: 1, marginLeft: rs(8) }}>
                  <Text style={{ fontSize: rf(13.5), fontWeight: '700', color: SK.ink }}>{e.label}</Text>
                  <Text style={{ fontSize: rf(12), color: '#6B7280' }}>{[e.note, e.at ? new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null].filter(Boolean).join(' · ')}</Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {reasonFor ? (
          <Card title={reasonFor === 'decline' ? 'Why are you declining?' : 'Why did the delivery fail?'}>
            <Choice options={reasonFor === 'decline' ? DECLINE : FAIL} value={reason} onChange={setReason} />
            <View style={{ flexDirection: 'row', gap: rs(10), marginTop: rs(12) }}>
              <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setReasonFor(null)} />
              <Button title={reasonFor === 'decline' ? 'Decline' : 'Mark Failed'} variant="danger" style={{ flex: 1 }} loading={busy === reasonFor} onPress={sendReason} />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </Page>
  );
}
