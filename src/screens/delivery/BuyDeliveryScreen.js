import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckCircle2, CheckSquare, MapPin, Navigation, Phone, Square, Store, X } from 'lucide-react-native';
import { confirm, notify } from '../../components/confirm';
import { uploadMedia } from '../../api/media';
import { deviceShapeOf } from '../sell/conditionArt';
import { DELIVERY_STATUS, DELIVERY_TABS, deliveryAction, getDelivery, listMyDeliveries } from '../../api/buyDeliveries';
import { Button, Card, Loader, Page, SC, SK, apiError, money } from './deliveryKit';

const FAILABLE = ['ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'];
const when = (t) => (t ? new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '');
const MUTED = '#606E87';
// Server enforces >= 1 photo (FixedPriceOrderService.savePhotos); the app asks for 2.
const MIN_PHOTOS = 2;
const PENDING = DELIVERY_TABS.filter((t) => t.key !== 'HISTORY').flatMap((t) => t.statuses);

// One assigned Buy order: accept → verify at shop + pickup photo → start
// delivery → collect exact COD + customer OTP + delivery photo → delivered.
// Every step is a server transition; the server checks amount and OTP.
export default function BuyDeliveryScreen({ navigation, route }) {
  const id = route.params?.id;
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [checks, setChecks] = useState({});
  const [photos, setPhotos] = useState([]);
  const [amount, setAmount] = useState('');
  const [otp, setOtp] = useState('');
  const [payRef, setPayRef] = useState('');
  const [reason, setReason] = useState('');
  const [imei, setImei] = useState('');
  const [failOpen, setFailOpen] = useState(false);
  const [journey, setJourney] = useState(false);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(null);
  const [nextBusy, setNextBusy] = useState(false);
  const lock = useRef(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    try { setO(await getDelivery(id)); setError(''); }
    catch (e) { setError(apiError(e, 'Could not load this delivery.')); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // New stage → fresh proof photos (pickup photos must not count for delivery).
  const stage = o?.status;
  useEffect(() => { setPhotos([]); }, [stage]);
  useEffect(() => { setJourney(false); setShown(false); setDone(null); }, [id]);

  const run = async (action, body, ok) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(action);
    try {
      await deliveryAction(id, action, body);
      setPhotos([]); setOtp(''); setAmount(''); setPayRef(''); setFailOpen(false);
      notify(ok, '', { type: 'success' });
      if (action === 'decline') { navigation.goBack(); return; }
      if (action === 'deliver') { setDone({ orderNumber: o?.orderNumber, productTitle: o?.productTitle }); }
      await load();
    } catch (e) {
      if (action === 'pickup' || action === 'deliver') setPhotos([]);
      notify('Not saved', apiError(e, 'Please try again.'), { type: 'error' });
    } finally { lock.current = false; setBusy(''); }
  };

  const addPhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { notify('Permission required', 'Allow camera access to take proof photos.', { type: 'warning' }); return; }
      }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      const a = r.canceled ? null : r.assets?.[0];
      if (!a?.uri) return;
      seq.current += 1;
      const key = String(seq.current);
      setPhotos((all) => [...all, { key, uri: a.uri, url: null, busy: true }]);
      try {
        const res = await uploadMedia({ uri: a.uri, name: a.fileName || 'buy-delivery.jpg', type: a.mimeType || 'image/jpeg', folder: 'buy-delivery', slot: `${id}-${key}` });
        const url = res?.url || res?.secure_url;
        setPhotos((all) => (url ? all.map((x) => (x.key === key ? { ...x, url, busy: false } : x)) : all.filter((x) => x.key !== key)));
        if (!url) notify('Photo not uploaded', 'Please take it again.', { type: 'error' });
      } catch (e) {
        setPhotos((all) => all.filter((x) => x.key !== key));
        notify('Photo not uploaded', apiError(e, 'Please take it again.'), { type: 'error' });
      }
    } catch (e) {
      notify('Could not open the camera', apiError(e, 'Please try again.'), { type: 'error' });
    }
  };

  const viewNext = async () => {
    setNextBusy(true);
    try {
      const all = await listMyDeliveries();
      const next = (all || []).find((x) => x.id !== id && PENDING.includes(x.status));
      if (next) navigation.replace('BuyDelivery', { id: next.id });
      else navigation.goBack();
    } catch { navigation.goBack(); }
    finally { setNextBusy(false); }
  };

  if (done) {
    return (
      <Page title="Task Completed" navigation={navigation}>
        <View style={{ padding: 14 }}>
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: 18 }}>
              <CheckCircle2 size={48} color={SC.green} />
              <Text style={{ marginTop: 10, fontSize: 18, fontWeight: '800', color: SK.ink }}>Task Completed</Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: MUTED }}>{done.orderNumber}</Text>
              <Text style={{ marginTop: 2, fontSize: 14, fontWeight: '700', color: SK.ink, textAlign: 'center' }}>{done.productTitle || 'Product'}</Text>
            </View>
            <Button title="View Next Task" loading={nextBusy} disabled={nextBusy} onPress={viewNext} />
            <Button title="Back to list" variant="outline" style={{ marginTop: 8 }} onPress={() => navigation.goBack()} />
          </Card>
        </View>
      </Page>
    );
  }

  if (!o) {
    return (
      <Page title="Delivery" navigation={navigation}>
        {error ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: SC.red }}>{error}</Text>
            <Button title="Retry" onPress={load} style={{ marginTop: 12 }} />
          </View>
        ) : <Loader />}
      </Page>
    );
  }

  const s = o.status;
  // Phones carry an IMEI; laptops, tablets, watches a serial number.
  const isPhone = deviceShapeOf(o.productTitle) === 'phone';
  const urls = photos.filter((p) => p.url).map((p) => p.url);
  const uploading = photos.some((p) => p.busy);
  const CHECKS = [
    ['model', 'Product & model match the order'],
    ['imei', isPhone ? 'IMEI checked on the device' : 'Serial number checked on the device'],
    ['qty', `Quantity is ${o.quantity || 1}`],
    ['cond', 'Condition matches the listing'],
  ];
  const verified = CHECKS.every(([k]) => checks[k]);
  const addr = o.deliveryAddress;

  const photoBlock = (label) => (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: SK.ink }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        {photos.map((p) => (
          <View key={p.key} style={{ width: 70, height: 70, borderRadius: 10, overflow: 'hidden', backgroundColor: SK.tealSoft }}>
            <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} />
            {p.busy ? <ActivityIndicator color={SK.teal} style={{ position: 'absolute', top: 24, left: 24 }} /> : (
              <Pressable onPress={() => setPhotos((all) => all.filter((x) => x.key !== p.key))} hitSlop={6} style={{ position: 'absolute', top: 2, right: 2, backgroundColor: '#0008', borderRadius: 10 }}>
                <X size={14} color="#FFFFFF" />
              </Pressable>
            )}
          </View>
        ))}
        {photos.length < 4 ? (
          <Pressable onPress={addPhoto} accessibilityRole="button" accessibilityLabel="Take photo"
            style={{ width: 70, height: 70, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: SK.teal, alignItems: 'center', justifyContent: 'center' }}>
            <Camera size={22} color={SK.teal} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const input = (props) => (
    <TextInput placeholderTextColor={MUTED}
      style={{ borderWidth: 1, borderColor: SK.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8, fontSize: 14, color: SK.ink }}
      {...props} />
  );

  return (
    <Page title="Delivery Task" subtitle={o.orderNumber} navigation={navigation}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: SK.tealSoft, overflow: 'hidden' }}>
              {o.productImage ? <Image source={{ uri: o.productImage }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: SK.ink }}>{o.productTitle || 'Product'}</Text>
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Qty {o.quantity || 1} · {o.paymentMethod === 'COD' ? 'Cash on delivery' : o.paymentMethod}</Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: SK.teal, marginTop: 2 }}>{money(o.totalAmount)}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: s === 'DELIVERY_FAILED' ? SC.red : SC.green, marginTop: 4 }}>{DELIVERY_STATUS[s] || s}</Text>
            </View>
          </View>
        </Card>

        {['ASSIGNED', 'ACCEPTED'].includes(s) ? (
          <Card title="Pickup from shop">
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <Store size={16} color={SK.teal} />
              <Text style={{ flex: 1, fontSize: 13, color: SK.ink }}>{o.shopName || 'Your shop'}{o.shopAddress ? `
${o.shopAddress}` : ''}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {o.shopAddress ? <Button title="Navigate" Icon={MapPin} variant="outline" style={{ flex: 1 }}
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.shopAddress)}`).catch(() => {})} /> : null}
              {o.shopPhone ? <Button title="Call Shop" Icon={Phone} variant="outline" style={{ flex: 1 }}
                onPress={() => Linking.openURL(`tel:${o.shopPhone}`).catch(() => {})} /> : null}
            </View>
          </Card>
        ) : null}

        <Card title={o.customerName ? `Customer · ${o.customerName}` : 'Customer'}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            <MapPin size={16} color={SK.teal} />
            <Text style={{ flex: 1, fontSize: 13, color: SK.ink }}>{addr || '—'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {addr ? <Button title="Navigate" Icon={MapPin} variant="outline" style={{ flex: 1 }}
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`).catch(() => {})} /> : null}
            {o.customerPhone ? <Button title="Call" Icon={Phone} variant="outline" style={{ flex: 1 }}
              onPress={() => Linking.openURL(`tel:${o.customerPhone}`).catch(() => {})} /> : null}
          </View>
        </Card>

        {s === 'ASSIGNED' ? (
          <Card title="New assignment">
            <Text style={{ fontSize: 13, color: MUTED }}>Collect this product from your shop and deliver it to the customer.</Text>
            <Button title="Accept" variant="success" loading={busy === 'accept'} disabled={!!busy} style={{ marginTop: 10 }} onPress={() => run('accept', {}, 'Delivery accepted')} />
            <Button title="Decline" variant="danger" disabled={!!busy} loading={busy === 'decline'} style={{ marginTop: 8 }}
              onPress={async () => { if (await confirm({ title: 'Decline delivery?', message: 'The shop will reassign it.', confirmText: 'Decline', destructive: true })) run('decline', {}, 'Declined'); }} />
          </Card>
        ) : null}

        {s === 'ACCEPTED' && !journey ? (
          <Card title="Start journey to shop">
            <Text style={{ fontSize: 13, color: MUTED }}>{o.shopName || 'Your shop'}{o.shopAddress ? ` · ${o.shopAddress}` : ''}</Text>
            {o.shopAddress ? <Button title="Navigate" Icon={MapPin} variant="outline" style={{ marginTop: 10 }}
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.shopAddress)}`).catch(() => {})} /> : null}
            <Button title="Start Journey" Icon={Navigation} style={{ marginTop: 8 }} onPress={() => setJourney(true)} />
          </Card>
        ) : null}

        {s === 'ACCEPTED' && journey ? (
          <Card title="At shop — verify & pick up">
            {CHECKS.map(([k, label]) => (
              <Pressable key={k} onPress={() => setChecks((c) => ({ ...c, [k]: !c[k] }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!checks[k] }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }}>
                {checks[k] ? <CheckSquare size={20} color={SC.green} /> : <Square size={20} color={MUTED} />}
                <Text style={{ fontSize: 13, color: SK.ink }}>{label}</Text>
              </Pressable>
            ))}
            {input({
              placeholder: isPhone ? `15-digit IMEI${o.productImeiRequired ? ' (required)' : ' (optional)'}` : `Serial number${o.productImeiRequired ? ' (required)' : ' (optional)'}`,
              value: imei,
              keyboardType: isPhone ? 'number-pad' : 'default',
              maxLength: isPhone ? 15 : 30,
              autoCapitalize: 'characters',
              onChangeText: (t) => setImei(isPhone ? t.replace(/\D/g, '') : t.replace(/[^A-Za-z0-9-]/g, '').toUpperCase()),
            })}
            {imei && isPhone && imei.length !== 15 ? <Text style={{ fontSize: 11, color: SC.red, marginTop: 4 }}>IMEI must be 15 digits</Text> : null}
            {photoBlock(`Pickup photos (min ${MIN_PHOTOS})`)}
            <Button title="Confirm Pickup" loading={busy === 'pickup'} disabled={!!busy || !verified || urls.length < MIN_PHOTOS || uploading || (o.productImeiRequired && !imei) || (isPhone && !!imei && imei.length !== 15)} style={{ marginTop: 12 }}
              onPress={() => run('pickup', { productVerified: true, imei: imei || undefined, photos: urls }, 'Pickup confirmed')} />
          </Card>
        ) : null}

        {s === 'PICKED_UP' ? (
          <Card title="Ready to deliver">
            <Button title="Start Delivery" loading={busy === 'start-delivery'} disabled={!!busy} onPress={() => run('start-delivery', {}, 'Delivery started')} />
          </Card>
        ) : null}

        {s === 'OUT_FOR_DELIVERY' ? (
          <Card title="At customer — payment & handover">
            <Text style={{ fontSize: 13, color: MUTED }}>Collect exactly {money(o.totalAmount)} in cash, then enter the customer's 4-digit order OTP.</Text>
            {input({ placeholder: `Amount collected (${o.totalAmount})`, keyboardType: 'number-pad', value: amount, onChangeText: (t) => setAmount(t.replace(/[^\d.]/g, '')) })}
            {input({ placeholder: 'Customer OTP', keyboardType: 'number-pad', maxLength: 4, value: otp, onChangeText: (t) => setOtp(t.replace(/\D/g, '')) })}
            {input({ placeholder: 'Payment note (optional)', value: payRef, onChangeText: setPayRef })}
            {photoBlock(`Delivery proof photos (min ${MIN_PHOTOS})`)}
            <Pressable onPress={() => setShown((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: shown }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, marginTop: 6 }}>
              {shown ? <CheckSquare size={20} color={SC.green} /> : <Square size={20} color={MUTED} />}
              <Text style={{ fontSize: 13, color: SK.ink }}>Product shown & verified with the customer</Text>
            </Pressable>
            <Button title="Complete Delivery" variant="success" loading={busy === 'deliver'}
              disabled={!!busy || !amount || otp.length !== 4 || urls.length < MIN_PHOTOS || uploading || !shown} style={{ marginTop: 12 }}
              onPress={() => run('deliver', { amountCollected: amount, otp, paymentRef: payRef.trim() || undefined, photos: urls }, 'Delivery completed')} />
          </Card>
        ) : null}

        {FAILABLE.includes(s) ? (
          <Card>
            {failOpen ? (
              <>
                {input({ placeholder: 'Reason (e.g. customer not reachable)', value: reason, onChangeText: setReason })}
                <Button title="Mark Delivery Failed" variant="danger" loading={busy === 'fail'} disabled={!!busy || !reason.trim()} style={{ marginTop: 10 }}
                  onPress={() => run('fail', { reason: reason.trim() }, 'Marked as failed')} />
              </>
            ) : <Button title="Report a problem" variant="outline" onPress={() => setFailOpen(true)} />}
          </Card>
        ) : null}

        {s === 'DELIVERY_FAILED' ? (
          <Card title="Return to shop">
            <Text style={{ fontSize: 13, color: MUTED }}>Bring the product back to the shop. The owner marks it received and may reassign the delivery.</Text>
          </Card>
        ) : null}

        <Card title="Timeline">
          {(o.events || []).map((e, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, paddingVertical: 5 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, marginTop: 5, backgroundColor: i === o.events.length - 1 ? SK.teal : SC.green }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: SK.ink }}>{DELIVERY_STATUS[e.status] || e.status}</Text>
                <Text style={{ fontSize: 11.5, color: MUTED }}>{when(e.at)}{e.note ? ` · ${e.note}` : ''}</Text>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Page>
  );
}
