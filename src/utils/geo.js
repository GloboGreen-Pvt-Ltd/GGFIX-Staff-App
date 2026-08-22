// Shared geolocation helpers for the employee-app attendance geofence.
//
// The 100m radius must match the backend gate (TechnicianService
// SHOP_ATTENDANCE_RADIUS_METERS) so the on-device lock overlay and the
// server-side check-in/check-out rejection agree on who's "in range".
import { readPickupPersonLocation } from './pickupLocation';

// Keep this in lockstep with the backend SHOP_ATTENDANCE_RADIUS_METERS.
export const GEOFENCE_RADIUS_METERS = 100;

// Reuse the pickup flow's foreground GPS reader — same permission handling and
// structured error codes (LOCATION_PERMISSION_DENIED / LOCATION_UNAVAILABLE).
export const readCurrentLocation = readPickupPersonLocation;

// Great-circle distance in metres between two lat/lng points. Mirrors the
// backend haversineMeters so both sides compute the same distance.
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const EARTH_RADIUS_M = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
