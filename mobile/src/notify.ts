import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Two reasons to buzz a phone, and only two: a chest is ready, and today's
 * Clock-In is still open. Both are tagged so they can be withdrawn the moment
 * they stop being true.
 */
export const CHANNEL_ID = 'mempire-v1';

export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Mempire',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'mempire_chime.wav',
    vibrationPattern: [0, 120, 80, 120],
    lightColor: '#FFC422',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function askPermission(): Promise<boolean> {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  } catch {
    return false;
  }
}

async function schedule(id: string, title: string, body: string, at: Date): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
    const seconds = Math.max(5, Math.round((at.getTime() - Date.now()) / 1000));
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body, sound: 'mempire_chime.wav' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: CHANNEL_ID,
      },
    });
  } catch { /* notifications are a nicety, never a dependency */ }
}

export function cancel(id: string): void {
  void Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/** Chest timers: ring when it opens. */
export function chestReminder(chestId: string, name: string, at: number): Promise<void> {
  return schedule(`chest:${chestId}`, `${name} is ready`, 'Tap to open it — new fighters are waiting.', new Date(at));
}

/**
 * Tomorrow's Clock-In: an evening nudge on the next calendar day, so it lands
 * while the streak can still be saved, not after it is gone.
 */
export function streakReminder(streak: number): Promise<void> {
  const at = new Date();
  at.setDate(at.getDate() + 1);
  at.setHours(19, 0, 0, 0);
  return schedule(
    'streak',
    streak > 1 ? `Your ${streak}-day streak is on the line` : 'Clock in to Mempire',
    'One tap keeps it alive — and today\'s chest is waiting.',
    at,
  );
}

export const haptic = {
  tap: () => void Haptics.selectionAsync().catch(() => {}),
  light: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  heavy: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warn: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

/**
 * Streak-at-risk: if today's Clock-In has not happened, ring this evening
 * (19:00, or 21:30 if it is already past seven) while there is still time.
 * If it has, the next nudge is tomorrow evening. Called on launch, on
 * backgrounding, and after every Clock-In; the fixed id means it never stacks.
 */
export function ensureStreakReminder(clockedInToday: boolean, streak: number): void {
  if (clockedInToday) { void streakReminder(streak); return; }
  const now = new Date();
  const at = new Date();
  at.setHours(19, 0, 0, 0);
  if (at.getTime() <= now.getTime()) at.setHours(21, 30, 0, 0);
  if (at.getTime() <= now.getTime()) { void streakReminder(streak); return; }
  void schedule(
    'streak',
    streak > 0 ? `Your ${streak}-day streak ends at midnight` : 'Your daily chest is waiting',
    'One tap to clock in and keep it alive.',
    at,
  );
}
