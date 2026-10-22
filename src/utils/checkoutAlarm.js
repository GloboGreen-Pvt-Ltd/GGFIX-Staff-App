// Checkout SOS alarm. Once the technician has checked in, local notifications
// are scheduled from CHECKOUT_ALARM_TIME every REPEAT_MIN minutes until
// LAST_ALARM_TIME, each playing the SOS siren. They're OS-scheduled, so they
// fire even when the app is closed; a successful check-out cancels them.
//
// expo-notifications is loaded lazily and never inside Expo Go: since SDK 53
// Expo Go throws on import (push support removed), which crashed app start.
// In Expo Go / web every export here is a no-op; dev + release builds work.
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

let Notifications = null;
function load() {
  if (Notifications) return Notifications;
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
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
const LAST_ALARM_TIME = { hour: 22, minute: 30 };
const REPEAT_MIN = 10;
const CHANNEL_ID = 'checkout-sos-v1';
const SOUND = 'sos_alarm.wav';
const KIND = 'checkout-sos';

let channelReady = null;
function ensureChannel() {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelReady) {
    channelReady = Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Checkout SOS alarm',
      importance: Notifications.AndroidImportance.MAX,
      sound: SOUND,
      vibrationPattern: [0, 800, 400, 800, 400, 800],
      enableVibrate: true,
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    }).catch((e) => { channelReady = null; throw e; });
  }
  return channelReady;
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
      .filter((n) => n?.content?.data?.kind === KIND)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  } catch { /* nothing scheduled */ }
}

/**
 * Bring scheduled alarms in line with today's attendance row: checked in and
 * not checked out → (re)schedule the remaining alarms for today; otherwise
 * cancel them. Safe to call repeatedly.
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
    const end = new Date(now);
    end.setHours(LAST_ALARM_TIME.hour, LAST_ALARM_TIME.minute, 0, 0);
    for (; at <= end; at.setMinutes(at.getMinutes() + REPEAT_MIN)) {
      if (at <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 SOS: Check-out pending',
          body: 'It is past 6:30 PM and you have not checked out. Open Near G Fix and check out now.',
          sound: SOUND,
          priority: Notifications.AndroidNotificationPriority.MAX,
          interruptionLevel: 'timeSensitive',
          sticky: true,
          data: { kind: KIND },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(at),
          channelId: CHANNEL_ID,
        },
      });
    }
  } catch (e) {
    console.warn('[checkoutAlarm] schedule failed', e?.message);
  }
}
