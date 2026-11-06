import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckSquare, MapPin, Phone, Square, X } from 'lucide-react-native';
import { confirm, notify } from '../../components/confirm';
import { uploadMedia } from '../../api/media';
import { DELIVERY_STATUS, deliveryAction, getDelivery } from '../../api/buyDeliveries';
import { SC, SK, SellButton, SellCard, SellLoader, SellPage, money, sellError } from '../sell/sellKit';

const FAILABLE = ['ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'];
const when = (t) => (t ? new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '');
const MUTED = '#606E87';

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
  const [failOpen, setFailOpen] = useState(false);
  const lock = useRef(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    try { setO(await getDelivery(id)); setError(''); }
    catch (e) { setError(sellError(e, 'Could not load this delivery.')); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (action, body, ok) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(action);
    try {
      await deliveryAction(id, action, body);
      setPhotos([]); setOtp(''); setAmount(''); setPayRef(''); setFailOpen(false);
      notify(ok, '', { type: 'success' });
      if (action === 'decline') { navigation.goBack(); return; }
      await load();
    } catch (e) {
      notify('Not saved', sellError(e, 'Please try again.'), { type: 'error' });
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
        notify('Photo not uploaded', sellError(e, 'Please take it again.'), { type: 'error' });
      }
    } catch (e) {
      notify('Could not open the camera', sellError(e, 'Please try again.'), { type: 'error' });
    }
  };

  if (!o) {
    return (
      <SellPage title="Delivery" navigation={navigation}>
        {error ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: SC.red }}>{error}</Text>
            <SellButton title="Retry" onPress={load} style={{ marginTop: 12 }} />
          </View>
        ) : <SellLoader />}
      </SellPage>
    );
  }

  const s = o.status;
  const urls = photos.filter((p) => p.url).map((p) => p.url);
  const uploading = photos.some((p) => p.busy);
  const CHECKS = [
    ['model', 'Product & model match the order'],
    ['imei', 'IMEI / serial checked on the device'],
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
    <SellPage title="Delivery Task" subtitle={o.orderNumber} navigation={navigation}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />} keyboardShouldPersistTaps="handled">
        <SellCard>
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
        </SellCard>

        <SellCard title="Customer">
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            <MapPin size={16} color={SK.teal} />
            <Text style={{ flex: 1, fontSize: 13, color: SK.ink }}>{addr || '—'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {addr ? <SellButton title="Navigate" Icon={MapPin} variant="outline" style={{ flex: 1 }}
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`).catch(() => {})} /> : null}
            {o.customerPhone ? <SellButton title="Call" Icon={Phone} variant="outline" style={{ flex: 1 }}
              onPress={() => Linking.openURL(`tel:${o.customerPhone}`).catch(() => {})} /> : null}
          </View>
        </SellCard>

        {s === 'ASSIGNED' ? (
          <SellCard title="New assignment">
            <Text style={{ fontSize: 13, color: MUTED }}>Collect this product from your shop and deliver it to the customer.</Text>
            <SellButton title="Accept" variant="success" loading={busy === 'accept'} disabled={!!busy} style={{ marginTop: 10 }} onPress={() => run('accept', {}, 'Delivery accepted')} />
            <SellButton title="Decline" variant="danger" disabled={!!busy} loading={busy === 'decline'} style={{ marginTop: 8 }}
              onPress={async () => { if (await confirm({ title: 'Decline delivery?', message: 'The shop will reassign it.', confirmText: 'Decline', destructive: true })) run('decline', {}, 'Declined'); }} />
          </SellCard>
        ) : null}

        {s === 'ACCEPTED' ? (
          <SellCard title="At shop — verify & pick up">
            {CHECKS.map(([k, label]) => (
              <Pressable key={k} onPress={() => setChecks((c) => ({ ...c, [k]: !c[k] }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!checks[k] }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }}>
                {checks[k] ? <CheckSquare size={20} color={SC.green} /> : <Square size={20} color={MUTED} />}
                <Text style={{ fontSize: 13, color: SK.ink }}>{label}</Text>
              </Pressable>
            ))}
            {photoBlock('Pickup photo (min 1)')}
            <SellButton title="Confirm Pickup" loading={busy === 'pickup'} disabled={!!busy || !verified || !urls.length || uploading} style={{ marginTop: 12 }}
              onPress={() => run('pickup', { productVerified: true, photos: urls }, 'Pickup confirmed')} />
          </SellCard>
        ) : null}

        {s === 'PICKED_UP' ? (
          <SellCard title="Ready to deliver">
            <SellButton title="Start Delivery" loading={busy === 'start-delivery'} disabled={!!busy} onPress={() => run('start-delivery', {}, 'Delivery started')} />
          </SellCard>
        ) : null}

        {s === 'OUT_FOR_DELIVERY' ? (
          <SellCard title="At customer — payment & handover">
            <Text style={{ fontSize: 13, color: MUTED }}>Collect exactly {money(o.totalAmount)} in cash, then enter the customer's 4-digit order OTP.</Text>
            {input({ placeholder: `Amount collected (${o.totalAmount})`, keyboardType: 'number-pad', value: amount, onChangeText: (t) => setAmount(t.replace(/[^\d.]/g, '')) })}
            {input({ placeholder: 'Customer OTP', keyboardType: 'number-pad', maxLength: 4, value: otp, onChangeText: (t) => setOtp(t.replace(/\D/g, '')) })}
            {input({ placeholder: 'Payment note (optional)', value: payRef, onChangeText: setPayRef })}
            {photoBlock('Delivery proof photo (min 1)')}
            <SellButton title="Complete Delivery" variant="success" loading={busy === 'deliver'}
              disabled={!!busy || !amount || otp.length !== 4 || !urls.length || uploading} style={{ marginTop: 12 }}
              onPress={() => run('deliver', { amountCollected: amount, otp, paymentRef: payRef.trim() || undefined, photos: urls }, 'Delivery completed')} />
          </SellCard>
        ) : null}

        {FAILABLE.includes(s) ? (
          <SellCard>
            {failOpen ? (
              <>
                {input({ placeholder: 'Reason (e.g. customer not reachable)', value: reason, onChangeText: setReason })}
                <SellButton title="Mark Delivery Failed" variant="danger" loading={busy === 'fail'} disabled={!!busy || !reason.trim()} style={{ marginTop: 10 }}
                  onPress={() => run('fail', { reason: reason.trim() }, 'Marked as failed')} />
              </>
            ) : <SellButton title="Report a problem" variant="outline" onPress={() => setFailOpen(true)} />}
          </SellCard>
        ) : null}

        {s === 'DELIVERY_FAILED' ? (
          <SellCard title="Return to shop">
            <Text style={{ fontSize: 13, color: MUTED }}>Bring the product back to the shop. The owner marks it received and may reassign the delivery.</Text>
          </SellCard>
        ) : null}

        <SellCard title="Timeline">
          {(o.events || []).map((e, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, paddingVertical: 5 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, marginTop: 5, backgroundColor: i === o.events.length - 1 ? SK.teal : SC.green }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: SK.ink }}>{DELIVERY_STATUS[e.status] || e.status}</Text>
                <Text style={{ fontSize: 11.5, color: MUTED }}>{when(e.at)}{e.note ? ` · ${e.note}` : ''}</Text>
              </View>
            </View>
          ))}
        </SellCard>
      </ScrollView>
    </SellPage>
  );
}
