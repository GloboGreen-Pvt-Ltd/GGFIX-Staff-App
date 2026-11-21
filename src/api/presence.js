import { ticketApi } from './client';

// Shop presence (ticket-service ShopPresenceController). The server decides
// inside / outside, grace period, authorized duty and freeze — the app only
// reports GPS readings (or a location error) and shows the result.
export const pingPresence = (body) => ticketApi.post('/technicians/me/presence/ping', { body });
export const getMyPresence = (date) => ticketApi.get(`/technicians/me/presence${date ? `?date=${date}` : ''}`);
