import { useCallback, useRef, useState } from 'react';
import { updatePickupStatus } from '../api/pickups';
import { confirm, notify } from '../components/confirm';
import { readPickupPersonLocation } from './pickupLocation';
import { nextStatusFor } from './pickups';
import { isSafeText, userMessage } from './userMessages';

// "Next step" for a pickup booking (My Pickups cards + Pickup Details). The
// screen changes only after the backend confirms; `onDone` re-reads the list.
// One request at a time: a second tap while one is in flight is ignored.
export default function usePickupAdvance({ navigation, onDone }) {
  const [busyId, setBusyId] = useState(null);
  const inFlight = useRef(false);

  const advance = useCallback(async (booking) => {
    const next = nextStatusFor(booking.status);
    if (!next || inFlight.current) return;
    if (next.action === 'estimate') {
      // Repair Estimate (Partner booking pages): Device Details → Devices &
      // Repair → Review & Confirm. Device Details starts from the booking's
      // brand / model; its Change buttons open the brand / model / variant
      // pickers. The whole booking is passed so every step gets a stable payload.
      navigation.navigate('PickupDeviceDetails', {
        bookingId: booking.id,
        pickupReportId: booking.pickupReportId || booking.id,
        pickupRequestId: booking.pickupRequestId || null,
        trackingId: booking.bookingNumber || null,
        customerId: booking.customerUserId || null,
        shopId: booking.shopId || null,
        pickupPersonId: booking.assignedPickupPersonId || null,
        deviceCategoryId: booking.deviceCategoryId || null,
        deviceCategoryCode: booking.deviceCategoryCode || null,
        booking,
      });
      return;
    }
    const ok = await confirm({
      title: 'Update status?',
      message: `Mark booking ${booking.bookingNumber || booking.id} as "${next.label}"?`,
      confirmText: next.label,
    });
    if (!ok || inFlight.current) return;
    inFlight.current = true;
    setBusyId(booking.id);
    try {
      // Reached Shop / Reached Customer are 50 m GPS gates on the server
      // (shop coords / customer address coords): send the current reading.
      let extras = {};
      if (next.action === 'reached' || next.action === 'reachedCustomer') {
        try {
          const { latitude, longitude } = await readPickupPersonLocation();
          extras = { latitude, longitude };
        } catch (locErr) {
          if (next.action === 'reached') {
            // The shop always has coordinates + a hard gate: no fix can pass it.
            notify('Location needed', userMessage(locErr, 'Turn on location and try again to mark Reached Shop.'), { type: 'warning' });
            return;
          }
          // Reached Customer is allowed without GPS when the customer address
          // has no saved coordinates — let the server decide.
        }
      }
      const resp = await updatePickupStatus(booking.id, next.code, extras);
      notify('Status updated', resp?.message && isSafeText(resp.message) ? resp.message : next.label, { type: 'success' });
      await onDone?.();
    } catch (e) {
      // 422 + { code, message, distanceMeters } when a radius check fails.
      const payload = e?.payload || {};
      const customerStep = next.action === 'reachedCustomer';
      if (payload.code === 'OUT_OF_RADIUS') {
        notify(customerStep ? 'Not at customer yet' : 'Not at shop yet',
          (isSafeText(payload.message) ? payload.message : null)
            || `You are ${payload.distanceMeters || '?'}m away. Please reach the ${customerStep ? 'customer address' : 'shop'} to continue.`, { type: 'error' });
      } else if (payload.code === 'LOCATION_REQUIRED') {
        notify('Location needed', isSafeText(payload.message) ? payload.message : 'Enable location and try again.', { type: 'warning' });
      } else if (payload.code === 'SHOP_LOCATION_MISSING') {
        notify('Shop location missing',
          isSafeText(payload.message) ? payload.message : 'Shop coordinates are not set. Ask the owner to update the shop profile.', { type: 'error' });
      } else {
        notify('Could not update status', userMessage(e, 'Please try again.'), { type: 'error' });
      }
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
  }, [navigation, onDone]);

  return { advance, busyId };
}
