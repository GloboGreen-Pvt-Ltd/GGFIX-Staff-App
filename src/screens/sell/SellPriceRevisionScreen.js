import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Check, ChevronDown, CircleCheck, TriangleAlert } from 'lucide-react-native';
import { Text } from '../../components/Typography';
import { notify } from '../../components/confirm';
import { getSellEvaluation, submitSellRevision } from '../../api/pickups';
import { rf } from '../../utils/responsive';
import { SC, SK, SellButton, SellCard, SellCta, SellPage, isGone, money, sellError, useSellPickup } from './sellKit';

const PRESETS = ['Display scratches', 'Lower battery health', 'Body dents / scratches', 'Camera issue', 'Speaker / mic issue', 'Network issue', 'Model / storage mismatch'];
const OTHER = 'Other';

// What the saved inspection found: mismatches with the listing and failed checks.
function findingsOf(ins) {
  const out = [];
  (ins?.compare || []).filter((r) => r && r.match === false).forEach((r) => {
    out.push(r.key === 'issue' ? r.actual : r.key === 'condition' ? `Condition ${r.actual}` : `${r.label} mismatch (${r.actual})`);
  });
  (ins?.checks || []).filter((c) => c && c.ok === false).forEach((c) => {
    out.push(c.note || (c.key === 'battery' && c.value ? `Battery health ${c.value}%` : `${c.label} issue`));
  });
  return [...new Set(out.filter(Boolean))];
}

// Price Revision: the shop's quote, what the inspection found, and the revised
// price + reason sent to the shop owner (SellPickupController …/revision). Or
// keep the quote and go straight to payment.
export default function SellPriceRevisionScreen({ navigation, route }) {
  const { id, booking } = useSellPickup(route);
  const rev = booking?.revision;
  const [findings, setFindings] = useState(null);
  const [amount, setAmount] = useState(rev?.amount != null ? String(Math.round(Number(rev.amount))) : '');
  const [reason, setReason] = useState(rev?.reason || '');
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState(rev?.note || '');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    getSellEvaluation(id).then((ev) => setFindings(findingsOf(ev?.pickupInspection))).catch(() => setFindings([]));
  }, [id]);

  const auto = findings?.length ? findings.slice(0, 3).join(' & ').replace(/^./, (c) => c.toUpperCase()) : null;
  const options = useMemo(() => [...new Set([auto, rev?.reason, ...PRESETS].filter(Boolean)), OTHER], [auto, rev?.reason]);
  useEffect(() => { if (!reason && auto) setReason(auto); }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps

  const quote = booking?.finalPrice ?? booking?.quotedPrice;
  const value = Number(amount);
  const finalReason = (reason === OTHER ? custom : reason).trim();
  const valid = amount !== '' && value > 0 && value !== Number(quote) && finalReason.length >= 3;
  const declined = rev?.status === 'REJECTED';

  const submit = async () => {
    if (!valid || lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      const b = await submitSellRevision(id, { amount: value, reason: finalReason, note: note.trim() || undefined });
      notify('Sent to shop owner', 'Waiting for their approval.', { type: 'success' });
      navigation.replace('SellCustomerConfirm', { bookingId: id, booking: { ...booking, ...b } });
    } catch (e) {
      if (isGone(e)) {
        notify('Pickup changed', 'This pickup was updated. Showing the latest status.', { type: 'info' });
        navigation.popTo('PickupAssign');
      } else {
        notify('Could not send the revised price', sellError(e, 'Please try again.'), { type: 'error' });
      }
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  return (
    <SellPage
      title="Price Revision"
      navigation={navigation}
      footer={(
        <View style={{ gap: 8 }}>
          <SellCta title="Submit to Shop Owner" onPress={submit} disabled={!valid} loading={saving} />
          {!declined ? (
            <SellButton title={`Keep Original Price ${money(quote)}`} variant="outline" disabled={saving}
              onPress={() => (booking?.revision?.status === 'SHOP_CONFIRMED'
                ? navigation.replace('SellPayment', { bookingId: id, booking })
                : notify('Waiting for the shop owner', 'The owner approves the price in the Partner app after reviewing your inspection. Payment opens after that — this page updates by itself.', { type: 'info' }))} />
          ) : null}
        </View>
      )}
    >
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: SK.tealSoft, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#C7E6EA' }}>
          <Text style={{ fontSize: rf(12.5), color: SK.navy, fontWeight: '600' }}>Original Quote (Shop)</Text>
          <Text style={{ fontSize: rf(26), fontWeight: '800', color: SK.teal, marginTop: 2 }}>{money(quote)}</Text>
        </View>

        <SellCard title="Inspection Result">
          {findings == null ? <Text style={{ fontSize: rf(12.5), color: SK.muted }}>Loading…</Text>
            : findings.length ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <TriangleAlert size={16} color={SK.amber} />
                  <Text style={{ marginLeft: 6, fontSize: rf(13), fontWeight: '800', color: SC.amberInk }}>Price needs to be revised</Text>
                </View>
                {findings.map((f) => <Text key={f} style={{ fontSize: rf(12.5), color: SK.ink, marginTop: 3 }}>•  {f}</Text>)}
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <CircleCheck size={16} color={SC.green} />
                <Text style={{ marginLeft: 6, fontSize: rf(13), fontWeight: '700', color: SC.green }}>Device matches the listing</Text>
              </View>
            )}
          {declined ? <Text style={{ fontSize: rf(12), color: SC.red, fontWeight: '700', marginTop: 8 }}>The customer declined {money(rev.amount)}. Offer another price.</Text> : null}
          {rev?.status === 'SHOP_REJECTED' && rev.shopNote ? <Text style={{ fontSize: rf(12), color: SC.red, fontWeight: '700', marginTop: 8 }}>Shop owner: {rev.shopNote}</Text> : null}
        </SellCard>

        <SellCard>
          <Text style={{ fontSize: rf(13), fontWeight: '800', color: SK.ink }}>Revised Price <Text style={{ color: SC.red }}>*</Text></Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: amount ? SK.teal : SK.line, borderRadius: 12, paddingHorizontal: 12, height: 50, marginTop: 8 }}>
            <Text style={{ fontSize: rf(20), fontWeight: '800', color: SK.ink }}>₹</Text>
            <TextInput value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" placeholder="40000"
              placeholderTextColor={SK.ring} accessibilityLabel="Revised price" style={{ flex: 1, marginLeft: 6, fontSize: rf(20), fontWeight: '800', color: SK.ink, padding: 0 }} />
          </View>
          {amount !== '' && value === Number(quote) ? <Text style={{ fontSize: rf(11.5), color: SC.red, marginTop: 4 }}>Same as the quote — keep the original price instead.</Text> : null}

          <Text style={{ fontSize: rf(13), fontWeight: '800', color: SK.ink, marginTop: 16 }}>Reason for Revision <Text style={{ color: SC.red }}>*</Text></Text>
          <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel="Reason for revision"
            style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: reason ? SK.teal : SK.line, borderRadius: 12, paddingHorizontal: 12, minHeight: 48, marginTop: 8 }}>
            <Text style={{ flex: 1, fontSize: rf(13), color: reason ? SK.ink : SK.ring, paddingVertical: 10 }}>{reason || 'Choose a reason'}</Text>
            <ChevronDown size={18} color={SK.muted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
          </Pressable>
          {open ? (
            <View style={{ borderWidth: 1, borderColor: SK.line, borderRadius: 12, marginTop: 6, overflow: 'hidden' }}>
              {options.map((o, i) => (
                <Pressable key={o} onPress={() => { setReason(o); setOpen(false); }} accessibilityRole="radio" accessibilityState={{ checked: reason === o }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: SK.line, backgroundColor: reason === o ? SK.tealSoft : '#FFFFFF' }}>
                  <Text style={{ flex: 1, fontSize: rf(13), color: SK.ink, fontWeight: reason === o ? '800' : '500' }}>{o}</Text>
                  {reason === o ? <Check size={16} color={SK.teal} /> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          {reason === OTHER ? (
            <TextInput value={custom} onChangeText={setCustom} placeholder="Describe the reason" placeholderTextColor={SK.ring} maxLength={200}
              style={{ borderWidth: 1, borderColor: SK.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8, fontSize: rf(13), color: SK.ink }} />
          ) : null}

          <Text style={{ fontSize: rf(13), fontWeight: '800', color: SK.ink, marginTop: 16 }}>Add Note <Text style={{ color: SK.muted, fontWeight: '600' }}>(Optional)</Text></Text>
          <TextInput value={note} onChangeText={setNote} placeholder="e.g. Minor dent on corner." placeholderTextColor={SK.ring} multiline maxLength={1000}
            style={{ borderWidth: 1, borderColor: SK.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8, minHeight: 84, textAlignVertical: 'top', fontSize: rf(13), color: SK.ink }} />
        </SellCard>
      </ScrollView>
    </SellPage>
  );
}
