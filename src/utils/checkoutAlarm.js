// Checkout reminder. Once the technician has checked in, one local
// notification is scheduled for CHECKOUT_ALARM_TIME (6:30 PM) — the message
// only: no sound, no vibration, no siren / repeat / Do-Not-Disturb bypass (that
// SOS alarm was retired). It's OS-scheduled, so it fires even when the app is
// closed; a successful check-out cancels it. Syncing after 6:30 while still on
// duty shows it straight away instead, at most once a day.
//
// expo-notifications is loaded lazily and only where its native side exists.
// In Expo Go / web every export here is a no-op (components/CheckoutReminder
// shows an in-app popup there instead); dev + release builds work.
import { Platform } from 'react-native';
import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Native modules expo-notifications needs the moment it's imported. When one is
// missing — Expo Go (SDK 58 Expo Go has no ExpoTopicSubscriptionModule), or a
// build made without the package — importing it is fatal: Metro hands a module
// that throws while loading straight to the global error handler ("Uncaught
// Error: Cannot find native module …"), so the try/catch below never sees it.
// So check first and only then require.
const REQUIRED_NATIVE_MODULES = Platform.OS === 'android'
  ? ['ExpoNotificationScheduler', 'ExpoTopicSubscriptionModule']
  : ['ExpoNotificationScheduler'];
function nativeNotificationsAvailable() {
  if (Platform.OS === 'web' || isRunningInExpoGo()) return false;
  return REQUIRED_NATIVE_MODULES.every((name) => requireOptionalNativeModule(name) != null);
}

let Notifications = null;
function load() {
  if (Notifications) return Notifications;
  if (!nativeNotificationsAvailable()) return null;
  try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      // The check-out reminder stays silent while the app is open as well.
      handleNotification: async (n) => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: n?.request?.content?.data?.kind !== KIND,
        shouldSetBadge: false,
        priority: Notifications.AndroidNotificationPriority.MAX,
      }),
    });
  } catch (e) {
    console.warn('[notifications] unavailable', e?.message);
    Notifications = null;
  }
  return Notifications;
}

export const CHECKOUT_ALARM_TIME = { hour: 18, minute: 30 };
export const CHECKOUT_REMINDER_TITLE = 'Check-out reminder';
export const CHECKOUT_REMINDER_BODY = 'It is 6:30 PM. Please check out in NearGFix before you leave.';
// New channel id: Android fixes a channel's sound when it's created, so the
// silent reminder can't reuse the earlier channels — those are deleted on sync:
// the SOS alarm's (siren, alarm audio, DND bypass) and the first reminder's
// (default sound). Any SOS notification a device still has scheduled is
// cancelled too.
const CHANNEL_ID = 'checkout-reminder-silent-v1';
const KIND = 'checkout-reminder';
const LEGACY_CHANNEL_IDS = ['checkout-sos-v1', 'checkout-reminder-v1'];
const LEGACY_KIND = 'checkout-sos';
// Local date the reminder was last scheduled or shown, so a sync after 6:30
// doesn't pop it up a second time the same day.
const SHOWN_KEY = 'ggfix.checkoutReminder.date';

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let channelReady = null;
function ensureChannel() {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelReady) {
    channelReady = Promise.all(LEGACY_CHANNEL_IDS.map((id) => Notifications.deleteNotificationChannelAsync(id).catch(() => {})))
      .then(() => Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Check-out reminder',
        // HIGH = shown as a popup; no sound and no vibration.
        importance: Notifications.AndroidImportance.HIGH,
        sound: null,
        enableVibrate: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      }))
      .catch((e) => { channelReady = null; throw e; });
  }
  return channelReady;
}

/** True when OS notifications work here (dev / release builds, not Expo Go or web). */
export function checkoutReminderUsesOs() {
  return !!load();
}

async function ensurePermission() {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true },
  });
  return !!req.granted;
}

/** Fire an immediate local notification (shares the handler set above). */
export async function notifyNow(title, body) {
  if (!load()) return;
  try {
    if (!(await ensurePermission())) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default', priority: Notifications.AndroidNotificationPriority.MAX },
      trigger: null,
    });
  } catch (e) {
    console.warn('[notifyNow] failed', e?.message);
  }
}

/** True when it's past today's checkout alarm time. */
export function isPastCheckoutAlarm(now = new Date()) {
  const t = new Date(now);
  t.setHours(CHECKOUT_ALARM_TIME.hour, CHECKOUT_ALARM_TIME.minute, 0, 0);
  return now >= t;
}

export async function cancelCheckoutAlarm() {
  if (!load()) return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(all
      .filter((n) => [KIND, LEGACY_KIND].includes(n?.content?.data?.kind))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  } catch { /* nothing scheduled */ }
}

/**
 * Bring the reminder in line with today's attendance row: checked in and not
 * checked out → schedule today's 6:30 PM popup (or show it now if it's already
 * past 6:30 and it hasn't been shown today); otherwise cancel it. Safe to call
 * repeatedly.
 */
export async function syncCheckoutAlarm(todayAttendance) {
  if (!load()) return;
  const onDuty = !!todayAttendance?.checkInTime && !todayAttendance?.checkOutTime;
  await cancelCheckoutAlarm();
  if (!onDuty) return;
  try {
    if (!(await ensurePermission())) return;
    await ensureChannel();
    const now = new Date();
    const at = new Date(now);
    at.setHours(CHECKOUT_ALARM_TIME.hour, CHECKOUT_ALARM_TIME.minute, 0, 0);
    const today = localDateKey(now);
    const content = {
      title: CHECKOUT_REMINDER_TITLE,
      body: CHECKOUT_REMINDER_BODY,
      sound: false,
      data: { kind: KIND },
    };
    if (at > now) {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
      });
      await AsyncStorage.setItem(SHOWN_KEY, today).catch(() => {});
      return;
    }
    if ((await AsyncStorage.getItem(SHOWN_KEY).catch(() => null)) === today) return;
    await AsyncStorage.setItem(SHOWN_KEY, today).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
  } catch (e) {
    console.warn('[checkoutAlarm] schedule failed', e?.message);
  }
}
