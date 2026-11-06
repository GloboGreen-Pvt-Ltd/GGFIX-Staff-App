import { useCallback, useRef, useState } from 'react';
import { acceptPickup, getPickupRepairEstimate, getSellEvaluation, updatePickupStatus } from '../api/pickups';
import { confirm, notify } from '../components/confirm';
import { readPickupPersonLocation } from './pickupLocation';
import { nextStepFor } from './pickups';
import { isSafeText, userMessage } from './userMessages';

// "Next step" for a pickup booking (My Pickups cards + Pickup Details). The
// screen changes only after the backend confirms; `onDone` re-reads the list.
// One request at a time: a second tap while one is in flight is ignored.
export default function usePickupAdvance({ navigation, onDone }) {
  const [busyId, setBusyId] = useState(null);
  const inFlight = useRef(false);

  const advance = useCallback(async (booking) => {
    const next = nextStepFor(booking);
    if (!next || inFlight.current) return;
    // The journey opens 1 hour before the scheduled pickup time (server: startAllowedAt).
    if (next.code === 'PICKUP_ON_THE_WAY' && next.action !== 'accept') {
      const from = booking.startAllowedAt ? new Date(booking.startAllowedAt) : null;
      if (from && !Number.isNaN(from.getTime()) && Date.now() < from.getTime()) {
        const when = from.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
        notify('Too early to start', `You can start this pickup from ${when} (1 hour before the pickup time).`, { type: 'warning' });
        return;
      }
    }
    if (next.action === 'sellStage') {
      // Device purchase at the door: OTP → Compare & Inspect → Price → Payment & Pickup.
      navigation.navigate(next.route, { bookingId: booking.id, booking });
      return;
    }
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
    if (next.action === 'sellInspect') {
      // Device purchase: Device Collected after re-checking the device on the
      // customer's selling pages (Device Details → Screening → Screen →
      // Functional → Accessories & Warranty), pre-filled with the customer's
      // answers. No repair estimate here. An older server without the
      // evaluation → the pages open empty.
      let evaluation = null;
      try { evaluation = await getSellEvaluation(booking.id); } catch (_) { /* pages open without the customer's answers */ }
      navigation.navigate('PickupDeviceDetails', {
        bookingId: booking.id,
        booking,
        sellInspection: true,
        sellEval: evaluation,
        ...(evaluation?.modelId ? {
          brandId: evaluation.brandId || null,
          modelId: evaluation.modelId,
          ramOptionId: evaluation.ramOptionId || null,
          storageOptionId: evaluation.storageOptionId || null,
          color: evaluation.color || booking.color || null,
          deviceCategoryId: evaluation.categoryId || null,
        } : {}),
      });
      return;
    }
    // Customer Confirmation comes before Device Collected: the saved estimate
    // must carry the customer's approval (customerApproval DONE, set on the
    // estimate's Review & Confirm). The server only checks that an estimate
    // exists, so the app holds the step until the approval is on record.
    // (Repair pickups only — a device purchase has no estimate.)
    if (next.code === 'DEVICE_PICKED_UP' && booking.kind !== 'SELL') {
      let est = null;
      try {
        est = await getPickupRepairEstimate(booking.id);
      } catch (e) {
        notify('Could not check customer confirmation', userMessage(e, 'Please try again.'), { type: 'error' });
        return;
      }
      const approved = est?.customerApproval === 'DONE' || est?.customerApproval === true;
      if (!approved) {
        const open = await confirm({
          title: 'Customer confirmation pending',
          message: 'Mark the customer\'s approval on the repair estimate before collecting the device.',
          confirmText: 'Open Estimate',
        });
        if (open) navigation.navigate('PickupEstimateDetail', { booking, bookingId: booking.id });
        return;
      }
    }
    const ref = booking.bookingNumber || booking.id;
    const ok = await confirm(next.action === 'accept' ? {
      title: 'Accept this pickup?',
      message: `Booking ${ref} becomes yours. You can start the journey after accepting.`,
      confirmText: 'Accept',
    } : next.combined ? {
      title: 'Accept this pickup?',
      message: `Accepting booking ${ref} starts your journey to the customer (On the Way).`,
      confirmText: 'Accept',
    } : next.code === 'PICKUP_ON_THE_WAY' ? {
      title: 'Start journey?',
      message: `Booking ${ref} will show you as On the Way to the customer.`,
      confirmText: 'Start Journey',
    } : {
      title: 'Update status?',
      message: `Mark booking ${ref} as "${next.label}"?`,
      confirmText: next.label,
    });
    if (!ok || inFlight.current) return;
    inFlight.current = true;
    setBusyId(booking.id);
    if (next.action === 'accept') {
      // Accept only records the acceptance; the screen re-reads the server
      // copy, which now carries the full booking and the Start Journey step.
      try {
        await acceptPickup(booking.id);
        notify('Pickup accepted', 'You can start the journey when ready.', { type: 'success' });
        await onDone?.();
      } catch (e) {
        const code = e?.payload?.code;
        notify(code === 'STALE_STATUS' || code === 'NOT_ASSIGNED' ? 'Pickup changed' : 'Could not accept pickup',
          code === 'STALE_STATUS' || code === 'NOT_ASSIGNED' ? 'This pickup was updated by the shop. Refreshing…' : userMessage(e, 'Please try again.'),
          { type: 'error' });
        await onDone?.();
      } finally {
        inFlight.current = false;
        setBusyId(null);
      }
      return;
    }
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
      } else if (payload.code === 'ACCEPT_REQUIRED') {
        notify('Accept the pickup first', 'Accept this pickup before starting the journey.', { type: 'warning' });
        await onDone?.();
      } else if (payload.code === 'STALE_STATUS') {
        // A repeat tap / another device got there first: show the server's state.
        notify('Pickup already updated', 'Showing the latest status.', { type: 'info' });
        await onDone?.();
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
