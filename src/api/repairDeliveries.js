import { ticketApi } from './client';

// Repair return deliveries assigned to the logged-in employee
// (ticket-service /technicians/me/repair-deliveries). The server only returns and
// accepts deliveries assigned to this employee of the token's shop.

export const REPAIR_DELIVERY_TABS = [
  { key: 'ACTIVE', label: 'Active', statuses: ['ASSIGNED', 'ACCEPTED', 'COLLECTED', 'OUT_FOR_DELIVERY', 'ARRIVED', 'FAILED', 'RETURNING'] },
  { key: 'HISTORY', label: 'History', statuses: ['DELIVERED', 'RETURNED', 'UNASSIGNED'] },
];

export const listRepairDeliveries = () => ticketApi.get('/technicians/me/repair-deliveries');
export const getRepairDelivery = (id) => ticketApi.get(`/technicians/me/repair-deliveries/${id}`);

// action: accept | decline {reason} | collect {identifier, accessories[], photos[]} | start | arrive
//   | otp/resend | complete {otp, amountCollected, paymentMethod, paymentRef, photos[]} | fail {reason} | return
export const repairDeliveryAction = (id, action, body) =>
  ticketApi.post(`/technicians/me/repair-deliveries/${id}/${action}`, body ? { body } : undefined);
