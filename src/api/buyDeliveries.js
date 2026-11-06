import { marketplaceApi } from './client';

// Fixed-price Buy orders assigned to the logged-in employee
// (marketplace-service /staff/buy-orders). The server only returns and accepts
// orders whose assignedStaffUserId is this user and whose shop matches the token.

export const DELIVERY_STATUS = {
  ASSIGNED: 'New assignment',
  ACCEPTED: 'Go to shop',
  PICKED_UP: 'Picked up',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery failed',
  RETURNED: 'Returned to shop',
  CONFIRMED: 'Reassigned',
  PLACED: 'Order placed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
  COMPLETED: 'Completed',
};

export const DELIVERY_TABS = [
  { key: 'NEW', label: 'New', statuses: ['ASSIGNED'] },
  { key: 'ACTIVE', label: 'Active', statuses: ['ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] },
  { key: 'HISTORY', label: 'History', statuses: ['DELIVERED', 'DELIVERY_FAILED', 'RETURNED', 'CANCELLED', 'REJECTED', 'COMPLETED', 'CONFIRMED', 'PLACED'] },
];

export const listMyDeliveries = () => marketplaceApi.get('/staff/buy-orders');
export const getDelivery = (id) => marketplaceApi.get(`/staff/buy-orders/${id}`);

// action: accept | decline | pickup | start-delivery | deliver | fail
//  pickup  { productVerified: true, photos: [url…] (≥1) }
//  deliver { amountCollected, otp, paymentRef?, photos: [url…] (≥1) }
//  fail    { reason }
export const deliveryAction = (id, action, body = {}) =>
  marketplaceApi.post(`/staff/buy-orders/${id}/${action}`, { body });
