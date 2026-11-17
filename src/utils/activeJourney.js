// Pickup person's "on a journey" check for the geofence: true while any task
// assigned to them (server scoped by the JWT: role, employee, shop) has started
// its journey and isn't back at / handed over to the shop yet.
// Always fresh from the server — never a cached flag. Returns null when the
// server couldn't be asked (offline / API errors) so callers fall back to the
// normal geofence instead of granting unlimited range on stale data.
import { listMyAssignedPickups } from '../api/pickups';
import { listMyDeliveries } from '../api/buyDeliveries';
import { listRepairDeliveries } from '../api/repairDeliveries';
import { stepIndex } from './pickups';

const list = (r) => (Array.isArray(r) ? r : (r?.content ?? r?.data ?? []));
const up = (s) => String(s || '').toUpperCase();

// Pickup: On the Way … Reached Shop (ends at Handed Over to Shop).
const pickupActive = (b) => { const i = stepIndex(b?.status); return i >= 1 && i <= 5; };
// Buy delivery: collected from shop … until Delivered / Returned to shop.
const BUY_ACTIVE = ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED'];
// Repair return delivery: collected … until Delivered / Returned.
const REPAIR_ACTIVE = ['COLLECTED', 'OUT_FOR_DELIVERY', 'ARRIVED', 'FAILED', 'RETURNING'];

export async function hasActiveJourney() {
  const res = await Promise.allSettled([listMyAssignedPickups(), listMyDeliveries(), listRepairDeliveries()]);
  const [p, b, r] = res.map((x) => (x.status === 'fulfilled' ? list(x.value) : null));
  if ((p || []).some(pickupActive)
    || (b || []).some((o) => BUY_ACTIVE.includes(up(o?.status)))
    || (r || []).some((d) => REPAIR_ACTIVE.includes(up(d?.status)))) return true;
  return res.every((x) => x.status === 'fulfilled') ? false : null;
}
