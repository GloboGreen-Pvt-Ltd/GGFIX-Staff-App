// Foreground GPS reading for the pickup-person "Reached Shop" tap.
//
// The backend (PickupBookingController) enforces a 50m radius around the
// shop's stored lat/lng before allowing the REACHED_SHOP transition. The UI
// gates the button by fetching the current position here and shipping it in
// the PATCH body. On permission / accuracy failure we surface a structured
// error the caller can show as a notify().
import * as Location from 'expo-location';

export async function readPickupPersonLocation() {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    const err = new Error('Location permission required.');
    err.code = 'LOCATION_PERMISSION_DENIED';
    throw err;
  }
  // BestForNavigation is overkill (it spins up the GNSS); Highest gives us a
  // ~5-10m accuracy fix in a few seconds, plenty for a 50m radius check.
  let pos;
  try {
    // Fast path: a recent cached fix (≤5s old) is plenty for a 50m radius check
    // and avoids spinning up the GNSS. `maximumAge` is NOT a valid
    // getCurrentPositionAsync option (it was silently ignored) — the cached-fix
    // intent belongs to getLastKnownPositionAsync, whose `maxAge` this honors.
    const cached = await Location.getLastKnownPositionAsync({ maxAge: 5_000 });
    pos = cached || await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });
  } catch (e) {
    const err = new Error(e?.message || 'Could not read location.');
    err.code = 'LOCATION_UNAVAILABLE';
    throw err;
  }
  const { latitude, longitude, accuracy } = pos.coords || {};
  if (latitude == null || longitude == null) {
    const err = new Error('Location is missing coordinates.');
    err.code = 'LOCATION_UNAVAILABLE';
    throw err;
  }
  return { latitude, longitude, accuracy };
}
