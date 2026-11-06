import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Check, CircleX, Info, PenLine, Store, X } from 'lucide-react-native';
import { Text } from '../../components/Typography';
import { confirm, notify } from '../../components/confirm';
import PickupProblemSheet from '../../components/PickupProblemSheet';
import { sellCustomerDecision } from '../../api/pickups';
import { rf } from '../../utils/responsive';
import { SC, SK, SellButton, SellCard, SellPage, goToSellStage, isGone, money, sellError, useSellPickup } from './sellKit';

const POLL_MS = 5000;

// Customer Confirmation: waits for the shop owner (Partner app approves or
// rejects the revised price), then records the customer's answer. Declined →
// revise again or cancel the pickup.
export default function SellCustomerConfirmScreen({ navigation, route }) {
  const { id, booking, setBooking, reload } = useSellPickup(route);
  const [busy, setBusy] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const lock = useRef(false);
  const rev = booking?.revision || {};
  const status = rev.status;
  const quote = booking?.quotedPrice ?? booking?.finalPrice;

  // The owner answers in the Partner app: re-read until they do.
  useEffect(() => {
    if (!['SHOP_PENDING', 'SHOP_APPROVED', 'NEGOTIATION', 'REJECTED', 'SHOP_REJECTED'].includes(status)) return undefined;
    const t = setInterval(() => { reload().catch(() => {}); }, POLL_MS);
    return () => clearInterval(t);
  }, [status, reload]);
  useEffect(() => {
    if (status === 'APPROVED' || status === 'SHOP_CONFIRMED' || status === 'REINSPECT') goToSellStage(navigation, booking);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (decision) => {
    if (lock.current) return;
    const agree = decision === 'AGREE';
    const ok = await confirm(agree ? {
      title: 'Customer agrees?',
      message: `The final buy price becomes ${money(rev.amount)}.`,
      confirmText: 'Customer Agrees',
    } : {
      title: 'Customer declines?',
      message: `The customer does not accept ${money(rev.amount)}.`,
      confirmText: 'Customer Declines',
    });
    if (!ok) return;
    lock.current = true;
    setBusy(decision);
    try {
      const b = await sellCustomerDecision(id, decision);
      setBooking((cur) => ({ ...cur, ...b }));
      notify(agree ? 'Price agreed' : 'Customer declined', agree ? 'Pay the customer and collect the device.' : 'Revise the price again or cancel the pickup.', { type: agree ? 'success' : 'info' });
    } catch (e) {
      if (isGone(e)) await reload().catch(() => {});
      notify('Could not save the answer', sellError(e, 'Please try again.'), { type: 'error' });
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const revise = () => navigation.replace('SellPriceRevision', { bookingId: id, booking });
  const banner = {
    SHOP_PENDING: { bg: SK.amberSoft, fg: SC.amberInk, title: 'Waiting for Shop Owner', sub: `Revised price ${money(rev.amount)} sent for approval` },
    SHOP_APPROVED: { bg: SK.amberSoft, fg: '#C46A00', title: 'Shop Owner Approved', sub: 'Revised Price:' },
    SHOP_REJECTED: { bg: SC.redSoft, fg: SC.red, title: 'Shop Owner Rejected', sub: rev.shopNote || 'Revise the price again or keep the original quote.' },
    REJECTED: { bg: SC.redSoft, fg: SC.red, title: 'Customer Declined', sub: `${money(rev.amount)} was not accepted — waiting for the shop owner` },
    NEGOTIATION: { bg: SK.amberSoft, fg: SC.amberInk, title: 'Customer Wants to Negotiate', sub: rev.customerNote || 'Waiting for the shop owner to answer' },
  }[status] || { bg: SK.tealSoft, fg: SK.teal, title: 'Revised Price', sub: '' };

  let footer;
  if (status === 'SHOP_APPROVED') {
    footer = (
      <View style={{ gap: 10 }}>
        <SellButton title="Customer Agrees" Icon={Check} variant="success" onPress={() => decide('AGREE')} loading={busy === 'AGREE'} disabled={!!busy} />
        <SellButton title="Customer Declines" Icon={X} variant="danger" onPress={() => decide('DECLINE')} loading={busy === 'DECLINE'} disabled={!!busy} />
      </View>
    );
  } else if (status === 'REJECTED' || status === 'NEGOTIATION') {
    footer = (
      <View style={{ gap: 10 }}>
        <SellButton title="Revise Again" Icon={PenLine} onPress={revise} />
        <SellButton title="Cancel Pickup" Icon={CircleX} variant="danger" onPress={() => setCancelOpen(true)} />
      </View>
    );
  } else if (status === 'SHOP_REJECTED') {
    footer = (
      <View style={{ gap: 10 }}>
        <SellButton title="Revise Again" Icon={PenLine} onPress={revise} />
      </View>
    );
  }

  return (
    <SellPage title="Customer Confirmation" navigation={navigation} footer={footer}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
        <View style={{ backgroundColor: banner.bg, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center' }}>
          {status === 'SHOP_PENDING' ? <ActivityIndicator color={SC.amberInk} /> : <Store size={22} color={banner.fg} />}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: rf(15), fontWeight: '800', color: banner.fg }}>{banner.title}</Text>
            <Text style={{ fontSize: rf(13), color: SK.ink, marginTop: 2 }}>
              {banner.sub}{status === 'SHOP_APPROVED' ? <Text style={{ fontWeight: '800', color: SC.red }}> {money(rev.amount)}</Text> : null}
            </Text>
          </View>
        </View>

        {status === 'SHOP_APPROVED' ? (
          <>
            <Text style={{ fontSize: rf(13.5), color: SK.navy, fontWeight: '600', textAlign: 'center', marginTop: 18 }}>Get customer approval to proceed</Text>
            <SellCard style={{ alignItems: 'center', paddingVertical: 18 }}>
              <Text style={{ fontSize: rf(13), color: SK.muted }}>Final Buy Price</Text>
              <Text style={{ fontSize: rf(30), fontWeight: '800', color: SC.green, marginTop: 4 }}>{money(rev.amount)}</Text>
              <Text style={{ fontSize: rf(12), color: SK.muted, marginTop: 4 }}>Original quote {money(quote)}</Text>
            </SellCard>
          </>
        ) : null}

        <SellCard title="Revision Details">
          <Text style={{ fontSize: rf(12.5), color: SK.ink }}>Revised price: <Text style={{ fontWeight: '800' }}>{money(rev.amount)}</Text> (quote {money(quote)})</Text>
          {rev.reason ? <Text style={{ fontSize: rf(12.5), color: SK.ink, marginTop: 4 }}>Reason: {rev.reason}</Text> : null}
          {rev.note ? <Text style={{ fontSize: rf(12.5), color: SK.muted, marginTop: 4 }}>Note: {rev.note}</Text> : null}
          {status === 'SHOP_PENDING' ? <Text style={{ fontSize: rf(12), color: SK.muted, marginTop: 10 }}>This updates by itself when the shop owner answers in the Partner app.</Text> : null}
        </SellCard>

        {status === 'SHOP_APPROVED' || status === 'REJECTED' ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 14, paddingHorizontal: 4 }}>
            <Info size={14} color={SK.amber} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, marginLeft: 6, fontSize: rf(12), color: SK.muted }}>If declined, choose Revise Again or Cancel Pickup.</Text>
          </View>
        ) : null}
      </ScrollView>
      <PickupProblemSheet booking={booking} visible={cancelOpen} onClose={() => setCancelOpen(false)}
        onDone={() => { setCancelOpen(false); navigation.popTo('PickupAssign'); }} />
    </SellPage>
  );
}
