import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check, CircleCheck, Images } from 'lucide-react-native';
import { Text, TextInput } from '../../components/Typography';
import { confirm, notify } from '../../components/confirm';
import { recordSellPayment, updatePickupStatus } from '../../api/pickups';
import { uploadMedia } from '../../api/media';
import { rf } from '../../utils/responsive';
import { SC, SK, SellCta, SellPage, cardShadow, isGone, money, sellError, useSellPickup } from './sellKit';

function Step({ done, title, children }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: SK.line, padding: 14, marginTop: 10, ...cardShadow }}>
      <CircleCheck size={24} color={done ? SC.green : SK.ring} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ fontSize: rf(14.5), fontWeight: '800', color: SK.ink }}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

// Payment & Pickup: pay the customer (UPI / cash) with a proof photo, take the
// device, then Complete Pickup (SellPickupController …/payment, then status
// DEVICE_PICKED_UP). A payment already recorded is shown, not asked again.
export default function SellPaymentScreen({ navigation, route }) {
  const { id, booking, setBooking } = useSellPickup(route);
  const paid = booking?.payment;
  const amount = paid?.amount ?? booking?.finalPrice ?? booking?.quotedPrice;
  const [method, setMethod] = useState('UPI');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState(null); // { uri, url, busy }
  const [received, setReceived] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);

  const pickProof = async (fromCamera) => {
    try {
      if (Platform.OS !== 'web') {
        const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          notify('Permission required', `Allow ${fromCamera ? 'camera' : 'photo library'} access to add the payment proof.`, { type: 'warning' });
          return;
        }
      }
      const opts = { mediaTypes: ['images'], allowsEditing: false, quality: 0.7 };
      const result = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset?.uri) return;
      setProof({ uri: asset.uri, url: null, busy: true });
      const res = await uploadMedia({ uri: asset.uri, name: asset.fileName || 'payment-proof.jpg', type: asset.mimeType || 'image/jpeg', folder: 'sell-pickup', slot: `${id}-payment` });
      const url = res?.url || res?.secure_url || null;
      setProof({ uri: asset.uri, url, busy: false });
    } catch (e) {
      setProof(null);
      notify('Proof not uploaded', sellError(e, 'Please try again.'), { type: 'error' });
    }
  };

  const refOk = !reference.trim() || /^[A-Za-z0-9]{6,30}$/.test(reference.trim());
  const ready = received && (paid || (proof?.url && refOk));

  const complete = async () => {
    if (!ready || lock.current) return;
    const ok = await confirm({
      title: 'Complete pickup?',
      message: `You paid ${money(amount)} to the customer and collected the device. Return to the shop to hand it over.`,
      confirmText: 'Complete Pickup',
    });
    if (!ok) return;
    lock.current = true;
    setSaving(true);
    try {
      if (!paid) {
        const b = await recordSellPayment(id, { method, reference: reference.trim() || undefined, proofUrl: proof.url });
        setBooking((cur) => ({ ...cur, ...b }));
      }
      await updatePickupStatus(id, 'DEVICE_PICKED_UP');
      notify('Pickup completed', 'Take the device to the shop.', { type: 'success' });
      navigation.popTo('PickupAssign');
    } catch (e) {
      if (isGone(e)) {
        notify('Pickup changed', 'This pickup was updated. Showing the latest status.', { type: 'info' });
        navigation.popTo('PickupAssign');
      } else {
        notify('Could not complete the pickup', sellError(e, 'Please try again.'), { type: 'error' });
      }
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  return (
    <SellPage title="Payment & Pickup" navigation={navigation}
      footer={<SellCta title="Complete Pickup" onPress={complete} disabled={!ready} loading={saving} />}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Step done={!!paid || (!!proof?.url && refOk)} title="Payment to Customer">
          <Text style={{ fontSize: rf(13), color: SK.ink, marginTop: 2 }}>
            <Text style={{ fontWeight: '800' }}>{money(amount)}</Text> ({paid ? (paid.method === 'CASH' ? 'Cash' : 'UPI') : 'UPI / Cash'})
          </Text>
          {!paid ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {['UPI', 'CASH'].map((m) => {
                  const on = method === m;
                  return (
                    <Pressable key={m} onPress={() => setMethod(m)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                      style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 2 : 1, borderColor: on ? SK.teal : SK.line, backgroundColor: on ? SK.tealSoft : '#FFFFFF' }}>
                      <Text style={{ fontSize: rf(13), fontWeight: '800', color: on ? SK.teal : SK.ink }}>{m === 'UPI' ? 'UPI' : 'Cash'}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {method === 'UPI' ? (
                <TextInput value={reference} onChangeText={(t) => setReference(t.replace(/[^A-Za-z0-9]/g, '').slice(0, 30))} placeholder="UPI reference / UTR (optional)"
                  placeholderTextColor={SK.ring} autoCapitalize="characters" style={{ marginTop: 8, borderWidth: 1, borderColor: refOk ? SK.line : SC.red, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: rf(13), color: SK.ink }} />
              ) : null}
            </>
          ) : paid.reference ? <Text style={{ fontSize: rf(12), color: SK.muted, marginTop: 2 }}>Ref {paid.reference}</Text> : null}
        </Step>

        <Step done={!!paid?.proofUrl || !!proof?.url} title="Upload Payment Proof">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
            {(paid?.proofUrl || proof?.uri) ? (
              <View style={{ height: 72, width: 60, borderRadius: 10, overflow: 'hidden', backgroundColor: SK.tile, borderWidth: 1, borderColor: SK.line }}>
                <Image source={{ uri: paid?.proofUrl || proof.uri }} style={{ height: 72, width: 60 }} />
                {proof?.busy ? (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
            ) : null}
            {!paid ? (
              <>
                <Pressable onPress={() => pickProof(true)} disabled={proof?.busy} accessibilityRole="button" accessibilityLabel="Take payment proof photo"
                  style={{ height: 60, width: 60, borderRadius: 12, borderWidth: 1, borderColor: SK.line, alignItems: 'center', justifyContent: 'center', backgroundColor: SK.tile }}>
                  <Camera size={22} color={SK.teal} />
                </Pressable>
                <Pressable onPress={() => pickProof(false)} disabled={proof?.busy} accessibilityRole="button" accessibilityLabel="Choose payment proof from gallery"
                  style={{ height: 60, width: 60, borderRadius: 12, borderWidth: 1, borderColor: SK.line, alignItems: 'center', justifyContent: 'center', backgroundColor: SK.tile }}>
                  <Images size={20} color={SK.muted} />
                </Pressable>
              </>
            ) : null}
          </View>
          {!paid ? <Text style={{ fontSize: rf(11.5), color: SK.muted, marginTop: 6 }}>Screenshot of the UPI payment, or a photo of the cash handover.</Text> : null}
        </Step>

        <Step done={received} title="Collect Device">
          <Pressable onPress={() => setReceived((r) => !r)} accessibilityRole="checkbox" accessibilityState={{ checked: received }}
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <View style={{ height: 22, width: 22, borderRadius: 6, borderWidth: 2, borderColor: received ? SC.green : SK.ring, backgroundColor: received ? SC.green : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              {received ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
            </View>
            <Text style={{ marginLeft: 8, fontSize: rf(13), fontWeight: '700', color: received ? SC.green : SK.ink }}>{received ? 'Received' : 'I have the device from the customer'}</Text>
          </Pressable>
        </Step>
      </ScrollView>
    </SellPage>
  );
}
