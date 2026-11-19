// Tells the user why they were signed out when the server reports that the
// account was logged in on another device (SESSION_REPLACED).
import { Alert } from 'react-native';

let shown = false;

export async function alertIfReplaced(res) {
  try {
    const text = await res.clone().text();
    if (!/SESSION_REPLACED/.test(text) || shown) return;
    shown = true;
    Alert.alert('Session Expired', 'Logged in on another device. Please log in again.', [{ text: 'OK', onPress: () => { shown = false; } }]);
  } catch (_) { /* ignore */ }
}
